import type {Pool,PoolClient} from 'pg';
import {WorkflowError,type Actor,type Principal,type WorkOrder} from './contracts';
import type {ResolveActor} from './store';
import {formCommand,formQuery,formSelection,type FormBook,type FormSnapshot,type FormDefinition} from './form-contracts';
import {validateFormValues} from './form-validation';
import {sourceDigest} from './source-files';
import {readWorkflowSnapshot} from './read-transaction';
const need=(v:unknown,code:string,status=409)=>{if(!v)throw new WorkflowError(status,code);};
export class FormStore{
 constructor(readonly pool:Pool,private resolveActor:ResolveActor,private enabled=true,private assetsEnabled=false){}
 async available(tx:PoolClient){need(this.enabled,'FORMS_NOT_ENABLED',503);need((await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=20')).rowCount,'FORMS_MIGRATION_REQUIRED',503);}
 async lock(tx:PoolClient,p:Principal){await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`forms:${p.enterpriseId}:${p.teamId}`]);}
 private async actor(tx:PoolClient,p:Principal){const a=await this.resolveActor(tx,p);need(a&&a.teamId&&a.enterpriseId===p.enterpriseId&&a.teamId===p.teamId&&a.subject===p.subject,'MEMBERSHIP_REQUIRED',403);await this.available(tx);return a!;}
 private async tx<T>(p:Principal,fn:(t:PoolClient,a:Actor)=>Promise<T>){const t=await this.pool.connect();try{await t.query('BEGIN');await t.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='15s'");const a=await this.actor(t,p);await this.lock(t,p);const r=await fn(t,a);await t.query('COMMIT');return r;}catch(e){await t.query('ROLLBACK');throw e;}finally{t.release();}}
 private async book(tx:PoolClient,p:Principal,id:string){return (await tx.query('SELECT document FROM enterprise_workflow.form_templates WHERE enterprise_id=$1 AND team_id=$2 AND id=$3',[p.enterpriseId,p.teamId,id])).rows[0]?.document as FormBook|undefined;}
 private async revision(tx:PoolClient,p:Principal,id:string,revision:number){return (await tx.query('SELECT document FROM enterprise_workflow.form_revisions WHERE enterprise_id=$1 AND team_id=$2 AND id=$3 AND revision=$4',[p.enterpriseId,p.teamId,id,revision])).rows[0]?.document as {definition:FormDefinition;author:string;publishedBy:string;at:string}|undefined;}
 private async select(tx:PoolClient,a:Actor,raw:unknown,lock:boolean):Promise<FormSnapshot>{await this.available(tx);const input=formSelection.parse(raw);if(lock)await this.lock(tx,a);const b=await this.book(tx,a,input.templateId);need(b,'FORM_NOT_FOUND',404);need(b!.enabled,'FORM_DISABLED');const r=await this.revision(tx,a,input.templateId,input.revision);need(r,'FORM_REVISION_NOT_FOUND',404);if(r!.definition.attachmentRules)need(this.assetsEnabled,'DEMAND_ASSETS_NOT_ENABLED',503);validateFormValues(r!.definition,input.values,false);return {templateId:input.templateId,teamId:a.teamId!,revision:input.revision,definition:r!.definition,values:input.values};}
 selection(tx:PoolClient,a:Actor,raw:unknown){return this.select(tx,a,raw,true);}
 /** For projections in a read-only workflow snapshot; confirmations still use the locked selection. */
 readSelection(tx:PoolClient,a:Actor,raw:unknown){return this.select(tx,a,raw,false);}
 async checkReadableSelections(tx:PoolClient,a:Actor,selections:readonly Pick<FormSnapshot,'templateId'|'revision'>[]){
  if(!selections.length)return;
  const rows=(await tx.query(`SELECT t.id,(t.document->>'enabled')::boolean enabled,r.revision
   FROM unnest($3::uuid[],$4::int[]) AS chosen(id,revision)
   LEFT JOIN enterprise_workflow.form_templates t ON t.enterprise_id=$1 AND t.team_id=$2 AND t.id=chosen.id
   LEFT JOIN enterprise_workflow.form_revisions r ON r.enterprise_id=t.enterprise_id AND r.team_id=t.team_id AND r.id=t.id AND r.revision=chosen.revision`,
   [a.enterpriseId,a.teamId,selections.map(s=>s.templateId),selections.map(s=>s.revision)])).rows;
  for(const r of rows){need(r.id,'FORM_NOT_FOUND',404);need(r.enabled,'FORM_DISABLED');need(r.revision,'FORM_REVISION_NOT_FOUND',404);}
 }
 async validateSubmission(tx:PoolClient,a:Actor,order:WorkOrder){if(!order.form)return;await this.available(tx);need(order.form.teamId===(order.requestTeamId??order.teamId)&&a.teamId===order.form.teamId,'FORM_SCOPE_MISMATCH',403);await this.lock(tx,a);const b=await this.book(tx,a,order.form.templateId),r=await this.revision(tx,a,order.form.templateId,order.form.revision);need(b&&r,'FORM_REVISION_NOT_FOUND',404);need(b!.enabled,'FORM_DISABLED');need(sourceDigest(r!.definition)===sourceDigest(order.form.definition),'FORM_SNAPSHOT_MISMATCH');validateFormValues(r!.definition,order.form.values,true);const rules=r!.definition.attachmentRules;if(rules){need(this.assetsEnabled,'DEMAND_ASSETS_NOT_ENABLED',503);const files=order.demandAssets??[];need(files.length>=rules.minCount&&files.length<=rules.maxCount,'DEMAND_ATTACHMENT_COUNT',400);need(files.every(f=>f.bytes<=rules.maxFileBytes),'DEMAND_ATTACHMENT_SIZE',400);need(!rules.allowedExtensions.length||files.every(f=>{const ext=f.name.includes('.')?f.name.split('.').at(-1)!.toLowerCase():'';return rules.allowedExtensions.includes(ext); }),'DEMAND_ATTACHMENT_EXTENSION',400);}need(!r!.definition.catalogRequired||order.catalog,'FORM_CATALOG_REQUIRED',400);}
 async read(p:Principal,raw:unknown,signal?:AbortSignal){const q=formQuery.parse(raw);return readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a,snapshot)=>{
  need(a.teamId,'MEMBERSHIP_REQUIRED',403);await this.available(tx);if(!snapshot)await this.lock(tx,p);
  const manager=a.permissions.includes('manage');
  if(q.action==='list'){
   const manage=q.manage==='1';if(manage)need(manager,'FORM_MANAGER_REQUIRED',403);
   const args=[a.enterpriseId,a.teamId],from=' FROM enterprise_workflow.form_templates t',join=` LEFT JOIN enterprise_workflow.form_revisions r
    ON r.enterprise_id=t.enterprise_id AND r.team_id=t.team_id AND r.id=t.id AND r.revision=(t.document->>'publishedRevision')::int`;
   const where=" WHERE t.enterprise_id=$1 AND t.team_id=$2"+(manage?'':" AND t.document->>'enabled'='true' AND (t.document->>'publishedRevision')::int>0");
   const draft=manage?"COALESCE(t.document #>> '{draft,definition,title}','')":"''",published="COALESCE(r.document #>> '{definition,title}','')";
   const filter=q.query?` AND strpos(lower(${draft}||' '||${published}),lower($3))>0`:'';
   const countArgs=q.query?[...args,q.query]:args,offset=(q.page-1)*30;
   const total=(await tx.query('SELECT count(*)::int n'+from+(q.query?join:'')+where+filter,countArgs)).rows[0].n;
   const templates=offset>=total?[]:(await tx.query<{id:string;version:number;enabled:boolean;publishedRevision:number;title:string;hasDraft:boolean}>(`WITH page AS MATERIALIZED (
    SELECT t.id ${from}${q.query?join:''}${where}${filter} ORDER BY t.id LIMIT 30 OFFSET $${countArgs.length+1}
   ) SELECT t.id,t.version,(t.document->>'enabled')::boolean AS enabled,(t.document->>'publishedRevision')::int AS "publishedRevision",
     COALESCE(NULLIF(${draft},''),${published}) AS title,(t.document->>'draft' IS NOT NULL) AS "hasDraft"
    FROM page JOIN enterprise_workflow.form_templates t ON t.enterprise_id=$1 AND t.team_id=$2 AND t.id=page.id${join} ORDER BY t.id`,[...countArgs,offset])).rows
    .map(r=>({...r,hasDraft:manage?r.hasDraft:undefined}));
   return {templates,total,page:q.page,canManage:manager,canPublish:manager&&a.permissions.includes('review')};
  }
  const b=await this.book(tx,a,q.id);need(b,'FORM_NOT_FOUND',404);
  if(q.action==='version'){need(manager||b!.enabled,'FORM_DISABLED');const r=await this.revision(tx,a,q.id,q.revision);need(r,'FORM_REVISION_NOT_FOUND',404);return {templateId:q.id,revision:q.revision,enabled:b!.enabled,...r};}
  need(manager,'FORM_MANAGER_REQUIRED',403);if(q.action==='detail')return {book:b,published:b!.publishedRevision?await this.revision(tx,a,q.id,b!.publishedRevision):null};
  const args=[a.enterpriseId,a.teamId,q.id],offset=(q.page-1)*30,filter='enterprise_id=$1 AND team_id=$2 AND template_id=$3';
  const total=(await tx.query('SELECT count(*)::int n FROM enterprise_workflow.form_commands WHERE '+filter,args)).rows[0].n;
  const events=offset>=total?[]:(await tx.query(`WITH page AS MATERIALIZED (
    SELECT id,created_at FROM enterprise_workflow.form_commands WHERE ${filter} ORDER BY created_at DESC,id LIMIT 30 OFFSET $4
   ) SELECT c.actor,c.reason,c.result,c.created_at FROM page JOIN enterprise_workflow.form_commands c ON c.enterprise_id=$1 AND c.id=page.id ORDER BY page.created_at DESC,page.id`,[...args,offset])).rows;
  return {events,total,page:q.page};
 },{legacyRepeatable:false,statementTimeoutMs:15000,signal,checkCurrent:async(tx,a,result)=>{
  if(q.action==='version'&&!a.permissions.includes('manage')){
   const current=(await tx.query("SELECT document->>'enabled' enabled FROM enterprise_workflow.form_templates WHERE enterprise_id=$1 AND team_id=$2 AND id=$3",[a.enterpriseId,a.teamId,q.id])).rows[0];
   need(current,'FORM_NOT_FOUND',404);need(current.enabled==='true','FORM_DISABLED');
  }
  if(q.action==='list'&&q.manage!=='1'&&'templates' in result&&result.templates?.length){
   const ids=result.templates.map(t=>t.id);
   need((await tx.query("SELECT id FROM enterprise_workflow.form_templates WHERE enterprise_id=$1 AND team_id=$2 AND id=ANY($3::uuid[]) AND document->>'enabled'='true' AND (document->>'publishedRevision')::int>0",[a.enterpriseId,a.teamId,ids])).rowCount===ids.length,'READ_SCOPE_CHANGED');
  }
 }});}
 async execute(p:Principal,raw:unknown){const c=formCommand.parse(raw);return this.tx(p,async(tx,a)=>{need(a.permissions.includes('manage'),'FORM_MANAGER_REQUIRED',403);if(c.action.type==='publish')need(a.permissions.includes('review'),'FORM_PUBLISHER_REQUIRED',403);const fp=sourceDigest({p,c}),prior=(await tx.query('SELECT fingerprint,result FROM enterprise_workflow.form_commands WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,c.commandId])).rows[0];if(prior){need(prior.fingerprint===fp,'IDEMPOTENCY_CONFLICT');return {...prior.result,replayed:true};}
 let book=await this.book(tx,a,c.templateId);need((book?.version??0)===c.expectedVersion,'FORM_VERSION_CONFLICT');if(!book){need(c.action.type==='save-draft','FORM_NOT_FOUND',404);book={id:c.templateId,version:0,enabled:true,publishedRevision:0,draft:null};}book=structuredClone(book);
 let published:{definition:FormDefinition;author:string;publishedBy:string;at:string}|undefined;
 if(c.action.type==='save-draft'){if(c.action.definition.attachmentRules){need(this.assetsEnabled,'DEMAND_ASSETS_NOT_ENABLED',503);need((await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=22')).rowCount,'DEMAND_ASSETS_MIGRATION_REQUIRED',503);}const rows=(await tx.query("SELECT DISTINCT f->>'id' id,f->>'type' type FROM enterprise_workflow.form_revisions r CROSS JOIN LATERAL jsonb_array_elements(r.document->'definition'->'fields') f WHERE enterprise_id=$1 AND team_id=$2 AND r.id=$3",[a.enterpriseId,a.teamId,book.id])).rows;for(const f of c.action.definition.fields)need(!rows.some(x=>x.id===f.id&&x.type!==f.type),'FORM_FIELD_TYPE_IMMUTABLE');book.draft={definition:c.action.definition,author:a.subject};}
 else if(c.action.type==='publish'){need(book.enabled,'FORM_DISABLED');need(book.draft,'FORM_DRAFT_REQUIRED');if(book.draft!.definition.attachmentRules)need(this.assetsEnabled,'DEMAND_ASSETS_NOT_ENABLED',503);need(book.draft!.author!==a.subject,'FORM_SELF_PUBLISH_FORBIDDEN',403);published={...book.draft!,publishedBy:a.subject,at:new Date().toISOString()};book.publishedRevision++;book.draft=null;}
 else book.enabled=c.action.enabled;
 book.version++;const result={book,published:published??null,replayed:false};await tx.query('INSERT INTO enterprise_workflow.form_commands(enterprise_id,id,team_id,template_id,actor,reason,fingerprint,result)VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[a.enterpriseId,c.commandId,a.teamId,book.id,a.subject,c.reason,fp,result]);await tx.query('INSERT INTO enterprise_workflow.form_templates(enterprise_id,team_id,id,version,document)VALUES($1,$2,$3,$4,$5) ON CONFLICT(enterprise_id,team_id,id)DO UPDATE SET version=EXCLUDED.version,document=EXCLUDED.document',[a.enterpriseId,a.teamId,book.id,book.version,book]);if(published)await tx.query('INSERT INTO enterprise_workflow.form_revisions(enterprise_id,team_id,id,revision,document,command_id)VALUES($1,$2,$3,$4,$5,$6)',[a.enterpriseId,a.teamId,book.id,book.publishedRevision,published,c.commandId]);return result;
 });}
}
