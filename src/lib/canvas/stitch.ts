import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {getPool} from '@/platform/db/pool';
import {withTransaction} from '@/platform/db/transaction';
import {listArtworksByIds} from '@/lib/artworks/repository';
import {addArtworksTx} from '@/lib/artworks/writer';
import {uploadImage} from '@/lib/media-upload';
import {deleteImageByUrl} from '@/lib/object-storage/runtime';
import {canonicalConfig} from '@/lib/model-config/snapshot-value';
import {ModelConfigError} from '@/lib/model-config/types';
import {currentCreationContext} from '@/lib/saas/creation-scope';
import {assertCreationInputsTx} from '@/lib/saas/creation-writer';
import {assertCreationProjectInput,bindActualCreationProject,assertCurrentCreationFeature} from '@/lib/saas/creation-access';
import {ensureCanvasNodeCopySchema} from './storage-schema';
import {writeCanvasArtworkTx} from './artwork-write-repository';
import {canvasStitchRequest,type CanvasStitchInput,type CanvasStitchResult} from './stitch-contract';
import {prepareCanvasStitch} from './stitch-pixels';

const failure=(code:string,message:string,status:number)=>new ModelConfigError(code,message,status);
const projectOf=(a:{id:string;groupId?:string|null;batchId?:string|null})=>a.batchId?.startsWith('suite-')?`batch:${a.batchId}`:`tree:${a.groupId||a.id}`;
async function lock(tx:PoolClient,email:string){await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[email]);}
async function receipt(tx:PoolClient,email:string,operationId:string,fingerprint?:string):Promise<CanvasStitchResult|null>{
 const prior=(await tx.query('SELECT input_digest,result FROM app_canvas_node_copies WHERE email=$1 AND operation_id=$2',[email,operationId])).rows[0];
 if(!prior)return null;
 if(prior.result.kind!=='canvas-stitch'||fingerprint&&prior.input_digest!==fingerprint)throw failure('NODE_OPERATION_CONFLICT','拼接操作编号已用于另一请求',409);
 const saved=prior.result as CanvasStitchResult;
 if(currentCreationContext()?.parentContext&&currentCreationContext()!.parentContext!==saved.projectKey)throw failure('CANVAS_STITCH_PROJECT_CONFLICT','拼接回执属于原画布项目',409);
 const row=(await tx.query('SELECT image_url,image_width,image_height FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL',[email,saved.id])).rows[0];
 if(!row)throw failure('CANVAS_STITCH_REMOVED','这次拼接已撤销或删除，请重新选择图片',409);
 await bindActualCreationProject(email,saved.projectKey,{tx,receipt:true});
 return{...saved,operationId,image:row.image_url,width:row.image_width??saved.width,height:row.image_height??saved.height};
}
export async function readCanvasStitch(emailRaw:string,operationId:string){
 const email=emailRaw.toLowerCase();canvasStitchRequest.shape.operationId.unwrap().parse(operationId);await ensureCanvasNodeCopySchema();
 return withTransaction(getPool(),async tx=>{await lock(tx,email);return receipt(tx,email,operationId);});
}
/** Original node-copy receipts own identity. Network/decode/upload remain
 * outside the owner transaction; artwork, position and receipt publish once. */
export async function stitchCanvasArtworks(emailRaw:string,raw:CanvasStitchInput,requestUrl:string):Promise<CanvasStitchResult>{
 const email=emailRaw.toLowerCase(),input=canvasStitchRequest.parse(raw),scope=currentCreationContext();
 const title=String(input.title||`详情长图 · ${input.ids.length} 张`).trim().slice(0,80),x=Number(input.x),y=Number(input.y);
 const fingerprint=createHash('sha256').update(canonicalConfig({kind:'canvas-stitch',ids:input.ids,title,x:Number.isFinite(x)?x:null,y:Number.isFinite(y)?y:null,scope:[scope?.scopeKind||'personal',scope?.tenantId||null],project:scope?.parentContext||null})).digest('hex');
 await ensureCanvasNodeCopySchema();
 if(input.operationId){const prior=await withTransaction(getPool(),async tx=>{await lock(tx,email);return receipt(tx,email,input.operationId!,fingerprint);});if(prior)return prior;}
 await assertCurrentCreationFeature('/api/canvas/stitch');
 const found=await listArtworksByIds(email,input.ids),byId=new Map(found.map(a=>[a.id,a])),artworks=input.ids.map(id=>byId.get(id));
 if(artworks.some(a=>!a))throw failure('CANVAS_STITCH_SOURCE_UNAVAILABLE','部分图片不存在或无权访问',404);
 const sources=artworks as typeof found;
 const projects=new Set(sources.map(projectOf));
 if(projects.size!==1)throw failure('CANVAS_STITCH_PROJECT_CONFLICT','只能拼接同一画布项目中的图片',409);
 const projectKey=[...projects][0];
 if(scope?.parentContext&&scope.parentContext!==projectKey)throw failure('CANVAS_STITCH_PROJECT_CONFLICT','请求项目与当前画布不一致',409);
 // Authorize source lineage before touching pixels, then recheck during
 // publication. Neither short transaction spans storage/network/Sharp work.
 await withTransaction(getPool(),async tx=>{await assertCreationInputsTx(tx,email,input.ids);await assertCreationProjectInput(email,projectKey,tx,true);});
 const pixels=await prepareCanvasStitch(sources.map(a=>a.image),requestUrl);
 const id='canvas-long-'+randomUUID(),image=await uploadImage(new Uint8Array(pixels.bytes),'image/png',`canvas-stitches/${id}.png`,undefined,email);
 let keepUpload=false;
 try{
  return await withTransaction(getPool(),async tx=>{
   await lock(tx,email);
   if(input.operationId){const winner=await receipt(tx,email,input.operationId,fingerprint);if(winner)return winner;}
   const current=(await tx.query('SELECT id,image_url,group_id,batch_id FROM app_artworks WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL ORDER BY id FOR SHARE',[email,input.ids])).rows;
   if(current.length!==sources.length||sources.some(a=>!current.some(row=>row.id===a.id&&row.image_url===a.image&&projectOf({id:row.id,batchId:row.batch_id,groupId:row.group_id})===projectKey)))throw failure('CANVAS_STITCH_SOURCE_CHANGED','原图片已更新或删除，请重新选择',409);
   await assertCreationInputsTx(tx,email,input.ids);await assertCreationProjectInput(email,projectKey,tx,true);await bindActualCreationProject(email,projectKey,{tx});
   await addArtworksTx(tx,email,[{id,title,category:'detail',creationProvenance:{version:1,operation:'canvas-stitch',entry:'canvas',ref:input.operationId||id,evidence:'server-route'},prompt:`按画布顺序纵向拼接 ${input.ids.length} 张详情图`,status:'completed',image,gradient:'from-slate-100 to-white',ratio:'long',resolution:'1K',source:'derived',parentId:input.ids[0],parentIds:input.ids.slice(1),origin:'canvas',width:pixels.width,height:pixels.height,groupId:sources[0].groupId||sources[0].id,batchId:sources[0].batchId}]);
   if(Number.isFinite(x)&&Number.isFinite(y))await writeCanvasArtworkTx(tx,email,id,{canvasX:x,canvasY:y});
   const result:CanvasStitchResult={ok:true,kind:'canvas-stitch',id,image,width:pixels.width,height:pixels.height,projectKey,operationId:input.operationId};
   if(input.operationId)await tx.query('INSERT INTO app_canvas_node_copies(email,operation_id,input_digest,result) VALUES($1,$2,$3,$4::jsonb)',[email,input.operationId,fingerprint,JSON.stringify(result)]);
   // Lost COMMIT is unknown. Keep possible winning bytes; only a known losing
   // preparer or pre-COMMIT rollback may discard its unique random key.
   keepUpload=true;return result;
  });
 }catch(error){
  if(keepUpload)console.warn('STORAGE_CLEANUP_PENDING operation=canvas-stitch commit=unknown');
  throw error;
 }finally{
  if(!keepUpload)await deleteImageByUrl(image).catch(()=>console.warn('STORAGE_CLEANUP_PENDING operation=canvas-stitch'));
 }
}
