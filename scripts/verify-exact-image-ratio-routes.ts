/** Real route handlers, private local PG, loopback-only supplier. Never replay a customer task. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";
import { exactImageRequestSize } from "../src/lib/imagegen/request-size";

async function main() {
  const mode = process.argv[2] || "MODIFIED",
    out = resolve(process.argv[3] || "output/canvas-exact-ratio47-20261019");
  const legacyOnly = process.argv.includes("--legacy-auto-only");
  assert.ok(["BASELINE", "MODIFIED", "ROLLBACK"].includes(mode));
  await mkdir(out, { recursive: true });
  let calls = 0;
  const wire: Array<Record<string, unknown>> = [];
  const W = 1024,
    H = 1536,
    raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      raw[i] = y < 90 ? 255 : 20;
      raw[i + 1] = y > H - 91 ? 255 : 60;
      raw[i + 2] = x < 70 || x > W - 71 ? 255 : 100;
    }
  const original = await sharp(raw, {
    raw: { width: W, height: H, channels: 3 },
  })
    .png()
    .toBuffer();
  const reference = await sharp(original)
    .resize(750, 1000, { fit: "fill" })
    .png()
    .toBuffer();
  await writeFile(join(out, "EDGE_FIXTURE.png"), original);
  const f = await createModelFixture(async (req, res) => {
    try {
      const parts: Buffer[] = [];
      for await (const c of req) parts.push(Buffer.from(c));
      const bytes = Buffer.concat(parts);
      const body = req.headers["content-type"]?.includes("json")
        ? JSON.parse(bytes.toString() || "{}")
        : {};
      res.setHeader("content-type", "application/json");
      if (req.url?.startsWith("/internal/config"))
        return res.end(
          JSON.stringify({
            id: body.id,
            digest: body.digest,
            phase: req.url.endsWith("prepare") ? "prepared" : "applied",
          }),
        );
      if (
        req.url?.endsWith("/images/edits") ||
        req.url?.endsWith("/images/generations")
      ) {
        if (req.headers["content-type"]?.includes("multipart")) {
          const form = await new Request(f.origin + req.url, {
            method: "POST",
            headers: { "content-type": req.headers["content-type"] },
            body: bytes,
          }).formData();
          Object.assign(
            body,
            Object.fromEntries(
              [...form.entries()].filter(([, v]) => typeof v === "string"),
            ),
          );
          body.referenceCount =
            form.getAll("image[]").length || form.getAll("image").length;
        }
        calls++;
        wire.push({ ...body, path: req.url });
        const dims = String(body.size).split("x").map(Number);
        assert.ok(dims.every(Number.isFinite));
        const response = String(body.prompt).includes("WRONG_RATIO_FIXTURE")
          ? original
          : await sharp(original)
              .resize(dims[0], dims[1], { fit: "fill" })
              .png()
              .toBuffer();
        return res.end(
          JSON.stringify({
            created: 1,
            data: [{ b64_json: response.toString("base64") }],
          }),
        );
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "fixture route absent" }));
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(error) }));
    }
  });
  process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
  Object.assign(process.env, {
    NAUMI_MULTI_USER: "1",
    NAUMI_ROUTER_MANAGEMENT_URL: f.origin,
    NAUMI_ROUTER_MANAGEMENT_TOKEN: "fixture-router-token-independent-123456789",
    MODEL_CONFIG_ENVELOPE_SECRET: "fixture-envelope-independent-key-123456789",
    MODEL_CONFIG_TRUSTED_ORIGINS: f.origin,
    OPENAI_API_KEY: "fixture-only",
    OPENAI_BASE_URL: `${f.origin}/v1`,
    OPENAI_IMAGE_QUALITY: "medium",
    STORAGE_DRIVER: "local",
    MEDIA_PRIVATE: "1",
    MEDIA_DIR: await mkdtemp(join(tmpdir(), "chiyu-ratio-media-")),
    VIDEO_WORKER_SECRET: "fixture-worker-image-recovery-20261016-only",
  });
  f.config.upstreamModels[0].capabilities.preserveIdentity = true;
  f.config.upstreamModels[0].capabilities.nativeResolutions = [];
  f.config.upstreamModels[0].parameterMap.resolution = {};
  // gpt-image-2 matches the user's adapter path. This name is local fixture data, not a supplier call.
  f.config.upstreamModels[0].model = "gpt-image-2";
  await f.repo.current();
  const db = await import("../src/lib/db"),
    gen = await import("../src/app/api/generate-image/route"),
    imagegen = await import("../src/app/api/imagegen/route"),
    planRoute = await import("../src/app/api/imagegen/plan/route");
  const { imageWorkerAuthorized, recoverDurableImageJobs } = await import(
    "../src/lib/durable-image-jobs"
  );
  const app = createServer(async (req, res) => {
    try {
      const parts: Buffer[] = [];
      for await (const c of req) parts.push(Buffer.from(c));
      const bytes = Buffer.concat(parts),
        url = new URL(req.url || "/", origin);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers))
        if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
      const request = new Request(url, {
        method: req.method,
        headers,
        ...(req.method !== "GET" && req.method !== "HEAD"
          ? { body: bytes }
          : {}),
      });
      let response: Response;
      if (url.pathname === "/api/generate-image")
        response = await (req.method === "GET" ? gen.GET : gen.POST)(request);
      else if (url.pathname === "/api/imagegen")
        response = await (req.method === "GET" ? imagegen.GET : imagegen.POST)(
          request,
        );
      else if (url.pathname === "/api/imagegen/plan")
        response = await planRoute.POST(request);
      else if (url.pathname === "/fixture/worker-image-recovery")
        response = imageWorkerAuthorized(request)
          ? Response.json({ processed: await recoverDurableImageJobs() })
          : Response.json({ error: "unauthorized" }, { status: 401 });
      else
        response = Response.json(
          { error: "fixture path absent" },
          { status: 404 },
        );
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(error) }));
    }
  });
  let origin = "";
  await new Promise<void>((r) => app.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(app.address() as { port: number }).port}`;
  process.env.INTERNAL_APP_ORIGIN = origin;
  const { signUserSession, USER_COOKIE } = await import(
      "../src/lib/native-auth"
    ),
    owner = `ratio-${randomUUID()}@example.test`;
  try {
    await db.getOrCreateUser(owner, "Isolated ratio fixture");
    const { createBillingService, withBillingTransaction } = await import(
      "../src/lib/billing/service"
    );
    await withBillingTransaction(db.getPool(), (tx) =>
      createBillingService().grantTx(tx, {
        id: randomUUID(),
        email: owner,
        amount: 500,
        source: "admin",
        reason: "isolated ratio fixture",
        expiry: { unit: "years", value: 1 },
        ledgerId: randomUUID(),
        fingerprint: randomUUID(),
        actor: "fixture",
      }),
    );
    const cookie = `${USER_COOKIE}=${signUserSession(owner, Date.now())}`,
      headers = { cookie, origin };
    const json = async (
      path: string,
      body?: unknown,
      extra: Record<string, string> = {},
    ) => {
      const response = await fetch(origin + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...headers,
          ...extra,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json();
      assert.equal(response.ok, true, JSON.stringify(data));
      return data;
    };
    const ids = [0, 1, 2].map((i) => `reference-${randomUUID()}-${i}`);
    for (const id of ids)
      await db
        .getPool()
        .query(
          "INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,origin) VALUES($1,$2,'Fixture','main','','completed',$3,'','canvas')",
          [id, owner, `data:image/png;base64,${reference.toString("base64")}`],
        );

    const { readManagedObject } = await import("../src/lib/storage");
    const reports: any[] = [];
    const one = async (ratio: string, edit: boolean, wrong = false, customInputs?: { artworkId: string; role: string }[], expectedRatio = ratio) => {
      const request = {
        version: 1,
        operationId: randomUUID(),
        entry: "canvas",
        mode: edit ? "edit" : "generate",
        prompt: wrong
          ? "WRONG_RATIO_FIXTURE"
          : "A green product carton with all edges visible",
        modelId: "image-a",
        inputs: customInputs || (edit ? [{ artworkId: ids[0], role: "edit-target" }] : []),
        parameters: { quality: "medium", resolution: "1K", ratio },
        variants: 1,
      };
      const plan = await json("/api/imagegen/plan", request),
        before = calls;
      assert.equal(plan.ratioContractVersion, 2);
      assert.equal(plan.request.parameters.ratio, expectedRatio);
      assert.equal(request.parameters.ratio, ratio, "auto caller/fingerprint stays unchanged");
      const confirmation = {
        billingVersion: plan.billingVersion,
        modelVersion: plan.modelVersion,
        credits: plan.totalCredits,
        confirmed: true,
      };
      const accepted = await json("/api/imagegen", {
        ...request,
        confirmation,
      });
      let result: any;
      for (let i = 0; i < 400; i++) {
        result = await json("/api/imagegen?operationId=" + request.operationId);
        if (["succeeded", "failed", "needs_attention"].includes(result.status))
          break;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.equal(
        result.status,
        "succeeded",
        JSON.stringify(result),
      );
      assert.equal(calls, before + 1);
      const art = result.artifacts[0];
      assert.ok(art, "paid output remains accessible");
      const bytes = (await readManagedObject(art.url, 64 * 1024 * 1024)).bytes,
        meta = await sharp(bytes).metadata();
      if (!wrong) {
        const expectedSize = exactImageRequestSize(expectedRatio, "gpt-image-2", true)!;
        assert.equal(wire[before].size, expectedSize, "actual HTTP uses reference-derived grid dimensions");
        assert.deepEqual([meta.width, meta.height], expectedSize.split("x").map(Number));
        const sent = await sharp(original).resize(meta.width!, meta.height!, { fit: "fill" }).png().toBuffer();
        assert.equal(createHash("sha256").update(bytes).digest("hex"), createHash("sha256").update(sent).digest("hex"), "returned fixture bytes not locally cropped or stretched");
      } else {
        assert.deepEqual([meta.width, meta.height], [1024, 1536]);
        assert.ok(result.warnings?.some((warning:string)=>warning.includes("3:4")));
        assert.equal(result.error,undefined);
        assert.ok(result.chargedCredits > 0);
      }
      const compat = await json("/api/generate-image?job=" + accepted.jobId);
      assert.equal(compat.status, "done");
      if (ratio === "3:4" || ratio === "auto")
        await json("/api/imagegen", { ...request, confirmation });
      assert.equal(calls, before + 1, "no paid replay on duplicate");
      reports.push({
        ratio,
        resolvedRatio: expectedRatio,
        edit,
        wrong,
        size: wire[before].size,
        width: meta.width,
        height: meta.height,
        status: result.status,
        charged: result.chargedCredits,
      });
      return { request, plan, confirmation, accepted, result };
    };
    if (!legacyOnly) for (const ratio of ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"]) {
      await one(ratio, false);
      await one(ratio, true);
    }
    const extraIds: string[] = [];
    for (const [width, height] of [[1060,1580],[1316,1755],[1024,1024]]) {
      const id = `reference-${randomUUID()}`, input = await sharp(original).resize(width,height,{fit:"fill"}).png().toBuffer();
      extraIds.push(id);
      await db.getPool().query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,origin) VALUES($1,$2,'Fixture','main','','completed',$3,'','canvas')",[id,owner,`data:image/png;base64,${input.toString("base64")}`]);
    }
    if (!legacyOnly) {
    await one("auto",true,false,[{artworkId:extraIds[0],role:"edit-target"}],"53:79");
    await one("auto",true,false,[{artworkId:extraIds[1],role:"edit-target"}],"1316:1755");
    await one("auto",true,false,[{artworkId:extraIds[2],role:"edit-target"},{artworkId:extraIds[0],role:"reference"}],"53:79");
    await one("auto",true,false,[{artworkId:extraIds[0],role:"reference"},{artworkId:extraIds[2],role:"edit-target"}],"53:79");
    await one("3:4",true,false,[{artworkId:extraIds[0],role:"edit-target"}],"3:4");
    }
    const bad = await one("3:4", true, true);
    const child = (
      await db
        .getPool()
        .query(
          "SELECT * FROM app_image_jobs WHERE id IN (SELECT value->>'jobId' FROM app_image_jobs p,jsonb_each(p.snapshot->'children') WHERE p.id=$1)",
          [bad.accepted.jobId],
        )
    ).rows[0];
    assert.equal(child.payload.p.ratioContractVersion, 2);
    assert.match(child.snapshot.imagegenOutputWarning, /3:4/);
    assert.equal(child.snapshot.imagegenOutputError,undefined);
    const childReceipt = await json("/api/generate-image?job=" + child.id);
    assert.equal(childReceipt.status, "done");
    assert.ok(childReceipt.images.length);
    assert.ok(
      childReceipt.images.every((image: any) => !("execution" in image)),
        "receipt must not expose internal execution metadata",
    );
    const recoveryId = "job-" + randomUUID(),
      checkpoint = {
        ...child.snapshot,
        status: "pending",
        images: child.snapshot.images,
        paidOperationVersion: 1,
      };
    const payload = { ...child.payload, cost: 0 };
    delete payload.billingQuote;
    await db
      .getPool()
      .query(
        "INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,metered) VALUES($1,$2,'generate',$3::jsonb,$4::jsonb,0,false)",
        [
          recoveryId,
          owner,
          JSON.stringify(checkpoint),
          JSON.stringify(payload),
        ],
      );
    const beforeRecovery = calls;
    await fetch(origin + "/fixture/worker-image-recovery", {
      method: "POST",
      headers: { "x-video-worker-secret": process.env.VIDEO_WORKER_SECRET! },
    });
    let receipt: any;
    for (let i = 0; i < 200; i++) {
      receipt = await json("/api/generate-image?job=" + recoveryId);
      if (receipt.status === "done") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(receipt.status, "done");
    assert.ok(receipt.warnings?.some((warning:string)=>warning.includes("3:4")));
    assert.ok(receipt.images.length);
    assert.equal(calls, beforeRecovery);
    const p = await one("3:4", true);
    const oldOperation = randomUUID(),
      oldParent = "imagegen-" + oldOperation;
    const frozen = (
      await db
        .getPool()
        .query("SELECT payload FROM app_image_jobs WHERE id=$1", [
          p.accepted.jobId,
        ])
    ).rows[0].payload;
    const oldPlan = {
      ...frozen.plan,
      request: { ...frozen.plan.request, operationId: oldOperation },
    };
    delete oldPlan.ratioContractVersion;
    await db
      .getPool()
      .query(
        "INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,metered) VALUES($1,$2,'imagegen',$3::jsonb,$4::jsonb,0,false)",
        [
          oldParent,
          owner,
          JSON.stringify({
            status: "pending",
            paidOperationVersion: 1,
            children: {},
            fingerprint: "old-plan-fixture",
            result: {
              operationId: oldOperation,
              jobId: oldParent,
              status: "pending",
              stage: "generating",
              artifacts: [],
              chargedCredits: 0,
            },
          }),
          JSON.stringify({ plan: oldPlan }),
        ],
      );
    let oldResult: any;
    for (let i = 0; i < 400; i++) {
      oldResult = await json("/api/imagegen?operationId=" + oldOperation);
      if (["succeeded", "failed", "needs_attention"].includes(oldResult.status))
        break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(oldResult.status, "succeeded", JSON.stringify(oldResult));
    assert.deepEqual(
      [oldResult.artifacts[0].width, oldResult.artifacts[0].height],
      [1024, 1536],
      "old accepted parent contract remains directional",
    );

    const form = new FormData();
    for (const [k, v] of Object.entries({
      prompt: "Recompose fixture",
      model: "image-a",
      origin: "canvas",
      count: "1",
      quality: "medium",
      resolution: "1K",
      ratio: "3:4",
      ratiogen: "1",
    }))
      form.set(k, v);
    form.set(
      "image",
      new File([new Uint8Array(reference)], "fixture.png", {
        type: "image/png",
      }),
    );
    const response = await fetch(origin + "/api/generate-image", {
      method: "POST",
      headers: {
        ...headers,
        "x-naumi-billing-operation-id": randomUUID(),
        "x-naumi-model-version": String(p.plan.modelVersion),
        "x-naumi-billing-version": String(p.plan.billingVersion),
        "x-naumi-billing-credits": String(p.plan.totalCredits),
      },
      body: form,
    });
    const direct = await response.json();
    assert.equal(response.ok, true, JSON.stringify(direct));
    let result: any;
    for (let i = 0; i < 400; i++) {
      result = await json("/api/generate-image?job=" + direct.jobId);
      if (["done", "error"].includes(result.status)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(result.status, "done", JSON.stringify(result));
    assert.deepEqual(
      [result.images[0].width, result.images[0].height],
      [1152, 1536],
    );
    for (const [dimensions, expectedRatio] of [
      [[[1060,1580]],"53:79"],
      [[[1316,1755]],"1316:1755"],
      [[[1024,1024],[1060,1580]],"53:79"],
    ] as const) {
      const autoForm = new FormData();
      for (const [key,value] of Object.entries({prompt:"Keep full layout",model:"image-a",origin:"canvas",count:"1",quality:"medium",resolution:"1K",ratio:"auto"})) autoForm.set(key,value);
      for (const [width,height] of dimensions) {
        const bytes=await sharp(original).resize(width,height,{fit:"fill"}).png().toBuffer();
        autoForm.append("image",new File([new Uint8Array(bytes)],"fixture.png",{type:"image/png"}));
      }
      const autoHeaders={...headers,"x-naumi-billing-operation-id":randomUUID(),"x-naumi-model-version":String(p.plan.modelVersion),"x-naumi-billing-version":String(p.plan.billingVersion),"x-naumi-billing-credits":String(p.plan.totalCredits)};
      const before=calls;
      const response=await fetch(origin+"/api/generate-image",{method:"POST",headers:autoHeaders,body:autoForm});
      const accepted=await response.json();assert.equal(response.ok,true,JSON.stringify(accepted));
      let output:any;
      for(let i=0;i<400;i++){output=await json("/api/generate-image?job="+accepted.jobId);if(["done","error"].includes(output.status))break;await new Promise(r=>setTimeout(r,50));}
      assert.equal(output.status,"done",JSON.stringify(output));
      const expectedSize=exactImageRequestSize(expectedRatio,"gpt-image-2",true)!;
      assert.equal(wire[before].size,expectedSize);
      assert.deepEqual([output.images[0].width,output.images[0].height],expectedSize.split("x").map(Number));
      const duplicate=await fetch(origin+"/api/generate-image",{method:"POST",headers:autoHeaders,body:autoForm});assert.equal(duplicate.ok,true);assert.equal((await duplicate.json()).jobId,accepted.jobId);assert.equal(calls,before+1,"legacy auto duplicate must not re-POST");
      reports.push({legacyAuto:true,expectedRatio,size:expectedSize,status:output.status});
    }
    await writeFile(
      join(out, "ROUTES.json"),
      JSON.stringify(
        {
          reports,
          fixtureCalls: calls,
          realSupplierCalls: 0,
          recoveryNoPost: true,
          legacyRatiogen: true,
          mismatchRetained: true,
        },
        null,
        2,
      ),
    );
    console.log(
      `ROUTES=PASS MATRIX=${legacyOnly ? 0 : 19} AUTO_REFERENCE_CASES=${legacyOnly ? 0 : 5} LEGACY_HTTP_AUTO=3 COPRIME=GRID REFERENCE_ROLE=RESPECTED RATIO_MISMATCH=DELIVERED_WITH_WARNING WORKER_REPLAY=0 DIRECT_RATIOGEN=1152x1536 LOCAL_SUPPLIER_CALLS=${calls} REAL_SUPPLIER_CALLS=0 EXIT=0`,
    );
  } finally {
    await new Promise<void>((r) => app.close(() => r()));
    await db.getPool().end();
    await f.cleanup();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
