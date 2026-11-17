import type {Pool,PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {WorkflowError,type Actor,type Principal,type WorkOrder,type Command} from './contracts';
import {canRead,evolve} from './domain';
import type {ResolveActor} from './store';
import type {FormStore} from './form-store';
import type {CatalogStore} from './catalog-store';
import {sourceDigest} from './source-files';
import {readScope} from './read-scope';
import {readWorkflowSnapshot} from './read-transaction';
import {demandBatchInput,demandBatchApply,demandBatchQuery,type DemandBatchInput,type DemandEntry} from './demand-batch-contracts';
function need(ok:unknown,code:string,status=409):asserts ok{if(!ok)throw new WorkflowError(status,code);}
type Draft=Pick<WorkOrder,'title'|'brief'|'acceptance'|'routingFields'|'form'|'catalog'>;
type Item={orderId:string;ok:true;draft:Draft;copy:DemandEntry['copy']}|{orderId:string;ok:false;error:string};
type DraftReads={orders:Map<string,WorkOrder|null>;forms:Map<string,NonNullable<Draft['form']>>;catalog:Map<string,NonNullable<Draft['catalog']>>};
type ReceiptRow={id:string;created_at:Date;team_id:string;subject:string;identity_hash:string;fingerprint?:string;items:{orderId:string}[]};
const orderScope=`FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND document->>'enterpriseId'=$8 AND id=ANY($9::uuid[]) AND ${readScope('document','$7')}`;
const orderScopeArgs=(a:Actor,ids:readonly string[])=>[a.enterpriseId,a.teamId,a.permissions.some(p=>['manage','dispatch','review'].includes(p)),a.subject,a.permissions.includes('execute'),a.workKinds,a.permissions.some(p=>['manage','dispatch'].includes(p)),a.enterpriseId,ids];
const commandId=(batch:string,order:string)=>{const h=createHash('sha256').update('demand-batch:'+batch+':'+order).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
export class DemandBatchStore{
 constructor(private pool:Pool,private resolveActor:ResolveActor,private forms:FormStore,private catalog:CatalogStore,private enabled=true){}
 private async authorize(tx:PoolClient,a:Actor){need(a.teamId,'MEMBERSHIP_REQUIRED',403);need(a.permissions.includes('request'),'DEMAND_REQUEST_REQUIRED',403);need(this.enabled,'DEMAND_BATCH_NOT_ENABLED',503);need((await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=21')).rowCount,'DEMAND_BATCH_MIGRATION_REQUIRED',503);}
 private async actor(tx:PoolClient,p:Principal){const a=await this.resolveActor(tx,p);need(a&&a.enterpriseId===p.enterpriseId&&a.teamId===p.teamId&&a.subject===p.subject,'MEMBERSHIP_REQUIRED',403);await this.authorize(tx,a);return a;}
 private async tx<T>(p:Principal,fn:(tx:PoolClient,a:Actor)=>Promise<T>){const t=await this.pool.connect();try{await t.query('BEGIN');await t.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s'");const a=await this.actor(t,p),r=await fn(t,a);await t.query('COMMIT');return r;}catch(e){await t.query('ROLLBACK');throw e;}finally{t.release();}}
 private async locks(tx:PoolClient,a:Actor,input:DemandBatchInput){const ids=[...new Set(input.entries.flatMap(e=>[e.orderId,...e.copy?[e.copy.orderId]:[]]))].sort();for(const id of ids)await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`order:${a.enterpriseId}:${id}`]);}
 private async draft(tx:PoolClient,a:Actor,e:DemandEntry,reads?:DraftReads):Promise<Draft>{
  const targetExists=reads?reads.orders.has(e.orderId):(await tx.query('SELECT 1 FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,e.orderId])).rowCount;
  need(!targetExists,'DEMAND_TARGET_EXISTS');const d:Draft={title:e.title,brief:e.brief,acceptance:e.acceptance,...e.routingFields?{routingFields:e.routingFields}:{}};
  if(e.copy){const o=reads?reads.orders.get(e.copy.orderId):(await tx.query<{document:WorkOrder}>('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[a.enterpriseId,e.copy.orderId])).rows[0]?.document;need(o&&canRead(a,o)&&(o.requestTeamId??o.teamId)===a.teamId,'DEMAND_COPY_UNAVAILABLE',404);need(o.version===e.copy.version,'DEMAND_COPY_VERSION_CHANGED');
   if(e.copy.includeRouting&&o.routingFields)d.routingFields=o.routingFields;
   if(e.copy.includeForm){need(o.form,'DEMAND_COPY_FORM_MISSING');need(o.form.teamId===a.teamId,'FORM_SCOPE_MISMATCH',403);const selection={templateId:o.form.templateId,revision:o.form.revision,values:o.form.values};
    d.form=reads?(reads.forms.get(o.id)??await this.forms.readSelection(tx,a,selection)):await this.forms.selection(tx,a,selection);need(sourceDigest(d.form.definition)===sourceDigest(o.form.definition),'FORM_SNAPSHOT_MISMATCH');reads?.forms.set(o.id,d.form);}
   if(e.copy.includeCatalog){need(o.catalog,'DEMAND_COPY_CATALOG_MISSING');if(!reads)await this.catalog.lock(tx,a.enterpriseId);const s=o.catalog.selection,k=sourceDigest(s);d.catalog=reads?.catalog.get(k)??await this.catalog.select(tx,a,s.shopId,s.skuId,s.revisions);reads?.catalog.set(k,d.catalog);}
  }return d;
 }
 private async previewTx(tx:PoolClient,a:Actor,p:Principal,input:DemandBatchInput,snapshot=false){
  let reads:DraftReads|undefined;
  if(snapshot){
   const targets=input.entries.map(e=>e.orderId),sources=[...new Set(input.entries.flatMap(e=>e.copy?[e.copy.orderId]:[]))];
   const rows=(await tx.query<{id:string;document:WorkOrder|null}>(`SELECT id,CASE WHEN id=ANY($3::uuid[]) THEN document END AS document
    FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND (id=ANY($2::uuid[]) OR id=ANY($3::uuid[]))`,[a.enterpriseId,targets,sources])).rows;
   reads={orders:new Map(rows.map(r=>[r.id,r.document])),forms:new Map(),catalog:new Map()};
  }else{
   await this.locks(tx,a,input);
   // Acquire optional feature locks in the same forms -> catalog order as normal submission.
   if(input.entries.some(e=>e.copy?.includeForm))await this.forms.lock(tx,a);
   if(input.entries.some(e=>e.copy?.includeCatalog))await this.catalog.lock(tx,a.enterpriseId);
  }
  const items:Item[]=[];for(const e of input.entries){
   if(!snapshot)await tx.query('SAVEPOINT demand_preview_row');
   try{const draft=await this.draft(tx,a,e,reads);if(!snapshot)await tx.query('RELEASE SAVEPOINT demand_preview_row');items.push({orderId:e.orderId,ok:true,draft,copy:e.copy});}
   catch(error){if(!snapshot){await tx.query('ROLLBACK TO SAVEPOINT demand_preview_row');await tx.query('RELEASE SAVEPOINT demand_preview_row');}if(!(error instanceof WorkflowError))throw error;items.push({orderId:e.orderId,ok:false,error:error.code});}
  }
  need(Buffer.byteLength(JSON.stringify(items),'utf8')<=2*1024*1024,'DEMAND_BATCH_SNAPSHOT_TOO_LARGE',413);
  return {batchId:input.batchId,valid:items.every(x=>x.ok),count:items.length,items,previewHash:sourceDigest({p,input,items}),excluded:['tasks','assignees','status','approvals','routingDecision','sourceRow','attachments','deliveries','acceptances','contributions','performance','naumiLinks']};
 }
 async preview(p:Principal,raw:unknown,signal?:AbortSignal){const input=demandBatchInput.parse(raw);return readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a,snapshot)=>{
  await this.authorize(tx,a);return this.previewTx(tx,a,p,input,snapshot);
 },{statementTimeoutMs:20000,signal,checkCurrent:async(tx,a,{items})=>{
  const copies=items.filter((i):i is Extract<Item,{ok:true}>=>i.ok&&!!i.copy);
  if(!copies.length)return;
  const ids=[...new Set(copies.map(i=>i.copy!.orderId))];
  const versions=new Map((await tx.query<{id:string;version:number}>(`SELECT id,version ${orderScope} AND COALESCE(document->>'requestTeamId',document->>'teamId')=$2`,orderScopeArgs(a,ids))).rows.map(r=>[r.id,r.version]));
  for(const {copy} of copies){need(versions.has(copy!.orderId),'DEMAND_COPY_UNAVAILABLE',404);need(versions.get(copy!.orderId)===copy!.version,'DEMAND_COPY_VERSION_CHANGED');}
  await this.forms.checkReadableSelections(tx,a,copies.flatMap(i=>i.draft.form?[i.draft.form]:[]));
  const catalog=new Map(copies.flatMap(i=>i.draft.catalog?[[sourceDigest(i.draft.catalog.selection),i.draft.catalog.selection] as const]:[]));
  for(const s of catalog.values())await this.catalog.select(tx,a,s.shopId,s.skuId,s.revisions);
 }});}
 private owned(row:ReceiptRow|undefined,p:Principal){need(row&&row.team_id===p.teamId&&row.subject===p.subject&&row.identity_hash===sourceDigest(p),'DEMAND_BATCH_NOT_FOUND',404);return row;}
 private async receipt(tx:PoolClient,a:Actor,row:ReceiptRow,replayed:boolean){
  const current=await tx.query<{id:string;title:string;version:number;status:WorkOrder['status']}>(`SELECT id,document->>'title' AS title,version,document->>'status' AS status ${orderScope}`,orderScopeArgs(a,row.items.map(x=>x.orderId)));
  const byId=new Map(current.rows.map(o=>[o.id,o]));
  const items=row.items.map(({orderId})=>{const o=byId.get(orderId);return o?{orderId,title:o.title,createdVersion:1,currentVersion:o.version,status:o.status,available:true as const}:{orderId,available:false as const};});
  return {batchId:row.id,createdAt:row.created_at,items,replayed};
 }
 async apply(p:Principal,raw:unknown){const parsed=demandBatchApply.parse(raw),{previewHash,confirmed,...input}=parsed;return this.tx(p,async(tx,a)=>{await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`demand-batch:${a.enterpriseId}:${input.batchId}`]);const fingerprint=sourceDigest({p,input,previewHash}),prior=(await tx.query<ReceiptRow>("SELECT id,team_id,subject,identity_hash,fingerprint,created_at,document->'items' AS items FROM enterprise_workflow.demand_creation_batches WHERE enterprise_id=$1 AND id=$2",[a.enterpriseId,input.batchId])).rows[0];if(prior){this.owned(prior,p);need(prior.fingerprint===fingerprint,'DEMAND_BATCH_REPLAY_CHANGED');return this.receipt(tx,a,prior,true);}
  const plan=await this.previewTx(tx,a,p,input);need(plan.previewHash===previewHash,'DEMAND_BATCH_PREVIEW_CHANGED');need(plan.valid,'DEMAND_BATCH_INVALID',400);const at=new Date().toISOString();
  for(const item of plan.items){need(item.ok,'DEMAND_BATCH_INVALID',400);const d=item.draft,cid=commandId(input.batchId,item.orderId);need(!(await tx.query('SELECT 1 FROM enterprise_workflow.commands WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,cid])).rowCount,'DEMAND_COMMAND_COLLISION');const c:Command={commandId:cid,orderId:item.orderId,expectedVersion:0,action:{type:'create',title:d.title,brief:d.brief,acceptance:d.acceptance,...d.routingFields?{routingFields:d.routingFields}:{}}},r=evolve(null,a,c,at);
   Object.assign(r.order,{...d,creationOrigin:{batchId:input.batchId,...item.copy?{orderId:item.copy.orderId,version:item.copy.version}:{}}});r.event.data.creation={batchId:input.batchId,reason:input.reason,copy:item.copy??null,form:d.form??null,catalog:d.catalog??null};
   await tx.query('INSERT INTO enterprise_workflow.orders(enterprise_id,id,version,document)VALUES($1,$2,1,$3)',[a.enterpriseId,r.order.id,r.order]);await tx.query('INSERT INTO enterprise_workflow.events(enterprise_id,id,order_id,aggregate_version,event)VALUES($1,$2,$3,1,$4)',[a.enterpriseId,r.event.id,r.order.id,r.event]);
   // A dedicated fingerprint prevents replay through the generic create endpoint from pretending this was a plain create.
   await tx.query('INSERT INTO enterprise_workflow.commands(enterprise_id,id,subject,order_id,fingerprint,result)VALUES($1,$2,$3,$4,$5,$6)',[a.enterpriseId,cid,a.subject,r.order.id,sourceDigest({kind:'demand-batch',p,input,previewHash,orderId:item.orderId}),r.order]);
  }
  const row=(await tx.query<ReceiptRow>("INSERT INTO enterprise_workflow.demand_creation_batches(enterprise_id,id,team_id,subject,identity_hash,fingerprint,preview_hash,reason,document)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,team_id,subject,identity_hash,created_at,document->'items' AS items",[a.enterpriseId,input.batchId,a.teamId,a.subject,sourceDigest(p),fingerprint,previewHash,input.reason,{items:plan.items.map(x=>({orderId:x.orderId})),input}])).rows[0];return this.receipt(tx,a,row,false);
 });}
 async read(p:Principal,raw:unknown,signal?:AbortSignal){const q=demandBatchQuery.parse(raw);return readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a)=>{
  await this.authorize(tx,a);
  const args=[a.enterpriseId,a.teamId,a.subject,sourceDigest(p)],where='enterprise_id=$1 AND team_id=$2 AND subject=$3 AND identity_hash=$4';
  if(q.action==='detail'){
   const row=this.owned((await tx.query<ReceiptRow>(`SELECT id,team_id,subject,identity_hash,created_at,document->'items' AS items FROM enterprise_workflow.demand_creation_batches WHERE ${where} AND id=$5`,[...args,q.id])).rows[0],p);
   return this.receipt(tx,a,row,true);
  }
  const total=(await tx.query('SELECT count(*)::int n FROM enterprise_workflow.demand_creation_batches WHERE '+where,args)).rows[0].n,offset=(q.page-1)*30;
  const batches=offset>=total?[]:(await tx.query(`WITH page AS MATERIALIZED (SELECT id,created_at FROM enterprise_workflow.demand_creation_batches WHERE ${where} ORDER BY created_at DESC,id LIMIT 30 OFFSET $5)
   SELECT b.id,b.created_at,jsonb_array_length(b.document->'items') AS count FROM page JOIN enterprise_workflow.demand_creation_batches b ON b.enterprise_id=$1 AND b.id=page.id ORDER BY page.created_at DESC,page.id`,[...args,offset])).rows;
  return {batches,total,page:q.page};
 },{statementTimeoutMs:20000,legacyRepeatable:true,signal,checkCurrent:async(tx,a,result)=>{
  const ids='items' in result?result.items?.filter(i=>i.available).map(i=>i.orderId)??[]:[];
  if(ids.length)need((await tx.query(`SELECT id ${orderScope}`,orderScopeArgs(a,ids))).rowCount===ids.length,'READ_SCOPE_CHANGED');
 }});}
}
