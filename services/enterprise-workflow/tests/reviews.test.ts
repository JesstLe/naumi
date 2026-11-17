import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import type {Pool} from 'pg';
import {WorkflowStore} from '../src/store';
import {ReviewStore} from '../src/review-store';
import {DeliveryStore} from '../src/delivery-store';
import {resolveDatabaseActor} from '../src/identity';
import type {Action,Principal} from '../src/contracts';
import type {ResolveActor} from '../src/store';
import {createWorkflowServer} from '../src/server';
import {whileReadWaits} from './read-transaction.test';
export async function reviewChecks(pool:Pool){
 const enterpriseId=randomUUID(),teamId=randomUUID(),other=randomUUID(),p=(subject:string,team=teamId):Principal=>({enterpriseId,teamId:team,subject});await pool.query('INSERT INTO enterprise_workflow.teams(enterprise_id,team_id)VALUES($1,$2),($1,$3)',[enterpriseId,teamId,other]);
 for(const [subject,permissions]of [['manager',['manage','request','dispatch','review']],['worker',['execute','review']],['peer',['review']],['replacement',['review']]] as const){await pool.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject)VALUES($1,$2)',[enterpriseId,subject]);for(const team of [teamId,other])await pool.query('INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds)VALUES($1,$2,$3,$4,\'["design"]\')',[enterpriseId,team,subject,JSON.stringify(permissions)]);}
 const files=new DeliveryStore(pool,resolveDatabaseActor,await mkdtemp(join(tmpdir(),'naumi-review-test-'))),wf=new WorkflowStore(pool,resolveDatabaseActor,files.validate),reviews=new ReviewStore(pool,resolveDatabaseActor,files.validate,true,()=>new Date(),files.reviewImage);
 const make=async(image=true)=>{let o=(await wf.execute(p('manager'),{commandId:randomUUID(),orderId:randomUUID(),expectedVersion:0,action:{type:'create',title:'评审测试',brief:'fixture',acceptance:'检查交付版本'}})).order;const taskId=randomUUID(),go=async(action:Action,who='manager')=>o=(await wf.execute(p(who),{commandId:randomUUID(),orderId:o.id,expectedVersion:o.version,action})).order;await go({type:'submit-requirement'});await go({type:'approve-requirement'});await go({type:'plan-tasks',tasks:[{id:taskId,title:'主图',kind:'design',points:3,dueAt:'2027-01-01T00:00:00Z',dependencyIds:[]}]});await go({type:'publish'});await go({type:'claim',taskId},'worker');await go({type:'start',taskId},'worker');const bytes=image?Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'):Buffer.from('non-image review file'),asset=(await files.upload(p('worker'),{assetId:randomUUID(),orderId:o.id,taskId,expectedVersion:o.version,name:'review.png'},[bytes])).asset;await go({type:'submit-delivery',taskId,assetIds:[asset.id],note:'待评审'},'worker');return {get o(){return o;},taskId,asset,go};};
 const a=await make(),b=await make(),checks=[{id:randomUUID(),label:'文案准确'},{id:randomUUID(),label:'版式清晰'}],open=(x=a,id=randomUUID())=>({commandId:randomUUID(),reviewId:id,expectedVersion:0,reason:'分派独立评审',action:{type:'open',orderId:x.o.id,taskId:x.taskId,expectedOrderVersion:x.o.version,reviewers:['manager','peer'],checks}}),command=open();
 await assert.rejects(reviews.execute(p('worker'),command),/REVIEW_INDEPENDENT_REQUIRED/);await assert.rejects(new ReviewStore(pool,resolveDatabaseActor,files.validate,false).read(p('manager'),{action:'context',orderId:a.o.id,taskId:a.taskId}),/REVIEWS_NOT_ENABLED/);await assert.rejects(reviews.execute(p('manager',other),command),/REVIEW_TASK_UNAVAILABLE/);await assert.rejects(reviews.execute(p('manager'),{...command,action:{...command.action,reviewers:['worker']}}),/REVIEW_PANEL_UNAVAILABLE/);
 let d=await reviews.execute(p('manager'),command);assert.deepEqual(d.review.submission.assets,[{id:a.asset.id,revision:a.asset.revision,sha256:a.asset.sha256,bytes:a.asset.bytes,name:a.asset.name}]);assert.equal((await reviews.execute(p('manager'),command)).replayed,true);await assert.rejects(reviews.execute(p('manager'),{...command,reason:'changed'}),/IDEMPOTENCY_CONFLICT/);await assert.rejects(reviews.execute(p('manager'),open()),/REVIEW_ALREADY_EXISTS/);
 const context={action:'context',orderId:a.o.id,taskId:a.taskId},manager=p('manager');
 const addDirectory=async(first:number,last:number)=>{
  await pool.query("INSERT INTO enterprise_workflow.accounts(enterprise_id,subject,enabled) SELECT $1,'candidate-'||n,n<>1 FROM generate_series($2::int,$3::int) n",[enterpriseId,first,last]);
  await pool.query(`INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds,expires_at) SELECT $1,$2,'candidate-'||n,'["review"]','[]',CASE WHEN n=2 THEN now()-interval '1 day' END FROM generate_series($3::int,$4::int) n`,[enterpriseId,teamId,first,last]);
 };
 await addDirectory(1,180);
 let legacyCalls=0,snapshotCalls=0,batches=0;
 const legacy=new ReviewStore(pool,(tx,who)=>{legacyCalls++;return resolveDatabaseActor(tx,who);},files.validate);
 const observed:ResolveActor=Object.assign(resolveDatabaseActor.bind(null),{readSnapshot:(tx:Parameters<ResolveActor>[0],who:Principal)=>{snapshotCalls++;return resolveDatabaseActor.readSnapshot!(tx,who);},readTeamMembers:(...args:Parameters<NonNullable<ResolveActor['readTeamMembers']>>)=>{batches++;return resolveDatabaseActor.readTeamMembers!(...args);}});
 const batched=new ReviewStore(pool,observed,files.validate),before=await legacy.read(manager,context),after=await batched.read(manager,context);
 assert.deepEqual(after,before);assert.equal(legacyCalls,185);assert.equal(snapshotCalls,2);assert.equal(batches,1);
 assert('candidates' in after&&after.candidates?.length===181&&!after.candidates.includes('worker')&&!after.candidates.includes('candidate-1')&&!after.candidates.includes('candidate-2'));
 await addDirectory(181,197);await assert.rejects(batched.read(manager,context),/REVIEW_PANEL_DIRECTORY_TOO_LARGE/);
 await pool.query("DELETE FROM enterprise_workflow.team_members WHERE enterprise_id=$1 AND subject LIKE 'candidate-%'",[enterpriseId]);
 const orderLock=()=>pool.query('SELECT id FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2 FOR UPDATE NOWAIT',[enterpriseId,a.o.id]);
 const blocked=await whileReadWaits(pool,'events',()=>legacy.read(manager,context),async()=>{await assert.rejects(orderLock(),{code:'55P03'});});
 const released=await whileReadWaits(pool,'events',()=>reviews.read(manager,context),async()=>{assert.equal((await orderLock()).rowCount,1);});
 assert.equal(blocked.status,'fulfilled');assert.deepEqual(released,blocked);
 const member=(enabled:boolean)=>pool.query("UPDATE enterprise_workflow.team_members SET enabled=$3 WHERE enterprise_id=$1 AND team_id=$2 AND subject='manager'",[enterpriseId,teamId,enabled]);
 const revoked=await whileReadWaits(pool,'events',()=>reviews.read(manager,context),async()=>{await member(false);});
 assert.equal(revoked.status,'rejected');assert.equal(revoked.reason.code,'MEMBERSHIP_REQUIRED');await member(true);
 const moved=await whileReadWaits(pool,'events',()=>reviews.read(manager,context),async()=>{
  await pool.query("UPDATE enterprise_workflow.orders SET document=jsonb_set(document,'{teamId}',to_jsonb($3::text)) WHERE enterprise_id=$1 AND id=$2",[enterpriseId,a.o.id,other]);
 });
 assert.equal(moved.status,'rejected');assert.equal(moved.reason.code,'REVIEW_TASK_UNAVAILABLE');
 await pool.query('UPDATE enterprise_workflow.orders SET document=$3 WHERE enterprise_id=$1 AND id=$2',[enterpriseId,a.o.id,a.o]);
 const guard=await pool.connect();try{
  await guard.query('BEGIN');await guard.query('LOCK TABLE enterprise_workflow.events IN ACCESS EXCLUSIVE MODE');
  const history=await reviews.read(manager,{action:'history',id:d.review.id,page:1});assert('events' in history&&history.events?.length===1);
  const empty=await reviews.read(manager,{action:'history',id:d.review.id,page:100});assert('events' in empty&&empty.events?.length===0&&empty.total===1);
 }finally{await guard.query('ROLLBACK');guard.release();}
 const http=createWorkflowServer(wf,async()=>manager);http.listen(0,'127.0.0.1');await once(http,'listening');try{
  const address=http.address();assert(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}/v1/delivery-reviews?action=context&orderId=${a.o.id}&taskId=${a.taskId}`;
  const abort=new AbortController(),stopped=await whileReadWaits(pool,'events',()=>fetch(url,{signal:abort.signal}),async()=>{
   abort.abort();for(let i=0;i<50&&pool.totalCount-pool.idleCount>1;i++)await delay(10);
   assert.equal(pool.totalCount-pool.idleCount,1,'disconnected review must release the slot before the blocker clears');
  });
  assert.equal(stopped.status,'rejected');assert.equal(stopped.reason.name,'AbortError');const retry=await fetch(url);assert.equal(retry.status,200);assert.deepEqual((await retry.json() as {candidates:string[]}).candidates,['manager','peer','replacement']);
 }finally{http.closeAllConnections();await new Promise<void>(resolve=>http.close(()=>resolve()));}
 console.log('DELIVERY_REVIEW_READ_PASS: legacy_actor_lookups=185 first_and_final_snapshot=2 directory_batch=1 cap_unchanged=1 read_releases_order_lock=1 member_revoke_and_team_move_denied=2 history_without_submission_lookup=1 http_abort_releases_slot=1');
 const original=JSON.stringify(a.o);const accept=()=>a.go({type:'accept-delivery',taskId:a.taskId,quality:4,note:'独立验收'});await assert.rejects(accept(),/REVIEW_NOT_APPROVED/);
 const mutate=async(action:unknown,who='manager')=>{d=await reviews.execute(p(who),{commandId:randomUUID(),reviewId:d.review.id,expectedVersion:d.review.version,reason:'明确处理原因',action});return d;},verdict={type:'verdict',verdict:'approve',checks:checks.map(x=>({id:x.id,result:'pass',note:''}))};
 await assert.rejects(mutate({...verdict,checks:[verdict.checks[0],verdict.checks[0]]}),/REVIEW_CHECKS_MISMATCH/);await assert.rejects(mutate({...verdict,checks:verdict.checks.map(x=>({...x,result:'na'}))}),/REVIEW_CHECK_NOTE_REQUIRED/);
 await mutate(verdict);await assert.rejects(accept(),/REVIEW_NOT_APPROVED/);const issueId=randomUUID();await mutate({type:'issue',issueId,assetId:a.asset.id,text:'标题间距需要调整',point:{x:0,y:1}},'peer');assert.equal(d.review.decisions.length,0);await assert.rejects(mutate(verdict),/REVIEW_OPEN_ISSUES/);await assert.rejects(mutate({type:'issue',issueId:randomUUID(),assetId:b.asset.id,text:'bad reference',point:null}),/REVIEW_ASSET_MISMATCH/);await assert.rejects(mutate({type:'issue',issueId:randomUUID(),assetId:a.asset.id,text:'bad point',point:{x:1.01,y:0}}));
 await mutate({type:'reply',issueId,text:'已核对问题位置'},'worker');await assert.rejects(mutate({type:'resolve',issueId,resolved:true},'worker'),/REVIEW_ASSIGNED_REQUIRED/);await mutate({type:'resolve',issueId,resolved:true},'peer');await mutate(verdict);await mutate(verdict,'peer');assert.equal(d.ready,true);assert.equal(JSON.stringify(await wf.get(p('manager'),a.o.id)),original);
 await pool.query("UPDATE enterprise_workflow.team_members SET enabled=false WHERE enterprise_id=$1 AND team_id=$2 AND subject='peer'",[enterpriseId,teamId]);await assert.rejects(accept(),/REVIEW_PANEL_UNAVAILABLE/);await mutate({type:'panel',reviewers:['manager','replacement']});assert.equal(d.review.decisions.length,0);await assert.rejects(reviews.execute(p('peer'),command),/MEMBERSHIP_REQUIRED/);await pool.query("UPDATE enterprise_workflow.team_members SET enabled=true WHERE enterprise_id=$1 AND subject='peer'",[enterpriseId]);await mutate(verdict);await mutate(verdict,'replacement');
 const oldId=d.review.id;await a.go({type:'request-rework',taskId:a.taskId,reason:'修改交付'});await a.go({type:'start',taskId:a.taskId},'worker');await a.go({type:'submit-delivery',taskId:a.taskId,assetIds:[a.asset.id],note:'同文件明确重提'},'worker');await assert.rejects(mutate(verdict),/REVIEW_SUBMISSION_NOT_CURRENT/);await assert.rejects(accept(),/REVIEW_REQUIRED/);d=await reviews.execute(p('manager'),open());assert.notEqual(d.review.submission.id,(await reviews.read(p('manager'),{action:'detail',id:oldId}) as any).review.submission.id);await mutate(verdict);await mutate(verdict,'peer');await accept();assert.equal((await wf.facts(p('manager'))).total,1);await assert.rejects(mutate(verdict),/REVIEW_SUBMISSION_NOT_CURRENT/);
 // Same review ID racing across unrelated orders cannot change its immutable ownership.
 const c=await make(),shared=randomUUID(),race=await Promise.allSettled([reviews.execute(p('manager'),open(b,shared)),reviews.execute(p('manager'),open(c,shared))]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
 const otherOpen=open(race[0].status==='fulfilled'?c:b);await pool.query("CREATE FUNCTION enterprise_workflow.fail_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'review audit failure'; END $$;CREATE TRIGGER fail_review BEFORE INSERT ON enterprise_workflow.delivery_review_revisions FOR EACH ROW EXECUTE FUNCTION enterprise_workflow.fail_review()");await assert.rejects(reviews.execute(p('manager'),otherOpen),/review audit failure/);assert.equal((await pool.query('SELECT 1 FROM enterprise_workflow.delivery_reviews WHERE enterprise_id=$1 AND id=$2',[enterpriseId,otherOpen.reviewId])).rowCount,0);assert.equal((await pool.query('SELECT 1 FROM enterprise_workflow.delivery_review_commands WHERE enterprise_id=$1 AND id=$2',[enterpriseId,otherOpen.commandId])).rowCount,0);await pool.query('DROP TRIGGER fail_review ON enterprise_workflow.delivery_review_revisions;DROP FUNCTION enterprise_workflow.fail_review()');d=await reviews.execute(p('manager'),otherOpen);
 const sameVersion=d.review.version,body=(note:string)=>({commandId:randomUUID(),reviewId:d.review.id,expectedVersion:sameVersion,reason:note,action:verdict}),cas=await Promise.allSettled([reviews.execute(p('manager'),body('first')),reviews.execute(p('peer'),body('second'))]);assert.equal(cas.filter(x=>x.status==='fulfilled').length,1);d=await reviews.read(p('manager'),{action:'detail',id:d.review.id}) as unknown as typeof d;for(let i=0;i<30;i++)await mutate(verdict);assert.equal((await reviews.read(p('manager'),{action:'history',id:d.review.id,page:1}) as any).events.length,30);assert.equal((await reviews.read(p('manager'),{action:'history',id:d.review.id,page:2}) as any).events.length,2);
 await assert.rejects(reviews.read({...p('manager'),enterpriseId:randomUUID()},{action:'detail',id:d.review.id}),/MEMBERSHIP_REQUIRED/);await assert.rejects(reviews.read(p('manager',other),{action:'detail',id:d.review.id}),/REVIEW_TASK_UNAVAILABLE/);

 const issue2=randomUUID(),active=d.review.orderId===b.o.id?b:c;await mutate({type:'issue',issueId:issue2,assetId:active.asset.id,text:'补充检查问题',point:null});await mutate({type:'resolve',issueId:issue2,resolved:true});await mutate(verdict);await mutate(verdict,'peer');assert(d.ready);await mutate({type:'resolve',issueId:issue2,resolved:false});assert.equal(d.review.decisions.length,0);await mutate({...verdict,verdict:'changes',checks:checks.map(x=>({id:x.id,result:'fail',note:'需要返工'}))});assert.equal(d.ready,false);await assert.rejects(mutate({...verdict,checks:checks.map(x=>({id:x.id,result:'fail',note:'未完成'}))}),/REVIEW_CHECK_FAILED/);await active.go({type:'cancel',reason:'业务取消'});await assert.rejects(mutate({type:'reply',issueId:issue2,text:'迟到回复'},'worker'),/REVIEW_SUBMISSION_NOT_CURRENT/);assert.equal((await reviews.read(p('worker'),{action:'detail',id:d.review.id}) as any).current,false);
 // Prove frozen source event and history are untouched by an unrelated disabled instance's attempted acceptance.
 assert.equal((await reviews.read(p('manager'),{action:'context',orderId:a.o.id,taskId:a.taskId,page:2}) as any).items.length,0);

 const nonImage=await make(false);d=await reviews.execute(p('manager'),open(nonImage));await assert.rejects(mutate({type:'issue',issueId:randomUUID(),assetId:nonImage.asset.id,text:'not an image',point:{x:0.5,y:0.5}}),/REVIEW_IMAGE_REQUIRED/);await mutate({type:'issue',issueId:randomUUID(),assetId:nonImage.asset.id,text:'整文件意见',point:null});
 console.log('REVIEW_SERVICE_PASS: immutable_submission=1 real_image_point=1 independent_panel=1 checks=1 issue_reply_resolve=1 decisions_invalidated=1 revoked_reviewer=1 replacement=1 same_asset_resubmission=1 acceptance_gate=1 original_order_unchanged=1 facts_once=1 audit_atomic=1 replay=1 cas=1 ownership_race=1 history32=1 tenant_team_scope=1 reopen_invalidates=1 fail_verdict=1 cancelled_readonly=1 nonimage_point415=1');
}
