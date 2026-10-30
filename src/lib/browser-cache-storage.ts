/** Optional browser caches must never gate a successful live read indefinitely.
 * This connection owns only disposable cache stores, never drafts or edits. */
export class BrowserCacheStorage {
  private opening?: Promise<IDBDatabase | null>;
  private connection?: IDBDatabase;
  private unavailable = false;
  private active = new Set<() => void>();

  constructor(
    private name: string,
    private version: number,
    private upgrade: (db: IDBDatabase, transaction: IDBTransaction | null) => void,
    private deadlineMs = 1500,
  ) {}

  private disable() {
    this.unavailable = true;
    for (const cancel of [...this.active]) cancel();
    try { this.connection?.close(); } catch { /* disconnected storage */ }
    this.connection = undefined;
  }

  private open(): Promise<IDBDatabase | null> {
    if (this.unavailable) return Promise.resolve(null);
    if (!this.opening) this.opening = new Promise(resolve => {
      let settled = false;
      const finish = (db: IDBDatabase | null) => {
        if (settled) { try { db?.close(); } catch {} return; }
        settled = true; clearTimeout(timer);
        if (!db) this.disable();
        this.connection = db || undefined; resolve(db);
      };
      const timer = setTimeout(() => finish(null), this.deadlineMs);
      try {
        const request = indexedDB.open(this.name, this.version);
        request.onupgradeneeded = () => {
          if (settled || this.unavailable) { request.transaction?.abort(); return; }
          try { this.upgrade(request.result, request.transaction); }
          catch { request.transaction?.abort(); finish(null); }
        };
        request.onerror = request.onblocked = () => finish(null);
        request.onsuccess = () => {
          const db = request.result;
          if (settled || this.unavailable) { db.close(); return; }
          db.onversionchange = () => { this.disable(); };
          finish(db);
        };
      } catch { finish(null); }
    });
    return this.opening;
  }

  /** Resolve on transaction completion, or fail open on any storage fault.
   * A timed-out connection is bypassed for this page session. ALL outstanding
   * callers settle; neither a stuck transaction nor its late events can pin a
   * shared request promise or publish an old value after the fallback. */
  async run<T>(stores: string | string[], mode: IDBTransactionMode, fallback: T,
    work: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
    const db = await this.open();
    if (!db || this.unavailable) return fallback;
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
      const timer = setTimeout(() => this.disable(), this.deadlineMs);
      this.active.add(cancel);
      try {
        tx = db.transaction(stores, mode);
        tx.oncomplete = () => finish(value);
        tx.onerror = tx.onabort = () => this.disable();
        work(tx, result => { if (!settled) value = result; });
      } catch { this.disable(); }
    });
  }
}
