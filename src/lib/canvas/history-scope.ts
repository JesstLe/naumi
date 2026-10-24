import { authHeader } from "../supabase";
import { currentWorkspace, currentWorkspaceRevision } from "../saas/workspace-client";
import { canvasHistoryScope } from "./history-model";

export type CanvasHistoryScope = {
  account: string; workspace: string; project: string | null; key: string;
  documentCurrent: () => boolean; viewCurrent: () => boolean; assertView: () => void;
};

/** Actor and view epochs differ: a committed edit may update account-wide data
 * after project navigation, but never another account/workspace or an ABA view. */
export function createCanvasHistoryContext() {
  let actor = "", key = "", actorEpoch = 0, viewEpoch = 0, mounted = true;
  let captured: CanvasHistoryScope | undefined, capturedRevision = -1;
  return {
    mount(value: boolean) { mounted = value; },
    render(account: string, project: string | null): CanvasHistoryScope {
      const workspace = currentWorkspace(), revision = currentWorkspaceRevision();
      const nextActor = JSON.stringify([account,workspace]), nextKey = canvasHistoryScope(account,workspace,project);
      if (captured && nextKey === key && revision === capturedRevision) return captured;
      if (nextActor !== actor) { actor = nextActor; actorEpoch++; }
      if (nextKey !== key) { key = nextKey; viewEpoch++; }
      const capturedActor = actorEpoch, capturedView = viewEpoch;
      const documentCurrent = () => mounted && capturedActor === actorEpoch && workspace === currentWorkspace() && revision === currentWorkspaceRevision();
      const viewCurrent = () => documentCurrent() && capturedView === viewEpoch;
      const assertView = () => { if (!viewCurrent()) throw new Error("账号或项目已切换，请返回原画布操作"); };
      capturedRevision = revision;
      captured = {account,workspace,project,key:nextKey,documentCurrent,viewCurrent,assertView};
      return captured;
    },
  };
}

export class CanvasHistoryRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Captured headers are applied AFTER auth; a delayed auth never switches owner
 * or workspace for a queued write. The response itself may represent a commit
 * even if navigation occurred while the request was on the wire. */
export async function postCanvasHistory(scope: CanvasHistoryScope, body: unknown) {
  scope.assertView(); const headers = new Headers(await authHeader()); scope.assertView();
  for (const key of Array.from(headers.keys())) if (/^x-naumi-(workspace|project-context|scope|tenant(?:-id)?|creation-parent|creation-context)$/i.test(key)) headers.delete(key);
  headers.set("content-type","application/json"); headers.set("x-naumi-workspace",scope.workspace);
  if (scope.project) headers.set("x-naumi-project-context",scope.project);
  const response = await fetch("/api/canvas/history",{method:"POST",headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20_000)});
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new CanvasHistoryRequestError(data?.error || "画布保存失败，请重试",response.status);
  if (!data?.ok) throw new Error("画布保存结果待核实，请重试原操作");
  return {persisted: data.persisted !== false};
}
