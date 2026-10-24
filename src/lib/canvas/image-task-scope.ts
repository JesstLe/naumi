import {currentWorkspace,currentWorkspaceRevision} from "../saas/workspace-client";
import {authHeader} from "../supabase";
import {ImagegenPreparationCancelled} from "../imagegen/http";

export type CanvasImageTaskScope=ReturnType<typeof captureCanvasImageTaskScope>;
/** Capture the workspace revision as well as its name: A -> B -> A is stale.
 * Account/project/mount identity is provided by the document adapter. */
export function captureCanvasImageTaskScope(owner:string,project:string|null,current:()=>boolean){
  const workspace=currentWorkspace(),revision=currentWorkspaceRevision();
  const isCurrent=()=>current()&&workspace===currentWorkspace()&&revision===currentWorkspaceRevision();
  const assertCurrent=()=>{if(!isCurrent())throw new ImagegenPreparationCancelled();};
  return {owner:owner.toLowerCase(),project:project||"workspace",workspace,isCurrent,assertCurrent};
}
export async function canvasImageTaskHeaders(scope:CanvasImageTaskScope){
  scope.assertCurrent();const headers=new Headers(await authHeader());scope.assertCurrent();
  for(const key of Array.from(headers.keys()))if(/^x-naumi-(workspace|project-context|scope|tenant(?:-id)?|creation-parent|creation-context)$/i.test(key))headers.delete(key);
  headers.set("x-naumi-workspace",scope.workspace);
  if(scope.project!=="workspace")headers.set("x-naumi-project-context",scope.project);
  return headers;
}

type View={account:string;project:string|null;epoch:number;mounted:boolean};
/** Retained UI tasks can be explicitly resumed in their original view. Each
 * attempt gets a fresh epoch, so an old continuation never revives after ABA. */
export function captureCanvasTaskOwner(owner:string,view:()=>View){
  const original=view(),workspace=currentWorkspace();
  const isVisible=()=>{const now=view();return now.mounted&&now.account===original.account&&now.project===original.project&&workspace===currentWorkspace();};
  return {workspace,isVisible,capture(){
    const epoch=view().epoch;
    return captureCanvasImageTaskScope(owner,original.project,()=>isVisible()&&epoch===view().epoch);
  }};
}
