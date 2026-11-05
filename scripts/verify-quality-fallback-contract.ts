/**
 * Offline behavioral check for the quality-fallback rework in
 * src/lib/model-config/image-quality-selection.ts. Execute the actual shared rule:
 * no DB, no HTTP, no suppliers. Asserts the three contract cases.
 */
import {selectImageQuality} from "../src/lib/model-config/image-quality-selection";
import {fixtureModelConfig} from "./model-config-unit-fixture";

export type QualityCase = {
  explicitQuality: string;
  qualities: string[];
  expectedRequested: string;
  expectedFallbackReason: string | null;
};

export function computeRequestedQuality(explicitQuality:string,qualities:string[],environmentQuality="medium"){
  const config=fixtureModelConfig("http://127.0.0.1:1","00000000-0000-4000-8000-000000000001");
  config.upstreamModels[0].capabilities.qualities=qualities as typeof config.upstreamModels[number]["capabilities"]["qualities"];
  const decision=selectImageQuality(config,"canvas.image","image-a",explicitQuality,undefined,environmentQuality);
  return {requestedQuality:decision.quality,qualityFallbackReason:decision.reason};
}

const CASES: QualityCase[] = [
  // The live incident: canvas sent the display label "standard".
  { explicitQuality: "standard", qualities: ["low", "medium", "high", "xhigh", "max"], expectedRequested: "medium", expectedFallbackReason: "malformed-quality-value" },
  // A real tier the configured model does not offer (jimeng lacks "low").
  { explicitQuality: "low", qualities: ["medium", "high"], expectedRequested: "medium", expectedFallbackReason: "channel-unsupported" },
  // Normal explicit tier passes through untouched.
  { explicitQuality: "high", qualities: ["low", "medium", "high", "xhigh", "max"], expectedRequested: "high", expectedFallbackReason: null },
  // Absent quality keeps the default-selection behavior.
  { explicitQuality: "", qualities: ["medium", "high"], expectedRequested: "medium", expectedFallbackReason: null },
  // Malformed value on a model whose first tier is not medium still lands on that model's default.
  { explicitQuality: "标准", qualities: ["medium", "high"], expectedRequested: "medium", expectedFallbackReason: "malformed-quality-value" },
];

let failed = 0;
for (const c of CASES) {
  const got = computeRequestedQuality(c.explicitQuality, c.qualities);
  const ok = got.requestedQuality === c.expectedRequested && got.qualityFallbackReason === c.expectedFallbackReason;
  if (!ok) failed++;
  console.log(ok ? "PASS" : "FAIL", JSON.stringify({ in: c.explicitQuality, qualities: c.qualities, want: [c.expectedRequested, c.expectedFallbackReason], got: [got.requestedQuality, got.qualityFallbackReason] }));
}
console.log(failed === 0 ? "QUALITY_FALLBACK_CONTRACT=PASS" : "QUALITY_FALLBACK_CONTRACT=FAIL", `cases=${CASES.length} failed=${failed}`);
if (failed) process.exit(1);
