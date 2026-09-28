import "server-only";

import { dbEnabled } from "@/lib/db";
import { recoverDueVideoTasks } from "@/lib/video/service";

// ---------------------------------------------------------------------------
// 视频后台 worker(§7):周期恢复扫描,处理"页面关闭后遗留的进行中任务"。
// 以 Next instrumentation 常驻进程内运行(单机部署);租约(poll_lock_until)
// 保证与前端惰性轮询、多实例 worker 并存时不重复下载/结算。
// ---------------------------------------------------------------------------

const SCAN_INTERVAL_MS = 20_000;
const BATCH = 3;

let started = false;
let running = false;

async function scanOnce(): Promise<void> {
  if (!dbEnabled || running) return;
  running = true;
  try {
    await recoverDueVideoTasks(BATCH);
  } catch {
    /* 无库/网络抖动:下一轮重试 */
  } finally {
    running = false;
  }
}

export function startVideoWorker(): void {
  if (started) return;
  started = true;
  // 首次延迟 15s,避开冷启动高峰;之后每 20s 扫一批
  const timer = setInterval(() => {
    void scanOnce();
  }, SCAN_INTERVAL_MS);
  timer.unref?.();
  setTimeout(() => {
    void scanOnce();
  }, 15_000).unref?.();
}
