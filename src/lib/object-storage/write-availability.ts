/** Bound repeated NAS stalls without changing R2 or public upload semantics.
 * This gate is only an admission hint. Durable local bytes and the database
 * pending-media queue remain the recovery source of truth across processes.
 */
export class WriteAvailability {
  private readyUntil = 0;
  private blockedUntil = 0;
  private checking: Promise<boolean> | null = null;
  constructor(private readonly clock: () => number = Date.now) {}

  async available(probe: () => Promise<void>): Promise<boolean> {
    const now = this.clock();
    if (now < this.blockedUntil) return false;
    if (now < this.readyUntil) return true;
    if (!this.checking) {
      this.checking = probe().then(() => {
        // A concurrent failed PUT must not be erased by a successful HEAD.
        if (this.clock() < this.blockedUntil) return false;
        this.readyUntil = this.clock() + 15000;
        return true;
      }, () => { this.failed(); return false; }).finally(() => { this.checking = null; });
    }
    return this.checking;
  }

  failed() { this.readyUntil = 0; this.blockedUntil = this.clock() + 30000; }
}

/** Keep the previous two-minute allowance for large images; small objects
 * must not block the original and both previews for two minutes each.
 * This is a total attempt budget, not a claim of progress-aware idle detection.
 */
export function nasWriteTimeout(bytes: number) {
  return Math.min(120000, 8000 + Math.ceil(bytes / (256 * 1024)) * 1000);
}
