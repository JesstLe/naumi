/// <reference lib="webworker" />
import { traceOutline } from "./photo-outline";
declare const self: DedicatedWorkerGlobalScope;
self.onmessage = (
  event: MessageEvent<{ pixels: ArrayBuffer; width: number; height: number }>,
) => {
  const started = performance.now();
  try {
    const { pixels, width, height } = event.data;
    const result = traceOutline(new Uint8ClampedArray(pixels), width, height);
    self.postMessage({
      ok: true,
      result,
      elapsedMs: performance.now() - started,
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "轮廓处理失败",
    });
  }
};
