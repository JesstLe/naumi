import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModelFixture } from "./model-config-fixture";
import { fixtureConfig } from "./billing-unit-fixture";
import { compileRouterProjection } from "../src/lib/model-config/projection";
import { createRouterControl } from "../src/lib/model-config/router-client";
import { modelEndpointFetch } from "../src/lib/model-config/transport";

async function main() {
  let direct: Response | undefined;
  let transport: typeof fetch;
  let dropNextClaim = false;
  let acquire: (body: any) => Promise<Response> = async () => Response.json({}, { status: 503 });
  const f = await createModelFixture(async (request, response) => {
    if (request.url === "/v1/hold") { response.writeHead(200); response.write("held"); return; }
    try {
      if (request.url === "/fixture/release-direct") { await direct!.body!.cancel(); response.end("ok"); return; }
      if (request.url === "/fixture/drop-next-claim") { dropNextClaim = true; response.end("ok"); return; }
      if (request.url === "/fixture/expire-claims") { await f.sql.query("UPDATE app_model_provider_leases SET expires_at=now()-interval '1 second'"); const recovered = await transport(`${f.origin}/v1/hold`); await recovered.body!.cancel(); response.end("ok"); return; }
      if (request.url === "/fixture/assert-direct-busy") {
        await assert.rejects(transport(`${f.origin}/v1/hold`), (error: any) => error.code === "PROVIDER_BUSY"); response.end("ok"); return;
      }
      if (request.url === "/fixture/assert-empty") { assert.equal(Number((await f.sql.query("SELECT count(*) FROM app_model_provider_leases")).rows[0].count), 0); response.end("ok"); return; }
      const parts: Buffer[] = []; for await (const part of request) parts.push(part);
      const body = JSON.parse(Buffer.concat(parts).toString());
      const result = await acquire(body);
      if (body.action === "acquire" && result.status === 200 && dropNextClaim) { dropNextClaim = false; response.destroy(); return; }
      response.writeHead(result.status, { "Content-Type": "application/json" }); response.end(await result.text());
    } catch (error) { response.writeHead(500); response.end(String(error)); }
  });
  const folder = await mkdtemp(join(tmpdir(), "naumi-shared-capacity-"));
  const db = await import("../src/lib/db");
  try {
    process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
    process.env.NAUMI_ROUTER_MANAGEMENT_URL = f.origin;
    f.config.providers[0].maxConcurrent = 1;
    await f.repo.current();
    transport = modelEndpointFetch(`${f.origin}/v1`, { trustedOrigins: [f.origin] }, { providerId: "p1", maxConcurrent: 1, timeoutMs: 120000 });
    direct = await transport(`${f.origin}/v1/hold`);
    // Publish a newer mixed-routing version with a larger configured limit.
    // The retained direct task's stricter account budget must still apply.
    f.config.providers[0].maxConcurrent = 4;
    f.config.pools.push({ id: "pool", modality: "image", candidates: ["u1"], strategy: "priority", rules: [] });
    f.config.publicModels.push({ id: "pool-image", label: "Pool", modality: "image", enabled: true, visible: true, target: { type: "pool", id: "pool" } });
    const draft = await f.repo.draft("fixture");
    const saved = await f.repo.saveDraft({ id: draft.id, actor: "fixture", expectedRevision: draft.revision, config: f.config });
    const staged = await f.repo.stage({ id: randomUUID(), actor: "fixture", draftId: saved.id, expectedRevision: saved.revision, expectedVersion: 1, reason: "fixture newer pool shares retained direct account" });
    const snapshot = await f.repo.markApplied(staged.id, staged.digest);
    const billing = { version: 1, config: fixtureConfig() };
    const projection = compileRouterProjection(snapshot, billing, { trustedOrigins: [f.origin] });
    const secret = "fixture-shared-capacity-envelope-independent-secret";
    const control = createRouterControl({ baseUrl: f.origin, token: "fixture-shared-capacity-control-independent-secret", envelopeSecret: secret, trustedOrigins: [f.origin] });
    const { createModelRuntime } = await import("../src/lib/model-config/runtime");
    const runtime = createModelRuntime({ pool: f.sql, repo: f.repo, credentials: f.credentials, router: { ...control, prepare: async () => {} }, trustedOrigins: [f.origin], billing: async () => billing });
    await runtime.prepareExecution({ snapshot, billing });
    process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN = "fixture-shared-capacity-control-independent-secret";
    const { routerCapacityHandler } = await import("../src/lib/model-config/router-capacity");
    const dependencies = { pool: f.sql, repo: f.repo, runtime };
    const request = (body: unknown, token = process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN) => new Request(`${f.origin}/api/internal/model-capacity`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    assert.equal((await routerCapacityHandler(request({}, "fixture-generation-token"), dependencies)).status, 404);
    assert.equal((await routerCapacityHandler(request({ action: "acquire", modelVersion: snapshot.version, billingVersion: 1, digest: "0".repeat(64), providerId: "p1" }), dependencies)).status, 503);
    assert.equal(Number((await f.sql.query("SELECT count(*) FROM app_model_provider_leases")).rows[0].count), 1, "Unauthorized/tampered claims cannot change the held direct lease");
    acquire = body => routerCapacityHandler(new Request(`${f.origin}/api/internal/model-capacity`, { method: "POST", headers: { Authorization: `Bearer ${process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN}` }, body: JSON.stringify(body) }), { pool: f.sql, repo: f.repo, runtime });
    const payload = join(folder, "projection.json");
    await writeFile(payload, JSON.stringify({ ...projection.payload, credentials: [control.seal(f.config.providers[0].credentialRef!, "p1", f.marker)] }));
    const child = spawn("go", ["test", "./internal/configuration", "-run", "^TestNaumiDirectAndPoolCapacity$", "-count=1", "-v"], { cwd: process.env.NAUMI_VERIFY_ROUTER_SOURCE, env: { ...process.env, NAUMI_VERIFY_CONFIG_PAYLOAD: payload, NAUMI_VERIFY_CAPACITY_URL: f.origin, NAUMI_VERIFY_SUPPLIER_ORIGIN: f.origin, MODEL_CONFIG_ENVELOPE_SECRET: secret } });
    let output = ""; child.stdout.on("data", part => output += part); child.stderr.on("data", part => output += part);
    const status = await new Promise<number | null>(resolve => child.on("close", resolve));
    assert.equal(status, 0, output);
    console.log("PASS actual Node direct streaming response and Go pool share one PostgreSQL account slot");
  } finally { await direct?.body?.cancel().catch(() => {}); await db.getPool().end(); await f.cleanup(); await rm(folder, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
