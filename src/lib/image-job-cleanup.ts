import "server-only";
import type { PoolClient } from "pg";
import { taskFailureDiagnostic } from "./imagegen/task-diagnostics";

type CleanupStage = "claim-release" | "lease-release" | "execute" | "failure-stop" | "parent-notify" |
  "checkpoint-evidence" | "checkpoint-rollback" | "evidence-rollback" | "failure-rollback" | "client-release";
// Only missing PG cleanup codes supplement the existing task diagnostic vocabulary.
// Never accept arbitrary five-character strings or expose a job/account/token key.
const cleanupSqlStates = new Set(["08000", "08001", "08003", "08004", "08006", "22012", "25P02", "55P03", "57014", "57P02", "57P03"]);
const reported = new Map<CleanupStage, { at: number; suppressed: number }>();

/** One short line per fixed stage per minute/process, not per job or poll.
 * Diagnostics have no authority over admission, billing, retries or results. */
export function reportImageJobCleanupFailure(stage: CleanupStage, error: unknown): void {
  try {
    const now = performance.now(), previous = reported.get(stage);
    if (previous && now - previous.at < 60_000) {
      previous.suppressed = Math.min(previous.suppressed + 1, 2_147_483_647);
      return;
    }
    const suppressed = previous?.suppressed || 0;
    reported.set(stage, { at: now, suppressed: 0 });
    let code: string = taskFailureDiagnostic(error).reason || "UNCLASSIFIED";
    try {
      const value = (error as { code?: unknown } | null)?.code;
      if (code === "UNCLASSIFIED" && typeof value === "string" && cleanupSqlStates.has(value)) code = value;
    } catch { /* A diagnostic getter must not change the original outcome. */ }
    console.error(`[image-job-cleanup] stage=${stage} code=${code} suppressed=${suppressed}`);
  } catch { /* Even a failed diagnostic sink must preserve the business outcome. */ }
}

/** Only the checkpoint/failure-cleanup transactions use this lifecycle guard.
 * A failed rollback is not a clean pooled session or evidence of non-acceptance.
 * The caller keeps its original thrown value; no action/COMMIT is retried here. */
export function imageJobCleanupClient(client: PoolClient) {
  let disconnected: Error | undefined, discard = false;
  const onError = (error: Error) => { disconnected ||= error; discard = true; };
  client.on("error", onError);
  return {
    async rollback(stage: "checkpoint-rollback" | "evidence-rollback" | "failure-rollback") {
      if (disconnected) { reportImageJobCleanupFailure(stage, disconnected); return; }
      try { await client.query("ROLLBACK"); }
      catch (error) { discard = true; reportImageJobCleanupFailure(stage, error); }
    },
    release() {
      try { client.release(discard); }
      catch (error) { reportImageJobCleanupFailure("client-release", error); }
      finally { client.removeListener("error", onError); }
    },
  };
}
