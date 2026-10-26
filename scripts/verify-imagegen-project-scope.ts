/** Actual modules + isolated PostgreSQL. No supplier network or live DB access. */
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {mkdtemp,mkdir,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {Pool} from "pg";
import sharp from "sharp";

const baseline=process.argv.includes("--baseline");
const wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");assert.equal(new URL(process.env.DATABASE_URL!).hostname,"127.0.0.1");
 const admin=new Pool({connectionString:process.env.DATABASE_URL}),schema="scope_fix_"+randomUUID().replaceAll("-","");
 await admin.query(`CREATE SCHEMA ${schema}`);process.env.PGOPTIONS=`-c search_path=${schema}`;
 const media=await mkdtemp(join(tmpdir(),"naumi-scope-"));
 Object.assign(process.env,{SETTINGS_SECRET:"scope-regression-local-only-secret-20261026",STORAGE_DRIVER:"local",MEDIA_DIR:media,MEDIA_PRIVATE:"1",NAUMI_VIDEO_WORKER:"0",NAUMI_RELEASE_RUNTIME:"0",NAUMI_MULTI_USER:"1"});
 let network=0;const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{network++;throw Error("NO_NETWORK_IN_SCOPE_REGRESSION");};
 const checks:string[]=[],check=(name:string,ok:unknown)=>{assert.ok(ok,name);checks.push(name);console.log("PASS "+name);};
 const db=await import("../src/lib/db"),creation=await import("../src/lib/saas/creation-context"),scope=await import("../src/lib/imagegen/creation-scope");
 const pool=db.getPool();
 try{
  await db.ensureSchema();await(await import("../src/lib/saas/creation-schema")).ensureCreationSchema();await(await import("../src/lib/billing/schema")).ensureBillingSchema(pool);
  const dispatch=await import("../src/lib/imagegen/dispatch"),quotes=await import("../src/lib/imagegen/quotes"),batch=await import("../src/lib/imagegen/batch");
  await quotes.ensureImagegenQuotes();await(await import("../src/lib/imagegen/batch-repository")).ensureImagegenBatches();
  const {imagegenFingerprint}=await import("../src/lib/imagegen/plan"),{imagegenRequestSchema}=await import("../src/lib/imagegen/schema");
  const owner="scope-owner@example.test",other="scope-other@example.test",root="art-upload-root",project="tree:"+root;
  await db.getOrCreateUser(owner,"scope owner");await db.getOrCreateUser(other,"scope other");
  const png=await sharp({create:{width:128,height:128,channels:3,background:"#3c85ce"}}).png().toBuffer();await mkdir(join(media,"generations"));await writeFile(join(media,"generations","scope-original.png"),png);
  async function artwork(id:string,group=root,email=owner){await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,group_id,origin) VALUES($1,$2,'fixture','main','','/media/generations/scope-original.png','',$3,'canvas')`,[id,email,group]);}
  await artwork(root);await artwork("art-other-project","art-other-project");await artwork("art-foreign","art-foreign",other);
  const context=(p=project,email=owner)=>({actorEmail:email,scopeKind:"personal" as const,tenantId:null,parentContext:p,workspaceExplicit:true});
  const oldScope={actorEmail:owner,scopeKind:"personal" as const,tenantId:null};
  const req=(id=randomUUID(),source=root)=>imagegenRequestSchema.parse({version:1,operationId:id,entry:"canvas",mode:"edit",sourceNodeId:source,prompt:"Retain the existing original image",inputs:[{artworkId:"asset-11111111-2222-4333-8444-555555555555",role:"edit-target",originalArtworkId:source,reference:{number:1,title:"original",sourceNodeId:source}}],parameters:{quality:"medium",resolution:"1K",ratio:"1:1"},output:{format:"png"}});
  const plan=(r=req())=>({request:r,fingerprint:imagegenFingerprint(r),intent:{operation:"edit" as const,background:null,conflicts:[],requirements:[]},steps:[{key:"generate",operation:"edit" as const,eligibleUpstreamIds:[],parameters:{},credits:6}],modelVersion:1,billingVersion:1,totalCredits:6,confirmationRequired:false,warnings:[]});
  async function parent(id:string,p:ReturnType<typeof plan>,saved:unknown,status="done",children:unknown={}){await pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered) VALUES($1,$2,'imagegen',$3::jsonb,$4::jsonb,false)`,["imagegen-"+id,owner,JSON.stringify({paidOperationVersion:1,status,result:{operationId:id,jobId:"imagegen-"+id,status:status==="done"?"succeeded":"pending",stage:"editing",artifacts:[],chargedCredits:0},fingerprint:p.fingerprint,children}),JSON.stringify({plan:p,creationScope:saved})]);}
  async function receipt(id:string,p=project,email=owner){return creation.withFrozenCreation(context(p,email),async()=>{await creation.bindActualCreationProject(email,p,{receipt:true});return dispatch.readImagegenReceipt(id,email);});}
  const legacy=req(),legacyPlan=plan(legacy);await parent(legacy.operationId,legacyPlan,oldScope);
  if(baseline){
   let accepted:any;await creation.withFrozenCreation(context(),async()=>{await creation.bindActualCreationProject(owner,project);accepted=structuredClone(creation.currentCreationContext());});
   check("baseline accepts with null parent",!accepted.parentContext);check("baseline receipt before output exists",await receipt(legacy.operationId));
   await artwork("art-first-output");await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id,status) VALUES('cr-first',$1,'personal','image:generate','job-first','succeeded')`,[owner]);await pool.query(`INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email,relation) VALUES('cr-first','artwork','art-first-output',$1,'output')`,[owner]);
   check("baseline same-owner existing task becomes unreadable after output",await receipt(legacy.operationId)===null);
   const rows=await pool.query("SELECT 1 FROM app_image_jobs WHERE id=$1 AND email=$2",["imagegen-"+legacy.operationId,owner]);check("baseline task still exists",rows.rowCount===1);
   check("baseline old own function positive control",await creation.withFrozenCreation(oldScope,()=>dispatch.readImagegenReceipt(legacy.operationId,owner)));
   console.log(`PROJECT_SCOPE=REPRODUCED CHECKS=${checks.length} NETWORK=${network} EXIT=1`);process.exitCode=1;return;
  }
  // A receipt authorizes an owned upload without mutating project bindings.
  const bindings=async()=>Number((await pool.query("SELECT count(*)::int n FROM app_creation_contexts WHERE context_kind='project'")).rows[0].n);
  const beforeBindings=await bindings();check("legacy receipt before first output allowed",await receipt(legacy.operationId));check("receipt does not create project binding",await bindings()===beforeBindings);
  await creation.withFrozenCreation(context(),async()=>{await creation.bindActualCreationProject(owner,project);check("new uploaded canvas freezes real project",creation.currentCreationContext()?.parentContext===project);});
  check("new submission binding persisted",await bindings()===beforeBindings+1);
  await artwork("art-first-output");await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id,status) VALUES('cr-first',$1,'personal','image:generate','job-first','succeeded')`,[owner]);await pool.query(`INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email,relation) VALUES('cr-first','artwork','art-first-output',$1,'output')`,[owner]);
  check("legacy receipt after first output allowed",await receipt(legacy.operationId));
  check("other personal project denied",await receipt(legacy.operationId,"tree:art-other-project")===null);
  check("other owner denied",await receipt(legacy.operationId,"tree:art-foreign",other)===null);
  const tenant={...context(),scopeKind:"tenant" as const,tenantId:"11111111-2222-4333-8444-555555555555"};
  check("tenant current scope cannot take personal task",await creation.withFrozenCreation(tenant,()=>dispatch.readImagegenReceipt(legacy.operationId,owner))===null);
  const noAnchor=req();delete noAnchor.sourceNodeId;noAnchor.inputs=[];noAnchor.mode="generate";await parent(noAnchor.operationId,plan(noAnchor),oldScope);check("legacy request without anchor denied",await receipt(noAnchor.operationId)===null);
  const newTask=req();await parent(newTask.operationId,plan(newTask),{...oldScope,parentContext:project});check("new frozen project matches",await receipt(newTask.operationId));check("new frozen project stays exact",await receipt(newTask.operationId,"tree:art-other-project")===null);
  const invalid=req();await parent(invalid.operationId,plan(invalid),{scopeKind:"personal"});check("malformed saved scope denied",await receipt(invalid.operationId)===null);
  const foreignAnchor=req(undefined,"art-foreign");await parent(foreignAnchor.operationId,plan(foreignAnchor),oldScope);check("foreign anchor denied",await receipt(foreignAnchor.operationId)===null);
  await creation.withFrozenCreation(tenant,async()=>{await assert.rejects(()=>scope.assertAcceptedImagegenCreationScope(oldScope,owner,legacy));});check("strict helper retains tenant boundary",true);
  // An old quote retains its original amount, including old-page latest lookup.
  const preview=req(),previewPlan=plan(preview),issued=await creation.withFrozenCreation(oldScope,()=>quotes.issueImagegenQuote(preview,owner,previewPlan));
  await creation.withFrozenCreation(context(),async()=>{const q=await quotes.readImagegenQuote(issued.quote!.id,owner,preview.operationId);check("legacy null quote exact anchor retains price",q.plan.totalCredits===6);check("legacy quote latest lookup reuses original",await quotes.latestImagegenQuote(preview,owner)===issued.quote!.id);});
  await creation.withFrozenCreation(context("tree:art-other-project"),async()=>{await assert.rejects(()=>quotes.readImagegenQuote(issued.quote!.id,owner,preview.operationId));check("legacy quote rejects other project",await quotes.latestImagegenQuote(preview,owner)===undefined);});
  // Batch receipts use the same stored request, never the caller's new inputs.
  const br=req(),bp={...plan(br),creationScope:oldScope};await pool.query(`INSERT INTO app_imagegen_batches(id,owner,fingerprint,request,plan,state) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,'succeeded')`,[br.operationId,owner,bp.fingerprint,JSON.stringify(br),JSON.stringify(bp)]);
  check("legacy batch receipt same project",await creation.withFrozenCreation(context(),()=>batch.readImagegenBatchReceipt(br.operationId,owner)));
  check("legacy batch receipt other project denied",await creation.withFrozenCreation(context("tree:art-other-project"),()=>batch.readImagegenBatchReceipt(br.operationId,owner))===null);
  const api=await import("../src/app/api/imagegen/route"),native=await import("../src/lib/native-auth"),generateApi=await import("../src/app/api/generate-image/route");
  const http=(id:string,p=project,email=owner,alternate=false)=>new Request(alternate?`http://scope-fixture/api/generate-image?job=imagegen-${id}`:`http://scope-fixture/api/imagegen?operationId=${id}`,{headers:{cookie:`${native.USER_COOKIE}=${native.signUserSession(email,Date.now())}`,"x-naumi-workspace":"personal","x-naumi-project-context":p}});
  check("real receipt HTTP route returns 200",(await api.GET(http(legacy.operationId))).status===200);
  check("legacy alternate HTTP route returns 200",(await generateApi.GET(http(legacy.operationId,project,owner,true))).status===200);
  check("real HTTP wrong project remains 404",(await api.GET(http(legacy.operationId,"tree:art-other-project"))).status===404);
  check("real HTTP other owner remains 404",(await api.GET(http(legacy.operationId,"tree:art-foreign",other))).status===404);
  // Real DurableImageJobs + runParent + SQL + creation writer reuse a done child.
  const complete=req(),cp=plan(complete),pid="imagegen-"+complete.operationId,child="job-"+randomUUID(),art="art-"+child,creationId="cr-"+randomUUID(),childCreation="cr-"+randomUUID();await artwork(art);
  await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id,status,parent_id) VALUES($1,$2,'personal','image:imagegen',$3,'queued',NULL),($4,$2,'personal','image:generate',$5,'succeeded',$1)`,[creationId,owner,pid,childCreation,child]);
  await pool.query(`INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email,relation) VALUES($1,'image:imagegen',$2,$3,'execution'),($4,'image:generate',$5,$3,'execution'),($4,'artwork',$6,$3,'output')`,[creationId,pid,owner,childCreation,child,art]);
  await parent(complete.operationId,cp,{...oldScope,creationId},"pending",{generate:{state:"submitted",jobId:child}});
  await pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered) VALUES($1,$2,'generate',$3::jsonb,$4::jsonb,false)`,[child,owner,JSON.stringify({paidOperationVersion:1,status:"done",images:[{id:art,url:"/media/generations/scope-original.png",width:128,height:128}]}),JSON.stringify({creationScope:{...oldScope,creationId:childCreation}})]);
  await pool.query(`INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,charged_credits,ledger_id) VALUES($1,$2,'image.generate','{}',$1,'settled',6,$3)`,[child,owner,"led-"+child]);
  await pool.query(`INSERT INTO app_ledger(id,email,kind,delta,reason) VALUES($1,$2,'consume',-6,'original fixture charge')`,["led-"+child,owner]);
  const frozen=await pool.query("SELECT payload FROM app_image_jobs WHERE id=$1",[pid]);const ledgerBefore=JSON.stringify((await pool.query("SELECT * FROM app_ledger WHERE email=$1 ORDER BY id",[owner])).rows);const billingBefore=JSON.stringify((await pool.query("SELECT * FROM app_billing_operations WHERE id=$1",[child])).rows);
  const completionResponse=await api.GET(http(complete.operationId));check("actual GET entry returns original parent",completionResponse.status===200);
  let final:any;for(let i=0;i<100;i++){final=(await pool.query("SELECT snapshot,lease_token FROM app_image_jobs WHERE id=$1",[pid])).rows[0];if(final.snapshot.status==="done"&&!final.lease_token)break;await wait(30);}
  check("actual parent finishes from original child",final.snapshot.status==="done"&&final.snapshot.result.status==="succeeded");check("original artifact and charged amount retained",final.snapshot.result.artifacts[0].artworkId===art&&final.snapshot.result.chargedCredits===6);
  check("parent creation becomes succeeded",(await pool.query("SELECT status FROM app_creation_records WHERE id=$1",[creationId])).rows[0].status==="succeeded");
  check("original ledger unchanged",JSON.stringify((await pool.query("SELECT * FROM app_ledger WHERE email=$1 ORDER BY id",[owner])).rows)===ledgerBefore);
  check("original billing unchanged",JSON.stringify((await pool.query("SELECT * FROM app_billing_operations WHERE id=$1",[child])).rows)===billingBefore);
  check("frozen original payload unchanged",JSON.stringify((await pool.query("SELECT payload FROM app_image_jobs WHERE id=$1",[pid])).rows)===JSON.stringify(frozen.rows));
  check("zero supplier or other network",network===0);
  const hashes:Record<string,string>={};for(const f of["src/lib/saas/creation-context.ts","src/lib/imagegen/creation-scope.ts","src/lib/imagegen/dispatch.ts","src/lib/imagegen/batch.ts","src/lib/imagegen/quotes.ts"])hashes[f]=createHash("sha256").update(await readFile(resolve(f))).digest("hex");console.log("SOURCE_HASHES="+JSON.stringify(hashes));
  console.log(`PROJECT_SCOPE=PASS CHECKS=${checks.length} NETWORK=${network} NEW_DEBITS=0 EXIT=0`);
 }finally{await(await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();globalThis.fetch=originalFetch;await rm(media,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=2;});
