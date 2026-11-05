/** Called by the existing real Next harness, sharing its OWN random schema.
 * Actual network handlers, no route/service replacement. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {seed,kickHttp,pool,closeImageCoordinationPool} from "./image-worker-ownership-fixture";
import {signUserSession} from "@/lib/native-auth";

async function main(){
 const arg=(name:string)=>process.argv[process.argv.indexOf(name)+1],origin=arg("--next-origin"),schema=arg("--next-schema"),media=arg("--next-media"),log=arg("--next-fetch-log");
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");assert.equal(new URL(origin).hostname,"127.0.0.1");assert.match(schema,/^worker_recovery_[a-f0-9]+$/);
 Object.assign(process.env,{PGOPTIONS:"-c search_path="+schema,MEDIA_DIR:media,NAUMI_APPLICATION_TASK_EXECUTION:"worker",NAUMI_WORKER_EXECUTION:""});
 let checks=0;const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 try{
  const data=await seed(),sql=pool(),cookie=`nv_user=${signUserSession(data.owner,Date.now())}`;
  for(const [kind,id]of Object.entries(data.ids)){
   const path=kind==="generate"?"generate-image":kind;
   const response=await fetch(origin+"/api/"+path,{method:"POST",headers:{"content-type":"application/json","x-video-worker-secret":process.env.VIDEO_WORKER_SECRET!},body:JSON.stringify({workerJobId:id})});eq(response.status,200);
   const row=(await sql.query("SELECT snapshot->>'status' status,lease_token FROM app_image_jobs WHERE id=$1",[id])).rows[0];eq(row,{status:"pending",lease_token:null});
  }
  eq((await fetch(origin+"/api/video/worker/tick",{method:"POST"})).status,401);
  const rejected=await fetch(origin+"/api/video/worker/tick",{method:"POST",headers:{"x-video-worker-secret":process.env.VIDEO_WORKER_SECRET!}});eq(rejected.status,409);eq(await rejected.json(),{error:"APPLICATION_TASKS_ASSIGNED_TO_WORKER"});
  const generated=await fetch(origin+"/api/generate-image",{method:"POST",headers:{cookie,origin,"content-type":"application/json"},body:JSON.stringify({prompt:"real Next saved image task",model:"gpt-image-2",quality:"medium",count:1,ratio:"1:1",resolution:"1K"})}),body=await generated.json();assert.equal(generated.status,200,JSON.stringify(body));checks++;
  assert.equal(typeof body.jobId,"string");checks++;
  const saved=(await sql.query("SELECT email,snapshot->>'status' status,lease_token,payload->'billingQuote'->>'requestedCredits' credits FROM app_image_jobs WHERE id=$1",[body.jobId])).rows[0];eq(saved,{email:data.owner,status:"pending",lease_token:null,credits:"17"});
  const read=await fetch(origin+"/api/generate-image?job="+body.jobId,{headers:{cookie}});eq(read.status,200);eq((await read.json()).status,"pending");
  eq((await sql.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume'")).rows[0].n,0);
  // The old authenticated kick also remains enqueue-only, not an execution bypass.
  eq(await kickHttp(data),[200,200,200,200]);
  const events=(await readFile(log,"utf8")).trim().split("\n").filter(Boolean).map(s=>JSON.parse(s));eq(events.filter(e=>e.kind==="unexpected").length,0);eq(events.filter(e=>e.kind==="reentry").length,0);
  console.log(`IMAGE_WORKER_WEB_NEXT=PASS checks=${checks} ACTUAL_NEXT=${JSON.parse(await readFile("node_modules/next/package.json","utf8")).version} HANDLERS=6 WEB_CLAIMS=0 NEW_SUBMISSION=ACCEPTED CURRENT17_FROZEN=1 SUPPLIER_POST=0 CONSUME=0 HTTP_WORKER_TICK=409`);
 }finally{await closeImageCoordinationPool();await pool().end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
