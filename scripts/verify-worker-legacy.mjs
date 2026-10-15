// Run the actual old runner against an isolated local fake App, never a supplier.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {tmpdir} from 'node:os';
const file=process.argv[2];assert.ok(file);
const directory=await mkdtemp(path.join(tmpdir(),'worker-baseline-'));
let calls=0,child;
const app=http.createServer((request,response)=>{calls++;response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({ok:true,processed:0}));});
await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
try {
 child=spawn(process.execPath,[file],{env:{...process.env,VIDEO_WORKER_SECRET:'fixture-no-production-secret-000000000000000',
  NAUMI_APP_ORIGIN:`http://127.0.0.1:${app.address().port}`,VIDEO_WORKER_INTERVAL_MS:'5000',NAUMI_WORKER_RELEASE_CONTROL:'1',
  NAUMI_WORKER_START_PAUSED:'1',NAUMI_WORKER_STATE_FILE:path.join(directory,'state.json'),NAUMI_INSTANCE_ID:'fixture',SOURCE_COMMIT:'a'.repeat(40)},stdio:'ignore'});
 child.done=new Promise(resolve=>child.once('exit',resolve));
 const deadline=Date.now()+5000;
 while(!calls&&Date.now()<deadline&&child.exitCode===null)await new Promise(r=>setTimeout(r,20));
 assert.equal(calls,1,'old runner did not dispatch expected fixture tick');
 console.log('LEGACY_WORKER=REPRODUCED START_PAUSED_IGNORED=true CONTROL_API=ABSENT FIXTURE_TICKS=1 SUPPLIER_CALLS=0 EXIT=0');
}finally{if(child?.exitCode===null){child.kill('SIGKILL');await child.done;}app.closeAllConnections();await new Promise(resolve=>app.close(resolve));await rm(directory,{recursive:true,force:true});}
