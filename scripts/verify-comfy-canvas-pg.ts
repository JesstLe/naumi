/** Real isolated PG + native HTTP handlers; no production data or supplier. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {build} from "esbuild";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1]},root=path.resolve(arg("--source-root")||"."),baseline=process.argv.includes("--baseline"),out=path.resolve(arg("--out")||"output/comfy-canvas-pg");
async function main(){
 await mkdir(out,{recursive:true});let endpointCalls=0,prompts=0;const wires:any[]=[];
 const png=await sharp({create:{width:32,height:32,channels:3,background:"#a5b4fc"}}).png().toBuffer();
 const definitions={StringNode:{input:{required:{text:["STRING"]}}},CustomSink:{input:{required:{text:["STRING"],enabled:["BOOLEAN"],count:["INT"]}}},SaveImage:{input:{required:{images:["IMAGE"],filename_prefix:["STRING"]}}}};
 const f=await createModelFixture(async(req,res)=>{endpointCalls++;res.setHeader("content-type","application/json");const u=new URL(req.url!,"http://fixture.test");
  if(u.pathname==="/object_info"){res.end(JSON.stringify(definitions));return;}
  if(u.pathname==="/prompt"){const chunks=[];for await(const c of req)chunks.push(c);wires.push(JSON.parse(Buffer.concat(chunks).toString()));prompts++;res.end(JSON.stringify({prompt_id:`p-${prompts}`}));return;}
  if(u.pathname.startsWith("/history/")){res.end(JSON.stringify({[u.pathname.split("/").at(-1)!]:{status:{completed:true,status_str:"success"},outputs:{"2":{images:[{filename:"out.png"}]}}}}));return;}
  if(u.pathname==="/view"){res.setHeader("content-type","image/png");res.end(png);return;}res.statusCode=404;res.end("{}");
 });
 Object.assign(process.env,{PGOPTIONS:"-c search_path="+f.schemaName,NAUMI_MULTI_USER:"1",NAUMI_APPLICATION_TASK_EXECUTION:"worker",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"0",MEDIA_DIR:path.join(out,"media"),USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK:"true",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"local-fixture"});
 let api:any,pool:any,checks=0;const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 try{
  const files:Record<string,string>={db:"src/lib/db.ts",auth:"src/lib/native-auth.ts",library:"src/app/api/comfyui/workflows/route.ts",run:"src/app/api/comfyui/run/route.ts",repo:"src/lib/comfyui/repository.ts",coord:"src/lib/imagegen/coordination-pool.ts"};
  if(!baseline)Object.assign(files,{document:"src/lib/comfyui/document.ts",nodes:"src/app/api/canvas/comfy-nodes/route.ts",node:"src/app/api/canvas/comfy-nodes/[id]/route.ts",history:"src/app/api/canvas/history/route.ts",copy:"src/lib/canvas/node-copy.ts",del:"src/app/api/canvas/nodes/delete/route.ts"});
  const outfile=path.join(out,"routes.cjs"),source=Object.entries(files).map(([key,file])=>`export * as ${key} from ${JSON.stringify(path.join(root,file).replaceAll("\\","/"))};`).join("\n");
  await build({stdin:{contents:source,resolveDir:root,loader:"ts"},outfile,bundle:true,platform:"node",format:"cjs",external:["pg","sharp"],alias:{"server-only":path.resolve("scripts/fleet-server-only.cjs")},tsconfig:path.join(root,"tsconfig.json")});
  api=createRequire(import.meta.url)(outfile);await api.db.ensureSchema();pool=api.db.getPool();
  const actor=`comfy-${randomUUID()}@fixture.test`,foreign=`foreign-${randomUUID()}@fixture.test`;await api.db.getOrCreateUser(actor);await api.db.getOrCreateUser(foreign);
  let serial=1;const req=(url:string,body?:unknown,options:{actor?:string;method?:string;project?:string;workspace?:string}={})=>new Request("http://fixture.test"+url,{method:options.method||(body?"POST":"GET"),headers:{cookie:"nv_user="+api.auth.signUserSession(options.actor||actor,Date.now()),origin:"http://fixture.test","content-type":"application/json","cf-connecting-ip":`198.18.0.${serial++}`,"x-naumi-workspace":options.workspace||"personal",...(options.project?{"x-naumi-project-context":options.project}:{}),"x-naumi-canvas":"1"},...(body?{body:JSON.stringify(body)}:{})});
  const bodyOf=async(response:Response)=>({status:response.status,body:await response.json()});
  const ui={version:.4,extra:{keep:"original"},nodes:[{id:1,type:"StringNode",pos:[0,0],widgets_values:["cat"],outputs:[{name:"TEXT"}]},{id:2,type:"CustomSink",pos:[380,0],widgets_values:[false,0],inputs:[{name:"text",link:1}]}],links:[[1,1,0,2,0,"STRING"]],groups:[]};
  const imported=await bodyOf(await api.library.POST(req("/api/comfyui/workflows",{name:"离线导入",json:JSON.stringify(ui)})));
  eq(imported.status,baseline?400:200);eq(endpointCalls,0);
  if(baseline){const result={status:"PASS",mode:"BASELINE",uiImportStatus:imported.status,graphAvailable:false,endpointCalls};await writeFile(path.join(out,"RESULT.json"),JSON.stringify(result,null,2));console.log("COMFY_CANVAS_BASELINE=PASS UI_IMPORT=400 CANVAS_GRAPH=ABSENT ENDPOINT_CALLS=0");return;}
  eq(imported.body.document.raw,ui);assert.ok(imported.body.savedId);checks++;
  let r=await bodyOf(await api.library.GET(req(`/api/comfyui/workflows?id=${imported.body.savedId}`)));eq(r.body.workflow.document.raw,ui);
  eq((await bodyOf(await api.library.GET(req(`/api/comfyui/workflows?id=${imported.body.savedId}`,undefined,{actor:foreign})))).status,404);
  const nodeId=`comfy-${randomUUID()}`,project=`tree:${nodeId}`,write={id:nodeId,projectKey:project,expectedRevision:0,operationId:randomUUID(),title:"可离线编辑的工作流",workflow:imported.body.document,x:100,y:80};
  r=await bodyOf(await api.nodes.POST(req("/api/canvas/comfy-nodes",write)));assert.equal(r.status,201,JSON.stringify(r.body));checks++;let node=r.body.node;eq(node.workflow.raw,ui);eq(node.revision,1);
  const replay=await bodyOf(await api.nodes.POST(req("/api/canvas/comfy-nodes",write)));eq(replay.body.node.revision,1);
  const context={params:Promise.resolve({id:nodeId})};
  r=await bodyOf(await api.node.GET(req(`/api/canvas/comfy-nodes/${nodeId}`,undefined,{project}),context));eq(r.body.node.workflow.raw,ui);
  eq((await bodyOf(await api.node.GET(req(`/api/canvas/comfy-nodes/${nodeId}`,undefined,{actor:foreign}),context))).status,404);
  const changed=api.document.editComfyField(node.workflow,"1","0","updated prompt");changed.positions={"1":{x:60,y:100}};
  r=await bodyOf(await api.node.PATCH(req(`/api/canvas/comfy-nodes/${nodeId}`,{id:nodeId,expectedRevision:1,operationId:randomUUID(),workflow:changed},{method:"PATCH",project}),context));eq(r.status,200);node=r.body.node;eq(node.revision,2);eq(node.workflow.raw.nodes[0].widgets_values,["updated prompt"]);
  r=await bodyOf(await api.node.PATCH(req(`/api/canvas/comfy-nodes/${nodeId}`,{id:nodeId,expectedRevision:1,operationId:randomUUID(),title:"stale"},{method:"PATCH",project}),context));eq(r.status,409);
  r=await bodyOf(await api.history.POST(req("/api/canvas/history",{operationId:randomUUID(),operations:[{type:"comfy-patch",id:nodeId,expectedRevision:2,fields:{workflow:{...changed,collapsed:true}}}]},{project})));eq(r.status,200);eq(r.body.nativeNodes.comfyNodes[0].workflow.collapsed,true);
  r=await bodyOf(await api.history.POST(req("/api/canvas/history",{operationId:randomUUID(),operations:[{type:"comfy-patch",id:nodeId,expectedRevision:3,fields:{workflow:changed}}]},{project})));eq(r.status,200);eq(r.body.nativeNodes.comfyNodes[0].workflow.collapsed,false);
  r=await bodyOf(await api.run.POST(req("/api/comfyui/run",{workflowId:`canvas-comfy:${nodeId}`,workflowRevision:4,idempotencyKey:randomUUID()},{project})));eq(r.status,400);eq(r.body.accepted,false);eq(endpointCalls,0);
  await api.repo.saveComfyEndpoint(actor,{name:"loopback",baseUrl:f.origin,activate:true});
  const runId=randomUUID();r=await bodyOf(await api.run.POST(req("/api/comfyui/run",{workflowId:`canvas-comfy:${nodeId}`,workflowRevision:4,idempotencyKey:runId},{project})));eq(r.status,200);eq(r.body.images.length,1);eq(wires[0].prompt["1"].inputs.text,"updated prompt");eq(wires[0].prompt["2"].inputs.enabled,false);eq(wires[0].prompt["2"].inputs.count,0);
  const art=(await pool.query("SELECT group_id,origin,parent_id FROM app_artworks WHERE id=$1",[r.body.images[0].id])).rows[0];eq(art.group_id,nodeId);eq(art.origin,"canvas");eq(art.parent_id,null);
  const before=prompts;r=await bodyOf(await api.run.POST(req("/api/comfyui/run",{workflowId:`canvas-comfy:${nodeId}`,workflowRevision:4,idempotencyKey:runId},{project})));eq(r.status,409);eq(prompts,before);
  // Existing server-side copy owner; new aggregate stays a single native record.
  const copy=await api.copy.copyCanvasNodes(actor,{ids:[nodeId],operationId:randomUUID(),projectKey:project});eq(copy.comfyNodes.length,1);eq(copy.comfyNodes[0].workflow,changed);
  r=await bodyOf(await api.del.POST(req("/api/canvas/nodes/delete",{comfyIds:[copy.comfyNodes[0].id],operationId:randomUUID()},{project})));eq(r.status,200);assert.ok(r.body.nativeNodes.comfyNodes[0].deletedAt);checks++;
  const restarted=await bodyOf(await api.node.GET(req(`/api/canvas/comfy-nodes/${nodeId}`,undefined,{project}),context));eq(restarted.body.node.workflow,changed);
  eq((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume'")).rows[0].n,0);
  const result={status:"PASS",mode:"MODIFIED",checks,uiImportStatus:imported.status,noEndpointImport:true,rawPreserved:true,revisionConflict:true,history:true,copyDelete:true,persistedReload:true,sourceLessRun:true,prompts,endpointCalls,productionCalls:0};
  await writeFile(path.join(out,"RESULT.json"),JSON.stringify(result,null,2)+"\n");console.log(`COMFY_CANVAS_PG=PASS CHECKS=${checks} NO_ENDPOINT_EDIT=1 UI_RUN=1 CAS=1 UNDO=1 COPY_DELETE=1 RELOAD=1 CUSTOMER_CONSUMES=0 PRODUCTION_CALLS=0`);
 }finally{await api?.coord.closeImageCoordinationPool();await pool?.end();await f.cleanup();console.log("COMFY_CANVAS_CLEANUP=PASS OWN_SCHEMA_DROPPED=1 LOOPBACK_CLOSED=1");}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
