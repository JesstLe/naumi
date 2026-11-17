/** Client polling only while the view is open, with at most one request in flight. */
export function scheduleVisibleRefresh(run: () => Promise<void>, intervalMs: number, immediate = false) {
  let closed = false;
  let running = false;
  let lastStarted = -Infinity;
  const check = async () => {
    if (closed || running || document.visibilityState !== 'visible' || performance.now() - lastStarted < 1_000) return;
    running = true;
    lastStarted = performance.now();
    try { await run(); } catch { /* The caller handles its own error state. */ }
    finally { running = false; }
  };
  const timer = window.setInterval(check, intervalMs);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  if (immediate) void check();
  return () => {
    closed = true;
    window.clearInterval(timer);
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', check);
  };
}
