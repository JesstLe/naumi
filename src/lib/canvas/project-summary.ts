import "server-only";
import { getPool } from "@/platform/db/pool";
import { ensureSchema } from "@/lib/persistence/schema";
import { listCanvasCatalogueArtworks } from "@/lib/artworks/repository";
import { getProjectNames } from "./project-repository";
import { canvasProjects } from "./project-catalog";
import { filterCreationProjects } from "@/lib/saas/creation-access";
import { CATEGORY_LABELS,type Artwork,type Category } from "@/lib/mock-data";

/** Bounded public projection of the existing Canvas project catalogue. Never
 * returns node contents, prompts, private configuration or another actor's rows.
 * Image grouping reuses Canvas's authoritative projection, including old roots. */
export async function recentCanvasProjects(actor:string,limit=8) {
  await ensureSchema();
  const [works,names]=await Promise.all([listCanvasCatalogueArtworks(actor),getProjectNames(actor)]);
  const projected:Artwork[]=works.map(work=>({...work,category:(work.category in CATEGORY_LABELS?work.category:"main") as Category,status:work.status==="completed"?"completed":work.status==="failed"?"failed":"processing",style:work.style??undefined,ratio:work.ratio??undefined,resolution:work.resolution??undefined,source:work.source??undefined}));
  const images=canvasProjects({works:projected,names,t:()=>"未命名画布",readOnly:false,pinnedNode:null,textNodes:[],videoNodes:[]});
  const projects=new Map(images.map(p=>[p.key,{projectKey:p.key,name:p.name,cover:p.cover,updatedAt:p.latestAt}]));
  // Optional modules are inspected, not initialized by a navigation read.
  const tables=["app_canvas_text_nodes","app_canvas_video_nodes","app_canvas_director_nodes","app_canvas_character_nodes","app_canvas_scene_nodes","app_canvas_audio_nodes","app_canvas_timeline_nodes","app_canvas_comfy_nodes"];
  const available=await getPool().query<{name:string}>("SELECT name FROM unnest($1::text[]) name WHERE to_regclass(name) IS NOT NULL",[tables]);
  const rows=await Promise.all(available.rows.map(({name})=>getPool().query<{project_key:string;title:string;updated_at:Date}>(
    `SELECT DISTINCT ON (project_key) project_key,title,updated_at FROM ${name} WHERE email=$1${name==="app_canvas_text_nodes"?"":" AND deleted_at IS NULL"} ORDER BY project_key,updated_at DESC`,[actor.toLowerCase()])));
  for(const result of rows)for(const row of result.rows){
    const time=new Date(row.updated_at).toISOString(),old=projects.get(row.project_key);
    if(!old)projects.set(row.project_key,{projectKey:row.project_key,name:names[row.project_key]||row.title||"未命名画布",cover:"",updatedAt:time});
    else if(time>old.updatedAt)old.updatedAt=time;
  }
  const visible=await filterCreationProjects(actor,[...projects.values()]);
  return visible.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,Math.max(1,Math.min(limit,20)));
}
