import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {WorkflowStore} from '../src/store';
import {resolveDatabaseActor} from '../src/identity';
import {NotificationStore} from '../src/notification-store';
import {commandSchema,type Action,type Principal,type WorkOrder,type Actor} from '../src/contracts';
import {evolve} from '../src/domain';
import {changeImpact,changeBaseline} from '../src/change-domain';

export async function changeChecks(pool:Pool){
 const enterpriseId=randomUUID(),teamId=randomUUID(),origin=randomUUID(),foreign=randomUUID();
 const p=(subject:string,team=teamId):Principal=>({enterpriseId,teamId:team,subject});
 await pool.query('INSERT INTO enterprise_workflow.teams(enterprise_id,team_id)VALUES($1,$2),($1,$3),($1,$4)',[enterpriseId,teamId,origin,foreign]);
 for(const [subject,team,permissions,kinds]of [['requester',origin,['request'],[]],['business',origin,['manage'],[]],['lead',teamId,['dispatch','manage','review'],[]],['worker',teamId,['execute','dispatch'],['design']],['foreign',foreign,['manage','dispatch'],[]]]as const){await pool.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject)VALUES($1,$2)',[enterpriseId,subject]);await pool.query('INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds)VALUES($1,$2,$3,$4,$5)',[enterpriseId,team,subject,JSON.stringify(permissions),JSON.stringify(kinds)]);}
 // Isolated installation only; production activation is separately exercised through the real CLI.
 const original=(await pool.query('SELECT * FROM enterprise_workflow.runtime_installation WHERE singleton')).rows[0];
 await pool.query("INSERT INTO enterprise_workflow.runtime_installation(singleton,installation_id,minimum_reader,minimum_writer,changes_enabled)VALUES(true,'changes-fixture',33,33,true) ON CONFLICT(singleton) DO UPDATE SET changes_enabled=true,minimum_reader=33,minimum_writer=33");
 let at='2030-01-01T00:00:00.000Z';
 const notifications=new NotificationStore(pool,resolveDatabaseActor);
 const make=(enabled=true,n=notifications)=>new WorkflowStore(pool,resolveDatabaseActor,async()=>true,undefined,undefined,()=>new Date(at),undefined,n,true,true,true,true,undefined,true,true,undefined,true,true,true,true,true,true,enabled);
 const store=make(),taskId=randomUUID(),acceptedId=randomUUID(),orderId=randomUUID();
 const seed:WorkOrder={id:orderId,enterpriseId,teamId,requestTeamId:origin,requester:'requester',title:'冻结需求',brief:'原范围',acceptance:'原标准',status:'active',version:1,createdAt:at,updatedAt:at,tasks:[{id:taskId,title:'执行任务',kind:'design',points:3,dueAt:'2030-01-02T00:00:00.000Z',dependencyIds:[],status:'in_progress',assignee:'worker',percent:10,reworkCount:0,startedAt:at,submittedAt:null,acceptedAt:null,assetIds:[],quality:null},{id:acceptedId,title:'已验收独立任务',kind:'design',points:2,dueAt:'2030-01-02T00:00:00.000Z',dependencyIds:[],status:'accepted',assignee:'worker',percent:100,reworkCount:0,startedAt:at,submittedAt:at,acceptedAt:at,assetIds:[],quality:5}]};
 await pool.query('INSERT INTO enterprise_workflow.orders(enterprise_id,id,version,document)VALUES($1,$2,1,$3)',[enterpriseId,orderId,seed]);
 let o=seed;const cmd=(action:Action)=>({commandId:randomUUID(),orderId,expectedVersion:o.version,action}),act=async(actor:Principal,action:Action)=>{o=(await store.execute(actor,cmd(action))).order;return o;};
 const patch={tasks:[{taskId,points:5,dueAt:'2030-01-05T00:00:00.000Z'}]},changeId=randomUUID();
 assert.throws(()=>commandSchema.parse(cmd({type:'propose-change',changeId,reason:'x',patch:{tasks:[{taskId,points:5,assignee:'injected'}]}}as any)));
 assert.throws(()=>commandSchema.parse(cmd({type:'propose-change',changeId,reason:'x',patch:{tasks:[{taskId,points:5},{taskId,points:6}]}})));
 await assert.rejects(make(false).execute(p('requester',origin),cmd({type:'propose-change',changeId,reason:'x',patch})),/CHANGES_NOT_ENABLED/);
 await pool.query('UPDATE enterprise_workflow.runtime_installation SET changes_enabled=false');await assert.rejects(store.previewChange(p('requester',origin),{orderId,expectedVersion:o.version,patch}),/CHANGES_ACTIVATION_REQUIRED/);await pool.query('UPDATE enterprise_workflow.runtime_installation SET changes_enabled=true');
 const preview=await store.previewChange(p('requester',origin),{orderId,expectedVersion:o.version,patch});assert.equal(preview.impact.deltaPoints,2);assert.equal((await store.get(p('lead'),orderId)).version,1);
 await assert.rejects(store.previewChange(p('foreign',foreign),{orderId,expectedVersion:o.version,patch}),/NOT_FOUND/);
 await assert.rejects(store.execute(p('requester',origin),cmd({type:'propose-change',changeId,reason:'x',patch:{requirement:{acceptance:'changed'},tasks:[]}})),/CHANGE_REVIEW_OR_ACCEPTED_FROZEN/);
 const proposal=cmd({type:'propose-change',changeId,reason:'活动延期且增加制作量',patch});o=(await store.execute(p('requester',origin),proposal)).order;
 assert.equal((await store.execute(p('requester',origin),proposal)).replayed,true);assert.equal(o.tasks[0].points,3);assert.equal(o.tasks[0].dueAt,seed.tasks[0].dueAt);
 await assert.rejects(store.execute(p('requester',origin),{...proposal,action:{...proposal.action,reason:'changed input'}}),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(store.execute(p('requester',origin),cmd({type:'approve-change',changeId,side:'business',reason:'self'})),/CHANGE_INDEPENDENT_APPROVAL_REQUIRED/);
 await assert.rejects(store.execute(p('worker'),cmd({type:'approve-change',changeId,side:'execution',reason:'own work'})),/CHANGE_INDEPENDENT_APPROVAL_REQUIRED/);
 await act(p('business',origin),{type:'approve-change',changeId,side:'business',reason:'确认范围和延期'});assert.equal(o.changes![0].status,'proposed');
 await assert.rejects(store.execute(p('lead'),cmd({type:'apply-change',changeId,reason:'premature'})),/CHANGE_BOTH_APPROVALS_REQUIRED/);
 await act(p('lead'),{type:'approve-change',changeId,side:'execution',reason:'确认成本与承诺'});assert.equal(o.changes![0].status,'approved');
 await pool.query("UPDATE enterprise_workflow.team_members SET enabled=false WHERE enterprise_id=$1 AND subject='business'",[enterpriseId]);await assert.rejects(store.execute(p('lead'),cmd({type:'apply-change',changeId,reason:'revoked reviewer'})),/CHANGE_APPROVER_UNAVAILABLE/);await pool.query("UPDATE enterprise_workflow.team_members SET enabled=true WHERE enterprise_id=$1 AND subject='business'",[enterpriseId]);
 const other=randomUUID();await act(p('requester',origin),{type:'propose-change',changeId:other,reason:'并行申请',patch:{tasks:[{taskId,title:'并行标题'}]}});
 const apply=cmd({type:'apply-change',changeId,reason:'应用已批准的新承诺'}),badNotification=Object.assign(Object.create(notifications),{publish:async()=>{throw Error('AUDIT_FAIL');}}),broken=make(true,badNotification);
 await assert.rejects(broken.execute(p('lead'),apply),/AUDIT_FAIL/);assert.deepEqual(await store.get(p('lead'),orderId),o);assert.equal((await pool.query('SELECT 1 FROM enterprise_workflow.commands WHERE enterprise_id=$1 AND id=$2',[enterpriseId,apply.commandId])).rowCount,0);
 const raced=await Promise.all([store.execute(p('lead'),apply),store.execute(p('lead'),apply)]);assert.equal(raced.filter(r=>r.replayed).length,1);o=raced[0].order;assert.equal((await store.execute(p('lead'),apply)).replayed,true);assert.equal(o.tasks[0].points,5);assert.equal(o.tasks[0].commitmentBaseline!.points,3);assert.equal(o.tasks[0].commitmentBaseline!.dueAt,seed.tasks[0].dueAt);assert.equal(o.tasks[0].percent,10);assert.deepEqual(o.tasks[1],seed.tasks[1]);
 await assert.rejects(store.execute(p('business',origin),cmd({type:'approve-change',changeId:other,side:'business',reason:'stale'})),/CHANGE_BASELINE_STALE/);
 await act(p('requester',origin),{type:'withdraw-change',changeId:other,reason:'重新评估'});
 const current=randomUUID();await act(p('requester',origin),{type:'propose-change',changeId:current,reason:'新标题',patch:{tasks:[{taskId,title:'新版执行任务'}]}});
 await act(p('worker'),{type:'progress',taskId,percent:20,note:'实际制作'});await assert.rejects(store.execute(p('business',origin),cmd({type:'approve-change',changeId:current,side:'business',reason:'stale progress'})),/CHANGE_BASELINE_STALE/);await act(p('business',origin),{type:'reject-change',changeId:current,reason:'进度变化需重新评估'});
 const details=await store.detail(p('requester',origin),orderId);assert.equal(details.changeControl.canPropose,true);assert.equal(details.order.changes!.length,3);assert((await pool.query("SELECT 1 FROM enterprise_workflow.notifications WHERE enterprise_id=$1 AND action='apply-change'",[enterpriseId])).rowCount!>0);
 at='2030-01-03T00:00:00.000Z';await act(p('worker'),{type:'submit-delivery',taskId,assetIds:[randomUUID()],note:'已交付'});
 await assert.rejects(store.previewChange(p('lead'),{orderId,expectedVersion:o.version,patch:{tasks:[{taskId,points:6}]}}),/CHANGE_REVIEW_OR_ACCEPTED_FROZEN/);
 await act(p('lead'),{type:'accept-delivery',taskId,quality:5,note:'验收新版'});const fact=(await store.facts(p('lead'))).facts[0];assert.equal(fact.data.dueAt,seed.tasks[0].dueAt);assert.equal(fact.data.committedDueAt,patch.tasks[0].dueAt);assert.equal(fact.data.originalPoints,3);assert.equal(fact.data.points,5);assert.equal(fact.data.measurementVersion,3);assert.deepEqual(fact.data.changeIds,[changeId]);assert(Date.parse(String(fact.data.submittedAt))>Date.parse(String(fact.data.dueAt)));
 // Pure model: scope baseline, two approver separation, deadlines, dependency effects and no direct frozen-edit bypass.
 const fresh=structuredClone(seed);fresh.tasks=fresh.tasks.slice(0,1);const actor:Actor={...p('lead'),permissions:['dispatch','manage','request'],workKinds:[]};fresh.requestTeamId=teamId;fresh.requester='requester';
 const requestActor:Actor={...p('requester'),permissions:['request'],workKinds:[]},bc=randomUUID();let draft=evolve(fresh,requestActor,{commandId:randomUUID(),orderId,expectedVersion:1,action:{type:'propose-change',changeId:bc,reason:'new scope',patch:{requirement:{brief:'新范围'},tasks:[]}}},seed.createdAt).order;
 draft=evolve(draft,actor,{commandId:randomUUID(),orderId,expectedVersion:draft.version,action:{type:'approve-change',changeId:bc,side:'business',reason:'first'}},seed.createdAt).order;
 assert.throws(()=>evolve(draft,actor,{commandId:randomUUID(),orderId,expectedVersion:draft.version,action:{type:'approve-change',changeId:bc,side:'execution',reason:'same person'}},seed.createdAt),/CHANGE_TWO_PEOPLE_REQUIRED/);
 assert.throws(()=>evolve(draft,requestActor,{commandId:randomUUID(),orderId,expectedVersion:draft.version,action:{type:'revise-requirement',title:'bypass',brief:'bypass',acceptance:'bypass'}},seed.createdAt),/INVALID_ORDER_STATE/);
 const second={...actor,subject:'independent'};draft=evolve(draft,second,{commandId:randomUUID(),orderId,expectedVersion:draft.version,action:{type:'approve-change',changeId:bc,side:'execution',reason:'second'}},seed.createdAt).order;draft=evolve(draft,actor,{commandId:randomUUID(),orderId,expectedVersion:draft.version,action:{type:'apply-change',changeId:bc,reason:'apply'}},seed.createdAt).order;assert.equal(draft.requirementBaseline!.brief,'原范围');assert.equal(draft.brief,'新范围');
 const dependent={...fresh,tasks:[{...fresh.tasks[0],planEnd:'2030-01-07'}, {...seed.tasks[1],status:'open' as const,dependencyIds:[taskId]}]};const impact=changeImpact(dependent,patch,seed.createdAt);assert(impact.downstreamIds.includes(acceptedId));assert(impact.warnings.some(w=>w.code==='PLAN_AFTER_NEW_DUE'));assert(impact.warnings.some(w=>w.code==='DEPENDENCY_DUE_CONFLICT'));assert.throws(()=>changeImpact(fresh,patch,'2030-01-10T00:00:00Z'),/CHANGE_DEADLINE_PAST/);assert.equal(changeBaseline(fresh),changeBaseline({...fresh,updatedAt:at,version:999}));
 if(original)await pool.query('UPDATE enterprise_workflow.runtime_installation SET minimum_reader=$1,minimum_writer=$2,changes_enabled=$3',[original.minimum_reader,original.minimum_writer,original.changes_enabled]);else await pool.query('DELETE FROM enterprise_workflow.runtime_installation');
 console.log('CHANGES_SERVICE_PASS: cross_team=1 readonly_preview=1 two_independent_approvals=1 stale_baseline=1 revoked_approver=1 atomic_audit=1 replay=1 original_due_lateness=1 accepted_immutable=1 no_source_mutation=1');
}
