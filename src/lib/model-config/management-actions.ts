import {editManagedModelIdentity} from "./management-identity";
import {planModelOnboarding} from './onboarding';
import "server-only";
import { applyImageMappingEditor } from "./image-mapping-editor";
import { applyResolutionParameters } from "./resolution-policy";
import { applyImagegenModelParameters } from "./imagegen-policy";
import { readImagegenDefaults } from "../supplier-models/imagegen-access";
import { readResolutionDefaults } from "../supplier-models/resolution-access";
import { applyDisplayResolutions } from "./resolution-options";
import { applyVideoParameters } from "./video-policy";
import {applyReviewedVideoExecutionMigration} from './video-execution-migration';
import { applyChannelPolicy } from "./channel-policy";
import { readQualityDefaults } from "../supplier-models/quality-access";
import { refreshProviderCatalog } from "./catalog-store";
import { publicModelCatalog } from "@/lib/model-config/public-catalog";
import { FEATURE_BINDINGS } from "./feature-model-policy";
import { MODEL_BINDINGS } from "./bindings";
import { MODEL_MANAGEMENT_PROTOCOLS, switchManagedModel, renameManagedModel, applyModelToolScope, applyModelQualityParameters, orderManagedModels } from "./management";
import { validateModelEndpoint } from "./schema";
import { ModelConfigError } from "./types";
import type { ModelConfig, ModelSnapshot } from "./types";
import type { ManagementAdministration, ManagementInput } from "./management-input";
import { managementRows as rows } from "./management-read";
type ConfigAction = Exclude<ManagementInput, { action: "credential" | "discover" | "pricing" }>;
/** Business rules that turn one management operation into the next model config.
 * The caller owns receipts, locks, validation, projection and publication. */
export async function applyManagementConfigAction({ admin, snapshot, body, fetcher }: { admin: ManagementAdministration; snapshot: ModelSnapshot; body: ConfigAction; fetcher?: typeof fetch }): Promise<ModelConfig> {
  const deps = { fetcher };
        let config = structuredClone(snapshot.config);
        if(body.action==='create-models'){
          const billing=await admin.billing.current();
          if(billing.version!==body.expectedBillingVersion)throw new ModelConfigError('CONFIG_CONFLICT','计费版本已变化，请重新核对售价',409);
          const catalogs=[];
          for(const providerId of [...new Set(body.entries.flatMap(e=>'upstream'in e.source?[e.source.upstream.providerId]:[]))]){
            const provider=config.providers.find(p=>p.id===providerId);
            if(!provider)throw new ModelConfigError('PROVIDER_UNAVAILABLE','供应商不存在',404);
            catalogs.push(await refreshProviderCatalog(admin.pool,provider,admin.credentials,admin.trustedOrigins,deps.fetcher));
          }
          config=planModelOnboarding(snapshot,billing,body,catalogs).config;
        } else if(body.action==='video-execution-migration') {
          config=applyReviewedVideoExecutionMigration(config,snapshot.version,body.reviewDigest,body.publicIds).config;
        } else if(body.action === "video-capability-upgrade") {
          throw new ModelConfigError('VIDEO_CAPABILITY_UPGRADE_RETIRED','旧能力升级操作已退出，请刷新后迁移执行绑定',410);
        } else if(body.action === "scope-compat") {
          // Deployment rollback expands the system grant before an older image
          // reads this config. Preserve ordinary tool scope and every price.
          for(const model of config.publicModels)if(model.toolScope?.systems?.includes("canvas")){
            const available=Object.entries(FEATURE_BINDINGS).filter(([feature,binding])=>feature.startsWith("canvas.")&&MODEL_BINDINGS[binding!].modality===model.modality&&publicModelCatalog(snapshot,model.modality,feature as never,true).models.some(m=>m.id===model.id)).map(([feature])=>feature);
            model.toolScope.features=[...new Set([...model.toolScope.features,...available])] as typeof model.toolScope.features;
            delete model.toolScope.systems;
          }
        } else if(body.action === "order") {
          config=orderManagedModels(config,rows(snapshot),body.rowIds);
        } else if(body.action === "image-mapping") {
          const row=rows(snapshot).find(r=>r.id===body.rowId);if(!row||row.modality!=="image"||row.preset||!row.resolutionConfig?.routes.every(r=>r.editable)||!row.qualityConfig?.routes.every(r=>r.editable))throw new ModelConfigError("IMAGE_MAPPING_INVALID","此模型参数由协议预设管理",422);
          config=applyImageMappingEditor(config,row.publicIds,[...new Set(row.routes.map(r=>r.upstreamId))],body.mapping);
        } else if (body.action === "identity" || body.action === "switch" || body.action === "rename" || body.action === "scope" || body.action === "parameters" || body.action === "resolutions" || body.action === "channels" || body.action === "imagegen-parameters" || body.action === "video-parameters") {
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
          config = body.action === "identity" ? editManagedModelIdentity(config,row,body.publicId,body.label) : body.action === "video-parameters" ? applyVideoParameters(config,row,body.routes) : body.action === "imagegen-parameters" ? applyImagegenModelParameters(config,[...new Set(row.routes.map(r=>r.upstreamId))],body.routes) : body.action === "channels" ? applyChannelPolicy(config,row,body.policy) : body.action === "resolutions" ? applyDisplayResolutions(config,row,body.resolutions) : body.action === "parameters" ? applyModelQualityParameters(config,row,body.parameters) : body.action === "scope" ? applyModelToolScope(config,row,body.features,body.canvas) : body.action === "rename" ? renameManagedModel(config, row, body.label) : switchManagedModel(config, row, body.upstreamId);
          if(body.action==="resolutions" && body.parameters!==undefined)config=applyResolutionParameters(config,row,body.resolutions||["1K","2K","4K"],body.parameters);
        } else if (body.action === "connect") {
          const endpoint = validateModelEndpoint(body.protocol === "apimart-images" ? body.baseUrl.replace(/\/v1\/?$/, "") : body.baseUrl, { trustedOrigins: admin.trustedOrigins });
          const providerId = `mvp-${body.id}`;
          await admin.credentials.read(body.credentialRef, providerId);
          config.providers.push({ id: providerId, name: body.name, baseUrl: endpoint, protocol: body.protocol, credentialRef: body.credentialRef, enabled: true, timeoutMs: 120000, maxConcurrent: 4,...(body.parameterCatalogPath?{options:{parameterCatalogPath:body.parameterCatalogPath}}:{}) });
        } else {
          const p = config.providers.find(p => p.id === body.providerId);
          if (!p?.enabled || !p.credentialRef || !MODEL_MANAGEMENT_PROTOCOLS.includes(p.protocol as typeof MODEL_MANAGEMENT_PROTOCOLS[number])) throw new ModelConfigError("MODEL_INCOMPATIBLE", "该来源尚未启用或协议未支持快捷接入");
          const catalog = await refreshProviderCatalog(admin.pool, p, admin.credentials, admin.trustedOrigins, deps.fetcher);
          if (catalog.status !== "ok" || catalog.stale || !catalog.models.some(m => m.id === body.model)) throw new ModelConfigError("CATALOG_UNAVAILABLE", "请先成功刷新该来源的模型目录，再添加目录中的模型");
          if (config.upstreamModels.some(m => m.providerId === p.id && m.model === body.model)) throw new ModelConfigError("MODEL_EXISTS", "该模型已接入，可直接在切换列表中选择");
          if (body.resolutions.some(r => r !== "1K") && p.protocol === "openai-images") throw new ModelConfigError("MODEL_INCOMPATIBLE", "OpenAI 图片 2K/4K 需要专用尺寸参数映射，请在完整配置中心配置");
          const modality = p.protocol === "openai-chat" ? "text" : ["openai-images","new-api-flow","apimart-images","fal-images"].includes(p.protocol) ? "image" : "video";
          config.upstreamModels.push({ id: `mvp-${body.id}`, providerId: p.id, model: body.model, label: body.model.slice(0, 100), modality, enabled: true, parameterMap: {...(body.qualityPolicy?{qualityPolicy:body.qualityPolicy}:{}),...(body.videoProfile?{videoProfile:body.videoProfile}:{})}, capabilities: { verified: body.capabilityVerified ?? true, generate: true, edit: modality === "image" && body.edit, vision: modality === "text" && body.vision, transparent: false, preserveIdentity: false, textAccuracy: false, qualityRank: body.qualityRank, qualities: modality === "image" ? body.qualities : [], nativeResolutions: modality === "image" ? body.resolutions : [], maxReferenceImages: body.maxReferenceImages, expectedLatencyMs: 30000,...(body.videoDefinition?{video:body.videoDefinition}:{}) } });
        }
        return config;
}
