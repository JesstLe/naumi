/** Isolated PostgreSQL + real workbench handler/service/repository/billing/image pipeline.
 * Only browser.ts/service.ts are projected from --source-root; other dependencies use
 * the current checkout. The HTTP supplier is a local fixture, never a real provider.
 * node --conditions=react-server --import tsx scripts/verify-pricing-friction-workbench.ts
 *   --mode baseline|modified [--source-root DIR]
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {readFile,mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {join,resolve,dirname} from "node:path";
import {tmpdir} from "node:os";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";

const root=process.cwd(),args=process.argv.slice(2),arg=(key:string,fallback:string)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const mode=arg("--mode","modified"),baseline=mode==="baseline",sourceRoot=resolve(arg("--source-root",root));
assert.ok(["baseline","modified"].includes(mode));
const label=arg("--label",mode);assert.ok(["baseline","modified","rollback"].includes(label));
const out=resolve(process.env.WORKBENCH_EVIDENCE||"output/pricing-friction-removal-20261023/workbench"),checks:string[]=[];
function passed(name:string){checks.push(name);console.log(`PASS ${name}`);}
function transpile(source:string,file:string){return ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;}
async function loadActual(file:string,overrides:Record<string,unknown>={},project=false){
 const source=await readFile(join(project?sourceRoot:root,file),"utf8"),projected={exports:{} as any},local=createRequire(join(root,file));
 const require=(id:string)=>Object.hasOwn(overrides,id)?overrides[id]:local(id);
 new Function("module","exports","require","__filename","__dirname",transpile(source,file))(projected,projected.exports,require,join(root,file),dirname(join(root,file)));
 return projected.exports;
}

async function browserChecks(){
 const source=await readFile(join(sourceRoot,"src/lib/reference-workbench/browser.ts"),"utf8");
 for(const scenario of ["normal","unknown","rejected","quote-failure","receipt-recovered"]){
  const calls:string[]=[],submissions:any[]=[];let dialogs=0;
  const native=async(input:any,init?:RequestInit)=>{
   const url=String(input);calls.push(url);
   if(url.endsWith("auth/status"))return Response.json({id:"fixture-owner"});
   if(url.endsWith("settings"))return Response.json({models:[]});
   if(url.endsWith("quote"))return scenario==="quote-failure"?Response.json({error:"fixture quote unavailable"},{status:503}):Response.json({id:"fixture-operation",state:"preview",totalCredits:7,availableCredits:100,items:[{credits:7}],warnings:[]});
   if(url.includes("receipt?"))return scenario==="receipt-recovered"?Response.json({ok:true,id:"fixture-operation"}):Response.json({state:"preview"},{status:409});
   if(url.endsWith("single/start")){submissions.push(JSON.parse(String(init?.body)));if(["unknown","receipt-recovered"].includes(scenario))throw Error("fixture lost acceptance response");return scenario==="rejected"?Response.json({ok:false,error:"fixture rejection"},{status:409}):Response.json({ok:true,task_id:"fixture-operation"});}
   throw Error("Unexpected browser request "+url);
  };
  const window:any={fetch:native,addEventListener(){}},document={body:{},getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null};
  const sandbox={window,document,location:{pathname:"/batchshot/native/single",origin:"http://fixture.invalid",href:"http://fixture.invalid/batchshot/native/single",assign(){},reload(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},MutationObserver:class{observe(){}disconnect(){}},Headers,Request,Response,URL,crypto:{randomUUID},confirm:()=>{dialogs++;return true;},alert(){},HTMLImageElement:class{},Element:class{},exports:{},require:(id:string)=>id==="../supabase"?{authHeader:async()=>({})}:id==="./model-options"?{workbenchModelOptions:()=>[],workbenchModelSelection:()=>""}:id==="./http"?{workbenchErrorText:String}:id==="../browser-storage/local"?{setLocalItem:()=>{},trimWorkbenchPromptStores:()=>{}}:id==="./local-prompts"?{boundedWorkbenchPrompts:(value:string)=>value,WORKBENCH_PROMPTS_KEY:"gpt-image-pil-workbench-prompts"}:(()=>{throw Error("Unexpected browser import "+id);})()};
  vm.runInNewContext(transpile(source,"browser.ts"),sandbox,{timeout:3000});await window.NaumiWorkbenchReady;
  const response=await window.fetch("/api/reference-workbench/single/start",{method:"POST",body:JSON.stringify({prompt:"fixture",count:1})}),result=await response.json();
  assert.equal(submissions.length,scenario==="quote-failure"?0:1,"No unknown-state rePOST");
  assert.equal(dialogs,baseline&&scenario!=="quote-failure"?1:0);
  if(submissions.length&&!baseline)assert.deepEqual(submissions[0].native_quote,{id:"fixture-operation"});
  if(scenario==="unknown"){assert.equal(result.code,"SUBMISSION_UNKNOWN");assert.equal(result.operationId,"fixture-operation");}
  if(scenario==="receipt-recovered")assert.equal(result.id,"fixture-operation");
  if(scenario==="rejected")assert.equal(calls.filter(s=>s.includes("receipt?")).length,0);
  if(scenario==="quote-failure")assert.equal(result.code,"QUOTE_UNAVAILABLE");
 }
 passed(`browser ${baseline?"old credit dialog reproduced":"no credit dialog"}; no unknown rePOST; original receipt; rejection/quote failure preserved`);
}

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");
 const dbUrl=new URL(process.env.DATABASE_URL!);assert.equal(dbUrl.hostname,"127.0.0.1");assert.match(dbUrl.pathname,/^\/[A-Za-z0-9_]*fixture[A-Za-z0-9_]*$/);
 await mkdir(out,{recursive:true});await browserChecks();
 let imageCalls=0,textCalls=0,routerDigest="";const wires:any[]=[];
 const f=await createModelFixture(async(req,res)=>{
  try{
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const bytes=Buffer.concat(chunks);
   let body:any={};if(bytes.length){if(String(req.headers["content-type"]).includes("multipart")){const form=await new Request("http://fixture",{method:"POST",headers:{"content-type":String(req.headers["content-type"])},body:new Uint8Array(bytes)}).formData();body=Object.fromEntries(Array.from(form).filter(([,v])=>typeof v==="string"));}else body=JSON.parse(bytes.toString());}
   res.setHeader("content-type","application/json");
   if(req.url?.startsWith("/internal/config")){if(req.url.endsWith("prepare"))return res.end(JSON.stringify({digest:body.digest,phase:"prepared"}));if(req.url.endsWith("activate")){routerDigest=body.digest;return res.end(JSON.stringify({id:body.id,digest:routerDigest,phase:"applied"}));}return res.end(JSON.stringify({digest:routerDigest}));}
   if(/\/images\/(generations|edits)$/.test(req.url||"")){imageCalls++;wires.push(body);const [w,h]=String(body.aspect_ratio||"1:1").split(":").map(Number),scale=128/Math.max(w,h),png=await sharp({create:{width:Math.round(w*scale),height:Math.round(h*scale),channels:3,background:"#6e9cbb"}}).png().toBuffer();return res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));}
   if(req.url?.endsWith("/chat/completions")){textCalls++;const text=JSON.stringify(body.messages),plan=String(body.messages[0].content).includes('"action"'),tasks=text.includes("multi-plan")?[{name:"背景",prompt:"fixture background",ratio:"1:1",image_indices:[]},{name:"光线",prompt:"fixture lighting",ratio:"1:1",image_indices:[]}]:[{name:"图片",prompt:"fixture image",ratio:"1:1",image_indices:[]}];return res.end(JSON.stringify({id:"fixture",model:"wire-text",choices:[{message:{role:"assistant",content:plan?JSON.stringify({action:"generate",reply:"fixture creative plan",tasks}):"fixture inferred prompt"},finish_reason:"stop"}],usage:{prompt_tokens:30,completion_tokens:40}}));}
   res.statusCode=404;res.end(JSON.stringify({error:"unexpected fixture endpoint"}));
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
 });
 const media=await mkdtemp(join(tmpdir(),"workbench-pricing-"));
 let db:typeof import("../src/lib/db")|undefined;
 try{
  process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
  Object.assign(process.env,{NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-workbench-router-1234567890",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-workbench-envelope-1234567890",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only",OPENAI_BASE_URL:f.origin+"/v1",OPENAI_IMAGE_QUALITY:"high",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:media,VIDEO_WORKER_SECRET:"fixture-workbench-worker-1234567890123456",NAUMI_VIDEO_WORKER:"0",NAUMI_RELEASE_LIFECYCLE:"0"});
  f.config.upstreamModels[0].capabilities.preserveIdentity=true;f.config.upstreamModels[0].capabilities.maxReferenceImages=8;
  f.config.upstreamModels[0].parameterMap={resolutionPolicy:{mode:"map",field:"resolution",ratioField:"aspect_ratio",values:{"1K":"1K","2K":"2K"}}};
  const cred=await f.credentials.importPlain({providerId:"p2",plain:"fixture-text-only",actor:"fixture"});
  f.config.providers.push({...f.config.providers[0],id:"p2",name:"文本fixture",protocol:"openai-chat",credentialRef:cred.id});
  f.config.upstreamModels.push({...f.config.upstreamModels[0],id:"u2",providerId:"p2",model:"wire-text",modality:"text",capabilities:{...f.config.upstreamModels[0].capabilities,vision:true},parameterMap:{}});
  f.config.publicModels.push({id:"text-a",label:"测试文本",modality:"text",enabled:true,visible:true,target:{type:"upstream",id:"u2"}});f.config.bindings["agent.text"]="text-a";f.config.bindings["text.generate"]="text-a";f.config.bindings["vision.reference"]="text-a";
  db=await import("../src/lib/db");const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service"),{updateBillingCompatibility}=await import("../src/lib/billing/server"),{signUserSession}=await import("../src/lib/native-auth"),repo=await import("../src/lib/reference-workbench/repository"),{stableId}=await import("../src/lib/reference-workbench/contract");
  const service=await loadActual("src/lib/reference-workbench/service.ts",{},true),route=await loadActual("src/app/api/reference-workbench/[...path]/route.ts",{"@/lib/reference-workbench/service":service});
  const owner=`wb-pricing-${randomUUID()}@example.test`,other=`wb-other-${randomUUID()}@example.test`,poor=`wb-poor-${randomUUID()}@example.test`;
  const call=(action:string,body?:any,email=owner)=>route[body===undefined?"GET":"POST"](new Request("http://internal/api/reference-workbench/"+action,{method:body===undefined?"GET":"POST",headers:{cookie:`nv_user=${signUserSession(email,Date.now())}`,...(body===undefined?{}:{"content-type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)})) as Promise<Response>;
  const json=async(action:string,body?:any,email=owner)=>{const response=await call(action,body,email),value=await response.json();assert.equal(response.status,200,JSON.stringify({action,status:response.status,value}));return value;};
  const quote=(action:string,body:any,email=owner)=>json("quote",{action,body},email),submit=(action:string,body:any,q:any,email=owner,meta:any={credits:q.totalCredits,confirmed:true})=>json(action,{...body,native_quote:{id:q.id,...meta}},email);
  const wait=async(run:()=>Promise<any>,done:(r:any)=>boolean)=>{let value:any;for(let i=0;i<240;i++){value=await run();if(done(value))return value;await new Promise(r=>setTimeout(r,35));}throw Error("fixture timeout "+JSON.stringify(value));};
  const single=()=>({request_id:randomUUID(),prompt:"fixture single",quality:"high",resolution:"1k",ratio:"1:1",count:1,images:[]});
  const bumpModel=async(reason:string)=>{const current=await f.repo.current(),staged=await f.repo.stageRestore({id:randomUUID(),actor:"fixture",reason,expectedVersion:current.version,targetVersion:current.version});await f.repo.markApplied(staged.id,staged.digest);};
  const complete=(id:string,email=owner)=>wait(()=>json("single/status?id="+id,undefined,email),r=>r.status!=="running");
  const error=async(action:string,body:any,status:number,pattern:RegExp,email=owner)=>{const response=await call(action,body,email),value=await response.json();assert.equal(response.status,status,JSON.stringify(value));assert.match(value.error,pattern);return value;};
  const {validateModelConfig}=await import("../src/lib/model-config/schema");validateModelConfig(f.config,{trustedOrigins:[f.origin]});await f.repo.current();await db.ensureSchema();for(const email of [owner,other,poor])await db.getOrCreateUser(email);
  await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:10000,source:"admin",reason:"workbench pricing fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
  await updateBillingCompatibility("fixture","text baseline",c=>{c.switches.metering="on";c.features["canvas.text-generate"]={label:"文字fixture",enabled:true,unit:"task",pricing:{mode:"fixed",credits:2},settlement:{qualityBasis:"requested",successBasis:"successful-units",failureBps:0,byokBps:10000,reserveBps:10000,unknown:"hold"},rules:[]};});
  await error("single/start",single(),409,baseline?/确认积分/:/原始任务报价/);passed("missing quote rejected");

  const changed=single(),changedQ=await quote("single/start",changed),oldPlans=structuredClone((await repo.operation(owner,changedQ.id)).plans);
  assert.ok(changedQ.totalCredits>0);assert.equal(imageCalls,0);
  const textBody={request_id:randomUUID(),session_id:"",message:"fixture manual creative plan",settings:{quality:"high",resolution:"1k",ratio:"1:1",count:1,task_mode:"confirm",ratio_mode:"smart"},images:[]},textQ=await quote("chat-image/send",textBody);
  assert.equal(textQ.totalCredits,2);
  await updateBillingCompatibility("fixture","price changed after preview",c=>{c.features["canvas.text-generate"].pricing={mode:"fixed",credits:7};const image=c.features["image.generate"];if(image?.pricing.mode==="fixed")image.pricing.credits+=20;});
  await bumpModel("model current changed");
  if(baseline){await error("single/start",{...changed,native_quote:{id:changedQ.id,credits:changedQ.totalCredits,confirmed:true}},409,/模型或价格已更新/);await error("chat-image/send",{...textBody,native_quote:{id:textQ.id,credits:textQ.totalCredits,confirmed:true}},409,/模型或价格已更新/);assert.equal(imageCalls,0);passed("BASELINE_CURRENT_FALSE_BLOCK reproduced for image and nonzero text quote");}
  else{
   const cancelled=single(),cancelledQ=await quote("single/start",cancelled);
   const cancellationBilling=async()=>(await db!.getPool().query("SELECT (SELECT count(*)::int FROM app_billing_operations WHERE email=$1) AS operations,(SELECT count(*)::int FROM app_ledger WHERE email=$1 AND kind='consume') AS consume",[owner])).rows[0],beforeCancellation=await cancellationBilling(),beforeCancellationImages=imageCalls,beforeCancellationText=textCalls;
   await error("single/start",{...cancelled,native_quote:{id:cancelledQ.id,confirmed:false}},400,/已取消提交/);
   assert.equal((await repo.operation(owner,cancelledQ.id)).state,"preview");assert.equal(imageCalls,beforeCancellationImages);assert.equal(textCalls,beforeCancellationText);assert.deepEqual(await cancellationBilling(),beforeCancellation);
   passed("explicit confirmed=false rejected before acceptance; state=preview supplierCallsDelta=0 billingOperationsDelta=0 consumeDelta=0");
   const receipt=await submit("single/start",changed,changedQ,owner,{credits:999999}),done=await complete(receipt.id);assert.equal(done.status,"done");assert.equal(done.results.length,1);assert.equal(done.chargedCredits,changedQ.totalCredits);assert.equal(imageCalls,1);
   const repeated=await submit("single/start",changed,changedQ,owner,{confirmed:false});assert.equal(repeated.id,receipt.id);assert.equal(repeated.status,"done");assert.equal(repeated.chargedCredits,changedQ.totalCredits);assert.equal((await json("receipt?id="+receipt.id)).id,receipt.id);assert.equal(imageCalls,1);assert.deepEqual((await repo.operation(owner,receipt.id)).plans,oldPlans);
   const bills=(await db.getPool().query("SELECT count(*)::int AS n,sum(charged_credits)::int AS credits FROM app_billing_operations WHERE email=$1 AND state='settled' AND charged_credits>0",[owner])).rows[0];assert.equal(bills.n,1);assert.equal(bills.credits,changedQ.totalCredits);
   passed("changed model/billing current accepted with confirmed omitted; original price/one charge; accepted confirmed=false returns original receipt without cancellation");
   const textStarted=await submit("chat-image/send",textBody,textQ,owner,{});await wait(()=>json("chat-image/state?session_id="+textStarted.session_id),r=>r.messages.at(-1)?.status==="plan_pending");
   const textBill=(await db.getPool().query("SELECT quote,charged_credits FROM app_billing_operations WHERE id=$1",["tool-"+stableId(textQ.id,"plan")])).rows[0];assert.equal(textBill.charged_credits,2);assert.equal(textBill.quote.requestedCredits,2);assert.equal(imageCalls,1);
   passed("saved text quote retained at 2 credits after current=7; actual content plan remains pending");
  }

  const flagBody=single(),flagQ=await quote("single/start",flagBody),beforeFlags=imageCalls;
  if(baseline){await error("single/start",{...flagBody,native_quote:{id:flagQ.id}},409,/确认积分/);await error("single/start",{...flagBody,native_quote:{id:flagQ.id,confirmed:true,credits:0}},409,/积分报价不一致/);}
  else{const started=await submit("single/start",flagBody,flagQ,owner,{});assert.equal((await complete(started.id)).status,"done");assert.equal(imageCalls,beforeFlags+1);}
  passed(baseline?"baseline confirmed/credits friction reproduced":"quote id alone accepted without client credit confirmation");

  const expired=single(),expiredQ=await quote("single/start",expired);await db.getPool().query("UPDATE app_reference_operations SET expires_at=now()-interval '1 day' WHERE id=$1",[expiredQ.id]);const beforeExpired=await repo.operation(owner,expiredQ.id);
  if(baseline)await error("single/start",{...expired,native_quote:{id:expiredQ.id,credits:expiredQ.totalCredits,confirmed:true}},409,/过期/);
  await bumpModel("expired op must retain prior version");
  const previewAgain=await quote("single/start",expired),afterPreview=await repo.operation(owner,expiredQ.id);assert.equal(previewAgain.id,expiredQ.id);
  if(baseline){assert.notDeepEqual(afterPreview.plans,beforeExpired.plans);passed("BASELINE_TTL replan reproduced");}
  else{assert.deepEqual(afterPreview.plans,beforeExpired.plans);assert.equal(previewAgain.totalCredits,expiredQ.totalCredits);const started=await submit("single/start",expired,previewAgain,owner,{});assert.equal((await complete(started.id)).chargedCredits,expiredQ.totalCredits);passed("expired quote reused unchanged and delivered at original price, without reconfirm/replan");}

  const negative=single(),negativeQ=await quote("single/start",negative),negativeSubmit={...negative,native_quote:{id:negativeQ.id,confirmed:true,credits:negativeQ.totalCredits}},beforeNegative=imageCalls;
  await error("single/start",negativeSubmit,404,/无权访问/,other);await error("single/start",{...negativeSubmit,prompt:"changed content"},409,/不一致/);await error("workbench/start",negativeSubmit,409,/不一致/);await error("quote",{action:"single/start",body:{...negative,prompt:"request id conflict"}},409,/其他内容/);
  if(!baseline){
   await db.getPool().query("UPDATE app_reference_operations SET plans='[]'::jsonb WHERE id=$1",[negativeQ.id]);await error("single/start",negativeSubmit,409,/原始执行报价/);
   const missingText={...textBody,request_id:randomUUID()},missingTextQ=await quote("chat-image/send",missingText),missingOp=await repo.operation(owner,missingTextQ.id);delete missingOp.plans[0].quote;
   await db.getPool().query("UPDATE app_reference_operations SET plans=$2::jsonb WHERE id=$1",[missingTextQ.id,JSON.stringify(missingOp.plans)]);await error("chat-image/send",{...missingText,native_quote:{id:missingTextQ.id}},409,/原始执行报价/);
  }
  assert.equal(imageCalls,beforeNegative);passed("owner, action/content fingerprint, request-id conflict"+(!baseline?" and missing saved plan":"")+" negative cases");

  if(!baseline){
   // Inline reference images: the record keeps assets + a digest, never the bytes.
   const tiny=async(mean:number)=>"data:image/png;base64,"+(await sharp({create:{width:160,height:160,channels:3,background:"#808080",noise:{type:"gaussian",mean,sigma:40}}}).png().toBuffer()).toString("base64");
   const [imageA,imageB]=await Promise.all([tiny(110),tiny(150)]),connect=()=>db!.getPool().connect();
   const {storedOperationBody,slimStoredOperations,INLINE_IMAGES_DIGEST}=await import("../src/lib/reference-workbench/operation-storage");
   const inline={...single(),images:[imageA]},inlineQ=await quote("single/start",inline),stored=await repo.operation(owner,inlineQ.id);
   assert.equal(stored.body.images,undefined);assert.match(String(stored.body[INLINE_IMAGES_DIGEST]),/^[0-9a-f]{64}$/);
   assert.ok(!JSON.stringify(stored).includes("data:image"),"record keeps no inline image bytes");assert.equal(stored.plans[0].inputs.length,1);
   const beforeInline=imageCalls;
   await error("single/start",{...inline,images:[imageB],native_quote:{id:inlineQ.id}},409,/不一致/);assert.equal(imageCalls,beforeInline);
   const inlineStarted=await submit("single/start",inline,inlineQ,owner,{});assert.equal((await complete(inlineStarted.id)).status,"done");assert.equal(imageCalls,beforeInline+1);
   // A record written before this change (full body, images repeated in settings) still submits, then slims idempotently.
   const legacy={...single(),images:[imageA]},legacyQ=await quote("single/start",legacy),legacyOp=await repo.operation(owner,legacyQ.id);
   const legacyBody:Record<string,any>={...legacyOp.body,images:[imageA]};delete legacyBody[INLINE_IMAGES_DIGEST];
   await db.getPool().query("UPDATE app_reference_operations SET body=$2::jsonb,plans=$3::jsonb WHERE id=$1",[legacyQ.id,JSON.stringify(legacyBody),JSON.stringify(legacyOp.plans.map((t:any)=>({...t,settings:{...t.settings,images:[imageA]}})))]);
   assert.deepEqual(storedOperationBody(legacyBody),legacyOp.body);
   await error("single/start",{...legacy,images:[imageB],native_quote:{id:legacyQ.id}},409,/不一致/);
   const legacyStarted=await submit("single/start",legacy,legacyQ,owner,{});assert.equal((await complete(legacyStarted.id)).status,"done");
   const beforeSlim=await repo.operation(owner,legacyQ.id),planned=await slimStoredOperations(connect,{apply:false});
   assert.equal(planned.changed,1);assert.ok(JSON.stringify(await repo.operation(owner,legacyQ.id)).includes("data:image"),"plan mode writes nothing");
   const slim=await slimStoredOperations(connect,{apply:true}),after=await repo.operation(owner,legacyQ.id);
   assert.equal(slim.changed,1);assert.ok(slim.bytesAfter<slim.bytesBefore);assert.ok(!JSON.stringify(after).includes("data:image"));
   assert.deepEqual(after.body,legacyOp.body);assert.equal(after.fingerprint,beforeSlim.fingerprint);assert.deepEqual(after.result,beforeSlim.result);assert.equal(after.state,beforeSlim.state);assert.equal(+after.updated_at,+beforeSlim.updated_at);
   assert.deepEqual(after.plans.map((t:any)=>t.inputs),beforeSlim.plans.map((t:any)=>t.inputs));
   assert.equal((await slimStoredOperations(connect,{apply:true})).changed,0);assert.equal((await json("single/status?id="+legacyStarted.id)).status,"done");
   passed(`inline images kept as assets+digest; different image rejected; legacy full record submitted then slimmed idempotently bytes=${slim.bytesBefore}->${slim.bytesAfter}; fingerprint/result/updated_at unchanged`);
  }

  const race=single(),raceQuotes=await Promise.all([quote("single/start",race),quote("single/start",race)]);assert.equal(raceQuotes[0].id,raceQuotes[1].id);
  if(!baseline){const saved=await repo.operation(owner,raceQuotes[0].id);assert.equal(saved.plans[0].plan.request.operationId,stableId(saved.id,saved.plans[0].key));passed("concurrent preview retains winning operation/plan identity");}

  const png=await sharp({create:{width:128,height:128,channels:3,background:"#b8c9db"}}).png().toBuffer(),form=new FormData();form.set("manifest",JSON.stringify([{path:"商品/产品图/product.png"},{path:"商品/主图/ref.png"}]));for(let i=0;i<2;i++)form.append("files",new File([new Uint8Array(png)],"fixture.png",{type:"image/png"}));
  const uploaded=await route.POST(new Request("http://internal/api/reference-workbench/workbench/upload-folder",{method:"POST",headers:{cookie:`nv_user=${signUserSession(owner,Date.now())}`},body:form}));assert.equal(uploaded.status,200);const project=(await uploaded.json()).product_dir,items=await json("workbench/items?root="+encodeURIComponent(project)+"&resolution=1k"),wb={request_id:randomUUID(),workbench_root:project,items:[{ref_path:items.items[0].ref_path,prompt:"fixture workbench"}],config:{quality:"high",resolution:"1k",mode:"all"}},wq=await quote("workbench/start",wb),competitor={...wb,request_id:randomUUID()},cq=await quote("workbench/start",competitor);
  await db.getPool().query("UPDATE app_reference_operations SET state='accepted' WHERE id=$1",[wq.id]);await error("workbench/start",{...competitor,native_quote:{id:cq.id,credits:cq.totalCredits,confirmed:true}},409,/进行中任务/);await db.getPool().query("UPDATE app_reference_operations SET state='done' WHERE id=$1",[wq.id]);passed("accepted competing reference protected under actual owner transaction");

  await db.getPool().query("UPDATE app_credit_batches SET remaining=0 WHERE email=$1",[poor]);await db.getPool().query("UPDATE app_users SET credits_total=0,credits_used=0 WHERE email=$1",[poor]);
  const poorBody=single(),poorQ=await quote("single/start",poorBody,poor),beforePoor=imageCalls,poorStarted=await submit("single/start",poorBody,poorQ,poor),poorDone=await complete(poorStarted.id,poor);assert.equal(poorDone.status,"failed");assert.equal(imageCalls,beforePoor);passed("real wallet insufficiency prevents fixture supplier call");

  const auto={...textBody,request_id:randomUUID(),message:"fixture single auto plan",settings:{...textBody.settings,task_mode:"auto",count:2}},aq=await quote("chat-image/send",auto),autoOp=await repo.operation(owner,aq.id);if(!baseline)assert.equal(aq.totalCredits,7,"Only the actual text quote, not a synthetic 8-group image credit cap");autoOp.plans[0].autoAuthorization.credits=0;await db.getPool().query("UPDATE app_reference_operations SET plans=$2::jsonb WHERE id=$1",[aq.id,JSON.stringify(autoOp.plans)]);
  const cappedQ=await quote("chat-image/send",auto),beforeAuto=imageCalls,as=await submit("chat-image/send",auto,cappedQ);
  const autoState=await wait(()=>json("chat-image/state?session_id="+as.session_id),r=>["plan_pending","done","failed"].includes(r.messages.at(-1)?.status));
  if(baseline){assert.equal(autoState.messages.at(-1).status,"plan_pending");assert.equal(imageCalls,beforeAuto);passed("BASELINE_AUTO_CAP zero internal cap silently leaves generated plan pending");}
  else{const done=await wait(()=>json("chat-image/state?session_id="+as.session_id),r=>["done","failed","partial"].includes(r.messages.at(-1)?.status));assert.equal(done.messages.at(-1).status,"done");assert.equal(done.messages.at(-1).results.length,2);assert.equal(imageCalls,beforeAuto+2);const child=await repo.operation(owner,stableId(aq.id,"auto-images"));assert.equal(child.plans.length,2);assert.ok(child.plans.every(t=>t.plan.totalCredits>0));await json("chat-image/state?session_id="+as.session_id);assert.equal(imageCalls,beforeAuto+2);passed("internal auto credit cap ignored; two selected outputs/one generation round; native positive quote reservation, no replay");}

  const manual={...textBody,request_id:randomUUID(),message:"multi-plan creative confirmation",settings:{...textBody.settings,count:1}},mq=await quote("chat-image/send",manual),ms=await submit("chat-image/send",manual,mq),beforeCancel=imageCalls,manualState=await wait(()=>json("chat-image/state?session_id="+ms.session_id),r=>r.messages.at(-1)?.status==="plan_pending");assert.equal(manualState.messages.at(-1).plan.tasks.length,2);assert.equal(imageCalls,beforeCancel);const message=manualState.messages.at(-1);
  const contentConfirm={request_id:randomUUID(),session_id:ms.session_id,message_id:message.id,settings:manual.settings},confirmQ=await quote("chat-image/confirm",contentConfirm);await json("chat-image/cancel",{session_id:ms.session_id,message_id:message.id});await error("chat-image/confirm",{...contentConfirm,native_quote:{id:confirmQ.id,credits:confirmQ.totalCredits,confirmed:true}},409,/计划已经处理/);assert.equal(imageCalls,beforeCancel);passed("multi-prompt creative plan awaits user confirmation; user cancellation prevents submission");

  const running=(await db.getPool().query("SELECT id,state,plans FROM app_reference_operations WHERE state='accepted'")).rows;assert.equal(running.length,0,JSON.stringify(running));
  const report={fixture:true,sourceProjection:["src/lib/reference-workbench/browser.ts","src/lib/reference-workbench/service.ts"],otherDependencies:"current checkout",mode,sourceRoot,checks,imageCalls,textCalls,prices:{imageFrozen:changedQ.totalCredits,textFrozen:textQ.totalCredits,textCurrent:7},productionCalls:0,pendingAccepted:running.length,quotePricesZeroed:false,multiTaskAutoLoopChanged:false};
  await writeFile(join(out,label+"-evidence.json"),JSON.stringify(report,null,2)+"\n");console.log(`WORKBENCH_${mode.toUpperCase()}=PASS groups=${checks.length} fixtureImages=${imageCalls} fixtureText=${textCalls} pendingAccepted=0 productionCalls=0`);
 }finally{
  if(db){const {closeImageCoordinationPool}=await import("../src/lib/imagegen/coordination-pool");await closeImageCoordinationPool();await db.getPool().end();}
  await f.cleanup();await rm(media,{recursive:true,force:true});
  const cleanup={schema:f.schemaName,schemaDropped:true,queryPoolClosed:!!db,coordinationPoolClosed:!!db,fixturePoolsClosed:true,loopbackServerClosed:true,temporaryMediaRemoved:true};
  await writeFile(join(out,label+"-cleanup.json"),JSON.stringify(cleanup,null,2)+"\n");
  console.log("WORKBENCH_CLEANUP=PASS schemaDropped=true poolsClosed=true loopbackServerClosed=true temporaryMediaRemoved=true");
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
