import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModelFixture } from "./model-config-fixture";
import sharp from "sharp";

async function main() {
  const baseline = process.argv.includes("--baseline");
  let externalCalls = 0;
  const f = await createModelFixture((_req, res) => { externalCalls++; res.writeHead(500); res.end("No supplier execution allowed"); });
  Object.assign(process.env, { PGOPTIONS: `-c search_path=${f.schemaName}`, NAUMI_MULTI_USER: "1", MODEL_CONFIG_TRUSTED_ORIGINS: f.origin,
    NAUMI_ROUTER_MANAGEMENT_TOKEN: "fixture-workbench-router-1234567890", MODEL_CONFIG_ENVELOPE_SECRET: "isolated-workbench-error-fixture-123456", NAUMI_ROUTER_MANAGEMENT_URL: f.origin,
    STORAGE_DRIVER: "local", MEDIA_PRIVATE: "1", MEDIA_DIR: await mkdtemp(join(tmpdir(), "wb-quote-errors-")), NAUMI_VIDEO_WORKER: "0" });
  f.config.upstreamModels[0].model = "gpt-image-2";
  f.config.upstreamModels[0].capabilities.preserveIdentity = true;
  const db = await import("../src/lib/db");
  const { POST } = await import("../src/app/api/reference-workbench/[...path]/route");
  const { signUserSession } = await import("../src/lib/native-auth");
  const owner = `quote-${randomUUID()}@example.test`;
  const headers = { cookie: `nv_user=${signUserSession(owner, Date.now())}`, "content-type": "application/json" };
  const body = (ratio = "1:1", quality = "high") => ({ action: "single/start", body: { request_id: randomUUID(), prompt: "fixture-only private prompt", ratio, quality, resolution: "1k", images: [], count: 1 } });
  const call = (value: unknown, action = "quote", raw = false) => POST(new Request(`http://internal/api/reference-workbench/${action}`, { method: "POST", headers, body: raw ? String(value) : JSON.stringify(value) }));
  const results: unknown[] = [];
  try {
    await f.repo.current(); await db.ensureSchema(); await db.getOrCreateUser(owner);
    const counters = async () => (await db.getPool().query(`SELECT (SELECT count(*)::int FROM app_reference_operations WHERE owner=$1 AND state<>'preview') AS accepted, (SELECT count(*)::int FROM app_billing_operations WHERE email=$1) AS billing`, [owner])).rows[0];
    // Initialize workbench schema using an expected, non-billable validation error.
    await call({ action: "single/start", body: { prompt: "" } });
    const before = await counters();
    for (const [name, input, raw, status, code] of [
      ["invalid JSON", "{", true, 400, "INVALID_REQUEST"],
      ["exact unsupported ratio", body("249:374"), false, 400, "IMAGE_SIZE_UNSUPPORTED"],
      ["no eligible channel", body("1:1", "low"), false, 409, "IMAGEGEN_NO_CHANNEL"],
    ] as const) {
      const response = await call(input, "quote", raw), data = await response.json();
      assert.equal(response.status, baseline ? 500 : status, name);
      if (!baseline) { assert.equal(data.code, code); assert.equal(data.stage, "quote"); assert.match(data.traceId, /^wb-[a-f0-9]{16}$/); assert.ok(!data.error.includes("查询原任务")); }
      results.push({ name, status: response.status, data });
    }
    const form = new FormData();
    form.set("manifest", JSON.stringify([{ path: "Fixture/产品图/p.png" }, { path: "Fixture/主图/r.png" }]));
    for (const [w,h] of [[800,800],[498,748]]) { const bytes = await sharp({create:{width:w,height:h,channels:3,background:"#aabbcc"}}).png().toBuffer(); form.append("files", new File([new Uint8Array(bytes)], "image.png", {type:"image/png"})); }
    const uploaded = await POST(new Request("http://internal/api/reference-workbench/workbench/upload-folder",{method:"POST",headers:{cookie:headers.cookie},body:form}));
    assert.equal(uploaded.status,200);
    const root = (await uploaded.json()).product_dir;
    const { projectItems } = await import("../src/lib/reference-workbench/service"), { settings } = await import("../src/lib/reference-workbench/contract");
    const items = await projectItems(owner,root,settings({resolution:"1k"}));
    const reference = await call({action:"workbench/start",body:{request_id:randomUUID(),workbench_root:root,items:[{ref_path:items.items[0].ref_path,prompt:"preserve original composition"}],config:{quality:"high",resolution:"1k"}}});
    const referenceData = await reference.json(); assert.equal(reference.status,baseline?500:400);
    if(!baseline)assert.equal(referenceData.code,"IMAGE_SIZE_UNSUPPORTED");
    results.push({name:"real workbench folder 498x748 exact reference",status:reference.status,data:referenceData});
    const successInput = body(), success = await call(successInput), quote = await success.json();
    if (success.status !== 200) { const { preview } = await import("../src/lib/reference-workbench/service"); await preview(owner, successInput.action, successInput.body); }
    assert.equal(success.status, 200); assert.equal(quote.state, "preview");
    assert.deepEqual(await counters(), before, "quote failures and success never accept/reserve/charge");
    const pool = db.getPool(), query = pool.query.bind(pool), logs: string[] = [], oldLog = console.error;
    const secret = "sk-fixture-do-not-expose https://supplier.invalid/private?token=secret fixture-only private prompt";
    // Fault injection only on our own schema/query, not on the model execution path.
    (pool as any).query = (...args: any[]) => { if (String(args[0]).includes("SELECT * FROM app_reference_operations WHERE owner=$1 AND kind=$2")) throw new Error(secret); return (query as any)(...args); };
    console.error = (...args) => logs.push(args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" "));
    try {
      const response = await call(body()), data = await response.json(); assert.equal(response.status, 500);
      assert.ok(!JSON.stringify(data).includes(secret));
      if (!baseline) { assert.equal(data.stage, "quote"); assert.equal(data.code, "WORKBENCH_INTERNAL"); assert.ok(logs.some(s => s.includes(data.traceId))); assert.ok(!logs.join("").includes("supplier.invalid")); assert.ok(!logs.join("").includes(owner)); assert.ok(!logs.join("").includes("private prompt")); }
      results.push({ name: "unknown internal error", status: response.status, data, logs });
    } finally { (pool as any).query = query; console.error = oldLog; }
    assert.equal(externalCalls, 0); assert.deepEqual(await counters(), before);
    if (!baseline) {
      const { workbenchFailure } = await import("../src/lib/reference-workbench/errors"), { workbenchErrorText } = await import("../src/lib/reference-workbench/http");
      const { BillingError } = await import("../src/lib/billing/types"), { ModelConfigError } = await import("../src/lib/model-config/types");
      const old = console.error, typedLogs: any[] = []; console.error = (...args) => typedLogs.push(args);
      try {
        for (const [error,status,code] of [
          [new BillingError("INSUFFICIENT_CREDITS","secret price detail"),402,"INSUFFICIENT_CREDITS"],
          [new BillingError("PRICE_CHANGED","secret price detail"),409,"PRICE_CHANGED"],
          [new BillingError("CONFIG_UNAVAILABLE","secret SQL"),503,"CONFIG_UNAVAILABLE"],
          [new ModelConfigError("MODEL_OUTSIDE_TOOL_SCOPE","secret config"),400,"MODEL_OUTSIDE_TOOL_SCOPE"],
          [new ModelConfigError("INVALID_CREDENTIAL","sk-secret"),503,"MODEL_CONFIG_UNAVAILABLE"],
        ] as const) { const r=workbenchFailure(error,"quote","quote");assert.equal(r.status,status);assert.equal(r.body.code,code);assert.ok(!JSON.stringify(r).includes("secret")); }
        const unknown = workbenchFailure(new Error("sk-secret"),"submit","single/start");assert.match(unknown.body.error,/查询原任务/);assert.ok(!Object.hasOwn(unknown.body,"accepted"));
        assert.ok(!JSON.stringify(typedLogs).includes("secret"));
      } finally { console.error=old; }
      for(const value of ["<html>private gateway details</html>","not JSON","{}",'{"error":{"message":"private"}}','{"error":"{\\"secret\\":true}"}']) {
        const text=await workbenchErrorText(new Response(value,{status:502}),"读取失败");assert.equal(text,"读取失败（HTTP 502）");
      }
      const human=await workbenchErrorText(Response.json({error:"可读错误",traceId:"wb-1234567890abcdef"},{status:400}));assert.equal(human,"可读错误\n错误编号：wb-1234567890abcdef");
    }
    const evidence = process.env.NAUMI_WORKBENCH_EVIDENCE || "output/reference-workbench-quote-20261020";
    await mkdir(evidence, { recursive: true });
    await writeFile(join(evidence, baseline ? "baseline.json" : "modified.json"), JSON.stringify({ baseline, results, counters: before, externalCalls }, null, 2));
    console.log(`${baseline ? "BASELINE" : "MODIFIED"}=PASS quote invalid-json/exact-ratio/no-channel/internal; preview=200; accepted=0 billing=0 supplierCalls=0`);
  } finally { await db.getPool().end(); await f.cleanup(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
