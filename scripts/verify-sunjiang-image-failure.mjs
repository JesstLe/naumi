import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
const baseline = process.argv.includes("--baseline"), require = createRequire(import.meta.url);
const routed=existsSync("src/lib/model-config/channel-routing.ts");
const events = [], sources = new Set([routed?"src/lib/model-config/channel-routing.ts":"src/lib/model-config/channel-fetch.ts", "src/lib/model-config/supplier-failure.ts", "src/lib/imagegen/request-size.ts", "src/lib/api-error.ts"].map(f => resolve(f)));
const fixture = globalThis.__sunjiangFixture = { events, calls: 0, receipts: [], index: 0, releases: 0 };
const mocks = {
  "server-only": "",
  "@/platform/db/pool": "exports.getPool=()=>({query:async()=>{throw Error('UNEXPECTED_DB')}});",
  "./apimart-image-policy": "exports.applicationAPIMartImages=()=>false;",
  "./clients": "exports.executionFetch=()=>async()=>{const f=globalThis.__sunjiangFixture;f.calls++;const r=f.receipts.shift();return Response.json(r.body,{status:r.status});};",
  "./channel-scheduler": "exports.claimChannel=async(_p,_id,_pol,targets,visited)=>{const target=targets.find(t=>!visited.has(t.upstreamId));if(!target)throw Error('UNEXPECTED_CLAIM');return {target,release:async()=>{globalThis.__sunjiangFixture.releases++;}};};exports.recordChannelOutcome=async()=>{};",
  "./execution-audit": "exports.beginExecutionStage=async()=>String(++globalThis.__sunjiangFixture.index);exports.finishExecutionStage=async(...args)=>{globalThis.__sunjiangFixture.events.push(args);};",
  "./types": "exports.ModelConfigError=class extends Error {};",
  "../supplier-cost/io": "exports.readBounded=async r=>r.text();",
  "./channel-image-response": "exports.completedChannelImage=async r=>r;",
  "./channel-text-response": "exports.prepareChannelText=async()=>{throw Error('UNEXPECTED_TEXT')};",
  "../image-gateway": "exports.ImageOperationPending=class extends Error {};",
  "./channel-availability": "exports.channelOperationKey=()=>undefined;",
  "./channel-health-policy": "exports.retryAfterMs=()=>undefined;",
};
const entry=(routed?`import {createChannelRoutingFetch} from "./src/lib/model-config/channel-routing";
const execute=()=>async()=>{const f=globalThis.__sunjiangFixture;f.calls++;const r=f.receipts.shift();return Response.json(r.body,{status:r.status});};
export const channelRoutingFetch=(scope,options)=>createChannelRoutingFetch(scope,options,execute);`:'export {channelRoutingFetch} from "./src/lib/model-config/channel-fetch";')+'export * from "./src/lib/imagegen/request-size";export {safeError} from "./src/lib/api-error";';
const bundled = await build({ stdin: { contents: entry, resolveDir: process.cwd() }, bundle: true, platform: "node", format: "cjs", write: false,
  plugins: [{ name: "isolated-channel", setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: "mock" };
      const file = resolve(args.resolveDir, args.path), source = [file, file + ".ts"].find(f => sources.has(f));
      return source ? { path: source } : undefined;
    });
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }],
});
const mod = { exports: {} }; new Function("require", "module", "exports", bundled.outputFiles[0].text)(require, mod, mod.exports);
const { imageRatioMismatch, channelRoutingFetch, safeError } = mod.exports;
const observed = { width: 848, height: 1264, ratio: "53:79" };
const makeTarget = i => ({ upstreamId: "fixture-" + i, scope: { frozen: { modality: "image" }, connection: { baseUrl: "https://fixture.invalid/v1", apiKey: "private-fixture", timeoutMs: 30000, protocol: "openai-images" } } });
async function reject(receipts) {
  fixture.calls = 0; fixture.events.length = 0; fixture.releases = 0; fixture.receipts = structuredClone(receipts);
  const targets = receipts.map((_, i) => makeTarget(i));
  const response = await channelRoutingFetch({ frozen: { modality: "image", publicModelId: "fixture-public" }, connection: { baseUrl: "https://fixture.invalid/v1" }, supplierRouting: { policy: { mode: "priority" }, targets } }, {})("https://fixture.invalid/v1/images/edits", { method: "POST", body: "fixture", headers: { "content-type": "application/json" } });
  const body = await response.json();
  assert.equal(fixture.calls, receipts.length); assert.equal(fixture.releases, receipts.length);
  return { status: response.status, body };
}
const rawSecret = "sensitive-fixture-never-display";
const requestRejected = [{ status: 400, body: { error: { code: "invalid_image", param: "image", message: rawSecret } } }];
const failed = await reject(requestRejected);
if (baseline) {
  assert.match(imageRatioMismatch("2:3", observed), /不一致/);
  assert.equal(failed.body.error.code, "SUPPLIER_CHANNELS_EXHAUSTED");
  assert.equal(fixture.events[0][3], undefined);
  console.log("BASELINE=REPRODUCED NATIVE_848x1264_AS_2:3=FALSE_FAILURE UPSTREAM_400=CAUSE_LOST AUDIT_DIAGNOSIS=ABSENT");
} else {
  const policy = mod.exports.imageRatioValidationPolicy([{ protocol: "openai-images", wireModel: "gemini-3-pro-image-preview" }]);
  assert.equal(imageRatioMismatch("2:3", observed, policy), undefined);
  assert.match(imageRatioMismatch("2:3", observed), /不一致/, "strict default remains exact");
  for (const [ratio, width, height, ok] of [
    ["3:4", 896, 1200, true], ["2:3", 1264, 848, false], ["3:4", 1024, 1536, false],
    ["53:79", 928, 1152, false], ["2:3", 840, 1264, false], ["2:3", 848, 1280, true],
    ["2:3", 864, 1264, false], ["2:3", 24, 48, false], ["2:3", 849, 1264, false],
  ]) assert.equal(imageRatioMismatch(ratio, { width, height }, policy) === undefined, ok);
  for (const connection of [{ protocol: "openai-images", wireModel: "gpt-image-2" }, { protocol: "openai-images", wireModel: "unknown-image" }, { protocol: "openai-images", wireModel: "gemini-custom-image" }, { protocol: "new-api-flow", wireModel: "gemini-3.0-pro-image-portrait" }]) {
    const result = mod.exports.imageRatioValidationPolicy([connection]);
    assert.equal(result?.nativePixelGrid === 16, connection.protocol === "new-api-flow");
  }
  assert.equal(mod.exports.imageRatioValidationPolicy([{ protocol: "openai-images", wireModel: "gemini-3-pro-image-preview" }, { protocol: "openai-images", wireModel: "gpt-image-2" }]), undefined);
  assert.equal(failed.status, 400);
  assert.equal(failed.body.error.code, "IMAGE_INPUT_REJECTED");
  assert.equal(fixture.events[0][3].upstreamFailure.code, "IMAGE_INPUT_REJECTED");
  assert.equal(fixture.events[0][3].upstreamFailure.parameter, "image");
  assert.equal(safeError({ code: failed.body.error.code }), "参考图片未被生成服务接受，请检查图片后重试");
  assert.ok(!JSON.stringify({ failed, events }).includes(rawSecret));
  const codes = [
    [400, { code: "content_policy_violation" }, "IMAGE_CONTENT_REJECTED"],
    [400, { code: "invalid_parameter", param: "size" }, "IMAGE_PARAMETER_REJECTED"],
    [400, { message: rawSecret }, "IMAGE_REQUEST_REJECTED"],
    [403, { message: rawSecret }, "IMAGE_ACCESS_DENIED"],
    [429, { message: rawSecret }, "IMAGE_RATE_LIMITED"],
    [503, { message: rawSecret }, "IMAGE_UPSTREAM_UNAVAILABLE"],
  ];
  for (const [status, error, code] of codes) {
    const result = await reject([{ status, body: { error, ...(status>=500?{billing_status:"not_charged"}:{}) } }]);
    assert.equal(result.body.error.code, code);
    assert.equal(result.status, status);
    assert.ok(!JSON.stringify({ result, events }).includes(rawSecret));
    assert.ok(safeError({ code }) !== "服务繁忙,请稍后重试");
  }
  const fallback = await reject([{ status: 400, body: { error: { code: "invalid_image" },billing_status:"not_charged" } }, { status: 503, body: { error: {}, billing_status:"not_charged" } }]);
  assert.equal(fallback.body.error.code, "IMAGE_UPSTREAM_UNAVAILABLE");
  assert.equal(fixture.calls, 2, "no additional retry/fallback is introduced");
  await assert.rejects(reject([{status:503,body:{error:{message:rawSecret}}},{status:200,body:{data:[]}}]), /./);
  assert.equal(fixture.calls,1,"ambiguous paid rejection must not fail over");assert.equal(fixture.releases,1);
  assert.equal(fixture.events.at(-1)[1],"unknown");assert.equal(fixture.events.at(-1)[3].upstreamFailure.code,"IMAGE_UPSTREAM_UNAVAILABLE");assert.ok(!JSON.stringify(fixture.events).includes(rawSecret));
  const source = readFileSync("src/lib/imagegen/generation-runtime.ts", "utf8");
  assert.ok(source.includes("imageRatioValidationPolicy"));
  assert.ok(source.includes("ratio:scope?imageRatioValidationPolicy"));
  console.log("MODIFIED=PASS RATIO_DIAGNOSTIC=RETAINED TASK_DELIVERY=ADVISORY FAILURE_CATEGORIES=7 AUDIT=SANITIZED STATUS=PRESERVED ATTEMPTS=UNCHANGED");
}
assert.deepEqual(observed, { width: 848, height: 1264, ratio: "53:79" });
console.log("PIXELS_AND_DIMENSIONS=UNCHANGED PRODUCTION_WRITES=0 REAL_SUPPLIER_CALLS=0 ACTUAL_POLICY=1 TRANSPORT_AND_SCHEDULER=FIXTURE");
delete globalThis.__sunjiangFixture;
