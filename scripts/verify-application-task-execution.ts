/** Actual small deployment policy, injected DB transport only. Not PG/process
 * acceptance: that is verify-image-worker-ownership.mjs. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";

async function main(){
 const source=await readFile("src/lib/application/task-execution.ts","utf8"),code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 let checks=0;
 const fixture=(env:Record<string,string|undefined>,dbEnabled=true,fail=false)=>{
  const queries:any[]=[],messages:string[]=[],projected={exports:{} as any};
  new Function("require","module","exports","process","console",code)((id:string)=>id==="server-only"?{}:{dbEnabled,getPool:()=>({query:async(q:unknown)=>{queries.push(q);if(fail)throw Error("fixture database notification unavailable");}})},projected,projected.exports,{env},{error:(m:string)=>messages.push(m)});
  return {...projected.exports,queries,messages};
 };
 for(const env of [{},{NAUMI_APPLICATION_TASK_EXECUTION:"local"},{NAUMI_APPLICATION_TASK_EXECUTION:"worker",NAUMI_WORKER_EXECUTION:"direct"}]){
  const f=fixture(env);assert.equal(f.applicationTasksRunHere(),true);assert.equal(await f.deferApplicationTask(),false);assert.equal(f.queries.length,0);checks+=3;
 }
 const web=fixture({NAUMI_APPLICATION_TASK_EXECUTION:"worker"});assert.equal(web.applicationTasksRunHere(),false);assert.equal(await web.deferApplicationTask(),true);assert.equal(web.queries.length,1);checks+=3;
 assert.deepEqual(web.queries[0],{text:"SELECT pg_notify($1,current_schema())",values:["naumi_application_work"],query_timeout:1000});checks++;
 const lost=fixture({NAUMI_APPLICATION_TASK_EXECUTION:"worker"},true,true);assert.equal(await lost.deferApplicationTask(),true);assert.equal(lost.messages.length,1);checks+=2;
 assert.throws(()=>fixture({NAUMI_APPLICATION_TASK_EXECUTION:"worker"},false).applicationTasksRunHere(),/REQUIRES_DATABASE/);checks++;
 assert.throws(()=>fixture({NAUMI_APPLICATION_TASK_EXECUTION:"other"}).applicationTasksRunHere(),/INVALID_APPLICATION/);checks++;
 assert.equal(await fixture({},false).deferApplicationTask(),false);checks++;
 console.log(`APPLICATION_TASK_EXECUTION=PASS checks=${checks} SOURCE=ACTUAL INJECTED_DB_PORT=1 NOTIFY_FAILURE_RETAINS_ACCEPTANCE=1 NO_IDS_OR_SECRETS=1`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
