import "server-only";
import type { PoolClient } from "pg";
import { BillingError, type BillingConfig, type ConfigSnapshot } from "../billing/types";
import { compileRouterProjection } from "./projection";
import { modelTrustedOrigins } from "./environment";
import { ModelConfigError, type ModelSnapshot } from "./types";
import type { ValidationOptions } from "./schema";

/** The model-pricing failure a billing change would introduce, or null.
 * A failure already present with the current billing config is not caused by
 * this change and is left to the model owner; only newly introduced breakage
 * (e.g. a lowest-cost pool losing a comparable cost) counts. */
export function billingChangeBreaksModelPricing(model: ModelSnapshot, current: ConfigSnapshot, next: ConfigSnapshot, options: ValidationOptions = {}): ModelConfigError | null {
  const failure = (billing: ConfigSnapshot) => {
    try { compileRouterProjection(model, billing, options); return null; }
    catch (error) { if (error instanceof ModelConfigError) return error; throw error; }
  };
  if (failure(current)) return null;
  return failure(next);
}

/** Billing publication guard (wired in billing/configuration.ts). Reads only the
 * active immutable model version; no model registry is created or changed. */
export async function assertBillingKeepsModelPricing(next: BillingConfig, current: ConfigSnapshot, tx: PoolClient): Promise<void> {
  // A failed statement would abort the caller's transaction, so probe the table without erroring.
  if (!(await tx.query("SELECT to_regclass('app_model_config_state') IS NOT NULL AS present")).rows[0]?.present) return;
  const state = (await tx.query("SELECT active_version FROM app_model_config_state WHERE singleton=true")).rows[0];
  const version = Number(state?.active_version);
  if (!Number.isSafeInteger(version) || version < 1) return;
  const { getModelAdministration } = await import("./server");
  const model = await (await getModelAdministration()).repo.byVersion(version);
  const broken = billingChangeBreaksModelPricing(model, current, { version: current.version + 1, config: next }, { trustedOrigins: modelTrustedOrigins() });
  if (broken) throw new BillingError("INVALID_CONFIG", `此计费配置会使当前模型无法报价：${broken.message}`, 400);
}
