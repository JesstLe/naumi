import "server-only";
import { publicModelCatalog } from "@/lib/model-config/public-catalog";
import { readImageModelMetadata } from "../supplier-models/image-model-metadata";
import { readImagegenDefaults } from "../supplier-models/imagegen-access";
import { readResolutionDefaults } from "../supplier-models/resolution-access";
import { freezeManagedVideoCapability } from "../video/frozen-capability";
import { channelHealthSummary } from "./channel-scheduler";
import { providerCapacitySummary } from "./capacity";
import { readQualityDefaults } from "../supplier-models/quality-access";
import { readProviderCatalog } from "./catalog-store";
import { FEATURE_BINDINGS } from "./feature-model-policy";
import { MODEL_BINDINGS } from "./bindings";
import { managedModelRows, managedModelCandidates } from "./management";
import { managedModelPriceViews } from "./management-pricing";
import type { ModelSnapshot } from "./types";
import type { ManagementAdministration } from "./management-input";
import {onboardingView} from './onboarding';
import {proposedVideoExecution} from './video-execution-migration';
import {ModelConfigError} from './types';
/** Read model of the model-management page: rows, supplier defaults, pricing and health. */
export function managementRows(snapshot: ModelSnapshot) {
  return managedModelRows(snapshot, Object.entries(FEATURE_BINDINGS).map(([feature, binding]) => ({ ...publicModelCatalog(snapshot, MODEL_BINDINGS[binding!].modality, feature as keyof typeof FEATURE_BINDINGS), feature })));
}
export async function readManagementView(admin: ManagementAdministration, snapshot: ModelSnapshot, managedEnabled: () => Promise<boolean>) {
  const rows = managementRows, deps = { managed: managedEnabled };
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
          let candidate;try{if(!upstream.parameterMap.videoExecution)candidate=proposedVideoExecution(upstream,provider);}catch(error){if(!(error instanceof ModelConfigError))throw error;}
          return {upstreamId:id,model:upstream.model,provider:provider.name,definition:upstream.capabilities.video,profile:upstream.parameterMap.videoProfile,execution:upstream.parameterMap.videoExecution,
            ...(candidate?{executionCandidate:candidate.execution,candidateProfile:candidate.profile}:{}),
            effective:frozen.definition,sources:frozen.sources,sourceRevision:frozen.sourceRevision};
        }))};
        for(const row of modelRows)for(const route of row.resolutionConfig?.routes||[]){const d=resolutionDefaults.get(route.upstreamId);route.metadataDefaults=d||null;if(d)route.nativeValues=d.nativeValues;if(route.editable&&!route.configured&&d?.available){route.mode=d.mode;route.field=d.field;route.ratioField=d.ratioField;route.fieldKnown=true;route.values={...d.values};route.metadataRef={id:d.id,revision:d.revision};}}
        for(const row of modelRows)for(const route of row.qualityConfig?.routes || []){const d=defaults.get(route.upstreamId);route.metadataDefaults=d || null;if(!route.configured&&d?.available){route.mode=d.mode;route.values={...d.values};route.metadataRef={id:d.id,revision:d.revision};}else if(!route.configured){route.mode="omit";route.values={};}}
        return { version: snapshot.version,billingVersion:billing.version, managed, rows: modelRows.map(row=>({...row,pricing:managedModelPriceViews(billing,snapshot,row)})), candidates: managedModelCandidates(snapshot.config), channelHealth,providerCapacity,providers: snapshot.config.providers.map(p => ({ id: p.id, name: p.name, protocol: p.protocol, maxConcurrent:p.maxConcurrent, baseUrl: p.baseUrl, enabled: p.enabled, configured: !!p.credentialRef })), catalogs,onboarding:onboardingView(snapshot.config) };
}
