/** Actual handlers + isolated local PostgreSQL + loopback-only supplier. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  let calls = 0;
  const wires: Record<string, unknown>[] = [];
  const native = await sharp({ create: { width: 848, height: 1264, channels: 3, background: "#53a871" } }).png().toBuffer();
  const wrong = await sharp({ create: { width: 928, height: 1152, channels: 3, background: "#a87153" } }).png().toBuffer();
  const ref = await sharp(native).jpeg().toBuffer();
  const f = await createModelFixture(async (req, res) => {
    const parts: Buffer[] = []; for await (const c of req) parts.push(Buffer.from(c));
    const bytes = Buffer.concat(parts), body: Record<string, any> = {};
    res.setHeader("content-type", "application/json");
    if (req.url?.includes("/images/")) {
      if (req.headers["content-type"]?.includes("multipart")) {
        const form = await new Request(f.origin + req.url, { method: "POST", headers: { "content-type": req.headers["content-type"] }, body: bytes }).formData();
        Object.assign(body, Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
      } else Object.assign(body, JSON.parse(bytes.toString()));
      calls++; wires.push({ size: body.size, resolution: body.resolution, quality: body.quality, model: body.model });
      if (String(body.prompt).includes("REJECT_INPUT_FIXTURE")) {
        res.statusCode = 400; return res.end(JSON.stringify({ error: { code: "invalid_image", param: "image", message: "private-fixture-response-never-display" } }));
      }
      if (String(body.prompt).includes("EMPTY_OUTPUT_FIXTURE")) return res.end(JSON.stringify({data:[]}));
      if (String(body.prompt).includes("CORRUPT_OUTPUT_FIXTURE")) return res.end(JSON.stringify({data:[{b64_json:Buffer.from("not an image").toString("base64")}]}));
      const image = String(body.prompt).includes("WRONG_FRAME_FIXTURE") ? wrong : native;
      return res.end(JSON.stringify({ data: [{ b64_json: image.toString("base64") }] }));
    }
    res.statusCode = 404; res.end("{}");
  });
  Object.assign(process.env, { PGOPTIONS: `-c search_path=${f.schemaName}`, NAUMI_MULTI_USER: "1", NAUMI_ROUTER_MANAGEMENT_URL: f.origin, NAUMI_ROUTER_MANAGEMENT_TOKEN: "fixture-sunjiang-router-only-long-token", MODEL_CONFIG_ENVELOPE_SECRET: "fixture-sunjiang-envelope-only-long-key", MODEL_CONFIG_TRUSTED_ORIGINS: f.origin, OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: f.origin + "/v1", OPENAI_IMAGE_QUALITY: "medium", STORAGE_DRIVER: "local", MEDIA_PRIVATE: "1", MEDIA_DIR: await mkdtemp(join(tmpdir(), "sunjiang-image-media-")), VIDEO_WORKER_SECRET: "fixture-sunjiang-worker-secret-only" });
  const upstream = f.config.upstreamModels[0];
  upstream.model = "gemini-3-pro-image-preview";
  upstream.capabilities.preserveIdentity = true;
  upstream.capabilities.nativeResolutions = [];
  upstream.capabilities.imagegen = { edit: { state: "supported", source: "isolated loopback edit", checkedAt: "2026-10-19" } };
  upstream.parameterMap = { qualityPolicy: { mode: "omit", choices: [{ id: "medium", label: "标准" }] }, resolutionPolicy: { mode: "map", field: "resolution", values: { "1K": "1k", "2K": "1k", "4K": "1k" }, ratioField: "size" } };
  f.config.publicModels[0].supplierRouting = { mode: "priority", channels: [{ upstreamId: upstream.id, enabled: true, priority: 1, weight: 1 }] };
  await f.repo.current();
  const db = await import("../src/lib/db"), gen = await import("../src/app/api/generate-image/route"), imagegen = await import("../src/app/api/imagegen/route"), plans = await import("../src/app/api/imagegen/plan/route");
  let origin = "";
  const app = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(Buffer.from(c));
      const url = new URL(req.url!, origin), headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
      const request = new Request(url, { method: req.method, headers, ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}) });
      const response = url.pathname === "/api/generate-image" ? await (req.method === "POST" ? gen.POST : gen.GET)(request) : url.pathname === "/api/imagegen/plan" ? await plans.POST(request) : await (req.method === "POST" ? imagegen.POST : imagegen.GET)(request);
      res.statusCode = response.status; response.headers.forEach((v, k) => res.setHeader(k, v)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })); }
  });
  await new Promise<void>(r => app.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(app.address() as { port: number }).port}`; process.env.INTERNAL_APP_ORIGIN = origin;
  const { USER_COOKIE, signUserSession } = await import("../src/lib/native-auth");
  const owner = `sunjiang-fixture-${randomUUID()}@example.test`;
  try {
    await db.getOrCreateUser(owner, "Isolated image regression");
    const { createBillingService, withBillingTransaction } = await import("../src/lib/billing/service");
    await withBillingTransaction(db.getPool(), tx => createBillingService().grantTx(tx, { id: randomUUID(), email: owner, amount: 500, source: "admin", reason: "isolated image regression", expiry: { unit: "years", value: 1 }, ledgerId: randomUUID(), fingerprint: randomUUID(), actor: "fixture" }));
    const id = `fixture-reference-${randomUUID()}`;
    await db.getPool().query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,origin) VALUES($1,$2,'Fixture','main','','completed',$3,'','canvas')", [id, owner, `data:image/jpeg;base64,${ref.toString("base64")}`]);
    const json = async (path: string, body?: unknown) => {
      const response = await fetch(origin + path, { method: body === undefined ? "GET" : "POST", headers: { origin, cookie: `${USER_COOKIE}=${signUserSession(owner, Date.now())}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = await response.json(); assert.equal(response.ok, true, JSON.stringify(data)); return data;
    };
    for (const test of [
      { ratio: "2:3", edit: false, prompt: "NATIVE_GRID_FIXTURE", expected: "succeeded" },
      { ratio: "2:3", edit: true, prompt: "NATIVE_GRID_FIXTURE", expected: "succeeded" },
      { ratio: "2:3", edit: true, prompt: "NATIVE_GRID_UPSCALE_FIXTURE", expected: "succeeded", resolution: "4K" },
      { ratio: "53:79", edit: true, prompt: "WRONG_FRAME_FIXTURE", expected: "succeeded" },
      { ratio: "3:4", edit: true, prompt: "REJECT_INPUT_FIXTURE", expected: "failed" },
      { ratio: "3:4", edit: false, prompt: "EMPTY_OUTPUT_FIXTURE", expected: "failed" },
      { ratio: "3:4", edit: false, prompt: "CORRUPT_OUTPUT_FIXTURE", expected: "failed" },
    ]) {
      const request = { version: 1, operationId: randomUUID(), entry: "canvas", mode: test.edit ? "edit" : "generate", modelId: "image-a", prompt: test.prompt, inputs: test.edit ? [{ artworkId: id, role: "edit-target" }] : [], parameters: { quality: "medium", resolution: test.resolution || "1K", ratio: test.ratio }, variants: 1 };
      const plan = await json("/api/imagegen/plan", request), before = calls;
      const body = { ...request, confirmation: { billingVersion: plan.billingVersion, modelVersion: plan.modelVersion, credits: plan.totalCredits, confirmed: true } };
      const accepted = await json("/api/imagegen", body);
      let result: any;
      for (let n = 0; n < 400; n++) { result = await json("/api/imagegen?operationId=" + request.operationId); if (["succeeded", "failed", "needs_attention"].includes(result.status)) break; await new Promise(r => setTimeout(r, 50)); }
      assert.equal(result.status, test.expected, JSON.stringify(result));
      assert.equal(calls, before + 1);
      assert.equal(wires[before].size, test.ratio); assert.equal(wires[before].resolution, "1k"); assert.equal(wires[before].quality, undefined);
      if (test.expected === "failed") {
        assert.equal(result.artifacts.length, 0); assert.equal(result.chargedCredits, 0);
        if(test.prompt === "REJECT_INPUT_FIXTURE")assert.match(result.error.message, /参考图片未被生成服务接受/);
        const receipts = (await db.getPool().query("SELECT evidence FROM app_supplier_calls WHERE operation_id IN(SELECT value->>'jobId' FROM app_image_jobs p,jsonb_each(p.snapshot->'children') WHERE p.id=$1)", [accepted.jobId])).rows;
        assert.equal(receipts.length, 1); if(test.prompt === "REJECT_INPUT_FIXTURE")assert.equal(receipts[0].evidence.upstreamFailure.code, "IMAGE_INPUT_REJECTED");
        assert.ok(!JSON.stringify(receipts).includes("private-fixture-response"));
      } else {
        assert.equal(result.artifacts.length, 1); assert.ok(result.chargedCredits > 0);
        if(test.prompt==="WRONG_FRAME_FIXTURE"){assert.ok(result.warnings?.some((warning:string)=>warning.includes("928×1152")));assert.equal(result.error,undefined);}
        const expected = test.prompt === "WRONG_FRAME_FIXTURE" ? wrong : native;
        const { readManagedObject } = await import("../src/lib/storage");
        const saved = (await readManagedObject(result.artifacts[0].url, 12 * 1024 * 1024)).bytes;
        if (test.resolution === "4K") {
          const meta = await sharp(saved).metadata(); assert.equal(meta.height, 4096);
          assert.ok(Math.abs(meta.width! / meta.height! - 848 / 1264) < 1 / 4096, "existing upscale preserves the native frame");
        } else assert.equal(createHash("sha256").update(saved).digest("hex"), createHash("sha256").update(expected).digest("hex"));
        if(test.prompt==="WRONG_FRAME_FIXTURE"){
          const raw=(await db.getPool().query("SELECT snapshot,payload FROM app_image_jobs WHERE id=$1",[accepted.jobId])).rows[0];
          const oldError="生成结果为 29:36（928×1152），与所选 53:79 不一致；原图已保留，实际生成积分已结算，任务未自动重试";
          const historical=structuredClone(raw.snapshot);historical.status="error";historical.result={...historical.result,status:"failed",error:{code:"EXECUTION_FAILED",message:oldError},warnings:undefined};
          const priorCalls=calls;
          for(const [format,expectedStatus] of [["png","succeeded"],["webp","failed"]]){
            const legacyId=randomUUID(),legacyParent=`imagegen-${legacyId}`,payload=structuredClone(raw.payload),snap=structuredClone(historical);
            payload.plan.request.operationId=legacyId;payload.plan.request.output.format=format;snap.result.operationId=legacyId;snap.result.jobId=legacyParent;
            await db.getPool().query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,metered) VALUES($1,$2,'imagegen',$3::jsonb,$4::jsonb,0,false)",[legacyParent,owner,JSON.stringify(snap),JSON.stringify(payload)]);
            const before=(await db.getPool().query("SELECT snapshot FROM app_image_jobs WHERE id=$1",[legacyParent])).rows[0].snapshot;
            const presented=await json("/api/imagegen?operationId="+legacyId);
            assert.equal(presented.status,expectedStatus);assert.equal(presented.chargedCredits,snap.result.chargedCredits);assert.deepEqual(presented.artifacts,snap.result.artifacts);
            const after=(await db.getPool().query("SELECT snapshot FROM app_image_jobs WHERE id=$1",[legacyParent])).rows[0].snapshot;assert.deepEqual(after,before,"legacy presentation must not rewrite task state");
          }
          assert.equal(calls,priorCalls,"legacy receipt reads must not replay supplier");
        }
      }
      await json("/api/imagegen", body); assert.equal(calls, before + 1, "duplicate submission must not replay paid generation");
    }
    console.log("SUNJIANG_REAL_ROUTES=PASS PARENT_CHILD_CASES=7 VALID_OUTPUTS=DELIVERED RATIO_DIFFERENCE=WARNING HTTP400_EMPTY_CORRUPT=FAILED REJECT_CHARGED=0 ADMIN_4K_TO_1K=UNCHANGED RAW_1K_PIXEL_HASH=UNCHANGED HISTORICAL_RECEIPTS=READ_ONLY DUPLICATE_POSTS=0 LOOPBACK_SUPPLIER_POSTS=7 REAL_SUPPLIER_CALLS=0");
  } finally { app.closeAllConnections(); await new Promise<void>(r => app.close(() => r())); await db.getPool().end(); await f.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
