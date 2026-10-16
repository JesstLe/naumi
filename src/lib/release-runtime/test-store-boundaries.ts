import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { releaseIdentity, ReleaseRuntimeError } from "./identity";
import { releasePeers } from "./http";
import { beginAgentActivity, beginObservedActivity, controlAdmission, finishActivity, releasePool, releaseStatus, sessionOwner } from "./store";
import { endAgentActivity, startAgentActivity } from "./agent-activity";

async function main() {
  process.env.DATABASE_URL = "postgresql://postgres:fixture-only-local@127.0.0.1:55438/release_fixture";
  process.env.NAUMI_RELEASE_RUNTIME = "1"; process.env.NAUMI_INSTANCE_ID = "fixture-boundary";
  process.env.SOURCE_COMMIT = "b".repeat(40); process.env.RELEASE_CONTROL_SECRET = "fixture-release-secret-not-for-production-32";
  process.env.NAUMI_RELEASE_BOOT_ID = randomUUID(); process.env.NAUMI_RELEASE_BOOT_SOURCE = "preload";
  process.env.NAUMI_RELEASE_ADMISSION_START = "open";
  let checks = 0;
  function check(name: string, run: () => void) { run(); checks++; console.log(`PASS ${name}`); }
  for (const origin of ["https://peer:3000", "http://8.8.8.8", "http://169.254.169.254", "http://127.0.0.1.evil.example", "http://user:password@peer:3000", "http://peer:3000/path"]) {
    process.env.NAUMI_RELEASE_PEERS = JSON.stringify({ peer: origin });
    check(`reject untrusted peer origin ${new URL(origin).hostname}`, () => assert.throws(() => releasePeers(), ReleaseRuntimeError));
  }
  process.env.NAUMI_RELEASE_PEERS = JSON.stringify({ peer: "http://candidate-web:3000" });
  check("allow explicit internal container peer", () => assert.equal(releasePeers().get("peer")?.hostname, "candidate-web"));
  const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => beginAgentActivity("a@example.test", "ag-concurrent", "workbench")));
  const accepted = attempts.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
  check("eight concurrent claims accept one run", () => assert.equal(accepted.length, 1));
  check("all other concurrent claims fail closed", () => assert.equal(attempts.filter((r) => r.status === "rejected" && r.reason.status === 409).length, 7));
  await releasePool().query("UPDATE app_release_activities SET heartbeat_at=now()-interval '60 seconds' WHERE id=$1", [accepted[0].value]);
  const stale = await releaseStatus();
  check("expired heartbeat remains active and unknown", () => assert.deepEqual([stale.observations.agentRuns, stale.observations.unknownLeases], [1, 1]));
  await finishActivity(accepted[0].value);
  const pending = await startAgentActivity("a@example.test", "ag-persist-unknown", false);
  await endAgentActivity(pending, false);
  const unconfirmed = await sessionOwner("a@example.test", "ag-persist-unknown", "workbench");
  check("unconfirmed persistence cannot become idle", () => assert.equal(unconfirmed?.state, "unknown"));
  await assert.rejects(() => beginAgentActivity("a@example.test", "ag-persist-unknown", "workbench"), (e: unknown) => e instanceof ReleaseRuntimeError && e.code === "AGENT_OWNER_UNKNOWN"); checks++; console.log("PASS unknown owner cannot be automatically reacquired");
  const acceptedWork = await beginObservedActivity("accepted-work", "local no-supplier background fixture");
  check("accepted background work has real separate lease", () => assert.ok(acceptedWork));
  check("tracked background increments without claiming all-app coverage", () => assert.equal(stale.observations.acceptedTasks, null));
  await finishActivity(acceptedWork);
  const before = await releaseStatus();
  const operationId = randomUUID();
  const drained = await controlAdmission({ ...before.identity, operationId, expectedRevision: before.admission.revision, action: "drain" });
  const after = await releaseStatus();
  check("drain persisted independently of any runtime Map", () => assert.equal(after.admission.mode, "draining"));
  await assert.rejects(() => beginAgentActivity("b@example.test", "ag-new-after-drain", "workbench"), (e: unknown) => e instanceof ReleaseRuntimeError && e.code === "RELEASE_DRAINING"); checks++; console.log("PASS durable admission rejects newly accepted runs");
  check("control returns exact changed revision", () => assert.equal(drained.admission.revision, before.admission.revision + 1));
  const id = releaseIdentity();
  await releasePool().query("UPDATE app_release_boots SET started_at=started_at-interval '1 second' WHERE instance_id=$1 AND boot_id=$2", [id.instanceId, id.bootId]);
  await assert.rejects(() => releaseStatus(), (e: unknown) => e instanceof ReleaseRuntimeError && e.code === "RELEASE_BOOT_REUSED"); checks++; console.log("PASS reused externally fixed boot is rejected");
  await releasePool().query("UPDATE app_release_boots SET started_at=$3 WHERE instance_id=$1 AND boot_id=$2", [id.instanceId, id.bootId, id.startedAt]);
  console.log(`APP_DRAIN_BOUNDARY_CHECKS=${checks}`);
  await releasePool().end();
}
void main().catch((e) => { console.error(e); process.exitCode = 1; });
