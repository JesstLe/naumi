import { AsyncLocalStorage } from "node:async_hooks";
import process from "node:process";
import { releaseIdentity, releaseRuntimeEnabled } from "./identity";
import { currentAcceptedParent } from "./accepted-context";
import { OBSERVED_BACKGROUND_SCOPES, beginBackgroundActivity, bindBackgroundActivity, finishActivity, heartbeatActivity, unknownActivity } from "./store";
import {trackBackgroundWork} from "../worker/inflight";

export const BACKGROUND_SCOPES = OBSERVED_BACKGROUND_SCOPES;
export type BackgroundScope = typeof BACKGROUND_SCOPES[number];
type Span = { id: string; scope: BackgroundScope; admission: "claim" | "continuation"; canAdmit: boolean; timer: ReturnType<typeof setInterval> };
const backgroundKey=Symbol.for("naumi.release.background-context.v1");
const processScope=process as typeof process & {[backgroundKey]?:AsyncLocalStorage<Span>};
const contexts=processScope[backgroundKey] ||= new AsyncLocalStorage<Span>();
function acceptedParent() {
  const span=contexts.getStore(),identity=releaseIdentity();
  return span?.canAdmit?{id:span.id,account:null,instanceId:identity.instanceId,bootId:identity.bootId}:currentAcceptedParent();
}

/** The release lease observes this JS promise; original business lease/locking
 * still decides whether paid work may execute. No retry/submission occurs here. */
export async function withBackgroundActivity<T>(scope: BackgroundScope, workKey: string, admission: "claim" | "continuation", action: () => Promise<T>, onDraining: () => Promise<T> | T): Promise<T> {
  if (!releaseRuntimeEnabled()) return action();
  const parent=acceptedParent();
  const id = await beginBackgroundActivity(scope, workKey, admission, parent);
  if (!id) return onDraining();
  const timer = setInterval(() => { void heartbeatActivity(id).catch(() => undefined); }, 10000); timer.unref?.();
  const span: Span = { id, scope, admission, canAdmit: admission==="claim"||!!parent, timer };
  return contexts.run(span, async () => {
    try {
      const result = await action();
      await finishActivity(id, "background-promise-completed");
      return result;
    } catch (error) {
      // An exception is not proof that a remote accepted operation did not run.
      // Preserve ambiguity instead of making retirement see a fabricated zero.
      await unknownActivity(id, "background-promise-unconfirmed").catch(() => undefined);
      throw error;
    } finally { clearInterval(timer); }
  });
}
export async function bindBackgroundClaim(workKey: string, originalLeaseToken?: string): Promise<void> {
  if (!releaseRuntimeEnabled()) return;
  const span = contexts.getStore();
  if (!span) throw new Error("RELEASE_BACKGROUND_SCOPE_REQUIRED");
  await bindBackgroundActivity(span.id, workKey, originalLeaseToken);
}

/** Register durably before returning to a worker tick/HTTP caller, then retain
 * the lease until the detached promise really settles. */
export async function detachBackgroundActivity(scope: BackgroundScope, workKey: string, admission: "claim" | "continuation", action: () => Promise<void>, onSettled?: () => Promise<void>): Promise<boolean> {
  if (!releaseRuntimeEnabled()) { void trackBackgroundWork(action().then(() => onSettled?.())).catch(() => undefined); return true; }
  const parent=acceptedParent();
  const id = await beginBackgroundActivity(scope, workKey, admission, parent);
  if (!id) return false;
  const timer = setInterval(() => { void heartbeatActivity(id).catch(() => undefined); }, 10000); timer.unref?.();
  const span: Span = { id, scope, admission, canAdmit: admission==="claim"||!!parent, timer };
  void trackBackgroundWork(contexts.run(span, async () => {
    try { await action(); await finishActivity(id, "detached-background-completed"); return true; }
    catch { await unknownActivity(id, "detached-background-unconfirmed").catch(() => undefined); return false; }
    finally { clearInterval(timer); }
  }).then(finished => finished && onSettled ? contexts.exit(onSettled) : undefined)).catch(() => undefined);
  return true;
}
