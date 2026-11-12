/** Conventional image parameter contract (docs/design/image-parameter-conventional-contract-20261105.md).
 * Pure compiler/routing/validation checks on the unit fixture; zero network, zero supplier calls.
 * The real-config zero-diff gate is scripts/verify-image-parameter-golden.ts. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixtureModelConfig } from "./model-config-unit-fixture";
import { compileImageParameterPlan, applyImageParameterPlan } from "../src/lib/model-config/image-parameter-plan";
import { policyQuality } from "../src/lib/model-config/quality-policy";
import { mapResolution } from "../src/lib/model-config/resolution-policy";
import { validateModelConfig } from "../src/lib/model-config/schema";
import { simulateModel } from "../src/lib/model-config/simulation";
import { upstreamAcceptsResolution, upstreamResolutionTiers } from "../src/lib/model-config/resolution-fallback";
import { applyImageMappingEditor } from "../src/lib/model-config/image-mapping-editor";
import type { ModelConfig } from "../src/lib/model-config/types";

let checks = 0;
const eq = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
const throws = (fn: () => unknown, pattern: RegExp, label: string) => { assert.throws(fn, (e: any) => pattern.test(String(e?.message)), label); checks++; };
const billing = { version: 1, config: { costs: {} } } as any;
const context = { publicModelId: "image-a", protocol: "openai-images", modelVersion: 7 };

function fixture(mutate?: (config: ModelConfig) => void) {
  const config = fixtureModelConfig("https://fixture.invalid/v1", randomUUID());
  const u = config.upstreamModels[0];
  // Stale supplier data: only medium/high and 1K/2K, verified.
  u.capabilities = { ...u.capabilities, verified: true, qualities: ["medium", "high"], nativeResolutions: ["1K", "2K"], qualityRank: 2 };
  u.parameterMap = {
    qualityPolicy: { mode: "map", choices: [{ id: "low", label: "低" }, { id: "medium", label: "标准", value: "standard" }, { id: "high", label: "高" }] },
    resolutionPolicy: { mode: "map", field: "resolution", ratioField: "aspect_ratio", values: { "4K": "2k" } },
  } as any;
  mutate?.(config);
  return config;
}
const conventional = (config: ModelConfig) => { config.upstreamModels[0].parameterMap.parameterContract = "conventional"; };
const snapshot = (config: ModelConfig) => ({ version: 7, digest: "a".repeat(64), config });
const facts = (quality: string, resolution: string, extra: Record<string, unknown> = {}) => ({ task: "product" as const, quality, resolution, requestedResolution: resolution, ratio: "1:1", needsEdit: false, preserveIdentity: false, needsText: false, nativeResolution: false, references: 0, quantity: 1, ...extra });

// 1. Quality semantics.
const qp = fixture().upstreamModels[0].parameterMap.qualityPolicy!;
eq(policyQuality(qp, "medium", "conventional"), "standard", "filled cell maps");
eq(policyQuality(qp, "high", "conventional"), "high", "empty cell sends the selected tier");
eq(policyQuality(qp, "max", "conventional"), "max", "unlisted tier sends the selected tier");
eq(policyQuality({ ...qp, mode: "omit" }, "high", "conventional"), undefined, "omit still omits");
throws(() => policyQuality({ ...qp, choices: qp.choices.filter(c => c.id !== "max") }, "max"), /未开放此质量档位/, "strict default unchanged");

// 2. Resolution semantics.
const body = { size: "1024x1024", aspect_ratio: "1:1", resolution: "keep" };
eq(mapResolution(structuredClone(body), fixture().upstreamModels[0].parameterMap.resolutionPolicy, "2K", "1:1", "conventional"), body, "empty tier leaves the protocol body untouched");
eq(mapResolution({ size: "1024x1024" }, fixture().upstreamModels[0].parameterMap.resolutionPolicy, "4K", "16:9", "conventional"), { resolution: "2k", aspect_ratio: "16:9" }, "filled tier maps 4K->2k");
throws(() => mapResolution({}, fixture().upstreamModels[0].parameterMap.resolutionPolicy, "2K", "1:1"), /尚未配置该分辨率映射/, "strict default unchanged");

// 3. Compiler.
{
  const strict = fixture().upstreamModels[0];
  throws(() => compileImageParameterPlan(strict, { quality: "high", resolution: "2K", ratio: "1:1" }, context), /未开放|尚未配置/, "strict channel still requires a complete map");
  const conv = fixture(conventional).upstreamModels[0];
  const p1 = compileImageParameterPlan(conv, { quality: "high", resolution: "2K", ratio: "1:1" }, context);
  eq(p1.wire, { quality: "high" }, "empty quality sends tier; empty resolution adds nothing");
  eq(p1.clear.includes("size"), false, "protocol size is not cleared for an empty tier");
  eq(applyImageParameterPlan({ model: "m", size: "1024x1024", quality: "auto" }, p1), { model: "m", size: "1024x1024", quality: "high" }, "applied body keeps protocol size");
  const p2 = compileImageParameterPlan(conv, { quality: "medium", resolution: "4K", ratio: "16:9" }, context);
  eq(p2.wire, { quality: "standard", resolution: "2k", aspect_ratio: "16:9" }, "overrides apply");
  eq(p2.effective, { quality: "standard", resolution: "2K", ratio: "16:9" }, "effective tier recorded");
  const adv = compileImageParameterPlan(conv, { quality: "high", resolution: "1K", ratio: "1:1", advanced: { inputFidelity: "high" } }, context);
  eq(Object.hasOwn(adv.wire, "input_fidelity"), false, "unmapped advanced parameter dropped, not rejected");
  throws(() => compileImageParameterPlan(fixture().upstreamModels[0], { quality: "medium", resolution: "4K", ratio: "1:1", advanced: { inputFidelity: "high" } }, context), /未配置参数映射/, "strict advanced unchanged");
  const clash = fixture(conventional).upstreamModels[0];
  clash.parameterMap.resolutionPolicy = { mode: "map", field: "resolution", ratioField: "resolution", values: { "4K": "2k" } } as any;
  throws(() => compileImageParameterPlan(clash, { quality: "high", resolution: "4K", ratio: "1:1" }, context), /同一字段/, "field conflicts still rejected");
}

// 4. Routing: metadata no longer excludes; structural limits still do.
{
  const strict = fixture(c => { c.upstreamModels[0].parameterMap = {} as any; });
  const strictRun = simulateModel(snapshot(strict), billing, "image-a", facts("low", "4K", { nativeResolution: true, needsText: true }));
  eq(strictRun.eligible.length, 1, "published mappings are not excluded by stale metadata");
  const conv = fixture(c => { c.upstreamModels[0].parameterMap = { parameterContract: "conventional" } as any; });
  const convRun = simulateModel(snapshot(conv), billing, "image-a", facts("low", "4K", { nativeResolution: true, needsText: true }));
  eq(convRun.eligible.map(e => e.upstreamId), ["u1"], "conventional channel eligible despite stale metadata");
  const mask = simulateModel(snapshot(fixture(c => { conventional(c); c.upstreamModels[0].capabilities.edit = false; delete (c.bindings as Record<string, string>)["image.edit"]; })), billing, "image-a", facts("high", "1K", { needsEdit: true, needsMask: true }));
  eq(mask.excluded[0]?.codes.includes("EDIT_UNSUPPORTED") && mask.excluded[0]?.codes.includes("MASK_UNSUPPORTED"), true, "edit/mask still structural");
  const refs = simulateModel(snapshot(fixture(c => { conventional(c); c.upstreamModels[0].capabilities.maxReferenceImages = 1; })), billing, "image-a", facts("high", "1K", { needsEdit: true, references: 3 }));
  eq(refs.excluded[0]?.codes.includes("REFERENCE_LIMIT"), true, "reference limit still structural");
  const convU = fixture(conventional).upstreamModels[0];
  eq(upstreamResolutionTiers(convU, "1:1"), ["1K", "2K", "4K"], "all tiers sendable");
  eq(upstreamAcceptsResolution(convU, "2K", "1:1"), true, "empty 2K tier accepted");
  eq(upstreamAcceptsResolution(fixture().upstreamModels[0], "2K", "1:1"), false, "strict channel keeps declared tiers");
}

// 5. Publication rules.
{
  throws(() => validateModelConfig(fixture()), /每个显示档位需要填写上游值/, "strict incomplete map rejected at publish");
  eq(validateModelConfig(fixture(conventional)).upstreamModels[0].parameterMap.parameterContract, "conventional", "conventional incomplete map publishes");
  throws(() => validateModelConfig(fixture(c => { conventional(c); c.providers[0].options = { imageAdapter: "reverse-hub" } as any; })), /专用适配器/, "dedicated adapters excluded");
  throws(() => validateModelConfig(fixture(c => {
    conventional(c);
    c.pools = [{ id: "pool-a", modality: "image", strategy: "priority", candidates: ["u1"], rules: [] }] as any;
    c.publicModels[0].target = { type: "pool", id: "pool-a" };
  })), /模型池/, "pool candidates excluded");
}

// 6. Mapping editor: set, keep and clear the contract.
{
  const config = fixture(c => { c.upstreamModels[0].parameterMap.qualityPolicy!.choices = c.upstreamModels[0].parameterMap.qualityPolicy!.choices.map(ch => ({ ...ch, value: ch.value || ch.id })); c.upstreamModels[0].parameterMap.resolutionPolicy = { mode: "map", field: "resolution", values: { "1K": "1k", "2K": "2k", "4K": "4k" } } as any; });
  const route = (contract?: "conventional" | null, values: Record<string, string> = { "4K": "2k" }) => ({ upstreamId: "u1", ...(contract === undefined ? {} : { contract }), quality: { mode: "map" as const, choices: [{ id: "medium" as const, label: "标准" }, { id: "high" as const, label: "高", value: "medium" }] }, resolution: { mode: "map" as const, field: "resolution" as const, values } });
  const input = (contract?: "conventional" | null) => ({ qualities: ["medium", "high"] as any, resolutions: ["1K", "2K", "4K"] as any, routes: [route(contract)] });
  throws(() => applyImageMappingEditor(config, ["image-a"], ["u1"], input()), /填写上游值/, "strict editor still requires values");
  const on = applyImageMappingEditor(config, ["image-a"], ["u1"], input("conventional"));
  eq(on.upstreamModels[0].parameterMap.parameterContract, "conventional", "editor sets contract");
  validateModelConfig(on); checks++;
  const kept = applyImageMappingEditor(on, ["image-a"], ["u1"], input());
  eq(kept.upstreamModels[0].parameterMap.parameterContract, "conventional", "omitted contract keeps published value");
  throws(() => applyImageMappingEditor(on, ["image-a"], ["u1"], input(null)), /填写上游值/, "clearing contract restores strict rule");
  const legacyInput = { ...input("conventional"), routes: [{ ...route("conventional"), resolution: null }] };
  const legacy = applyImageMappingEditor(on, ["image-a"], ["u1"], legacyInput as any);
  eq(legacy.upstreamModels[0].parameterMap.resolutionPolicy, undefined, "沿用协议 removes the resolution override");
  validateModelConfig(legacy); checks++;
}

console.log(`IMAGE_PARAMETER_CONTRACT=PASS CHECKS=${checks} QUALITY_EMPTY=TIER RESOLUTION_EMPTY=PROTOCOL METADATA=NON_BLOCKING STRUCTURAL=KEPT STRICT_DEFAULT=UNCHANGED PUBLISH_RULES=ENFORCED SUPPLIER_CALLS=0`);
