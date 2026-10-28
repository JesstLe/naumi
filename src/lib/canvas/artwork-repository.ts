import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {canvasParentCycle,changeCanvasParent} from "./parent-link";
import {writeCanvasArtworks} from "./artwork-write-repository";
import {CanvasArtworkWriteConflict,type CanvasArtworkFields} from "./artwork-write";

/** Legacy transport adapters retain their validation/return shapes. All metadata
 * updates use the same row writer and owner transaction as Canvas history. */
async function writeOne(email:string,id:string,fields:Partial<CanvasArtworkFields>,allowHidden=false,initializePosition=false):Promise<boolean>{
 try{await writeCanvasArtworks(email,[{id,fields,allowHidden,initializePosition}]);return true;}
 catch(error){if(error instanceof CanvasArtworkWriteConflict&&(!error.current||!error.current.visible))return false;throw error;}
}

export async function setArtworkPosition(emailRaw:string,id:string,x:number,y:number,initializeOnly=false):Promise<boolean>{
 await ensureSchema();if(!id||!Number.isFinite(x)||!Number.isFinite(y))return false;
 // Historical placement updates hidden metadata too, without restoring visibility.
 return writeOne(emailRaw,id,{canvasX:x,canvasY:y},true,initializeOnly);
}
export async function setArtworkCanvasLayout(emailRaw:string,id:string,x:number,y:number,width:number,height:number):Promise<boolean>{
 await ensureSchema();const px=Number(x),py=Number(y),w=Math.round(width),h=Math.round(height);
 if(!id||![px,py,w,h].every(Number.isFinite)||w<80||h<80||w>4096||h>4096)return false;
 return writeOne(emailRaw,id,{canvasX:px,canvasY:py,canvasWidth:w,canvasHeight:h});
}
export async function setArtworkCanvasSize(emailRaw:string,id:string,width:number,height:number):Promise<boolean>{
 await ensureSchema();const w=Math.round(width),h=Math.round(height);
 if(!id||![w,h].every(Number.isFinite)||w<80||h<80||w>4096||h>4096)return false;
 // Only display dimensions change; NULL auto-layout coordinates remain NULL.
 return writeOne(emailRaw,id,{canvasWidth:w,canvasHeight:h});
}
export async function setArtworkMarked(emailRaw:string,id:string,marked:boolean):Promise<boolean>{
 await ensureSchema();if(!id)return false;return writeOne(emailRaw,id,{marked});
}
export async function renameArtwork(emailRaw:string,id:string,title:string):Promise<void>{
 await ensureSchema();const t=title.trim().slice(0,80);if(!id||!t)return;
 await writeOne(emailRaw,id,{title:t},true);
}
export type CanvasGroupAssignment={id:string;canvasGroupId:string|null};
export async function setArtworkCanvasGroups(emailRaw:string,assignmentsRaw:CanvasGroupAssignment[]):Promise<CanvasGroupAssignment[]>{
 await ensureSchema();
 const assignments=Array.from(new Map(assignmentsRaw.filter(item=>item?.id).slice(0,200).map(item=>[item.id,{id:item.id,canvasGroupId:item.canvasGroupId?.trim().slice(0,120)||null}])).values());
 if(!assignments.length)return [];
 try{await writeCanvasArtworks(emailRaw,assignments.map(a=>({id:a.id,fields:{canvasGroupId:a.canvasGroupId}})));}
 catch(error){if(error instanceof CanvasArtworkWriteConflict)throw new Error("节点不存在或无权访问");throw error;}
 return assignments;
}

// 给某节点追加一个父节点(多输入):合并进 parent_ids(去重,排除自身)。
export async function addArtworkParent(
  emailRaw: string,
  id: string,
  parentId: string
): Promise<void> {
  await ensureSchema();
  if (!id || !parentId || id === parentId) return;
  const email = emailRaw.toLowerCase();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [email]);
    const { rows } = await client.query(
      `SELECT id, parent_id, parent_ids, group_id, source_url AS source
         FROM app_artworks
        WHERE email = $1 AND id = ANY($2::text[]) AND deleted_at IS NULL
        FOR UPDATE`,
      [email, [id, parentId]]
    );
    if (rows.length !== 2) throw new Error("节点不存在或无权访问");
    const target = rows.find((r) => r.id === id);
    const source = rows.find((r) => r.id === parentId);
    if (!target || !source) throw new Error("节点不存在或无权访问");
    if (target.group_id !== source.group_id) {
      throw new Error("只能连接同一项目内的节点");
    }

    // 服务端再次做防环校验，不能只依赖可被绕过的前端判断。
    const graph = await client.query(
      `SELECT id, parent_id, parent_ids, source_url AS source
         FROM app_artworks
        WHERE email = $1 AND group_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL`,
      [email, target.group_id]
    );
    if(canvasParentCycle(graph.rows.map(row=>({id:row.id,parentId:row.parent_id,parentIds:row.parent_ids,source:row.source})),id,parentId))throw new Error("连接会形成循环");
    const next=changeCanvasParent({parentId:target.parent_id,parentIds:target.parent_ids,source:target.source},parentId,true);
    await client.query("UPDATE app_artworks SET parent_id=$3,parent_ids=$4::jsonb WHERE email=$1 AND id=$2",[email,id,next.parentId,JSON.stringify(next.parentIds)]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// 剪断连线:把某个父节点从节点的血缘里移除(primary 置空 / 从 parent_ids 移除)。
export async function removeArtworkParent(
  emailRaw: string,
  id: string,
  parentId: string
): Promise<void> {
  await ensureSchema();
  if (!id || !parentId) return;
  const email = emailRaw.toLowerCase();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [email]);
    const { rows } = await client.query(
      `SELECT parent_id, parent_ids, source_url AS source FROM app_artworks
       WHERE email = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [email, id]
    );
    if (rows.length) {
      const row = rows[0];
      const next=changeCanvasParent({parentId:row.parent_id,parentIds:row.parent_ids,source:row.source},parentId,false);
      await client.query("UPDATE app_artworks SET parent_id=$3,parent_ids=$4::jsonb WHERE email=$1 AND id=$2",[email,id,next.parentId,JSON.stringify(next.parentIds)]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
