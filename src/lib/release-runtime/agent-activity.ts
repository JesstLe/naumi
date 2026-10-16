import { releaseRuntimeEnabled } from "./identity";
import { beginAgentActivity, finishActivity, heartbeatActivity, unknownActivity } from "./store";

export type AgentActivity = { id: string; timer: ReturnType<typeof setInterval>; done: boolean };
export async function startAgentActivity(email: string, sessionId: string, canvas: boolean): Promise<AgentActivity | undefined> {
  if (!releaseRuntimeEnabled()) return undefined;
  const id = await beginAgentActivity(email, sessionId, canvas ? "canvas" : "workbench");
  const timer = setInterval(() => { void heartbeatActivity(id).catch(() => undefined); }, 10000); timer.unref?.();
  return { id, timer, done: false };
}
export async function endAgentActivity(activity: AgentActivity | undefined, persistenceConfirmed: boolean): Promise<void> {
  if (!activity || activity.done) return;
  activity.done = true; clearInterval(activity.timer);
  if (!persistenceConfirmed) { await unknownActivity(activity.id, "agent-persistence-unconfirmed"); return; }
  try { await finishActivity(activity.id); }
  catch (e) { await unknownActivity(activity.id, "agent-finish-unconfirmed").catch(() => undefined); throw e; }
}
