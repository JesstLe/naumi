import "server-only";
import { dbEnabled, ensureSchema, getPool } from "../db";
import { getBillingRuntime } from "../billing/server";
import { bootstrapModelConfig, readLegacyModelSources } from "./bootstrap";
import { createCredentialStore } from "./credentials";
import { importLegacyRouter } from "./legacy-router";
import { createModelRepository } from "./repository";
import { createRouterControl } from "./router-client";
import { createModelRuntime } from "./runtime";
import { ensureModelSchema } from "./schema";
import { ModelConfigError } from "./types";

export function modelTrustedOrigins() { return (process.env.MODEL_CONFIG_TRUSTED_ORIGINS || "").split(/[\s,]+/).filter(Boolean); }
let assembled: Promise<Awaited<ReturnType<typeof assemble>>> | undefined;
async function assemble() {
  if (!dbEnabled) throw new ModelConfigError("CONFIG_UNAVAILABLE", "未配置数据库，模型管理暂不可用", 503);
  const baseUrl = process.env.NAUMI_ROUTER_MANAGEMENT_URL || "";
  if (!baseUrl) throw new ModelConfigError("ROUTER_UNAVAILABLE", "尚未配置 Router 私有管理连接", 503);
  const trustedOrigins = modelTrustedOrigins();
  const router = createRouterControl({ baseUrl, token: process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN || "", envelopeSecret: process.env.MODEL_CONFIG_ENVELOPE_SECRET || "", trustedOrigins });
  await ensureSchema();
  const pool = getPool(); await ensureModelSchema(pool);
  const credentials = createCredentialStore(pool);
  const initialized = (await pool.query("SELECT 1 FROM app_model_config_state WHERE singleton=true")).rowCount;
  // Read-only discovery happens before any bootstrap transaction. Existing registries never depend on legacy discovery.
  const discovery = initialized ? undefined : await Promise.all([readLegacyModelSources(), router.legacy()]);
  const repo = createModelRepository({ pool, trustedOrigins, initialize: async tx => {
    if (!discovery) throw new ModelConfigError("CONFIG_UNAVAILABLE", "模型初始化状态待核对", 503);
    const [sources, exported] = discovery;
    const imported = await importLegacyRouter({ exported, control: router, credentials, tx });
    return bootstrapModelConfig({ credentials, sources: { ...sources, router: imported }, tx, trustedOrigins });
  } });
  await repo.current();
  const billing = (await getBillingRuntime()).config;
  const runtime = createModelRuntime({ pool, repo, credentials, router, trustedOrigins, billing: () => billing.current(), billingByVersion: version => billing.byVersion(version) });
  return { runtime, repo, credentials, router, trustedOrigins, billing };
}
export async function getModelAdministration() {
  if (!assembled) assembled = assemble().catch(error => { assembled = undefined; throw error; });
  return assembled;
}
export async function getModelRuntime() { return (await getModelAdministration()).runtime; }
