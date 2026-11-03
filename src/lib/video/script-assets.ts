import {ensureVideoScriptSchema as ensureScriptSchema} from "@/lib/video/storage-schema";
import {canvasTextContent} from "../canvas/text-content";
import "server-only";
import {createHash} from "node:crypto";
import {z} from "zod";

import {getPool} from "@/platform/db/pool";
import { authorizeVideoProject } from "../canvas/project-access";


import { videoNodeIdSchema } from "../canvas/video-node-schema";
import { videoProjectKeySchema } from "../canvas/project-key";
import {ModelConfigError} from "../model-config/types";
import {adaptiveCanvasImageSize} from "../canvas/image-size";

export const videoScriptAssetSchema=z.strictObject({
  operationId:z.uuid(),projectKey:videoProjectKeySchema,title:z.string().trim().min(1).max(200),
  content:z.string().min(1).max(65536).optional(),sourceNodeId:videoNodeIdSchema.optional(),
  referenceNodeId:videoNodeIdSchema.optional(),
  start:z.number().int().min(0).max(65536).optional(),end:z.number().int().min(1).max(65536).optional(),
  expectedSourceSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).superRefine((value,ctx)=>{
  const slice=!!value.sourceNodeId;
  if(slice ? value.content!==undefined||value.referenceNodeId!==undefined||value.start===undefined||value.end===undefined||value.start>=value.end : value.content===undefined||value.start!==undefined||value.end!==undefined||value.expectedSourceSha256!==undefined&&!value.referenceNodeId)
    ctx.addIssue({code:"custom",message:"保存完整原稿或指定实际来源及连续起止位置"});
});


const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const view=(row:any)=>({id:row.id,projectKey:row.project_key,title:row.title,content:row.content,status:row.status,x:Number(row.canvas_x),y:Number(row.canvas_y),width:Number(row.canvas_width),height:Number(row.canvas_height)});
function dividesSurrogate(text:string,index:number){return index>0&&index<text.length&&text.charCodeAt(index-1)>=0xd800&&text.charCodeAt(index-1)<=0xdbff&&text.charCodeAt(index)>=0xdc00&&text.charCodeAt(index)<=0xdfff;}

/** A receipt creates one editable asset. Replays restore it without overwriting edits. */
export async function saveVideoScriptAsset(actorRaw:string,raw:unknown){
  const actor=actorRaw.toLowerCase(),input=videoScriptAssetSchema.parse(raw),fingerprint=hash(JSON.stringify(input));
  await ensureScriptSchema();await authorizeVideoProject(actor,input.projectKey);
  const client=await getPool().connect();
  try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[actor]);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);
    const previous=(await client.query("SELECT * FROM app_video_script_operations WHERE email=$1 AND operation_id=$2",[actor,input.operationId])).rows[0];
    if(previous){
      if(previous.request_fingerprint!==fingerprint)throw new ModelConfigError("VIDEO_SCRIPT_OPERATION_CONFLICT","原操作编号已用于另一剧本方案",409);
      const saved=(await client.query("SELECT * FROM app_canvas_text_nodes WHERE email=$1 AND id=$2 AND project_key=$3",[actor,previous.node_id,input.projectKey])).rows[0];
      if(!saved)throw new ModelConfigError("VIDEO_SCRIPT_UNAVAILABLE","原剧本资产已移除，请使用新的操作编号",409);
      await client.query("COMMIT");return {node:view(saved),replayed:true,source:previous.source_node_id?{nodeId:previous.source_node_id,sha256:previous.source_sha256,start:previous.source_start,end:previous.source_end}:null};
    }
    let content=input.content!,sourceHash:string|null=null;
    const sourceId=input.sourceNodeId||input.referenceNodeId||null;
    if(sourceId){
      const source=(await client.query("SELECT content,prompt,status FROM app_canvas_text_nodes WHERE email=$1 AND id=$2 AND project_key=$3 FOR SHARE",[actor,sourceId,input.projectKey])).rows[0];
      if(!source)throw new ModelConfigError("VIDEO_SCRIPT_SOURCE_UNAVAILABLE","剧本来源不存在或无权访问",404);
      if(source.status!=="completed")throw new ModelConfigError("VIDEO_SCRIPT_SOURCE_PENDING","剧本来源尚未完成",422);
      const original=canvasTextContent(source);
      if(input.expectedSourceSha256&&hash(original)!==input.expectedSourceSha256)throw new ModelConfigError("VIDEO_SCRIPT_SOURCE_CHANGED","原稿已修改，请读取最新原文后重新规划",409);
      if(input.sourceNodeId){
        if(input.end!>original.length||dividesSurrogate(original,input.start!)||dividesSurrogate(original,input.end!))throw new ModelConfigError("VIDEO_SCRIPT_RANGE_INVALID","原文片段起止位置无效，不能截断字符",422);
        content=original.slice(input.start,input.end);
      }
      sourceHash=hash(original);
    }
    const nodeId=`text-video-${hash(`${actor}:${input.operationId}`).slice(0,40)}`;
    const occupied=(await client.query(`SELECT canvas_x AS x,canvas_y AS y,canvas_width AS width,canvas_height AS height,NULL::integer AS image_width,NULL::integer AS image_height,false AS image FROM app_canvas_text_nodes WHERE email=$1 AND project_key=$2
      UNION ALL SELECT COALESCE(canvas_x,0),COALESCE(canvas_y,0),canvas_width,canvas_height,image_width,image_height,true FROM app_artworks WHERE email=$1 AND deleted_at IS NULL AND
        (($2 LIKE 'tree:%' AND (group_id=substring($2 from 6) OR id=substring($2 from 6))) OR ($2 LIKE 'batch:%' AND batch_id=substring($2 from 7)))
      UNION ALL SELECT x,y,width,height,NULL::integer,NULL::integer,false FROM app_canvas_video_nodes WHERE email=$1 AND project_key=$2 AND deleted_at IS NULL`,[actor,input.projectKey])).rows;
    const bounds=occupied.reduce((value,row)=>({right:Math.max(value.right,Number(row.x)+(row.image&&!(row.width>0&&row.height>0)?adaptiveCanvasImageSize(row.image_width,row.image_height).width:Number(row.width))),top:Math.min(value.top,Number(row.y))}),{right:-96,top:0});
    const placement={x:bounds.right+96,y:bounds.top};
    if(Math.abs(Number(placement.x))>1e8||Math.abs(Number(placement.y))>1e8)throw new ModelConfigError("VIDEO_SCRIPT_POSITION_INVALID","画布位置超出范围",422);
    const saved=(await client.query(`INSERT INTO app_canvas_text_nodes (id,email,project_key,title,content,status,canvas_x,canvas_y,canvas_width,canvas_height,source_ids)
      VALUES($1,$2,$3,$4,$5,'completed',$6,$7,400,240,$8::jsonb) RETURNING *`,[nodeId,actor,input.projectKey,input.title,content,placement.x,placement.y,JSON.stringify(sourceId?[sourceId]:[])])).rows[0];
    await client.query(`INSERT INTO app_video_script_operations (email,operation_id,request_fingerprint,node_id,source_node_id,source_sha256,source_start,source_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[actor,input.operationId,fingerprint,nodeId,sourceId,sourceHash,input.start??null,input.end??null]);
    await client.query("COMMIT");return {node:view(saved),replayed:false,source:sourceId?{nodeId:sourceId,sha256:sourceHash,start:input.start,end:input.end}:null};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
