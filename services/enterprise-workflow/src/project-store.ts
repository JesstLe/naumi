import type {Pool,PoolClient} from 'pg';
import type {Actor,Principal,WorkOrder,Command} from './contracts';
import type {ResolveActor} from './store';
import {readWorkflowSnapshot} from './read-transaction';
import {canRead,evolve} from './domain';
import {ensure,digest} from './performance-domain';
import {projectInput,projectApply,projectQuery,type ProjectInput,type Project,type ProjectNumbers,type ProjectSummary,type Milestone} from './project-contracts';
const manager=(a:Actor)=>a.permissions.includes('manage');
const request=(a:Actor)=>a.permissions.some(p=>['manage','dispatch','request'].includes(p));
const empty=():ProjectNumbers=>({orders:0,unavailable:0,committedPoints:0,acceptedPoints:0,blockedTasks:0,unplannedTasks:0,unfinishedOrders:0,ratio:null,ready:false});
type OrderMetrics=Pick<WorkOrder,'id'|'requestTeamId'|'teamId'|'version'|'status'>&{tasks:Pick<WorkOrder['tasks'][number],'id'|'status'|'points'|'dueAt'|'planStart'|'planEnd'|'dependencyIds'>[]};
type ProjectInputs={teamIds:string[];orderIds:string[];enabled:Set<string>;orders:Map<string,OrderMetrics>};
type ProjectInputEvidence={teamIds:Set<string>;orderIds:Set<string>;enabled:Set<string>;versions:Map<string,number>};
const emptyEvidence=():ProjectInputEvidence=>({teamIds:new Set(),orderIds:new Set(),enabled:new Set(),versions:new Map()});
function observe(evidence:ProjectInputEvidence,inputs:ProjectInputs){
 for(const id of inputs.teamIds)evidence.teamIds.add(id);for(const id of inputs.orderIds)evidence.orderIds.add(id);
 for(const id of inputs.enabled)evidence.enabled.add(id);for(const [id,order] of inputs.orders)evidence.versions.set(id,order.version);
 return evidence;
}
export function validateMilestones(ms:Milestone[]){const ids=new Set(ms.map(m=>m.id));ensure(ids.size===ms.length,'PROJECT_MILESTONE_DUPLICATE',400);const done=new Set<string>(),active=new Set<string>();function visit(id:string){if(done.has(id))return;ensure(!active.has(id),'PROJECT_DEPENDENCY_CYCLE',400);active.add(id);const m=ms.find(m=>m.id===id)!;ensure(new Set(m.dependsOn).size===m.dependsOn.length&&m.dependsOn.every(x=>ids.has(x)&&x!==id),'PROJECT_DEPENDENCY_INVALID',400);for(const x of m.dependsOn)visit(x);active.delete(id);done.add(id);}for(const id of ids)visit(id);}
export class ProjectStore{
 constructor(private pool:Pool,private resolveActor:ResolveActor,readonly enabled=true,private now=()=>new Date()){}
 private async ready(tx:PoolClient,a:Actor){ensure(a.teamId,'MEMBERSHIP_REQUIRED',403);ensure(this.enabled,'PROJECTS_NOT_ENABLED',503);ensure((await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=28')).rowCount,'PROJECTS_MIGRATION_REQUIRED',503);}
 private async tx<T>(p:Principal,fn:(tx:PoolClient,a:Actor)=>Promise<T>){const tx=await this.pool.connect();try{await tx.query('BEGIN');await tx.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s'");const a=await this.resolveActor(tx,p);ensure(a&&a.enterpriseId===p.enterpriseId&&a.subject===p.subject&&a.teamId===p.teamId,'MEMBERSHIP_REQUIRED',403);await this.ready(tx,a);const r=await fn(tx,a);await tx.query('COMMIT');return r;}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}}
 private async row(tx:PoolClient,a:Actor,id:string){return(await tx.query('SELECT document FROM enterprise_workflow.projects WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,id])).rows[0]?.document as Project|undefined;}
 private visible(a:Actor,p:Project){return p.enterpriseId===a.enterpriseId&&(p.teamId===a.teamId||p.grants.some(g=>g.teamId===a.teamId&&g.state==='approved'));}
 private owner(a:Actor,p:Project){return p.teamId===a.teamId&&manager(a);}
 private authorize(a:Actor,p:Project|undefined,c:ProjectInput){if(c.action.type==='create'){ensure(manager(a),'PROJECT_MANAGER_REQUIRED',403);if(p)ensure(this.owner(a,p),'PROJECT_NOT_FOUND',404);return;}ensure(p,'PROJECT_NOT_FOUND',404);if(c.action.type==='consent'){ensure(manager(a)&&p.teamId!==a.teamId&&p.grants.some(g=>g.teamId===a.teamId),'PROJECT_INVITATION_NOT_FOUND',404);return;}ensure(this.visible(a,p),'PROJECT_NOT_FOUND',404);if(['link','unlink','create-demand'].includes(c.action.type))ensure(request(a),'PROJECT_LINK_FORBIDDEN',403);else if(c.action.type==='revoke')ensure(manager(a)&&(p.teamId===a.teamId||c.action.teamId===a.teamId),'PROJECT_MANAGER_REQUIRED',403);else ensure(this.owner(a,p),'PROJECT_OWNER_REQUIRED',403);}
 private async enabledTeams(tx:PoolClient,a:Actor,ids:string[],lock:boolean){return new Set<string>((await tx.query(`SELECT team_id FROM enterprise_workflow.teams WHERE enterprise_id=$1 AND team_id=ANY($2::uuid[]) AND enabled${lock?' FOR SHARE':''}`,[a.enterpriseId,ids])).rows.map(r=>r.team_id));}
 private async inputs(tx:PoolClient,a:Actor,projects:Project[],lock:boolean,summaryOnly=false):Promise<ProjectInputs>{
  const teamIds=[...new Set(projects.flatMap(p=>[p.teamId,...p.grants.map(g=>g.teamId),...p.links.map(l=>l.teamId)]))],orderIds=[...new Set(projects.flatMap(p=>p.links.map(l=>l.orderId)))];
  const enabled=teamIds.length?await this.enabledTeams(tx,a,teamIds,lock):new Set<string>();
  // Preserve omitted task keys and task order, which are inputs to the existing data hash.
  const doc=summaryOnly?`jsonb_build_object('id',id,'teamId',document->'teamId','requestTeamId',document->'requestTeamId','version',version,'status',document->'status','tasks',
   COALESCE((SELECT jsonb_agg((SELECT jsonb_object_agg(key,value) FROM jsonb_each(task) WHERE key IN ('id','status','points','dueAt','planStart','planEnd','dependencyIds')) ORDER BY pos)
    FROM jsonb_array_elements(document->'tasks') WITH ORDINALITY t(task,pos)),'[]'::jsonb)) AS document`:'document';
  const orders=new Map<string,OrderMetrics>(orderIds.length?(await tx.query<{document:OrderMetrics}>(`SELECT ${doc} FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=ANY($2::uuid[])`,[a.enterpriseId,orderIds])).rows.map(r=>[r.document.id,r.document]):[]);
  return {teamIds,orderIds,enabled,orders};
 }
 private async checkEvidence(tx:PoolClient,a:Actor,evidence:ProjectInputEvidence){
  if(evidence.teamIds.size){const current=await this.enabledTeams(tx,a,[...evidence.teamIds],false);ensure(current.size===evidence.enabled.size&&[...current].every(id=>evidence.enabled.has(id)),'PROJECT_SCOPE_CHANGED');}
  if(evidence.orderIds.size){const current=(await tx.query('SELECT id,version FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=ANY($2::uuid[])',[a.enterpriseId,[...evidence.orderIds]])).rows;ensure(current.length===evidence.versions.size&&current.every(r=>evidence.versions.get(r.id)===r.version),'PROJECT_SCOPE_CHANGED');}
 }
 private compute(a:Actor,p:Project,{enabled,orders}:ProjectInputs,virtual?:WorkOrder,includeDetails=true){
  const allowed=(team:string)=>enabled.has(team)&&(team===p.teamId||p.grants.some(g=>g.teamId===team&&g.state==='approved'));
  const order=(id:string)=>virtual?.id===id?virtual:orders.get(id);
  ensure([...new Set(p.links.map(l=>l.orderId))].reduce((n,id)=>n+(order(id)?.tasks.length??0),0)<=5000,'PROJECT_TASK_LIMIT',422);
  const good=(l:Project['links'][number])=>{const o=order(l.orderId);return allowed(l.teamId)&&o&&(o.requestTeamId??o.teamId)===l.teamId?o:null;};
  const count=(links:Project['links'])=>{const n=empty();n.orders=links.length;for(const l of links){const o=good(l);if(!o){n.unavailable++;n.unfinishedOrders++;continue;}if(o.status!=='completed'&&!(o.status==='archived'&&o.tasks.length&&o.tasks.every(t=>t.status==='accepted')))n.unfinishedOrders++;for(const t of o.tasks){const accepted=t.status==='accepted';if(['active','completed'].includes(o.status)||accepted)n.committedPoints+=t.points;if(accepted)n.acceptedPoints+=t.points;if(o.status==='active'&&!accepted){if(t.status==='blocked')n.blockedTasks++;if(!t.planStart||!t.planEnd)n.unplannedTasks++;}}}n.ratio=n.committedPoints?Math.round(n.acceptedPoints/n.committedPoints*10000)/100:null;n.ready=links.length>0&&n.unfinishedOrders===0&&n.unavailable===0;return n;};
  const stages=p.milestones.map(m=>({...count(p.links.filter(l=>l.milestoneId===m.id)),id:m.id,late:false,dependencyBlocked:false}));
  for(const m of p.milestones){const s=stages.find(s=>s.id===m.id)!;s.dependencyBlocked=m.dependsOn.some(id=>!stages.find(s=>s.id===id)?.ready);s.late=Date.parse(m.targetAt)<+this.now()&&!s.ready;}
  const total=count(p.links),unassigned=p.links.filter(l=>!l.milestoneId).length;
  const dataHash=digest({milestones:p.milestones,links:p.links.map(l=>({orderId:l.orderId,teamId:l.teamId,milestoneId:l.milestoneId,allowed:allowed(l.teamId),version:good(l)?.version??null,status:good(l)?.status??null,tasks:good(l)?.tasks.map(t=>({id:t.id,status:t.status,points:t.points,dueAt:t.dueAt,planStart:t.planStart,planEnd:t.planEnd,dependencyIds:t.dependencyIds}))??null}))});
  const summary:ProjectSummary={...total,unassigned,milestones:stages,ready:total.ready&&!unassigned&&p.milestones.every(m=>{const s=stages.find(s=>s.id===m.id)!;return (!m.critical||s.ready)&&!s.dependencyBlocked;}),dataHash};
  const links=includeDetails?p.links.flatMap(l=>{const o=good(l) as WorkOrder|null;if(!o||!canRead(a,o))return [];return [{...l,order:{id:o.id,title:o.title,status:o.status,version:o.version,requester:o.requester,brand:o.catalog?.brand.document.name??null,shop:o.catalog?.shop.document.name??null,tasks:o.tasks.map(t=>({id:t.id,title:t.title,status:t.status,points:t.points,dueAt:t.dueAt,planStart:t.planStart??null,planEnd:t.planEnd??null,dependencyIds:t.dependencyIds}))}}];}):[];
  return {summary,links,hiddenLinks:p.links.length-links.length};
 }
 private metadata(p:Project){const {links,archiveSnapshot,...meta}=p;return meta;}
 private projection(a:Actor,p:Project,d:ReturnType<ProjectStore['compute']>){ensure(this.visible(a,p),'PROJECT_NOT_FOUND',404);const archive=p.archiveSnapshot;return {project:{...this.metadata(p),grants:p.grants.filter(g=>this.owner(a,p)||g.teamId===a.teamId)},...d,archiveSnapshot:archive&&d.summary.unavailable===0?{...archive,dataHash:undefined}:null,archiveMasked:!!archive&&d.summary.unavailable>0,liveChanged:archive?archive.dataHash!==d.summary.dataHash:false,canManage:this.owner(a,p),canLink:request(a),canCreateDemand:a.permissions.includes('request'),canApprove:this.owner(a,p)&&a.permissions.includes('review')&&a.subject!==p.createdBy};}
 private async lock(tx:PoolClient,a:Actor,c:ProjectInput){await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`project:${a.enterpriseId}:${c.id}`]);const old=await this.row(tx,a,c.id);this.authorize(a,old,c);const ids=[...new Set([...(old?.links.map(l=>l.orderId)??[]),...('orderId'in c.action?[c.action.orderId]:[])])].sort();for(const id of ids)await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`order:${a.enterpriseId}:${id}`]);return old;}
 private async prepare(tx:PoolClient,a:Actor,c:ProjectInput,old:Project|undefined,at:string,lock=true,evidence?:ProjectInputEvidence){
  ensure((old?.version??0)===c.expectedVersion,'PROJECT_VERSION_CONFLICT');const action=c.action;let p:Project;let draft:ReturnType<typeof evolve>|undefined;
  if(action.type==='create'){
   ensure(!old,'PROJECT_EXISTS');if(lock)await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`project-code:${a.enterpriseId}:${action.code}`]);ensure(!(await tx.query('SELECT 1 FROM enterprise_workflow.projects WHERE enterprise_id=$1 AND code=$2',[a.enterpriseId,action.code])).rowCount,'PROJECT_CODE_EXISTS');
   p={id:c.id,enterpriseId:a.enterpriseId,teamId:a.teamId!,code:action.code,title:action.title,brief:action.brief,ownerSubject:a.subject,createdBy:a.subject,createdAt:at,updatedAt:at,version:1,status:'planning',milestones:[],links:[],grants:[]};
  }else{
   ensure(old,'PROJECT_NOT_FOUND',404);p={...structuredClone(old),version:old.version+1,updatedAt:at};ensure(p.status!=='archived'||action.type==='reopen'||action.type==='revoke','PROJECT_ARCHIVED');
   if(action.type==='edit'){const lookup=lock?this.resolveActor:this.resolveActor.readSnapshot!;const member=await lookup(tx,{enterpriseId:a.enterpriseId,teamId:p.teamId,subject:action.ownerSubject});ensure(member?.permissions.includes('manage'),'PROJECT_OWNER_UNAVAILABLE',403);p.title=action.title;p.brief=action.brief;p.ownerSubject=action.ownerSubject;}
   else if(action.type==='milestones'){validateMilestones(action.milestones);ensure(p.links.every(l=>!l.milestoneId||action.milestones.some(m=>m.id===l.milestoneId)),'PROJECT_MILESTONE_IN_USE');p.milestones=action.milestones;}
   else if(action.type==='invite'){ensure(action.teamId!==p.teamId,'PROJECT_OWNER_TEAM');ensure((await this.enabledTeams(tx,a,[action.teamId],lock)).has(action.teamId),'PROJECT_TEAM_UNAVAILABLE',404);const oldGrant=p.grants.find(g=>g.teamId===action.teamId);ensure(!oldGrant||oldGrant.state==='revoked','PROJECT_INVITATION_EXISTS');ensure(oldGrant||p.grants.length<50,'PROJECT_TEAM_LIMIT',422);p.grants=p.grants.filter(g=>g.teamId!==action.teamId);p.grants.push({teamId:action.teamId,state:'invited',invitedBy:a.subject,invitedAt:at});}
   else if(action.type==='consent'){const g=p.grants.find(g=>g.teamId===a.teamId)!;ensure(g.state==='invited','PROJECT_INVITATION_STATE');g.state=action.approve?'approved':'revoked';g.decidedBy=a.subject;g.decidedAt=at;}
   else if(action.type==='revoke'){const g=p.grants.find(g=>g.teamId===action.teamId);ensure(g&&g.state!=='revoked','PROJECT_INVITATION_NOT_FOUND',404);g.state='revoked';g.decidedBy=a.subject;g.decidedAt=at;}
   else if(action.type==='remove-unavailable'){const teamActive=(await this.enabledTeams(tx,a,[action.teamId],false)).has(action.teamId);if(evidence){evidence.teamIds.add(action.teamId);if(teamActive)evidence.enabled.add(action.teamId);}ensure(action.teamId!==p.teamId&&(!teamActive||!p.grants.some(g=>g.teamId===action.teamId&&g.state==='approved')),'PROJECT_TEAM_STILL_AUTHORIZED');ensure(p.links.some(l=>l.teamId===action.teamId),'PROJECT_NO_UNAVAILABLE_LINKS');p.links=p.links.filter(l=>l.teamId!==action.teamId);}
   else if(action.type==='link'||action.type==='create-demand'){
    ensure(!action.milestoneId||p.milestones.some(m=>m.id===action.milestoneId),'PROJECT_MILESTONE_NOT_FOUND',404);const existing=p.links.find(l=>l.orderId===action.orderId);ensure(existing||p.links.length<300,'PROJECT_ORDER_LIMIT',422);
    let order=(await tx.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,action.orderId])).rows[0]?.document as WorkOrder|undefined;
    if(action.type==='create-demand'){ensure(!order,'PROJECT_DEMAND_EXISTS');const command:Command={commandId:c.commandId,orderId:action.orderId,expectedVersion:0,action:{type:'create',title:action.title,brief:action.brief,acceptance:action.acceptance}};draft=evolve(null,a,command,at);order=draft.order;}
    ensure(order&&canRead(a,order)&&(order.requestTeamId??order.teamId)===a.teamId,'PROJECT_ORDER_UNAVAILABLE',404);ensure(!existing||existing.teamId===a.teamId,'PROJECT_LINK_FORBIDDEN',403);if(existing){ensure(existing.milestoneId!==action.milestoneId,'PROJECT_LINK_NO_CHANGE');existing.milestoneId=action.milestoneId;}else p.links.push({orderId:action.orderId,milestoneId:action.milestoneId,teamId:a.teamId!,linkedBy:a.subject,linkedAt:at});
   }else if(action.type==='unlink'){const link=p.links.find(l=>l.orderId===action.orderId);ensure(link&&link.teamId===a.teamId,'PROJECT_ORDER_UNAVAILABLE',404);p.links=p.links.filter(l=>l.orderId!==action.orderId);}
   else if(action.type==='transition'){const next={planning:'approved',approved:'active',active:'retrospective',retrospective:'archived'}[old.status as 'planning'|'approved'|'active'|'retrospective'];ensure(next===action.status,'PROJECT_STATE');if(action.status==='approved')ensure(a.permissions.includes('review')&&a.subject!==p.createdBy,'PROJECT_INDEPENDENT_APPROVAL_REQUIRED',403);p.status=action.status;}
   else if(action.type==='reopen'){ensure(old.status==='archived'&&a.permissions.includes('review'),'PROJECT_REOPEN_REQUIRED',403);p.status='active';p.archiveSnapshot=null;}
  }
  const inputs=await this.inputs(tx,a,[p],lock);if(evidence)observe(evidence,inputs);
  const d=this.compute(a,p,inputs,draft?.order),previewHash=digest({principal:a,command:c,oldVersion:old?.version??0,summary:d.summary.dataHash});
  if(action.type==='transition'&&['retrospective','archived'].includes(action.status)){ensure(d.summary.ready,'PROJECT_NOT_READY');if(action.status==='archived')p.archiveSnapshot=d.summary;}
  const consent=action.type==='consent';return {next:p,draft,previewHash,preview:{id:p.id,version:p.version,code:p.code,title:p.title,status:p.status,action:action.type,summary:consent?undefined:d.summary,visibleOrders:consent?undefined:d.links,hiddenLinks:consent?undefined:d.hiddenLinks,milestones:consent?undefined:p.milestones,milestoneChanges:action.type==='milestones'?p.milestones.filter(m=>digest(m)!==digest(old?.milestones.find(x=>x.id===m.id)??null)).map(m=>({id:m.id,title:m.title,before:old?.milestones.find(x=>x.id===m.id)?.targetAt??null,after:m.targetAt})):[],notice:'项目修改不改变原任务期限、排期、验收或积分。'}};
 }
 async preview(p:Principal,raw:unknown,signal?:AbortSignal){const c=projectInput.parse(raw);return (await readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a,snapshot)=>{
  await this.ready(tx,a);const old=snapshot?await this.row(tx,a,c.id):await this.lock(tx,a,c);
  if(snapshot)this.authorize(a,old,c);
  const evidence=emptyEvidence(),plan=await this.prepare(tx,a,c,old,this.now().toISOString(),!snapshot,evidence);
  return {result:{preview:plan.preview,previewHash:plan.previewHash},version:old?.version??null,team:old?.teamId??a.teamId!,evidence};
 },{statementTimeoutMs:20000,signal,checkCurrent:async(tx,a,read)=>{
  const {rows}=await tx.query('SELECT version FROM enterprise_workflow.projects WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,c.id]);
  ensure((rows[0]?.version??null)===read.version,'PROJECT_SCOPE_CHANGED');
  await this.checkEvidence(tx,a,read.evidence);
  if(c.action.type==='edit'){const member=await this.resolveActor.readSnapshot!(tx,{enterpriseId:a.enterpriseId,teamId:read.team,subject:c.action.ownerSubject});ensure(member?.permissions.includes('manage'),'PROJECT_OWNER_UNAVAILABLE',403);}
  if(c.action.type==='create')ensure(!(await tx.query('SELECT 1 FROM enterprise_workflow.projects WHERE enterprise_id=$1 AND code=$2',[a.enterpriseId,c.action.code])).rowCount,'PROJECT_CODE_EXISTS');
 }})).result;}
 async execute(p:Principal,raw:unknown){const input=projectApply.parse(raw),{previewHash,confirmed,...c}=input;return this.tx(p,async(tx,a)=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`project-command:${a.enterpriseId}:${c.commandId}`]);const old=await this.lock(tx,a,c),fp=digest({p,c,previewHash}),prior=(await tx.query('SELECT fingerprint,applied_version FROM enterprise_workflow.project_commands WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,c.commandId])).rows[0];
  if(prior){ensure(prior.fingerprint===fp,'IDEMPOTENCY_CONFLICT');ensure(old,'PROJECT_NOT_FOUND',404);return {id:old.id,version:old.version,appliedVersion:prior.applied_version,replayed:true};}
  const plan=await this.prepare(tx,a,c,old,this.now().toISOString());ensure(plan.previewHash===previewHash,'PROJECT_PREVIEW_CHANGED');const n=plan.next;
  if(plan.draft){const {order,event}=plan.draft;ensure(!(await tx.query('SELECT 1 FROM enterprise_workflow.commands WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,c.commandId])).rowCount,'PROJECT_COMMAND_COLLISION');event.data.projectOrigin={id:n.id,milestoneId:c.action.type==='create-demand'?c.action.milestoneId:null};await tx.query('INSERT INTO enterprise_workflow.orders(enterprise_id,id,version,document)VALUES($1,$2,1,$3)',[a.enterpriseId,order.id,order]);await tx.query('INSERT INTO enterprise_workflow.events(enterprise_id,id,order_id,aggregate_version,event)VALUES($1,$2,$3,1,$4)',[a.enterpriseId,event.id,order.id,event]);await tx.query('INSERT INTO enterprise_workflow.commands(enterprise_id,id,subject,order_id,fingerprint,result)VALUES($1,$2,$3,$4,$5,$6)',[a.enterpriseId,c.commandId,a.subject,order.id,digest({kind:'project-demand',p,c,previewHash}),order]);}
  await tx.query('INSERT INTO enterprise_workflow.project_commands(enterprise_id,id,project_id,team_id,subject,fingerprint,applied_version)VALUES($1,$2,$3,$4,$5,$6,$7)',[a.enterpriseId,c.commandId,n.id,a.teamId,a.subject,fp,n.version]);
  await tx.query('INSERT INTO enterprise_workflow.projects(enterprise_id,id,team_id,code,version,document)VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(enterprise_id,id)DO UPDATE SET version=EXCLUDED.version,document=EXCLUDED.document,updated_at=now()',[a.enterpriseId,n.id,n.teamId,n.code,n.version,n]);
  await tx.query('INSERT INTO enterprise_workflow.project_revisions(enterprise_id,project_id,revision,command_id,actor,action,reason,document)VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[a.enterpriseId,n.id,n.version,c.commandId,a.subject,c.action.type,c.reason,n]);return {id:n.id,version:n.version,appliedVersion:n.version,replayed:false};
 });}
 async read(p:Principal,raw:unknown,signal?:AbortSignal){const q=projectQuery.parse(raw);return (await readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a,snapshot)=>{
  await this.ready(tx,a);
  if(q.action==='list'||q.action==='invitations'){
   const invited=q.action==='invitations';if(invited)ensure(manager(a),'PROJECT_MANAGER_REQUIRED',403);
   const where=invited?"enterprise_id=$1 AND document->'grants' @> $2::jsonb":"enterprise_id=$1 AND (team_id=$3 OR document->'grants' @> $2::jsonb) AND ($4='' OR strpos(lower(document->>'title'),lower($4))>0 OR strpos(lower(code),lower($4))>0)",args=invited?[a.enterpriseId,JSON.stringify([{teamId:a.teamId,state:'invited'}])]:[a.enterpriseId,JSON.stringify([{teamId:a.teamId,state:'approved'}]),a.teamId,q.query];
   const total=Number((await tx.query('SELECT count(*) n FROM enterprise_workflow.projects WHERE '+where,args)).rows[0].n),projects=(await tx.query<{document:Project}>('SELECT document FROM enterprise_workflow.projects WHERE '+where+` ORDER BY updated_at DESC,id DESC LIMIT 30 OFFSET $${args.length+1}`,[...args,(q.page-1)*30])).rows.map(r=>r.document);
   const items=[],evidence=invited?null:emptyEvidence();
   if(!evidence)for(const {id,version,title,code,teamId} of projects)items.push({id,version,title,code,teamId});
   else for(let offset=0;offset<projects.length;offset+=10){
    // Keep fan-out bounded without retaining up to thirty large projects' task projections at once.
    const window=projects.slice(offset,offset+10),inputs=await this.inputs(tx,a,window,!snapshot,true);observe(evidence,inputs);
    for(const project of window){const {id,version,title,code,status,ownerSubject}=project;items.push({id,version,title,code,status,ownerSubject,summary:this.compute(a,project,inputs,undefined,false).summary});}
   }
   return {result:{items,total,page:q.page,canCreate:manager(a)},projects,evidence};
  }
  const project=await this.row(tx,a,q.id);ensure(project&&this.visible(a,project),'PROJECT_NOT_FOUND',404);
  if(q.action==='detail'){const inputs=await this.inputs(tx,a,[project],!snapshot);return {result:this.projection(a,project,this.compute(a,project,inputs)),projects:[project],evidence:observe(emptyEvidence(),inputs)};}
  const rows=(await tx.query('SELECT revision,actor,action,reason,document,created_at FROM enterprise_workflow.project_revisions WHERE enterprise_id=$1 AND project_id=$2 ORDER BY revision DESC LIMIT 30 OFFSET $3',[a.enterpriseId,project.id,(q.page-1)*30])).rows;
  // Never replay old linked-order IDs or revoked-team data through historical documents.
  return {result:{events:rows.map(r=>({revision:r.revision,actor:r.actor,action:r.action,reason:r.reason,createdAt:r.created_at,project:{title:r.document.title,code:r.document.code,status:r.document.status,milestones:r.document.milestones}})),total:project.version,page:q.page},projects:[project],evidence:null};
 },{legacyRepeatable:true,statementTimeoutMs:20000,signal,checkCurrent:async(tx,a,{projects,evidence})=>{
  const versions=new Map(projects.map(p=>[p.id,p.version]));
  if(versions.size){const current=(await tx.query('SELECT id,version FROM enterprise_workflow.projects WHERE enterprise_id=$1 AND id=ANY($2::uuid[])',[a.enterpriseId,[...versions.keys()]])).rows;ensure(current.length===versions.size&&current.every(r=>versions.get(r.id)===r.version),'PROJECT_SCOPE_CHANGED');}
  if(evidence)await this.checkEvidence(tx,a,evidence);
 }})).result;}
}
