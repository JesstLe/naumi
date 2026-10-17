import type {Pool,PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {WorkflowError,type Actor,type Principal,type WorkOrder,type Command} from './contracts';
import {canRead,evolve} from './domain';
import type {ResolveActor} from './store';
import type {FormStore} from './form-store';
import type {CatalogStore} from './catalog-store';
import {sourceDigest} from './source-files';
import {demandBatchInput,demandBatchApply,demandBatchQuery,type DemandBatchInput,type DemandEntry} from './demand-batch-contracts';
function need(ok:unknown,code:string,status=409):asserts ok{if(!ok)throw new WorkflowError(status,code);}
type Draft=Pick<WorkOrder,'title'|'brief'|'acceptance'|'routingFields'|'form'|'catalog'>;
type Item={orderId:string;ok:true;draft:Draft;copy:DemandEntry['copy']}|{orderId:string;ok:false;error:string};
const commandId=(batch:string,order:string)=>{const h=createHash('sha256').update('demand-batch:'+batch+':'+order).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
export class DemandBatchStore{
 constructor(private pool:Pool,private resolveActor:ResolveActor,private forms:FormStore,private catalog:CatalogStore,private enabled=true){}
 private async actor(tx:PoolClient,p:Principal){const a=await this.resolveActor(tx,p);need(a&&a.teamId&&a.enterpriseId===p.enterpriseId&&a.teamId===p.teamId&&a.subject===p.subject,'MEMBERSHIP_REQUIRED',403);need(a.permissions.includes('request'),'DEMAND_REQUEST_REQUIRED',403);need(this.enabled,'DEMAND_BATCH_NOT_ENABLED',503);need((await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=21')).rowCount,'DEMAND_BATCH_MIGRATION_REQUIRED',503);return a;}
 private async tx<T>(p:Principal,fn:(tx:PoolClient,a:Actor)=>Promise<T>){const t=await this.pool.connect();try{await t.query('BEGIN');await t.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s'");const a=await this.actor(t,p),r=await fn(t,a);await t.query('COMMIT');return r;}catch(e){await t.query('ROLLBACK');throw e;}finally{t.release();}}
 private async locks(tx:PoolClient,a:Actor,input:DemandBatchInput){const ids=[...new Set(input.entries.flatMap(e=>[e.orderId,...e.copy?[e.copy.orderId]:[]]))].sort();for(const id of ids)await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`order:${a.enterpriseId}:${id}`]);}
 private async draft(tx:PoolClient,a:Actor,e:DemandEntry):Promise<Draft>{need(!(await tx.query('SELECT 1 FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,e.orderId])).rowCount,'DEMAND_TARGET_EXISTS');const d:Draft={title:e.title,brief:e.brief,acceptance:e.acceptance,...e.routingFields?{routingFields:e.routingFields}:{}};
  if(e.copy){const o=(await tx.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[a.enterpriseId,e.copy.orderId])).rows[0]?.document as WorkOrder|undefined;need(o&&canRead(a,o)&&(o.requestTeamId??o.teamId)===a.teamId,'DEMAND_COPY_UNAVAILABLE',404);need(o.version===e.copy.version,'DEMAND_COPY_VERSION_CHANGED');
   if(e.copy.includeRouting&&o.routingFields)d.routingFields=o.routingFields;
   if(e.copy.includeForm){need(o.form,'DEMAND_COPY_FORM_MISSING');need(o.form.teamId===a.teamId,'FORM_SCOPE_MISMATCH',403);d.form=await this.forms.selection(tx,a,{templateId:o.form.templateId,revision:o.form.revision,values:o.form.values});need(sourceDigest(d.form.definition)===sourceDigest(o.form.definition),'FORM_SNAPSHOT_MISMATCH');}
   if(e.copy.includeCatalog){need(o.catalog,'DEMAND_COPY_CATALOG_MISSING');await this.catalog.lock(tx,a.enterpriseId);const s=o.catalog.selection;d.catalog=await this.catalog.select(tx,a,s.shopId,s.skuId,s.revisions);}
  }return d;
 }
 private async previewTx(tx:PoolClient,a:Actor,p:Principal,input:DemandBatchInput){await this.locks(tx,a,input);
  // Acquire optional feature locks in the same forms -> catalog order as normal submission.
  if(input.entries.some(e=>e.copy?.includeForm))await this.forms.lock(tx,a);
  if(input.entries.some(e=>e.copy?.includeCatalog))await this.catalog.lock(tx,a.enterpriseId);
  const items:Item[]=[];for(const e of input.entries){await tx.query('SAVEPOINT demand_preview_row');try{const draft=await this.draft(tx,a,e);items.push({orderId:e.orderId,ok:true,draft,copy:e.copy});await tx.query('RELEASE SAVEPOINT demand_preview_row');}catch(error){await tx.query('ROLLBACK TO SAVEPOINT demand_preview_row');await tx.query('RELEASE SAVEPOINT demand_preview_row');if(!(error instanceof WorkflowError))throw error;items.push({orderId:e.orderId,ok:false,error:error.code});}}
  need(Buffer.byteLength(JSON.stringify(items),'utf8')<=2*1024*1024,'DEMAND_BATCH_SNAPSHOT_TOO_LARGE',413);
  return {batchId:input.batchId,valid:items.every(x=>x.ok),count:items.length,items,previewHash:sourceDigest({p,input,items}),excluded:['tasks','assignees','status','approvals','routingDecision','sourceRow','attachments','deliveries','acceptances','contributions','performance','naumiLinks']};
 }
 async preview(p:Principal,raw:unknown){const input=demandBatchInput.parse(raw);return this.tx(p,(tx,a)=>this.previewTx(tx,a,p,input));}
 private owned(row:any,p:Principal){need(row&&row.team_id===p.teamId&&row.subject===p.subject&&row.identity_hash===sourceDigest(p),'DEMAND_BATCH_NOT_FOUND',404);return row;}
 private async receipt(tx:PoolClient,a:Actor,row:any,replayed:boolean){const items=[];for(const x of row.document.items){const o=(await tx.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,x.orderId])).rows[0]?.document as WorkOrder|undefined;items.push(o&&canRead(a,o)?{orderId:x.orderId,title:o.title,createdVersion:1,currentVersion:o.version,status:o.status,available:true}:{orderId:x.orderId,available:false});}return {batchId:row.id,createdAt:row.created_at,items,replayed};}
 async apply(p:Principal,raw:unknown){const parsed=demandBatchApply.parse(raw),{previewHash,confirmed,...input}=parsed;return this.tx(p,async(tx,a)=>{await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`demand-batch:${a.enterpriseId}:${input.batchId}`]);const fingerprint=sourceDigest({p,input,previewHash}),prior=(await tx.query('SELECT * FROM enterprise_workflow.demand_creation_batches WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,input.batchId])).rows[0];if(prior){this.owned(prior,p);need(prior.fingerprint===fingerprint,'DEMAND_BATCH_REPLAY_CHANGED');return this.receipt(tx,a,prior,true);}
  const plan=await this.previewTx(tx,a,p,input);need(plan.previewHash===previewHash,'DEMAND_BATCH_PREVIEW_CHANGED');need(plan.valid,'DEMAND_BATCH_INVALID',400);const at=new Date().toISOString();
  for(const item of plan.items){need(item.ok,'DEMAND_BATCH_INVALID',400);const d=item.draft,cid=commandId(input.batchId,item.orderId);need(!(await tx.query('SELECT 1 FROM enterprise_workflow.commands WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,cid])).rowCount,'DEMAND_COMMAND_COLLISION');const c:Command={commandId:cid,orderId:item.orderId,expectedVersion:0,action:{type:'create',title:d.title,brief:d.brief,acceptance:d.acceptance,...d.routingFields?{routingFields:d.routingFields}:{}}},r=evolve(null,a,c,at);
   Object.assign(r.order,{...d,creationOrigin:{batchId:input.batchId,...item.copy?{orderId:item.copy.orderId,version:item.copy.version}:{}}});r.event.data.creation={batchId:input.batchId,reason:input.reason,copy:item.copy??null,form:d.form??null,catalog:d.catalog??null};
   await tx.query('INSERT INTO enterprise_workflow.orders(enterprise_id,id,version,document)VALUES($1,$2,1,$3)',[a.enterpriseId,r.order.id,r.order]);await tx.query('INSERT INTO enterprise_workflow.events(enterprise_id,id,order_id,aggregate_version,event)VALUES($1,$2,$3,1,$4)',[a.enterpriseId,r.event.id,r.order.id,r.event]);
   // A dedicated fingerprint prevents replay through the generic create endpoint from pretending this was a plain create.
   await tx.query('INSERT INTO enterprise_workflow.commands(enterprise_id,id,subject,order_id,fingerprint,result)VALUES($1,$2,$3,$4,$5,$6)',[a.enterpriseId,cid,a.subject,r.order.id,sourceDigest({kind:'demand-batch',p,input,previewHash,orderId:item.orderId}),r.order]);
  }
  const row=(await tx.query('INSERT INTO enterprise_workflow.demand_creation_batches(enterprise_id,id,team_id,subject,identity_hash,fingerprint,preview_hash,reason,document)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[a.enterpriseId,input.batchId,a.teamId,a.subject,sourceDigest(p),fingerprint,previewHash,input.reason,{items:plan.items.map(x=>({orderId:x.orderId})),input}])).rows[0];return this.receipt(tx,a,row,false);
 });}
 async read(p:Principal,raw:unknown){const q=demandBatchQuery.parse(raw);return this.tx(p,async(tx,a)=>{if(q.action==='detail'){const row=this.owned((await tx.query('SELECT * FROM enterprise_workflow.demand_creation_batches WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,q.id])).rows[0],p);return this.receipt(tx,a,row,true);}const args=[a.enterpriseId,a.teamId,a.subject,sourceDigest(p)],where='enterprise_id=$1 AND team_id=$2 AND subject=$3 AND identity_hash=$4';return {batches:(await tx.query('SELECT id,created_at,jsonb_array_length(document->\'items\') count FROM enterprise_workflow.demand_creation_batches WHERE '+where+' ORDER BY created_at DESC,id LIMIT 30 OFFSET $5',[...args,(q.page-1)*30])).rows,total:(await tx.query('SELECT count(*)::int n FROM enterprise_workflow.demand_creation_batches WHERE '+where,args)).rows[0].n,page:q.page};});}
}
