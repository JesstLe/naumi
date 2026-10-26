import { readImageModelMetadata } from "../supplier-models/image-model-metadata";
import {applyResolutionParameters,resolutionParametersSchema} from "./resolution-policy";
import {imagegenRoutePolicySchema,applyImagegenModelParameters} from "./imagegen-policy";
import {readImagegenDefaults} from "../supplier-models/imagegen-access";
import {readResolutionDefaults} from "../supplier-models/resolution-access";
import {applyDisplayResolutions} from "./resolution-options";
import {videoDefinitionSchema,videoWireProfileSchema} from "../video/capability-schema";
import {applyVideoParameters,videoParametersSchema} from "./video-policy";
import {freezeManagedVideoCapability} from "../video/frozen-capability";
import "server-only";
import {channelHealthSummary} from "./channel-scheduler";
import {providerCapacitySummary} from "./capacity";
import {channelPolicySchema,applyChannelPolicy} from "./channel-policy";
import {readQualityDefaults} from "../supplier-models/quality-access";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { biAuthorize, biJson, sameSiteBiMutation } from "../bi/access";
import { readBounded } from "../supplier-cost/io";
import { getModelAdministration } from "./server";
import { readProviderCatalog, refreshProviderCatalog } from "./catalog-store";
import {publicModelCatalog} from "@/lib/model-config/public-catalog";
import { FEATURE_BINDINGS } from "./feature-model-policy";
import { MODEL_BINDINGS } from "./bindings";
import { managedModelRows, managedModelCandidates, MODEL_MANAGEMENT_PROTOCOLS, switchManagedModel, renameManagedModel, applyModelToolScope, applyModelQualityParameters, orderManagedModels } from "./management";
import { DISPLAY_QUALITY_IDS,qualityPolicySchema } from "./quality-policy";
import { FEATURE_IDS } from "../billing/rules/registry";
import {QUALITY_IDS,RESOLUTION_IDS} from "../billing/rules/registry";
import {BillingError} from "../billing/types";
import {editManagedModelCredits,managedModelPriceViews,modelCreditGrid} from "./management-pricing";
import {canonicalConfig} from "@/lib/model-config/snapshot-value";
import { validateModelConfig, validateModelEndpoint } from "./schema";
import { compileRouterProjection } from "./projection";
import { ModelConfigError, type ModelSnapshot } from "./types";
import { modelConfigurationEnabled } from "./availability";
import {isNewApiFlowImageModel} from "@/lib/image-model-legacy-catalog";

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
const common = { id: z.uuid(), expectedVersion: z.number().int().positive() };
const credits=z.number().int().min(0).max(2147483647);
const creditPricing=z.discriminatedUnion("mode",[z.strictObject({mode:z.literal("matrix"),prices:z.record(z.enum(QUALITY_IDS),z.record(z.enum(RESOLUTION_IDS),credits.nullable()))}),z.strictObject({mode:z.literal("fixed"),credits}),z.strictObject({mode:z.literal("quality-resolution"),quality:z.record(z.enum(QUALITY_IDS),credits),resolutionExtra:z.record(z.enum(RESOLUTION_IDS),credits)})]);
const input = z.discriminatedUnion("action", [
  z.strictObject({action:z.literal("video-parameters"),...common,rowId:identifier,routes:videoParametersSchema}),
  z.strictObject({action:z.literal("imagegen-parameters"),...common,rowId:identifier,routes:z.array(imagegenRoutePolicySchema).max(100).nullable()}),
  z.strictObject({action:z.literal("channels"),...common,rowId:identifier,policy:channelPolicySchema.nullable()}),
  z.strictObject({action:z.literal("resolutions"),...common,rowId:identifier,resolutions:z.array(z.enum(["1K","2K","4K"])).min(1).max(3).nullable(),parameters:resolutionParametersSchema.nullable().optional()}),
  z.strictObject({ action: z.literal("discover"), providerId: identifier, force: z.boolean().optional() }),
  z.strictObject({ action: z.literal("credential"), providerId: identifier, ciphertext: z.string().min(1).max(32768).optional(), keyPlain: z.string().min(1).max(16384).optional() }),
  z.strictObject({ action: z.literal("switch"), ...common, rowId: identifier, upstreamId: identifier }),
  z.strictObject({ action: z.literal("rename"), ...common, rowId: identifier, label: z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/) }),
  z.strictObject({action:z.literal("scope-compat"),...common}),
  z.strictObject({action:z.literal("order"),...common,rowIds:z.array(identifier).min(1).max(500)}),
  z.strictObject({action:z.literal("scope"),...common,rowId:identifier,features:z.array(z.enum(FEATURE_IDS)).max(FEATURE_IDS.length),canvas:z.boolean().optional()}),
  z.strictObject({action:z.literal("parameters"),...common,rowId:identifier,parameters:z.strictObject({choices:z.array(z.strictObject({id:z.enum(DISPLAY_QUALITY_IDS),label:z.string().trim().min(1).max(30)})).min(1).max(5),routes:z.array(z.strictObject({upstreamId:identifier,mode:z.enum(["map","passthrough","omit"]),values:z.record(z.string(),z.string().max(100)),metadataRef:z.strictObject({id:z.uuid(),revision:z.number().int().positive()}).nullable().optional(),evidence:z.strictObject({status:z.enum(["unverified","documented","accepted","rejected"]),source:z.string().max(1000),checkedAt:z.string().max(30)}).optional()})).min(1).max(100)}).nullable()}),
  z.strictObject({action:z.literal("pricing"),...common,expectedBillingVersion:z.number().int().positive(),rowId:identifier,features:z.array(z.enum(FEATURE_IDS)).min(1).max(FEATURE_IDS.length),pricing:creditPricing.nullable()}),
  z.strictObject({ action: z.literal("connect"), ...common, name: z.string().trim().min(1).max(100), baseUrl: z.string().max(1024), protocol: z.enum(MODEL_MANAGEMENT_PROTOCOLS), credentialRef: z.uuid() }),
  z.strictObject({ action: z.literal("register"), ...common, providerId: identifier, model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/), confirmed: z.literal(true), capabilityVerified:z.boolean().optional(), qualityPolicy:qualityPolicySchema.optional(), edit: z.boolean(), vision: z.boolean(), qualityRank: z.number().int().min(1).max(5).default(2), qualities: z.array(z.enum(["low", "medium", "high", "xhigh", "max", "auto"])).max(6), resolutions: z.array(z.enum(["1K", "2K", "4K"])).max(3), maxReferenceImages: z.number().int().min(0).max(128),videoDefinition:videoDefinitionSchema.optional(),videoProfile:videoWireProfileSchema.optional() }),
]);
type Administration = Awaited<ReturnType<typeof getModelAdministration>>;
function rows(snapshot: ModelSnapshot) {
  return managedModelRows(snapshot, Object.entries(FEATURE_BINDINGS).map(([feature, binding]) => ({ ...publicModelCatalog(snapshot, MODEL_BINDINGS[binding!].modality, feature as keyof typeof FEATURE_BINDINGS), feature })));
}
// Persisted provider IDs, actor markers and locks retain their original namespace.
// Reasons also participate in historical publication fingerprints; keep their wire format.
export function createModelManagementHandler(deps: { authorize: typeof biAuthorize; administration: () => Promise<Administration>; managed: () => Promise<boolean>; fetcher?: typeof fetch }) {
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
      if (request.method === "GET") {
        const [billing, metadataRows, managed, channelHealth, providerCapacity, catalogs] = await Promise.all([
          admin.billing.current(), readImageModelMetadata(admin.pool,snapshot.config), deps.managed(),
          channelHealthSummary(admin.pool,snapshot.config), providerCapacitySummary(admin.pool,snapshot.config),
          readProviderCatalog(admin.pool,snapshot.config.providers),
        ]);
        const [defaults,resolutionDefaults,imagegenDefaults] = await Promise.all([
          readQualityDefaults(admin.pool,snapshot.config,metadataRows),readResolutionDefaults(admin.pool,snapshot.config,metadataRows),
          readImagegenDefaults(admin.pool,snapshot.config,metadataRows),
        ]);
        const modelRows=rows(snapshot);
        // A route may occur in several public rows; freeze it once per request.
        const videoDefaults=new Map<string,ReturnType<typeof freezeManagedVideoCapability>>();
        for(const row of modelRows)if(row.modality==="image")row.imagegenConfig={routes:[...new Set(row.routes.map(r=>r.upstreamId))].map(upstreamId=>{const u=snapshot.config.upstreamModels.find(u=>u.id===upstreamId)!,d=imagegenDefaults.get(upstreamId);return {upstreamId,capabilities:u.capabilities.imagegen??d?.capabilities??{},wireMap:u.parameterMap.imagegen??d?.wireMap??{},...(d?{metadataRef:d.metadataRef}:{})};})};
        for(const row of modelRows)if(row.modality==="video")row.videoConfig={routes:await Promise.all([...new Set(row.routes.map(route=>route.upstreamId))].map(async id=>{
          const upstream=snapshot.config.upstreamModels.find(model=>model.id===id)!,provider=snapshot.config.providers.find(item=>item.id===upstream.providerId)!;
          let pending=videoDefaults.get(id);
          if(!pending){pending=freezeManagedVideoCapability(snapshot,upstream,provider);videoDefaults.set(id,pending);}
          const frozen=await pending;
          return {upstreamId:id,model:upstream.model,provider:provider.name,definition:upstream.capabilities.video,profile:upstream.parameterMap.videoProfile,
            effective:frozen.definition,sources:frozen.sources,sourceRevision:frozen.sourceRevision};
        }))};
        for(const row of modelRows)for(const route of row.resolutionConfig?.routes||[]){const d=resolutionDefaults.get(route.upstreamId);route.metadataDefaults=d||null;if(d)route.nativeValues=d.nativeValues;if(route.editable&&!route.configured&&d?.available){route.mode=d.mode;route.field=d.field;route.ratioField=d.ratioField;route.fieldKnown=true;route.values={...d.values};route.metadataRef={id:d.id,revision:d.revision};}}
        for(const row of modelRows)for(const route of row.qualityConfig?.routes || []){const d=defaults.get(route.upstreamId);route.metadataDefaults=d || null;if(!route.configured&&d?.available){route.mode=d.mode;route.values={...d.values};route.metadataRef={id:d.id,revision:d.revision};}else if(!route.configured){route.mode="omit";route.values={};}}
        return biJson({ version: snapshot.version,billingVersion:billing.version, managed, rows: modelRows.map(row=>({...row,pricing:managedModelPriceViews(billing,snapshot,row)})), candidates: managedModelCandidates(snapshot.config), channelHealth,providerCapacity,providers: snapshot.config.providers.map(p => ({ id: p.id, name: p.name, protocol: p.protocol, maxConcurrent:p.maxConcurrent, baseUrl: p.baseUrl, enabled: p.enabled, configured: !!p.credentialRef })), catalogs });}
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
        const config=previous?.config || editManagedModelCredits(billing,snapshot,row!,body.features,body.pricing);
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
          config=orderManagedModels(config,rows(snapshot),body.rowIds);
        } else if (body.action === "switch" || body.action === "rename" || body.action === "scope" || body.action === "parameters" || body.action === "resolutions" || body.action === "channels" || body.action === "imagegen-parameters" || body.action === "video-parameters") {
          const row = rows(snapshot).find(r => r.id === body.rowId);
          if (!row) throw new ModelConfigError("MODEL_UNAVAILABLE", "前端当前没有展示该模型，请刷新", 409);
          if(body.action==="channels"&&body.policy&&row.modality==="text"&&body.policy.channels.some(c=>c.enabled&&!row.candidateIds.includes(c.upstreamId)))throw new ModelConfigError("MODEL_INCOMPATIBLE","文字通道必须满足当前全部用途的文字及图片理解能力",400);
          if(body.action === "parameters" && body.parameters){
            const defaults=await readQualityDefaults(admin.pool,config);
            for(const route of body.parameters.routes){const d=defaults.get(route.upstreamId);
              if(route.metadataRef && (!d || route.metadataRef.id!==d.id || route.metadataRef.revision!==d.revision))throw new ModelConfigError("METADATA_CHANGED","元数据默认值已更新，请重新打开参数设置后核对",409);
              if(route.mode==="map")for(const choice of body.parameters.choices)if(!route.values[choice.id]?.trim() && route.metadataRef && d?.mode==="map")route.values[choice.id]=d.values[choice.id] || "";
            }
          }
          if(body.action==="resolutions" && body.parameters){
            const defaults=await readResolutionDefaults(admin.pool,config);
            for(const route of body.parameters.routes){const d=defaults.get(route.upstreamId);if(route.ratioField===undefined && route.field===d?.field)route.ratioField=d.ratioField;if(route.metadataRef&&(!d||route.metadataRef.id!==d.id||route.metadataRef.revision!==d.revision))throw new ModelConfigError("METADATA_CHANGED","分辨率元数据已更新，请重新打开设置后核对",409);}
          }
          if(body.action==="imagegen-parameters"){
            if(row.modality!=="image")throw new ModelConfigError("MODEL_INCOMPATIBLE","文字模型不能配置生图能力",400);
            const defaults=await readImagegenDefaults(admin.pool,config);
            if(body.routes===null)body.routes=[...new Set(row.routes.map(r=>r.upstreamId))].map(upstreamId=>{const d=defaults.get(upstreamId);return {upstreamId,capabilities:d?.capabilities||{},wireMap:d?.wireMap||{},metadataRef:d?.metadataRef||null};});
            for(const r of body.routes??[]){const d=defaults.get(r.upstreamId);if(r.metadataRef&&(!d||d.metadataRef.id!==r.metadataRef.id||d.metadataRef.revision!==r.metadataRef.revision))throw new ModelConfigError("METADATA_CHANGED","图像能力资料已更新，请重新打开设置核对",409);}
          }
          config = body.action === "video-parameters" ? applyVideoParameters(config,row,body.routes) : body.action === "imagegen-parameters" ? applyImagegenModelParameters(config,[...new Set(row.routes.map(r=>r.upstreamId))],body.routes) : body.action === "channels" ? applyChannelPolicy(config,row,body.policy) : body.action === "resolutions" ? applyDisplayResolutions(config,row,body.resolutions) : body.action === "parameters" ? applyModelQualityParameters(config,row,body.parameters) : body.action === "scope" ? applyModelToolScope(config,row,body.features,body.canvas) : body.action === "rename" ? renameManagedModel(config, row, body.label) : switchManagedModel(config, row, body.upstreamId);
          if(body.action==="resolutions" && body.parameters!==undefined)config=applyResolutionParameters(config,row,body.resolutions||["1K","2K","4K"],body.parameters);
        } else if (body.action === "connect") {
          const endpoint = validateModelEndpoint(body.protocol === "apimart-images" ? body.baseUrl.replace(/\/v1\/?$/, "") : body.baseUrl, { trustedOrigins: admin.trustedOrigins });
          const providerId = `mvp-${body.id}`;
          await admin.credentials.read(body.credentialRef, providerId);
          config.providers.push({ id: providerId, name: body.name, baseUrl: endpoint, protocol: body.protocol, credentialRef: body.credentialRef, enabled: true, timeoutMs: 120000, maxConcurrent: 4 });
        } else {
          const p = config.providers.find(p => p.id === body.providerId);
          if (!p?.enabled || !p.credentialRef || !MODEL_MANAGEMENT_PROTOCOLS.includes(p.protocol as typeof MODEL_MANAGEMENT_PROTOCOLS[number])) throw new ModelConfigError("MODEL_INCOMPATIBLE", "该来源尚未启用或协议未支持快捷接入");
          const catalog = await refreshProviderCatalog(admin.pool, p, admin.credentials, admin.trustedOrigins, deps.fetcher);
          if (catalog.status !== "ok" || catalog.stale || !catalog.models.some(m => m.id === body.model)) throw new ModelConfigError("CATALOG_UNAVAILABLE", "请先成功刷新该来源的模型目录，再添加目录中的模型");
          if (config.upstreamModels.some(m => m.providerId === p.id && m.model === body.model)) throw new ModelConfigError("MODEL_EXISTS", "该模型已接入，可直接在切换列表中选择");
          if (p.protocol === "new-api-flow" && !isNewApiFlowImageModel(body.model)) throw new ModelConfigError("MODEL_INCOMPATIBLE", "该模型 ID 尚未由当前图片适配器支持，请在完整配置中心核验协议");
          if (body.resolutions.some(r => r !== "1K") && p.protocol === "openai-images") throw new ModelConfigError("MODEL_INCOMPATIBLE", "OpenAI 图片 2K/4K 需要专用尺寸参数映射，请在完整配置中心配置");
          const modality = p.protocol === "openai-chat" ? "text" : ["openai-images","new-api-flow","apimart-images","fal-images"].includes(p.protocol) ? "image" : "video";
          config.upstreamModels.push({ id: `mvp-${body.id}`, providerId: p.id, model: body.model, label: body.model.slice(0, 100), modality, enabled: true, parameterMap: {...(body.qualityPolicy?{qualityPolicy:body.qualityPolicy}:{}),...(body.videoProfile?{videoProfile:body.videoProfile}:{})}, capabilities: { verified: body.capabilityVerified ?? true, generate: true, edit: modality === "image" && body.edit, vision: modality === "text" && body.vision, transparent: false, preserveIdentity: false, textAccuracy: false, qualityRank: body.qualityRank, qualities: modality === "image" ? body.qualities : [], nativeResolutions: modality === "image" ? body.resolutions : [], maxReferenceImages: body.maxReferenceImages, expectedLatencyMs: 30000,...(body.videoDefinition?{video:body.videoDefinition}:{}) } });
        }
        config = validateModelConfig(config, { trustedOrigins: admin.trustedOrigins });
        compileRouterProjection({ version: snapshot.version + 1, digest: "", config }, await admin.billing.current(), { trustedOrigins: admin.trustedOrigins });
        draft = await admin.repo.saveDraft({ id: draft.id, expectedRevision: draft.revision, config, actor });
      }
      staged = true;
      const publication = await admin.runtime.publish({ id: body.id, draftId: draft.id, expectedRevision: draft.revision, expectedVersion: body.expectedVersion, actor, reason: `MVP ${body.action === "video-parameters" ? `视频能力 ${body.rowId}` : body.action === "imagegen-parameters" ? `图像高级参数 ${body.rowId}` : body.action === "scope-compat" ? "回滚兼容：展开画布系统范围" : body.action === "order" ? "模型展示排序" : body.action === "channels" ? `供应通道 ${body.rowId}` : body.action === "resolutions" ? `分辨率选项 ${body.rowId}` : body.action === "parameters" ? `参数映射 ${body.rowId}` : body.action === "scope" ? `工具范围 ${body.rowId}` : body.action === "switch" ? `切换 ${body.rowId} → ${body.upstreamId}` : body.action === "rename" ? `改名 ${body.rowId} → ${body.label}` : body.action === "connect" ? `接入来源 ${body.name}` : `添加模型 ${body.model}`}` });
      let discovery;
      if (body.action === "connect" && publication.phase === "applied") {
        const provider = (await admin.repo.current()).config.providers.find(p=>p.id===`mvp-${body.id}`);
        if(provider) discovery = await refreshProviderCatalog(admin.pool,provider,admin.credentials,admin.trustedOrigins,deps.fetcher).then(r=>({status:r.status,metadataSaved:r.metadataSaved===true}),()=>({status:"error",metadataSaved:false}));
      }
      return biJson({ publication, ...(discovery?{discovery}:{}) }, publication.phase === "applied" ? 200 : publication.phase === "failed" ? 422 : 202);
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
export const modelManagementHandler = createModelManagementHandler({ authorize: biAuthorize, administration: getModelAdministration, managed: modelConfigurationEnabled });
