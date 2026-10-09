import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CANVAS_RATIO_OPTIONS, CANVAS_RESOLUTIONS, CANVAS_QUALITIES, normalizeCanvasRatio, normalizeCanvasResolution, normalizeCanvasCount, normalizeCanvasQuality, canvasModelParameters, canvasCombinationSupported, validateCanvasParameters, canvasParameterError } from "../src/lib/canvas/generation-parameters";

async function main() {
  const root = path.resolve(process.argv[2] || ".");
  const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
  const client = read("src/components/canvas/canvas-client.tsx");
  if (process.argv.includes("--baseline")) {
    assert.match(read("src/lib/mock-data.ts"), /id: "5K"/);
    assert.match(client, /id: "21:9"/);
    assert.match(client, /fd.append\("targetWidth"/);
    assert.match(client, /const MAX_GENERATION_COUNT = 8/);
    assert.doesNotMatch(read("src/app/api/generate-image/route.ts"), /canvasParameterError/);
    console.log("BASELINE=PASS REPRODUCED=5K_21:9_CUSTOM_PIXELS_COUNT8 NO_CANVAS_GUARD=1");
    return;
  }
  assert.deepEqual(CANVAS_RATIO_OPTIONS.map(r => r.id), ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"]);
  assert.deepEqual(CANVAS_RESOLUTIONS, ["1K", "2K", "4K"]);
  assert.deepEqual(CANVAS_QUALITIES, ["low", "medium", "high"]);
  for (const ratio of CANVAS_RATIO_OPTIONS) for (const resolution of CANVAS_RESOLUTIONS) for (const q of ["low", "medium", "high"]) for (const count of [1, 2, 3, 4]) {
    assert.equal(validateCanvasParameters({ ratio: ratio.id, resolution, quality: q, count }), null);
  }
  for (const ratio of ["21:9", "4:5", "5:4", "900:900", "1920:1080", "bad"]) {
    assert.equal(normalizeCanvasRatio(ratio), "auto");
    assert.ok(validateCanvasParameters({ ratio }));
  }
  assert.equal(normalizeCanvasResolution("5K"), "4K");
  assert.equal(normalizeCanvasCount(8), 4);
  assert.equal(normalizeCanvasCount(NaN), 1);
  assert.equal(normalizeCanvasQuality("max"), "high");
  assert.equal(normalizeCanvasQuality("xhigh"), "high");
  const legacy = Object.freeze({ ratio: "900:1200", resolution: "5K", count: 8, quality: "max", width: 900, height: 1200 });
  const submission = { ratio: normalizeCanvasRatio(legacy.ratio), resolution: normalizeCanvasResolution(legacy.resolution), count: normalizeCanvasCount(legacy.count), quality: normalizeCanvasQuality(legacy.quality) };
  assert.equal(validateCanvasParameters(submission), null);
  assert.equal(legacy.ratio, "900:1200"); assert.equal(legacy.resolution, "5K");
  const declared = { ratios: ["1:1", "16:9", "21:9"], resolutions: ["1K", "2K", "5K"], combinations: ["1K:1:1", "2K:16:9"] };
  const options = canvasModelParameters(declared);
  assert.deepEqual(options.ratios, ["auto", "1:1", "16:9"]); assert.deepEqual(options.resolutions, ["1K", "2K"]);
  assert.equal(canvasCombinationSupported(options, "auto", "1K"), true);
  assert.equal(canvasCombinationSupported(options, "16:9", "1K"), false);
  const invalid = [{ resolution: "5K" }, { ratio: "21:9" }, { ratio: "900:900" }, { targetWidth: "900", targetHeight: "900" }, { targetWidth: "0" }, { count: 5 }, { count: 8 }, { count: "1.2" }, { quality: "max" }];
  const routes = ["/api/generate-image", "/api/canvas/expand", "/api/canvas/text-edit", "/api/canvas/annotate", "/api/canvas/image-tasks"];
  for (const route of routes) {
    assert.match(read(`src/app${route}/route.ts`), /const invalid = await canvasParameterError\(request\); if \(invalid\) return invalid; return withBilling/);
    for (const data of invalid) for (const multipart of [false, true]) {
      const body = { origin: "canvas", prompt: "contract test, never call provider", ...data };
      const form = new FormData(); for (const [k, v] of Object.entries(body)) form.set(k, String(v));
      const request = new Request(`http://fixture.test${route}`, { method: "POST", ...(multipart ? { body: form } : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
      const response = await canvasParameterError(request);
      assert.equal(response?.status, 400); assert.equal((await response!.json()).code, "CANVAS_PARAMETER_UNSUPPORTED");
    }
  }
  const duplicate = new FormData(); duplicate.append("origin", "canvas"); duplicate.append("ratio", "21:9"); duplicate.append("ratio", "1:1");
  assert.equal((await canvasParameterError(new Request("http://fixture.test/api/generate-image", {method:"POST",body:duplicate})))?.status,400);
  // Actual route exports reject invalid raw requests before DB, receipts or suppliers.
  const actual = await Promise.all([
    import("../src/app/api/generate-image/route"), import("../src/app/api/canvas/expand/route"),
    import("../src/app/api/canvas/text-edit/route"), import("../src/app/api/canvas/annotate/route"), import("../src/app/api/canvas/image-tasks/route"),
  ]);
  for (let i = 0; i < actual.length; i++) {
    const response = await actual[i].POST(new Request(`http://fixture.test${routes[i]}`, { method: "POST", headers: { "content-type": "application/json", "x-naumi-billing-operation-id": "must-not-create-receipt" }, body: JSON.stringify({ origin: "canvas", prompt: "invalid contract", resolution: "5K" }) }));
    assert.equal(response.status, 400); assert.equal((await response.json()).code, "CANVAS_PARAMETER_UNSUPPORTED");
  }
  assert.equal(await canvasParameterError(new Request("http://fixture.test/api/generate-image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workerJobId: "frozen-history" }) })), null);
  assert.equal(await canvasParameterError(new Request("http://fixture.test/api/generate-image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ origin: "toolbox", resolution: "5K" }) })), null);
  assert.doesNotMatch(client, /customDimensionsForRatio|setCustomWidth|setCustomHeight|targetWidth", String|5K\)/);
  assert.match(client, /body.resolution = normalizeCanvasResolution/); assert.match(client, /body.ratio = normalizeCanvasRatio/);
  assert.match(client, /body.quality = normalizeCanvasQuality/); assert.match(client, /ratio: selected.ratio \|\| genRatio/); // routes through runGen/central boundary
  assert.match(client, /const requestedRatio = normalizeCanvasRatio/g);
  assert.match(read("src/lib/model-config/requests.ts"), /canvasRequest && presetParams/);
  console.log("MODIFIED=PASS ENUM_COMBINATIONS=288 RAW_JSON_MULTIPART_REJECTIONS=90 ACTUAL_ROUTES=5 LEGACY_REDO_BATCH=NORMALIZED QUALITY_QUOTE_EXECUTION=CONSISTENT FROZEN_HISTORY=UNCHANGED PROVIDER_CALLS=0");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
