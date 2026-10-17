import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {WorkflowStore} from '../src/store';
import {resolveDatabaseActor} from '../src/identity';
import type {Action,Principal} from '../src/contracts';
export async function tasksChecks(pool:Pool){
 const enterpriseId=randomUUID(),teamId=randomUUID(),otherTeam=randomUUID();
 await pool.query('INSERT INTO enterprise_workflow.teams(enterprise_id,team_id) VALUES($1,$2),($1,$3)',[enterpriseId,teamId,otherTeam]);
 const p=(subject:string,team=teamId):Principal=>({enterpriseId,teamId:team,subject});
 for(const [s,perms,kinds] of [['lead',['request','dispatch','manage'],[]],['design-a',['execute'],['design']],['design-b',['execute'],['design']],['artist',['execute'],['artwork']],['disabled',['execute'],['design']],['other-team',['execute'],['design']]] as const){await pool.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject,enabled)VALUES($1,$2,$3)',[enterpriseId,s,s!=='disabled']);await pool.query('INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds)VALUES($1,$2,$3,$4,$5)',[enterpriseId,s==='other-team'?otherTeam:teamId,s,JSON.stringify(perms),JSON.stringify(kinds)]);}
 const store=new WorkflowStore(pool,resolveDatabaseActor,async()=>false),lead=p('lead');
 const candidates=await store.assignees(lead,{kind:'design'});assert.deepEqual(candidates.members.map(m=>m.subject),['design-a','design-b']);await assert.rejects(store.assignees(p('design-a')),/DISPATCH_REQUIRED/);assert.equal((await store.assignees(lead,{kind:'artwork'})).members[0].subject,'artist');
 const orderId=randomUUID();let o=(await store.execute(lead,{commandId:randomUUID(),orderId,expectedVersion:0,action:{type:'create',title:'task query fixture',brief:'synthetic',acceptance:'synthetic'}})).order;
 const act=async(actor:Principal,action:Action)=>{o=(await store.execute(actor,{commandId:randomUUID(),orderId,expectedVersion:o.version,action})).order;return o;};
 await act(lead,{type:'submit-requirement'});await act(lead,{type:'approve-requirement'});
 const ids=Array.from({length:33},()=>randomUUID()),tasks=ids.map((id,i)=>({id,title:'task '+i,kind:i===2?'artwork' as const:'design' as const,points:2,dueAt:new Date(Date.now()+86400000).toISOString(),dependencyIds:i===1?[ids[0]]:[]}));
 await act(lead,{type:'plan-tasks',tasks});assert.equal((await store.tasks(lead)).total,33);assert.equal((await store.tasks(p('design-a'))).total,0);await act(lead,{type:'publish'});
 assert.equal((await store.tasks(p('design-a'))).total,33);assert.equal((await store.tasks(p('design-a'),{page:2})).tasks.length,3);assert.equal((await store.tasks(p('design-a'),{scope:'claimable'})).total,31);assert.equal((await store.tasks(p('artist'),{scope:'claimable'})).total,1);assert.equal((await store.tasks(p('other-team',otherTeam))).total,0);
 await assert.rejects(act(p('design-a'),{type:'claim',taskId:ids[1]}),/DEPENDENCY_NOT_ACCEPTED/);
 await assert.rejects(act(lead,{type:'assign',taskId:ids[0],assignee:'artist'}),/INVALID_ASSIGNEE/);await assert.rejects(act(lead,{type:'assign',taskId:ids[0],assignee:'disabled'}),/MEMBERSHIP_REQUIRED/);
 await act(lead,{type:'assign',taskId:ids[0],assignee:'design-a'});await assert.rejects(act(p('design-b'),{type:'claim',taskId:ids[0]}),/FORBIDDEN/);await assert.rejects(act(p('design-a'),{type:'start',taskId:ids[0]}),/INVALID_TASK_STATE/);await act(p('design-a'),{type:'claim',taskId:ids[0]});await act(p('design-a'),{type:'start',taskId:ids[0]});await act(p('design-a'),{type:'progress',taskId:ids[0],percent:40,note:'layout done'});await assert.rejects(act(p('design-a'),{type:'progress',taskId:ids[0],percent:39,note:'regression'}),/PROGRESS_REGRESSION/);await act(p('design-a'),{type:'block',taskId:ids[0],reason:'await copy'});await act(p('design-a'),{type:'resume',taskId:ids[0]});
 assert.equal((await store.tasks(p('design-a'),{scope:'mine'})).total,1);assert.equal((await store.tasks(p('design-a'),{query:'task 0'})).tasks[0].task.percent,40);
 const version=o.version;const race=await Promise.allSettled(['design-a','design-b'].map(subject=>store.execute(p(subject),{commandId:randomUUID(),orderId,expectedVersion:version,action:{type:'claim',taskId:ids[3]}})));assert.equal(race.filter(x=>x.status==='fulfilled').length,1);o=await store.get(lead,orderId);const winner=o.tasks.find(t=>t.id===ids[3])!.assignee!;await act(p(winner),{type:'release',taskId:ids[3],reason:'capacity'});assert.equal(o.tasks.find(t=>t.id===ids[3])!.status,'open');
 await pool.query("UPDATE enterprise_workflow.team_members SET work_kinds='[\"artwork\"]' WHERE enterprise_id=$1 AND subject='design-b'",[enterpriseId]);assert.equal((await store.assignees(lead,{kind:'design'})).total,1);await assert.rejects(act(lead,{type:'assign',taskId:ids[3],assignee:'design-b'}),/INVALID_ASSIGNEE/);
 await pool.query("UPDATE enterprise_workflow.team_members SET enabled=false WHERE enterprise_id=$1 AND subject='design-a'",[enterpriseId]);await assert.rejects(store.tasks(p('design-a')),/MEMBERSHIP_REQUIRED/);
 const fresh=new WorkflowStore(pool,resolveDatabaseActor,async()=>false);assert.equal((await fresh.tasks(lead,{scope:'all',status:'in_progress'})).total,1);assert.equal((await fresh.detail(lead,orderId)).order.tasks[0].percent,40);
 console.log('TASK_CENTER_PASS: scoped_pagination=1 eligible_pool=1 candidates_by_kind=1 dispatch_only=1 revoked_candidate_denied=1 assignment_confirmation=1 dependency_gate=1 concurrent_claim_winner=1 progress_monotonic=1 block_resume=1 release=1 reopen=1');
}
