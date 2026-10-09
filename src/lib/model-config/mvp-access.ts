import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { biAuthorize, biJson, sameSiteBiMutation } from "../bi/access";
import { readBounded } from "../supplier-cost/io";
import { getModelAdministration } from "./server";
import { readProviderCatalog, refreshProviderCatalog } from "./catalog-store";
import { publicModelCatalog } from "./runtime";
import { FEATURE_BINDINGS } from "./business";
import { MODEL_BINDINGS } from "./bindings";
import { mvpRows, mvpCandidates, MVP_PROTOCOLS, switchMvpModel, renameMvpModel } from "./mvp";
import { canonicalConfig } from "./repository";
import { validateModelConfig, validateModelEndpoint } from "./schema";
import { compileRouterProjection } from "./projection";
import { ModelConfigError, type ModelSnapshot } from "./types";
import { modelConfigurationEnabled } from "./requests";
import { isNewApiFlowImageModel } from "../image-model-catalog";

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
const common = { id: z.uuid(), expectedVersion: z.number().int().positive() };
const input = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("discover"), providerId: identifier, force: z.boolean().optional() }),
  z.strictObject({ action: z.literal("credential"), providerId: identifier, ciphertext: z.string().min(1).max(32768).optional(), keyPlain: z.string().min(1).max(16384).optional() }),
  z.strictObject({ action: z.literal("switch"), ...common, rowId: identifier, upstreamId: identifier }),
  z.strictObject({ action: z.literal("rename"), ...common, rowId: identifier, label: z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/) }),
  z.strictObject({ action: z.literal("connect"), ...common, name: z.string().trim().min(1).max(100), baseUrl: z.string().max(1024), protocol: z.enum(MVP_PROTOCOLS), credentialRef: z.uuid() }),
  z.strictObject({ action: z.literal("register"), ...common, providerId: identifier, model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/), confirmed: z.literal(true), edit: z.boolean(), vision: z.boolean(), qualityRank: z.number().int().min(1).max(5).default(2), qualities: z.array(z.enum(["low", "medium", "high", "xhigh", "max", "auto"])).max(6), resolutions: z.array(z.enum(["1K", "2K", "4K"])).max(3), maxReferenceImages: z.number().int().min(0).max(32) }),
]);
type Administration = Awaited<ReturnType<typeof getModelAdministration>>;
function rows(snapshot: ModelSnapshot) {
  return mvpRows(snapshot, Object.entries(FEATURE_BINDINGS).map(([feature, binding]) => ({ ...publicModelCatalog(snapshot, MODEL_BINDINGS[binding!].modality, feature as keyof typeof FEATURE_BINDINGS), feature })));
}
export function createMvpHandler(deps: { authorize: typeof biAuthorize; administration: () => Promise<Administration>; managed: () => Promise<boolean>; fetcher?: typeof fetch }) {
  return async (request: Request) => {
    const auth = await deps.authorize(request); if (auth instanceof Response) return auth;
    if (request.method !== "GET" && !sameSiteBiMutation(request)) return biJson({ error: "不允许跨站修改" }, 403);
    let staged = false;
    let lock: PoolClient | undefined, lockKey: string | undefined;
    try {
      const admin = await deps.administration();
      const snapshot = await admin.repo.current();
      if (request.method === "GET") return biJson({ version: snapshot.version, managed: await deps.managed(), rows: rows(snapshot), candidates: mvpCandidates(snapshot.config), providers: snapshot.config.providers.map(p => ({ id: p.id, name: p.name, protocol: p.protocol, baseUrl: p.baseUrl, enabled: p.enabled, configured: !!p.credentialRef })), catalogs: await readProviderCatalog(admin.pool, snapshot.config.providers) });
      const body = input.parse(JSON.parse(await readBounded(new Response(request.body), 48000)));
      if (body.action === "credential") {
        if (!!body.ciphertext === !!body.keyPlain || !/^mvp-[0-9a-f-]{36}$/i.test(body.providerId)) throw new ModelConfigError("INVALID_CREDENTIAL", "凭据参数无效");
        // Match the existing system settings' HTTP fallback, without retaining plaintext in operation drafts or browser storage.
        return biJson(body.ciphertext ? await admin.credentials.saveEncrypted({ providerId: body.providerId, ciphertext: body.ciphertext, actor: auth.actor }) : await admin.credentials.importPlain({ providerId: body.providerId, plain: body.keyPlain!, actor: auth.actor }));
      }
      if (body.action === "discover") {
        const p = snapshot.config.providers.find(p => p.id === body.providerId);
        if (!p) throw new ModelConfigError("PROVIDER_UNAVAILABLE", "上游来源不存在", 404);
        return biJson(await refreshProviderCatalog(admin.pool, p, admin.credentials, admin.trustedOrigins, deps.fetcher, body.force));
      }
      lock = await admin.pool.connect(); lockKey = `admin-mvp:${body.id}`;
      await lock.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [lockKey]);
      // Dedicated operation drafts preserve unfinished work in the full administration UI.
      const fingerprint = createHash("sha256").update(canonicalConfig(body)).digest("hex").slice(0, 20);
      const actor = `${auth.actor.slice(0, 150)}#mvp:${body.id}:${fingerprint}`;
      let previous;
      try { previous = await admin.repo.publication(body.id); } catch (e) { if (!(e instanceof ModelConfigError) || e.code !== "PUBLICATION_UNAVAILABLE") throw e; }
      staged = !!previous;
      if (!previous && snapshot.version !== body.expectedVersion) throw new ModelConfigError("CONFIG_CONFLICT", "配置已被其他管理员更新，请刷新后重试", 409);
      let draft = await admin.repo.draft(actor);
      if (!previous && draft.revision === 1) {
        let config = structuredClone(snapshot.config);
        if (body.action === "switch" || body.action === "rename") {
          const row = rows(snapshot).find(r => r.id === body.rowId);
          if (!row) throw new ModelConfigError("MODEL_UNAVAILABLE", "前端当前没有展示该模型，请刷新", 409);
          config = body.action === "rename" ? renameMvpModel(config, row, body.label) : switchMvpModel(config, row, body.upstreamId);
        } else if (body.action === "connect") {
          const endpoint = validateModelEndpoint(body.protocol === "apimart-images" ? body.baseUrl.replace(/\/v1\/?$/, "") : body.baseUrl, { trustedOrigins: admin.trustedOrigins });
          const providerId = `mvp-${body.id}`;
          await admin.credentials.read(body.credentialRef, providerId);
          config.providers.push({ id: providerId, name: body.name, baseUrl: endpoint, protocol: body.protocol, credentialRef: body.credentialRef, enabled: true, timeoutMs: 120000, maxConcurrent: 4 });
        } else {
          const p = config.providers.find(p => p.id === body.providerId);
          if (!p?.enabled || !p.credentialRef || !MVP_PROTOCOLS.includes(p.protocol as typeof MVP_PROTOCOLS[number])) throw new ModelConfigError("MODEL_INCOMPATIBLE", "该来源尚未启用或协议未支持快捷接入");
          const catalog = await refreshProviderCatalog(admin.pool, p, admin.credentials, admin.trustedOrigins, deps.fetcher);
          if (catalog.status !== "ok" || catalog.stale || !catalog.models.some(m => m.id === body.model)) throw new ModelConfigError("CATALOG_UNAVAILABLE", "请先成功刷新该来源的模型目录，再添加目录中的模型");
          if (config.upstreamModels.some(m => m.providerId === p.id && m.model === body.model)) throw new ModelConfigError("MODEL_EXISTS", "该模型已接入，可直接在切换列表中选择");
          if (p.protocol === "new-api-flow" && !isNewApiFlowImageModel(body.model)) throw new ModelConfigError("MODEL_INCOMPATIBLE", "该模型 ID 尚未由当前图片适配器支持，请在完整配置中心核验协议");
          if (body.resolutions.some(r => r !== "1K") && p.protocol === "openai-images") throw new ModelConfigError("MODEL_INCOMPATIBLE", "OpenAI 图片 2K/4K 需要专用尺寸参数映射，请在完整配置中心配置");
          const modality = p.protocol === "openai-chat" ? "text" : p.protocol === "openai-videos" ? "video" : "image";
          config.upstreamModels.push({ id: `mvp-${body.id}`, providerId: p.id, model: body.model, label: body.model.slice(0, 100), modality, enabled: true, parameterMap: {}, capabilities: { verified: true, generate: true, edit: modality === "image" && body.edit, vision: modality === "text" && body.vision, transparent: false, preserveIdentity: false, textAccuracy: false, qualityRank: body.qualityRank, qualities: modality === "image" ? body.qualities : [], nativeResolutions: modality === "image" ? body.resolutions : [], maxReferenceImages: body.maxReferenceImages, expectedLatencyMs: 30000 } });
        }
        config = validateModelConfig(config, { trustedOrigins: admin.trustedOrigins });
        compileRouterProjection({ version: snapshot.version + 1, digest: "", config }, await admin.billing.current(), { trustedOrigins: admin.trustedOrigins });
        draft = await admin.repo.saveDraft({ id: draft.id, expectedRevision: draft.revision, config, actor });
      }
      staged = true;
      const publication = await admin.runtime.publish({ id: body.id, draftId: draft.id, expectedRevision: draft.revision, expectedVersion: body.expectedVersion, actor, reason: `MVP ${body.action === "switch" ? `切换 ${body.rowId} → ${body.upstreamId}` : body.action === "rename" ? `改名 ${body.rowId} → ${body.label}` : body.action === "connect" ? `接入来源 ${body.name}` : `添加模型 ${body.model}`}` });
      return biJson({ publication }, publication.phase === "applied" ? 200 : publication.phase === "failed" ? 422 : 202);
    } catch (e) {
      if (e instanceof ModelConfigError) return biJson({ error: e.message, code: e.code, operationNotStaged: !staged || ["CONFIG_CONFLICT", "DRAFT_CONFLICT", "PUBLICATION_PENDING"].includes(e.code) }, e.status);
      if (e instanceof z.ZodError || e instanceof SyntaxError) return biJson({ error: "参数无效，请检查填写内容", operationNotStaged: true }, 400);
      // An ambiguous transport failure must keep the operation ID for reconciliation.
      return biJson({ error: "操作结果待核对，请使用同一操作重试", operationNotStaged: false }, 503);
    } finally {
      if (lock) { try { await lock.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [lockKey]); lock.release(); } catch { lock.release(true); } }
    }
  };
}
export const mvpHandler = createMvpHandler({ authorize: biAuthorize, administration: getModelAdministration, managed: modelConfigurationEnabled });
