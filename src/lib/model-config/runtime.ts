import {createExecutionProjectionService} from "./execution-projections";
import "server-only";
import type {ModelSnapshot} from "./types";
import type {Pool} from "pg";
import type {ConfigSnapshot} from "../billing/types";
import type {createCredentialStore} from "./credentials";
import type {RouterControl} from "./router-client";
import {ensureModelRuntimeSchema} from "./runtime-schema";
import type {ValidationOptions} from "./schema";
import {ModelConfigError,type ModelConfigRepository,type ModelPublication,type Modality,type RestoreInput,type StageInput,type ModelFacts} from "./types";
import type {FeatureId} from "../billing/rules/registry";
import {modelCreditView} from "./management-pricing";
import {publicModelCatalog} from "./public-catalog";
import {simulateModel} from "./simulation";
export {publicModelCatalog} from "./public-catalog";
export {simulateModel,type RoutingSimulation} from "./simulation";

type Dependencies = ValidationOptions & { pool: Pool; repo: ModelConfigRepository; credentials: ReturnType<typeof createCredentialStore>; router: RouterControl; billing: () => Promise<ConfigSnapshot>; billingByVersion?: (version: number) => Promise<ConfigSnapshot> };

export function createModelRuntime(deps: Dependencies) {
  const ready = async () => ensureModelRuntimeSchema(deps.pool);
  const billingVersion = async (version: number) => { const current = await deps.billing(); if (current.version === version) return current; if (deps.billingByVersion) return deps.billingByVersion(version); throw new ModelConfigError("CONFIG_UNAVAILABLE", "需要恢复原计费版本后核对发布", 503); };
  const {prepareExecution,validateExecutionProjection}=createExecutionProjectionService(deps);
  const apply = async (publication: ModelPublication): Promise<ModelPublication> => {
    if (publication.phase === "applied" || publication.phase === "failed") return publication;
    await ready();
    let meta = (await deps.pool.query("SELECT billing_version,router_digest,expected_router_digest FROM app_model_publications WHERE id=$1", [publication.id])).rows[0];
    let activationMayHaveStarted = false;
    try {
      if (!meta.billing_version) {
        const billing = await deps.billing();
        await deps.pool.query("UPDATE app_model_publications SET billing_version=$2 WHERE id=$1 AND billing_version IS NULL", [publication.id,billing.version]);
        meta = (await deps.pool.query("SELECT billing_version,router_digest,expected_router_digest FROM app_model_publications WHERE id=$1", [publication.id])).rows[0];
      }
      await deps.repo.setPhase(publication.id, "preparing");
      const snapshot = await deps.repo.byVersion(publication.version);
      const prepared = await prepareExecution({ snapshot, billing: await billingVersion(Number(meta.billing_version)) });
      await deps.pool.query("UPDATE app_model_publications SET router_digest=$2 WHERE id=$1 AND (router_digest IS NULL OR router_digest=$2)", [publication.id,prepared.digest]);
      const existing = await deps.router.status(publication.id);
      if (existing) {
        activationMayHaveStarted = true;
        if (existing.digest !== prepared.digest) throw new ModelConfigError("ROUTER_CONFLICT", "发布编号对应的执行摘要不一致", 409);
      } else {
        if (meta.expected_router_digest === null) {
          const expected = await deps.router.state();
          await deps.pool.query("UPDATE app_model_publications SET expected_router_digest=$2 WHERE id=$1 AND expected_router_digest IS NULL", [publication.id,expected]);
          meta = (await deps.pool.query("SELECT expected_router_digest FROM app_model_publications WHERE id=$1", [publication.id])).rows[0];
        }
        await deps.repo.setPhase(publication.id, "activating");
        activationMayHaveStarted = true;
        await deps.router.activate(publication.id, meta.expected_router_digest, prepared.digest);
      }
      await deps.repo.markApplied(publication.id, publication.digest);
      return deps.repo.publication(publication.id);
    } catch (error) {
      // Only an explicit preparation rejection proves that the version did not activate.
      // All activation/commit ambiguities retain the publication for same-ID reconciliation.
      const rejectedBeforeActivation = !activationMayHaveStarted && error instanceof ModelConfigError && ["INVALID_PROJECTION", "INVALID_COST", "UNSUPPORTED_POOL_PROTOCOL", "INVALID_CONFIG", "INVALID_ENDPOINT"].includes(error.code);
      const phase = rejectedBeforeActivation ? "failed" : "unknown";
      return deps.repo.setPhase(publication.id, phase, error instanceof ModelConfigError ? error.code : "CONFIG_COMMIT_UNKNOWN");
    }
  };
  return {
    current: () => deps.repo.current(), byVersion: (version: number) => deps.repo.byVersion(version),
    publicCatalog: async (modality: Modality, feature?: FeatureId, supplied?: ModelSnapshot) => {const snapshot=supplied??await deps.repo.current(),catalog=publicModelCatalog(snapshot,modality,feature);if(!feature)return catalog;const billing=await deps.billing();return {...catalog,models:catalog.models.map(model=>{const v=modelCreditView(billing,snapshot,feature,model.id);const unit=v.unit==="image"?"张":v.unit==="item"?"项":"次";return {...model,creditHint:v.credits===null?"价格需核对":`${v.estimated?"预估":"参考"}${modality==="image"?"标准1K ":""}${v.credits} 积分/${unit}`};})};},
    prepareExecution,
    validateExecutionProjection,
    publish: async (input: StageInput) => apply(await deps.repo.stage(input)),
    restore: async (input: RestoreInput) => apply(await deps.repo.stageRestore(input)),
    async simulate(input: { draftId: string; actor: string; facts: ModelFacts; publicModelId: string }) {
      const draft = await deps.repo.draft(input.actor); if (draft.id !== input.draftId) throw new ModelConfigError("DRAFT_UNAVAILABLE", "草稿不可用", 404);
      return simulateModel({ version: draft.basedOnVersion, digest: "", config: draft.config }, await deps.billing(), input.publicModelId, input.facts, deps);
    },
  };
}
export type ModelRuntime = ReturnType<typeof createModelRuntime>;
