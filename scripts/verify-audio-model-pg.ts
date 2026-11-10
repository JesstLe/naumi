import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

async function main() {
  const out = path.resolve(process.argv[2] || "output/audio-model-pg"); await mkdir(out, { recursive: true });
  if (!process.argv.includes("--child")) {
    const name = `naumi-audio-model-${randomBytes(5).toString("hex")}`, password = randomBytes(24).toString("hex"), database = "naumi_audio_model_fixture";
    const envFile = path.join(out, "disposable.env"); await writeFile(envFile, `POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${database}\n`, { mode: 0o600 });
    const docker = (args: string[]) => { const r = spawnSync("docker", args, { encoding: "utf8", windowsHide: true }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
    let container = "";
    try {
      container = docker(["run", "--rm", "--detach", "--name", name, "--label", "naumi.task=storyboard-speech-20261110", "--memory", "512m", "--tmpfs", "/var/lib/postgresql/data", "--publish", "127.0.0.1::5432", "--env-file", envFile, "postgres:16-alpine"]);
      let ready = false;
      for (let i = 0; i < 60; i++) { if (spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres", "-d", database], { windowsHide: true, stdio: "ignore" }).status === 0) { ready = true; break; } await new Promise(r => setTimeout(r, 200)); }
      assert.ok(ready);
      const port = Number(docker(["port", container, "5432/tcp"]).split(":").at(-1));
      const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/verify-audio-model-pg.ts", out, "--child"], { encoding: "utf8", windowsHide: true, env: { ...process.env, DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`, NAUMI_VERIFY_ISOLATED_DB: "1", SETTINGS_SECRET: randomBytes(32).toString("hex") } });
      process.stdout.write(result.stdout); process.stderr.write(result.stderr); assert.equal(result.status, 0);
      if(process.env.AUDIO_REGRESSION==="1")for(const script of ["verify-model-config.ts","verify-model-execution.ts","verify-model-management.ts"]){
        const regression=spawnSync(process.execPath,["--conditions=react-server","--import","tsx","scripts/"+script],{encoding:"utf8",windowsHide:true,env:{...process.env,DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/${database}`,NAUMI_VERIFY_ISOLATED_DB:"1",SETTINGS_SECRET:randomBytes(32).toString("hex")}});
        await writeFile(path.join(out,script+".txt"),regression.stdout+regression.stderr);process.stdout.write(regression.stdout);process.stderr.write(regression.stderr);assert.equal(regression.status,0,script);
      }
    } finally { if (container) docker(["stop", container]); await unlink(envFile); }
    return;
  }
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, "1"); const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/naumi_audio_model_fixture");
  const { getPool, closeDatabasePools } = await import("../src/platform/db/pool");
  const { ensureModelSchema } = await import("../src/lib/model-config/storage-schema");
  const { createModelRepository } = await import("../src/lib/model-config/repository");
  const { createCredentialStore } = await import("../src/lib/model-config/credentials");
  const { createModelExecutor } = await import("../src/lib/model-config/execution");
  const { executeSpeech, executeTranscription, AudioExecutionError } = await import("../src/lib/audio/model-execution");
  const { fixtureConfig } = await import("./billing-unit-fixture");
  const { withBiModelContext } = await import("../src/lib/bi/context");
  let calls = 0, mode = "valid", checks = 0;
  const pass = (name: string) => { checks++; console.log("AUDIO_MODEL_PG_CHECK=PASS " + name); };
  const wav = Buffer.alloc(2044); wav.write("RIFF"); wav.writeUInt32LE(2036, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(2000, 40);
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume bounded test fixture request */ }
    calls++;
    if (mode === "unknown") { response.destroy(); return; }
    if (request.url!.endsWith("transcriptions")) { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ text: "fixture", segments: [{ start: 0, end: 0.125, text: "fixture" }] })); return; }
    response.writeHead(200, { "content-type": "audio/wav", "x-request-id": "pg-audio-request" }); response.end(wav);
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`, options = { trustedOrigins: [origin] }, sql = getPool();
  try {
    await ensureModelSchema(sql); const credentials = createCredentialStore(sql), key = randomBytes(24).toString("hex");
    const credential = await credentials.importPlain({ providerId: "audio-fixture", plain: key, actor: "fixture" });
    const config = { schemaVersion: 1 as const, providers: [{ id: "audio-fixture", name: "fixture", protocol: "openai-audio" as const, baseUrl: `${origin}/v1`, credentialRef: credential.id, enabled: true, timeoutMs: 1000, maxConcurrent: 2 }],
      upstreamModels: [{ id: "audio-u", providerId: "audio-fixture", model: "wire-before", label: "fixture", modality: "audio" as const, enabled: true, parameterMap: {}, capabilities: { verified: true, generate: true, transcribe: true, edit: false, vision: false, transparent: false, preserveIdentity: false, textAccuracy: false, qualityRank: 1, qualities: [], nativeResolutions: [], maxReferenceImages: 0, expectedLatencyMs: 1,
        audio: { speech: { enabled: true, voices: ["fixture-voice"], formats: ["wav" as const], maxCharacters: 50, maxOutputBytes: 10000, instructions: false }, transcription: { enabled: true, inputFormats:["audio/wav" as const], formats: ["verbose_json" as const], timestamps: ["segment" as const], maxInputBytes: 10000, maxDurationSeconds: 1, language: false, prompt: false } } } }],
      publicModels: [{ id: "audio-p", label: "fixture", modality: "audio" as const, enabled: true, visible: true, target: { type: "upstream" as const, id: "audio-u" } }], pools: [], bindings: { "audio.speech": "audio-p", "audio.transcribe": "audio-p" } };
    config.publicModels.push({...structuredClone(config.publicModels[0]),id:"audio-standby"});
    const repo = createModelRepository({ pool: sql, initialize: async () => config, ...options }), initial = await repo.current();
    assert.equal(initial.config.upstreamModels[0].modality, "audio"); pass("real_pg_audio_snapshot_and_encrypted_credential");
    const executor = createModelExecutor({ runtime: { byVersion: repo.byVersion, prepareExecution: async () => { throw Error("unexpected image Router"); } }, credentials, gateway: () => { throw Error("unexpected image gateway"); }, ...options });
    const billing = { version: 1, config: fixtureConfig() }, actor = "audio-fixture@example.test";
    const frozen = await executor.resolve({ binding: "audio.speech", feature: "audio.speech", snapshot: initial, billing });
    const scope = await executor.describe(frozen); assert.equal(scope.channelGuard?.upstreamId, "audio-u");
    const speech = { text: "fixture", voice: "fixture-voice", format: "wav" as const };
    await withBiModelContext(actor, "audio.speech", "fixture-speech-operation", () => executeSpeech(scope, speech, options));
    let rows = (await sql.query("SELECT * FROM app_supplier_calls ORDER BY started_at")).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].phase, "speech-generation"); assert.equal(rows[0].operation_id, "fixture-speech-operation"); assert.equal(rows[0].user_email, actor); assert.equal(rows[0].public_model_id, "audio-p"); assert.equal(Number(rows[0].model_version), initial.version); assert.equal(rows[0].cost_status, "pending"); assert.equal(rows[0].amount_micros, null); pass("actual_http_supplier_ledger_exact_scope_unknown_cost_not_zero");
    const draft = await repo.draft(actor), changed = structuredClone(draft.config); changed.upstreamModels[0].model = "wire-after"; changed.upstreamModels[0].capabilities.audio!.speech!.maxCharacters = 2;
    const saved = await repo.saveDraft({ id: draft.id, expectedRevision: draft.revision, actor, config: changed });
    assert.deepEqual((await repo.draft(actor)).config, saved.config); pass("normalized_draft_roundtrip_preserves_audio_fields");
    const publication = await repo.stage({ id: randomUUID(), draftId: saved.id, expectedRevision: saved.revision, expectedVersion: initial.version, actor, reason: "audio fixture publication" });
    await repo.markApplied(publication.id, publication.digest, saved.id);
    assert.equal((await executor.describe(frozen)).connection.wireModel, "wire-before"); assert.equal((await executor.describe(frozen)).capabilities.audio?.speech?.maxCharacters, 50); pass("original_version_wire_and_capabilities_remain_frozen");
    const current = await repo.current(), fresh = await executor.resolve({ binding: "audio.speech", feature: "audio.speech", snapshot: current, billing });
    assert.equal((await executor.describe(fresh)).connection.wireModel, "wire-after");
    await assert.rejects(() => executeSpeech({ ...scope, capabilities: current.config.upstreamModels[0].capabilities }, speech, options));
    pass("new_snapshot_uses_explicit_wire_and_character_limit");
    // Publish a negative switch through the same repository, not a mutable in-memory fixture.
    const d2 = await repo.draft(actor), off = structuredClone(d2.config); off.publicModels[0].enabled = false; off.bindings = {} as typeof off.bindings;
    const s2 = await repo.saveDraft({ id: d2.id, expectedRevision: d2.revision, actor, config: off });
    const p2 = await repo.stage({id:randomUUID(),draftId:s2.id,expectedRevision:s2.revision,expectedVersion:current.version,actor,reason:"fixture audio disable"});
    await repo.markApplied(p2.id,p2.digest,s2.id);
    const before=calls;
    await assert.rejects(()=>executeSpeech(scope,speech,options),(e:unknown)=>e instanceof AudioExecutionError&&e.acceptance==="not-dispatched"&&e.code==="CHANNEL_DISABLED");
    assert.equal(calls,before);assert.equal((await sql.query("SELECT count(*) FROM app_supplier_calls")).rows[0].count,"1");pass("published_disable_blocks_frozen_new_dispatch_before_supplier_ledger");
    const restore=await repo.stageRestore({id:randomUUID(),targetVersion:initial.version,expectedVersion:(await repo.current()).version,actor,reason:"restore audio fixture original"});
    await repo.markApplied(restore.id,restore.digest);
    const asrFrozen=await executor.resolve({binding:"audio.transcribe",feature:"audio.transcribe",snapshot:initial,billing}),asrScope=await executor.describe(asrFrozen);
    const asr=await withBiModelContext(actor,"audio.transcribe","fixture-asr-operation",()=>executeTranscription(asrScope,{bytes:wav,mimeType:"audio/wav",durationSeconds:0.125,format:"verbose_json",timestamps:["segment"]},options));
    assert.equal(asr.segments?.[0].end,0.125);rows=(await sql.query("SELECT * FROM app_supplier_calls WHERE phase='transcription'")).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].operation_id,"fixture-asr-operation");assert.equal(rows[0].cost_status,"pending");pass("actual_multipart_asr_receipt_has_real_segment_and_separate_cost_phase");
    mode="unknown";const previous=calls;
    await assert.rejects(()=>withBiModelContext(actor,"audio.speech","fixture-unknown-operation",()=>executeSpeech(scope,speech,options)),(e:unknown)=>e instanceof AudioExecutionError&&e.acceptance==="unknown");
    assert.equal(calls,previous+1);const pending=(await sql.query("SELECT * FROM app_supplier_calls WHERE operation_id='fixture-unknown-operation'")).rows;
    assert.equal(pending.length,1);assert.equal(pending[0].state,"unknown");assert.equal(pending[0].cost_status,"pending");assert.equal(pending[0].amount_micros,null);pass("connection_loss_one_attempt_and_pending_cost_not_refund");
    const telemetry=(await sql.query("SELECT * FROM app_bi_model_calls WHERE email=$1 ORDER BY id",[actor])).rows;
    assert.ok(telemetry.length>=3);assert.ok(telemetry.some(r=>r.operation_id==='fixture-asr-operation'&&r.state==='succeeded'));
    assert.ok(telemetry.some(r=>r.operation_id==='fixture-unknown-operation'&&r.state==='unknown-result'));
    assert.ok(!JSON.stringify(telemetry).includes(key));pass("bi_links_original_operation_and_unknown_outcome_without_secret");
    const accounts=(await sql.query("SELECT * FROM app_supplier_accounts")).rows;assert.equal(accounts.length,1);assert.ok(!JSON.stringify(accounts).includes(key));pass("supplier_account_credential_ref_only");
    const result={checks,calls,commercialCalls:0,level:"real isolated PostgreSQL plus local HTTP audio fixture",snapshotVersion:initial.version};await writeFile(path.join(out,"RESULT.json"),JSON.stringify(result,null,2)+"\n");
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); await closeDatabasePools(); }
  console.log(`AUDIO_MODEL_PG=PASS CHECKS=${checks} HTTP_ATTEMPTS=${calls} REAL_VENDOR_CALLS=0`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
