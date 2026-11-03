import smokePresets from "./video-family-presets.json";
import documentedV2 from "./video-family-capabilities.json";
import documentedV3 from "./video-family-multimodal.json";
import type { VideoModelDefinition, VideoWireProfile } from "../video/capability-schema";
import { ModelConfigError, type ModelConfig, type UpstreamModel } from "./types";

// Entries are document-verified by the caller, not discovered or published here.
export type VideoFamilyCapabilityUpgradeEntry = {
  providerId: string;
  model: string;
  publicId: string;
  definition: VideoModelDefinition;
  profile: VideoWireProfile;
};

type Identity = { publicId: string; upstreamId: string; providerId: string; model: string };
export type VideoFamilyCapabilityUpgradePatch = Identity & (
  | { field: "capabilities.video"; before: VideoModelDefinition; after: VideoModelDefinition }
  | { field: "capabilities.maxReferenceImages"; before: number; after: number }
  | { field: "parameterMap.videoProfile"; before: VideoWireProfile; after: VideoWireProfile }
);
type Field = VideoFamilyCapabilityUpgradePatch["field"];
type Missing = Pick<Identity, "publicId" | "providerId" | "model"> & {
  reason: "PUBLIC_MODEL_MISSING" | "UPSTREAM_MISSING" | "PROVIDER_MISSING";
};

function conflict(publicId: string, field: string, detail: string): never {
  throw new ModelConfigError(
    "VIDEO_FAMILY_CAPABILITY_UPGRADE_CONFLICT",
    `${publicId}: ${field}: ${detail}`,
    409,
    [field],
  );
}

// JSON object key order is not an administrator edit; array order and explicit
// null/false/zero/undefined remain distinct. No normalization or schema defaults.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return "{" + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",") + "}";
  }
  return JSON.stringify(value) ?? "undefined";
}
function same(a: unknown, b: unknown) { return canonical(a) === canonical(b); }
function read(row: UpstreamModel, field: Field): unknown {
  switch (field) {
    case "capabilities.video": return row.capabilities.video;
    case "capabilities.maxReferenceImages": return row.capabilities.maxReferenceImages;
    case "parameterMap.videoProfile": return row.parameterMap.videoProfile;
  }
}
function write(row: UpstreamModel, patch: VideoFamilyCapabilityUpgradePatch, side: "before" | "after") {
  switch (patch.field) {
    case "capabilities.video": row.capabilities.video = structuredClone(patch[side]); break;
    case "capabilities.maxReferenceImages": row.capabilities.maxReferenceImages = patch[side]; break;
    case "parameterMap.videoProfile": row.parameterMap.videoProfile = patch[side]; break;
  }
}

export function makeVideoFamilyCapabilityUpgradePlan(
  source: ModelConfig,
  entries: readonly VideoFamilyCapabilityUpgradeEntry[],
) {
  const config = structuredClone(source);
  const patches: VideoFamilyCapabilityUpgradePatch[] = [];
  const missing: Missing[] = [];
  const skipped: Array<{ publicId: string; reason: "VIDEO_EDITING_REQUIRES_SEPARATE_ACCEPTANCE" }> = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.publicId)) conflict(entry.publicId, "entries", "升级条目重复");
    seen.add(entry.publicId);
    // Identity is anchored in immutable smoke; eligible field values may also
    // match immutable v2. Never derive either baseline from the current installer.
    const smoke = smokePresets.items.find(item => item.publicId === entry.publicId);
    if (!smoke || smoke.providerId !== entry.providerId || smoke.model !== entry.model) {
      conflict(entry.publicId, "entries", "条目不匹配原 smoke 的 providerId/model");
    }
    if (entry.providerId === "apib-video" && entry.model === "wan2.7-videoedit") {
      skipped.push({ publicId: entry.publicId, reason: "VIDEO_EDITING_REQUIRES_SEPARATE_ACCEPTANCE" });
      continue;
    }

    const publics = config.publicModels.filter(row => row.id === entry.publicId);
    if (publics.length > 1) conflict(entry.publicId, "publicModels", "公开编号重复");
    const publicModel = publics[0];
    const identity = { publicId: entry.publicId, providerId: entry.providerId, model: entry.model };
    if (!publicModel) { missing.push({ ...identity, reason: "PUBLIC_MODEL_MISSING" }); continue; }
    if (publicModel.modality !== "video" || publicModel.target.type !== "upstream") {
      conflict(entry.publicId, "publicModels.target", "既有目标不是直接视频上游");
    }
    const targets = config.upstreamModels.filter(row => row.id === publicModel.target.id);
    if (targets.length > 1) conflict(entry.publicId, "upstreamModels", "目标上游编号重复");
    const row = targets[0];
    if (!row) { missing.push({ ...identity, reason: "UPSTREAM_MISSING" }); continue; }
    if (row.modality !== "video" || row.providerId !== entry.providerId || row.model !== entry.model) {
      conflict(entry.publicId, `upstreamModels.${row.id}`, "既有目标的 modality/providerId/model 不匹配");
    }
    const providers = config.providers.filter(provider => provider.id === entry.providerId);
    if (providers.length > 1) conflict(entry.publicId, "providers", "供应商编号重复");
    if (!providers.length) { missing.push({ ...identity, reason: "PROVIDER_MISSING" }); continue; }

    const patchIdentity = { ...identity, upstreamId: row.id };
    const priorDocumented = documentedV2.items.find(item => item.publicId === entry.publicId && item.providerId === entry.providerId && item.model === entry.model);
    const priorMultimodal = documentedV3.items.find(item => item.publicId === entry.publicId && item.providerId === entry.providerId && item.model === entry.model);
    const candidates: VideoFamilyCapabilityUpgradePatch[] = [
      { ...patchIdentity, field: "capabilities.video", before: structuredClone(smoke.definition) as VideoModelDefinition, after: structuredClone(entry.definition) },
      { ...patchIdentity, field: "capabilities.maxReferenceImages", before: smoke.definition.limits?.images ?? 0, after: entry.definition.limits?.images ?? 0 },
      { ...patchIdentity, field: "parameterMap.videoProfile", before: smoke.profile as VideoWireProfile, after: entry.profile },
    ];
    for (const patch of candidates) {
      const current = read(row, patch.field);
      if (same(current, patch.after)) continue;
      const previousValue = patch.field === "capabilities.video" ? priorDocumented?.definition
        : patch.field === "capabilities.maxReferenceImages" ? priorDocumented?.definition.limits?.images
        : priorDocumented?.profile;
      const multimodalValue = patch.field === "capabilities.video" ? priorMultimodal?.definition
        : patch.field === "capabilities.maxReferenceImages" ? priorMultimodal?.definition.limits?.images : priorMultimodal?.profile;
      if (!same(current, patch.before) && !(priorDocumented && same(current, previousValue)) && !(priorMultimodal && same(current,multimodalValue))) {
        conflict(entry.publicId, `upstreamModels.${row.id}.${patch.field}`, "管理员已改动此字段，不匹配原始或已发布版本");
      }
      // Remember the actual starting field (smoke or the immutable v2 release),
      // not a synthetic smoke value: rollback must restore this installation.
      const actualPatch = {...patch,before:structuredClone(current)} as VideoFamilyCapabilityUpgradePatch;
      write(row, actualPatch, "after");
      patches.push(actualPatch);
    }
  }
  return { config, patches, missing, skipped };
}

export type VideoFamilyCapabilityUpgradePlan = ReturnType<typeof makeVideoFamilyCapabilityUpgradePlan>;

export function rollbackVideoFamilyCapabilityUpgradePlan(
  current: ModelConfig,
  plan: Pick<VideoFamilyCapabilityUpgradePlan, "patches">,
): ModelConfig {
  const config = structuredClone(current);
  for (const patch of [...plan.patches].reverse()) {
    const targets = config.upstreamModels.filter(row => row.id === patch.upstreamId);
    const row = targets[0];
    if (targets.length !== 1 || row.providerId !== patch.providerId || row.model !== patch.model || row.modality !== "video") {
      conflict(patch.publicId, `upstreamModels.${patch.upstreamId}`, "回退目标缺失或身份已改变");
    }
    if (!same(read(row, patch.field), patch.after)) {
      conflict(patch.publicId, `upstreamModels.${row.id}.${patch.field}`, "本轮字段在升级后又有修改，回退冲突");
    }
    // Restore only the actual write set, not a whole row or a whole config.
    write(row, patch, "before");
  }
  return config;
}
