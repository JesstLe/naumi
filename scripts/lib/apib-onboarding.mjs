import { createHash } from "node:crypto";

export const APiB_ORIGIN = "https://api.apib.ai";
export const sha256 = value => createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value === null || typeof value !== "object" ? value : Array.isArray(value) ? value.map(v => JSON.parse(canonical(v))) : Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(canonical(value[k]))])));
const same = (a, b) => canonical(a) === canonical(b);

/** Offline preparation only: no transport, DB, credentials, publication, or enabled routes. */
export function prepareAPiB({ snapshot, catalog, manifest, expectedVersion, expectedDigest }) {
  if (snapshot.version !== expectedVersion || snapshot.digest !== expectedDigest) throw new Error("BASELINE_CAS_MISMATCH");
  if (manifest.baseUrl !== `${APiB_ORIGIN}/v1`) throw new Error("APIB_ORIGIN_MISMATCH");
  if (catalog.source !== `${APiB_ORIGIN}/v1/models` || !catalog.checkedAt || !Array.isArray(catalog.models)) throw new Error("CATALOG_SOURCE_MISMATCH");
  if (new Set(manifest.models.map(m => m.id)).size !== manifest.models.length) throw new Error("DUPLICATE_MODEL");
  if (new Set(catalog.models.map(m => m.id)).size !== catalog.models.length) throw new Error("DUPLICATE_CATALOG_MODEL");
  const available = new Set(catalog.models.map(m => m.id));
  const original = snapshot.config, config = structuredClone(original);
  const additions = { providers: [], upstreamModels: [] };
  for (const modality of ["image", "video"]) {
    const provider = { id: `apib-${modality}`, name: `APIB ${modality === "image" ? "Images" : "Video"}`, protocol: modality === "image" ? "apimart-images" : "apimart", baseUrl: manifest.baseUrl, enabled: false, timeoutMs: 240000, maxConcurrent: 1 };
    const existing = config.providers.find(p => p.id === provider.id);
    if (existing && !same(existing, provider)) throw new Error(`PROVIDER_COLLISION:${provider.id}`);
    if (!existing) { config.providers.push(provider); additions.providers.push(provider.id); }
  }
  const intents = [], observations = [];
  for (const item of manifest.models) {
    if (!available.has(item.id)) throw new Error(`MODEL_NOT_IN_CATALOG:${item.id}`);
    if (!["image", "video"].includes(item.modality) || !item.family || !["existing", "new"].includes(item.destination)) throw new Error(`INVALID_MODEL:${item.id}`);
    if (item.documentation !== null && (typeof item.documentation !== "string" || !item.documentation.startsWith("https://docs.apimart.ai/en/api-reference/"))) throw new Error(`DOCUMENT_SOURCE_MISMATCH:${item.id}`);
    const upstreamId = `apib:${item.id}`;
    const upstream = { id: upstreamId, providerId: `apib-${item.modality}`, model: item.id, label: item.id, modality: item.modality, enabled: false,
      capabilities: { verified: false, generate: false, edit: false, vision: false, transparent: false, preserveIdentity: false, textAccuracy: false, qualityRank: 1, qualities: [], nativeResolutions: [], maxReferenceImages: 0, expectedLatencyMs: 0 }, parameterMap: {} };
    const existing = config.upstreamModels.find(u => u.id === upstreamId);
    if (existing && !same(existing, upstream)) throw new Error(`UPSTREAM_COLLISION:${upstreamId}`);
    if (!existing) { config.upstreamModels.push(upstream); additions.upstreamModels.push(upstreamId); }
    const publicIds = item.destination === "existing" ? original.publicModels.filter(p => p.modality === item.modality && (p.label === item.family || item.publicIds?.includes(p.id))).map(p => p.id).sort() : [];
    if (item.destination === "existing" && !publicIds.length) throw new Error(`FAMILY_NOT_FOUND:${item.family}`);
    intents.push({ upstreamId, model: item.id, family: item.family, familyGroup: item.familyGroup || item.family, destination: item.destination, publicIds, state: "held", defaultRole: item.destination === "existing" ? "standby" : "new-family", gates: ["apib-wire-confirmation", "documented-parameters", "price-and-billing-review", "paid-batch-approval", "exact-model-output-acceptance", ...(item.modality === "image" ? ["async-family-adapter-blue-green"] : ["video-wire-profile-verification"]), "three-lock-cas-publication"], documentation: item.documentation, documentationScope: item.documentation ? "related-apimart-docs-not-apib-runtime-proof" : "catalog-only-no-documentation" });
    observations.push({ modelId: item.id, familyCandidate: item.family, modality: item.modality, catalog: { source: catalog.source, checkedAt: catalog.checkedAt }, parameterMetadata: { onboarding: { state: "held", relatedDocumentation: item.documentation, protocolConfirmed: false } }, capabilityState: "unknown", prices: [] });
  }
  // The complete old configuration must remain untouched, including disabled routes and billing/business fields.
  for (const [key, value] of Object.entries(original)) {
    if (["providers", "upstreamModels"].includes(key)) {
      for (const row of value) if (!same(row, config[key].find(x => x.id === row.id))) throw new Error(`ORIGINAL_CHANGED:${key}:${row.id}`);
    } else if (!same(value, config[key])) throw new Error(`ORIGINAL_CHANGED:${key}`);
  }
  return { state: "OFFLINE_DISABLED_CANDIDATE", basedOnVersion: expectedVersion, basedOnDigest: expectedDigest, config, additions, intents, observations,
    summary: { selectedImageModels: manifest.models.filter(m => m.modality === "image").length, selectedVideoModels: manifest.models.filter(m => m.modality === "video").length, generationCalls: 0, productionWrites: 0, newlyEnabledModels: 0, credentialWrites: 0 } };
}
