/** Explicit local PG/HTTP fixture. No app credentials, suppliers or remote hosts. */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { Pool } from "pg";
import { resolve } from "node:path";

const database = process.env.RELEASE_FIXTURE_DATABASE_URL || "postgresql://postgres:fixture-only-local@127.0.0.1:55438/release_fixture";
if (!/^postgres(?:ql)?:\/\/[^@]+@127\.0\.0\.1:55438\/release_fixture$/.test(database)) throw Error("LOCAL_FIXTURE_DATABASE_REQUIRED");
const pool = new Pool({ connectionString: database, max: 1 });
const secret = "fixture-release-secret-not-for-production-32";
const peers = JSON.stringify({ "fixture-a": "http://127.0.0.1:43211", "fixture-b": "http://127.0.0.1:43212" });
const children: ChildProcess[] = [];
let checks = 0;
function check(name: string, actual: unknown, expected: unknown) { assert.deepEqual(actual, expected, name); checks++; console.log(`PASS ${name}`); }
async function launch(id: string, port: number) {
  const child = spawn(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "src/lib/release-runtime/fixture-server.ts"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: database, RELEASE_CONTROL_SECRET: secret, NAUMI_RELEASE_RUNTIME: "1", NAUMI_INSTANCE_ID: id, SOURCE_COMMIT: "a".repeat(40), NAUMI_RELEASE_BOOT_ID: randomUUID(), NAUMI_RELEASE_BOOT_SOURCE: "preload", NAUMI_RELEASE_ADMISSION_START: "open", NAUMI_RELEASE_PEERS: peers, NAUMI_VIDEO_WORKER: "0", PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("FIXTURE_START_TIMEOUT")), 15000);
    child.stdout!.on("data", (b) => { if (String(b).includes("FIXTURE_READY=")) { clearTimeout(timer); resolve(); } });
    child.stderr!.on("data", (b) => process.stderr.write(b));
    child.once("exit", (code) => { if (code !== 0) { clearTimeout(timer); reject(Error(`FIXTURE_EXIT_${code}`)); } });
  }); return child;
}
async function api(port: number, method: string, path: string, body?: unknown, actor = "fixture-a", extra?: Record<string, string>) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { authorization: `Bearer ${actor}`, "content-type": "application/json", ...extra }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  return { status: response.status, data: await response.json(), headers: Object.fromEntries(response.headers) };
}
const getStatus = (port: number) => api(port, "GET", "/api/internal/release/status", undefined, "fixture-a", { "x-release-control-secret": secret });
async function change(port: number, action: "drain" | "resume", operationId = randomUUID(), expectedRevision?: number) {
  const current = (await getStatus(port)).data;
  const body = { instanceId: current.identity.instanceId, bootId: current.identity.bootId, expectedRevision: expectedRevision ?? current.admission.revision, operationId, action };
  return { ...(await api(port, "POST", "/api/internal/release/control", body, "fixture-a", { "x-release-control-secret": secret })), body };
}
async function main() {
try {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  const a = await launch("fixture-a", 43211); await launch("fixture-b", 43212);
  check("release status unauthenticated", (await api(43211, "GET", "/api/internal/release/status")).status, 404);
  const initial = (await getStatus(43211)).data;
  check("status does not invent all-app counters", [initial.observations.activeRequests, initial.observations.acceptedTasks, initial.coverage.level], [null, null, "partial"]);
  check("initial tracked Agent runs", initial.observations.agentRuns, 0);
  const start = await api(43211, "POST", "/api/agent", { sessionId: "ag-fixture-one" });
  check("accepted run starts exactly once", start.status, 200);
  check("tracked accepted Agent run is durable", (await getStatus(43211)).data.observations.agentRuns, 1);
  check("simultaneous same-account run rejected", (await api(43212, "POST", "/api/agent", { sessionId: "ag-fixture-one" })).status, 409);
  const ownerPoll = await api(43212, "GET", "/api/agent?sessionId=ag-fixture-one");
  check("poll routes to original owner", ownerPoll.data.owner.instanceId, "fixture-a");
  const claimHeaders = { "x-naumi-release-forward": ownerPoll.headers["x-fixture-forward"], "x-naumi-release-signature": ownerPoll.headers["x-fixture-signature"] };
  check("signed request remains bound to authenticated account", (await api(43211, "GET", "/api/agent?sessionId=ag-fixture-one", undefined, "fixture-b", claimHeaders)).status, 403);
  check("forward receipts prevent replay", (await api(43211, "GET", "/api/agent?sessionId=ag-fixture-one", undefined, "fixture-a", claimHeaders)).status, 409);
  const remoteStream = await fetch("http://127.0.0.1:43212/api/agent?sessionId=ag-fixture-one&stream=1", { headers: { authorization: "Bearer fixture-a" }, signal: AbortSignal.timeout(3000) });
  const remoteReader = remoteStream.body!.getReader();
  check("cross-instance SSE passes through before stream end", new TextDecoder().decode((await remoteReader.read()).value).startsWith("event: owner"), true);
  await remoteReader.cancel();
  check("steer routes to original owner", (await api(43212, "PATCH", "/api/agent", { sessionId: "ag-fixture-one", message: "adjust" })).data.steer, 1);
  check("other account cannot poll someone else's owner", (await api(43212, "GET", "/api/agent?sessionId=ag-fixture-one", undefined, "fixture-b")).status, 404);
  check("client cannot forge forwarding owner", (await api(43212, "GET", "/api/agent?sessionId=ag-fixture-one", undefined, "fixture-a", { "x-naumi-release-forward": "fake", "x-naumi-release-signature": "0".repeat(64) })).status, 403);
  const operation = await change(43211, "drain");
  check("drain CAS advances revision", [operation.status, operation.data.admission], [200, { mode: "draining", revision: 2 }]);
  const replay = await api(43211, "POST", "/api/internal/release/control", operation.body, "fixture-a", { "x-release-control-secret": secret });
  check("control retries are idempotent", replay.data, operation.data);
  check("operation reuse with another payload fails", (await api(43211, "POST", "/api/internal/release/control", { ...operation.body, action: "resume" }, "fixture-a", { "x-release-control-secret": secret })).status, 409);
  check("stale CAS rejected", (await change(43211, "resume", randomUUID(), 1)).status, 409);
  check("new run rejected on draining instance", (await api(43211, "POST", "/api/agent", { sessionId: "ag-new-draining" })).status, 503);
  check("existing run poll allowed during drain", (await api(43212, "GET", "/api/agent?sessionId=ag-fixture-one")).status, 200);
  check("stop remains on draining owner", (await api(43212, "DELETE", "/api/agent?sessionId=ag-fixture-one")).data.owner.instanceId, "fixture-a");
  check("finished run count reaches zero", (await getStatus(43211)).data.observations.agentRuns, 0);
  check("idle persisted session migrates for new turn", (await api(43212, "POST", "/api/agent", { sessionId: "ag-fixture-one" })).data.owner.instanceId, "fixture-b");
  await api(43212, "DELETE", "/api/agent?sessionId=ag-fixture-one");
  await change(43211, "resume");
  const streaming = await fetch("http://127.0.0.1:43211/api/agent", { method: "PUT", headers: { authorization: "Bearer fixture-a", "content-type": "application/json" }, body: JSON.stringify({ sessionId: "ag-fixture-sse" }) });
  const reader = streaming.body!.getReader();
  const first = await reader.read(); check("SSE first chunk arrives without response buffering", new TextDecoder().decode(first.value).startsWith("event: open"), true);
  check("open SSE counted as active tracked request", (await getStatus(43211)).data.observations.trackedRequests, 1);
  await reader.cancel();
  await new Promise((resolve) => setTimeout(resolve, 100));
  check("disconnect does not clear accepted run", (await getStatus(43211)).data.observations.agentRuns, 1);
  check("cross-instance SSE run poll retains original owner", (await api(43212, "GET", "/api/agent?sessionId=ag-fixture-sse")).data.owner.instanceId, "fixture-a");
  await api(43212, "DELETE", "/api/agent?sessionId=ag-fixture-sse");
  await api(43211, "POST", "/api/agent", { sessionId: "ag-crash-unknown" });
  const oldBoot = (await getStatus(43211)).data.identity.bootId;
  a.kill("SIGKILL"); await once(a, "exit");
  await launch("fixture-a", 43211);
  const restarted = (await getStatus(43211)).data;
  check("restart has unique boot", restarted.identity.bootId !== oldBoot, true);
  check("orphan accepted work remains unknown", restarted.observations.unknownLeases > 0, true);
  check("orphan sessions are not falsely zero", restarted.observations.agentSessions, null);
  check("retry after owner boot death is blocked", (await api(43212, "POST", "/api/agent", { sessionId: "ag-crash-unknown" })).status, 409);
  const durable = await pool.query("SELECT count(*)::int AS count FROM app_release_activities WHERE session_id='ag-crash-unknown' AND activity_kind='agent-run'");
  check("unknown restart never re-submits run", durable.rows[0].count, 1);
  console.log(`APP_DRAIN_CHECKS=${checks}`);
} finally {
  for (const child of children) if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
  await pool.end();
}

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
