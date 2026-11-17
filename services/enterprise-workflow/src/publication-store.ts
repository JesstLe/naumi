import type {Pool,PoolClient} from 'pg';
import type {Actor,Principal,WorkOrder} from './contracts';
import {WorkflowError} from './contracts';
import type {ResolveActor,ValidateAssets} from './store';
import type {CatalogStore} from './catalog-store';
import type {GuidelineStore} from './guideline-store';
import {canRead,participants} from './domain';
import {readScope} from './read-scope';
import {readWorkflowSnapshot} from './read-transaction';
import {ensure,digest} from './performance-domain';
import {publicationCommand,publicationPreview,publicationQuery,type Publication,type PublicationDraft,type PublicationSource} from './publication-contracts';
const operator=(a:Actor)=>a.permissions.includes('request')||a.permissions.includes('manage'),reviewer=(a:Actor)=>a.permissions.includes('manage')&&a.permissions.includes('review');
const active=['draft','approved','executing','unknown','manual_published','recall_requested','recall_unknown'];
const key=(shopId:string,externalObjectId:string,slot:string,locale:string)=>digest({shopId,externalObjectId,slot,locale});
const scopeArgs=(a:Actor)=>[a.enterpriseId,a.teamId,a.permissions.some(p=>['manage','dispatch','review'].includes(p)),a.subject,a.permissions.includes('execute'),a.workKinds,a.permissions.some(p=>['manage','dispatch'].includes(p))];
const listScope=`FROM enterprise_workflow.publications p JOIN enterprise_workflow.orders o ON o.enterprise_id=p.enterprise_id AND o.id=p.order_id JOIN enterprise_workflow.catalog_entities s ON s.enterprise_id=p.enterprise_id AND s.id=p.shop_id WHERE p.enterprise_id=$1 AND p.team_id=$2 AND ${readScope('o.document','$7')} AND s.document->'teamIds' ? $2::text`;
export class PublicationStore{
 private verifyingReads=0;
 constructor(readonly pool:Pool,private resolveActor:ResolveActor,private validateAssets:ValidateAssets,private catalog:CatalogStore,private guidelines:GuidelineStore,readonly enabled=true,private now=()=>new Date()){}
 async assertFileReadiness(tx:PoolClient,a:Actor,n:Publication,mode:'full'|'metadata'|'snapshot'='full'){
  const validate=mode==='snapshot'?this.validateAssets.readMetadata:mode==='metadata'?this.validateAssets.metadata:this.validateAssets;
  await this.readiness(tx,a,n,validate??this.validateAssets,mode!=='snapshot');
 }
 async fileAvailability(tx:PoolClient,a:Actor,n:Publication,snapshot=false){return this.currentAvailability(tx,a,n,snapshot);}
 private async fileAccess(tx:PoolClient,a:Actor,id:string,lock:boolean){
  if(lock){await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`publication:${a.enterpriseId}:${id}`]);await this.catalog.lock(tx,a.enterpriseId);}
  const n=await this.row(tx,a,id);ensure(n,'PUBLICATION_NOT_FOUND',404);await this.access(tx,a,n,lock);ensure((await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=31')).rowCount,'PUBLICATION_FILES_MIGRATION_REQUIRED',503);return n;
 }
 async fileRead<T>(p:Principal,id:string,run:(tx:PoolClient,a:Actor,n:Publication,snapshot:boolean)=>Promise<T>,options:{signal?:AbortSignal;verifyFiles?:(result:T)=>Promise<void>;checkCurrent?:(tx:PoolClient,a:Actor,n:Publication,result:T)=>Promise<void>}={}){
  return (await readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a,snapshot)=>{
   await this.requireReady(tx,a);const n=await this.fileAccess(tx,a,id,!snapshot);return {result:await run(tx,a,n,snapshot),version:n.version};
  },{statementTimeoutMs:20000,signal:options.signal,betweenSnapshots:options.verifyFiles?read=>options.verifyFiles!(read.result):undefined,checkCurrent:async(tx,a,read)=>{const n=await this.fileAccess(tx,a,id,false);ensure(n.version===read.version,'PUBLICATION_VERSION_CONFLICT');await options.checkCurrent?.(tx,a,n,read.result);}})).result;
 }
 async fileScope<T>(p:Principal,id:string,run:(tx:PoolClient,a:Actor,n:Publication)=>Promise<T>,expectedVersion?:number,packageDownload=false){return this.tx(p,async(tx,a)=>{const n=await this.fileAccess(tx,a,id,true);if(expectedVersion!==undefined)ensure(n.version===expectedVersion,'PUBLICATION_VERSION_CONFLICT');if(packageDownload){ensure(operator(a),'PUBLICATION_OPERATOR_REQUIRED',403);ensure(['approved','executing'].includes(n.status),'PUBLICATION_PACKAGE_STATE');await this.readiness(tx,a,n,this.validateAssets.metadata??this.validateAssets);}return run(tx,a,n);});}
 private async requireReady(tx:PoolClient,a:Actor){ensure(a.teamId,'MEMBERSHIP_REQUIRED',403);ensure(this.enabled,'PUBLICATIONS_NOT_ENABLED',503);ensure((await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=30')).rowCount,'PUBLICATIONS_MIGRATION_REQUIRED',503);}
 private async tx<T>(p:Principal,fn:(tx:PoolClient,a:Actor)=>Promise<T>,read=false){const tx=await this.pool.connect();try{await tx.query(read?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN');await tx.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s'");const a=await this.resolveActor(tx,p);ensure(a&&a.enterpriseId===p.enterpriseId&&a.subject===p.subject&&a.teamId===p.teamId,'MEMBERSHIP_REQUIRED',403);await this.requireReady(tx,a);const r=await fn(tx,a);await tx.query('COMMIT');return r;}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}}
 private async row(tx:PoolClient,a:Actor,id:string){return(await tx.query('SELECT document FROM enterprise_workflow.publications WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,id])).rows[0]?.document as Publication|undefined;}
 private async order(tx:PoolClient,a:Actor,id:string){const o=(await tx.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,id])).rows[0]?.document as WorkOrder|undefined;ensure(o&&canRead(a,o),'PUBLICATION_SOURCE_UNAVAILABLE',404);return o;}
 private async readableOrder(tx:PoolClient,a:Actor,orderId:string){ensure((await tx.query(`SELECT 1 FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND document->>'enterpriseId'=$1::uuid::text AND id=$8 AND ${readScope('document','$7')}`,[...scopeArgs(a),orderId])).rowCount,'PUBLICATION_SOURCE_UNAVAILABLE',404);}
 private async access(tx:PoolClient,a:Actor,n:Publication,lock=true){ensure(n.enterpriseId===a.enterpriseId&&n.teamId===a.teamId,'PUBLICATION_NOT_FOUND',404);if(lock)await this.order(tx,a,n.source.orderId);else await this.readableOrder(tx,a,n.source.orderId);const s=(await tx.query(`SELECT 1 FROM enterprise_workflow.catalog_entities WHERE enterprise_id=$1 AND id=$2 AND kind='shop' AND document->'teamIds' ? $3::text${lock?' FOR SHARE':''}`,[a.enterpriseId,n.target.shop.id,a.teamId])).rowCount;ensure(s,'PUBLICATION_SHOP_FORBIDDEN',403);}
 private async source(tx:PoolClient,a:Actor,orderId:string,taskId:string){const o=await this.order(tx,a,orderId),t=o.tasks.find(t=>t.id===taskId);ensure(t?.status==='accepted'&&t.acceptedAt&&!o.cancellations?.some(c=>c.status==='applied')&&(['active','completed'].includes(o.status)||o.status==='archived'&&o.tasks.every(t=>t.status==='accepted')),'PUBLICATION_NOT_ACCEPTED');const accepted=(await tx.query("SELECT id,event FROM enterprise_workflow.events WHERE enterprise_id=$1 AND order_id=$2 AND event->>'type'='workflow.task.accepted.v1' AND event->'data'->>'taskId'=$3 ORDER BY aggregate_version DESC LIMIT 1",[a.enterpriseId,o.id,t.id])).rows[0];ensure(accepted&&accepted.event.data.acceptedAt===t.acceptedAt&&digest(accepted.event.data.assetIds)===digest(t.assetIds),'PUBLICATION_ACCEPTANCE_MISMATCH');
  const files=(await tx.query('SELECT id,revision,name,bytes,sha256 FROM enterprise_workflow.delivery_assets WHERE enterprise_id=$1 AND order_id=$2 AND task_id=$3 AND id=ANY($4::uuid[]) ORDER BY id',[a.enterpriseId,o.id,t.id,t.assetIds])).rows.map(f=>({...f,bytes:Number(f.bytes)}));ensure(files.length===t.assetIds.length&&files.length>0,'PUBLICATION_FILES_UNAVAILABLE');
  const source:PublicationSource={orderId:o.id,taskId:t.id,orderTitle:o.title,taskTitle:t.title,acceptanceId:accepted.id,acceptedAt:t.acceptedAt,participants:participants(t),guideline:o.guideline??null,files};return {o,t,source};
 }
 private async checked(tx:PoolClient,a:Actor,d:PublicationDraft,validate=this.validateAssets,lock=true){if(lock)await this.catalog.lock(tx,a.enterpriseId);const c=await this.source(tx,a,d.orderId,d.taskId),s=d.selection,target=await this.catalog.select(tx,a,s.shopId,s.skuId,s.revisions);ensure(c.o.catalog&&c.o.catalog.sku.id===target.sku.id&&c.o.catalog.product.id===target.product.id&&c.o.catalog.brand.id===target.brand.id,'PUBLICATION_PRODUCT_MISMATCH');await this.guidelines.validateOrder(tx,a,c.o,lock);ensure(await validate(tx,a,c.t.assetIds,{orderId:c.o.id,taskId:c.t.id}),'PUBLICATION_FILES_UNAVAILABLE');return {...c,target};}
 private async readiness(tx:PoolClient,a:Actor,n:Publication,validate=this.validateAssets,lock=true){const d:PublicationDraft={orderId:n.source.orderId,taskId:n.source.taskId,selection:n.target.selection,externalObjectId:n.externalObjectId,slot:n.slot,locale:n.locale,scheduleAt:n.scheduleAt},c=await this.checked(tx,a,d,validate,lock);ensure(digest(c.source)===digest(n.source)&&digest(c.target)===digest(n.target),'PUBLICATION_SOURCE_CHANGED');}
 private async currentAvailability(tx:PoolClient,a:Actor,n:Publication,snapshot=false){await tx.query('SAVEPOINT publication_availability');try{await this.assertFileReadiness(tx,a,n,snapshot?'snapshot':'full');await tx.query('RELEASE SAVEPOINT publication_availability');return {status:'available',checkedAt:this.now().toISOString(),code:null};}catch(e){await tx.query('ROLLBACK TO SAVEPOINT publication_availability');await tx.query('RELEASE SAVEPOINT publication_availability');if(!(e instanceof WorkflowError))throw e;return {status:'unavailable',checkedAt:this.now().toISOString(),code:e.code};}}
 private projection(a:Actor,n:Publication){return {publication:n,verification:'manual_report_not_platform_verified',canApprove:n.status==='draft'&&reviewer(a)&&n.createdBy!==a.subject&&!n.source.participants.includes(a.subject),canStart:n.status==='approved'&&operator(a),canReceipt:n.status==='executing'&&operator(a)&&n.executor===a.subject,canInvestigate:reviewer(a)&&['executing','unknown','recall_requested','recall_unknown'].includes(n.status),canRecall:a.permissions.includes('manage')&&['manual_published','unknown'].includes(n.status),canCancel:operator(a)&&['draft','approved'].includes(n.status),canReplace:reviewer(a)&&n.status==='manual_recalled'&&!n.replacementId};}
 private detachedReads(){return !!(this.resolveActor.readSnapshot&&this.validateAssets.readMetadata&&this.validateAssets.verifyFiles);}
 private async verifyReadFiles(enterpriseId:string,files:PublicationSource['files'],signal?:AbortSignal){
  signal?.throwIfAborted();ensure(this.verifyingReads<2,'PUBLICATION_FILES_BUSY',429);this.verifyingReads++;
  try{await this.validateAssets.verifyFiles!(enterpriseId,files,signal);}finally{this.verifyingReads--;}
 }
 async preview(p:Principal,raw:unknown,signal?:AbortSignal){const q=publicationPreview.parse(raw);
  const plan=async(tx:PoolClient,a:Actor,snapshot:boolean)=>{
   ensure(operator(a),'PUBLICATION_OPERATOR_REQUIRED',403);
   if(!snapshot)await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`order:${a.enterpriseId}:${q.draft.orderId}`]);
   const c=await this.checked(tx,a,q.draft,snapshot?this.validateAssets.readMetadata:this.validateAssets,!snapshot);
   return {source:c.source,target:c.target,draft:q.draft,previewHash:digest({p,q,source:c.source,target:c.target}),verification:'manual_plan_only'};
  };
  if(!this.detachedReads())return this.tx(p,(tx,a)=>plan(tx,a,false));
  return readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a)=>{await this.requireReady(tx,a);return plan(tx,a,true);},
   {statementTimeoutMs:20000,signal,betweenSnapshots:result=>this.verifyReadFiles(p.enterpriseId,result.source.files,signal),
    checkCurrent:async(tx,a,result)=>{ensure((await plan(tx,a,true)).previewHash===result.previewHash,'PUBLICATION_PREVIEW_CHANGED');}});
 }
 async execute(p:Principal,raw:unknown){const c=publicationCommand.parse(raw);return this.tx(p,async(tx,a)=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`publication-command:${a.enterpriseId}:${c.commandId}`]);for(const id of [...new Set([c.id,...c.action.type==='link-replacement'?[c.action.replacementId]:[]])].sort())await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`publication:${a.enterpriseId}:${id}`]);
  const old=await this.row(tx,a,c.id),action=c.action,oid=old?.source.orderId??(action.type==='create'?action.draft.orderId:null);ensure(oid,'PUBLICATION_NOT_FOUND',404);await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`order:${a.enterpriseId}:${oid}`]);const targetKey=old?key(old.target.shop.id,old.externalObjectId,old.slot,old.locale):action.type==='create'?key(action.draft.selection.shopId,action.draft.externalObjectId,action.draft.slot,action.draft.locale):null;ensure(targetKey,'PUBLICATION_NOT_FOUND',404);await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`publication-target:${a.enterpriseId}:${targetKey}`]);await this.catalog.lock(tx,a.enterpriseId);if(old)await this.access(tx,a,old);else ensure(action.type==='create','PUBLICATION_NOT_FOUND',404);
  if(['approve','resolve','mark-unknown','recall-receipt','link-replacement'].includes(action.type))ensure(reviewer(a),'PUBLICATION_REVIEWER_REQUIRED',403);else if(action.type==='request-recall')ensure(a.permissions.includes('manage'),'PUBLICATION_MANAGER_REQUIRED',403);else ensure(operator(a),'PUBLICATION_OPERATOR_REQUIRED',403);
  if(action.type==='approve')ensure(old&&old.createdBy!==a.subject&&!old.source.participants.includes(a.subject),'PUBLICATION_INDEPENDENT_APPROVAL',403);if(action.type==='receipt')ensure(old?.executor===a.subject,'PUBLICATION_EXECUTOR_REQUIRED',403);
  const fp=digest({p,c}),prior=(await tx.query('SELECT fingerprint,applied_version FROM enterprise_workflow.publication_commands WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,c.commandId])).rows[0];if(prior){ensure(prior.fingerprint===fp,'IDEMPOTENCY_CONFLICT');ensure(old,'PUBLICATION_NOT_FOUND',404);return {...this.projection(a,old),replayed:true,appliedVersion:prior.applied_version};}
  ensure((old?.version??0)===c.expectedVersion,'PUBLICATION_VERSION_CONFLICT');const at=this.now().toISOString();let n:Publication;
  if(action.type==='create'){ensure(!old,'PUBLICATION_EXISTS');const d=action.draft;await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`publication-target:${a.enterpriseId}:${key(d.selection.shopId,d.externalObjectId,d.slot,d.locale)}`]);const data=await this.checked(tx,a,d);ensure(digest({p,q:{id:c.id,draft:d},source:data.source,target:data.target})===action.previewHash,'PUBLICATION_PREVIEW_CHANGED');n={id:c.id,enterpriseId:a.enterpriseId,teamId:a.teamId!,version:1,status:'draft',createdBy:a.subject,createdAt:at,updatedAt:at,source:data.source,target:data.target,externalObjectId:d.externalObjectId,slot:d.slot,locale:d.locale,scheduleAt:d.scheduleAt};}
  else{ensure(old,'PUBLICATION_NOT_FOUND',404);n={...structuredClone(old),version:old.version+1,updatedAt:at};
   if(action.type==='approve'){ensure(n.status==='draft','PUBLICATION_STATE');await this.readiness(tx,a,n);n.status='approved';n.approvedBy=a.subject;n.approvedAt=at;}
   if(action.type==='start'){ensure(n.status==='approved','PUBLICATION_STATE');ensure(!n.scheduleAt||Date.parse(n.scheduleAt)<=+this.now(),'PUBLICATION_NOT_DUE');await this.readiness(tx,a,n);n.status='executing';n.executor=a.subject;n.startedAt=at;}
   if(action.type==='cancel'){ensure(['draft','approved'].includes(n.status),'PUBLICATION_STATE');n.status='cancelled';}
   if(action.type==='mark-unknown'){ensure(n.status==='executing','PUBLICATION_STATE');n.status='unknown';}
   if(action.type==='receipt'||action.type==='resolve'){ensure(n.status===(action.type==='receipt'?'executing':'unknown'),'PUBLICATION_STATE');ensure(Date.parse(action.reportedAt)<=+this.now()&&Date.parse(action.reportedAt)>=Date.parse(n.startedAt!),'PUBLICATION_REPORT_TIME',400);n.status=action.outcome==='published'?'manual_published':action.outcome==='failed'?'failed':'unknown';n.receipt={outcome:action.outcome,reportedAt:action.reportedAt,recordedAt:at,by:a.subject,evidence:action.evidence,url:action.url,source:'manual_report'};}
   if(action.type==='request-recall'){ensure(['manual_published','unknown'].includes(n.status),'PUBLICATION_STATE');n.status='recall_requested';n.recall={requestedBy:a.subject,requestedAt:at,reason:c.reason};}
   if(action.type==='recall-receipt'){ensure(['recall_requested','recall_unknown'].includes(n.status)&&n.recall,'PUBLICATION_STATE');ensure(Date.parse(action.reportedAt)<=+this.now()&&Date.parse(action.reportedAt)>=Date.parse(n.recall.requestedAt),'PUBLICATION_REPORT_TIME',400);n.status=action.outcome==='recalled'?'manual_recalled':'recall_unknown';n.recall.receipt={outcome:action.outcome,reportedAt:action.reportedAt,recordedAt:at,by:a.subject,evidence:action.evidence,url:action.url,source:'manual_report'};}
   if(action.type==='link-replacement'){ensure(n.status==='manual_recalled'&&!n.replacementId,'PUBLICATION_STATE');const replacement=await this.row(tx,a,action.replacementId);ensure(replacement&&replacement.id!==n.id,'PUBLICATION_REPLACEMENT_NOT_FOUND',404);await this.access(tx,a,replacement);ensure(key(n.target.shop.id,n.externalObjectId,n.slot,n.locale)===key(replacement.target.shop.id,replacement.externalObjectId,replacement.slot,replacement.locale)&&Date.parse(replacement.createdAt)>=Date.parse(n.recall!.receipt!.recordedAt)&&!['failed','cancelled','manual_recalled'].includes(replacement.status),'PUBLICATION_REPLACEMENT_MISMATCH');n.replacementId=replacement.id;}
  }
  const tk=key(n.target.shop.id,n.externalObjectId,n.slot,n.locale);if(active.includes(n.status)){await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`publication-target:${a.enterpriseId}:${tk}`]);ensure(!(await tx.query('SELECT 1 FROM enterprise_workflow.publications WHERE enterprise_id=$1 AND target_key=$2 AND id<>$3 AND status=ANY($4::text[])',[a.enterpriseId,tk,n.id,active])).rowCount,'PUBLICATION_TARGET_OCCUPIED');}
  await tx.query('INSERT INTO enterprise_workflow.publication_commands(enterprise_id,id,publication_id,subject,fingerprint,applied_version)VALUES($1,$2,$3,$4,$5,$6)',[a.enterpriseId,c.commandId,n.id,a.subject,fp,n.version]);await tx.query('INSERT INTO enterprise_workflow.publications(enterprise_id,id,team_id,order_id,task_id,shop_id,target_key,version,status,document)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(enterprise_id,id)DO UPDATE SET version=EXCLUDED.version,status=EXCLUDED.status,document=EXCLUDED.document,updated_at=now()',[a.enterpriseId,n.id,n.teamId,n.source.orderId,n.source.taskId,n.target.shop.id,tk,n.version,n.status,n]);await tx.query('INSERT INTO enterprise_workflow.publication_revisions(enterprise_id,publication_id,revision,command_id,actor,reason,action,document)VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[a.enterpriseId,n.id,n.version,c.commandId,a.subject,c.reason,action.type,n]);return {...this.projection(a,n),replayed:false,appliedVersion:n.version};
 });}
 private async list(tx:PoolClient,a:Actor,q:Extract<ReturnType<typeof publicationQuery.parse>,{action:'list'}>){
  const args:unknown[]=scopeArgs(a),filters:string[]=[];
  for(const [column,value] of [['status',q.status],['order_id',q.orderId],['shop_id',q.shopId]] as const){if(value)filters.push(` AND p.${column}=$${args.push(value)}`);}
  const from=listScope+filters.join(''),offset=(q.page-1)*30;
  const total=Number((await tx.query('SELECT count(*) n '+from,args)).rows[0].n);
  const items=offset>=total?[]:(await tx.query(`WITH page AS MATERIALIZED (
    SELECT p.id,p.updated_at ${from} ORDER BY p.updated_at DESC,p.id DESC LIMIT 30 OFFSET $${args.length+1}
   ) SELECT p.id,p.version,p.status,p.document #>> '{source,taskTitle}' AS "taskTitle",p.document #>> '{target,shop,document,name}' AS shop,
     p.document->>'externalObjectId' AS "externalObjectId",p.document->>'slot' AS slot,p.document->>'locale' AS locale,
     p.document->>'scheduleAt' AS "scheduleAt",p.document->>'updatedAt' AS "updatedAt"
   FROM page JOIN enterprise_workflow.publications p ON p.enterprise_id=$1 AND p.id=page.id
   ORDER BY page.updated_at DESC,page.id DESC`,[...args,offset])).rows.map(r=>({...r,verification:'manual_report_not_platform_verified'}));
  return {items,total,page:q.page,canCreate:operator(a)};
 }
 async read(p:Principal,raw:unknown,signal?:AbortSignal){const q=publicationQuery.parse(raw);
 if(q.action==='list')return readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a)=>{
  await this.requireReady(tx,a);return this.list(tx,a,q);
 },{legacyRepeatable:true,statementTimeoutMs:20000,signal,checkCurrent:async(tx,a,{items})=>{
  if(!items.length)return;
  ensure((await tx.query(`SELECT p.id ${listScope} AND p.id=ANY($8::uuid[])`,[...scopeArgs(a),items.map(i=>i.id)])).rowCount===items.length,'READ_SCOPE_CHANGED');
 }});
 if(q.action==='source')return readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a)=>{
  await this.requireReady(tx,a);const c=await this.source(tx,a,q.orderId,q.taskId);return {source:c.source,catalog:c.o.catalog??null,canCreate:operator(a)};
 },{legacyRepeatable:true,statementTimeoutMs:20000,signal,checkCurrent:(tx,a)=>this.readableOrder(tx,a,q.orderId)});
 if(q.action==='history'){
  const current=async(tx:PoolClient,a:Actor,lock:boolean)=>{const n=await this.row(tx,a,q.id);ensure(n,'PUBLICATION_NOT_FOUND',404);await this.access(tx,a,n,lock);return n;};
  return readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a,snapshot)=>{
   await this.requireReady(tx,a);const n=await current(tx,a,!snapshot),offset=(q.page-1)*30;
   const events=offset>=n.version?[]:(await tx.query(`WITH page AS MATERIALIZED (
     SELECT revision FROM enterprise_workflow.publication_revisions WHERE enterprise_id=$1 AND publication_id=$2 ORDER BY revision DESC LIMIT 30 OFFSET $3
    ) SELECT r.revision,r.actor,r.reason,r.action,r.document,r.created_at FROM page JOIN enterprise_workflow.publication_revisions r
      ON r.enterprise_id=$1 AND r.publication_id=$2 AND r.revision=page.revision ORDER BY r.revision DESC`,[a.enterpriseId,n.id,offset])).rows;
   return {events,total:n.version,page:q.page};
  },{legacyRepeatable:true,statementTimeoutMs:20000,signal,checkCurrent:async(tx,a)=>{await current(tx,a,false);}});
 }
 if(this.detachedReads()){
  const current=async(tx:PoolClient,a:Actor)=>{const n=await this.row(tx,a,q.id);ensure(n,'PUBLICATION_NOT_FOUND',404);await this.access(tx,a,n,false);return n;};
  return readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a)=>{
   await this.requireReady(tx,a);const n=await current(tx,a);return {...this.projection(a,n),availability:await this.currentAvailability(tx,a,n,true)};
  },{statementTimeoutMs:20000,signal,betweenSnapshots:async result=>{
   if(result.availability.status!=='available')return;
   try{await this.verifyReadFiles(p.enterpriseId,result.publication.source.files,signal);}
   catch(e){if(!(e instanceof WorkflowError)||e.status!==409)throw e;result.availability={status:'unavailable',checkedAt:result.availability.checkedAt,code:e.code};}
  },checkCurrent:async(tx,a,result)=>{
   const n=await current(tx,a);ensure(n.version===result.publication.version,'PUBLICATION_VERSION_CONFLICT');
   const availability=await this.currentAvailability(tx,a,n,true);if(availability.status==='unavailable')result.availability=availability;
  }});
 }
 return this.tx(p,async(tx,a)=>{
  const n=await this.row(tx,a,q.id);ensure(n,'PUBLICATION_NOT_FOUND',404);await this.catalog.lock(tx,a.enterpriseId);await this.access(tx,a,n);return {...this.projection(a,n),availability:await this.currentAvailability(tx,a,n)};
 },true);}
}
