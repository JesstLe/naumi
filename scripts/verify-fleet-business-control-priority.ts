import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import type {Pool} from 'pg';
import {canonical,verifyCommand} from '../src/lib/fleet/contracts';

type Instance={id:string;token:string};
type Tick={code:number;stdout:string;stderr:string};
export type WithheldAck={commandId:string;leaseId:string;result:unknown};
type Fixture={central:Pool;source:Pool;origin:string;tick:(instance:Instance)=>Promise<Tick>;
  dropAck:(id:string)=>void;withheldAck:()=>WithheldAck|null};

/** Real isolated PG + authenticated HTTP + separate connector processes.
 * Lease expiry is advanced only in the disposable central fixture, never by
 * sleeping or changing production clocks. Credit dispatch is signed but not
 * applied; actual user mutations below are fixture-only ban operations. */
export async function verifyFleetBusinessControlPriority(f:Fixture){
  assert.equal(new URL(f.origin).hostname,'127.0.0.1');assert.equal(new URL(f.origin).protocol,'http:');
  const service=await import('../src/lib/fleet/server');
  const failures:string[]=[],scenarios:Record<string,unknown>[]=[];let checks=0;
  const check=(value:unknown,name:string)=>{checks++;if(!value)failures.push(name);};
  const freshnessFailures:string[]=[];let freshnessChecks=0;
  const freshCheck=(value:unknown,name:string)=>{freshnessChecks++;if(!value)freshnessFailures.push(name);};
  const readAt=(asOf=new Date().toISOString())=>({type:'business.query' as const,view:'usage' as const,days:30 as const,asOf,page:1,search:''});
  const row=async(id:string)=>(await f.central.query('SELECT state,result,lease_id,leased_until,operation,fingerprint FROM app_fleet_commands WHERE id=$1',[id])).rows[0];
  const user=async(email:string)=>(await f.source.query('SELECT to_jsonb(u) value FROM app_users u WHERE email=$1',[email])).rows[0].value;
  const setup=async(name:string)=>{
    const instance=await service.createInstance('root','Priority '+name,'enterprise'),email='priority-'+name+'@fixture.test';
    await f.source.query('INSERT INTO app_users(email,name) VALUES($1,$2)',[email,'Priority '+name]);return{instance,email};
  };
  const ban=(email:string,banned:boolean)=>({type:'users.ban' as const,email,banned,expectedBanned:!banned});
  // The enclosing protocol verifier deliberately replaces global fetch for its
  // local-status tests. Native loopback HTTP keeps that guard intact.
  const exchange=(instance:Instance,ack:boolean,input:Record<string,unknown>)=>new Promise<{status:number;body:any}>((resolve,reject)=>{
    const request=httpRequest(f.origin+'/api/fleet/'+(ack?'ack':'poll'),{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+instance.token,'x-naumi-instance':instance.id}},response=>{
      let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('error',reject);
      response.on('end',()=>{try{resolve({status:response.statusCode??0,body:JSON.parse(body)});}catch(error){reject(error);}});
    });
    request.on('error',reject);request.setTimeout(10000,()=>request.destroy(new Error('fixture HTTP timeout')));
    request.end(JSON.stringify({...input,nonce:randomUUID(),timestamp:Date.now()}));
  });
  const tickId=(value:Tick)=>value.code===0?JSON.parse(value.stdout).commandId:undefined;
  const shiftedClock=async<T,>(milliseconds:number,work:()=>Promise<T>)=>{
    const original=Date.now;
    try{Date.now=()=>original()+milliseconds;return await work();}
    finally{Date.now=original;}
  };

  // Two equally old reads prove the id tie-breaker as well as the read FIFO.
  {
    const {instance,email}=await setup('queued'),reads=[randomUUID(),randomUUID()].sort(),control=randomUUID();
    for(const id of reads)await service.enqueueCommand('root',instance.id,id,readAt());
    await service.enqueueCommand('root',instance.id,control,ban(email,true));
    await f.central.query("UPDATE app_fleet_commands SET created_at=CASE WHEN id=$1 THEN now()-interval '1 minute' ELSE now()-interval '2 minutes' END WHERE id=ANY($2::uuid[])",[control,[...reads,control]]);
    const first=await f.tick(instance),firstState=await row(control),firstUser=await user(email);
    check(tickId(first)===control&&firstState.state==='succeeded','queued reads never precede a later ban');
    check(firstUser.banned===true,'ban applies before the older read backlog');
    const rest=[await f.tick(instance),await f.tick(instance)],order=[first,...rest].map(tickId);
    check(JSON.stringify(order.filter(id=>reads.includes(id)))===JSON.stringify(reads),'reads preserve created_at,id order after control dispatch');
    check((await row(reads[0])).state==='failed'&&(await row(reads[1])).state==='failed','real missing-data read ACKs still finish both reads');
    scenarios.push({name:'queued-read-backlog',controlFirst:order[0]===control,readFIFO:order.filter(id=>reads.includes(id)),banBeforeReads:firstUser.banned});
  }

  // Keep a real lost read ACK and active lease; a ban must not wait five minutes.
  {
    const {instance,email}=await setup('leased-read'),readId=randomUUID(),control=randomUUID();
    await service.enqueueCommand('root',instance.id,readId,readAt());f.dropAck(readId);
    const lost=await f.tick(instance),ack=f.withheldAck();assert.ok(ack&&ack.commandId===readId);
    const leased=await row(readId);check(lost.code===1&&leased.state==='leased'&&new Date(leased.leased_until).getTime()>Date.now(),'real read lost ACK retains a future five-minute lease');
    await service.enqueueCommand('root',instance.id,control,ban(email,true));
    const next=await f.tick(instance),after=await row(readId),controlState=await row(control);
    check(tickId(next)===control&&controlState.state==='succeeded'&&(await user(email)).banned===true,'active leased read does not block a later ban');
    check(after.state==='leased'&&after.lease_id===leased.lease_id&&+new Date(after.leased_until)===+new Date(leased.leased_until),'dispatching control does not revoke or re-lease the existing read');
    const wrong=await exchange(instance,true,{...ack,leaseId:randomUUID()});
    check(wrong.status===409&&(await row(readId)).state==='leased','late read ACK still requires the matching lease');
    const late=await exchange(instance,true,ack),finished=await row(readId);
    check(late.status===200&&late.body.ok===true&&canonical(finished.result)===canonical(ack.result),'original read late ACK remains accepted after the control');
    const repeated=await exchange(instance,true,ack),again=await row(readId);
    check(repeated.status===200&&JSON.stringify(again)===JSON.stringify(finished),'duplicate late ACK preserves the first terminal result');
    const conflict=await exchange(instance,true,{...ack,result:{status:'failed',code:'DENIED'}});
    check(conflict.status===409&&JSON.stringify((await row(readId)).result)===JSON.stringify(finished.result),'terminal read ACK conflict still rejects');
    if(controlState.state==='queued')await f.tick(instance); // Baseline cleanup, after recording the counterexample.
    scenarios.push({name:'active-read-lost-ack',lostAckExit:lost.code,banBeforeReadAck:controlState.state==='succeeded',readLeasePreserved:after.lease_id===leased.lease_id,wrongLeaseStatus:wrong.status,lateAckStatus:late.status,repeatStatus:repeated.status,conflictStatus:conflict.status});
  }

  // Active control leases remain FIFO: never skip a control to dispatch another.
  {
    const {instance,email}=await setup('leased-control'),firstId=randomUUID(),secondId=randomUUID(),readId=randomUUID();
    await service.enqueueCommand('root',instance.id,firstId,ban(email,true));f.dropAck(firstId);
    const lost=await f.tick(instance),before=await user(email),leased=await row(firstId);
    await service.enqueueCommand('root',instance.id,readId,readAt());
    await service.enqueueCommand('root',instance.id,secondId,ban(email,false));
    await f.central.query("UPDATE app_fleet_commands SET created_at=CASE WHEN id=$1 THEN now()-interval '3 minutes' WHEN id=$2 THEN now()-interval '2 minutes' ELSE now()-interval '1 minute' END WHERE id=ANY($3::uuid[])",[firstId,readId,[firstId,readId,secondId]]);
    const waiting=await f.tick(instance);
    check(lost.code===1&&leased.state==='leased'&&before.banned===true,'first control executes once despite its real lost ACK');
    check(waiting.code===0&&JSON.parse(waiting.stdout).state==='idle'&&(await row(secondId)).state==='queued'&&(await row(readId)).state==='queued','active control lease still blocks later controls and reads');
    check(JSON.stringify(await user(email))===JSON.stringify(before),'waiting behind an active control performs no second source mutation');
    await f.central.query("UPDATE app_fleet_commands SET leased_until=now()-interval '1 second' WHERE id=$1",[firstId]);
    const replay=await f.tick(instance);
    check(tickId(replay)===firstId&&(await row(firstId)).state==='succeeded','expired control lease replays the same command first');
    check(JSON.stringify(await user(email))===JSON.stringify(before),'control lost-ACK replay keeps the complete source user row byte-equivalent');
    const second=await f.tick(instance);check(tickId(second)===secondId&&(await user(email)).banned===false,'second control retains control FIFO ahead of the intermediate read');
    await f.tick(instance); // Drain the remaining read or baseline control.
    scenarios.push({name:'active-control-fifo',lostAckExit:lost.code,waiting:JSON.parse(waiting.stdout).state,replayedOriginal:tickId(replay)===firstId,secondControlBeforeRead:tickId(second)===secondId});
  }

  // Priority must not bypass dispatch-time delegated authorization.
  {
    const {instance,email}=await setup('revoked'),operator='priority-operator@fixture.test',authority={actor:operator,root:false},control=randomUUID(),readId=randomUUID();
    await f.central.query('INSERT INTO app_users(email,name) VALUES($1,$2)',[operator,'Priority operator']);
    await service.saveGrant('root',{instanceId:instance.id,email:operator,allowed:['read','users','business'],expectedVersion:0,expiresAt:null});
    await service.enqueueCommand(operator,instance.id,control,ban(email,true),authority);
    await service.enqueueCommand(operator,instance.id,readId,readAt(),authority);
    await f.central.query("UPDATE app_fleet_commands SET created_at=now()-interval '1 minute' WHERE id=$1",[control]);
    await service.saveGrant('root',{instanceId:instance.id,email:operator,allowed:['read','business'],expectedVersion:1,expiresAt:null});
    const before=await user(email),denied=await f.tick(instance),controlState=await row(control);
    check(denied.code===0&&JSON.parse(denied.stdout).state==='idle'&&controlState.state==='failed'&&controlState.result.code==='DENIED','control priority still rechecks a revoked users grant before dispatch');
    check(JSON.stringify(await user(email))===JSON.stringify(before),'revoked control changes no source account fields');
    const next=await f.tick(instance);check(tickId(next)===readId,'authorized business read remains eligible after denied control');
    scenarios.push({name:'dispatch-revocation',state:controlState.state,code:controlState.result.code,readStillEligible:tickId(next)===readId});
  }

  // Credits use the same priority class, without executing a credit adjustment.
  {
    const {instance,email}=await setup('credits'),readId=randomUUID(),creditId=randomUUID();
    await service.enqueueCommand('root',instance.id,readId,readAt());
    await service.enqueueCommand('root',instance.id,creditId,{type:'credits.adjust',email,delta:1,reason:'isolated dispatch verification'});
    await f.central.query("UPDATE app_fleet_commands SET created_at=now()-interval '1 minute' WHERE id=$1",[readId]);
    const before=await user(email),response=await exchange(instance,false,{status:{source:'a'.repeat(40),version:'1',storage:'s3',nas:'unknown',connector:1,business:1}});
    assert.equal(response.status,200);assert.ok(response.body.command);
    const command=verifyCommand(response.body.command,instance.token,instance.id);
    check(command.id===creditId&&command.operation.type==='credits.adjust','signed credit control dispatches ahead of an older read');
    check((await row(readId)).state==='queued','credit selection does not lease the older read');
    check(JSON.stringify(await user(email))===JSON.stringify(before),'credit dispatch-only verification applies no source account mutation');
    scenarios.push({name:'credits-dispatch-only',creditFirst:command.id===creditId,signed:true,creditApply:0});
  }
  // asOf, not created_at, is the read's durable admission deadline.
  {
    const {instance}=await setup('expired-queued'),stale=randomUUID(),fresh=randomUUID();
    await service.enqueueCommand('root',instance.id,stale,readAt(new Date(Date.now()-120000).toISOString()));
    await service.enqueueCommand('root',instance.id,fresh,readAt(new Date().toISOString()));
    await f.central.query("UPDATE app_fleet_commands SET created_at=now()-interval '1 minute' WHERE id=$1",[stale]);
    const before=await row(stale),first=await f.tick(instance),after=await row(stale);
    freshCheck(tickId(first)===fresh,'expired queued read is bypassed for a fresh query');
    freshCheck(canonical(before)===canonical(after),'excluded queued read retains its original state/operation/fingerprint/lease');
    const next=await f.tick(instance);
    freshCheck(next.code===0&&JSON.parse(next.stdout).state==='idle'&&canonical(await row(stale))===canonical(before),'expired queued read is not dispatched on a later poll either');
    scenarios.push({name:'expired-queued-read',freshFirst:tickId(first)===fresh,staleUnchanged:canonical(before)===canonical(after),followingState:next.code===0?JSON.parse(next.stdout).state:'error'});
  }
  {
    const {instance,email}=await setup('fresh-old-created'),fresh=randomUUID(),control=randomUUID();
    await service.enqueueCommand('root',instance.id,fresh,readAt(new Date().toISOString()));
    await f.central.query("UPDATE app_fleet_commands SET created_at='2000-01-01T00:00:00Z' WHERE id=$1",[fresh]);
    freshCheck(tickId(await f.tick(instance))===fresh,'fresh asOf remains eligible even with an ancient created_at');
    await service.enqueueCommand('root',instance.id,control,ban(email,true));
    await f.central.query("UPDATE app_fleet_commands SET created_at='2000-01-01T00:00:00Z' WHERE id=$1",[control]);
    freshCheck(tickId(await f.tick(instance))===control&&(await user(email)).banned===true,'non-business control has no new age cutoff');
  }
  // Execute while fresh, genuinely lose its ACK, then advance only this fixture
  // process's clock 45s. The stored operation and real source receipt never change.
  {
    const {instance}=await setup('expired-leased'),stale=randomUUID(),fresh=randomUUID();
    await service.enqueueCommand('root',instance.id,stale,readAt(new Date(Date.now()-60000).toISOString()));
    f.dropAck(stale);const lost=await f.tick(instance),ack=f.withheldAck();assert.ok(ack&&ack.commandId===stale);
    const original=await row(stale);freshCheck(lost.code===1&&original.state==='leased','fresh read execution really loses its ACK before expiry');
    await shiftedClock(45000,async()=>{
      assert.ok(Date.now()-Date.parse(original.operation.asOf)>90000&&+new Date(original.leased_until)>Date.now());
      await service.enqueueCommand('root',instance.id,fresh,readAt(new Date().toISOString()));
      const status={source:'a'.repeat(40),version:'1',storage:'s3',nas:'unknown',connector:1,business:1};
      const first=await exchange(instance,false,{status});
      const firstId=first.body.command?verifyCommand(first.body.command,instance.token,instance.id).id:null;
      freshCheck(first.status===200&&firstId===fresh,'expired active read lease does not hold a new business query');
      freshCheck(canonical(await row(stale))===canonical(original),'bypassing an expired active read preserves its complete row');
      await f.central.query("UPDATE app_fleet_commands SET leased_until=now()-interval '1 second' WHERE id=$1",[stale]);
      const expired=await row(stale),second=await exchange(instance,false,{status});
      const secondId=second.body.command?verifyCommand(second.body.command,instance.token,instance.id).id:null;
      freshCheck(second.status===200&&secondId!==stale,'expired business read is not redispatched when its lease also expires');
      freshCheck(canonical(await row(stale))===canonical(expired),'ignored expired lease keeps original lease id, operation, fingerprint and state');
      const wrong=await exchange(instance,true,{...ack,leaseId:randomUUID()});
      freshCheck(wrong.status===409,'expired read ACK still rejects a wrong lease');
      const late=await exchange(instance,true,ack),finished=await row(stale);
      freshCheck(late.status===200&&late.body.ok===true&&canonical(finished.result)===canonical(ack.result),'matching original late ACK is accepted after query and lease expiry');
      const repeated=await exchange(instance,true,ack);
      freshCheck(repeated.status===200&&canonical(await row(stale))===canonical(finished),'expired read duplicate late ACK remains idempotent');
      scenarios.push({name:'expired-leased-read',lostAckExit:lost.code,clockAdvanceMs:45000,freshDispatched:firstId===fresh,staleRedispatched:secondId===stale,wrongLeaseStatus:wrong.status,lateAckStatus:late.status,duplicateStatus:repeated.status});
    });
  }
  // The public central waiting boundary and dispatch use one 90-second policy.
  {
    const {instance,email}=await setup('central-deadline');
    await exchange(instance,false,{status:{source:'a'.repeat(40),version:'1',storage:'s3',nas:'unknown',connector:1,business:1}});
    const {startFleetBusinessQuery,pollFleetBusinessQuery}=await import('../src/lib/fleet/business-central');
    const actor={actor:'root',root:true},now=Date.now(),beforeUser=await user(email);
    const started=await startFleetBusinessQuery(actor,{site:instance.id,view:'usage',days:30,page:1,search:'',refresh:true},now);
    const commandId=started.sources[0].commandId!;const before=await row(commandId);
    freshCheck(started.sources[0].status==='pending','public central starts a fresh pending read');
    const beforeDeadline=await pollFleetBusinessQuery(actor,started.requestId,now+89999);
    const atDeadline=await pollFleetBusinessQuery(actor,started.requestId,now+90000);
    const afterDeadline=await pollFleetBusinessQuery(actor,started.requestId,now+90001);
    freshCheck(beforeDeadline.sources[0].status==='pending','read remains pending immediately before 90 seconds');
    freshCheck(atDeadline.sources[0].status==='unknown'&&!atDeadline.sources[0].data,'exactly 90 seconds is UNKNOWN, not pending or fabricated failure');
    freshCheck(afterDeadline.sources[0].status==='unknown'&&!afterDeadline.sources[0].data,'expired central query remains UNKNOWN, never zero data');
    freshCheck(canonical(await row(commandId))===canonical(before),'central expiry never rewrites the durable queued command');
    freshCheck(canonical(await user(email))===canonical(beforeUser),'central deadline checks write no source account fields');
    await assert.rejects(()=>service.enqueueCommand('root',instance.id,randomUUID(),readAt("'; DROP TABLE app_users; --")));freshnessChecks++;
    scenarios.push({name:'central-90s-boundary',before:beforeDeadline.sources[0].status,at:atDeadline.sources[0].status,after:afterDeadline.sources[0].status});
  }
  {
    const {instance,email}=await setup('probe-status');
    const warm=await f.tick(instance);
    check(warm.code===0&&JSON.parse(warm.stdout).state==='idle','capability probe fixture completes its initial signed negotiation');
    const status=async()=>(await f.central.query('SELECT status FROM app_fleet_instances WHERE id=$1',[instance.id])).rows[0].status;
    check((await status()).business===1,'initial confirmed business poll persists capability');
    const controlId=randomUUID();await service.enqueueCommand('root',instance.id,controlId,ban(email,true));
    const control=await f.tick(instance);
    check(tickId(control)===controlId&&(await user(email)).banned===true,'first legacy probe still executes the signed fixture control');
    check((await status()).business===1,'control-first compatibility probe preserves prior confirmed capability');
    const {startFleetBusinessQuery}=await import('../src/lib/fleet/business-central');
    const view=await startFleetBusinessQuery({actor:'root',root:true},{site:instance.id,view:'usage',days:30,refresh:true});
    check(view.sources[0].status==='pending','actual business central does not misreport the updated connector as unsupported');
    const readId=view.sources[0].commandId;
    const legacy=await exchange(instance,false,{status:{source:'a'.repeat(40),version:'1',storage:'s3',nas:'unknown',connector:1}});
    check(legacy.status===200&&(await status()).business===undefined,'a real legacy heartbeat without probe intent clears obsolete capability');
    check(legacy.body.command===null&&readId&&(await row(readId)).state==='queued','stored capability never enables business dispatch on a legacy wire poll');
    scenarios.push({name:'probe-status-control',controlId,controlFirst:true,capabilityPreserved:true,centralView:view.sources[0].status,legacyDowngradeClears:true});
  }
  for(const scenario of scenarios)console.log('FLEET_CONTROL_PRIORITY_SCENARIO='+JSON.stringify(scenario));
  console.log(`FLEET_CONTROL_PRIORITY=${failures.length?'REPRODUCED':'PASS'} assertions=${checks} failures=${failures.length} REAL_PG=2 REAL_HTTP=1 PAID_CALLS=0 CREDITS_APPLY=0`);
  console.log(`FLEET_BUSINESS_FRESHNESS=${freshnessFailures.length?'REPRODUCED':'PASS'} assertions=${freshnessChecks} failures=${freshnessFailures.length} REAL_PG=2 REAL_HTTP=1 CLOCK_ADVANCE_MS=45000 STATE_REWRITES=0`);
  assert.deepEqual(failures,[],'control-priority regression matrix');assert.deepEqual(freshnessFailures,[],'business-read freshness regression matrix');return checks+freshnessChecks;
}
