import { authHeader } from "../supabase";
import { currentWorkspace, currentWorkspaceRevision } from "../saas/workspace-client";

export type CanvasDocumentScope = {
  account: string; workspace: string; project: string | null; key: string;
  documentCurrent: () => boolean; viewCurrent: () => boolean; assertView: () => void;
};

/** Actor and view identity are separate: document writes may finish after
 * project navigation, but never cross an account/workspace epoch. */
export function createCanvasDocumentContext() {
  let actor = "", key = "", actorEpoch = 0, viewEpoch = 0, mounted = true;
  let captured: CanvasDocumentScope | undefined, capturedRevision = -1;
  return {
    mount(value: boolean) { mounted = value; },
    render(account: string, project: string | null): CanvasDocumentScope {
      const workspace = currentWorkspace(), revision = currentWorkspaceRevision();
      const nextActor = JSON.stringify([account,workspace]), nextKey = JSON.stringify([account,workspace,project || "workspace"]);
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

export async function canvasDocumentHeaders(scope: CanvasDocumentScope, extra?: HeadersInit, viewRequired = false) {
  const guard = () => { if (viewRequired) scope.assertView(); else if (!scope.documentCurrent()) throw new Error("账号或工作空间已切换"); };
  guard(); const headers = new Headers(await authHeader()); guard();
  for (const key of Array.from(headers.keys())) if (/^x-naumi-(workspace|project-context|scope|tenant(?:-id)?|creation-parent|creation-context)$/i.test(key)) headers.delete(key);
  new Headers(extra).forEach((value,key) => headers.set(key,value));
  headers.set("x-naumi-workspace",scope.workspace);
  if (scope.project) headers.set("x-naumi-project-context",scope.project);
  return headers;
}

export async function canvasDocumentFetch(scope: CanvasDocumentScope, url: string, init: RequestInit = {}, viewRequired = false) {
  const headers=await canvasDocumentHeaders(scope,init.headers,viewRequired);
  if(viewRequired)scope.assertView();else if(!scope.documentCurrent())throw new Error("账号或工作空间已切换");
  return fetch(url,{...init,headers});
}
