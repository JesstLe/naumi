/** One execution lease, independent of a supplier's (up to 280s) request time.
 * Retry renewals, never paid work. A lost owner is permanently fenced locally. */
export const IMAGE_JOB_LEASE_MS = 120_000;
export const IMAGE_JOB_HEARTBEAT_MS = 25_000;

export class ImageJobLeaseLostError extends Error {
  readonly code = "IMAGE_JOB_LEASE_LOST";
  constructor() { super("任务执行权已过期"); this.name = "ImageJobLeaseLostError"; }
}

export function isImageJobLeaseLost(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let depth = 0; error && depth < 8 && !seen.has(error); depth++) {
    if (error instanceof ImageJobLeaseLostError) return true;
    seen.add(error);
    error = typeof error === "object" ? (error as { cause?: unknown }).cause : undefined;
  }
  return false;
}

export function startImageJobHeartbeat(renew: () => Promise<void>, claimedAt: number) {
  let deadline = claimedAt + IMAGE_JOB_LEASE_MS;
  let stopped = false, lost = false, failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const lose = () => { lost = true; clearTimeout(timer); clearTimeout(expiry); };
  const assertActive = () => {
    if (stopped || lost || performance.now() >= deadline) { lose(); throw new ImageJobLeaseLostError(); }
  };
  const armExpiry = () => {
    clearTimeout(expiry);
    expiry = setTimeout(lose, Math.max(0, deadline - performance.now()));
    expiry.unref?.();
  };
  const schedule = (ms: number) => {
    if (stopped || lost) return;
    timer = setTimeout(tick, Math.min(ms, Math.max(0, deadline - performance.now())));
    timer.unref?.();
  };
  const tick = async () => {
    if (stopped || lost) return;
    const started = performance.now();
    try {
      assertActive();
      await renew();
      // A late reply never resurrects this execution, even if the SQL renewed.
      if (stopped || lost) return;
      assertActive();
      deadline = started + IMAGE_JOB_LEASE_MS;
      failures = 0;
      armExpiry();
      schedule(IMAGE_JOB_HEARTBEAT_MS);
    } catch (error) {
      if (stopped || lost) return;
      if (isImageJobLeaseLost(error) || performance.now() >= deadline) { lose(); return; }
      // Single flight, 1/2/4/8s capped backoff, bounded by the last proven lease.
      schedule(Math.min(8_000, 1_000 * 2 ** Math.min(failures++, 3)));
    }
  };
  armExpiry();
  schedule(IMAGE_JOB_HEARTBEAT_MS);
  return {
    assertActive, lose,
    stop() { stopped = true; clearTimeout(timer); clearTimeout(expiry); },
  };
}
