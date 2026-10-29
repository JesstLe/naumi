import { withBackgroundActivity } from "../release-runtime/background-activity";
import { VideoCoordinationCheckoutError } from "./coordination-pool";

type Outcome<T> = { value: T } | { checkoutError: VideoCoordinationCheckoutError };

/** A proven pre-client failure finishes the observation, then remains an error
 * to its caller. All lock-query, supplier, business and finish failures retain
 * the original release runtime's UNKNOWN handling. */
export async function withVideoCoordinationActivity<T>(
  scope: "video-workflow" | "media-job", workKey: string,
  admission: "claim" | "continuation", coordinationKey: string, action: () => Promise<T>,
  onDraining: () => Promise<T> | T,
): Promise<T> {
  const outcome = await withBackgroundActivity<Outcome<T>>(scope, workKey, admission, async () => {
    try { return { value: await action() }; }
    catch (error) {
      // A nested workflow may already have accepted work before a different
      // child's checkout fails. Only this entry's own initial lock is no-work.
      if (!(error instanceof VideoCoordinationCheckoutError) || error.coordinationKey !== coordinationKey) throw error;
      return { checkoutError: error };
    }
  }, async () => ({ value: await onDraining() }));
  if ("checkoutError" in outcome) {
    const cause = outcome.checkoutError.cause as { code?: unknown } | undefined;
    const code = typeof cause?.code === "string" && /^(?:[0-9A-Z]{5}|E[A-Z_]{2,40})$/.test(cause.code) ? cause.code : "PG_CHECKOUT_FAILED";
    console.error(`[video-coordination] scope=${scope} stage=checkout code=${code}`);
    throw outcome.checkoutError;
  }
  return outcome.value;
}
