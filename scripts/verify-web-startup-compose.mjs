/** Parse the actual Compose graph. Execute its health command against loopback
 * responses; this does not launch the product stack or grant scanner permits. */
import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {createServer} from "node:http";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
const flag=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(flag("--source-root")||"."),baseline=process.argv.includes("--baseline"),mode=baseline?"BASELINE":"MODIFIED",out=path.resolve(process.env.WEB_STARTUP_EVIDENCE||"output/refactor-r4b4-20261025");
const fixture="compose-startup-fixture-012345678901234567890";
const config=JSON.parse(execFileSync("docker",["compose","-f",path.join(root,"docker-compose.yml"),"config","--format","json"],{encoding:"utf8",env:{...process.env,SETTINGS_SECRET:fixture,MEDIA_WORKER_SECRET:fixture,VIDEO_WORKER_SECRET:fixture},windowsHide:true}));
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
eq(config.services["video-worker"].depends_on.app.condition,baseline?"service_started":"service_healthy");
const worker=config.services['video-worker'],direct=worker.environment.NAUMI_WORKER_EXECUTION==='direct';
if(direct){
 // An executing Worker owns the same business database; the legacy HTTP tick
 // relay deliberately has none. Test actual roles, not the retired R4B shape.
 assert.equal(typeof worker.environment.DATABASE_URL,'string');checks++;
 eq(worker.environment.DATABASE_URL,config.services.app.environment.DATABASE_URL);
 eq(worker.environment.NAUMI_APPLICATION_TASK_EXECUTION,config.services.app.environment.NAUMI_APPLICATION_TASK_EXECUTION);
}else eq(worker.environment.DATABASE_URL,undefined);
eq(worker.command,["node","scripts/video-worker.mjs"]);
for(const name of ["video-worker.mjs","video-worker-with-media.mjs","worker-runtime.mjs"]){assert.doesNotMatch(await readFile(path.join(root,"scripts",name),"utf8"),/application\/startup|ensureSchema|instrumentation/);checks++;}
const results=[];
if(baseline)eq(config.services.app.healthcheck,undefined);
else{
 const test=config.services.app.healthcheck.test;eq(test.slice(0,3),["CMD","node","-e"]);let response={status:200,body:'{"db":{"ok":true}}'};
 const server=createServer((_,res)=>{res.writeHead(response.status,{"content-type":"application/json"});res.end(response.body);});await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const origin=`http://127.0.0.1:${server.address().port}`,code=test[3].replace("http://127.0.0.1:3000",origin);assert.notEqual(code,test[3]);checks++;
  for(const [label,status,body,expected] of [["ready",200,'{"db":{"ok":true}}',0],["db-down",200,'{"db":{"ok":false}}',1],["http-error",503,'{"db":{"ok":true}}',1],["invalid-json",200,'not-json',1]]){
   response={status,body};const cp=spawn(process.execPath,["-e",code],{windowsHide:true,stdio:"ignore"});const actual=await new Promise((resolve,reject)=>{cp.once("error",reject);cp.once("close",resolve);});eq(actual,expected);results.push({label,httpStatus:status,body,exit:actual});
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
}
await writeFile(path.join(out,`COMPOSE_${mode}.json`),JSON.stringify({status:"PASS",mode,checks,workerDependency:config.services["video-worker"].depends_on.app.condition,results,realStack:false,workerProcessStarted:false},null,2));
console.log(`WEB_STARTUP_COMPOSE=PASS mode=${mode} checks=${checks} graph=ACTUAL health_cases=${results.length} worker_db=${direct?1:0} role=${direct?'direct':'http-tick'} product_stack=0`);
