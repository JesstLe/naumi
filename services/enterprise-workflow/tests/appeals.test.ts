import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import type {Pool} from 'pg';
import {AppealStore} from '../src/appeal-store';
import {CorrectionStore} from '../src/correction-store';
import {resolveDatabaseActor} from '../src/identity';
import {seedCorrectionAcceptance} from './seed-correction-acceptance';
import {WorkflowStore} from '../src/store';
import {createWorkflowServer} from '../src/server';
import {digest} from '../src/performance-domain';
import {whileReadWaits} from './read-transaction.test';
export async function appealChecks(pool:Pool){
 const enterpriseId=randomUUID(),teamId=randomUUID(),otherTeam=randomUUID(),dir=await mkdtemp(join(tmpdir(),'appeal-test-')),oldEnv=process.env.NAUMI_VERIFY_ISOLATED_DB;process.env.NAUMI_VERIFY_ISOLATED_DB='1';
 try{
 await pool.query('INSERT INTO enterprise_workflow.teams(enterprise_id,team_id)VALUES($1,$2),($1,$3)',[enterpriseId,teamId,otherTeam]);
 for(const [subject,permissions] of [['lead',['manage','dispatch','request','review']],['original',['manage','review']],['worker',['execute']],['appeal-reviewer',['review']],['replacement',['manage','review']],['stranger',['execute']]] as const){await pool.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject)VALUES($1,$2)',[enterpriseId,subject]);for(const team of [teamId,otherTeam])await pool.query('INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds)VALUES($1,$2,$3,$4,$5)',[enterpriseId,team,subject,JSON.stringify(permissions),'["design"]']);}
 const fixture=await seedCorrectionAcceptance(pool,enterpriseId,teamId,dir,'lead','worker','original'),{periodId,factId}=fixture,p=(subject:string,team=teamId)=>({enterpriseId,teamId:team,subject}),store=new AppealStore(pool,resolveDatabaseActor),corr=new CorrectionStore(pool,resolveDatabaseActor);
 const frozen=async()=>JSON.stringify((await pool.query('SELECT document FROM enterprise_workflow.performance_periods WHERE enterprise_id=$1 AND id=$2',[enterpriseId,periodId])).rows),before=await frozen();
 const basis=async(who='worker')=>(await store.read(p(who),{action:'basis',periodId,factId}) as any).basis,initial=await basis();assert.equal(initial.current.scoreMilli,1980);assert.equal(initial.current.bps,6000);assert(!JSON.stringify(initial).includes('lead'));await assert.rejects(basis('stranger'),/APPEAL_FACT_NOT_FOUND/);
 const create=async(extra={})=>({commandId:randomUUID(),id:randomUUID(),expectedVersion:0,reason:'份额与交接记录需核对',action:{type:'create',periodId,factId,basisHash:(await basis()).basisHash,expectedOutcome:'请核对实际贡献',evidence:'原验收与交接为证据',...extra}}),execute=(who:string,c:any)=>store.execute(p(who),c) as Promise<any>,detail=(who:string,id:string)=>store.read(p(who),{action:'detail',id}) as Promise<any>;
 const c=await create(),l=(await execute('worker',c)).appeal;assert.equal(l.version,1);assert.equal((await execute('worker',c)).replayed,true);await assert.rejects(execute('worker',{...c,reason:'different'}),/IDEMPOTENCY_CONFLICT/);await assert.rejects(execute('worker',await create()),/APPEAL_ALREADY_OPEN/);await assert.rejects(execute('lead',c),/APPEAL_SELF_REQUIRED/);await assert.rejects(detail('stranger',l.id),/APPEAL_NOT_FOUND/);await assert.rejects(store.read(p('lead',otherTeam),{action:'detail',id:l.id}),/APPEAL_NOT_FOUND/);
 const update=(version:number,action:any,reason='明确处理依据')=>({commandId:randomUUID(),id:l.id,expectedVersion:version,reason,action});
 const supplied=await execute('worker',update(1,{type:'supplement',evidence:'补充证据一'}));assert.equal(supplied.appeal.evidence,l.evidence);assert.equal(supplied.appeal.supplements.length,1);
 const eligible=await store.read(p('lead'),{action:'reviewers',id:l.id}) as any;assert.deepEqual(eligible.members.map((x:any)=>x.subject),['appeal-reviewer','replacement']);await assert.rejects(store.read(p('worker'),{action:'reviewers',id:l.id}),/APPEAL_ASSIGN_FORBIDDEN/);
 await assert.rejects(execute('lead',update(2,{type:'assign',reviewer:'original',dueAt:null})),/APPEAL_INDEPENDENT_REVIEW_REQUIRED/);
 const assigned=await execute('lead',update(2,{type:'assign',reviewer:'appeal-reviewer',dueAt:'2020-01-01T00:00:00Z'}));assert.equal(assigned.overdue,true);assert.equal((await detail('appeal-reviewer',l.id)).canResolve,true);await assert.rejects(detail('replacement',randomUUID()),/APPEAL_NOT_FOUND/);
 const readDetail={action:'detail',id:l.id},reviewer=p('appeal-reviewer'),legacy=new AppealStore(pool,(tx,who)=>resolveDatabaseActor(tx,who));
 const lockPeriod=(tx:import('pg').PoolClient)=>tx.query('LOCK TABLE enterprise_workflow.performance_periods IN ACCESS EXCLUSIVE MODE');
 const lockMember=()=>pool.query("SELECT subject FROM enterprise_workflow.team_members WHERE enterprise_id=$1 AND team_id=$2 AND subject='appeal-reviewer' FOR UPDATE NOWAIT",[enterpriseId,teamId]);
 const previous=await whileReadWaits(pool,lockPeriod,()=>legacy.read(reviewer,readDetail),async()=>{await assert.rejects(lockMember(),{code:'55P03'});});
 const current=await whileReadWaits(pool,lockPeriod,()=>store.read(reviewer,readDetail),async()=>{assert.equal((await lockMember()).rowCount,1);});
 assert.equal(previous.status,'fulfilled');assert.deepEqual(current,previous);
 const member=(enabled:boolean)=>pool.query("UPDATE enterprise_workflow.team_members SET enabled=$3 WHERE enterprise_id=$1 AND team_id=$2 AND subject='appeal-reviewer'",[enterpriseId,teamId,enabled]);
 const revoked=await whileReadWaits(pool,lockPeriod,()=>store.read(reviewer,readDetail),async()=>{await member(false);});
 assert.equal(revoked.status,'rejected');assert.equal(revoked.reason.code,'MEMBERSHIP_REQUIRED');await member(true);
 const reassign=(subject:string)=>pool.query("UPDATE enterprise_workflow.performance_appeals SET document=jsonb_set(document,'{reviewer}',to_jsonb($3::text)) WHERE enterprise_id=$1 AND id=$2",[enterpriseId,l.id,subject]);
 const reassigned=await whileReadWaits(pool,lockPeriod,()=>store.read(reviewer,readDetail),async()=>{await reassign('replacement');});
 assert.equal(reassigned.status,'rejected');assert.equal(reassigned.reason.code,'APPEAL_NOT_FOUND');await reassign('appeal-reviewer');
 const server=createWorkflowServer(new WorkflowStore(pool,resolveDatabaseActor,async()=>false),async()=>reviewer);server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const address=server.address();assert(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}/v1/appeals?action=detail&id=${l.id}`;
  const abort=new AbortController(),stopped=await whileReadWaits(pool,lockPeriod,()=>fetch(url,{signal:abort.signal}),async()=>{
   abort.abort();for(let i=0;i<50&&pool.totalCount-pool.idleCount>1;i++)await delay(10);
   assert.equal(pool.totalCount-pool.idleCount,1,'disconnected appeal must release its slot before the blocker clears');
  });
  assert.equal(stopped.status,'rejected');assert.equal(stopped.reason.name,'AbortError');const retry=await fetch(url);assert.equal(retry.status,200);assert.equal((await retry.json() as {canResolve:boolean}).canResolve,true);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 console.log('APPEAL_READ_SNAPSHOT_PASS: legacy_blocks_member_write=1 detached_read_leaves_member_unlocked=1 previous_response_equal=1 mid_read_revocation403=1 live_reassignment404=1 abort_releases_slot=1');
 const staleBasis=initial.basisHash,proposal={periodId,factId,baseRevision:0,shares:[{subject:'lead',bps:5000},{subject:'worker',bps:5000}],reason:'有依据的分摊更正'},plan=await corr.preview(p('lead'),{operation:'preview',...proposal}),correctionId=randomUUID();await corr.execute(p('lead'),{operation:'propose',commandId:randomUUID(),id:correctionId,...proposal,previewHash:plan.previewHash});await corr.execute(p('original'),{operation:'review',commandId:randomUUID(),id:correctionId,expectedVersion:1,approve:true,reason:'独立更正批准'});
 await assert.rejects(execute('appeal-reviewer',update(3,{type:'resolve',outcome:'corrected',correctionId,basisHash:staleBasis})),/APPEAL_BASIS_CHANGED/);
 await pool.query("UPDATE enterprise_workflow.team_members SET enabled=false WHERE enterprise_id=$1 AND team_id=$2 AND subject='appeal-reviewer'",[enterpriseId,teamId]);await assert.rejects(execute('appeal-reviewer',update(3,{type:'resolve',outcome:'upheld',basisHash:(await basis()).basisHash})),/MEMBERSHIP_REQUIRED/);
 const replacement=await execute('lead',update(3,{type:'assign',reviewer:'replacement',dueAt:assigned.appeal.dueAt}));assert.equal(replacement.appeal.dueAt,assigned.appeal.dueAt);
 const resolution=update(4,{type:'resolve',outcome:'corrected',correctionId,basisHash:(await basis()).basisHash});await assert.rejects(execute('original',resolution),/APPEAL_REVIEWER_REQUIRED/);await assert.rejects(execute('replacement',{...resolution,action:{...resolution.action,correctionId:randomUUID()}}),/APPEAL_CORRECTION_REQUIRED/);
 await pool.query("CREATE FUNCTION enterprise_workflow.fail_appeal_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation LIKE 'appeal-%' THEN RAISE EXCEPTION 'appeal audit failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER fail_appeal_audit BEFORE INSERT ON enterprise_workflow.performance_audit FOR EACH ROW EXECUTE FUNCTION enterprise_workflow.fail_appeal_audit()");await assert.rejects(execute('replacement',resolution),/appeal audit failure/);await pool.query('DROP TRIGGER fail_appeal_audit ON enterprise_workflow.performance_audit;DROP FUNCTION enterprise_workflow.fail_appeal_audit()');assert.equal((await detail('worker',l.id)).appeal.version,4);assert.equal((await pool.query('SELECT 1 FROM enterprise_workflow.appeal_commands WHERE enterprise_id=$1 AND id=$2',[enterpriseId,resolution.commandId])).rowCount,0);
 const results=await Promise.allSettled([resolution,{...resolution,commandId:randomUUID()}].map(x=>execute('replacement',x)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const done=(await detail('worker',l.id)).appeal;assert.equal(done.resolution.basis.current.scoreMilli,1650);assert.equal(done.basis.current.scoreMilli,1980);assert.equal(await frozen(),before);await assert.rejects(execute('worker',update(5,{type:'withdraw'})),/APPEAL_TERMINAL/);
 await pool.query("UPDATE enterprise_workflow.team_members SET permissions='[\"execute\"]' WHERE enterprise_id=$1 AND team_id=$2 AND subject='replacement'",[enterpriseId,teamId]);await assert.rejects(execute('replacement',resolution),/APPEAL_NOT_FOUND/);await pool.query("UPDATE enterprise_workflow.team_members SET permissions='[\"manage\",\"review\"]' WHERE enterprise_id=$1 AND team_id=$2 AND subject='replacement'",[enterpriseId,teamId]);
 const repeat=await create({previousId:l.id}),second=(await execute('worker',repeat)).appeal;const secondCmd=(v:number,action:any)=>({commandId:randomUUID(),id:second.id,expectedVersion:v,reason:'追加可追溯说明',action});
 for(let i=0;i<31;i++)await execute('worker',secondCmd(i+1,{type:'supplement',evidence:'证据'+i}));const history=await store.read(p('worker'),{action:'history',id:second.id,page:2}) as any;assert.equal(history.total,32);assert.equal(history.events.length,2);assert.equal(history.events[1].document.evidence,repeat.action.evidence);
 await execute('worker',secondCmd(32,{type:'withdraw'}));assert.equal((await corr.read(p('worker'),{action:'reconciliation',periodId}) as any).results[0].adjustedScoreMilli,1650);
 const races=await Promise.allSettled([await create(),await create()].map(c=>execute('worker',c)));assert.equal(races.filter(r=>r.status==='fulfilled').length,1);const third=(races.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>).value.appeal;await execute('worker',{commandId:randomUUID(),id:third.id,expectedVersion:1,reason:'撤回',action:{type:'withdraw'}});
 for(let i=0;i<29;i++){const c=await create(),a=(await execute('worker',c)).appeal;await execute('worker',{commandId:randomUUID(),id:a.id,expectedVersion:1,reason:'重复历史分页验收',action:{type:'withdraw'}});}
 const page=await store.read(p('worker'),{action:'list',periodId,page:2}) as any;assert.equal(page.total,32);assert.equal(page.items.length,2);const empty=await store.read(p('worker'),{action:'list',periodId,page:99}) as any;assert.equal(empty.total,32);assert.equal(empty.items.length,0);await assert.rejects(store.read(p('worker'),{action:'list',periodId,scope:'team'}),/APPEAL_TEAM_FORBIDDEN/);
 assert.equal((await store.read(p('original'),{action:'list',periodId,scope:'team'}) as any).total,32);await assert.rejects(new AppealStore(pool,resolveDatabaseActor,false).read(p('worker'),{action:'detail',id:l.id}),/APPEALS_NOT_ENABLED/);
 const rawPeriod=JSON.parse(before)[0].document,rawRow=rawPeriod.snapshot.rows.find((r:{fact:{id:string}})=>r.fact.id===factId),rawLatest=(await pool.query('SELECT document FROM enterprise_workflow.performance_corrections WHERE enterprise_id=$1 AND id=$2',[enterpriseId,correctionId])).rows[0].document;
 assert.equal((await basis()).basisHash,digest({periodId,version:rawPeriod.version,rule:rawPeriod.snapshot.rule,row:rawRow,latest:rawLatest,subject:'worker'}));
 const originalAppeal=(await pool.query('SELECT document FROM enterprise_workflow.performance_appeals WHERE enterprise_id=$1 AND id=$2',[enterpriseId,l.id])).rows[0].document;
 const listRow=(await store.read(p('worker'),{action:'list',periodId,state:'resolved'}) as any).items[0];
 assert.deepEqual(listRow,{id:l.id,subject:originalAppeal.subject,taskTitle:originalAppeal.basis.taskTitle,status:originalAppeal.status,version:originalAppeal.version,reviewer:originalAppeal.reviewer,dueAt:originalAppeal.dueAt,updatedAt:originalAppeal.updatedAt,overdue:false});
 const revisions=await pool.connect();try{
  await revisions.query('BEGIN');await revisions.query('LOCK TABLE enterprise_workflow.appeal_revisions IN ACCESS EXCLUSIVE MODE');
  const emptyHistory=await store.read(p('worker'),{action:'history',id:second.id,page:100});assert.deepEqual(emptyHistory,{events:[],total:33,page:100});
 }finally{await revisions.query('ROLLBACK');revisions.release();}
 // Clone real fixture revisions with synthetic history payloads (no commands or external calls).
 await pool.query(`INSERT INTO enterprise_workflow.performance_corrections(enterprise_id,team_id,id,period_id,fact_id,version,state,applied_revision,document)
  SELECT $1,$2,x.id,$3,$4,($5::jsonb->>'version')::int,'approved',x.n,$5::jsonb||jsonb_build_object('id',x.id,'appliedRevision',x.n,'proposedBy',CASE WHEN x.n=2 THEN 'stranger' ELSE 'lead' END,'reviewedBy','original','reason',repeat('review history evidence ',180))
  FROM (SELECT gen_random_uuid() id,n FROM generate_series(2,240) n) x`,[enterpriseId,teamId,periodId,factId,rawLatest]);
 await pool.query(`UPDATE enterprise_workflow.team_members SET permissions='["review"]' WHERE enterprise_id=$1 AND team_id=$2 AND subject='stranger'`,[enterpriseId,teamId]);
 const fullHistory=(await pool.query('SELECT document FROM enterprise_workflow.performance_corrections WHERE enterprise_id=$1 AND team_id=$2 AND period_id=$3 AND fact_id=$4 ORDER BY applied_revision DESC',[enterpriseId,teamId,periodId,factId])).rows.map(r=>r.document);
 const heavyBasis=await basis();assert.equal(fullHistory.length,240);assert.equal(heavyBasis.basisHash,digest({periodId,version:rawPeriod.version,rule:rawPeriod.snapshot.rule,row:rawRow,latest:fullHistory[0],subject:'worker'}));assert.equal(heavyBasis.correctionRevision,240);
 const heavyReviewers=await store.read(p('lead'),{action:'reviewers',id:l.id}) as any;assert.deepEqual(heavyReviewers.members,[{subject:'replacement'}]);
 console.log('APPEAL_PROJECTION_PASS: frozen_basis_digest_equal=1 latest_revision240=1 historical_actor_excluded=1 list_fields_unchanged=1 empty_history_skips_blocked_table=1');
 await pool.query("UPDATE enterprise_workflow.accounts SET enabled=false WHERE enterprise_id=$1 AND subject='worker'",[enterpriseId]);await assert.rejects(execute('worker',c),/MEMBERSHIP_REQUIRED/);await pool.query("UPDATE enterprise_workflow.accounts SET enabled=true WHERE enterprise_id=$1 AND subject='worker'",[enterpriseId]);assert.equal(await frozen(),before);
 console.log('APPEAL_SERVICE_PASS: actual_frozen_fact=1 own_basis=1 submitted_replay=1 duplicate_open=1 concurrent_create1=1 append_only=1 independent_exclusions=1 departed_reviewer_replace=1 same_due=1 stale_basis=1 approved_correction_link=1 wrong_correction_denied=1 audit_atomic=1 resolution_race1=1 original_snapshot_unchanged=1 withdrawal_keeps_score=1 history32=1 list32=1 empty_total=1 team_scope=1 revoked_replay=1 disabled503=1');
 }finally{if(oldEnv===undefined)delete process.env.NAUMI_VERIFY_ISOLATED_DB;else process.env.NAUMI_VERIFY_ISOLATED_DB=oldEnv;await rm(dir,{recursive:true,force:true});}
}
