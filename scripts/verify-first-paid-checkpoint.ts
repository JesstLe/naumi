/** Real creation handlers, PG, lease, supplier HTTP and wallet. Faults happen
 * after the supplier returns, before the first paid result snapshot is saved;
 * no done checkpoint is seeded. The SQL client boundary is the only fault port. */
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {mkdir,mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {Client} from "pg";
import sharp from "sharp";

async function main(){
  const arg=(name:string)=>{const n=process.argv.indexOf(name);return n<0?undefined:process.argv[n+1];};
  const root=path.resolve(arg("--source-root")||"."),out=path.resolve(arg("--out")||process.env.FIRST_PAID_CHECKPOINT_EVIDENCE||"output/first-paid-checkpoint"),mode=arg("--mode")||"modified";
  assert.ok(["observe","baseline","modified"].includes(mode));
  const load=(name:string)=>import(pathToFileURL(path.join(root,name)).href);
  const {createModelFixture}=await load("scripts/model-config-fixture.ts") as typeof import("./model-config-fixture");
  const png=await sharp({create:{width:96,height:96,channels:3,background:"#4281bd"}}).png().toBuffer();
  const hash=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
  let active:{kind:string;child?:string;posts:number;returned:boolean;failures:number;ackCommitted?:boolean;release:()=>void;hit:Promise<void>;seen:()=>void;gate:Promise<void>}|undefined;
  const f=await createModelFixture(async(req,res)=>{
    for await(const _ of req){}
    if(req.method!=="POST"||!req.url?.includes("/images/generations")||!active){res.writeHead(404);res.end("{}");return;}
    const current=active;current.posts++;current.seen();await current.gate;
    current.returned=true;res.setHeader("content-type","application/json");res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));
  });
  const media=await mkdtemp(path.join(tmpdir(),"naumi-first-checkpoint-"));
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:media,OPENAI_API_KEY:"fixture-checkpoint-only",OPENAI_BASE_URL:f.origin+"/v1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-checkpoint-router-token-local-only",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-checkpoint-envelope-secret-local-only",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,VIDEO_WORKER_SECRET:"fixture-checkpoint-worker-secret-local-only"});
  const query=Client.prototype.query;let db:typeof import("../src/lib/db")|undefined,closeLocks:(()=>Promise<void>)|undefined;
  const observations:unknown[]=[];
  const commitAckLoss=new WeakSet<object>();
  (Client.prototype as any).query=function(...args:any[]){
    const sql=typeof args[0]==="string"?args[0]:args[0]?.text||"",values=args[1]||args[0]?.values||[];
    if(sql==="COMMIT"&&commitAckLoss.has(this)){
      commitAckLoss.delete(this);
      return (query as any).apply(this,args).then(()=>{active!.failures++;active!.ackCommitted=true;throw Object.assign(Error("paid snapshot committed; acknowledgement lost"),{code:"CHECKPOINT_FIXTURE_ACK"});});
    }
    if(active?.child===values[0]&&active?.returned&&sql.includes("UPDATE app_image_jobs SET snapshot=$2")){
      const snapshot=typeof values[1]==="string"?JSON.parse(values[1]):values[1];
      const hasDone=Object.values(snapshot?.paidOperations||{}).some((root:any)=>root.state==="done"||Object.values(root.children||{}).some((child:any)=>child.state==="done"));
      const rootDone=Object.values(snapshot?.paidOperations||{}).some((root:any)=>root.state==="done");
      if(hasDone&&active.kind==="checkpoint-ack-loss"&&active.failures===0)commitAckLoss.add(this);
      if(hasDone&&(active.kind==="checkpoint-always"||active.kind==="checkpoint-once"&&active.failures===0||active.kind==="root-once"&&rootDone&&active.failures===0)){
        active.failures++;throw Object.assign(Error("first paid-result snapshot write failed"),{code:"CHECKPOINT_FIXTURE_SQL"});
      }
    }
    return (query as any).apply(this,args);
  };
  try{
    f.config.upstreamModels[0].model="gpt-image-2";f.config.upstreamModels[0].capabilities.nativeResolutions=[];f.config.upstreamModels[0].parameterMap.resolution={};await f.repo.current();
    db=await load("src/lib/db.ts");await db!.ensureSchema();
    const database=db!;closeLocks=(await load("src/lib/imagegen/coordination-pool.ts")).closeImageCoordinationPool;
    const plans=await load("src/app/api/imagegen/plan/route.ts"),route=await load("src/app/api/imagegen/route.ts"),generation=await load("src/app/api/generate-image/route.ts");
    const {USER_COOKIE,signUserSession}=await load("src/lib/native-auth.ts"),{readManagedObject}=await load("src/lib/storage.ts");
    const owner=`first-checkpoint-${randomUUID()}@fixture.test`,other=`other-checkpoint-${randomUUID()}@fixture.test`;
    await database.getOrCreateUser(owner);await database.getOrCreateUser(other);await database.addCreditBatch(owner,1000,{source:"admin",reason:"first checkpoint fixture"});
    const request=(body?:unknown,email=owner,operation?:string)=>new Request(`http://fixture.test/api/imagegen${operation?"?operationId="+operation:""}`,{method:body===undefined?"GET":"POST",headers:{origin:"http://fixture.test",cookie:`${USER_COOKIE}=${signUserSession(email,Date.now())}`,"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const waitFor=async<T>(read:()=>Promise<T>,ready:(value:T)=>boolean)=>{const until=Date.now()+15000;let value:T;do{value=await read();if(ready(value))return value;await new Promise(resolve=>setTimeout(resolve,25));}while(Date.now()<until);throw Error("first-checkpoint wait timed out: "+JSON.stringify(value!));};
    for(const kind of ["healthy","checkpoint-once","checkpoint-ack-loss","root-once","checkpoint-always"]){
      let release!:()=>void,seen!:()=>void;const gate=new Promise<void>(done=>{release=done;}),hit=new Promise<void>(done=>{seen=done;});active={kind,posts:0,returned:false,failures:0,release,hit,seen,gate};
      const input={version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",modelId:"image-a",prompt:"first paid checkpoint "+kind,inputs:[],parameters:{quality:"medium",resolution:"1K",ratio:"1:1"},variants:1};
      const quoteResponse=await plans.POST(request(input));assert.equal(quoteResponse.status,200,await quoteResponse.clone().text());const plan=await quoteResponse.json();assert.ok(plan.totalCredits>0);
      const accepted=await route.POST(request({...input,confirmation:{quoteId:plan.quote?.id}}));assert.equal(accepted.status,200,await accepted.clone().text());const receipt=await accepted.json();
      let hitTimer:ReturnType<typeof setTimeout>|undefined;
      try{await Promise.race([hit,new Promise((_,reject)=>{hitTimer=setTimeout(()=>reject(Error("supplier was not reached")),10000);})]);}finally{clearTimeout(hitTimer);}
      const parent=(await database.getPool().query("SELECT * FROM app_image_jobs WHERE id=$1",[receipt.jobId])).rows[0];const childId=(Object.values(parent.snapshot.children)[0] as {jobId:string}).jobId;active.child=childId;
      const before=(await database.getPool().query("SELECT snapshot FROM app_image_jobs WHERE id=$1",[childId])).rows[0].snapshot;
      assert.ok(Object.values(before.paidOperations).every((a:any)=>a.state==="started"));assert.ok(!JSON.stringify(before).includes('"state":"done"'));release();
      const result=await waitFor(async()=>{const response=await route.GET(request(undefined,owner,input.operationId));assert.equal(response.status,200);return response.json();},value=>["succeeded","failed","needs_attention","partial"].includes(value.status));
      const child=await waitFor(async()=>(await database.getPool().query("SELECT * FROM app_image_jobs WHERE id=$1",[childId])).rows[0],value=>!value.lease_token);
      const billing=(await database.getPool().query("SELECT state,reserved_credits,charged_credits FROM app_billing_operations WHERE id=$1",[childId])).rows[0];
      const ledger=(await database.getPool().query("SELECT count(*)::int n,COALESCE(sum(delta),0)::int delta FROM app_ledger WHERE id=$1 AND kind='consume'",["led-image-"+childId])).rows[0];
      const artworks=(await database.getPool().query("SELECT id,image_url FROM app_artworks WHERE id LIKE $1",[`art-${childId}-%`])).rows;
      const legacy=await generation.GET(new Request(`http://fixture.test/api/generate-image?job=${childId}`,{headers:{cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`}}));const visible=await legacy.json();
      const bytes=artworks.length?hash((await readManagedObject(artworks[0].image_url,64*1024*1024)).bytes):null;
      const beforeObserve=active.posts;for(let i=0;i<3;i++)await route.GET(request(undefined,owner,input.operationId));assert.equal(active.posts,beforeObserve,"receipt reads must never replay the paid POST");
      const foreign=await route.GET(request(undefined,other,input.operationId));assert.notEqual(foreign.status,200);
      const observation={kind,operationId:input.operationId,parent:receipt.jobId,child:childId,sourceRoot:root,originalQuote:plan.totalCredits,supplierPosts:active.posts,supplierReturned:active.returned,firstCheckpointFailures:active.failures,ackActuallyCommitted:!!active.ackCommitted,noDoneCheckpointSeeded:true,parentStatus:result.status,artifacts:result.artifacts.length,byteHash:bytes,expectedByteHash:hash(png),publicStatus:visible.status,publicError:visible.error||result.error,chargedCredits:result.chargedCredits,billing,ledger,artworks:artworks.map((a:any)=>a.id),paidOperations:child.snapshot.paidOperations,diagnostic:child.snapshot.failureDiagnostic};
      observations.push(observation);await mkdir(out,{recursive:true});await writeFile(path.join(out,"RESULT.json"),JSON.stringify({status:"OBSERVING",mode,cases:observations},null,2)+"\n");
      console.log("FIRST_CHECKPOINT_CASE="+JSON.stringify({...observation,paidOperations:undefined}));assert.equal(active.posts,1);
      if(kind==="healthy"||mode==="modified"&&["checkpoint-once","checkpoint-ack-loss","root-once"].includes(kind)){assert.equal(result.status,"succeeded");assert.equal(bytes,hash(png));assert.equal(ledger.n,1);assert.equal(-ledger.delta,plan.totalCredits);}
      if(mode==="baseline"&&kind==="checkpoint-once"){assert.equal(result.status,"failed");assert.equal(artworks.length,0);assert.equal(ledger.n,0);assert.equal(active.failures,1);}
      if(kind==="checkpoint-always"){
        assert.equal(artworks.length,0);assert.equal(ledger.n,0);assert.ok(active.failures>0);
        if(mode==="modified"){assert.equal(active.failures,2);assert.equal(child.snapshot.resultCheckpointPending,true);assert.equal(child.snapshot.failureDiagnostic.stage,"paid-result-checkpoint");assert.equal(child.snapshot.failureDiagnostic.reason,"IMAGE_RESULT_CHECKPOINT_PENDING");assert.equal(visible.error,"图片结果保存未完成，请检查原任务");assert.equal(billing.state,"hold");assert.equal(billing.reserved_credits,plan.totalCredits);}
      }
    }
    const report={status:mode==="observe"?"OBSERVED":mode==="baseline"?"BASELINE_REPRODUCED":"PASS",mode,cases:observations,realPG:true,realHandlers:true,realSupplier:"loopback",paidExternalCalls:0};await writeFile(path.join(out,"RESULT.json"),JSON.stringify(report,null,2)+"\n");console.log(`FIRST_PAID_CHECKPOINT=${report.status} CASES=5 REAL_PG=1 REAL_HANDLERS=1 FIRST_RESULT_WRITE_FAULT=1 SEED_DONE=0 SUPPLIER_POSTS=5 RECEIPT_REPOSTS=0 EXTERNAL_PAID=0`);
  }finally{
    active?.release();Client.prototype.query=query;await closeLocks?.();if(db)await db.getPool().end();await f.cleanup();assert.equal(path.dirname(media),tmpdir());await rm(media,{recursive:true,force:true});console.log("FIRST_CHECKPOINT_CLEANUP=PASS OWN_SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1 TEMP_MEDIA_REMOVED=1");
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
