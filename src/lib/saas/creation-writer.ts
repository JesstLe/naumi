import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {currentCreationContext,withFrozenCreation,bindActualCreationProject,creationId,type CreationContext} from './creation-context';
import {creationStatus} from './creation-contracts';
import {currentModelExecution,currentExecutionBundle} from '@/lib/model-config/context';
import {getPool,dbEnabled} from '@/lib/db';
import {ensureCreationSchema} from './creation-schema';
import type {CreationStatus} from './creation-contracts';
import {uploadImage} from '@/lib/storage';
import {currentObservedCallId} from '@/lib/bi/call-scope';
import {TeamError} from '@/lib/teams/server';
const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const key=(...values:string[])=>createHash('sha256').update(values.join('\0')).digest('hex');
export async function creationEventTx(tx:PoolClient,id:string,eventKey:string,type:string,status:string,summary:string){
 await tx.query(`INSERT INTO app_creation_events(id,creation_id,event_key,type,status,summary) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(creation_id,event_key) DO NOTHING`,[`ev-${key(id,eventKey)}`,id,eventKey,type,status,summary.slice(0,1000)]);
}
export async function creationLinkTx(tx:PoolClient,id:string,actor:string,type:string,target:string,relation='execution'){
 await tx.query(`INSERT INTO app_creation_links(creation_id,actor_email,target_type,target_id,relation) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[id,actor,type,target,relation]);
}
export async function acceptCreationTx(tx:PoolClient,kind:string,sourceId:string,email:string,payload:unknown={},frozen?:CreationContext){
 const context=frozen||currentCreationContext();
 if(!context)return null; // Legacy recovery never derives a tenant from today's membership.
 if(context.actorEmail!==email.toLowerCase())throw new Error('创作操作者不一致');
 const p=obj(payload),plan=obj(p.plan),request=obj(plan.request||obj(p.p).imagegen?.request||p.request);
 const group=p.projectGroupId||obj(p.p).projectGroupId;
 if(typeof group==='string'&&group){const project=`tree:${group}`;
  if(context.parentContext?.startsWith('tree:')&&context.parentContext!==project)throw new TeamError('请求项目与当前画布不一致',409);
  await withFrozenCreation({...context,workspaceExplicit:true},()=>bindActualCreationProject(email,project,{tx}));
 }
 if(context.parentContext){
  await tx.query(`INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'project',$2,$3,$4) ON CONFLICT DO NOTHING`,[email.toLowerCase(),context.parentContext,context.scopeKind,context.tenantId]);
  const frozen=(await tx.query("SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='project' AND context_id=$2 FOR SHARE",[email.toLowerCase(),context.parentContext])).rows[0];
  if(frozen.scope_kind!==context.scopeKind||frozen.tenant_id!==context.tenantId)throw new Error('项目创作归属不一致');
 }
 const existing=(await tx.query('SELECT id,tenant_id,scope_kind FROM app_creation_records WHERE source_kind=$1 AND source_id=$2 AND actor_email=$3',[kind,sourceId,email.toLowerCase()])).rows[0];
 if(existing){if(existing.tenant_id!==context.tenantId||existing.scope_kind!==context.scopeKind)throw new Error('创作归属不一致');return existing.id as string;}
 const publicParams=publicCreationParameters({...obj(request.parameters),...obj(request.output),...obj(p.parameters),...context.parameters});
 const prompt=context.requestText??request.prompt??obj(p.p).prompt??p.prompt;
 const id=creationId(),parent=context.creationId||null;
 const model=currentModelExecution(currentExecutionBundle()?.primary)||currentModelExecution('image')||currentModelExecution('text')||currentModelExecution('video');const label=model?.frontendModel?.label;
 await tx.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,payer_account_id,source_kind,source_id,parent_id,request_snapshot,parameters_snapshot,model_snapshot)
 VALUES($1,$2,$3,$4,$2,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)`,[id,email.toLowerCase(),context.scopeKind,context.tenantId,kind,sourceId,parent,JSON.stringify(typeof prompt==='string'?{state:'recorded',text:prompt.slice(0,50000)}:{state:'not_recorded'}),JSON.stringify(Object.keys(publicParams).length?{state:'recorded',values:publicParams}:{state:'not_recorded'}),JSON.stringify(label?{state:'recorded',label,configVersion:model?.frozen.modelVersion}:{state:'not_recorded'})]);
 await creationEventTx(tx,id,'accepted','accepted','queued','已接受创作请求');
 await creationLinkTx(tx,id,email.toLowerCase(),kind,sourceId);
 if(['title-gen','canvas-local-edit','canvas-copy','workflow-import','comfyui'].includes(kind))await creationLinkTx(tx,id,email.toLowerCase(),'no-charge',sourceId,'explicit-no-charge');
 for(const input of context.originalInputs||[])await addCreationAssetTx(tx,id,email.toLowerCase(),{direction:'input',variant:'original',...input});
 // Each accepted request has one top-level record; child tools inherit its immutable ID.
 if(!parent)context.creationId=id;
 const refs=[...(Array.isArray(request.inputs)?request.inputs:[]),...(Array.isArray(p.inputs)?p.inputs:[]),...(typeof p.sourceArtworkId==='string'?[{artworkId:p.sourceArtworkId,role:'edit-target'}]:[])];
 await assertCreationInputsTx(tx,email,refs.flatMap(ref=>[ref.artworkId,ref.originalArtworkId]).filter((v):v is string=>typeof v==='string'),context);
 // Lineage affects the output's parent/group even when its pixels arrive in
 // another upload. Validate the actual owned artworks the generation core uses.
 const lineage=[request.sourceNodeId,...refs.map(ref=>obj(ref.reference).sourceNodeId),p.parentId,...(Array.isArray(p.parentIds)?p.parentIds:[]),obj(p.p).parentId,...(Array.isArray(obj(p.p).parentIds)?obj(p.p).parentIds:[])].filter((v):v is string=>typeof v==='string');
 if(lineage.length){const ids=(await tx.query('SELECT id FROM app_artworks WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL',[email.toLowerCase(),lineage])).rows.map(row=>row.id);await assertCreationInputsTx(tx,email,ids,context);for(const source of ids)await creationLinkTx(tx,id,email.toLowerCase(),'artwork',source,'lineage-input');}
 for(const [i,ref] of refs.entries())if(typeof ref.artworkId==='string'){
  const foreign=(await tx.query(`SELECT 1 FROM app_creation_links l JOIN app_creation_records c ON c.id=l.creation_id WHERE l.target_type='artwork' AND l.relation='output' AND l.target_id=$1 AND (c.actor_email<>$2 OR c.tenant_id IS NOT NULL AND c.tenant_id IS DISTINCT FROM $3::uuid) LIMIT 1`,[ref.artworkId,email.toLowerCase(),context.tenantId])).rows[0];
  if(foreign)throw new Error('不能直接引用其他企业的素材');
  const original=typeof ref.originalArtworkId==='string'?ref.originalArtworkId:ref.inputVariant==='processed'?null:ref.artworkId;
  if(!original)await addCreationAssetTx(tx,id,email.toLowerCase(),{id:`ca-${key(id,'missing-original',String(i))}`,direction:'input',role:String(ref.role||'reference'),position:i,variant:'original',storageRef:'',availability:'not_recorded'});
  if(original&&original!==ref.artworkId){await addCreationAssetTx(tx,id,email.toLowerCase(),{id:`ca-${key(id,'original-input',String(i))}`,direction:'input',role:String(ref.role||'reference'),position:i,variant:'original',storageRef:`artwork:${original}`});await creationLinkTx(tx,id,email.toLowerCase(),'artwork',original,'original-input');}
  await addCreationAssetTx(tx,id,email.toLowerCase(),{id:`ca-${key(id,'input',String(i))}`,direction:'input',role:String(ref.role||'reference'),position:i,variant:ref.inputVariant==='processed'||original!==ref.artworkId?'processed':'original',storageRef:`artwork:${ref.artworkId}`});
  await creationLinkTx(tx,id,email.toLowerCase(),'artwork',ref.artworkId,'input');
 }
 const buffers=Array.isArray(obj(p.p).images)?obj(p.p).images:Array.isArray(p.images)?p.images:[];
 for(const [i,input] of buffers.entries()){const url=obj(obj(input).buf).$imageJobBuffer;if(typeof url==='string'&&!refs[i])await addCreationAssetTx(tx,id,email.toLowerCase(),{id:`ca-${key(id,'original',String(i))}`,direction:'input',role:String(obj(input).role||'reference'),position:i,variant:'original',storageRef:url,mime:obj(input).mime||obj(input).type});}
 const mask=obj(obj(p.p).mask?.buf||obj(p.p).mask||p.mask);if(typeof mask.$imageJobBuffer==='string')await addCreationAssetTx(tx,id,email.toLowerCase(),{id:`ca-${key(id,'original-mask')}`,direction:'input',role:'mask',position:0,variant:'original',storageRef:mask.$imageJobBuffer,mime:'image/png'});
 return id;
}
/** Validate object references before any paid submission; personal inputs require
 * an explicit reference in this request and are never scanned or transferred. */
export async function assertCreationInputsTx(tx:PoolClient,email:string,ids:string[],context=currentCreationContext()) {
 if(!context||!ids.length)return;
 for(const id of Array.from(new Set(ids))){
  const row=id.startsWith('asset-')?(await tx.query('SELECT key FROM app_media_assets WHERE owner=$1 AND key=ANY($2::text[])',[email.toLowerCase(),['png','jpg','webp'].map(ext=>`imagegen-inputs/${id.slice(6)}.${ext}`)])).rows[0]:(await tx.query('SELECT id FROM app_artworks WHERE id=$1 AND email=$2 AND deleted_at IS NULL',[id,email.toLowerCase()])).rows[0];
  if(!row)throw new Error('素材不存在或无权访问');
  const media=(await tx.query("SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='media' AND context_id=$2",[email.toLowerCase(),id])).rows[0];
  if(media?.scope_kind==='tenant'&&media.tenant_id!==context.tenantId)throw new Error('不能直接引用其他企业的素材');
  const foreign=(await tx.query(`SELECT 1 FROM app_creation_links l JOIN app_creation_records c ON c.id=l.creation_id
    WHERE l.target_type='artwork' AND l.relation='output' AND l.target_id=$1 AND c.tenant_id IS NOT NULL AND c.tenant_id IS DISTINCT FROM $2::uuid LIMIT 1`,[id,context.tenantId])).rows[0];
  if(foreign)throw new Error('不能直接引用其他企业的素材');
 }
}
export async function assertCreationObjectRefs(email:string,ids:string[]) {
 const scope=currentCreationContext();if(!scope||!dbEnabled)return;
 await creationTransaction(async tx=>{
  const row=(await tx.query(`SELECT 1 FROM app_creation_links l JOIN app_creation_records c ON c.id=l.creation_id
    WHERE l.target_id=ANY($1::text[]) AND l.target_type IN('artwork','text-node','video-node') AND l.relation='output'
    AND c.actor_email=$3 AND c.tenant_id IS NOT NULL AND c.tenant_id IS DISTINCT FROM $2::uuid LIMIT 1`,[ids,scope.tenantId,email.toLowerCase()])).rows[0];
  if(row)throw new Error('不能直接引用其他企业的素材');
 });
}
export async function captureCreationMediaTx(tx:PoolClient,id:string,email:string,refs:{artworkId?:string;storageKey?:string;url?:string;role?:string;kind?:string;mimeType?:string}[]) {
 const context=currentCreationContext();
 for(const [position,ref] of refs.entries()){
  if(ref.artworkId)continue; // accepted artwork inputs already preserve their original reference.
  const storage=ref.storageKey?`/media/${ref.storageKey}`:ref.url;
  if(!storage||!storage.startsWith('/media/')||storage.includes('..')){
   if(context?.scopeKind==='tenant')throw new Error('企业素材须先上传为受控媒体');
   await addCreationAssetTx(tx,id,email,{direction:'input',role:ref.role||'reference',position,storageRef:'',mime:ref.mimeType,mediaType:ref.kind||'image',availability:'not_recorded'});continue;
  }
  const asset=(await tx.query('SELECT owner,content_type FROM app_media_assets WHERE key=$1',[storage.slice(7)])).rows[0];
  if(!asset||asset.owner!==email.toLowerCase())throw new Error('素材不存在或无权访问');
  const scope=(await tx.query("SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='media' AND context_id=$2",[email.toLowerCase(),storage])).rows[0];
  if(scope?.scope_kind==='tenant'&&scope.tenant_id!==context?.tenantId)throw new Error('不能直接引用其他企业的素材');
  await addCreationAssetTx(tx,id,email,{direction:'input',role:ref.role||'reference',position,storageRef:storage,mime:ref.mimeType||asset.content_type,mediaType:ref.kind||'image'});
 }
}
export async function creationTransaction<T>(run:(tx:PoolClient)=>Promise<T>) {
 await ensureCreationSchema();const tx=await getPool().connect();try{await tx.query('BEGIN');const result=await run(tx);await tx.query('COMMIT');return result;}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}
export async function startCreation(kind:string,sourceId:string,email:string,payload:unknown={},frozen?:CreationContext) {
 if(!dbEnabled||!(frozen||currentCreationContext()))return null;
 return creationTransaction(tx=>acceptCreationTx(tx,kind,sourceId,email,payload,frozen));
}
export async function claimCreation(kind:string,sourceId:string,email:string,payload:unknown={}) {
 if(!dbEnabled||!currentCreationContext())return {id:null as string|null,created:true};
 return creationTransaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`creation-accept:${kind}:${sourceId}:${email.toLowerCase()}`]);
  const old=(await tx.query('SELECT id FROM app_creation_records WHERE source_kind=$1 AND source_id=$2 AND actor_email=$3',[kind,sourceId,email.toLowerCase()])).rows[0];
  // acceptCreationTx also validates frozen scope when a receipt already exists.
  const id=await acceptCreationTx(tx,kind,sourceId,email,payload);return {id,created:!old};
 });
}
export async function completeCreationTx(tx:PoolClient,id:string,email:string,status:CreationStatus,payload:{text?:string;artworkIds?:string[];eventKey?:string;summary?:string}={}) {
 const owned=(await tx.query('SELECT id FROM app_creation_records WHERE id=$1 AND actor_email=$2 FOR UPDATE',[id,email.toLowerCase()])).rows[0];if(!owned)throw new Error('创作证据归属不一致');
 await tx.query('UPDATE app_creation_records SET status=$3,updated_at=now() WHERE id=$1 AND actor_email=$2',[id,email.toLowerCase(),status]);
 await creationEventTx(tx,id,payload.eventKey||`state:${status}`,'execution',status,payload.summary||`任务状态：${status}`);
 for(const [position,artworkId] of (payload.artworkIds||[]).entries()){
  const work=(await tx.query('SELECT id,category,video_url FROM app_artworks WHERE id=$1 AND email=$2',[artworkId,email.toLowerCase()])).rows[0];if(!work)continue;
  await creationLinkTx(tx,id,email.toLowerCase(),'artwork',artworkId,'output');
  await addCreationAssetTx(tx,id,email.toLowerCase(),{id:`ca-${key(id,'output',artworkId)}`,direction:'output',role:'result',position,storageRef:`artwork:${artworkId}`,mediaType:work.video_url||work.category==='video'?'video':'image'});
 }
 if(typeof payload.text==='string')await addCreationAssetTx(tx,id,email.toLowerCase(),{id:`ca-${key(id,'text',payload.eventKey||'final')}`,direction:'output',role:'reply',position:0,storageRef:'',mediaType:'file',mime:'text/plain',text:payload.text.slice(0,100000)});
}
/** Completion evidence is subordinate to the durable execution checkpoint. */
export async function creationEvidenceTx(tx:PoolClient,run:()=>Promise<void>,markPending?:()=>Promise<unknown>) {
 await tx.query('SAVEPOINT creation_evidence');try{await run();await tx.query('RELEASE SAVEPOINT creation_evidence');return true;}
 catch{await tx.query('ROLLBACK TO SAVEPOINT creation_evidence');await tx.query('RELEASE SAVEPOINT creation_evidence');if(markPending)await markPending();return false;}
}
export async function recordSourceOutcomeTx(tx:PoolClient,kind:string,sourceId:string,email:string,status:CreationStatus,payload:Parameters<typeof completeCreationTx>[4]={}) {
 const rows=(await tx.query(`SELECT DISTINCT c.id FROM app_creation_records c LEFT JOIN app_creation_links l ON l.creation_id=c.id
   WHERE c.actor_email=$3 AND ((c.source_kind=$1 AND c.source_id=$2) OR (l.target_type=$1 AND l.target_id=$2 AND l.actor_email=$3))`,[kind,sourceId,email.toLowerCase()])).rows;
 for(const row of rows)await completeCreationTx(tx,row.id,email,status,payload);
}
export async function finishCreation(id:string|undefined,email:string,status:CreationStatus,payload:Parameters<typeof completeCreationTx>[4]={}) {
 if(!dbEnabled||!id)return;
 try{await creationTransaction(tx=>completeCreationTx(tx,id,email,status,payload));}
 catch{ // No supplier retry. The already persisted business source is the recovery authority.
  await getPool().query("UPDATE app_creation_records SET status='needs_review',updated_at=now() WHERE id=$1 AND actor_email=$2",[id,email.toLowerCase()]).catch(()=>{});
 }
}
/** Append each actual tool outcome to its immutable turn, independent of session snapshots. */
export async function recordAgentToolEvidence(id:string|undefined,email:string,events:Record<string,unknown>[]) {
 if(!dbEnabled||!id||!events.length)return true;
 try { await creationTransaction(async tx=>{
  if(!(await tx.query('SELECT 1 FROM app_creation_records WHERE id=$1 AND actor_email=$2',[id,email.toLowerCase()])).rowCount)throw new Error('创作证据归属不一致');
  for(const e of events.slice(0,64)){
   const evidence={tool:String(e.tool||'').slice(0,80),callId:String(e.id||'').slice(0,120),failed:!!e.isError,summary:String(e.summary||'').slice(0,220),code:typeof e.code==='string'?e.code.slice(0,80):undefined,submissionState:e.submissionState==='not_submitted'?'not_submitted':undefined};
   // The existing event column contract truncates at 1000 chars; keep valid JSON.
   while(JSON.stringify(evidence).length>1000&&evidence.summary)evidence.summary=evidence.summary.slice(0,-1);
   await creationEventTx(tx,id,`tool:${String(e.id)}`,'agent-tool',e.isError?'failed':'succeeded',JSON.stringify(evidence));
  }
 }); return true; } catch { return false; } // Evidence failure never repeats a successful paid operation.
}
export async function withCreationOperation<T>(kind:string,sourceId:string,email:string,payload:unknown,run:()=>Promise<T>,outputs:(result:T)=>{artworkIds?:string[];text?:string} = ()=>({})) {
 const scope=currentCreationContext();if(!scope||!dbEnabled)return run();
 const id=await startCreation(kind,sourceId,email,payload);
 return withFrozenCreation({...scope,creationId:id||scope.creationId},async()=>{
  try{const result=await run();await finishCreation(id||undefined,email,'succeeded',outputs(result));return result;}
  catch(error){await finishCreation(id||undefined,email,'needs_review',{summary:'执行未完成，请按原业务来源核查，不自动重放'});throw error;}
 });
}
export async function prepareOriginalCreationInput(bytes:Buffer,mime:string,role:string,position:number) {
 const scope=currentCreationContext();if(!scope||!dbEnabled)return;
 if(bytes.length>64*1024*1024)throw new Error('输入素材超出记录限制');
 const hash=createHash('sha256').update(bytes).digest('hex');
 const owner=createHash('sha256').update(scope.actorEmail).digest('hex').slice(0,24);
 const storageRef=await uploadImage(bytes,mime,`creation-inputs/${owner}/original-${hash}.bin`,undefined,scope.actorEmail);
 scope.originalInputs||=[];if(!scope.originalInputs.some(x=>x.role===role&&x.position===position))scope.originalInputs.push({storageRef,mime,role,position});
}
/** The files handed to the SDK are the actual model input, distinct from raw
 * originals. Evidence outages never turn a paid execution into a retry. */
export async function captureProcessedCreationInputs(body:unknown) {
 const scope=currentCreationContext();if(!dbEnabled||!scope?.creationId)return;
 const captureId=currentObservedCallId()||randomUUID();
 try{
  const p=obj(body),images=Array.isArray(p.image)?p.image:p.image?[p.image]:[],files=[...images.map((file:unknown,i:number)=>({file,role:'reference',position:i})),...(p.mask?[{file:p.mask,role:'mask',position:0}]:[])];
  const assets:{storageRef:string;mime:string;role:string;position:number}[]=[];let total=0;
  for(const entry of files){const file=entry.file as {arrayBuffer?:()=>Promise<ArrayBuffer>;type?:string};
   if(!Buffer.isBuffer(file)&&typeof file?.arrayBuffer!=='function')continue;
   const bytes=Buffer.isBuffer(file)?file:Buffer.from(await file.arrayBuffer!());total+=bytes.length;if(total>64*1024*1024)throw new Error('模型输入超出记录限制');
   const mime=file.type||'application/octet-stream',hash=createHash('sha256').update(bytes).digest('hex');
   const storageRef=await uploadImage(bytes,mime,`creation-inputs/${scope.creationId}/processed-${hash}.bin`,undefined,scope.actorEmail);assets.push({...entry,storageRef,mime});
  }
  await creationTransaction(async tx=>{for(const asset of assets)await addCreationAssetTx(tx,scope.creationId!,scope.actorEmail,{direction:'input',variant:'processed',...asset,captureRef:captureId,sourcePosition:asset.position});if(assets.length){await creationLinkTx(tx,scope.creationId!,scope.actorEmail,'model-call',captureId);await creationEventTx(tx,scope.creationId!,`inputs:${captureId}`,'input-prepared','running','已记录本次模型实际输入');}});
 }catch{
  scope.evidencePending=true;
  await creationTransaction(tx=>creationEventTx(tx,scope.creationId!,'evidence:processed-pending','evidence','needs_review','实际模型输入证据保存失败，原业务任务继续按固定状态收尾')).catch(()=>{});
 }
}
export async function addCreationAssetTx(tx:PoolClient,id:string,email:string,a:{id?:string;direction:'input'|'output';role:string;position:number;variant?:string;storageRef:string;mime?:string;mediaType?:string;text?:string;availability?:string;captureRef?:string;sourcePosition?:number}){
 let position=a.position;
 if(a.direction==='input'&&a.captureRef){
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`creation-assets:${id}`]);
  if((await tx.query("SELECT 1 FROM app_creation_assets WHERE creation_id=$1 AND execution_ref=$2 AND role=$3 AND input_position=$4 AND storage_ref=$5",[id,a.captureRef,a.role,a.sourcePosition??a.position,a.storageRef])).rowCount)return;
  position=Number((await tx.query("SELECT COALESCE(max(position),-1)+1 AS next FROM app_creation_assets WHERE creation_id=$1 AND direction='input'",[id])).rows[0].next);
 }
 if(a.direction==='output'&&a.storageRef){
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`creation-assets:${id}`]);
  if((await tx.query('SELECT 1 FROM app_creation_assets WHERE creation_id=$1 AND direction=$2 AND storage_ref=$3',[id,a.direction,a.storageRef])).rowCount)return;
  position=Number((await tx.query('SELECT COALESCE(max(position),-1)+1 AS next FROM app_creation_assets WHERE creation_id=$1 AND direction=$2 AND role=$3 AND variant=$4',[id,a.direction,a.role,a.variant||'original'])).rows[0].next);
 }
 let metadata:{sha256?:string;bytes?:number;content_type?:string}|undefined;
 if((await tx.query("SELECT to_regclass('app_media_assets') AS name")).rows[0].name){
  let ref=a.storageRef;
  if(ref.startsWith('artwork:asset-')){const id=ref.slice('artwork:asset-'.length);metadata=(await tx.query('SELECT sha256,bytes,content_type FROM app_media_assets WHERE owner=$1 AND key=ANY($2::text[])',[email,['png','jpg','webp'].map(ext=>`imagegen-inputs/${id}.${ext}`)])).rows[0];}
  else {if(ref.startsWith('artwork:'))ref=(await tx.query('SELECT image_url FROM app_artworks WHERE id=$1 AND email=$2',[ref.slice(8),email])).rows[0]?.image_url||'';
   if(ref.startsWith('/media/'))metadata=(await tx.query('SELECT sha256,bytes,content_type FROM app_media_assets WHERE key=$1',[ref.slice(7)])).rows[0];}
 }
 const mime=a.mime||metadata?.content_type||null,mediaType=a.mediaType||(mime?.startsWith('video/')?'video':mime?.startsWith('audio/')?'audio':mime&&!mime.startsWith('image/')?'file':'image');
 await tx.query(`INSERT INTO app_creation_assets(id,creation_id,actor_email,direction,role,position,variant,storage_ref,mime,media_type,text_content,hash,byte_size,availability,input_position,execution_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(creation_id,direction,role,position,variant) DO NOTHING`,[a.id||`ca-${randomUUID()}`,id,email,a.direction,a.role,position,a.variant||'original',a.storageRef,mime,mediaType,a.text??null,metadata?.sha256||null,metadata?.bytes??null,a.availability||'recorded',a.sourcePosition??null,a.captureRef??null]);
}
export function publicCreationParameters(value:unknown):Record<string,unknown>{
 const p=obj(value),allowed=['ratio','resolution','quality','count','quantity','size','seconds','durationSeconds','aspectRatio','generateAudio','watermark','mode','width','height','x','y','platform','style','lang','seed','variants','inputFidelity','moderation','format','compression','background','compressionMode','flattenColor','downscaleMaxDim'];
 const out:Record<string,unknown>={};for(const k of allowed)if(Object.hasOwn(p,k)&&['string','number','boolean'].includes(typeof p[k]))out[k]=typeof p[k]==='string'?p[k].slice(0,120):p[k];
 for(const k of ['parameters','output','intent','crop'])if(p[k]&&typeof p[k]==='object'){const nested=publicCreationParameters(p[k]);if(Object.keys(nested).length)out[k]=nested;}
 return out;
}
export async function attachBillingCreationTx(tx:PoolClient,id:string,email:string,feature:string,reserved:number){
 const context=currentCreationContext();if(!context)return;
 const record=context.creationId||await acceptCreationTx(tx,feature,id,email);if(record){await creationLinkTx(tx,record,email,'billing',id);await tx.query("UPDATE app_creation_links SET reserved_credits=$3 WHERE creation_id=$1 AND target_type='billing' AND target_id=$2",[record,id,reserved]);
  const model=currentModelExecution(currentExecutionBundle()?.primary);if(model?.frontendModel?.label)await tx.query("UPDATE app_creation_records SET model_snapshot=$2::jsonb WHERE id=$1 AND model_snapshot->>'state'='not_recorded'",[record,JSON.stringify({state:'recorded',label:model.frontendModel.label,configVersion:model.frozen.modelVersion})]);
 }
}
export async function recordImageStateTx(tx:PoolClient,jobId:string,snapshot:unknown){
 const rows=(await tx.query("SELECT c.id,c.actor_email FROM app_creation_records c JOIN app_creation_links l ON l.creation_id=c.id WHERE l.target_id=$1 AND l.target_type LIKE 'image:%'",[jobId])).rows;
 const s=obj(snapshot),result=obj(s.result),shots=Array.isArray(s.shots)?s.shots:[];
 const terminalShots=shots.length&&['done','error','completed','failed'].includes(String(s.status));
 const shotSuccess=shots.filter(shot=>shot.status==='done'&&shot.url).length;
 const status=terminalShots?shotSuccess===shots.length?'succeeded':shotSuccess?'partial':'failed':creationStatus(result.status||s.status);
 for(const row of rows){
  await tx.query('UPDATE app_creation_records SET status=$2,updated_at=now() WHERE id=$1',[row.id,status]);
  await creationEventTx(tx,row.id,`state:${status}:${String(result.stage||s.stage||'')}`,'execution',status,status==='needs_review'?'执行结果需要核查':`任务状态：${status}`);
  const works=Array.isArray(result.artifacts)?result.artifacts:Array.isArray(s.images)?s.images:Array.isArray(s.shots)?s.shots:[];
  for(const [i,work] of works.entries()){const target=work.artworkId||work.id;if(typeof target==='string'&&(!work.status||['done','succeeded','completed'].includes(work.status))&&(await tx.query('SELECT 1 FROM app_artworks WHERE id=$1 AND email=$2 AND deleted_at IS NULL',[target,row.actor_email])).rowCount){
   await creationLinkTx(tx,row.id,row.actor_email,'artwork',target,'output');
   await addCreationAssetTx(tx,row.id,row.actor_email,{id:`ca-${key(row.id,'output',target)}`,direction:'output',role:'result',position:i,storageRef:`artwork:${target}`});
  }}
 }
}
