import { withBrowserReadDeadline } from '../browser-read-deadline';
import { MediaLoadQueue, acquireMediaSlot } from './media-loading';

// Decoding cached pixels is a different resource from downloading bytes. This
// queue bounds only Canvas candidate decodes, never already displayed frames.
export const CANVAS_IMAGE_DECODE_CONCURRENCY = 4;
export const CANVAS_IMAGE_DECODE_WAIT_MS = 30_000;
const queue = new MediaLoadQueue(CANVAS_IMAGE_DECODE_CONCURRENCY);

/** The caller owns the returned ticket until its decode completes/cancels. Queue
 * waiting has a separate deadline, so it cannot consume the active decode budget. */
export async function acquireCanvasImageDecodeSlot(signal: AbortSignal): Promise<() => void> {
  let release: (() => void) | undefined;
  try {
    return await withBrowserReadDeadline(async waiting => {
      const ticket = await acquireMediaSlot(queue, waiting);
      if (waiting.aborted) { ticket(); waiting.throwIfAborted(); }
      release = ticket;
      return ticket;
    }, { timeoutMs: CANVAS_IMAGE_DECODE_WAIT_MS, signal });
  } catch (error) {
    // Covers the boundary where the ticket resolves just as waiting expires.
    release?.();
    throw error;
  }
}
