/** Optional browser caches must never gate a successful live read indefinitely.
 * This connection owns only disposable cache stores, never drafts or edits. */
export class BrowserCacheStorage {
  private opening?: Promise<IDBDatabase | null>;
  private connection?: IDBDatabase;
  private generation = 0;
  private retryAt = 0;
  private retryDelayMs = 15_000;
  private recovering = false;
  private probeActive = false;
  private active = new Set<() => void>();

  constructor(
    private name: string,
    private version: number,
    private upgrade: (db: IDBDatabase, transaction: IDBTransaction | null) => void,
    private deadlineMs = 1500,
  ) {}

  private disable(generation: number) {
    if (generation !== this.generation) return;
    // Fence late open/transaction events before cancelling their callbacks.
    this.generation++;
    this.retryAt = performance.now() + this.retryDelayMs;
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, 120_000);
    this.recovering = true; this.probeActive = false;
    for (const cancel of [...this.active]) cancel();
    try { this.connection?.close(); } catch { /* disconnected storage */ }
    this.connection = undefined;
    this.opening = undefined;
  }

  private open(): Promise<IDBDatabase | null> {
    if (this.retryAt) {
      if (performance.now() < this.retryAt) return Promise.resolve(null);
      // Demand-driven recovery: no background retry timer or polling loop.
      this.retryAt = 0; this.opening = undefined;
    }
    if (!this.opening) this.opening = new Promise(resolve => {
      const generation = this.generation;
      let settled = false;
      const finish = (db: IDBDatabase | null) => {
        if (settled) { try { db?.close(); } catch {} return; }
        settled = true; clearTimeout(timer);
        if (generation !== this.generation) {
          try { db?.close(); } catch {} resolve(null); return;
        }
        if (!db) this.disable(generation);
        this.connection = db || undefined; resolve(db);
      };
      const timer = setTimeout(() => finish(null), this.deadlineMs);
      try {
        const request = indexedDB.open(this.name, this.version);
        request.onupgradeneeded = () => {
          if (settled || generation !== this.generation) { request.transaction?.abort(); return; }
          try { this.upgrade(request.result, request.transaction); }
          catch { request.transaction?.abort(); finish(null); }
        };
        request.onerror = request.onblocked = () => finish(null);
        request.onsuccess = () => {
          const db = request.result;
          if (settled || generation !== this.generation) { db.close(); return; }
          db.onversionchange = () => { this.disable(generation); };
          finish(db);
        };
      } catch { finish(null); }
    });
    return this.opening;
  }

  /** Resolve on transaction completion, or fail open on any storage fault.
   * A timed-out connection is bypassed during backoff. One demand-driven probe
   * can restore caching; other callers continue without waiting on that probe.
   * All outstanding callers settle; neither a stuck transaction nor its late events can pin a
   * shared request promise or publish an old value after the fallback. */
  async run<T>(stores: string | string[], mode: IDBTransactionMode, fallback: T,
    work: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
    if (this.recovering) {
      if (performance.now() < this.retryAt || this.probeActive) return fallback;
      this.probeActive = true;
    }
    const db = await this.open();
    if (!db || db !== this.connection || this.retryAt) return fallback;
    const generation = this.generation;
    return new Promise(resolve => {
      let tx: IDBTransaction | undefined, settled = false, value = fallback;
      const finish = (result: T) => {
        if (settled) return;
        settled = true; clearTimeout(timer); this.active.delete(cancel); resolve(result);
      };
      const cancel = () => {
        finish(fallback);
        try { tx?.abort(); } catch { /* already committed or closed */ }
      };
      const timer = setTimeout(() => this.disable(generation), this.deadlineMs);
      this.active.add(cancel);
      try {
        tx = db.transaction(stores, mode);
        tx.oncomplete = () => {
          if (settled || generation !== this.generation) return;
          this.recovering = false; this.probeActive = false; this.retryDelayMs = 15_000;
          finish(value);
        };
        tx.onerror = tx.onabort = () => { if (!settled) this.disable(generation); };
        work(tx, result => { if (!settled) value = result; });
      } catch { this.disable(generation); }
    });
  }
}
