import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

async function main() {
  if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1" || !process.env.DATABASE_URL) throw new Error("仅可使用独立测试数据库");
  const base=process.env.VERIFY_APP_ORIGIN || "http://127.0.0.1:31089";
  if(new URL(base).hostname!=="127.0.0.1") throw new Error("测试仅允许本地应用");
  process.env.NAUMI_EDITION="cloud";process.env.NAUMI_MULTI_USER="1";
  const db=await import("../src/lib/db");
  const {DurableImageJobs,recoverDurableImageJobs}=await import("../src/lib/durable-image-jobs");
  const {signUserSession}=await import("../src/lib/native-auth");
  const {uploadImage}=await import("../src/lib/storage");
  const stamp=randomUUID(),email=`route-${stamp}@example.test`;
  await db.getOrCreateUser(email,"Route Fixture");await db.addCreditBatch(email,100,{source:"admin",reason:"Route fixture"});
  const bytes=await sharp({create:{width:32,height:32,channels:3,background:"white"}}).png().toBuffer();
  const url=await uploadImage(bytes,"image/png",`fixtures/${stamp}.png`);
  const now=Date.now();
  const p={prompt:"fixture",userPrompt:"fixture",category:"main",ratio:"1:1",resolution:"1K",style:"",quality:"medium",count:1,transparent:false,ratiogen:false,email,images:[],parentId:"",parentIds:[],templateId:"",templateImage:"",templatePrompt:"",origin:"",projectGroupId:"",model:"gpt-image-1",targetWidth:0,targetHeight:0};
  const generateId=`route-gen-${stamp}`,suiteId=`route-suite-${stamp}`,aplusId=`route-aplus-${stamp}`;
  const image={id:`art-${generateId}-0`,url,gradient:"",prompt:"fixture",ratio:"1:1",createdAt:new Date(now).toISOString()};
  await new DurableImageJobs<any>("generate").create(generateId,email,{status:"pending",images:[image],createdAt:now},{p,cost:6,byok:false},6,true);
  const shots=(id:string)=>[{id:`${id}-0`,label:"Fixture",role:"main",ratio:"1:1",prompt:"",text:"",status:"done",url,gradient:""},{id:`${id}-1`,label:"Failed fixture",role:"sub",ratio:"1:1",prompt:"",text:"",status:"error",gradient:""}];
  await new DurableImageJobs<any>("suite").create(suiteId,email,{status:"pending",shots:shots(suiteId),done:2,total:2,createdAt:now,owner:email,renderingFinished:true},{images:[{buf:bytes,type:"image/png"}],extra:"",platform:"taobao",email,model:"gpt-image-1",cost:12,requested:[],textModel:"fixture-no-call"},12,true);
  await new DurableImageJobs<any>("aplus").create(aplusId,email,{status:"pending",stage:"generating",sources:[{id:`${aplusId}-source`,label:"Fixture",status:"approved",version:1,url}],sourceInputs:[{buf:bytes,type:"image/png"}],sourceBuffers:[bytes],sourceHistory:[[]],shots:shots(aplusId),done:2,total:2,extra:"",platform:"amazon",lang:"zh",format:"1:1",modules:["main","sub"],email,model:"gpt-image-1",textModel:"fixture-no-call",useDb:true,cost:12,generationStarted:true,reserved:true,parentId:"",parentIds:[],origin:"",createdAt:now,renderingFinished:true},{},12,true);
  const headers={cookie:`nv_user=${signUserSession(email,Date.now())}`};
  const routes=[{route:"generate-image",id:generateId},{route:"suite",id:suiteId},{route:"aplus",id:aplusId}];
  await db.getPool().query("UPDATE app_image_jobs SET updated_at='2000-01-01' WHERE id=ANY($1::text[])",[routes.map(job=>job.id)]);
  process.env.INTERNAL_APP_ORIGIN=base;
  assert.equal(await recoverDurableImageJobs(),3);
  console.log("PASS recovery scanner dispatches all three persisted jobs through the worker channel");
  for(const job of routes) {
    assert.equal((await fetch(`${base}/api/${job.route}?job=${job.id}`)).status,403);
    const result=await fetch(`${base}/api/${job.route}`,{method:"POST",headers:{"content-type":"application/json","x-video-worker-secret":process.env.VIDEO_WORKER_SECRET!},body:JSON.stringify({workerJobId:job.id})});
    assert.equal(result.status,200,await result.text());
  }
  const deadline=Date.now()+45000;
  for(const job of routes) {
    while(true) {
      const response=await fetch(`${base}/api/${job.route}?job=${job.id}`,{headers});
      assert.equal(response.status,200);const result=await response.json();
      if(result.status==="done") { assert.equal(result.creditsUsed,6);console.log(`PASS ${job.route} persisted checkpoint resumed, partial result billed once`);break; }
      assert.equal(result.status,"pending",JSON.stringify(result));assert.ok(Date.now()<deadline,"route recovery timed out");
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  }
  const totals=await db.getPool().query("SELECT sum(delta)::int AS charged,count(*)::int AS entries FROM app_ledger WHERE email=$1 AND kind='consume'",[email]);
  assert.equal(totals.rows[0].charged,-18);assert.equal(totals.rows[0].entries,3);
  assert.equal((await db.getUser(email))?.creditsUsed,0);
  for(const job of routes) {
    const active=await (await fetch(`${base}/api/${job.route}?active=1`,{headers})).json();
    assert.equal(active.jobs.length,0);
  }
  const uiEmail="ui-fixture@example.test";
  await db.getOrCreateUser(uiEmail,"Canvas Fixture");
  const {hashPassword}=await import("../src/lib/pw");
  await db.setUserPassword(uiEmail,hashPassword("Fixture!canvas2026"));
  await db.addArtworks(uiEmail,[{id:"ui-fixture-art",title:"画布回归样本",category:"main",prompt:"",status:"completed",image:url,gradient:"",origin:"canvas"}]);
  console.log("IMAGE_JOB_ROUTES_RESULT=PASS");
  await db.getPool().end();
}
main().catch(error=>{console.error(error);process.exit(1);});
