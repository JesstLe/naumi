import { accountKey, releaseIdentity, releaseRuntimeEnabled } from "./identity";
import { beginAccountWork, finishActivity, heartbeatActivity, unknownActivity, type AcceptedParent } from "./store";

// Accepted per-account work (agent gateway calls) for release drain accounting. Unlike an agent
// run it has no session owner, so one account may run several calls concurrently.

export type AccountWork = { id: string; parent: AcceptedParent; timer: ReturnType<typeof setInterval>; done: boolean };

export async function startAccountWork(email: string, detail: string): Promise<AccountWork | undefined> {
  if (!releaseRuntimeEnabled()) return undefined;
  const id = await beginAccountWork(email, detail);
  const identity = releaseIdentity();
  const timer = setInterval(() => { void heartbeatActivity(id).catch(() => undefined); }, 10000);
  timer.unref?.();
  return { id, timer, done: false, parent: { id, account: accountKey(email), instanceId: identity.instanceId, bootId: identity.bootId } };
}

/** `confirmed=false` keeps the ambiguity visible (unknown) instead of claiming the work finished. */
export async function endAccountWork(work: AccountWork | undefined, confirmed: boolean): Promise<void> {
  if (!work || work.done) return;
  work.done = true;
  clearInterval(work.timer);
  if (!confirmed) { await unknownActivity(work.id, "account-work-outcome-unrecorded"); return; }
  try { await finishActivity(work.id, "account-work-recorded"); }
  catch (error) { await unknownActivity(work.id, "account-work-finish-unconfirmed").catch(() => undefined); throw error; }
}
