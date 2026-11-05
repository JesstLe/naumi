import { withBackgroundActivity } from "@/lib/release-runtime/background-activity";
import "server-only";

import { dbEnabled } from "@/platform/db/pool";
import { recoverDueVideoTasks } from "@/lib/video/runtime";
import { recoverDurableImageJobs } from "@/lib/worker/image-recovery";
import { scanSupplierCostsOnce } from "@/lib/supplier-cost/worker";
import { recoverVideoWorkflows } from "./workflow";
import { videoWorkerSettings } from "./worker-settings";
import { applicationTasksRunHere, deferApplicationTask } from "../application/task-execution";

// Shared by layout/tick route bundles in this process. Cross-process ownership
// still belongs to the existing leases/advisory locks, not this local guard.
const key = Symbol.for("naumi.video.worker.v1");
type Lane = "video" | "image" | "reference" | "supplier-cost";
type WorkerState = {
  scan?: Promise<number>;
  started?: boolean;
  stopped?: boolean;
  controller?: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  initialTimer?: ReturnType<typeof setTimeout>;
  lanes: Partial<Record<Lane, Promise<void>>>;
  stopping?: Promise<void>;
};
const holder = process as typeof process & { [key]?: WorkerState };
const state = holder[key] ||= { lanes: {} };

async function recoverPhase(name: string, run: () => Promise<number>): Promise<number> {
  try { return await run(); }
  catch {
    // A failed scan is not a failed paid task. Keep the task's original
    // operation/lease/UNKNOWN state and allow independent lanes to progress.
    console.error(`[video-worker] ${name} recovery failed; retained for next scan`);
    return 0;
  }
}

export async function scanVideoWorkerOnce(): Promise<number> {
  if (!dbEnabled || await deferApplicationTask()) return 0;
  if (state.stopping || state.stopped) return 0;
  if (state.scan) return state.scan;
  // Validate before the recovery catch: bad settings are not network jitter.
  const settings = videoWorkerSettings();
  state.scan = Promise.resolve().then(() => withBackgroundActivity(
    "app-worker-scan", "video-worker-scan", "claim", async () => {
      const processed = await recoverPhase("video", () => recoverDueVideoTasks(settings.batch));
      return processed + await recoverPhase("workflow", () => recoverVideoWorkflows(settings.workflowBatch));
    }, () => 0,
  )).finally(() => { state.scan = undefined; });
  return state.scan;
}

export function startVideoWorker(): void {
  if (!applicationTasksRunHere()) return;
  if (state.started || state.stopping) return;
  // An explicit restart also re-enables externally driven scans, without
  // enabling an embedded timer when the deployment deliberately disables it.
  if (process.env.NAUMI_VIDEO_WORKER === "0") { state.stopped = false; return; }
  const settings = videoWorkerSettings();
  state.stopped = false;
  state.started = true;
  const controller = state.controller = new AbortController();
  const lane = (name: Lane, run: () => Promise<unknown>) => {
    if (!state.started || state.lanes[name]) return;
    // Independent single-flight lanes: a slow image/reference promise must not
    // overlap itself OR block the next video/cost scan. No backlog of timers.
    state.lanes[name] = Promise.resolve().then(() => state.started ? run() : undefined)
      .then(() => {}, () => { console.error(`[video-worker] ${name} scan failed; retained for next cycle`); })
      .finally(() => { delete state.lanes[name]; });
  };
  const cycle = () => {
    lane("video", scanVideoWorkerOnce);
    lane("image", () => recoverDurableImageJobs({ signal: controller.signal }));
    lane("reference", () => import("../reference-workbench/service").then(m => m.recoverReferenceWorkbench()));
    lane("supplier-cost", scanSupplierCostsOnce);
  };
  state.timer = setInterval(cycle, settings.intervalMs);
  state.timer.unref?.();
  state.initialTimer = setTimeout(() => { state.initialTimer = undefined; cycle(); }, 15_000);
  state.initialTimer.unref?.();
}

/** Explicit local teardown after admission has drained. No competing signal
 * handlers or synthetic cancellation of already-accepted supplier operations. */
export function stopVideoWorker(): Promise<void> {
  if (state.stopping) return state.stopping;
  state.started = false;
  state.stopped = true;
  // Cancel only this embedded scan's future dequeue/phase admissions. Accepted
  // sends retain their original signal and Promise; stop still awaits them.
  state.controller?.abort();
  if (state.timer) clearInterval(state.timer);
  if (state.initialTimer) clearTimeout(state.initialTimer);
  state.timer = undefined;
  state.initialTimer = undefined;
  state.stopping = Promise.allSettled([...Object.values(state.lanes), state.scan]).then(() => {}).finally(() => {
    state.controller = undefined;
    state.stopping = undefined;
  });
  return state.stopping;
}
