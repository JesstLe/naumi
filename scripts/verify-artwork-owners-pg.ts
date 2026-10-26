/** Full-checkout artwork/Canvas/observation A/B against isolated PostgreSQL.
 * No supplier generation. Storage uses a new task-owned local directory. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdir,writeFile,rm} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {Pool,type PoolClient} from "pg";
import sharp from "sharp";

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");assert.equal(new URL(process.env.DATABASE_URL!).hostname,"127.0.0.1");
 const root=path.resolve(arg("--source-root")||"."),baseline=process.argv.includes("--baseline"),mode=baseline?"BASELINE":"MODIFIED",scenario=arg("--scenario");
 const out=path.resolve(process.env.ARTWORK_EVIDENCE||"output/refactor-r4a4-20261024"),load=(f:string)=>import(pathToFileURL(path.join(root,f)).href);
 await mkdir(out,{recursive:true});
 if(!scenario){let total=0;for(const part of ["artworks","observation"]){
  const args=["--conditions=react-server","--import","tsx",path.resolve("scripts/verify-artwork-owners-pg.ts"),"--source-root",root,"--scenario",part,...(baseline?["--baseline"]:[])];
  const c=spawn(process.execPath,args,{env:{...process.env,TSX_TSCONFIG_PATH:path.join(root,"tsconfig.json")},windowsHide:true,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";c.stdout.on("data",b=>stdout+=b);c.stderr.on("data",b=>stderr+=b);
  const status=await new Promise<number|null>((resolve,reject)=>{c.once("error",reject);c.once("exit",resolve);});await writeFile(path.join(out,`PG_${mode}_${part}.log`),stdout+stderr+`\nEXIT=${status}\n`);process.stdout.write(stdout);process.stderr.write(stderr);assert.equal(status,0,part);total+=Number(stdout.match(/CHECKS=(\d+)/)?.[1]||0);
 }console.log(`ARTWORK_OWNERS_PG=PASS mode=${mode} scenarios=2 checks=${total} SOURCE=FULL_CHECKOUT REAL_PG=1 OWNER=EXACT ROW_PROJECTION=EXACT MIXED_TX=ATOMIC REPLAY=ORIGINAL CONTEXT=ISOLATED STREAM=ACTUAL MEDIA_OWNER=PRESERVED SUPPLIER=0`);return;}
 const schema=`artowner_${randomUUID().replaceAll("-","")}`,admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false}),media=path.join(out,`media-${schema}`);await admin.query(`CREATE SCHEMA ${schema}`);await mkdir(media,{recursive:true});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,NAUMI_MULTI_USER:"1",SETTINGS_SECRET:"artwork-owner-fixture-012345678901234567890",MEDIA_DIR:media,MEDIA_PRIVATE:"1",STORAGE_DRIVER:"local"});
 const oldFetch=globalThis.fetch;let external=0;globalThis.fetch=(async()=>{external++;throw Error("External call forbidden in artwork fixture");}) as typeof fetch;
 let db:typeof import("../src/lib/db")|undefined,checks=0;
 const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;},ok=(v:unknown)=>{assert.ok(v);checks++;},reject=async(p:Promise<unknown>,match?:RegExp)=>{if(match)await assert.rejects(p,match);else await assert.rejects(p);checks++;};
 try{
  db=await load("src/lib/db.ts");const pool=db!.getPool();await db!.ensureSchema();
  const modules=baseline?[db]:await Promise.all(["artworks/repository","artworks/writer","artworks/administration","canvas/artwork-repository","canvas/project-repository","canvas/text-node-repository","canvas/node-deletion"].map(m=>load(`src/lib/${m}.ts`)));
  const api=Object.assign({},...modules) as typeof import("../src/lib/db");
  if(!baseline)for(const loaded of modules)for(const [name,fn] of Object.entries(loaded))if(typeof fn==="function"&&name in db!)eq(fn,(db as unknown as Record<string,unknown>)[name]);
  const owner="art-owner@fixture.test",other="art-other@fixture.test";await db!.getOrCreateUser(owner);await db!.getOrCreateUser(other);
  const art=(id:string,extra:Partial<import("../src/lib/artworks/types").ArtworkRecord>={})=>({id,title:id,category:"main",prompt:"fixture",status:"completed",image:`/media/${id}.png`,gradient:"",...extra});
  if(scenario==="artworks"){
   await api.addArtworks(owner,[art("root",{style:"",ratio:"16:9",resolution:"2K",source:"canvas-add",width:0,height:0,canvasWidth:300,canvasHeight:200,origin:"canvas",processingKind:"base",postprocessStatus:"failed-kept-base",videoUrl:"",parentIds:[],batchId:"batch-original"})]);
   await api.addArtworks(owner,[art("child",{parentId:"root",parentIds:["root"],source:"/media/root.png"})]);await api.addArtworks(other,[art("foreign")]);
   await pool.query("UPDATE app_artworks SET created_at='2020-01-02',canvas_x=0,canvas_y=-10,marked=false WHERE email=$1",[owner]);
   const selected=await api.listArtworksByIds(owner.toUpperCase(),["root","child","foreign",""]);eq(selected.length,2);eq(selected.find(a=>a.id==="child")?.groupId,"root");eq(await api.listArtworksByIds(other,["root"]),[]);
   const rows=await api.listArtworks(owner),rootRow=rows.find(a=>a.id==="root")!;eq(rootRow,selected.find(a=>a.id==="root"));eq([rootRow.style,rootRow.width,rootRow.height,rootRow.canvasX,rootRow.canvasY,rootRow.marked,rootRow.videoUrl],["",0,0,0,-10,false,""]);
   await api.addArtworks(other,[art("root",{prompt:"foreign overwrite"})]);await api.addArtworks(owner,[art("root",{prompt:"same-id overwrite"})]);eq((await api.listArtworksByIds(owner,["root"]))[0].prompt,"fixture");
   const preview=await api.getWorkbenchArtworks(owner,new Date("2020-01-01"),new Date("2020-01-03"));eq(preview.stats,{total:2,today:2});eq(preview.artworks.length,2);
   eq(await api.setArtworkDimensions(other,"root",1280,720),false);eq(await api.setArtworkDimensions(owner,"root",1280.4,720.4),true);eq(await api.setArtworkDimensions(owner,"root",Infinity,1),false);
   await api.renameArtwork(owner,"root"," new title ");eq((await api.listArtworksByIds(owner,["root"]))[0].title,"new title");
   eq(await api.setArtworkPosition(owner,"root",0,-12),true);eq(await api.setArtworkCanvasLayout(owner,"root",2,3,320,240),true);eq(await api.setArtworkCanvasSize(owner,"root",400,300),true);eq(await api.setArtworkMarked(owner,"root",true),true);
   eq(await api.setArtworkCanvasLayout(other,"root",2,3,320,240),false);const moved=(await api.listArtworksByIds(owner,["root"]))[0];eq([moved.canvasX,moved.canvasY,moved.canvasWidth,moved.canvasHeight,moved.width,moved.marked],[2,3,400,300,1280,true]);
   await api.setArtworkCanvasGroups(owner,[{id:"root",canvasGroupId:" editors "},{id:"child",canvasGroupId:"editors"}]);eq((await api.listArtworksByIds(owner,["child"]))[0].canvasGroupId,"editors");
   await api.addArtworks(owner,[art("separate")]);await reject(api.setArtworkCanvasGroups(owner,[{id:"separate",canvasGroupId:"editors"}]),/跨项目/);eq((await api.listArtworksByIds(owner,["separate"]))[0].canvasGroupId,null);
   await api.addArtworks(owner,[art("sibling",{groupId:"root"})]);await api.addArtworkParent(owner,"sibling","child");await reject(api.addArtworkParent(owner,"child","sibling"),/循环/);await api.removeArtworkParent(owner,"sibling","child");eq((await api.listArtworksByIds(owner,["sibling"]))[0].parentIds,[]);await reject(api.addArtworkParent(other,"root","child"),/无权/);
   await api.setProjectName(owner,"tree:root"," Project ");eq(await api.getProjectNames(owner),{"tree:root":"Project"});eq(await api.getProjectNames(other),{});await api.deleteProjectName(other,"tree:root");eq((await api.getProjectNames(owner))["tree:root"],"Project");
   const beforeDelete=(await api.listArtworksByIds(owner,["root"]))[0];eq(await api.deleteArtworksByIds(other,["root"]),0);eq(await api.deleteArtworksByIds(owner,["root"]),1);eq(await api.listArtworksByIds(owner,["root"]),[]);const deleted=(await api.listDeletedArtworks(owner)).find(a=>a.id==="root")!;eq(deleted,beforeDelete);
   const tx=await pool.connect();try{await tx.query("BEGIN");await api.addArtworksTx(tx,owner,[art("root")],undefined,"preserve");await tx.query("COMMIT");}finally{tx.release();}eq(await api.listArtworksByIds(owner,["root"]),[]);
   await api.addArtworks(owner,[art("root")]);eq((await api.listArtworksByIds(owner,["root"]))[0].title,"new title");eq(await api.purgeArtworksByIds(owner,["root"]),0);eq(await api.undeleteArtworksByIds(owner,["root"]),0);
   const rolled=await pool.connect();try{await rolled.query("BEGIN");await api.addArtworksTx(rolled,owner,[art("rolled-back")]);await rolled.query("ROLLBACK");}finally{rolled.release();}eq(await api.listArtworksByIds(owner,["rolled-back"]),[]);
   await api.addArtworks(owner,[art("purge-me")]);await api.deleteArtworksByIds(owner,["purge-me"]);eq(await api.purgeArtworksByIds(other,["purge-me"]),0);eq(await api.purgeArtworksByIds(owner,["purge-me"]),1);
   const tpl={templateId:"fixture-template",image:"/media/template.png",prompt:"original template",title:"Template"};const templateRoot=await api.ensureTemplateRoot(owner,tpl);ok(templateRoot);eq(await api.ensureTemplateRoot(owner,tpl),templateRoot);eq(await api.ensureTemplateRoot(owner,{...tpl,image:""}),null);
   const adminRows=await api.listAllArtworks();ok(adminRows.artworks.some(a=>a.email===other));eq((await api.getArtworkById("root"))?.email,owner);eq(await api.getArtworkById("absent"),null);eq(await api.importedArtworkIds([]),[]);
   await api.addArtworks(owner,[art("admin-empty",{image:""})]);eq(await api.deleteArtwork("admin-empty"),true);eq(await api.deleteArtwork("admin-empty"),false);
   const text={id:"text",projectKey:"tree:root",title:"Text",prompt:"original",content:"answer",status:"completed" as const,canvasX:0,canvasY:-5,width:320,height:200,createdAt:"2020-01-01T00:00:00Z",updatedAt:"2020-01-01T00:00:00Z",sourceIds:["root"],targetIds:[],productIds:[]};
   eq((await api.upsertCanvasTextNode(owner,text)).content,"answer");await reject(api.upsertCanvasTextNode(other,{...text,content:"foreign"}),/无权/);eq((await api.listCanvasTextNodes(owner))[0].content,"answer");eq(await api.deleteCanvasTextNodes(other,["text"]),0);
   await reject(api.deleteCanvasNodesAtomically(owner,["root"],["missing"],[],randomUUID()),/无权/);eq((await api.listArtworksByIds(owner,["root"])).length,1);
   // A real failing second-table DELETE must roll back the earlier artwork soft delete.
   await pool.query(`CREATE FUNCTION fixture_delete_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture delete failure'; END $$; CREATE TRIGGER fixture_text_failure BEFORE DELETE ON app_canvas_text_nodes FOR EACH ROW EXECUTE FUNCTION fixture_delete_failure()`);
   await reject(api.deleteCanvasNodesAtomically(owner,["root"],["text"],[],randomUUID()),/fixture delete failure/);eq((await api.listArtworksByIds(owner,["root"])).length,1);eq((await api.listCanvasTextNodes(owner)).length,1);await pool.query("DROP TRIGGER fixture_text_failure ON app_canvas_text_nodes");
   const operation=randomUUID(),receipt=await api.deleteCanvasNodesAtomically(owner,["root"],["text"],[],operation);eq({artworks:receipt.artworks,textNodes:receipt.textNodes,videoNodes:receipt.videoNodes},{artworks:1,textNodes:1,videoNodes:0});eq(receipt.artworkIds,["root"]);eq(receipt.artworkNodes,[{node:(await api.listDeletedArtworks(owner)).find(a=>a.id==="root"),visible:false}]);eq(await api.deleteCanvasNodesAtomically(owner,["root"],["text"],[],operation),receipt);await reject(api.deleteCanvasNodesAtomically(owner,["child"],[],[],operation),/操作编号/);eq((await api.listArtworksByIds(owner,["child"])).length,1);
   const contexts=await load("src/lib/saas/creation-context.ts"),writer=await load("src/lib/saas/creation-writer.ts");
   await contexts.withFrozenCreation({actorEmail:owner,scopeKind:"personal",tenantId:null},async()=>{const id=await writer.startCreation("fixture-original","original-operation",owner,{prompt:"original"});ok(id);await contexts.withFrozenCreation({...contexts.currentCreationContext(),creationId:id},async()=>{await api.addArtworks(owner,[art("with-evidence")]);await api.upsertCanvasTextNode(owner,{...text,id:"text-evidence"});});eq((await pool.query("SELECT count(*)::int n FROM app_creation_links WHERE creation_id=$1 AND target_type='artwork' AND target_id='with-evidence'",[id])).rows[0].n,1);eq((await pool.query("SELECT count(*)::int n FROM app_creation_assets WHERE creation_id=$1 AND direction='output'",[id])).rows[0].n,2);});
   const stable=await api.listArtworksByIds(owner,["child","sibling"]);await writeFile(path.join(out,`ROWS_${mode}.json`),JSON.stringify(stable.map(a=>({...a,createdAt:"DATE"})).sort((a,b)=>a.id.localeCompare(b.id)),null,2));
  }else{
   const legacy=await load("src/lib/bi/model-observer.ts"),context=baseline?legacy:await load("src/lib/bi/context.ts"),calls=baseline?legacy:await load("src/lib/bi/model-calls.ts"),requests=baseline?legacy:await load("src/lib/bi/request.ts");
   if(!baseline){for(const name of ["currentBiContext","currentBiOperationId","withBiModelContext"])eq(context[name],legacy[name]);for(const name of ["observeModelCall","observeOpenAI","recordBiModelCompletion","modelExecutionTelemetry"])eq(calls[name],legacy[name]);eq(requests.withBiRequest,legacy.withBiRequest);}
   eq(context.currentBiContext(),undefined);const fault=new Error("original-error");
   const png=await sharp({create:{width:16,height:8,channels:3,background:"#f2c14e"}}).png().toBuffer(),storage=await load("src/lib/storage.ts"),assets=await load("src/lib/media-assets.ts");await assets.ensureMediaSchema();
   await Promise.all([owner,other].map((email,i)=>context.withBiModelContext(email,"fixture",`op-${i}`,async()=>{await new Promise(r=>setTimeout(r,i===0?12:2));eq(context.currentBiContext().email,email);eq(legacy.currentBiOperationId(),`op-${i}`);await assets.registerMediaAsset(`actor-${i}.png`,png,"image/png",true,undefined,false);await legacy.withBiModelContext("nested@fixture.test","nested","nested-op",async()=>{eq(context.currentBiOperationId(),"nested-op");});eq(context.currentBiContext().email,email);})));eq(context.currentBiContext(),undefined);
   eq((await assets.getMediaAsset("actor-0.png"))?.owner,owner);eq((await assets.getMediaAsset("actor-1.png"))?.owner,other);eq(await assets.canReadMedia("actor-0.png",other),false);
   await reject(context.withBiModelContext(owner,"failure","throw-op",async()=>{throw fault;}));eq(context.currentBiContext(),undefined);
   await context.withBiModelContext(owner,"upload","upload-original",async()=>{eq(await storage.uploadImage(png,"image/png","context-upload.png"),"/media/context-upload.png");});eq((await assets.getMediaAsset("context-upload.png"))?.owner,owner);eq((await storage.readManagedObject("/media/context-upload.png",100000)).bytes,png);
   const once={answer:"original"};let invoked=0;const response=await context.withBiModelContext(owner,"fixture-call","success-op",()=>calls.observeModelCall("wire-model",async()=>{invoked++;return once;},null));eq(response,once);eq(invoked,1);
   await context.withBiModelContext(owner,"fixture-call","rejected-op",async()=>{await reject(calls.observeModelCall("wire-model",async()=>{throw Object.assign(new Error("reject"),{status:403});},null));});
   await context.withBiModelContext(owner,"fixture-call","unknown-op",async()=>{await reject(calls.observeModelCall("wire-model",async()=>{throw new Error("connection lost");},null));});
   for(const end of ["completed","cancelled","error"]){let submitted=0;const source={async *[Symbol.asyncIterator](){submitted++;yield {model:"wire-model",text:"first"};if(end==="error")throw fault;yield {model:"wire-model",text:"second",usage:{prompt_tokens:4,completion_tokens:2}};}};await context.withBiModelContext(owner,"stream",`stream-${end}`,async()=>{const stream=await calls.observeModelCall("wire-model",async()=>source,null,{imageInput:false});const values=[];try{for await(const chunk of stream){values.push(chunk.text);if(end==="cancelled")break;}}catch(e){eq(e,fault);}eq(values,end==="completed"?["first","second"]:["first"]);});eq(submitted,1);}
   const states=(await pool.query("SELECT operation_id,state,input_tokens,output_tokens FROM app_bi_model_calls ORDER BY operation_id")).rows;eq(states.map(r=>[r.operation_id,r.state]),[["rejected-op","rejected"],["stream-cancelled","stream-cancelled"],["stream-completed","stream-completed"],["stream-error","stream-error"],["success-op","succeeded"],["unknown-op","unknown-result"]]);eq(states.find(r=>r.operation_id==="stream-completed")?.input_tokens,4);
   const clients=await load("src/lib/model-config/clients.ts"),identity=baseline?clients:await load("src/lib/model-config/client-identity.ts");let sdk=0;
   const sdkFetch=async()=>{sdk++;return Response.json({created:1,data:[{url:"https://fixture.invalid/result.png"}]});};
   const managed=clients.modelAwareOpenAI({apiKey:"fixture",baseURL:"https://fixture.invalid/v1",fetch:sdkFetch}),unmanaged=clients.modelAwareOpenAI({apiKey:"fixture",baseURL:"https://fixture.invalid/v1",fetch:sdkFetch},false);eq(identity.isManagedModelClient(managed),true);eq(clients.isManagedModelClient(managed),true);eq(identity.isManagedModelClient(unmanaged),false);
   await context.withBiModelContext(owner,"sdk","sdk-op",()=>calls.observeOpenAI(unmanaged).images.generate({model:"fixture",prompt:"fixture"}));eq(sdk,1);
   const native=await load("src/lib/native-auth.ts"),request=new Request("http://fixture.local/api/non-model-fixture",{headers:{cookie:`${native.USER_COOKIE}=${native.signUserSession(owner,Date.now())}`}});let runs=0;
   const result=await requests.withBiRequest(request,async()=>{runs++;eq(context.currentBiContext().email,owner);return Response.json({ok:true});});eq(result.status,200);eq(runs,1);eq(context.currentBiContext(),undefined);
   await writeFile(path.join(out,`OBSERVATION_${mode}.json`),JSON.stringify({states,sdk,runs,mediaOwners:[(await assets.getMediaAsset("actor-0.png"))?.owner,(await assets.getMediaAsset("actor-1.png"))?.owner]},null,2));
  }
  eq(external,0);eq(pool.waitingCount,0);eq(pool.idleCount,pool.totalCount);console.log(`ARTWORK_OWNER_SCENARIO=${scenario} MODE=${mode} CHECKS=${checks} RESULT=PASS`);
 }finally{globalThis.fetch=oldFetch;if(db)await db.getPool().end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();const target=path.resolve(media);assert.equal(path.dirname(target),out);await rm(target,{recursive:true,force:true});console.log(`ARTWORK_OWNER_CLEANUP=${scenario} SCHEMA_DROPPED=1 POOL_CLOSED=1 OWN_MEDIA_REMOVED=1`);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
