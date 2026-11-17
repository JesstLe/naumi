import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {WorkflowError,type Principal,type Actor,type WorkOrder,type WorkflowEvent} from './contracts';
import {canRead} from './domain';
import {readScope} from './read-scope';
import {readWithCurrentScope} from './read-transaction';
import type {ResolveActor} from './store';
import {notificationCommand,notificationQuery,notificationTitles,type NotificationConnector,type DeliveryOutcome} from './notification-contracts';
import {notificationRecipients} from './notification-recipients';
function need(v:unknown,code:string,status=409):asserts v{if(!v)throw new WorkflowError(status,code);}
const values=(a:Actor)=>[a.enterpriseId,a.teamId??null,a.permissions.some(p=>['manage','dispatch','review'].includes(p)),a.subject,a.permissions.includes('execute'),a.workKinds,a.permissions.some(p=>['manage','dispatch'].includes(p))];
const visible=`n.enterprise_id=$1 AND n.team_id=$2 AND ${readScope('o.document','$7')}`;
const allowedError=(s:string)=>/^[A-Z0-9_]{1,80}$/.test(s)?s:'ADAPTER_ERROR';
export class NotificationStore{
 reminderGuard?: (tx:PoolClient,notification:any)=>Promise<boolean>;
 async publishReminder(tx:PoolClient,a:Actor,o:WorkOrder,reminder:{id:string;kind:string;taskId:string|null;title:string},at:Date){const nid=randomUUID(),insert=await tx.query("INSERT INTO enterprise_workflow.notifications(id,enterprise_id,team_id,subject,event_id,order_id,task_id,action,actor,title,aggregate_version,created_at,reminder)VALUES($1,$2,$3,$4,$5,$6,$7,$8,'sla-worker',$9,$10,$11,$12) ON CONFLICT(enterprise_id,event_id,team_id,subject)DO NOTHING RETURNING id",[nid,a.enterpriseId,a.teamId,a.subject,reminder.id,o.id,reminder.taskId,'sla-'+reminder.kind,reminder.title,o.version,at,reminder]);if(!insert.rowCount)return;await this.queue(tx,a,nid);}
 private async queue(tx:PoolClient,a:Actor,nid:string){const policy=(await tx.query('SELECT * FROM enterprise_workflow.notification_policies WHERE enterprise_id=$1 AND team_id=$2 FOR SHARE',[a.enterpriseId,a.teamId])).rows[0];if(!policy?.enabled)return;
  const binding=(await tx.query('SELECT * FROM enterprise_workflow.notification_bindings WHERE enterprise_id=$1 AND team_id=$2 AND subject=$3 FOR SHARE',[a.enterpriseId,a.teamId,a.subject])).rows[0],configured=this.connectors(a.enterpriseId).find(c=>c.id===policy.connector_id),code=!configured?'CHANNEL_NOT_CONFIGURED':!binding?.enabled?'RECIPIENT_NOT_BOUND':null;
  await tx.query('INSERT INTO enterprise_workflow.notification_deliveries(id,notification_id,enterprise_id,team_id,subject,connector_id,userid,policy_version,binding_version,state,error_code,connector_revision)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[randomUUID(),nid,a.enterpriseId,a.teamId,a.subject,policy.connector_id,binding?.enabled?binding.userid:null,policy.version,binding?.enabled?binding.version:null,code?'blocked':'pending',code,configured?.revision??null]);
 }
 constructor(readonly pool:Pool,private resolveActor:ResolveActor,private connectors:(enterpriseId:string)=>readonly NotificationConnector[]=()=>[]){}
 async ready(){need((await this.pool.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=11')).rowCount===1,'NOTIFICATION_MIGRATION_REQUIRED',503);}
 private async tx<T>(p:Principal|undefined,fn:(tx:PoolClient,a?:Actor)=>Promise<T>){const tx=await this.pool.connect();try{await tx.query('BEGIN');await tx.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='10s'");const a=p?await this.resolveActor(tx,p):undefined;if(p)need(a&&a.enterpriseId===p.enterpriseId&&a.subject===p.subject&&a.teamId===p.teamId&&a.teamId,'MEMBERSHIP_REQUIRED',403);const r=await fn(tx,a??undefined);await tx.query('COMMIT');return r;}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}}
 private async audit(tx:PoolClient,enterpriseId:string,teamId:string,subject:string,operation:string,detail:unknown){await tx.query('INSERT INTO enterprise_workflow.notification_audit(enterprise_id,team_id,subject,operation,detail)VALUES($1,$2,$3,$4,$5)',[enterpriseId,teamId,subject,operation,detail]);}
 // Called inside the normal business transaction, after order/event persistence. Never invokes a provider.
 async publish(tx:PoolClient,order:WorkOrder,event:WorkflowEvent){
  const action=event.data.action as {type:string;taskId?:string}|undefined;if(!order.teamId||!action||!notificationTitles[action.type])return;
  const rows=(await tx.query(`SELECT m.team_id,m.subject,m.permissions,m.work_kinds FROM enterprise_workflow.team_members m JOIN enterprise_workflow.accounts a USING(enterprise_id,subject) JOIN enterprise_workflow.teams t USING(enterprise_id,team_id) WHERE m.enterprise_id=$1 AND m.team_id=ANY($2::uuid[]) AND m.enabled AND a.enabled AND t.enabled AND (m.expires_at IS NULL OR m.expires_at>now()) AND (a.expires_at IS NULL OR a.expires_at>now()) ORDER BY m.team_id,m.subject FOR SHARE OF m,a,t`,[order.enterpriseId,[...new Set([order.teamId,order.requestTeamId??order.teamId])]])).rows;
  const recipients=notificationRecipients(order,event,rows.map(r=>({enterpriseId:order.enterpriseId,teamId:r.team_id,subject:r.subject,permissions:r.permissions,workKinds:r.work_kinds})));
  for(const a of recipients){
   const nid=randomUUID(),insert=await tx.query('INSERT INTO enterprise_workflow.notifications(id,enterprise_id,team_id,subject,event_id,order_id,task_id,action,actor,title,aggregate_version,created_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(enterprise_id,event_id,team_id,subject)DO NOTHING RETURNING id',[nid,a.enterpriseId,a.teamId,a.subject,event.id,order.id,action.taskId??null,action.type,event.actor,notificationTitles[action.type],order.version,event.occurredAt]);
   if(!insert.rowCount)continue;
   await this.queue(tx,a,nid);
  }
 }
 async read(p:Principal,raw:unknown,signal?:AbortSignal){const q=notificationQuery.parse(raw);return readWithCurrentScope(this.pool,this.resolveActor,p,async(tx,a)=>{need(a.teamId,'MEMBERSHIP_REQUIRED',403);need((await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=11')).rowCount===1,'NOTIFICATION_MIGRATION_REQUIRED',503);const v=values(a);
  if(q.action==='badge'){
   const {rows}=await tx.query(`SELECT count(*) AS unread
    FROM enterprise_workflow.notifications n JOIN enterprise_workflow.orders o ON o.enterprise_id=n.enterprise_id AND o.id=n.order_id
    WHERE ${visible} AND n.subject=$4 AND n.read_at IS NULL`,v);
   return {unread:Number(rows[0].unread)};
  }
  if(q.action==='inbox'){
   const from=`FROM enterprise_workflow.notifications n JOIN enterprise_workflow.orders o ON o.enterprise_id=n.enterprise_id AND o.id=n.order_id`;
   const where=`${visible} AND n.subject=$4${q.unread?' AND n.read_at IS NULL':''}`;
   const unreadColumn=q.unread?'':',count(*) FILTER(WHERE n.read_at IS NULL) AS unread';
   const count=(await tx.query(`SELECT count(*) AS total${unreadColumn} ${from} WHERE ${where}`,v)).rows[0];
   const total=Number(count.total),unread=q.unread?total:Number(count.unread),offset=(q.page-1)*30;
   const rows=offset>=total?[]:(await tx.query(`WITH page AS MATERIALIZED (
    SELECT n.id,n.created_at ${from} WHERE ${where} ORDER BY n.created_at DESC,n.id LIMIT 30 OFFSET $8
   )
   SELECT n.id,n.order_id AS "orderId",n.task_id AS "taskId",n.title,n.action,n.actor,n.aggregate_version AS "orderVersion",
    n.created_at AS "createdAt",n.read_at AS "readAt",o.document->>'title' AS "orderTitle"
   FROM page JOIN enterprise_workflow.notifications n ON n.id=page.id
   JOIN enterprise_workflow.orders o ON o.enterprise_id=n.enterprise_id AND o.id=n.order_id
   ORDER BY page.created_at DESC,page.id`,[...v,offset])).rows;
   return {notifications:rows,total,unread,page:q.page,pageSize:30};
  }
  need(a.permissions.includes('manage'),'NOTIFICATION_ADMIN_REQUIRED',403);
  if(q.action==='settings'){
   const members=(await tx.query(`SELECT subject,permissions,enabled FROM enterprise_workflow.team_members WHERE enterprise_id=$1 AND team_id=$2 ORDER BY subject LIMIT 501`,[a.enterpriseId,a.teamId])).rows;need(members.length<=500,'NOTIFICATION_DIRECTORY_TOO_LARGE',422);
   return {policy:(await tx.query('SELECT version,enabled,connector_id AS "connectorId" FROM enterprise_workflow.notification_policies WHERE enterprise_id=$1 AND team_id=$2',[a.enterpriseId,a.teamId])).rows[0]??{version:0,enabled:false,connectorId:''},connectors:this.connectors(a.enterpriseId).map(({id,label})=>({id,label})),members,bindings:(await tx.query('SELECT subject,version,enabled,userid FROM enterprise_workflow.notification_bindings WHERE enterprise_id=$1 AND team_id=$2 ORDER BY subject',[a.enterpriseId,a.teamId])).rows};
  }
  if(q.action==='audit'){const events=(await tx.query('SELECT seq,subject,operation,detail,created_at FROM enterprise_workflow.notification_audit WHERE enterprise_id=$1 AND team_id=$2 AND seq<$3 ORDER BY seq DESC LIMIT 50',[a.enterpriseId,a.teamId,q.before])).rows;return {events,nextBefore:events.length===50?Number(events.at(-1).seq):null};}
  // Determine visibility once, and sort only the keys. The nullable result row
  // carries the exact total for empty pages without reading delivery payloads.
  const {rows}=await tx.query(`WITH eligible AS MATERIALIZED (
   SELECT d.id,d.created_at FROM enterprise_workflow.notification_deliveries d
   JOIN enterprise_workflow.notifications n ON n.id=d.notification_id
   JOIN enterprise_workflow.orders o ON o.enterprise_id=n.enterprise_id AND o.id=n.order_id
   WHERE ${visible} AND ($8='' OR d.state=$8)
  ), totals AS (SELECT count(*) AS total FROM eligible)
  SELECT totals.total,detail.* FROM totals LEFT JOIN LATERAL (
   SELECT page.id,payload.subject,payload.version,payload.connector_id AS "connectorId",payload.state,payload.attempts,payload.polls,
    payload.receipt,payload.receipt_source AS "receiptSource",payload.provider_read AS "providerRead",payload.error_code AS "errorCode",
    page.created_at AS "createdAt",payload.updated_at AS "updatedAt",notice.title,notice.order_id AS "orderId",doc.document->>'title' AS "orderTitle"
   FROM (
    SELECT id,created_at FROM eligible ORDER BY created_at DESC,id
    LIMIT (CASE WHEN totals.total>$9 THEN 30 ELSE 0 END) OFFSET $9
   ) page JOIN enterprise_workflow.notification_deliveries payload ON payload.id=page.id
   JOIN enterprise_workflow.notifications notice ON notice.id=payload.notification_id
   JOIN enterprise_workflow.orders doc ON doc.enterprise_id=notice.enterprise_id AND doc.id=notice.order_id
  ) detail ON true
  ORDER BY detail."createdAt" DESC,detail.id`,[...v,q.state,(q.page-1)*30]);
  const deliveries=rows.flatMap(({total,...row})=>row.id===null?[]:[row]);
  return {deliveries,total:Number(rows[0].total),page:q.page,pageSize:30};
 },result=>(result.notifications??result.deliveries??[]).map(row=>row.orderId as string),{legacyRepeatable:false,signal});}
 async execute(p:Principal,raw:unknown){const c=notificationCommand.parse(raw);return this.tx(p,async(tx,actor)=>{const a=actor!,act=c.action;need(act.type==='read'||a.permissions.includes('manage'),'NOTIFICATION_ADMIN_REQUIRED',403);
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`notification-command:${a.enterpriseId}:${c.commandId}`]);
  const fingerprint=createHash('sha256').update(JSON.stringify({p,c})).digest('hex'),prior=(await tx.query('SELECT fingerprint,result FROM enterprise_workflow.notification_commands WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,c.commandId])).rows[0];if(prior){need(prior.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT');return {...prior.result,replayed:true};}
  let result:Record<string,unknown>={};
  if(act.type==='read'){
   const row=(await tx.query(`SELECT n.id FROM enterprise_workflow.notifications n JOIN enterprise_workflow.orders o ON o.enterprise_id=n.enterprise_id AND o.id=n.order_id WHERE ${visible} AND n.subject=$4 AND n.id=$8 FOR UPDATE OF n`,[...values(a),act.id])).rows[0];need(row,'NOT_FOUND',404);await tx.query('UPDATE enterprise_workflow.notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1',[act.id]);result={read:true};
  }else if(act.type==='policy'||act.type==='binding'){
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`notification-settings:${a.enterpriseId}:${a.teamId}`]);
   if(act.type==='policy'){
    if(act.enabled)need(this.connectors(a.enterpriseId).some(x=>x.id===act.connectorId),'CHANNEL_NOT_CONFIGURED',503);
    const old=(await tx.query('SELECT version FROM enterprise_workflow.notification_policies WHERE enterprise_id=$1 AND team_id=$2',[a.enterpriseId,a.teamId])).rows[0];need((old?.version??0)===c.expectedVersion,'VERSION_CONFLICT');
    await tx.query('INSERT INTO enterprise_workflow.notification_policies(enterprise_id,team_id,version,enabled,connector_id)VALUES($1,$2,$3,$4,$5) ON CONFLICT(enterprise_id,team_id)DO UPDATE SET version=EXCLUDED.version,enabled=EXCLUDED.enabled,connector_id=EXCLUDED.connector_id',[a.enterpriseId,a.teamId,c.expectedVersion+1,act.enabled,act.connectorId]);result={version:c.expectedVersion+1};
   }else{
    need((await tx.query('SELECT 1 FROM enterprise_workflow.team_members WHERE enterprise_id=$1 AND team_id=$2 AND subject=$3 FOR SHARE',[a.enterpriseId,a.teamId,act.subject])).rowCount===1,'MEMBER_NOT_FOUND',404);
    const old=(await tx.query('SELECT version FROM enterprise_workflow.notification_bindings WHERE enterprise_id=$1 AND team_id=$2 AND subject=$3',[a.enterpriseId,a.teamId,act.subject])).rows[0];need((old?.version??0)===c.expectedVersion,'VERSION_CONFLICT');
    await tx.query('INSERT INTO enterprise_workflow.notification_bindings(enterprise_id,team_id,subject,version,enabled,userid)VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(enterprise_id,team_id,subject)DO UPDATE SET version=EXCLUDED.version,enabled=EXCLUDED.enabled,userid=EXCLUDED.userid',[a.enterpriseId,a.teamId,act.subject,c.expectedVersion+1,act.enabled,act.userid]);result={version:c.expectedVersion+1};
   }
  }else{
   const d=(await tx.query(`SELECT d.* FROM enterprise_workflow.notification_deliveries d JOIN enterprise_workflow.notifications n ON n.id=d.notification_id JOIN enterprise_workflow.orders o ON o.enterprise_id=n.enterprise_id AND o.id=n.order_id WHERE ${visible} AND d.id=$8 FOR UPDATE OF d`,[...values(a),act.id])).rows[0];need(d,'NOT_FOUND',404);need(d.version===c.expectedVersion,'VERSION_CONFLICT');
   if(act.type==='receipt'){need(d.state==='unknown'&&d.userid&&!d.receipt,'RECEIPT_NOT_APPLICABLE');await tx.query("UPDATE enterprise_workflow.notification_deliveries SET receipt=$2,receipt_source='manual',state='accepted',accepted_at=now(),next_at=now(),error_code=NULL,version=version+1,updated_at=now() WHERE id=$1",[d.id,act.receipt]);}
   else{
    need(['blocked','dead'].includes(d.state),'RETRY_NOT_ALLOWED');need(!d.receipt||d.state==='blocked','ACCEPTED_MESSAGE_NOT_RESENDABLE');
    if(d.receipt){need(this.connectors(a.enterpriseId).some(x=>x.id===d.connector_id&&x.revision===d.connector_revision),'CHANNEL_NOT_CONFIGURED',503);await tx.query("UPDATE enterprise_workflow.notification_deliveries SET state='accepted',next_at=now(),error_code=NULL,version=version+1,updated_at=now() WHERE id=$1",[d.id]);}
    else{
     const policy=(await tx.query('SELECT * FROM enterprise_workflow.notification_policies WHERE enterprise_id=$1 AND team_id=$2 FOR SHARE',[a.enterpriseId,a.teamId])).rows[0],binding=(await tx.query('SELECT * FROM enterprise_workflow.notification_bindings WHERE enterprise_id=$1 AND team_id=$2 AND subject=$3 FOR SHARE',[a.enterpriseId,a.teamId,d.subject])).rows[0];
     need(policy?.enabled&&this.connectors(a.enterpriseId).some(x=>x.id===policy.connector_id),'CHANNEL_NOT_CONFIGURED',503);need(binding?.enabled,'RECIPIENT_NOT_BOUND');
     await tx.query("UPDATE enterprise_workflow.notification_deliveries SET state='pending',connector_id=$2,userid=$3,policy_version=$4,binding_version=$5,connector_revision=$6,attempts=0,next_at=now(),error_code=NULL,version=version+1,updated_at=now() WHERE id=$1",[d.id,policy.connector_id,binding.userid,policy.version,binding.version,this.connectors(a.enterpriseId).find(x=>x.id===policy.connector_id)!.revision]);
    }
   }
   result={version:d.version+1};
  }
  await this.audit(tx,a.enterpriseId,a.teamId!,a.subject,act.type,{...act,...(act.type==='binding'?{userid:'[explicit binding]'}:{}),reason:c.reason,expectedVersion:c.expectedVersion});
  await tx.query('INSERT INTO enterprise_workflow.notification_commands(enterprise_id,id,subject,fingerprint,result)VALUES($1,$2,$3,$4,$5)',[a.enterpriseId,c.commandId,a.subject,fingerprint,result]);return {...result,replayed:false};
 });}
 // Bounded recovery. A lost SEND lease is uncertain; it must never cause an automatic resend.
 async recover(){return this.tx(undefined,async tx=>{const expired=(await tx.query("SELECT * FROM enterprise_workflow.notification_deliveries WHERE lease_until<now() ORDER BY lease_until LIMIT 50 FOR UPDATE SKIP LOCKED")).rows;for(const d of expired){await tx.query("UPDATE enterprise_workflow.notification_deliveries SET state=$2,lease_id=NULL,lease_until=NULL,error_code=$3,next_at=now(),version=version+1,updated_at=now() WHERE id=$1",[d.id,d.state==='polling'?'accepted':'unknown',d.state==='polling'?'POLL_LEASE_EXPIRED':'SEND_LEASE_EXPIRED']);await this.audit(tx,d.enterprise_id,d.team_id,'notification-worker','lease-expired',{id:d.id,from:d.state});}return expired.length;});}
 private async claim(){return this.tx(undefined,async tx=>{
  const d=(await tx.query("SELECT * FROM enterprise_workflow.notification_deliveries WHERE state IN ('pending','retry','accepted') AND next_at<=now() ORDER BY next_at,id LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];if(!d)return null;
  const n=(await tx.query('SELECT * FROM enterprise_workflow.notifications WHERE id=$1',[d.notification_id])).rows[0],connector=this.connectors(d.enterprise_id).find(c=>c.id===d.connector_id);
  let error:string|null=null,state='blocked';
  if(!connector)error='CHANNEL_NOT_CONFIGURED';else if(connector.revision!==d.connector_revision)error='CHANNEL_CONFIG_CHANGED';
  if(!d.receipt){
   const a=await this.resolveActor(tx,{enterpriseId:d.enterprise_id,teamId:d.team_id,subject:d.subject}),o=(await tx.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2 FOR SHARE',[d.enterprise_id,n.order_id])).rows[0]?.document as WorkOrder|undefined;
   const binding=(await tx.query('SELECT * FROM enterprise_workflow.notification_bindings WHERE enterprise_id=$1 AND team_id=$2 AND subject=$3 FOR SHARE',[d.enterprise_id,d.team_id,d.subject])).rows[0],policy=(await tx.query('SELECT * FROM enterprise_workflow.notification_policies WHERE enterprise_id=$1 AND team_id=$2 FOR SHARE',[d.enterprise_id,d.team_id])).rows[0];
   if(!a||!o||!canRead(a,o)){error='RECIPIENT_ACCESS_REVOKED';state='cancelled';}
   else if(!policy?.enabled){error='CHANNEL_DISABLED';state='cancelled';}
   else if(policy.version!==d.policy_version||policy.connector_id!==d.connector_id)error='CHANNEL_CONFIG_CHANGED';
   else if(!binding?.enabled)error='RECIPIENT_NOT_BOUND';else if(binding.version!==d.binding_version||binding.userid!==d.userid)error='RECIPIENT_BINDING_CHANGED';
   const identities=(await tx.query('SELECT i.enabled,e.enabled AS enterprise_enabled FROM enterprise_workflow.source_identities i JOIN enterprise_workflow.source_enterprises e USING(source_instance,source_enterprise,enterprise_id) WHERE i.enterprise_id=$1 AND i.subject=$2 FOR SHARE OF i,e',[d.enterprise_id,d.subject])).rows;
   if(!error&&!identities.some(i=>i.enabled&&i.enterprise_enabled))error='SOURCE_IDENTITY_REQUIRED';
   if(n.reminder&&(!this.reminderGuard||!await this.reminderGuard(tx,n))){error='SLA_REMINDER_OBSOLETE';state='cancelled';}
  }else if(new Date(d.accepted_at).getTime()<Date.now()-23*3600000){error='RECEIPT_WINDOW_EXPIRED';state='unknown';}
  if(error){await tx.query('UPDATE enterprise_workflow.notification_deliveries SET state=$2,error_code=$3,version=version+1,updated_at=now() WHERE id=$1',[d.id,state,error]);await this.audit(tx,d.enterprise_id,d.team_id,'notification-worker',state,{id:d.id,code:error});return {skipped:true} as const;}
  const lease=randomUUID(),phase=d.receipt?'polling':'sending';await tx.query("UPDATE enterprise_workflow.notification_deliveries SET state=$2,lease_id=$3,lease_until=now()+interval '60 seconds',attempts=attempts+$4,polls=polls+$5,version=version+1,updated_at=now() WHERE id=$1",[d.id,phase,lease,d.receipt?0:1,d.receipt?1:0]);
  await this.audit(tx,d.enterprise_id,d.team_id,'notification-worker',phase,{id:d.id});return {skipped:false,d:{...d,phase,lease,attempts:d.attempts+(d.receipt?0:1)},n,connector:connector!} as const;
 });}
 async tick(){await this.recover();const job=await this.claim();if(!job)return {processed:false};if(job.skipped)return {processed:true,skipped:true};const {d,n,connector}=job;
  let outcome:DeliveryOutcome;try{outcome=d.receipt?await connector.adapter.poll({receipt:d.receipt,userid:d.userid}):await connector.adapter.send({id:d.id,userid:d.userid,title:n.title});}catch{outcome=d.receipt?{state:'pending'}:{state:'unknown',code:'ADAPTER_RESULT_UNKNOWN'};}
  return this.tx(undefined,async tx=>{
   const current=(await tx.query('SELECT * FROM enterprise_workflow.notification_deliveries WHERE id=$1 AND lease_id=$2 AND lease_until>now() FOR UPDATE',[d.id,d.lease])).rows[0];if(!current)return {processed:true,stale:true};
   let state:string=outcome.state,error:string|null=null,delay=0,receipt=d.receipt,read=false;
   if(d.receipt){if(outcome.state==='delivered'){state='delivered';read=outcome.read;}else if(outcome.state==='dead'){state='dead';error=allowedError(outcome.code);}else{state='accepted';delay=60;error='RECEIPT_PENDING';}}
   else if(outcome.state==='accepted'&&/^[1-9][0-9]{0,14}$/.test(outcome.receipt)){receipt=outcome.receipt;state='accepted';delay=5;}
   else if(outcome.state==='retry'){state=d.attempts>=5?'dead':'retry';error=allowedError(outcome.code);delay=Math.min(600,5*6**(d.attempts-1));}
   else if(outcome.state==='dead'||outcome.state==='unknown'){state=outcome.state;error=allowedError(outcome.code);}
   else{state='unknown';error='ADAPTER_RESPONSE_INVALID';}
   await tx.query("UPDATE enterprise_workflow.notification_deliveries SET state=$2,error_code=$3,receipt=$4,receipt_source=CASE WHEN receipt_source IS NULL AND $4::text IS NOT NULL THEN 'provider' ELSE receipt_source END,accepted_at=CASE WHEN accepted_at IS NULL AND $4::text IS NOT NULL THEN now() ELSE accepted_at END,delivered_at=CASE WHEN $2='delivered' THEN now() ELSE delivered_at END,provider_read=$5,next_at=now()+$6::int*interval '1 second',lease_id=NULL,lease_until=NULL,version=version+1,updated_at=now() WHERE id=$1",[d.id,state,error,receipt,read,delay]);await this.audit(tx,d.enterprise_id,d.team_id,'notification-worker',state,{id:d.id,code:error,receipt});return {processed:true,state};
  });
 }
}
