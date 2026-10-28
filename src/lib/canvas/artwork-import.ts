import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "../persistence/schema";
import {addArtworksTx} from "../artworks/writer";
import {adaptiveCanvasImageSize} from "../mock-data";
import {provenanceEntry} from "../artwork-provenance";
import {privateMedia,storageKeyFromManagedUrl} from "../object-storage/runtime";
import {canReadMedia} from "../media-assets";
import {canonicalConfig} from "../model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import {currentCreationContext} from "../saas/creation-scope";
import {assertCreationInputsTx} from "../saas/creation-writer";
import {assertCreationProjectInput,bindActualCreationProject} from "../saas/creation-access";
import {ensureCanvasNodeCopySchema} from "./storage-schema";
import {writeCanvasArtworkTx} from "./artwork-write-repository";

const nullableNumber=z.number().finite().nullable().optional();
export const artworkImportRequest=z.object({
  operationId:z.uuid().optional(),entry:z.string().optional(),parentId:z.string().nullable().optional(),linked:z.boolean().optional(),
  x:z.number().finite().optional(),y:z.number().finite().optional(),
  src:z.object({id:z.string().optional(),image:z.string().optional(),videoUrl:z.string().nullable().optional(),title:z.string().optional(),
    category:z.string().optional(),prompt:z.string().optional(),style:z.string().optional(),ratio:z.string().optional(),resolution:z.string().optional(),
    parentId:z.string().nullable().optional(),templateId:z.string().nullable().optional(),width:nullableNumber,height:nullableNumber,canvasWidth:nullableNumber,canvasHeight:nullableNumber}),
});
export type CanvasArtworkImportInput=z.infer<typeof artworkImportRequest>;

/** Receipt recovery never inserts or revives. It also rechecks the immutable
 * workspace/project binding, rather than exposing a same-email tenant result. */
export async function readCanvasArtworkImport(emailRaw:string,operationId:string){
  const email=emailRaw.toLowerCase();z.uuid().parse(operationId);
  await ensureSchema();await ensureCanvasNodeCopySchema();
  const client=await getPool().connect();
  try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[email]);
    const saved=(await client.query("SELECT result FROM app_canvas_node_copies WHERE email=$1 AND operation_id=$2",[email,operationId])).rows[0]?.result;
    if(!saved||saved.kind!=="artwork-import"){await client.query("COMMIT");return null;}
    const row=(await client.query("SELECT image_url,video_url FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL",[email,saved.id])).rows[0];
    if(!row)throw new ModelConfigError("CANVAS_IMPORT_REMOVED","这次导入已撤销或删除，请重新导入",409);
    await bindActualCreationProject(email,saved.projectKey,{tx:client,receipt:true});
    await client.query("COMMIT");return {...saved,image:row.image_url,videoUrl:row.video_url};
  }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}finally{client.release();}
}

/** JSON artwork/template insertion belongs to the existing node-copy receipt
 * owner. The receipt and artwork publish on one transaction; transport retries
 * neither mint a new node nor revive a subsequently deleted one. Multipart
 * original uploads retain their separate byte/commit protocol. */
export async function importCanvasArtwork(emailRaw:string,raw:CanvasArtworkImportInput){
  const email=emailRaw.toLowerCase(),input=artworkImportRequest.parse(raw),src=input.src;
  const image=String(src.image||"").trim(),videoUrl=String(src.videoUrl||"").trim()||null;
  if(!image&&!videoUrl)throw new ModelConfigError("CANVAS_IMPORT_INVALID","缺少参数",400);
  await ensureSchema();await ensureCanvasNodeCopySchema();
  const context=currentCreationContext();
  const fingerprint=createHash("sha256").update(canonicalConfig({kind:"artwork-import",input,scope:[context?.scopeKind||"personal",context?.tenantId||null]})).digest("hex");
  const client=await getPool().connect();
  try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[email]);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${email}`]);
    if(input.operationId){
      const prior=(await client.query("SELECT input_digest,result FROM app_canvas_node_copies WHERE email=$1 AND operation_id=$2",[email,input.operationId])).rows[0];
      if(prior){
        if(prior.input_digest!==fingerprint)throw new ModelConfigError("NODE_OPERATION_CONFLICT","导入操作编号已用于另一请求",409);
        const saved=prior.result;
        const row=(await client.query("SELECT * FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL",[email,saved.id])).rows[0];
        if(!row)throw new ModelConfigError("CANVAS_IMPORT_REMOVED","这次导入已撤销或删除，请重新导入",409);
        await bindActualCreationProject(email,saved.projectKey,{tx:client,receipt:true});
        await client.query("COMMIT");return {...saved,image:row.image_url,videoUrl:row.video_url};
      }
    }
    const sourceId=String(src.id||"").trim().slice(0,240);
    if(sourceId){
      const original=(await client.query("SELECT image_url,video_url FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE",[email,sourceId])).rows[0];
      if(!original||original.image_url!==image||(original.video_url||null)!==videoUrl)throw new ModelConfigError("CANVAS_IMPORT_SOURCE_UNAVAILABLE","复制源作品不存在或不匹配",404);
      await assertCreationInputsTx(client,email,[sourceId]);
    }
    if(privateMedia)for(const url of [image,videoUrl].filter(Boolean) as string[]){const key=storageKeyFromManagedUrl(url);if(key&&!await canReadMedia(key,email))throw new ModelConfigError("CANVAS_IMPORT_SOURCE_UNAVAILABLE","素材不存在",404);}
    const id=`art-import-${randomUUID()}`,parentId=input.parentId!==undefined?input.parentId:src.parentId??null;
    let projectKey=`tree:${id}`,batchId:string|undefined;
    if(parentId){
      const parent=(await client.query("SELECT id,group_id,batch_id FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE",[email,parentId])).rows[0];
      if(!parent)throw new ModelConfigError("CANVAS_IMPORT_PARENT_UNAVAILABLE","目标画布不存在或无权访问",404);
      projectKey=parent.batch_id?`batch:${parent.batch_id}`:`tree:${parent.group_id||parent.id}`;
      batchId=parent.batch_id||undefined;
      await assertCreationProjectInput(email,projectKey,client,true);
    }
    const size=src.canvasWidth&&src.canvasHeight?{width:src.canvasWidth,height:src.canvasHeight}:adaptiveCanvasImageSize(src.width,src.height);
    await bindActualCreationProject(email,projectKey,{tx:client,newRoot:!parentId});
    await addArtworksTx(client,email,[{id,title:src.title||"作品",category:src.category||"main",prompt:src.prompt||"",status:"completed",image,videoUrl,
      gradient:"from-emerald-100 to-teal-100",style:src.style,ratio:src.ratio,resolution:src.resolution,parentId,batchId,templateId:src.templateId??null,
      width:src.width??null,height:src.height??null,canvasWidth:size.width,canvasHeight:size.height,source:input.linked?"derived":"canvas-add",
      creationProvenance:{version:1,operation:sourceId?"copy":src.templateId?"template":"import",entry:provenanceEntry(input.entry,"canvas"),ref:id,...(sourceId?{sourceArtworkId:sourceId}:{}),evidence:"server-route"}}]);
    if(input.x!==undefined&&input.y!==undefined)await writeCanvasArtworkTx(client,email,id,{canvasX:input.x,canvasY:input.y});
    const result={ok:true,kind:"artwork-import",id,projectKey,image,videoUrl,width:src.width??null,height:src.height??null,canvasWidth:size.width,canvasHeight:size.height};
    if(input.operationId)await client.query("INSERT INTO app_canvas_node_copies(email,operation_id,input_digest,result) VALUES($1,$2,$3,$4::jsonb)",[email,input.operationId,fingerprint,JSON.stringify(result)]);
    await client.query("COMMIT");return result;
  }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}finally{client.release();}
}
