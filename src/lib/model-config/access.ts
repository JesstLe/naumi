import "server-only";
import { z } from "zod";
import { biAuthorize, biJson, sameSiteBiMutation } from "../bi/access";
import { getModelAdministration } from "./server";
import { MODEL_BINDINGS } from "./bindings";
import { MODEL_PROTOCOLS, validateModelConfig } from "./schema";
import { compileRouterProjection } from "./projection";
import { ModelConfigError, type ModelConfig } from "./types";

type Administration = Awaited<ReturnType<typeof getModelAdministration>>;
export type ModelAdminAction = "read" | "draft" | "validate" | "simulate" | "publish" | "history" | "restore" | "credentials";
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
const draftInput = z.strictObject({ id: z.uuid(), expectedRevision: positive, config: z.unknown() });
const publishInput = z.strictObject({ id: z.uuid(), draftId: z.uuid(), expectedRevision: positive, expectedVersion: positive, reason: z.string().trim().min(1).max(500) });
const restoreInput = z.strictObject({ id: z.uuid(), targetVersion: positive, expectedVersion: positive, reason: z.string().trim().min(1).max(500) });
const validationInput = z.strictObject({ draftId: z.uuid(), expectedRevision: positive });
const simulationInput = z.strictObject({ draftId: z.uuid(), publicModelId: identifier, facts: z.strictObject({ task: z.enum(["draft", "product", "detail", "layout"]), quality: z.enum(["low", "medium", "high", "xhigh", "max", "auto"]), resolution: z.enum(["1K", "2K", "4K"]), needsEdit: z.boolean(), needsMask: z.boolean().optional(), preserveIdentity: z.boolean(), needsText: z.boolean(), nativeResolution: z.boolean(), references: z.number().int().min(0).max(32), quantity: z.number().int().min(1).max(4).default(1) }).refine(f => f.needsEdit === (f.references > 0), "编辑操作必须与参考图数量一致") });
const credentialsInput = z.strictObject({ providerId: identifier, ciphertext: z.string().min(1).max(32768) });

async function readBody(request: Request) {
  const size = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(size) || size < 0 || size > 512 * 1024) throw new ModelConfigError("INVALID_REQUEST", "请求超过大小限制", 413);
  const reader = request.body?.getReader(); if (!reader) throw new ModelConfigError("INVALID_REQUEST", "请求正文无效");
  let bytes = 0; const parts: Uint8Array[] = [];
  while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 512 * 1024) { await reader.cancel(); throw new ModelConfigError("INVALID_REQUEST", "请求超过大小限制", 413); } parts.push(chunk.value); }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
function configurationDiff(before: ModelConfig, after: ModelConfig) {
  const changes: { entity: string; id: string; change: "added" | "removed" | "changed" }[] = [];
  for (const entity of ["providers", "upstreamModels", "publicModels", "pools"] as const) {
    const old = new Map(before[entity].map(x => [x.id, x])), next = new Map(after[entity].map(x => [x.id, x]));
    for (const [id, value] of Array.from(old)) { if (!next.has(id)) changes.push({ entity, id, change: "removed" }); else if (JSON.stringify(value) !== JSON.stringify(next.get(id))) changes.push({ entity, id, change: "changed" }); }
    for (const id of Array.from(next.keys())) if (!old.has(id)) changes.push({ entity, id, change: "added" });
  }
  for (const id of Array.from(new Set([...Object.keys(before.bindings), ...Object.keys(after.bindings)]))) if (before.bindings[id] !== after.bindings[id]) changes.push({ entity: "bindings", id, change: before.bindings[id] ? after.bindings[id] ? "changed" : "removed" : "added" });
  return changes;
}
export function createModelAdminHandler(deps: { authorize: typeof biAuthorize; administration: () => Promise<Administration> }) {
  return async (request: Request, action: ModelAdminAction) => {
    const auth = await deps.authorize(request); if (auth instanceof Response) return auth;
    if (!["read", "history"].includes(action) && !sameSiteBiMutation(request)) return biJson({ error: "不允许跨站修改" }, 403);
    try {
      const admin = await deps.administration();
      switch (action) {
        case "read": {
          const [snapshot, draft, billing] = await Promise.all([admin.repo.current(), admin.repo.draft(auth.actor), admin.billing.current()]);
          return biJson({ snapshot, draft, protocols: MODEL_PROTOCOLS, bindings: MODEL_BINDINGS, billingVersion: billing.version, costKeys: Object.keys(billing.config.costs).sort(), costReferences: Object.entries(billing.config.costs).map(([key, rate]) => ({ key, currency: rate.currency, unit: rate.unit, source: rate.source })), concurrencyPolicy: "historical-minimum", billingManagementPath: "/admin/bi" });
        }
        case "draft": { const body = draftInput.parse(await readBody(request)); return biJson(await admin.repo.saveDraft({ ...body, config: body.config as ModelConfig, actor: auth.actor })); }
        case "publish": { const body = publishInput.parse(await readBody(request)); const publication = await admin.runtime.publish({ ...body, actor: auth.actor }); return biJson(publication, publication.phase === "applied" ? 200 : publication.phase === "failed" ? 422 : 202); }
        case "restore": { const body = restoreInput.parse(await readBody(request)); const publication = await admin.runtime.restore({ ...body, actor: auth.actor }); return biJson(publication, publication.phase === "applied" ? 200 : publication.phase === "failed" ? 422 : 202); }
        case "validate": {
          const body = validationInput.parse(await readBody(request)); const draft = await admin.repo.draft(auth.actor);
          if (draft.id !== body.draftId) throw new ModelConfigError("DRAFT_UNAVAILABLE", "草稿不可用", 404);
          if (draft.revision !== body.expectedRevision) throw new ModelConfigError("DRAFT_CONFLICT", "草稿已更新，请刷新后重试", 409);
          const config = validateModelConfig(draft.config, { trustedOrigins: admin.trustedOrigins });
          const [current, billing] = await Promise.all([admin.repo.current(), admin.billing.current()]);
          compileRouterProjection({ version: current.version + 1, digest: "", config }, billing, { trustedOrigins: admin.trustedOrigins });
          return biJson({ valid: true, expectedVersion: current.version, billingVersion: billing.version, changes: configurationDiff(current.config, config) });
        }
        case "simulate": return biJson(await admin.runtime.simulate({ ...simulationInput.parse(await readBody(request)), actor: auth.actor }));
        case "credentials": return biJson(await admin.credentials.saveEncrypted({ ...credentialsInput.parse(await readBody(request)), actor: auth.actor }));
        case "history": {
          const url = new URL(request.url), version = url.searchParams.get("version");
          if (version !== null) { if (!/^[1-9][0-9]{0,15}$/.test(version)) throw new ModelConfigError("INVALID_REQUEST", "版本参数无效"); return biJson(await admin.repo.byVersion(positive.parse(Number(version)))); }
          const limit = url.searchParams.get("limit") || "50";
          if (!/^[1-9][0-9]{0,2}$/.test(limit) || Number(limit) > 100) throw new ModelConfigError("INVALID_REQUEST", "记录数量无效");
          return biJson({ versions: await admin.repo.history(Number(limit)) });
        }
      }
    } catch (error) {
      if (error instanceof ModelConfigError) return biJson({ error: error.message, code: error.code, ...(error.fields.length ? { fields: error.fields } : {}) }, error.status);
      if (error instanceof z.ZodError || error instanceof SyntaxError) return biJson({ error: "管理参数无效", code: "INVALID_REQUEST" }, 400);
      return biJson({ error: "模型管理暂时不可用，请稍后重试", code: "CONFIG_UNAVAILABLE" }, 503);
    }
  };
}
export const modelAdminHandler = createModelAdminHandler({ authorize: biAuthorize, administration: getModelAdministration });
