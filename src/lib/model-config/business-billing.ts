import "server-only";
import { currentExecutionBundle, currentModelExecution } from "./context";
import { getModelAdministration } from "./server";
import { modelConfigurationEnabled } from "./requests";
import { selectedBusinessOption } from "./business";
import { ModelConfigError, type ModelSnapshot } from "./types";
import type { BillingFacts, BillingQuote, ConfigSnapshot } from "../billing/types";

export function businessBillingSnapshot(snapshot: ConfigSnapshot, models: ModelSnapshot, facts: BillingFacts): ConfigSnapshot {
  const option = selectedBusinessOption(models.config, facts.feature, facts.modelId);
  if (!option?.pricing) return snapshot;
  const config = structuredClone(snapshot.config), tariff = config.features[facts.feature];
  // Feature-model terms are authoritative; legacy feature rules must not override them.
  tariff.enabled = true; tariff.pricing = structuredClone(option.pricing); tariff.unit = option.unit; tariff.rules = [];
  tariff.settlement = { ...tariff.settlement, qualityBasis: "requested", successBasis: "successful-units", failureBps: 0, reserveBps: 10000 };
  return { version: snapshot.version, config };
}
export async function freezeBusinessQuote(request: Request, snapshot: ConfigSnapshot, facts: BillingFacts, create: (s: ConfigSnapshot, f: BillingFacts) => BillingQuote) {
  if (facts.byok || !await modelConfigurationEnabled()) return create(snapshot, facts);
  const admin = await getModelAdministration();
  const version = currentExecutionBundle()?.modelVersion || currentModelExecution()?.frozen.modelVersion;
  const models = version ? await admin.repo.byVersion(version) : await admin.repo.current();
  const requested = request.headers.get("x-naumi-model-version");
  if (requested && Number(requested) !== models.version) throw new ModelConfigError("MODEL_CHANGED", "模型配置已更新，请重新确认报价", 409);
  const q = create(businessBillingSnapshot(snapshot, models, facts), facts);
  q.modelVersion = models.version;
  if (models.config.business?.[facts.feature]) q.legacyCompatible = false;
  const scope = currentModelExecution(), model = models.config.publicModels.find(m => m.id === facts.modelId);
  const upstream = models.config.upstreamModels.find(u => u.id === (scope?.frozen.target.type === "upstream" && scope.frozen.publicModelId === facts.modelId ? scope.frozen.target.id : model?.target.id));
  // A route can pay several suppliers. Never label the initial-model cost as
  // this operation's total; execution stages remain the authoritative estimate.
  if (!selectedBusinessOption(models.config,facts.feature,facts.modelId)?.routing?.enabled && upstream?.procurement) q.procurement = structuredClone(upstream.procurement);
  else if (models.config.business?.[facts.feature]) q.costRates = {};
  return q;
}
