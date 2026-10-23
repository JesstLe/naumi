let workspace='personal';
let revision=0;
export const currentWorkspace=()=>workspace;
/** Detect A → B → A while an editor's asynchronous save is pending. */
export const currentWorkspaceRevision=()=>revision;
export function selectWorkspace(id:string){const next=id||'personal';if(next!==workspace){workspace=next;revision++;}}
