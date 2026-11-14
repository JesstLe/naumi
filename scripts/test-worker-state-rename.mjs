import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {renameWorkerState,WorkerRuntime} from './worker-runtime.mjs';

test('Windows atomic state replacement retries the same file without deletion or task I/O',async()=>{
 const calls=[],waits=[];
 await renameWorkerState('synced.tmp','original.json',{platform:'win32',rename:async(...args)=>{calls.push(args);if(calls.length<3)throw Object.assign(Error('sharing violation'),{code:calls.length===1?'EPERM':'EACCES'});},wait:async ms=>{waits.push(ms);}});
 assert.deepEqual(calls,[['synced.tmp','original.json'],['synced.tmp','original.json'],['synced.tmp','original.json']]);assert.deepEqual(waits,[10,20]);
});
test('Windows permanent denial exhausts a bounded 710ms schedule and retains the original error',async()=>{
 let calls=0;const waits=[],error=Object.assign(Error('still denied'),{code:'EBUSY'});
 await assert.rejects(()=>renameWorkerState('synced.tmp','original.json',{platform:'win32',rename:async()=>{calls++;throw error;},wait:async ms=>{waits.push(ms);}}),e=>e===error);
 assert.equal(calls,8);assert.deepEqual(waits,[10,20,40,80,160,200,200]);assert.equal(waits.reduce((a,b)=>a+b,0),710);
});
test('non-Windows denial is not retried',async()=>{
 let calls=0,waits=0;await assert.rejects(()=>renameWorkerState('a','b',{platform:'linux',rename:async()=>{calls++;throw Object.assign(Error('denied'),{code:'EPERM'});},wait:async()=>{waits++;}}),{code:'EPERM'});assert.equal(calls,1);assert.equal(waits,0);
});
test('disk-full and missing-source errors are not retried even on Windows',async()=>{
 for(const code of ['ENOSPC','ENOENT','EINVAL']){let calls=0,waits=0;await assert.rejects(()=>renameWorkerState('a','b',{platform:'win32',rename:async()=>{calls++;throw Object.assign(Error(code),{code});},wait:async()=>{waits++;}}),{code});assert.equal(calls,1);assert.equal(waits,0);}
});
test('exhausted local-state retries keep worker faulted and never submit or repeat a task',async()=>{
 let fail=false,renames=0,network=0;
 const worker=new WorkerRuntime({origin:'http://fixture.invalid',secret:'fixture-state-rename-0123456789abcdef0123456789',instanceId:'fixture-scanner',targetInstanceId:'fixture-target',commit:'c'.repeat(40),startPaused:true,fetchImpl:async()=>{network++;throw Error('unexpected I/O');},store:{read:async()=>null,write:async()=>{if(fail)await renameWorkerState('a','b',{platform:'win32',rename:async()=>{renames++;throw Object.assign(Error('denied'),{code:'EPERM'});},wait:async()=>{}});}}});
 await worker.init();fail=true;await assert.rejects(()=>worker.control({action:'resume',bootId:worker.bootId,operationId:randomUUID(),expectedRevision:0}),{code:'EPERM'});assert.equal(worker.snapshot().controlFault,'WORKER_STATE_WRITE_FAILED');assert.equal(worker.snapshot().paused,true);assert.equal(renames,8);await assert.rejects(()=>worker.control({action:'resume',bootId:worker.bootId,operationId:randomUUID(),expectedRevision:worker.state.revision}),/WORKER_CONTROL_FAULT/);assert.equal(network,0);assert.equal(renames,8);
});
