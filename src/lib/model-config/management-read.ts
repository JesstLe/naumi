import "server-only";
import type {Pool,PoolClient} from "pg";
import {getPool} from "@/platform/db/pool";
import {checkReadClientSocket,withOwnedReportClient} from "@/platform/db/owned-read-client";
import {readPublishedBillingConfig} from "../billing/catalog";
import {modelConfigurationEnabled} from "./availability";
import {modelTrustedOrigins} from "./environment";
import {readPublishedModelSnapshot} from "./published-repository";
import { publicModelCatalog } from "@/lib/model-config/public-catalog";
import { readImageModelMetadataFrom } from "../supplier-models/image-model-metadata";
import { readImagegenDefaults } from "../supplier-models/imagegen-access";
import { readResolutionDefaults } from "../supplier-models/resolution-access";
import { readFrozenVideoCapabilities } from "../video/frozen-capability";
import { channelHealthSummary } from "./channel-scheduler";
import { providerCapacitySummary } from "./capacity";
import { readQualityDefaults } from "../supplier-models/quality-access";
import { readProviderCatalogFrom } from "./catalog-store";
import { FEATURE_BINDINGS } from "./feature-model-policy";
import { MODEL_BINDINGS } from "./bindings";
import { managedModelRows, managedModelCandidates } from "./management";
import { managedModelPriceViews } from "./management-pricing";
import type { ModelSnapshot } from "./types";
import type { ManagementAdministration } from "./management-input";
import {ensureSupplierModels} from "../supplier-models/schema";
import {ensureProviderCatalogSchema} from "./catalog-schema";
import {onboardingView} from './onboarding';
import {proposedVideoExecution} from './video-execution-migration';
import {ModelConfigError} from './types';
/** Read model of the model-management page: rows, supplier defaults, pricing and health. */
export function managementRows(snapshot: ModelSnapshot) {
  return managedModelRows(snapshot, Object.entries(FEATURE_BINDINGS).map(([feature, binding]) => ({ ...publicModelCatalog(snapshot, MODEL_BINDINGS[binding!].modality, feature as keyof typeof FEATURE_BINDINGS), feature })));
}
export type ManagementReadPorts={
  pool:Pool;
  model:(tx:PoolClient)=>Promise<ModelSnapshot|null>;
  billing:(tx:PoolClient)=>ReturnType<typeof readPublishedBillingConfig>;
  managed:(tx:PoolClient)=>Promise<boolean>;
};
export function publishedManagementRead():ManagementReadPorts {
  return {pool:getPool(),model:tx=>readPublishedModelSnapshot(tx,{trustedOrigins:modelTrustedOrigins()}),
    billing:readPublishedBillingConfig,managed:modelConfigurationEnabled};
}
/** Explicit injected administration used by isolated callers. Production GET
 * takes only the published ports above, so it cannot initialize a catalogue. */
export async function injectedManagementRead(admin:ManagementAdministration,managed:()=>Promise<boolean>,fullView:boolean):Promise<ManagementReadPorts>{
  const snapshot=await admin.repo.current();
  if(fullView){await ensureSupplierModels(admin.pool);await ensureProviderCatalogSchema(admin.pool);}
  return {pool:admin.pool,model:async()=>snapshot,billing:tx=>admin.billing.current(tx),managed};
}
export async function managementReadSnapshot<T>(ports:ManagementReadPorts,signal:AbortSignal,
  load:(tx:PoolClient,snapshot:ModelSnapshot)=>Promise<T>):Promise<T>{
  return withOwnedReportClient(ports.pool,async tx=>{
    await tx.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='3s'"+checkReadClientSocket);
    const snapshot=await ports.model(tx);
    if(!snapshot)throw new ModelConfigError("CONFIG_UNAVAILABLE","模型配置暂时不可用，请稍后重试",503);
    const value=await load(tx,snapshot);
    await tx.query("COMMIT");
    return value;
  },signal);
}
export async function readManagementView(ports:ManagementReadPorts,signal:AbortSignal) {
  const result=await managementReadSnapshot(ports,signal,async (tx,snapshot)=>{
    const billing=await ports.billing(tx),metadataRows=await readImageModelMetadataFrom(tx,snapshot.config);
    const managed=await ports.managed(tx),channelHealth=await channelHealthSummary(tx,snapshot.config);
    const providerCapacity=await providerCapacitySummary(tx,snapshot.config),catalogs=await readProviderCatalogFrom(tx,snapshot.config.providers);
    const modelRows=managementRows(snapshot);
    const videoIds=modelRows.filter(row=>row.modality==="video").flatMap(row=>row.routes.map(route=>route.upstreamId));
    const videoDefaults=await readFrozenVideoCapabilities(tx,snapshot,videoIds);
    return {snapshot,billing,metadataRows,managed,channelHealth,providerCapacity,catalogs,modelRows,videoDefaults};
  });
  const {snapshot,billing,metadataRows,managed,channelHealth,providerCapacity,catalogs,modelRows,videoDefaults}=result;
        const [defaults,resolutionDefaults,imagegenDefaults] = await Promise.all([
          readQualityDefaults(ports.pool,snapshot.config,metadataRows),readResolutionDefaults(ports.pool,snapshot.config,metadataRows),
          readImagegenDefaults(ports.pool,snapshot.config,metadataRows),
        ]);
        for(const row of modelRows)if(row.modality==="image")row.imagegenConfig={routes:[...new Set(row.routes.map(r=>r.upstreamId))].map(upstreamId=>{const u=snapshot.config.upstreamModels.find(u=>u.id===upstreamId)!,d=imagegenDefaults.get(upstreamId);return {upstreamId,capabilities:u.capabilities.imagegen??d?.capabilities??{},wireMap:u.parameterMap.imagegen??d?.wireMap??{},...(d?{metadataRef:d.metadataRef}:{})};})};
        for(const row of modelRows)if(row.modality==="video")row.videoConfig={routes:[...new Set(row.routes.map(route=>route.upstreamId))].map(id=>{
          const upstream=snapshot.config.upstreamModels.find(model=>model.id===id)!,provider=snapshot.config.providers.find(item=>item.id===upstream.providerId)!;
          const frozen=videoDefaults.get(id);
          let candidate;try{if(!upstream.parameterMap.videoExecution)candidate=proposedVideoExecution(upstream,provider);}catch(error){if(!(error instanceof ModelConfigError))throw error;}
          return {upstreamId:id,model:upstream.model,provider:provider.name,definition:upstream.capabilities.video,profile:upstream.parameterMap.videoProfile,execution:upstream.parameterMap.videoExecution,
            ...(candidate?{executionCandidate:candidate.execution,candidateProfile:candidate.profile}:{}),
            ...(frozen?{effective:frozen.definition,sources:frozen.sources,sourceRevision:frozen.sourceRevision}:{effective:{},sources:{},frozenRecorded:false as const})};
        })};
        for(const row of modelRows)for(const route of row.resolutionConfig?.routes||[]){const d=resolutionDefaults.get(route.upstreamId);route.metadataDefaults=d||null;if(d)route.nativeValues=d.nativeValues;if(route.editable&&!route.configured&&d?.available){route.mode=d.mode;route.field=d.field;route.ratioField=d.ratioField;route.fieldKnown=true;route.values={...d.values};route.metadataRef={id:d.id,revision:d.revision};}}
        for(const row of modelRows)for(const route of row.qualityConfig?.routes || []){const d=defaults.get(route.upstreamId);route.metadataDefaults=d || null;if(!route.configured&&d?.available){route.mode=d.mode;route.values={...d.values};route.metadataRef={id:d.id,revision:d.revision};}else if(!route.configured){route.mode="omit";route.values={};}}
        signal.throwIfAborted();
        return { version: snapshot.version,billingVersion:billing.version, managed, rows: modelRows.map(row=>({...row,pricing:managedModelPriceViews(billing,snapshot,row)})), candidates: managedModelCandidates(snapshot.config), channelHealth,providerCapacity,providers: snapshot.config.providers.map(p => ({ id: p.id, name: p.name, protocol: p.protocol, maxConcurrent:p.maxConcurrent, baseUrl: p.baseUrl, enabled: p.enabled, configured: !!p.credentialRef })), catalogs,onboarding:onboardingView(snapshot.config) };
}
