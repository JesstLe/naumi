import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function checkAppealsHttp(call:(path:string,body?:unknown,status?:number,who?:string)=>Promise<any>,fixture:{periodId:string;factId:string;expectedScore?:number}){
 const {periodId,factId}=fixture,base='/v1/appeals',get=(q:Record<string,string>,who='worker',status=200)=>call(base+'?'+new URLSearchParams(q),undefined,status,who);
 const {basis}=await get({action:'basis',periodId,factId});assert.equal(basis.current.scoreMilli,fixture.expectedScore??1980);assert(!('parts'in basis));
 const id=randomUUID(),c={commandId:randomUUID(),id,expectedVersion:0,reason:'HTTP 本人申诉',action:{type:'create',periodId,factId,basisHash:basis.basisHash,expectedOutcome:'查证份额',evidence:'任务交接与验收事实'}};
 const l=await call(base,c,200,'worker');assert.equal(l.appeal.version,1);assert.equal((await call(base,c,200,'worker')).replayed,true);
 const mutate=(v:number,action:any)=>({commandId:randomUUID(),id,expectedVersion:v,reason:'HTTP 可追溯处理',action});
 await call(base,mutate(1,{type:'supplement',evidence:'新增说明'}),200,'worker');
 await call(base,mutate(2,{type:'assign',reviewer:basis.subject,dueAt:null}),403,'manager');
 const eligible=await get({action:'reviewers',id},'manager');assert(eligible.members.some((m:any)=>m.subject==='appeal-reviewer'));
 await call(base,mutate(2,{type:'assign',reviewer:'appeal-reviewer',dueAt:null}),200,'manager');
 const resolution=mutate(3,{type:'resolve',outcome:'upheld',basisHash:basis.basisHash});await call(base,resolution,403,'manager');
 const resolved=await call(base,resolution,200,'appeal-reviewer');assert.equal(resolved.appeal.status,'resolved');assert.equal((await call(base,resolution,200,'appeal-reviewer')).replayed,true);
 const history=await get({action:'history',id});assert.equal(history.total,4);assert.equal(history.events.at(-1).document.evidence,c.action.evidence);assert.deepEqual((await get({action:'basis',periodId,factId})).basis,basis);
 console.log('APPEAL_HTTP_PASS: own_basis=1 native_submit=1 replay=1 supplement=1 independent_assign=1 original_decider_denied=1 assigned_reviewer_resolve=1 history4=1 frozen_score=1');return {id,periodId,factId};
}
