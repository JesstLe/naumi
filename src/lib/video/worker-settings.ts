import { runtimePositiveInteger } from "../runtime/positive-integer";

/** These bounds match the due-task repository and workflow recovery contracts,
 * not supplier concurrency. The separate HTTP tick caller owns its cadence. */
export function videoWorkerSettings(env: NodeJS.ProcessEnv = process.env) {
  return {
    intervalMs: runtimePositiveInteger(env, "NAUMI_VIDEO_SCAN_INTERVAL_MS", 20_000, 2_147_483_647),
    batch: runtimePositiveInteger(env, "NAUMI_VIDEO_SCAN_BATCH", 3, 20),
    workflowBatch: runtimePositiveInteger(env, "NAUMI_VIDEO_WORKFLOW_BATCH", 2, 10),
  };
}
