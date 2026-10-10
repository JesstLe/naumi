import "server-only";
import {readQualityDefaults} from "../supplier-models/quality-access";
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
import { mvpRows, mvpCandidates, MVP_PROTOCOLS, switchMvpModel, renameMvpModel, applyMvpToolScope, applyMvpQualityParameters, orderMvpModels } from "./mvp";
import { DISPLAY_QUALITY_IDS } from "./quality-policy";
import { FEATURE_IDS } from "../billing/rules/registry";
import {QUALITY_IDS,RESOLUTION_IDS} from "../billing/rules/registry";
import {BillingError} from "../billing/types";
import {editMvpCredits,mvpPriceViews,modelCreditGrid} from "./mvp-pricing";
import { canonicalConfig } from "./repository";
import { validateModelConfig, validateModelEndpoint } from "./schema";
import { compileRouterProjection } from "./projection";
import { ModelConfigError, type ModelSnapshot } from "./types";
import { modelConfigurationEnabled } from "./requests";
import { isNewApiFlowImageModel } from "../image-model-catalog";

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
const common = { id: z.uuid(), expectedVersion: z.number().int().positive() };
const credits=z.number().int().min(0).max(2147483647);
const creditPricing=z.discriminatedUnion("mode",[z.strictObject({mode:z.literal("matrix"),prices:z.record(z.enum(QUALITY_IDS),z.record(z.enum(RESOLUTION_IDS),credits.nullable()))}),z.strictObject({mode:z.literal("fixed"),credits}),z.strictObject({mode:z.literal("quality-resolution"),quality:z.record(z.enum(QUALITY_IDS),credits),resolutionExtra:z.record(z.enum(RESOLUTION_IDS),credits)})]);
const input = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("discover"), providerId: identifier, force: z.boolean().optional() }),
  z.strictObject({ action: z.literal("credential"), providerId: identifier, ciphertext: z.string().min(1).max(32768).optional(), keyPlain: z.string().min(1).max(16384).optional() }),
  z.strictObject({ action: z.literal("switch"), ...common, rowId: identifier, upstreamId: identifier }),
  z.strictObject({ action: z.literal("rename"), ...common, rowId: identifier, label: z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/) }),
  z.strictObject({action:z.literal("scope-compat"),...common}),
  z.strictObject({action:z.literal("order"),...common,rowIds:z.array(identifier).min(1).max(500)}),
  z.strictObject({action:z.literal("scope"),...common,rowId:identifier,features:z.array(z.enum(FEATURE_IDS)).max(FEATURE_IDS.length),canvas:z.boolean().optional()}),
  z.strictObject({action:z.literal("parameters"),...common,rowId:identifier,parameters:z.strictObject({choices:z.array(z.strictObject({id:z.enum(DISPLAY_QUALITY_IDS),label:z.string().trim().min(1).max(30)})).min(1).max(5),routes:z.array(z.strictObject({upstreamId:identifier,mode:z.enum(["map","passthrough","omit"]),values:z.record(z.string(),z.string().max(100)),metadataRef:z.strictObject({id:z.uuid(),revision:z.number().int().positive()}).nullable().optional(),evidence:z.strictObject({status:z.enum(["unverified","documented","accepted","rejected"]),source:z.string().max(1000),checkedAt:z.string().max(30)}).optional()})).min(1).max(100)}).nullable()}),
  z.strictObject({action:z.literal("pricing"),...common,expectedBillingVersion:z.number().int().positive(),rowId:identifier,features:z.array(z.enum(FEATURE_IDS)).min(1).max(FEATURE_IDS.length),pricing:creditPricing.nullable()}),
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
      if(request.method==="GET" && new URL(request.url).searchParams.has("rowId")){
        const params=new URL(request.url).searchParams,rowId=identifier.parse(params.get("rowId")),feature=z.enum(FEATURE_IDS).parse(params.get("feature"));
        const row=rows(snapshot).find(r=>r.id===rowId);if(!row || !row.features.some(f=>f.id===feature))throw new ModelConfigError("MODEL_UNAVAILABLE","该模型未应用到此工具",400);
        const billing=await admin.billing.current();return biJson({version:snapshot.version,billingVersion:billing.version,grid:modelCreditGrid(billing,snapshot,row,feature)});
      }
      if (request.method === "GET") {const billing=await admin.billing.current(),defaults=await readQualityDefaults(admin.pool,snapshot.config),modelRows=rows(snapshot);
        for(const row of modelRows)for(const route of row.qualityConfig?.routes || []){const d=defaults.get(route.upstreamId);route.metadataDefaults=d || null;if(!route.configured&&d?.available){route.mode=d.mode;route.values={...d.values};route.metadataRef={id:d.id,revision:d.revision};}else if(!route.configured){route.mode="omit";route.values={};}}
        return biJson({ version: snapshot.version,billingVersion:billing.version, managed: await deps.managed(), rows: modelRows.map(row=>({...row,pricing:mvpPriceViews(billing,snapshot,row)})), candidates: mvpCandidates(snapshot.config), providers: snapshot.config.providers.map(p => ({ id: p.id, name: p.name, protocol: p.protocol, baseUrl: p.baseUrl, enabled: p.enabled, configured: !!p.credentialRef })), catalogs: await readProviderCatalog(admin.pool, snapshot.config.providers) });}
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
      if(body.action==="pricing"){
        const billing=await admin.billing.current();
        const actor=`${auth.actor.slice(0,180)}#mvp-price:${createHash("sha256").update(canonicalConfig(body)).digest("hex").slice(0,32)}`,reason=`MVP 积分售价 ${body.rowId}`;
        const previous=(await admin.pool.query("SELECT config,actor FROM app_billing_config_versions WHERE operation_id=$1",[body.id])).rows[0];staged=!!previous;
        if(previous && previous.actor!==actor)throw new BillingError("OPERATION_CONFLICT","该操作编号已用于不同积分设置",409);
        if(!previous && snapshot.version!==body.expectedVersion)throw new ModelConfigError("CONFIG_CONFLICT","模型配置已更新，请刷新后重新设置积分",409);
        const row=rows(snapshot).find(r=>r.id===body.rowId);if(!previous && !row)throw new ModelConfigError("MODEL_UNAVAILABLE","模型不存在，请刷新",409);
        if(!previous && !await deps.managed())throw new ModelConfigError("CONFIG_UNAVAILABLE","请先启用统一模型配置后设置模型积分",409);
        const config=previous?.config || editMvpCredits(billing,snapshot,row!,body.features,body.pricing);
        const published=await admin.billing.publish({id:body.id,expectedVersion:body.expectedBillingVersion,expectedModelVersion:body.expectedVersion,config,actor,reason});
        return biJson({publication:{id:body.id,version:published.version,phase:"applied"},billingVersion:published.version});
      }
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
        if(body.action === "scope-compat") {
          // Deployment rollback expands the system grant before an older image
          // reads this config. Preserve ordinary tool scope and every price.
          for(const model of config.publicModels)if(model.toolScope?.systems?.includes("canvas")){
            const available=Object.entries(FEATURE_BINDINGS).filter(([feature,binding])=>feature.startsWith("canvas.")&&MODEL_BINDINGS[binding!].modality===model.modality&&publicModelCatalog(snapshot,model.modality,feature as never,true).models.some(m=>m.id===model.id)).map(([feature])=>feature);
            model.toolScope.features=[...new Set([...model.toolScope.features,...available])] as typeof model.toolScope.features;
            delete model.toolScope.systems;
          }
        } else if(body.action === "order") {
          config=orderMvpModels(config,rows(snapshot),body.rowIds);
        } else if (body.action === "switch" || body.action === "rename" || body.action === "scope" || body.action === "parameters") {
          const row = rows(snapshot).find(r => r.id === body.rowId);
          if (!row) throw new ModelConfigError("MODEL_UNAVAILABLE", "前端当前没有展示该模型，请刷新", 409);
          if(body.action === "parameters" && body.parameters){
            const defaults=await readQualityDefaults(admin.pool,config);
            for(const route of body.parameters.routes){const d=defaults.get(route.upstreamId);
              if(route.metadataRef && (!d || route.metadataRef.id!==d.id || route.metadataRef.revision!==d.revision))throw new ModelConfigError("METADATA_CHANGED","元数据默认值已更新，请重新打开参数设置后核对",409);
              if(route.mode==="map")for(const choice of body.parameters.choices)if(!route.values[choice.id]?.trim() && route.metadataRef && d?.mode==="map")route.values[choice.id]=d.values[choice.id] || "";
            }
          }
          config = body.action === "parameters" ? applyMvpQualityParameters(config,row,body.parameters) : body.action === "scope" ? applyMvpToolScope(config,row,body.features,body.canvas) : body.action === "rename" ? renameMvpModel(config, row, body.label) : switchMvpModel(config, row, body.upstreamId);
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
      const publication = await admin.runtime.publish({ id: body.id, draftId: draft.id, expectedRevision: draft.revision, expectedVersion: body.expectedVersion, actor, reason: `MVP ${body.action === "scope-compat" ? "回滚兼容：展开画布系统范围" : body.action === "order" ? "模型展示排序" : body.action === "parameters" ? `参数映射 ${body.rowId}` : body.action === "scope" ? `工具范围 ${body.rowId}` : body.action === "switch" ? `切换 ${body.rowId} → ${body.upstreamId}` : body.action === "rename" ? `改名 ${body.rowId} → ${body.label}` : body.action === "connect" ? `接入来源 ${body.name}` : `添加模型 ${body.model}`}` });
      return biJson({ publication }, publication.phase === "applied" ? 200 : publication.phase === "failed" ? 422 : 202);
    } catch (e) {
      if(e instanceof BillingError)return biJson({error:e.message,code:e.code,operationNotStaged:["CONFIG_CONFLICT","INVALID_CONFIG","OPERATION_CONFLICT"].includes(e.code)},e.status);
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
