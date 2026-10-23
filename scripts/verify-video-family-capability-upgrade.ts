import assert from "node:assert/strict";
import smokePresets from "../src/lib/model-config/video-family-presets.json";
import { fixtureModelConfig } from "./model-config-unit-fixture";
import { ModelConfigError, type ModelConfig, type UpstreamModel } from "../src/lib/model-config/types";
import { resolveVideoCapability } from "../src/lib/video/contract";
import type { VideoModelDefinition, VideoWireProfile } from "../src/lib/video/capability-schema";
import {
  makeVideoFamilyCapabilityUpgradePlan,
  rollbackVideoFamilyCapabilityUpgradePlan,
  type VideoFamilyCapabilityUpgradeEntry,
} from "../src/lib/model-config/video-family-capability-upgrade";

// Synthetic old installation built DIRECTLY from the immutable smoke items.
// Do not use makeVideoFamilyPlan: its new installs intentionally use new data.
function baseline(): ModelConfig {
  const config = fixtureModelConfig("https://fixture.invalid/v1", "11111111-1111-4111-8111-111111111111");
  for (const providerId of new Set(smokePresets.items.map(item => item.providerId))) {
    config.providers.push({ id: providerId, name: providerId, protocol: providerId === "apib-video" ? "apimart" : providerId === "geeknow-video-h3" ? "minimax" : "openai-videos", baseUrl: "https://video.fixture.invalid/v1", enabled: true, credentialRef: "22222222-2222-4222-8222-222222222222", timeoutMs: 90000, maxConcurrent: 2 });
  }
  smokePresets.items.forEach((item, index) => {
    const id = `existing-video-${index}`;
    const enabled = item.model !== "wan2.7-videoedit";
    const row: UpstreamModel = {
      id, providerId: item.providerId, model: item.model, label: `Existing ${index}`, modality: "video", enabled,
      capabilities: { verified: enabled, generate: enabled, edit: false, vision: false, transparent: false, preserveIdentity: false, textAccuracy: false, qualityRank: 1, qualities: [], nativeResolutions: [], maxReferenceImages: item.definition.limits?.images ?? 0, expectedLatencyMs: 45000, video: structuredClone(item.definition) as VideoModelDefinition },
      parameterMap: { videoProfile: item.profile as VideoWireProfile, version: "preserved-version" },
      costRef: "preserved-cost", procurement: { currency: "CNY", source: "Fixture administrator", updatedAt: "2026-10-23T00:00:00.000Z", basis: "task", amountMicros: "123456" },
    };
    config.upstreamModels.push(row);
    config.publicModels.push({ id: item.publicId, label: item.label, modality: "video", enabled, visible: enabled, target: { type: "upstream", id }, toolScope: { features: enabled ? ["video.generate"] : [], defaultFor: [] } });
  });
  config.bindings["video.generate"] = smokePresets.defaultPublicModelId;
  config.business = { "video.generate": { enabled: true, defaultModelId: smokePresets.defaultPublicModelId, options: [{ modelId: smokePresets.defaultPublicModelId, enabled: true, sort: 0, unit: "task", pricing: { mode: "cny-fixed", amountMicros: "987654", creditsPerCnyMicros: "10000000", rounding: "ceil" } }] } };
  config.fixedMonthlyCosts = [{ id: "existing-host", name: "Existing host", amountCnyMicros: "1000000", enabled: true }];
  return config;
}
const entries: VideoFamilyCapabilityUpgradeEntry[] = smokePresets.items.map(item => ({
  publicId: item.publicId, providerId: item.providerId, model: item.model,
  // Existing legal profiles exercise the generic planner independently of the
  // parent's v2 schema/protocol work. These are TEST declarations, not evidence.
  profile: item.providerId === "apib-video" ? "apimart-generic" : item.providerId === "geeknow-video-h3" ? "minimax" : "openai-videos",
  definition: { ...structuredClone(item.definition) as VideoModelDefinition, modes: ["text", "single_image", "reference"], durationResolutionMap: [{ durations: [2, 4, 6], resolutions: ["480p", "720p", "1080p"] }], aspectRatios: ["16:9", "9:16", "1:1"], defaultDurationSeconds: 4, defaultResolution: "720p", defaultAspectRatio: "16:9", limits: { images: 3, videos: 0, audios: 0 } },
}));
let assertions = 0;
function equal(actual: unknown, expected: unknown, message: string) { assert.deepEqual(actual, expected, message); assertions++; }
function conflict(run: () => unknown, field: string, message: string) {
  assert.throws(run, error => error instanceof ModelConfigError && error.code === "VIDEO_FAMILY_CAPABILITY_UPGRADE_CONFLICT" && error.status === 409 && error.fields.some(value => value.includes(field)) && error.message.includes(field), message);
  assertions++;
}
function target(config: ModelConfig, publicId = entries[0].publicId) {
  const publicModel = config.publicModels.find(row => row.id === publicId)!;
  return config.upstreamModels.find(row => row.id === publicModel.target.id)!;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); for (const item of Object.values(value)) freeze(item); }
  return value;
}

const source = baseline(), original = structuredClone(source), oldEntries = structuredClone(entries);
equal(smokePresets.items.length, 33, "Immutable baseline has 33 smoke rows");
equal(target(source).capabilities.video, smokePresets.items[0].definition, "Baseline uses old smoke, not the evolving installer");
console.log("BASELINE PASS oldSmoke=33 source=immutable-preset-items");
const plan = makeVideoFamilyCapabilityUpgradePlan(freeze(source), freeze(entries));
equal(source, original, "Frozen source is not mutated");
equal(entries, oldEntries, "Frozen entry definitions are not mutated");
equal(plan.missing, [], "All installed public targets are present");
equal(plan.skipped, [{ publicId: "video-apib-wan2-7-videoedit", reason: "VIDEO_EDITING_REQUIRES_SEPARATE_ACCEPTANCE" }], "Special editing path remains excluded");
equal(new Set(plan.patches.map(patch => patch.upstreamId)).size, 32, "Exactly 32 ordinary installed targets change");
equal(plan.patches.length, 95, "Only changed fields generate patches (minimax profile is already final)");
equal(new Set(plan.patches.map(patch => patch.field)), new Set(["capabilities.video", "capabilities.maxReferenceImages", "parameterMap.videoProfile"]), "Patch write set has exactly three allowed paths");
const stripped = structuredClone(plan.config);
for (const row of stripped.upstreamModels) {
  const before = original.upstreamModels.find(item => item.id === row.id)!;
  if (before.capabilities.video === undefined) delete row.capabilities.video;
  else row.capabilities.video = structuredClone(before.capabilities.video);
  row.capabilities.maxReferenceImages = before.capabilities.maxReferenceImages;
  if (before.parameterMap.videoProfile === undefined) delete row.parameterMap.videoProfile;
  else row.parameterMap.videoProfile = before.parameterMap.videoProfile;
}
equal(stripped, original, "Every non-target field, provider, credential, price, binding and public row is byte-value preserved");
equal(target(plan.config).id, "existing-video-0", "Existing arbitrary upstream ID is retained");
equal(target(plan.config, "video-apib-wan2-7-videoedit"), target(original, "video-apib-wan2-7-videoedit"), "Excluded editing row is entirely unchanged");
const again = makeVideoFamilyCapabilityUpgradePlan(plan.config, entries);
equal(again.config, plan.config, "Repeated upgrade is idempotent");
equal(again.patches, [], "Already-target fields emit no patches");
equal(makeVideoFamilyCapabilityUpgradePlan(original, []).config, original, "Empty entries are a no-op");

const partial = structuredClone(original);
target(partial).capabilities.video = structuredClone(entries[0].definition);
target(partial).capabilities.maxReferenceImages = 3;
const partialPlan = makeVideoFamilyCapabilityUpgradePlan(partial, [entries[0]]);
equal(partialPlan.patches.map(patch => patch.field), ["parameterMap.videoProfile"], "Mixed smoke and already-target fields upgrade independently");
const reordered = structuredClone(original);
target(reordered).capabilities.video = Object.fromEntries(Object.entries(target(reordered).capabilities.video!).reverse()) as VideoModelDefinition;
equal(makeVideoFamilyCapabilityUpgradePlan(reordered, [entries[0]]).patches.length, 3, "JSON key ordering does not create a false admin conflict");

for (const [field, edit] of [
  ["capabilities.video", (row: UpstreamModel) => { row.capabilities.video!.audio = "required"; }],
  ["capabilities.maxReferenceImages", (row: UpstreamModel) => { row.capabilities.maxReferenceImages = 17; }],
  ["parameterMap.videoProfile", (row: UpstreamModel) => { row.parameterMap.videoProfile = "apimart-kling"; }],
  ["capabilities.video", (row: UpstreamModel) => { delete row.capabilities.video; }],
  ["parameterMap.videoProfile", (row: UpstreamModel) => { delete row.parameterMap.videoProfile; }],
] as const) {
  const changed = structuredClone(original); edit(target(changed)); const before = structuredClone(changed);
  conflict(() => makeVideoFamilyCapabilityUpgradePlan(changed, [entries[0]]), field, `Admin change conflicts: ${field}`);
  equal(changed, before, "Conflict does not mutate source");
}
for (const [reason, edit] of [
  ["PUBLIC_MODEL_MISSING", (config: ModelConfig) => { config.publicModels = config.publicModels.filter(row => row.id !== entries[0].publicId); }],
  ["UPSTREAM_MISSING", (config: ModelConfig) => { config.upstreamModels = config.upstreamModels.filter(row => row.id !== target(config).id); }],
  ["PROVIDER_MISSING", (config: ModelConfig) => { config.providers = config.providers.filter(row => row.id !== entries[0].providerId); }],
] as const) {
  const absent = structuredClone(original); edit(absent);
  const result = makeVideoFamilyCapabilityUpgradePlan(absent, [entries[0]]);
  equal(result.missing.map(row => row.reason), [reason], `${reason} is reported, not created`);
  equal(result.patches, [], "Missing targets emit no patches");
  equal(result.config, absent, "Missing entities are not synthesized");
}
const misdirected = structuredClone(original);
misdirected.publicModels.find(row => row.id === entries[0].publicId)!.target = { type: "upstream", id: target(misdirected, entries[1].publicId).id };
conflict(() => makeVideoFamilyCapabilityUpgradePlan(misdirected, [entries[0]]), "upstreamModels", "Existing public target identity wins over a matching row elsewhere");
const wrongType = structuredClone(original);
wrongType.publicModels.find(row => row.id === entries[0].publicId)!.target = { type: "pool", id: "not-a-direct-upstream" };
conflict(() => makeVideoFamilyCapabilityUpgradePlan(wrongType, [entries[0]]), "publicModels.target", "Pooled target is not rewritten");
conflict(() => makeVideoFamilyCapabilityUpgradePlan(original, [{ ...entries[0], providerId: "other-provider" }]), "entries", "Entry identity must match old smoke");
conflict(() => makeVideoFamilyCapabilityUpgradePlan(original, [{ ...entries[0], publicId: "not-in-old-smoke" }]), "entries", "Unknown entries have no upgrade baseline");
conflict(() => makeVideoFamilyCapabilityUpgradePlan(original, [entries[0], entries[0]]), "entries", "Duplicate entries conflict");

const disabled = structuredClone(original);
target(disabled).enabled = false; target(disabled).capabilities.generate = false;
disabled.providers.find(row => row.id === entries[0].providerId)!.enabled = false;
const hidden = disabled.publicModels.find(row => row.id === entries[0].publicId)!; hidden.enabled = false; hidden.visible = false;
const disabledPlan = makeVideoFamilyCapabilityUpgradePlan(disabled, [entries[0]]);
equal(target(disabledPlan.config).enabled, false, "Disabled ordinary target is not enabled");
equal(target(disabledPlan.config).capabilities.generate, false, "Generation gate stays disabled");
equal(disabledPlan.config.providers, disabled.providers, "Provider enablement and credential remain untouched");
equal(disabledPlan.config.publicModels, disabled.publicModels, "Visibility, tool scopes and public enablement remain untouched");
const decoy = structuredClone(original);
decoy.upstreamModels.unshift({ ...structuredClone(target(decoy)), id: "same-provider-model-decoy", label: "Do not choose by provider/model" });
const decoyPlan = makeVideoFamilyCapabilityUpgradePlan(decoy, [entries[0]]);
equal(decoyPlan.config.upstreamModels[0], decoy.upstreamModels[0], "An unbound matching provider/model row is not touched");
equal(decoyPlan.patches.map(patch => patch.upstreamId), ["existing-video-0", "existing-video-0", "existing-video-0"], "Stable public target selects the exact upstream");
const resolved = resolveVideoCapability({ manual: target(plan.config).capabilities.video, vendor: { modes: ["text"], audio: "required" } });
equal(resolved.sources.modes, "admin", "Published manual capabilities retain existing source precedence");
equal(resolved.modes, entries[0].definition.modes, "Vendor smoke cannot mask upgraded administrator definition");
equal(resolved.audio, entries[0].definition.audio, "Explicit manual null is not vendor fallback");
equal(resolved.sources.audio, "admin", "Explicit null retains administrator provenance");
const detached = structuredClone(plan);
target(detached.config).capabilities.video!.modes!.push("extend");
equal(detached.patches.find(patch => patch.field === "capabilities.video")!.after, entries[0].definition, "Config and patch values do not alias each other");
console.log(`MODIFIED PASS upgradedTargets=32 patches=${plan.patches.length} idempotent=true missing=reported disabled=preserved`);

const restored = rollbackVideoFamilyCapabilityUpgradePlan(freeze(structuredClone(plan.config)), freeze(structuredClone(plan)));
equal(restored, original, "Rollback restores the complete original fixture");
const colleague = structuredClone(plan.config), expected = structuredClone(original);
for (const config of [colleague, expected]) {
  target(config).label = "Colleague renamed"; target(config).costRef = "new-cost-reference";
  target(config).procurement!.amountMicros = "999999";
  target(config).capabilities.expectedLatencyMs = 12345;
  target(config).parameterMap.version = "colleague-version";
  config.publicModels.find(row => row.id === entries[0].publicId)!.label = "Colleague public label";
  config.business!["video.generate"]!.options[0].pricing = { mode: "cny-fixed", amountMicros: "7654321", creditsPerCnyMicros: "10000000", rounding: "ceil" };
}
const colleagueBefore = structuredClone(colleague);
equal(rollbackVideoFamilyCapabilityUpgradePlan(colleague, plan), expected, "Rollback preserves colleague labels/prices/procurement/mapping/other capability fields");
equal(colleague, colleagueBefore, "Rollback does not mutate input");
const partialAfter = structuredClone(partialPlan.config); target(partialAfter).capabilities.video!.audio = "optional";
const partialRollback = rollbackVideoFamilyCapabilityUpgradePlan(partialAfter, partialPlan);
equal(target(partialRollback).capabilities.video!.audio, "optional", "Rollback ignores target fields it did not change this round");
equal(target(partialRollback).parameterMap.videoProfile, target(partial).parameterMap.videoProfile, "Partial rollback restores only its profile patch");
for (const [field, edit] of [
  ["capabilities.video", (row: UpstreamModel) => { row.capabilities.video!.defaultDurationSeconds = 6; }],
  ["capabilities.maxReferenceImages", (row: UpstreamModel) => { row.capabilities.maxReferenceImages = 5; }],
  ["parameterMap.videoProfile", (row: UpstreamModel) => { row.parameterMap.videoProfile = "apimart-kling"; }],
] as const) {
  const changed = structuredClone(plan.config); edit(target(changed)); const before = structuredClone(changed);
  conflict(() => rollbackVideoFamilyCapabilityUpgradePlan(changed, plan), field, `Changed-after field blocks rollback: ${field}`);
  equal(changed, before, "Failed rollback leaves input unchanged atomically");
}
const identityChanged = structuredClone(plan.config); target(identityChanged).providerId = "other-provider";
conflict(() => rollbackVideoFamilyCapabilityUpgradePlan(identityChanged, plan), "upstreamModels", "Rollback rejects retargeted upstream identity");
const deleted = structuredClone(plan.config); deleted.upstreamModels = deleted.upstreamModels.filter(row => row.id !== "existing-video-0");
conflict(() => rollbackVideoFamilyCapabilityUpgradePlan(deleted, plan), "upstreamModels", "Rollback rejects missing upstream");
equal(rollbackVideoFamilyCapabilityUpgradePlan(original, { patches: [] }), original, "Empty rollback is a no-op");
console.log("ROLLBACK PASS original=restored colleagueFields=preserved changedAfter=conflict sourceMutation=false");
console.log(`VIDEO_FAMILY_CAPABILITY_UPGRADE PASS assertions=${assertions} db=0 network=0 supplier=0`);
