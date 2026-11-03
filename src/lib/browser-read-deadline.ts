/** A bounded, cancellable browser READ, including authorization and body/decode.
 * This is not a write retry helper: a timeout says nothing about task acceptance.
 * Work must check its signal before publishing or starting I/O after an await.
 * The explicit race also settles callers if a browser API ignores cancellation. */
export function withBrowserReadDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    };
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true; cleanup();
      controller.abort(reason);
      reject(reason);
    };
    const abort = () => fail(options.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    if (options.signal?.aborted) { abort(); return; }
    options.signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => fail(new DOMException('读取超时，请重试', 'TimeoutError')), options.timeoutMs);
    void Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return work(controller.signal);
    }).then(value => {
      if (settled) return;
      settled = true; cleanup(); resolve(value);
    }, fail);
  });
}
