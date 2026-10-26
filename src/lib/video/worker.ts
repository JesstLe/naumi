import { withBackgroundActivity } from "@/lib/release-runtime/background-activity";
import "server-only";

import { dbEnabled } from "@/platform/db/pool";
import { recoverDueVideoTasks } from "@/lib/video/service";
import { recoverDurableImageJobs } from "@/lib/worker/image-recovery";
import { scanSupplierCostsOnce } from "@/lib/supplier-cost/worker";
import {recoverVideoWorkflows} from "./workflow";
import {applicationTasksRunHere} from "../application/task-execution";

// ---------------------------------------------------------------------------
// 视频后台 worker(§7):周期恢复扫描,处理"页面关闭后遗留的进行中任务"。
// 以 Next instrumentation 常驻进程内运行(单机部署);租约(poll_lock_until)
// 保证与前端惰性轮询、多实例 worker 并存时不重复下载/结算。
// ---------------------------------------------------------------------------

const SCAN_INTERVAL_MS = 20_000;
const BATCH = 3;

let started = false;
let running = false;

async function scanVideoWorkerOnceLocal(): Promise<number> {
  if (!dbEnabled || running) return 0;
  running = true;
  try {
    const processed=await recoverDueVideoTasks(BATCH);
    return processed+await recoverVideoWorkflows(2);
  } catch {
    /* 无库/网络抖动:下一轮重试 */
    return 0;
  } finally {
    running = false;
  }
}

export function startVideoWorker(): void {
  if(!applicationTasksRunHere())return;
  if (process.env.NAUMI_VIDEO_WORKER === "0") return;
  if (started) return;
  started = true;
  // 首次延迟 15s,避开冷启动高峰;之后每 20s 扫一批
  const timer = setInterval(() => {
    void scanVideoWorkerOnce().catch(()=>{});
    void recoverDurableImageJobs().catch(() => {});
    void import("../reference-workbench/service").then(m=>m.recoverReferenceWorkbench()).catch(()=>{});
    void scanSupplierCostsOnce();
  }, SCAN_INTERVAL_MS);
  timer.unref?.();
  setTimeout(() => {
    void scanVideoWorkerOnce().catch(()=>{});
    void recoverDurableImageJobs().catch(() => {});
    void import("../reference-workbench/service").then(m=>m.recoverReferenceWorkbench()).catch(()=>{});
    void scanSupplierCostsOnce();
  }, 15_000).unref?.();
}

export async function scanVideoWorkerOnce():Promise<number> {
  return withBackgroundActivity("app-worker-scan", "video-worker-scan", "claim", () => scanVideoWorkerOnceLocal(), () => 0);
}
