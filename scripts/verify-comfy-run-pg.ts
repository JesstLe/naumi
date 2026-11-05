/** Original public HTTP handlers, real native auth, isolated PG and loopback
 * Comfy protocol. No production service, supplier credential or replacement
 * business dependency. Baseline imports the entire saved source checkout. */
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {createRequire} from "node:module";
import {mkdir,writeFile,readFile,rm} from "node:fs/promises";
import path from "node:path";
import {build} from "esbuild";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1]},root=path.resolve(arg("--source-root")||"."),baseline=process.argv.includes("--baseline"),out=path.resolve(arg("--out")||path.join(process.env.COMFY_RUN_EVIDENCE||"output/comfy-run-pg","run"));
async function main(){
  await mkdir(out,{recursive:true});
  let mode="normal",prompts=0,uploads=0,unexpected=0;const wires:any[]=[];
  const png=await sharp({create:{width:96,height:64,channels:3,background:"#b6d4ef"}}).png().toBuffer();
  const f=await createModelFixture(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    const url=new URL(req.url!,"http://fixture.test");res.setHeader("content-type","application/json");
    if(url.pathname==="/object_info"){res.end(JSON.stringify(mode==="missing"?{}:{LoadImage:{},CLIPTextEncode:{},KSampler:{},SaveImage:{},SaveVideo:{}}));return;}
    if(url.pathname==="/upload/image"){uploads++;res.end(JSON.stringify({name:"input.png"}));return;}
    if(url.pathname==="/prompt"){prompts++;wires.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));res.end(JSON.stringify({prompt_id:"prompt-"+prompts}));return;}
    if(url.pathname.startsWith("/history/")){const id=url.pathname.split("/").at(-1)!;res.end(JSON.stringify({[id]:{status:{completed:true,status_str:"success"},outputs:{"4":{images:[{filename:"a.png"},{filename:"b.png"}]}}}}));return;}
    if(url.pathname==="/view"){if(mode==="fail-output"&&url.searchParams.get("filename")==="b.png"){res.statusCode=502;res.end(JSON.stringify({error:"fixture interrupted second output"}));return;}res.setHeader("content-type","image/png");res.end(png);return;}
    unexpected++;res.statusCode=404;res.end(JSON.stringify({error:"unexpected fixture endpoint"}));
  });
  Object.assign(process.env,{PGOPTIONS:"-c search_path="+f.schemaName,NAUMI_MULTI_USER:"1",NAUMI_APPLICATION_TASK_EXECUTION:"worker",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"0",MEDIA_DIR:path.join(out,"media"),USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK:"true",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"comfy-r6q-local-management-only",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin});
  let api:any,pool:any,checks=0;const cases:string[]=[],eq=(a:unknown,b:unknown,label="")=>{assert.deepEqual(a,b,label);checks++;},pass=(label:string)=>cases.push(label);
  try{
    const names={db:"src/lib/db.ts",route:"src/app/api/comfyui/run/route.ts",auth:"src/lib/native-auth.ts",comfy:"src/lib/comfyui/repository.ts",workflow:"src/lib/comfyui/workflow.ts",creation:"src/lib/saas/creation-schema.ts",scope:"src/lib/saas/creation-scope.ts",coord:"src/lib/imagegen/coordination-pool.ts"};
    const file=path.join(out,"actual.cjs"),source=Object.entries(names).map(([name,file])=>`export * as ${name} from ${JSON.stringify(path.join(root,file).replaceAll("\\","/"))};`).join("\n");
    const bundled=await build({stdin:{contents:source,resolveDir:root,loader:"ts"},outfile:file,bundle:true,metafile:true,platform:"node",format:"cjs",external:["pg","sharp"],alias:{"server-only":path.resolve("scripts/fleet-server-only.cjs")},tsconfig:path.join(root,"tsconfig.json")});
    await writeFile(path.join(out,"SOURCE_INPUTS.json"),JSON.stringify(Object.keys(bundled.metafile!.inputs).filter(p=>p.includes("src/")),null,2)+"\n");
    api=createRequire(import.meta.url)(file);await api.db.ensureSchema();await api.creation.ensureCreationSchema();pool=api.db.getPool();
    const owner="comfy-"+randomUUID()+"@fixture.test",other="other-"+randomUUID()+"@fixture.test";await api.db.getOrCreateUser(owner);await api.db.getOrCreateUser(other);
    const image="data:image/png;base64,"+png.toString("base64"),sourceId="comfy-source";
    await api.db.addArtworks(owner,[{id:sourceId,title:"Original",category:"main",prompt:"original",status:"completed",image,gradient:"",groupId:"comfy-project",width:96,height:64}]);
    await api.comfy.saveComfyEndpoint(owner,{name:"fixture",baseUrl:f.origin,apiKey:"fixture-local-only",activate:true});
    const workflow={"1":{class_type:"LoadImage",inputs:{image:"old.png"}},"2":{class_type:"CLIPTextEncode",inputs:{text:"old text"}},"3":{class_type:"KSampler",inputs:{positive:["2",0],seed:1,width:96,height:64}},"4":{class_type:"SaveImage",inputs:{images:["1",0]}}};
    const saved=await api.comfy.saveComfyWorkflow(owner,{name:"Fixture image",apiJson:workflow,inputs:api.workflow.extractWorkflowInputs(workflow),required:[]}),workflowId=saved[0].id;
    let serial=0;const cookie=(who=owner)=>"nv_user="+api.auth.signUserSession(who,Date.now());
    const call=async(body:Record<string,unknown>,who=owner)=>{const response=await api.route.POST(new Request("http://fixture.test/api/comfyui/run",{method:"POST",headers:{cookie:cookie(who),origin:"http://fixture.test","content-type":"application/json","cf-connecting-ip":"198.18.0."+(++serial),"x-naumi-canvas":"1","x-naumi-workspace":"personal","x-naumi-project-context":"tree:comfy-project"},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};
    const receipt=async(operation:string,who=owner,workspace="personal")=>{const response=await api.route.GET(new Request("http://fixture.test/api/comfyui/run?operationId="+encodeURIComponent(operation),{headers:{cookie:cookie(who),"x-naumi-workspace":workspace}}));return {status:response.status,body:await response.json(),cache:response.headers.get("cache-control")};};
    const payload={artworkId:sourceId,workflowId,texts:{"2":"new prompt"},seeds:{"3":42},numerics:{"3":{width:128}},idempotencyKey:"normal-"+randomUUID()};
    let r:{status:number;body:any;cache?:string}=await call(payload);eq(r.status,200);eq(r.body.images.length,2);eq(wires[0].prompt["1"].inputs.image,"input.png");eq(wires[0].prompt["2"].inputs.text,"new prompt");eq(wires[0].prompt["3"].inputs.seed,42);eq(wires[0].prompt["3"].inputs.width,128);
    const savedIds=r.body.images.map((a:any)=>a.id);const rows=(await pool.query("SELECT id,parent_id,group_id FROM app_artworks WHERE id=ANY($1::text[]) ORDER BY id",[savedIds])).rows;eq(rows.length,2);for(const row of rows){eq(row.parent_id,sourceId);eq(row.group_id,"comfy-project");}
    for(const output of r.body.images){const bytes=await readFile(path.join(out,"media",output.url.slice("/media/".length)));eq(createHash("sha256").update(bytes).digest("hex"),createHash("sha256").update(png).digest("hex"));}pass("original protocol overrides, saved bytes and lineage");
    const beforePrompts=prompts;r=await call(payload);eq(r.status,409);eq(prompts,beforePrompts);pass("same original operation never runs supplier twice");
    if(!baseline){r=await receipt(payload.idempotencyKey);eq(r.status,200);eq(r.body.state,"completed");eq(r.body.images.map((a:any)=>a.id),savedIds);eq(r.cache,"private, no-store");eq((await receipt(payload.idempotencyKey,other)).status,404);eq((await receipt(payload.idempotencyKey,owner,randomUUID())).status,404);eq((await receipt("not-visible")).status,404);pass("owner/workspace receipt reads preserve original output order and no cache");}
    mode="fail-output";const interrupted="interrupted-"+randomUUID();r=await call({...payload,idempotencyKey:interrupted});eq(r.status,502);
    const c=(await pool.query("SELECT id,status FROM app_creation_records WHERE source_kind='comfyui' AND source_id=$1",[interrupted])).rows[0];eq(c.status,"needs_review");
    const links=(await pool.query("SELECT target_id FROM app_creation_links WHERE creation_id=$1 AND relation='output'",[c.id])).rows;eq(links.length,1);
    const interruptedPrompts=prompts;
    if(!baseline){r=await receipt(interrupted);eq(r.status,200);eq(r.body.state,"partial");eq(r.body.images.length,1);eq(prompts,interruptedPrompts);}pass("first persisted output survives later output failure without supplier replay");
    mode="missing";const missing="missing-"+randomUUID();r=await call({...payload,idempotencyKey:missing});eq(r.status,400);eq(prompts,interruptedPrompts);eq((await pool.query("SELECT status FROM app_creation_records WHERE source_id=$1",[missing])).rows[0].status,baseline?"queued":"failed");if(!baseline){r=await receipt(missing);eq(r.body.state,"failed");}pass("missing-node preflight records definitive failure instead of permanently queued evidence");
    mode="normal";const concurrent="concurrent-"+randomUUID(),beforeConcurrent=prompts;
    const results=await Promise.all(Array.from({length:4},()=>call({...payload,idempotencyKey:concurrent})));eq(results.map(r=>r.status).sort(),[200,409,409,409]);eq(prompts,beforeConcurrent+1);pass("real PG claim serializes four simultaneous original requests");
    const foreign=await call({...payload,idempotencyKey:"foreign-"+randomUUID()},other);eq(foreign.status,404);eq(prompts,beforeConcurrent+1);pass("foreign artwork cannot reach supplier");
    const videoWorkflow={"1":{class_type:"SaveVideo",inputs:{}}};const videos=await api.comfy.saveComfyWorkflow(owner,{name:"Fixture video",apiJson:videoWorkflow,inputs:api.workflow.extractWorkflowInputs(videoWorkflow),required:[]}),videoId=videos.find((w:any)=>w.name==="Fixture video").id;
    const videoOp="video-"+randomUUID();r=await call({workflowId:videoId,idempotencyKey:videoOp,source:"canvas",projectKey:"tree:comfy-project"});eq(r.status,202);assert.ok(r.body.taskId);checks++;const videoTask=r.body.taskId;
    eq((await pool.query("SELECT cost FROM app_video_tasks WHERE id=$1",[videoTask])).rows[0].cost,0);
    if(!baseline){r=await receipt(videoOp);eq(r.status,200);eq(r.body.state,"submitted");eq(r.body.taskId,videoTask);}pass("video 202 retains original zero-cost durable task owner");
    const observations={ledger:(await pool.query("SELECT kind,delta FROM app_ledger")).rows,billing:(await pool.query("SELECT id,feature,state,reserved_credits,charged_credits FROM app_billing_operations")).rows,unexpected,prompts,uploads};
    await writeFile(path.join(out,"OBSERVATIONS.json"),JSON.stringify(observations,null,2)+"\n");
    eq((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume'")).rows[0].n,0,"BYOC customer consumes");eq(observations.billing.filter((row:any)=>row.feature!=="credits.grant").length,0,"BYOC adds no billing operations; signup grants retained");eq(unexpected,0,"fixture unexpected HTTP");pass("BYOC uses no customer billing operation or debit");
    const result={status:"PASS",mode:baseline?"BASELINE":"MODIFIED",cases,checks,realPG:true,actualHTTP:true,nativeAuth:true,fullSourceRoot:root,prompts,uploads,wires,productionCalls:0};await writeFile(path.join(out,"RESULT.json"),JSON.stringify(result,null,2)+"\n");
    console.log(`COMFY_RUN_PG=PASS MODE=${result.mode} CASES=${cases.length} CHECKS=${checks} REAL_PG=1 ACTUAL_HTTP=1 NATIVE_AUTH=1 SAVED_PARTIAL=1 RECEIPT_GET=${baseline?0:1} CONCURRENT=4 CUSTOMER_CONSUMES=0 PRODUCTION_CALLS=0`);
  }finally{
    if(api?.coord?.closeImageCoordinationPool)await api.coord.closeImageCoordinationPool();await pool?.end();await f.cleanup();
    const media=path.resolve(out,"media");assert.ok(media.startsWith(out+path.sep));await rm(media,{recursive:true,force:true});
    console.log("COMFY_RUN_CLEANUP=PASS OWN_SCHEMA_DROPPED=1 POOLS_CLOSED=1 LOOPBACK_CLOSED=1 OWN_MEDIA_REMOVED=1");
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
