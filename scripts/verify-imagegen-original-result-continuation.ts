/** Offline historical-byte continuation, NOT an employee submission replay.
 * Run with tsx --conditions react-server; see docs/IMAGEGEN_ORIGINAL_RESULT_CONTINUATION.md.
 * Private source files are read-only. Reports contain only hashes and fixture facts. */
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join, dirname, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";
import { Pool } from "pg";
import sharp from "sharp";

type Json = Record<string, any>; // Private retained JSON is checked explicitly below, never logged.
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
function must(value: unknown, code: string): asserts value { if (!value) throw Error(code); }
function stable(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
const digest = (value: any) => sha(stable(value));
let stage = "arguments";
async function main() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) {
    must(process.argv[i].startsWith("--") && !!process.argv[i + 1] && !args.has(process.argv[i]), "INVALID_ARGUMENTS");
    args.set(process.argv[i], process.argv[i + 1]);
  }
  const allowed = ["--input", "--downloads", "--config", "--input-sha256", "--downloads-sha256", "--config-sha256", "--out", "--mode"];
  must([...args.keys()].every(k => allowed.includes(k)), "UNKNOWN_ARGUMENT");
  const required = (key: string) => { const value = args.get(key); must(value, "MISSING_ARGUMENT"); return value; };
  const mode = args.get("--mode") || "continue";
  must(mode === "baseline" || mode === "continue", "INVALID_MODE");
  const out = resolve(required("--out"));
  const paths = ["--input", "--downloads", "--config"].map(k => resolve(required(k)));
  must(paths.every(p => { const rel = relative(out, p); return rel.startsWith("..") || isAbsolute(rel); }), "OUTPUT_CONTAINS_PRIVATE_INPUT");
  const originals = await Promise.all(paths.map(p => readFile(p)));
  const pins = ["--input-sha256", "--downloads-sha256", "--config-sha256"].map(k => required(k).toLowerCase());
  originals.forEach((b, i) => must(/^[a-f0-9]{64}$/.test(pins[i]) && sha(b) === pins[i], "INPUT_HASH_MISMATCH"));
  stage = "input-proof";
  const [input, downloads, configFile] = originals.map(b => JSON.parse(b.toString("utf8"))) as Json[];
  must(input.queries?.length === 2 && downloads.results?.length === 2, "EXPECTED_TWO_SAMPLES");
  must(input.generationPosts === 0 && input.productionDbWrites === 0 && downloads.generationPosts === 0 && downloads.productionDbWrites === 0, "SOURCE_NOT_READ_ONLY");
  const version = configFile.modelVersion;
  must(configFile.accountIdentityMatch === true && configFile.productionDbWrites === 0 && configFile.supplierCalls === 0, "FROZEN_CONFIG_PROVENANCE");
  must(version?.version === 135 && digest(version.config) === version.digest, "FROZEN_CONFIG_DIGEST");
  // Ref IDs are data, not credentials. Reject secrets before creating a database or writing output.
  function noSecrets(value: any): void {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      must(!/^(keyEnc|plainKey|plain|apiKey|api_key|accessToken|authorization|secretAccessKey|privateKey)$/i.test(key), "SECRET_IN_INPUT");
      noSecrets(child);
    }
  }
  noSecrets(input); noSecrets(configFile);
  const samples: { source: Json; bytes: Buffer; proof: Json }[] = [];
  for (const [index, source] of input.queries.entries()) {
    const download = downloads.results.find((r: Json) => r.sample === index + 1);
    must(download && download.method === "GET" && download.httpStatus === 200 && download.originalOutputUrlHashMatch === true && download.authorizationSent === false && download.redirectsFollowed === 0, "DOWNLOAD_PROOF");
    must(source.query.method === "GET" && source.query.status === 200 && source.query.generationPosts === 0 && source.query.receipt.code === 200, "TASK_GET_PROOF");
    const receipt = source.query.receipt.data;
    must(receipt.id === source.call.taskId && receipt.status === "completed" && source.call.state === "completed" && source.call.delivered === 1, "TASK_ID_OR_COMPLETION");
    const images = receipt.result?.images;
    const urls = Array.isArray(images) ? images.flatMap((image: Json) => Array.isArray(image.url) ? image.url : [image.url]) : [];
    must(urls.length === 1 && typeof urls[0] === "string" && sha(urls[0]) === download.urlSha256 && source.outputHashes?.includes(download.urlSha256), "ORIGINAL_URL_HASH");
    const originalPath = resolve(dirname(paths[1]), download.path);
    must(isAbsolute(originalPath) && /\.original$/i.test(originalPath), "ORIGINAL_FILE_PATH");
    const bytes = await readFile(originalPath);
    must(bytes.length === download.bytes && sha(bytes) === download.sha256, "ORIGINAL_BYTE_HASH");
    // metadata alone is not decoding: force libvips to materialize every pixel.
    const decoded = await sharp(bytes, { failOn: "warning" }).raw().toBuffer({ resolveWithObject: true });
    const meta = await sharp(bytes).metadata();
    must(meta.format === "png" && decoded.info.width > 0 && decoded.info.height > 0 && decoded.data.length === decoded.info.width * decoded.info.height * decoded.info.channels, "ORIGINAL_FULL_DECODE");
    const quote = source.quote, frozen = source.child.payload.modelExecutions.image, plan = source.parent.payload.plan;
    must(digest(quote) === digest(source.child.payload.billingQuote), "ORIGINAL_QUOTE_MISMATCH");
    must(quote.modelVersion === 135 && quote.configVersion === 8 && frozen.modelVersion === 135 && frozen.billingVersion === 8 && plan.modelVersion === 135 && plan.billingVersion === 8 && frozen.modelDigest === version.digest, "FROZEN_VERSIONS");
    must(source.child.cost === 12 && source.child.reserved_cost === 12 && source.child.metered === true && source.child.billing_settled === false && quote.reserveCredits === 12, "ORIGINAL_BILLING_STATE");
    must(plan.request.variants === 1 && source.child.payload.p.count === 1 && source.parent.snapshot.children.generate.jobId === source.child.id && source.parent.id === `imagegen-${plan.request.operationId}`, "ORIGINAL_JOB_LINK");
    const operations = Object.values(source.child.snapshot.paidOperations) as Json[];
    must(operations.length === 1 && operations[0].state === "started" && operations[0].result === undefined, "EXPECTED_STARTED_WITHOUT_RESULT");
    samples.push({ source, bytes, proof: { sample: index + 1, originalSha256: sha(bytes), originalBytes: bytes.length, originalWidth: decoded.info.width, originalHeight: decoded.info.height, fullDecode: true, taskIdMatched: true, originalUrlHashMatched: true, quoteSha256: digest(quote), ratio: source.child.payload.p.ratio, count: source.child.payload.p.count, resolution: source.child.payload.p.resolution } });
  }
  // Exactly this disposable database; no dotenv, SSH, supplier, worker, or HTTP server.
  const connection = "postgresql://fixture:fixture-local-only@127.0.0.1:65435/goal";
  must(process.env.NAUMI_VERIFY_ISOLATED_DB === "1" && process.env.DATABASE_URL === connection, "ISOLATED_DATABASE_REQUIRED");
  const network = { httpAttempts: 0, generationPosts: 0, blockedSockets: 0, pgConnections: 0 };
  const denyHttp = (() => { network.httpAttempts++; throw Error("NETWORK_FORBIDDEN"); }) as any;
  globalThis.fetch = denyHttp;
  http.request = denyHttp; http.get = denyHttp; https.request = denyHttp; https.get = denyHttp; tls.connect = denyHttp;
  const connect = net.Socket.prototype.connect;
  (net.Socket.prototype as any).connect = function (...args: any[]) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const port = typeof first === "object" ? first.port : first;
    const host = typeof first === "object" ? first.host : args[1];
    if (Number(port) !== 65435 || host !== "127.0.0.1") { network.blockedSockets++; throw Error("NON_FIXTURE_SOCKET_FORBIDDEN"); }
    network.pgConnections++; return (connect as any).apply(this, args);
  };
  syncBuiltinESMExports();
  const schema = `original_result_${randomUUID().replace(/-/g, "")}`;
  const media = await mkdtemp(join(tmpdir(), "naumi-original-result-"));
  // Remove inherited credentials/endpoints and staging guards. No history schema bypass on a live DB.
  for (const key of Object.keys(process.env)) if (/^(PG|DATABASE|OPENAI|ANTHROPIC|GEMINI|R2_|S3_|OSS_|AWS_|STORAGE_|MEDIA_|NAUMI_|MODEL_CONFIG_|SETTINGS_SECRET|VIDEO_WORKER_SECRET|INTERNAL_APP_ORIGIN|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)/.test(key)) delete process.env[key];
  Object.assign(process.env, { DATABASE_URL: connection, PGOPTIONS: `-c search_path=${schema}`, PGSSLMODE: "disable", NAUMI_VERIFY_ISOLATED_DB: "1", NAUMI_MULTI_USER: "1", STORAGE_DRIVER: "local", MEDIA_PRIVATE: "1", MEDIA_DIR: media, SETTINGS_SECRET: "original-result-local-fixture-only-not-a-live-secret", NAUMI_STAGING_HISTORY_GUARD: "0", NAUMI_ENVIRONMENT: "test" });
  const admin = new Pool({ connectionString: connection, ssl: false, max: 1 });
  let db: typeof import("../src/lib/db") | undefined;
  let closeLocks: (() => Promise<void>) | undefined;
  let created = false;
  const report: Json = { mode, kind: "LOCAL_ORIGINAL_BYTES_CONTINUATION_NOT_EMPLOYEE_REPLAY", inputSha256: pins[0], downloadsSha256: pins[1], configSha256: pins[2], modelVersion: 135, billingVersion: 8, frozenConfigDigest: version.digest, samples: [], network, exactEmployeeReplay: 0, productionDbWrites: 0, onlineTasksRestored: 0, explicitEvidenceImport: mode === "continue" };
  try {
    stage = "isolated-schema";
    await admin.query(`CREATE SCHEMA ${schema}`); created = true;
    db = await import("../src/lib/db");
    await db.ensureSchema();
    must((await db.getPool().query("SELECT current_schema() AS schema")).rows[0].schema === schema, "SCHEMA_NOT_ISOLATED");
    const { ensureModelSchema } = await import("../src/lib/model-config/schema");
    await ensureModelSchema(db.getPool());
    await db.getPool().query("INSERT INTO app_model_config_versions(version,operation_id,actor,reason,config,digest) OVERRIDING SYSTEM VALUE VALUES($1,$2,'local-fixture','original immutable config, no active pointer',$3::jsonb,$4)", [135, randomUUID(), JSON.stringify(version.config), version.digest]);
    const { recoverStoredDelivery } = await import("../src/lib/imagegen/stored-delivery");
    const { readImagegenReceipt } = await import("../src/lib/imagegen/dispatch");
    closeLocks = (await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool;
    const { createImageJob } = await import("../src/lib/image-job-repository");
    const { createBillingService, withBillingTransaction } = await import("../src/lib/billing/service");
    const { readManagedObject } = await import("../src/lib/storage");
    const { selectedBusinessOption } = await import("../src/lib/model-config/business");
    const { selectedImagePreset } = await import("../src/lib/model-config/image-preset");
    const { finishStoredImage } = await import("../src/lib/imagegen/finish-stored-image");
    const owner = `original-result-${randomUUID()}@example.test`, other = `other-${randomUUID()}@example.test`;
    await db.getOrCreateUser(owner, "Local fixture"); await db.getOrCreateUser(other, "Other fixture");
    await withBillingTransaction(db.getPool(), tx => createBillingService().grantTx(tx, { id: randomUUID(), email: owner, amount: 200, source: "admin", reason: "local fixture funding", expiry: { unit: "years", value: 1 }, ledgerId: randomUUID(), fingerprint: randomUUID(), actor: "fixture" }));
    // Only owner/scope/email identities are remapped. Prompt and frozen parameters stay private in PG.
    function mapOwner(value: any): any {
      if (Array.isArray(value)) return value.map(mapOwner);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, ["email", "actorEmail"].includes(key) ? owner : key === "creationId" ? `fixture-${randomUUID()}` : mapOwner(child)]));
    }
    async function state(child: string) {
      return (await db!.getPool().query(`SELECT b.state,b.reserved_credits,b.charged_credits,j.billing_settled,
        (SELECT count(*)::int FROM app_ledger l WHERE l.id=b.ledger_id) ledger_count,
        (SELECT COALESCE(sum(delta),0)::int FROM app_ledger l WHERE l.id=b.ledger_id) ledger_delta,
        (SELECT count(*)::int FROM app_gen_reservations r WHERE r.job_id=b.id) reservations,
        (SELECT count(*)::int FROM app_ledger) all_ledger_count
        FROM app_billing_operations b JOIN app_image_jobs j ON j.id=b.id WHERE b.id=$1`, [child])).rows[0];
    }
    async function rejected(action: () => Promise<unknown>, code: string) {
      let rejected = false; try { await action(); } catch { rejected = true; } must(rejected, code);
    }
    for (const [index, sample] of samples.entries()) {
      stage = `sample-${index + 1}-baseline`;
      const source = sample.source, child = source.child.id, parent = source.parent.id;
      const payload = mapOwner(source.child.payload), parentPayload = mapOwner(source.parent.payload);
      // Original signed result URLs are NEVER inserted. Only the verified bytes below cross the checkpoint boundary.
      const inserted = JSON.stringify([payload, parentPayload, source.child.snapshot, source.parent.snapshot]);
      for (const image of source.query.receipt.data.result.images) for (const url of Array.isArray(image.url) ? image.url : [image.url]) must(!inserted.includes(url), "SIGNED_URL_PROPAGATION");
      await createImageJob(child, owner, "generate", source.child.snapshot, payload, source.child.cost, true, source.quote);
      await db.getPool().query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,metered) VALUES($1,$2,'imagegen',$3::jsonb,$4::jsonb,0,false)", [parent, owner, JSON.stringify(source.parent.snapshot), JSON.stringify(parentPayload)]);
      must(digest((await db.getPool().query("SELECT payload->'billingQuote' quote FROM app_image_jobs WHERE id=$1", [child])).rows[0].quote) === digest(source.quote), "IMPORTED_QUOTE_CHANGED");
      const before = await state(child);
      must(before.reserved_credits === 12 && before.charged_credits === 0 && before.reservations === 1 && before.ledger_count === 0 && before.billing_settled === false, "BASELINE_RESERVATION");
      const receipt = await readImagegenReceipt(parentPayload.plan.request.operationId, owner);
      must(receipt && receipt.recoveryAvailable !== true && receipt.artifacts.length === 0 && receipt.chargedCredits === 0, "STARTED_RECEIPT");
      await rejected(() => recoverStoredDelivery(parent, owner), "STARTED_WAS_RECOVERED");
      must(digest(await state(child)) === digest(before), "STARTED_CHANGED_BILLING");
      sample.proof.startedWithoutResult = "rejected-uncharged";
      if (mode === "baseline") { report.samples.push(sample.proof); continue; }
      stage = `sample-${index + 1}-evidence-import`;
      const checkpoint = structuredClone(source.child.snapshot);
      const operation = Object.values(checkpoint.paidOperations)[0] as Json;
      operation.state = "done";
      operation.result = [{ url: `data:image/png;base64,${sample.bytes.toString("base64")}`, execution: { quality: source.child.snapshot.quality.executed } }];
      checkpoint.localEvidenceImport = { kind: "local-verified-original-task-get-bytes", originalSha256: sample.proof.originalSha256, originalSnapshotSha256: digest(source.child.snapshot), taskGetReceiptSha256: source.query.bodySha256, sourceUrlSha256: downloads.results[index].urlSha256, automaticProductRecovery: false };
      await db.getPool().query("UPDATE app_image_jobs SET snapshot=$2::jsonb WHERE id=$1", [child, JSON.stringify(checkpoint)]);
      const importedReceipt = await readImagegenReceipt(parentPayload.plan.request.operationId, owner);
      must(importedReceipt?.recoveryAvailable === true, "LOCAL_CHECKPOINT_NOT_AVAILABLE");
      await rejected(() => recoverStoredDelivery(parent, other), "WRONG_OWNER_BYPASS");
      must(await readImagegenReceipt(parentPayload.plan.request.operationId, other) === null, "WRONG_OWNER_RECEIPT");
      await db.getPool().query("UPDATE app_image_jobs SET lease_token=$2,lease_until=now()+interval '1 hour' WHERE id=$1", [child, randomUUID()]);
      await rejected(() => recoverStoredDelivery(parent, owner), "LEASE_BYPASS");
      await db.getPool().query("UPDATE app_image_jobs SET lease_token=NULL,lease_until=NULL WHERE id=$1", [child]);
      const unknown = structuredClone(checkpoint); unknown.paidOperations["fixture-unknown"] = { state: "started", replayable: false };
      await db.getPool().query("UPDATE app_image_jobs SET snapshot=$2::jsonb WHERE id=$1", [child, JSON.stringify(unknown)]);
      await rejected(() => recoverStoredDelivery(parent, owner), "UNKNOWN_CALL_BYPASS");
      must(digest(await state(child)) === digest(before), "GUARD_CHANGED_BILLING");
      must((await db.getPool().query("SELECT count(*)::int n FROM app_artworks WHERE email=$1", [owner])).rows[0].n === index, "GUARD_SAVED_ARTWORK");
      await db.getPool().query("UPDATE app_image_jobs SET snapshot=$2::jsonb WHERE id=$1", [child, JSON.stringify(checkpoint)]);
      stage = `sample-${index + 1}-continuation`;
      const recovered = await recoverStoredDelivery(parent, owner);
      const first = await readImagegenReceipt(parentPayload.plan.request.operationId, owner);
      must(first && ["succeeded", "partial"].includes(first.status) && first.artifacts.length === 1 && first.chargedCredits === 12 && first.billingStatus === "confirmed", "CONTINUATION_RECEIPT");
      const frozen = payload.modelExecutions.image, p = payload.p;
      const post = selectedBusinessOption(version.config, frozen.feature, frozen.publicModelId)?.postprocess;
      const preset = !!selectedImagePreset(version.config, frozen.feature, frozen.publicModelId, frozen.binding);
      const expected = await finishStoredImage(sample.bytes, { final: false, post, preset, resolution: p.resolution, targetWidth: p.targetWidth, targetHeight: p.targetHeight, transparent: p.transparent });
      const saved = (await readManagedObject(first.artifacts[0].url, 64 * 1024 * 1024)).bytes;
      const pixels = await sharp(saved, { failOn: "warning" }).raw().toBuffer({ resolveWithObject: true });
      must(sha(expected) === sha(saved) && pixels.info.width === first.artifacts[0].width && pixels.info.height === first.artifacts[0].height, "FINAL_BYTES_OR_DIMENSIONS");
      must(first.artifacts[0].artworkId === `art-${child}-0`, "ARTWORK_ID_NOT_STABLE");
      const settled = await state(child);
      must(settled.state === "settled" && settled.charged_credits === 12 && settled.reserved_credits === 0 && settled.reservations === 0 && settled.billing_settled === true && settled.ledger_count === 1 && settled.ledger_delta === -12, "BILLING_NOT_EXACTLY_ONCE");
      const childAfter = (await db.getPool().query("SELECT snapshot,payload FROM app_image_jobs WHERE id=$1", [child])).rows[0];
      must(childAfter.snapshot.status === "done" && digest(childAfter.snapshot.paidOperations) === digest(checkpoint.paidOperations) && digest(childAfter.payload) === digest(payload), "CONTINUATION_CHANGED_FROZEN_SOURCE");
      const allBeforeRepeat = digest((await db.getPool().query("SELECT id,snapshot,payload,billing_settled FROM app_image_jobs ORDER BY id")).rows);
      await recoverStoredDelivery(parent, owner); await recoverStoredDelivery(parent, owner);
      const repeat = await readImagegenReceipt(parentPayload.plan.request.operationId, owner);
      must(repeat?.artifacts[0].artworkId === first.artifacts[0].artworkId && digest(await state(child)) === digest(settled) && digest((await db.getPool().query("SELECT id,snapshot,payload,billing_settled FROM app_image_jobs ORDER BY id")).rows) === allBeforeRepeat, "REPEAT_NOT_IDEMPOTENT");
      const work = await db.listArtworksByIds(owner, [first.artifacts[0].artworkId]);
      must(work.length === 1 && work[0].width === pixels.info.width && work[0].height === pixels.info.height, "ARTWORK_PERSISTENCE");
      report.samples.push({ ...sample.proof, status: first.status, complete: recovered.complete, finalSha256: sha(saved), bytesUnchanged: sha(saved) === sample.proof.originalSha256, finalBytes: saved.length, finalWidth: pixels.info.width, finalHeight: pixels.info.height, frozenProcessing: { preset, postprocessEnabled: post?.enabled === true }, chargedCredits: settled.charged_credits, reservedCredits: settled.reserved_credits, consumeLedgerEntries: settled.ledger_count, repeatedContinuationNewLedgerEntries: 0, stableArtwork: true, parentChildDone: true, guards: { wrongOwner: "rejected", activeChildLease: "rejected", mixedUnknownCall: "rejected" }, warnings: first.warnings });
    }
    must(network.httpAttempts === 0 && network.blockedSockets === 0, "UNEXPECTED_NETWORK_ATTEMPT");
    must((await db.getPool().query("SELECT count(*)::int n FROM app_model_credentials")).rows[0].n === 0, "CREDENTIALS_IMPORTED");
    must((await db.getPool().query("SELECT count(*)::int n FROM app_model_config_state WHERE active_version IS NOT NULL")).rows[0].n === 0, "CURRENT_MODEL_POINTER_CREATED");
    const wallet = (await db.getPool().query("SELECT credits_used FROM app_users WHERE email=$1", [owner])).rows[0];
    must(wallet.credits_used === (mode === "baseline" ? 24 : 0), "WALLET_RESERVATION_NOT_RELEASED");
    report.walletReserved = wallet.credits_used;
    report.result = "PASS";
  } finally {
    const previousStage = stage; stage = "cleanup";
    await closeLocks?.(); await db?.getPool().end();
    if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    report.isolatedSchemaRemoved = !created || (await admin.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [schema])).rowCount === 0;
    await admin.end();
    await rm(media, { recursive: true, force: true });
    report.privateMediaRemoved = true;
    stage = previousStage;
  }
  stage = "source-readback";
  for (const [i, path] of paths.entries()) must(sha(await readFile(path)) === pins[i], "PRIVATE_SOURCE_CHANGED");
  report.privateInputsUnchanged = true;
  await mkdir(out, { recursive: true });
  const output = join(out, `${mode}.json`);
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");
  must(JSON.parse(await readFile(output, "utf8")).result === "PASS", "REPORT_READBACK");
  if (mode === "baseline") console.log("BASELINE=PASS SAMPLES=2 STARTED_NO_RESULT=REJECTED CHARGED=0 RESERVED=24 HTTP_ATTEMPTS=0 GENERATION_POSTS=0 EXACT_EMPLOYEE_REPLAY=0 ONLINE_RESTORED=0 CLEANUP=PASS");
  else console.log(`MODIFIED=PASS SAMPLES=2 RECEIPTS=${report.samples.map((s: Json) => s.status).join(",")} CHARGED=12,12 RESERVED=0,0 REPEAT_NEW_LEDGER=0 GUARDS=PASS HTTP_ATTEMPTS=0 GENERATION_POSTS=0 EXACT_EMPLOYEE_REPLAY=0 ONLINE_RESTORED=0 CLEANUP=PASS`);
}
main().catch((error: unknown) => {
  const message = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "PRIVATE_ERROR_REDACTED";
  console.error(`ORIGINAL_RESULT_VERIFIER=FAIL STAGE=${stage} CODE=${message}`); process.exitCode = 1;
});
