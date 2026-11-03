/** Canvas display retention only. Byte caches, original files, image quality and
 * generation inputs belong to their existing modules. Visible frames are exempt;
 * only previously displayed, offscreen consumers can be asked to release. */
export const CANVAS_OFFSCREEN_FRAME_LIMIT = 16;
export const CANVAS_OFFSCREEN_PIXEL_BYTES = 128 * 1024 * 1024;
export const CANVAS_OFFSCREEN_IDLE_MS = 15_000;

type Entry = { visible: boolean; bytes: number; resident: boolean; leftAt: number; order: number; evict: () => void };
export type CanvasImageResidencyLease = {
  setVisible: (visible: boolean) => void;
  setFrame: (width: number, height: number) => void;
  clearFrame: () => void;
  dispose: () => void;
};

const pools = new WeakMap<Element, CanvasImageResidencyPool>();

class CanvasImageResidencyPool {
  private entries = new Set<Entry>();
  private timer?: ReturnType<typeof setTimeout>;
  private sequence = 0;
  private trimQueued = false;

  register(evict: () => void): CanvasImageResidencyLease {
    const entry: Entry = { visible: false, bytes: 0, resident: false, leftAt: 0, order: 0, evict };
    this.entries.add(entry);
    let disposed = false;
    return {
      setVisible: visible => {
        if (disposed || entry.visible === visible) return;
        entry.visible = visible;
        if (!visible && entry.resident) { entry.leftAt = performance.now(); entry.order = ++this.sequence; }
        this.scheduleTrim();
      },
      setFrame: (width, height) => {
        if (disposed || !(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return;
        if (!entry.resident && !entry.visible) { entry.leftAt = performance.now(); entry.order = ++this.sequence; }
        entry.resident = true;
        entry.bytes = width * height * 4;
        this.scheduleTrim();
      },
      clearFrame: () => { if (!disposed) { entry.resident = false; entry.bytes = 0; this.scheduleTrim(); } },
      dispose: () => { if (!disposed) { disposed = true; this.entries.delete(entry); this.scheduleTrim(); } },
    };
  }

  private scheduleTrim() {
    if (this.trimQueued) return;
    this.trimQueued = true;
    // One native observer batch can move an old frame in and another out. Apply
    // all visibility changes before choosing victims; an intermediate count is
    // not grounds to evict a frame that is visible by the end of that batch.
    queueMicrotask(() => { this.trimQueued = false; this.trim(); });
  }

  private trim() {
    clearTimeout(this.timer); this.timer = undefined;
    const now = performance.now();
    const offscreen = [...this.entries].filter(entry => entry.resident && !entry.visible).sort((a, b) => a.order - b.order);
    let bytes = offscreen.reduce((sum, entry) => sum + entry.bytes, 0), count = offscreen.length;
    const evicted: Entry[] = [];
    for (const entry of offscreen) {
      if (now - entry.leftAt < CANVAS_OFFSCREEN_IDLE_MS && count <= CANVAS_OFFSCREEN_FRAME_LIMIT && bytes <= CANVAS_OFFSCREEN_PIXEL_BYTES) break;
      bytes -= entry.bytes; count--; entry.resident = false; entry.bytes = 0; evicted.push(entry);
    }
    const retained = offscreen.find(entry => entry.resident);
    if (retained) this.timer = setTimeout(() => this.scheduleTrim(), Math.max(1, CANVAS_OFFSCREEN_IDLE_MS - (now - retained.leftAt)));
    // State and timer are settled before notifying React; release callbacks never
    // run for a disposed component and cannot evict another node with the same URL.
    for (const entry of evicted) if (this.entries.has(entry)) entry.evict();
  }
}

export function registerCanvasImageResidency(element: Element, evict: () => void): CanvasImageResidencyLease {
  const root = element.closest('.react-flow') ?? element.ownerDocument.documentElement;
  let pool = pools.get(root);
  if (!pool) { pool = new CanvasImageResidencyPool(); pools.set(root, pool); }
  return pool.register(evict);
}
