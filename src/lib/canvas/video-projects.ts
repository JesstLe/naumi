import "server-only";
import {getPool} from "@/platform/db/pool";
import {getProjectNames} from "@/lib/canvas/project-repository";
import {ensureVideoNodeSchema} from "./video-node-repository";
export async function ownedCanvasVideoProjects(actorRaw:string){
  const actor=actorRaw.toLowerCase();await ensureVideoNodeSchema();
  const [artRows,textRows,videoRows,deletedRows,names]=await Promise.all([
    getPool().query("SELECT id,title,parent_id,group_id,batch_id,origin,source_url AS source,created_at FROM app_artworks WHERE email=$1 AND deleted_at IS NULL AND status='completed' AND COALESCE(origin,'')<>'workbench' AND (COALESCE(image_url,'')<>'' OR COALESCE(video_url,'')<>'') ORDER BY created_at,id",[actor]),
    getPool().query("SELECT project_key,title FROM app_canvas_text_nodes WHERE email=$1 ORDER BY created_at,id",[actor]),
    getPool().query("SELECT project_key,title FROM app_canvas_video_nodes WHERE email=$1 AND deleted_at IS NULL ORDER BY created_at,id",[actor]),
    getPool().query("SELECT project_key FROM app_canvas_video_projects WHERE email=$1 AND deleted_at IS NOT NULL",[actor]),getProjectNames(actor)]);
  const byId=new Map(artRows.rows.map(row=>[String(row.id),row])),groups=new Map<string,{title:string;count:number;explicit:boolean}>(),projects=new Map<string,{key:string;name:string}>(),deleted=new Set(deletedRows.rows.map(row=>row.project_key));
  for(const art of artRows.rows){let root=art;const visited=new Set<string>();while(root.parent_id&&byId.has(root.parent_id)&&!visited.has(root.id)){visited.add(root.id);root=byId.get(root.parent_id)!;}
    const key=String(root.batch_id||"").startsWith("suite-")?`batch:${root.batch_id}`:`tree:${art.group_id||root.id}`,old=groups.get(key);
    groups.set(key,{title:old?.title||root.title||art.title||key,count:(old?.count||0)+1,explicit:!!old?.explicit||art.origin==="canvas"||["canvas-add","derived","upload"].includes(art.source)});
  }
  for(const [key,group] of groups)if(!deleted.has(key)&&(key.startsWith("batch:")||group.count>1||group.explicit||names[key]))projects.set(key,{key,name:names[key]||group.title});
  for(const row of [...textRows.rows,...videoRows.rows])if(!deleted.has(row.project_key)&&!projects.has(row.project_key))projects.set(row.project_key,{key:row.project_key,name:names[row.project_key]||row.title||row.project_key});
  return [...projects.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.key.localeCompare(b.key));
}
