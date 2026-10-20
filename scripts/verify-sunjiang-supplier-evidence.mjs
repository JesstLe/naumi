import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url), receipts = [];
globalThis.__sunjiangLedger = { receipts, posts: 0 };
const mocks = {
  "server-only": "",
  "../db": "exports.dbEnabled=true;",
  "../bi/call-scope": "exports.currentObservedCallId=()=>undefined;",
  "../model-config/context": "exports.currentModelExecution=()=>null;",
  "../billing/synchronous": "exports.currentSynchronousBilling=()=>null;",
  "../image-gateway": "exports.currentImageOperationId=()=>undefined;",
  "../bi/model-observer": "exports.currentBiContext=()=>({id:'fixture-op',email:'fixture@local.test',operation:'image.generate'});",
  "./runtime": "exports.accountIdentity=()=> 'fixture-account';exports.supplierLedger=()=>({account:async()=>{},begin:async()=>({id:'fixture-call'}),apply:async(_id,r)=>globalThis.__sunjiangLedger.receipts.push(r)});",
  "./adapters": "exports.genericReceipt=(_body,state)=>({state,status:'pending',evidence:{source:'fixture'}});exports.safeUsage=x=>x;exports.submittedAPIMartTask=()=>undefined;",
  "./phase": "exports.modelCostPhase=()=> 'generation';",
  "./money": "exports.parseReceiptJson=JSON.parse;",
  "../model-config/types": "exports.ModelConfigError=class extends Error{};",
};
const bundle = await build({ entryPoints: ["src/lib/supplier-cost/collect.ts"], bundle: true, platform: "node", format: "cjs", write: false,
  plugins: [{ name: "isolated-supplier-ledger", setup(b) {
    b.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "mock" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }],
});
const mod = { exports: {} }; new Function("require", "module", "exports", bundle.outputFiles[0].text)(require, mod, mod.exports);
const secret = "secret-and-original-user-prompt-do-not-persist";
for (const [status, body, expected] of [
  [400, { error: { code: "invalid_image", param: "image", message: secret } }, "IMAGE_INPUT_REJECTED"],
  [400, { error: { message: secret, param: secret } }, "IMAGE_REQUEST_REJECTED"],
  [403, { error: { message: secret } }, "IMAGE_ACCESS_DENIED"],
  [200, { data: [{ b64_json: "fixture" }] }, undefined],
]) {
  const raw = JSON.stringify(body), count = receipts.length;
  const fetcher = mod.exports.supplierCostFetch(async () => { globalThis.__sunjiangLedger.posts++; return new Response(raw, { status, headers: { "content-type": "application/json" } }); }, { providerId: "fixture", baseUrl: "https://fixture.invalid/v1", apiKey: "fixture-private", wireModel: "fixture-image", protocol: "openai-images" });
  const response = await fetcher("https://fixture.invalid/v1/images/edits", { method: "POST", body: "fixture" });
  assert.equal(await response.text(), raw, "response bytes pass through unchanged");
  assert.equal(receipts.length, count + 1);
  const receipt = receipts.at(-1);
  assert.equal(receipt.evidence.httpStatus, status);
  assert.equal(receipt.evidence.responseSha256, createHash("sha256").update(raw).digest("hex"));
  assert.equal(receipt.evidence.upstreamFailure?.code, expected);
  assert.equal(receipt.state, status === 200 ? "response-received" : "unknown", "400 alone does not prove supplier non-billing");
  assert.ok(!JSON.stringify(receipt).includes(secret));
}
assert.equal(globalThis.__sunjiangLedger.posts, 4);
console.log("SUPPLIER_EVIDENCE=PASS CASES=4 ORIGINAL_RESPONSE_HASH=RETAINED RAW_SECRET_OR_PROMPT=0 BILLING_STATE=UNCHANGED ADDITIONAL_POSTS=0 REAL_SUPPLIER_CALLS=0");
delete globalThis.__sunjiangLedger;
