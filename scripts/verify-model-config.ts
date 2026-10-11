import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  assert.ok(existsSync("src/lib/model-config/repository.ts"), "Versioned model registry must exist");
  const { validateModelConfig, ensureModelSchema } = await import("../src/lib/model-config/schema");
  const { canonicalConfig } = await import("../src/lib/model-config/repository");
  assert.equal(canonicalConfig({ a: 1, A: 2 }), '{"A":2,"a":1}', "digest canonicalization uses language-independent byte key order");
  assert.ok(existsSync("src/lib/model-config/bootstrap.ts"), "Existing configured defaults must be imported without paid calls");
  const f = await createModelFixture();
  const actor = "admin@example.test";
  try {
    const schema = `model_bootstrap_${randomUUID().replace(/-/g, "")}`;
    await f.sql.query(`CREATE SCHEMA ${schema}`);
    const instances = Array.from({ length: 4 }, () => new Pool({ connectionString: process.env.DATABASE_URL, ssl: false, options: `-c search_path=${schema}` }));
    try { await Promise.all(instances.map(ensureModelSchema)); }
    finally { await Promise.all(instances.map(p => p.end())); await f.sql.query(`DROP SCHEMA ${schema} CASCADE`); }
    const initial = await Promise.all([f.repo.current(), f.repo.current(), f.repo.current()]);
    assert.equal(new Set(initial.map(x => x.version)).size, 1);
    assert.equal(f.initializations(), 1, "bootstrap runs once under database lock");
    const old = initial[0];
    assert.equal(old.config.bindings["image.generate"], "image-a");
    const draft = await f.repo.draft(actor);
    const renamed = structuredClone(draft.config); renamed.publicModels[0].label = "新名称";
    const saved = await f.repo.saveDraft({ id: draft.id, expectedRevision: draft.revision, config: renamed, actor });
    assert.equal((await f.repo.current()).digest, old.digest, "draft must not affect execution");
    await assert.rejects(f.repo.saveDraft({ id: draft.id, expectedRevision: draft.revision, config: renamed, actor }), /草稿已更新/);
    await assert.rejects(f.repo.saveDraft({ id: draft.id, expectedRevision: saved.revision, config: renamed, actor: "another" }), /草稿/);
    const checks: Array<[string, (c: typeof renamed) => void]> = [
      ["dangling target", c => c.publicModels[0].target = { type: "upstream", id: "missing" }],
      ["duplicate provider", c => c.providers.push(c.providers[0])],
      ["duplicate upstream", c => c.upstreamModels.push(c.upstreamModels[0])],
      ["duplicate public model", c => c.publicModels.push(c.publicModels[0])],
      ["invalid modality", c => c.publicModels[0].modality = "video" as any],
      ["missing default", c => delete c.bindings["image.generate"]],
      ["disabled default", c => c.publicModels[0].enabled = false],
      ["no active model", c => { c.publicModels[0].enabled = false; c.bindings = {}; }],
      ["missing credential", c => c.providers[0].credentialRef = undefined],
      ["incompatible protocol", c => c.providers[0].protocol = "ark" as any],
      ["video to image", c => c.bindings["video.generate"] = "image-a"],
      ["unknown binding", c => c.bindings["execute.script"] = "image-a"],
      ["no edit capability", c => c.upstreamModels[0].capabilities.edit = false],
      ["URL credentials", c => c.providers[0].baseUrl = "https://user:pass@example.test/v1"],
      ["URL token", c => c.providers[0].baseUrl = "https://example.test/v1?api_key=secret"],
      ["URL fragment", c => c.providers[0].baseUrl = "https://example.test/#x"],
      ["metadata", c => c.providers[0].baseUrl = "http://169.254.169.254/latest"],
      ["private without allowlist", c => c.providers[0].baseUrl = "http://10.0.0.1/v1"],
      ["metadata DNS", c => c.providers[0].baseUrl = "http://metadata.google.internal/"],
      ["5K is not native", c => c.upstreamModels[0].capabilities.nativeResolutions.push("5K" as any)],
      ["parameter override", c => c.upstreamModels[0].parameterMap = { headers: { Authorization: "bad" } } as any],
      ["unknown secret field", c => (c.providers[0] as any).apiKey = f.marker],
      ["second amount table", c => (c.upstreamModels[0] as any).amountMicros = "100000"],
    ];
    for (const [name, mutate] of checks) {
      const broken = structuredClone(renamed); mutate(broken);
      assert.throws(() => validateModelConfig(broken, { trustedOrigins: [f.origin] }), name);
    }
    const pooled = structuredClone(renamed);
    pooled.pools = [{ id: "pool-a", modality: "image", strategy: "priority", candidates: ["u1"], rules: [] }];
    pooled.publicModels[0].target = { type: "pool", id: "pool-a" };
    assert.doesNotThrow(() => validateModelConfig(pooled, { trustedOrigins: [f.origin] }));
    for (const [name, mutate] of [
      ["recursive pool", (c: any) => c.pools[0].candidates = ["pool-a"]],
      ["duplicate pool", (c: any) => c.pools.push(c.pools[0])],
      ["duplicate candidate", (c: any) => c.pools[0].candidates = ["u1", "u1"]],
      ["text mixed pool", (c: any) => c.pools[0].modality = "text"],
      ["unknown rule field", (c: any) => c.pools[0].rules = [{ id: "rule-a", priority: 1, when: { script: "evil" }, require: {} }]],
    ] as const) { const broken = structuredClone(pooled); mutate(broken); assert.throws(() => validateModelConfig(broken, { trustedOrigins: [f.origin] }), name); }
    // Failure in the middle of the structured-table write must roll back all children and revision.
    await f.sql.query("CREATE FUNCTION fail_model_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture-write-failure'; END $$; CREATE TRIGGER model_failure BEFORE INSERT ON app_model_public_models FOR EACH ROW EXECUTE FUNCTION fail_model_write()");
    await assert.rejects(f.repo.saveDraft({ id: draft.id, expectedRevision: saved.revision, config: renamed, actor }), /fixture-write-failure/);
    await f.sql.query("DROP TRIGGER model_failure ON app_model_public_models");
    const recovered = await f.repo.draft(actor);
    assert.equal(recovered.revision, saved.revision);
    assert.deepEqual(recovered.config, saved.config);
    const input = { id: randomUUID(), draftId: draft.id, expectedRevision: saved.revision, expectedVersion: old.version, actor, reason: "发布验收" };
    const staged = await f.repo.stage(input), replay = await f.repo.stage(input);
    assert.equal(staged.version, replay.version);
    await assert.rejects(f.repo.stage({ ...input, actor: "other" }));
    assert.equal((await f.repo.current()).version, old.version);
    await assert.rejects(f.repo.markApplied(staged.id, "0".repeat(64)), /摘要/);
    await f.repo.markApplied(staged.id, staged.digest);
    assert.equal((await f.repo.current()).config.publicModels[0].label, "新名称");
    assert.equal((await f.repo.byVersion(old.version)).config.publicModels[0].label, "测试生图");
    const history = await f.repo.history(10);
    assert.ok(history.every(x => !JSON.stringify(x).includes(f.marker) && !("config" in x)));
    const rotated = await f.credentials.importPlain({ providerId: "p1", plain: "fixture-rotated-value", actor });
    assert.notEqual(rotated.id, f.config.providers[0].credentialRef);
    assert.equal(await f.credentials.read(f.config.providers[0].credentialRef!, "p1"), f.marker);
    await assert.rejects(f.credentials.read(f.config.providers[0].credentialRef!, "other"));
    assert.deepEqual(Object.keys(rotated).sort(), ["configured", "id", "providerId"]);
    assert.ok(!JSON.stringify(rotated).includes("fixture-rotated-value"));
    const encrypted = (await f.sql.query("SELECT key_enc FROM app_model_credentials WHERE id=$1", [f.config.providers[0].credentialRef])).rows[0].key_enc;
    assert.ok(!encrypted.includes(f.marker));
    const ghost = structuredClone(renamed); ghost.providers[0].credentialRef = randomUUID();
    const next = await f.repo.draft(actor);
    await assert.rejects(f.repo.saveDraft({ id: next.id, expectedRevision: next.revision, config: ghost, actor }), /凭据/);
    const concurrent = await Promise.allSettled(["A", "B"].map(label => {
      const config = structuredClone(next.config); config.publicModels[0].label = label;
      return f.repo.saveDraft({ id: next.id, expectedRevision: next.revision, config, actor });
    }));
    assert.equal(concurrent.filter(x => x.status === "fulfilled").length, 1);
    const { bootstrapModelConfig } = await import("../src/lib/model-config/bootstrap");
    const { validateModelEndpoint } = await import("../src/lib/model-config/schema");
    for (const url of ["http://[::ffff:169.254.169.254]/latest", "http://[::ffff:100.100.100.200]/latest", "http://[fd00:ec2::254]/latest"]) assert.throws(() => validateModelEndpoint(url, { trustedOrigins: [new URL(url).origin] }), /元数据/, "Metadata targets remain forbidden even in the operator allowlist");
    const bootstrap = await bootstrapModelConfig({ credentials: f.credentials, sources: {
      image: { baseUrl: `${f.origin}/v1`, apiKey: f.marker, models: ["gpt-image-1", "image-original"], defaultModel: "image-original", cutoutModel: "gpt-image-1", qualitySupported: false },
      text: { baseUrl: `${f.origin}/v1`, apiKey: f.marker, defaultModel: "real-text", agentModel: "agent-real", models: ["real-text"], aliases: { "text-alias": "real-text" }, visibleModels: ["text-alias"], agent: { baseUrl: `${f.origin}/agent`, apiKey: "fixture-agent-account" }, vision: { model: "reference-vision", baseUrl: `${f.origin}/reference`, apiKey: "fixture-reference-account" } },
      video: [{ id: "v1", label: "测试视频", protocol: "openai-videos", baseUrl: `${f.origin}/v1`, apiKey: f.marker, models: ["video-original"], defaultModel: "video-original", idempotencyStrategy: "header" }],
    }, trustedOrigins: [f.origin] });
    assert.equal(bootstrap.bindings["image.generate"], "image-original");
    assert.equal(bootstrap.bindings["text.generate"], "text-alias");
    assert.equal(bootstrap.bindings["agent.text"], "agent-real");
    const agent = bootstrap.publicModels.find(m => m.id === bootstrap.bindings["agent.text"])!;
    assert.equal(bootstrap.upstreamModels.find(m => m.id === agent.target.id)!.providerId, "platform-agent");
    assert.equal(bootstrap.providers.find(p => p.id === "platform-agent")!.baseUrl, `${f.origin}/agent`);
    const reference = bootstrap.publicModels.find(m => m.id === bootstrap.bindings["vision.reference"])!;
    assert.equal(bootstrap.upstreamModels.find(m => m.id === reference.target.id)!.providerId, "platform-reference");
    assert.equal(bootstrap.providers.find(p => p.id === "platform-reference")!.baseUrl, `${f.origin}/reference`);
    assert.equal(bootstrap.publicModels.filter(m => m.modality === "text" && m.visible).length, 1);
    assert.equal(bootstrap.upstreamModels.find(m => m.model === "video-original")!.providerId, "video:v1");
    assert.ok(bootstrap.upstreamModels.every(m => !m.capabilities.verified && !m.capabilities.nativeResolutions.length));
    assert.ok(!JSON.stringify(bootstrap).includes(f.marker));
    const { createRouterControl } = await import("../src/lib/model-config/router-client");
    const { importLegacyRouter } = await import("../src/lib/model-config/legacy-router");
    const control = createRouterControl({ baseUrl: f.origin, token: "fixture-legacy-control-independent-20261004", envelopeSecret: "fixture-legacy-envelope-independent-20261004", trustedOrigins: [f.origin] });
    const ref = "65f46c91-9058-416b-a7bf-710d73a364f8";
    const exported = { config: { providers: [{ id: "original-provider", protocol: "apimart-images", baseUrl: `${f.origin}/v1`, credentialRef: ref, timeoutMs: 120000, maxConcurrent: 3 }], routes: [{ id: "original-route", provider: "original-provider", upstream_model: "original-image", enabled: true, healthy: true, quality_rank: 3, expected_latency_ms: 8000, supports_edit: true, text_accuracy: false, native_4k: false }], aliases: [{ id: "naumi-image-auto", candidates: ["original-route"], strategy: "lowest-cost", minQualityRank: 1 }] }, credentials: [control.seal(ref, "original-provider", f.marker)] };
    const tx = await f.sql.connect();
    let imported;
    try { await tx.query("BEGIN"); imported = await importLegacyRouter({ exported, control, credentials: f.credentials, tx }); await tx.query("COMMIT"); }
    catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
    assert.ok(imported); assert.equal(imported.upstreamModels[0].capabilities.verified, false);
    assert.equal(imported.publicModels[0].enabled, false);
    assert.equal(await f.credentials.read(imported.providers[0].credentialRef!, imported.providers[0].id), f.marker);
    const compatible = await bootstrapModelConfig({ credentials: f.credentials, sources: { image: { baseUrl: `${f.origin}/v1`, apiKey: f.marker, models: ["naumi-image-auto"], defaultModel: "naumi-image-auto", qualitySupported: false }, router: imported, video: [] }, trustedOrigins: [f.origin] });
    assert.equal(compatible.bindings["image.generate"], "naumi-image-auto");
    assert.equal(compatible.publicModels.find(m => m.id === "naumi-image-auto")!.target.type, "upstream", "legacy defaults remain on their original direct gateway until explicit review/publication");
    assert.ok(!JSON.stringify(compatible).includes(f.marker));
    await assert.rejects(bootstrapModelConfig({ credentials: f.credentials, sources: { video: [] } }), /尚未完成/);
    console.log("PASS model registry validation, structured rollback, isolated drafts, concurrent bootstrap, immutable versions, credential retention and redaction");
  } finally { await f.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
