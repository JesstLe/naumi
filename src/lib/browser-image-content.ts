import type { BrowserImageDescriptor } from './browser-image-source';

/** A byte identity, never an authorization identity. Callers must obtain a fresh
 * descriptor for EACH source before looking up bytes. Local mtime versions and
 * generated team previews are deliberately not treated as content hashes. */
export function verifiedImageContentKey(info: BrowserImageDescriptor, owner: string, generation: number) {
  if (info.account !== owner || !/^[a-f0-9]{64}$/.test(info.version) ||
      !Number.isSafeInteger(info.bytes) || info.bytes <= 0 ||
      !/^image\/(png|jpeg|webp|avif|gif)$/.test(info.contentType)) return null;
  return JSON.stringify([owner, generation, info.version, info.bytes, info.contentType]);
}

type Flight = { source: string; controller: AbortController; users: number; promise: Promise<Blob> };

/** Small, account/epoch-partitioned, verified byte LRU. Sharing a transfer must
 * not let one cancelled node abort other nodes, or let a broken signed URL for
 * one resource deny another freshly authorized resource with identical bytes. */
export class VerifiedImageContentPool {
  private ready = new Map<string, Blob>();
  private flights = new Map<string, Flight>();
  private bytes = 0;
  constructor(private maxBytes = 32 * 1024 * 1024, private maxItems = 400) {}

  remember(key: string, blob: Blob) {
    if (!blob.size || blob.size > this.maxBytes) return;
    const old = this.ready.get(key);
    if (old) this.bytes -= old.size;
    this.ready.delete(key); this.ready.set(key, blob); this.bytes += blob.size;
    while (this.bytes > this.maxBytes || this.ready.size > this.maxItems) {
      const oldest = this.ready.keys().next().value!;
      this.bytes -= this.ready.get(oldest)!.size; this.ready.delete(oldest);
    }
  }

  clear() {
    for (const flight of this.flights.values()) flight.controller.abort();
    this.flights.clear(); this.ready.clear(); this.bytes = 0;
  }

  async acquire(key: string, source: string, loadVerified: (signal: AbortSignal) => Promise<Blob>, signal: AbortSignal) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const cached = this.ready.get(key);
    if (cached) { this.ready.delete(key); this.ready.set(key, cached); return cached; }
    let flight = this.flights.get(key);
    if (!flight || flight.controller.signal.aborted) {
      const controller = new AbortController();
      // Defer the loader so the flight is registered before synchronous failures.
      const promise = Promise.resolve().then(() => loadVerified(controller.signal));
      flight = { source, controller, users: 0, promise }; this.flights.set(key, flight);
      const captured = flight;
      void promise.finally(() => { if (this.flights.get(key) === captured) this.flights.delete(key); }).catch(() => {});
    }
    const current = flight; current.users++;
    let released = false;
    const leave = () => {
      if (released) return; released = true; current.users--;
      if (!current.users && this.flights.get(key) === current) current.controller.abort();
    };
    signal.addEventListener('abort', leave, { once: true });
    try {
      let blob: Blob;
      try { blob = await current.promise; }
      catch (error) {
        if (signal.aborted || current.controller.signal.aborted || current.source === source) throw error;
        // A resource-scoped URL failure is not a denial of this other source.
        blob = await loadVerified(signal);
      }
      if (signal.aborted || current.controller.signal.aborted)
        throw new DOMException('Cancelled', 'AbortError');
      this.remember(key, blob); return blob;
    } finally { signal.removeEventListener('abort', leave); leave(); }
  }
}
