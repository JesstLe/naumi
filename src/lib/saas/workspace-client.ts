let workspace='personal';
export const currentWorkspace=()=>workspace;
export function selectWorkspace(id:string){workspace=id||'personal';}
