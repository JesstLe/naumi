/** setTimeout for read-only polling loops: when the delay elapses while the page
 * is hidden, the callback waits and runs as soon as the page is visible again.
 * Observers of durable server state (task lists, node documents, presence) only
 * matter to a person looking at the page; a hidden tab left open all night must
 * not keep the same request rate. Never use it for work the client itself drives. */
export function visibleTimeout(callback: () => void, delay: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined, cancelled = false;
  const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
  const onVisible = () => {
    if (hidden()) return;
    document.removeEventListener("visibilitychange", onVisible);
    if (!cancelled) callback();
  };
  timer = setTimeout(() => {
    timer = undefined;
    if (cancelled) return;
    if (hidden()) document.addEventListener("visibilitychange", onVisible);
    else callback();
  }, delay);
  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  };
}
