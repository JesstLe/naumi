import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fixtureModelConfig } from "./model-config-unit-fixture";
import { fixtureConfig } from "./billing-unit-fixture";
import { compileRouterProjection } from "../src/lib/model-config/projection";
import { createRouterControl } from "../src/lib/model-config/router-client";

async function main() {
  const routerRepository = process.env.NAUMI_VERIFY_ROUTER_SOURCE;
  assert.ok(routerRepository, "Set NAUMI_VERIFY_ROUTER_SOURCE to the checked-out Router repository");
  const model = fixtureModelConfig("https://fixture.example.invalid/v1", "bce47eb5-e8d6-48eb-aad7-6effe31754a5");
  model.pools.push({ id: "fixture-pool", modality: "image", strategy: "lowest-cost", candidates: ["u1"], rules: [{ id: "fixture-rule", priority: 10, when: { needsEdit: false, quality: ["high"] }, require: { minQualityRank: 3 } }] });
  model.publicModels[0].target = { type: "pool", id: "fixture-pool" };
  model.upstreamModels[0].parameterMap.quality = { high: "hd" };
  const billing = fixtureConfig();
  billing.costs["supplier-cost-estimate"] = { currency: "CNY", amountMicros: "290000", unit: "task", source: "manual-estimate" };
  const projection = compileRouterProjection({ version: 7, digest: "", config: model }, { version: 11, config: billing });
  const envelopeSecret = "naumi-go-wire-test-envelope-independent-secret";
  const client = createRouterControl({ baseUrl: "https://fixture.example.invalid", token: "naumi-go-wire-test-control-independent-token", envelopeSecret });
  const credential = client.seal(model.providers[0].credentialRef!, "p1", "fixture-only-provider-credential");
  const folder = await mkdtemp(join(tmpdir(), "naumi-router-wire-"));
  try {
    const file = join(folder, "projection.json");
    await writeFile(file, JSON.stringify({ ...projection.payload, credentials: [credential] }), { mode: 0o600 });
    const result = spawnSync("go", ["test", "./internal/configuration", "-run", "^TestNaumiWireProjection$", "-count=1", "-v"], { cwd: routerRepository, env: { ...process.env, NAUMI_VERIFY_CONFIG_PAYLOAD: file }, encoding: "utf8", timeout: 120000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /--- PASS: TestNaumiWireProjection/);
    console.log("PASS actual Node→Go digest, strict schema, credential envelope, task cost unit and configured routing contract");
  } finally { await rm(folder, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
