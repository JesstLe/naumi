let workspace='personal';
let revision=0;
export const WORKSPACE_SELECTION='naumi:workspace-selected';
export const currentWorkspace=()=>workspace;
export const currentWorkspaceRevision=()=>revision;
export function selectWorkspace(id:string){
 const next=id||'personal';if(next===workspace)return;
 workspace=next;revision++;
 if(typeof window!=='undefined')window.dispatchEvent(new Event(WORKSPACE_SELECTION));
}
