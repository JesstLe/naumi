import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";

/** Real PostgreSQL + public route regression; every supplier request stays local. */
async function main() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || url.hostname !== "127.0.0.1") throw new Error("Requires isolated local PostgreSQL");
  Object.assign(process.env, {
    NAUMI_EDITION: "pro", PRO_LICENSE_KEY: "LOCAL-OFFLINE", NAUMI_MULTI_USER: "1",
    SETTINGS_SECRET: "fixture-settings-0123456789abcdef0123456789abcdef0123456789",
    VIDEO_WORKER_SECRET: "fixture-worker-0123456789abcdef0123456789abcdef0123456789",
    STORAGE_DRIVER: "local", MEDIA_DIR: path.resolve("output/credits-handoff/media"),
    OPENAI_API_KEY: "fixture-platform", OPENAI_IMAGE_MODEL: "gpt-image-1",
    OPENAI_IMAGE_MODELS: "gpt-image-1", OPENAI_IMAGE_QUALITY: "medium",
    NAUMI_IMAGE_QUALITY_SUPPORTED: "1", USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK: "true",
  });
  const image = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "white" } }).png().toBuffer();
  let scenario = "success", requestCount = 0;
  let release: (() => void) | undefined;
  let hold: Promise<void> | undefined;
  const wire: {quality: string; byok: boolean}[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const byok = request.headers.authorization === "Bearer fixture-byok";
    wire.push({ quality: body.quality, byok });
    const index = requestCount++;
    if (hold) await hold;
    response.setHeader("content-type", "application/json");
    const qualityRejected = (scenario === "downgrade" || scenario === "byok-downgrade" || scenario === "mixed") && body.quality === "high" && (scenario !== "mixed" || index === 0)
      || scenario === "byok-platform" && byok;
    if (qualityRejected || scenario === "failure" || scenario === "partial" && index === 1) {
      response.writeHead(400);
      response.end(JSON.stringify({ error: { message: qualityRejected ? "quality is not supported" : "fixture rejected prompt" } }));
    } else response.end(JSON.stringify({ created: 1, data: [{ b64_json: image.toString("base64") }] }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as {port: number}).port}/v1`;
  process.env.OPENAI_BASE_URL = baseUrl;
  const db = await import("../src/lib/db");
  const repo = await import("../src/lib/image-job-repository");
  const { signUserSession } = await import("../src/lib/native-auth");
  const route = await import("../src/app/api/generate-image/route");
  const sql = db.getPool();
  const wait = async (predicate: () => Promise<boolean>) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error(`Fixture timeout: ${scenario}`);
  };
  try {
    // Exercise the production schema upgrade with an existing old-name audit row.
    await sql.query(`CREATE TABLE IF NOT EXISTS app_image_cost_audit (
      id text PRIMARY KEY, job_id text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '',
      requested_quality text NOT NULL DEFAULT '', executed_quality text NOT NULL DEFAULT '',
      upstream text NOT NULL DEFAULT '', images integer NOT NULL DEFAULT 1,
      billed_beans double precision NOT NULL DEFAULT 0, cost_beans double precision NOT NULL DEFAULT 0,
      margin_beans double precision NOT NULL DEFAULT 0, reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`);
    // The script may be rerun against its own already-migrated fixture DB.
    const old = await sql.query("SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='app_image_cost_audit' AND column_name='billed_beans'");
    if (!old.rowCount) await sql.query("ALTER TABLE app_image_cost_audit RENAME billed_credits TO billed_beans; ALTER TABLE app_image_cost_audit RENAME cost_credits TO cost_beans; ALTER TABLE app_image_cost_audit RENAME margin_credits TO margin_beans");
    const legacy = `legacy-${randomUUID()}`;
    await sql.query("INSERT INTO app_image_cost_audit(id,billed_beans,cost_beans,margin_beans) VALUES($1,10,6,4)", [legacy]);
    await db.ensureSchema();
    const migrated = (await sql.query("SELECT billed_credits,cost_credits,margin_credits FROM app_image_cost_audit WHERE id=$1", [legacy])).rows[0];
    assert.deepEqual(migrated, { billed_credits: 10, cost_credits: 6, margin_credits: 4 });
    console.log("PASS old audit column migration preserves values");

    const run = async (name: string, count: number, expectedCharge: number, qualities: string[], byok = false) => {
      scenario = name; requestCount = 0; wire.length = 0;
      const email = `credits-${randomUUID()}@example.test`;
      await db.getOrCreateUser(email, "Credits fixture");
      await db.addCreditBatch(email, 100, { source: "admin", reason: "Fixture" });
      const before = await db.getUser(email);
      if (byok) await db.upsertUserImageProviderRecord({ id: `provider-${randomUUID()}`, email,
        name: "Fixture", isActive: true, enabled: true, protocol: "openai-images",
        baseUrlEnc: baseUrl, apiKeyEnc: "fixture-byok", models: ["gpt-image-1"], defaultModel: "gpt-image-1" });
      const headers = { cookie: `nv_user=${signUserSession(email, Date.now())}`, "content-type": "application/json" };
      if (name === "partial") hold = new Promise<void>(resolve => { release = resolve; });
      const submitted = await route.POST(new Request("http://fixture.test/api/generate-image", { method: "POST", headers,
        body: JSON.stringify({ prompt: name, model: byok ? "byok:gpt-image-1" : "gpt-image-1", count, quality: "high", resolution: "1K", ratio: "1:1" }) }));
      assert.equal(submitted.status, 200, await submitted.clone().text());
      const { jobId } = await submitted.json();
      if (name === "partial") {
        await wait(async () => requestCount === count);
        assert.equal(Number((await sql.query("SELECT reserved_cost FROM app_image_jobs WHERE id=$1", [jobId])).rows[0].reserved_cost), 20);
        process.env.NAUMI_MULTI_USER = "0";
        assert.equal(await db.creditMeteringEnabled(), false);
        release!(); hold = undefined;
      }
      await wait(async () => { const row = await repo.getImageJob(jobId, "generate"); return !!row && ["done", "error"].includes(String(row.snapshot.status)) && row.lease_token === null; });
      const row = (await repo.getImageJob(jobId, "generate"))!;
      assert.equal(row.billing_settled, true);
      assert.equal(row.snapshot.status, name === "failure" ? "error" : "done");
      const billed = await db.getImageJobChargedCredits(jobId);
      assert.equal(billed, expectedCharge);
      assert.equal(Number((await sql.query("SELECT count(*) AS n FROM app_gen_reservations WHERE job_id=$1", [jobId])).rows[0].n), 0);
      const after = await db.getUser(email);
      assert.equal(after!.creditsTotal, before!.creditsTotal - expectedCharge);
      assert.equal(after!.creditsUsed, 0);
      if (name === "partial") process.env.NAUMI_MULTI_USER = "1";
      const audits = (await sql.query("SELECT * FROM app_image_cost_audit WHERE job_id=$1 ORDER BY id", [jobId])).rows;
      assert.equal(audits.length, qualities.length);
      assert.deepEqual(audits.map(a => a.executed_quality).sort(), [...qualities].sort());
      assert.equal(audits.reduce((n, a) => n + a.billed_credits, 0), expectedCharge);
      const cost = byok && name !== "byok-platform" ? 0 : qualities.reduce((n, q) => n + (q === "high" ? 10 : 6), 0);
      assert.equal(audits.reduce((n, a) => n + a.cost_credits, 0), cost);
      assert.equal(audits.reduce((n, a) => n + a.margin_credits, 0), expectedCharge - cost);
      if (name !== "failure") {
        assert.equal(row.snapshot.creditsUsed, expectedCharge);
        const response = await route.GET(new Request(`http://fixture.test/api/generate-image?job=${jobId}`, { headers }));
        const body = await response.json();
        assert.equal(body.creditsUsed, expectedCharge);
        assert.ok(body.images.every((im: Record<string, unknown>) => !("execution" in im)), "Internal cost metadata must stay private");
        if (name === "mixed") assert.equal((row.snapshot.quality as {executed:string}).executed, "mixed");
      }
      if (name === "byok-platform") { assert.ok(audits.every(a => a.reason === "provider-fallback")); assert.ok(wire.some(w => !w.byok && w.quality === "medium")); }
      // Crash after committed settlement/checkpoint but before final status: resume twice.
      if (name === "downgrade" || name === "byok-platform") {
        const wireBefore = wire.length;
        await sql.query("UPDATE app_image_jobs SET snapshot=snapshot || '{\"status\":\"pending\",\"paidOperationVersion\":1}',lease_until=NULL WHERE id=$1", [jobId]);
        process.env.OPENAI_IMAGE_QUALITY = "low";
        process.env.NAUMI_IMAGE_QUALITY_SUPPORTED = "0";
        const kick = () => route.POST(new Request("http://fixture.test", { method: "POST", headers: { "content-type": "application/json", "x-video-worker-secret": process.env.VIDEO_WORKER_SECRET! }, body: JSON.stringify({ workerJobId: jobId }) }));
        await kick(); await kick();
        await wait(async () => { const job = await repo.getImageJob(jobId, "generate"); return job?.snapshot.status === "done" && job.lease_token === null; });
        assert.equal(wire.length, wireBefore, "Checkpoint recovery must not call supplier again");
        assert.equal(await db.getImageJobChargedCredits(jobId), expectedCharge);
        assert.equal(Number((await sql.query("SELECT count(*) AS n FROM app_image_cost_audit WHERE job_id=$1", [jobId])).rows[0].n), qualities.length);
        const replayed = (await repo.getImageJob(jobId, "generate"))!;
        assert.deepEqual((replayed.snapshot.quality as {executedQualities:string[]}).executedQualities.sort(), [...qualities].sort());
        process.env.OPENAI_IMAGE_QUALITY = "medium"; process.env.NAUMI_IMAGE_QUALITY_SUPPORTED = "1";
      }
      console.log(`PASS ${name}: committed charge=${expectedCharge}, audit=${audits.length}, supplier cost estimate=${cost}`);
    };
    await run("success", 2, 20, ["high", "high"]);
    await run("partial", 2, 10, ["high"]);
    await run("failure", 2, 0, []);
    await run("downgrade", 1, 10, ["medium"]);
    await run("mixed", 2, 20, ["medium", "high"]);
    await run("byok-downgrade", 1, 0, ["medium"], true);
    await run("byok-platform", 1, 0, ["medium"], true);
    // Metering is frozen on submission; disable it for the next public request.
    process.env.NAUMI_MULTI_USER = "0";
    await db.setSetting("multi_user_enabled", "0");
    await db.setSetting("credits_metering", "0");
    assert.equal(await db.creditMeteringEnabled(), false);
    await run("meter-off", 1, 0, ["high"]);
    console.log("CREDIT_BILLING_RESULT=PASS");
  } finally { release?.(); await sql.end(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
