import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

async function main(){
const route=await readFile('src/app/api/video/worker/tick/route.ts','utf8');
assert.ok(!/await recoverMediaMirrors\(/.test(route),'P0: a slow media mirror still blocks the generation tick');
const scan=await readFile('src/lib/worker/scan.ts','utf8');
assert.ok(scan.includes('scheduleMediaRecovery()')&&!/await recoverMedia(?:Mirrors|Jobs)\(/.test(scan),'the actual shared scan must admit detached media lanes');
const {createMediaRecoveryScheduler}=await import('../src/lib/worker/media-recovery');
const gate=()=>{let resolve!:(value:number)=>void;return {promise:new Promise<number>(r=>resolve=r),resolve:(n:number)=>resolve(n)};};
const mirrors=gate(),jobs=gate();let mirrorRuns=0,jobRuns=0,allow=true,registrations=0,leases=0;
const tasks:Promise<unknown>[]=[];
const schedule=createMediaRecoveryScheduler({
 detach:async(_scope,_key,_admission,action)=>{registrations++;if(!allow)return false;leases++;tasks.push(action().finally(()=>leases--));return true;},
 mirrors:async()=>{mirrorRuns++;return mirrors.promise;},jobs:async()=>{jobRuns++;return jobs.promise;},
});
let status=await schedule();
assert.equal(mirrorRuns,1);assert.equal(jobRuns,1);assert.equal(leases,2);
assert.equal(status.mirrors.state,'running');assert.equal(status.jobs.state,'running');
for(let i=0;i<20;i++)await schedule();
assert.equal(registrations,2,'one active durable registration per lane');
assert.equal(mirrorRuns,1);assert.equal(jobRuns,1);
jobs.resolve(4);await tasks[1];status=await schedule.status();
assert.equal(status.jobs.lastProcessed,4);assert.equal(status.mirrors.state,'running');
assert.equal(leases,1,'unfinished mirror lease is not hidden by tick completion');
mirrors.resolve(2);await tasks[0];assert.equal(leases,0);
allow=false;status=await schedule();assert.equal(status.mirrors.state,'draining');assert.equal(mirrorRuns,1);
let fail=true;
const recovering=createMediaRecoveryScheduler({
 detach:async(_s,_k,_a,action)=>{tasks.push(action());return true;},
 mirrors:async()=>{if(fail)throw Object.assign(new Error('secret must not leak'),{code:'ETIMEDOUT'});return 1;},jobs:async()=>0,
});
await recovering();await Promise.allSettled(tasks);
assert.equal(recovering.status().mirrors.state,'failed');
assert.equal(recovering.status().mirrors.error,'ETIMEDOUT');
assert.ok(!JSON.stringify(recovering.status()).includes('secret must not leak'));
fail=false;await recovering();await Promise.allSettled(tasks);assert.equal(recovering.status().mirrors.lastProcessed,1);
console.log('P0_MEDIA_RECOVERY PASS: slow lanes isolated; single-flight; durable leases; drain; failure visibility; retry');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
