// Actual JSON/NDJSON handlers, existing copy/workflow receipts and isolated PG.
// Baseline projects only the old owned handler/workflow source onto current dependencies.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
import {clipboardHtml,gaodingFixture} from "./fixtures/gaoding-clipboard";

async function main(){
  const baseline=process.argv.includes("--baseline"),at=process.argv.indexOf("--source-root"),root=path.resolve(at<0?".":process.argv[at+1]);
  const runId=randomUUID(),media=path.resolve("output/refactor-r7a-20261028/fixture-media",runId);
  Object.assign(process.env,{MEDIA_DIR:media,STORAGE_DRIVER:"local",MEDIA_PRIVATE:"0",NAUMI_MULTI_USER:"1"});
  let external=0,checks=0;const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
  const f=await createModelFixture((_q,r)=>{external++;r.end("disabled");});process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
  const load=(p:string)=>import(pathToFileURL(path.join(root,p)).href);
  let db:typeof import("../src/lib/db")|undefined;
  try{
    db=await import("../src/lib/db");await db.ensureSchema();
    const email="imports-owner@fixture.test",other="imports-other@fixture.test";
    await db.getOrCreateUser(email);await db.getOrCreateUser(other);
    const route=await load("src/app/api/artworks/add/route.ts"),workflow=await load("src/lib/canvas-workflow-import.ts");
    const streamRoute=await load("src/app/api/canvas/workflow-import/route.ts");
    const {USER_COOKIE,signUserSession}=await import("../src/lib/native-auth");
    const headers=(actor=email)=>({"content-type":"application/json",cookie:`${USER_COOKIE}=${signUserSession(actor,Date.now())}`,"x-naumi-workspace":"personal"});
    const post=async(body:unknown,actor=email)=>{const r=await route.POST(new Request("http://localhost/api/artworks/add",{method:"POST",headers:headers(actor),body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};};
    const ledger=async()=>(await f.sql.query("SELECT count(*)::int AS n,coalesce(sum(delta),0)::int AS delta FROM app_ledger")).rows[0];const before=await ledger();
    eq((await route.POST(new Request("http://localhost/api/artworks/add",{method:"POST",body:"{}"}))).status,401);
    eq((await post({})).status,400);
    const template={operationId:randomUUID(),x:140,y:160,src:{templateId:"tpl-fixture",image:"/api/tpl-image?id=fixture",title:"原模板",prompt:"保留原始主体",ratio:"3:4",resolution:"2K",width:1200,height:1600}};
    const a=await post(template),b=await post(template);eq(a.status,200);eq(b.status,200);eq(a.body.id===b.body.id,!baseline);
    const rows=await db.listArtworksByIds(email,[a.body.id,b.body.id]);eq(rows.length,baseline?2:1);eq([rows[0].canvasX,rows[0].canvasY],[140,160]);eq(rows[0].prompt,"保留原始主体");
    eq((await post({...template,src:{...template.src,title:"changed"}})).status,baseline?200:409);
    if(!baseline){
      const concurrent={...template,operationId:randomUUID()};const replies=await Promise.all(Array.from({length:5},()=>post(concurrent)));
      eq(replies.map(r=>r.status),[200,200,200,200,200]);eq(new Set(replies.map(r=>r.body.id)).size,1);
      eq((await f.sql.query("SELECT count(*)::int AS n FROM app_canvas_node_copies WHERE email=$1 AND operation_id=$2",[email,concurrent.operationId])).rows[0].n,1);
      await f.sql.query("UPDATE app_artworks SET title='edited',canvas_x=999 WHERE email=$1 AND id=$2",[email,a.body.id]);
      eq((await post(template)).body.id,a.body.id);eq((await db.listArtworksByIds(email,[a.body.id]))[0].canvasX,999);
      const receipt=await route.GET(new Request(`http://localhost/api/artworks/add?operationId=${template.operationId}`,{headers:headers()}));eq(receipt.status,200);eq((await receipt.json()).id,a.body.id);
      eq((await route.GET(new Request(`http://localhost/api/artworks/add?operationId=${template.operationId}`,{headers:headers(other)}))).status,404);
      await db.deleteArtworksByIds(email,[a.body.id]);eq((await post(template)).status,409);eq((await db.listArtworksByIds(email,[a.body.id])).length,0);
    }
    await db.addArtworks(other,[{id:"foreign-parent",title:"foreign",category:"main",prompt:"",status:"completed",image:"/fixture.png",gradient:""}]);
    eq((await post({...template,operationId:randomUUID(),parentId:"foreign-parent"})).status,baseline?200:404);
    const fault={...template,operationId:randomUUID(),src:{...template.src,title:"import-db-fault"}};
    await f.sql.query("ALTER TABLE app_artworks ADD CONSTRAINT import_owner_fault CHECK(title <> 'import-db-fault')");
    eq((await post(fault)).status,baseline?500:503);await f.sql.query("ALTER TABLE app_artworks DROP CONSTRAINT import_owner_fault");
    eq((await f.sql.query("SELECT count(*)::int AS n FROM app_artworks WHERE title='import-db-fault'")).rows[0].n,0);
    if(!baseline)eq((await f.sql.query("SELECT count(*)::int AS n FROM app_canvas_node_copies WHERE operation_id=$1",[fault.operationId])).rows[0].n,0);
    console.log(`GROUP=TEMPLATE_IDENTITY PASS baseline=${baseline} actual_handler=true`);

    const png=await sharp({create:{width:16,height:12,channels:4,background:"#dbeafe"}}).png().toBuffer();
    const html=clipboardHtml(gaodingFixture()),input={html,operationId:randomUUID(),projectKey:null,x:200,y:300};
    const prepare=async()=>({bytes:png,width:16,height:12});
    const locks:boolean[]=[];
    const result=await workflow.importCanvasWorkflow(email,input,{prepare:async()=>{
      const unlocked=(await f.sql.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS free",[email])).rows[0].free;
      locks.push(unlocked);return prepare();
    }});
    eq(locks.length,4);eq(locks.every(v=>v===!baseline),true);eq([result.artworks.length,result.textNodes.length],[4,2]);
    const retry=await workflow.importCanvasWorkflow(email,input,{prepare:async()=>{throw Error("receipt must not prepare");}});eq(retry,result);
    const ids=result.artworks.map((n:{id:string})=>n.id);
    const files=async(op:string)=>fs.readdir(path.join(media,"canvas-imports",op)).catch(()=>[]);
    eq((await files(input.operationId)).length,4);
    await f.sql.query("UPDATE app_artworks SET title='live-title',canvas_x=777 WHERE email=$1 AND id=$2",[email,ids[0]]);
    await f.sql.query("UPDATE app_canvas_text_nodes SET content='live-text' WHERE email=$1 AND id=$2",[email,result.textNodes[0].id]);
    const live=await workflow.importCanvasWorkflow(email,input);eq([live.artworks[0].title,live.artworks[0].canvasX,live.textNodes[0].content],["live-title",777,"live-text"]);
    await assert.rejects(()=>workflow.importCanvasWorkflow(email,{...input,x:1}),/编号已使用/);checks++;
    await assert.rejects(()=>workflow.importCanvasWorkflow(other,{...input,operationId:randomUUID(),projectKey:result.projectKey},{prepare}),/无权访问/);checks++;
    if(!baseline){
      const r=await streamRoute.GET(new Request(`http://localhost/api/canvas/workflow-import?operationId=${input.operationId}`,{headers:headers()}));eq(r.status,200);eq((await r.json()).result.artworks[0].canvasX,777);
      const foreign=await streamRoute.GET(new Request(`http://localhost/api/canvas/workflow-import?operationId=${input.operationId}`,{headers:headers(other)}));eq(foreign.status,404);
    }
    console.log(`GROUP=WORKFLOW_LOCK_LIFETIME PASS media_transaction_held=${baseline} current_receipt=true`);
    if(!baseline){
      const race={...input,operationId:randomUUID()};let release!:()=>void,ready!:()=>void;
      const gate=new Promise<void>(r=>release=r),entered=new Promise<void>(r=>ready=r);
      const slow=workflow.importCanvasWorkflow(email,race,{prepare:async()=>{ready();await gate;return prepare();}});
      await entered;const winner=await workflow.importCanvasWorkflow(email,race,{prepare});release();const loser=await slow;
      eq(loser,winner);eq((await files(race.operationId)).sort(),winner.artworks.map((n:{id:string})=>n.id+".png").sort());
      eq((await f.sql.query("SELECT count(*)::int AS n FROM app_canvas_workflow_imports WHERE operation_id=$1",[race.operationId])).rows[0].n,1);
      for(const node of winner.artworks)eq(await fs.readFile(path.join(media,node.image.slice(7))),png);
      console.log("GROUP=CONCURRENT_PREPARATION PASS first_publication_wins=true loser_owned_files_removed=true");
    }
    if(!baseline){
      const prototype=gaodingFixture().elements[0].elements![0];
      for(const count of [61,100,200]){
        const elements=Array.from({length:count},(_,i)=>({...prototype,left:i*100,top:0,metaInfo:{$clipboard:{sourceUuid:`bulk-${i}`},workflow:{previous:[]}}}));
        const bulk={...input,operationId:randomUUID(),html:clipboardHtml({version:"10.0.0",elements})};
        const imported=await workflow.importCanvasWorkflow(email,bulk,{prepare});eq(imported.artworks.length,count);eq((await files(bulk.operationId)).length,count);
        eq((await workflow.importCanvasWorkflow(email,bulk,{prepare:async()=>{throw Error("bulk replay must not prepare");}})).artworks.map((n:{id:string})=>n.id),imported.artworks.map((n:{id:string})=>n.id));
      }
      console.log("GROUP=BULK_IMPORT PASS assets=61,100,200 no_new_count_guard=true");
    }
    // A destination disappearing during media preparation must be rechecked
    // by publication, not remembered from a pre-download SELECT.
    const target="import-target-"+randomUUID();await db.addArtworks(email,[{id:target,title:"target",category:"main",prompt:"",status:"completed",image:"/target.png",gradient:""}]);
    const stale={...input,operationId:randomUUID(),projectKey:`tree:${target}`};let deleted=false;
    const pending=workflow.importCanvasWorkflow(email,stale,{prepare:async()=>{if(!deleted){deleted=true;await f.sql.query("UPDATE app_artworks SET deleted_at=now() WHERE id=$1",[target]);}return prepare();}});
    if(baseline){eq((await pending).projectKey,stale.projectKey);}else{await assert.rejects(()=>pending,/无权访问/);checks++;eq(await files(stale.operationId),[]);}
    let cancelled=false;const cancel={...input,operationId:randomUUID()};
    await assert.rejects(()=>workflow.importCanvasWorkflow(email,cancel,{prepare,cancelled:()=>cancelled,progress:(done:number)=>{if(done)cancelled=true;}}),/取消/);checks++;eq(await files(cancel.operationId),[]);
    const failure={...input,operationId:randomUUID()};let calls=0;
    await assert.rejects(()=>workflow.importCanvasWorkflow(email,failure,{prepare:async()=>{if(++calls===2)throw Error("fixture media failure");return prepare();}}),/fixture media failure/);checks++;eq(await files(failure.operationId),[]);
    for(const op of [cancel.operationId,failure.operationId,...(!baseline?[stale.operationId]:[])])eq((await f.sql.query("SELECT count(*)::int AS n FROM app_canvas_workflow_imports WHERE operation_id=$1",[op])).rows[0].n,0);
    const faultId=randomUUID();
    // Inject a failure on new text rows, retaining already committed rows.
    await f.sql.query(`ALTER TABLE app_canvas_text_nodes ADD CONSTRAINT workflow_import_owner_fault CHECK(id=ANY(ARRAY[${(await f.sql.query("SELECT id FROM app_canvas_text_nodes")).rows.map(r=>`'${r.id}'`).join(",")}])) NOT VALID`);
    await assert.rejects(()=>workflow.importCanvasWorkflow(email,{...input,operationId:faultId},{prepare}));checks++;
    await f.sql.query("ALTER TABLE app_canvas_text_nodes DROP CONSTRAINT workflow_import_owner_fault");eq(await files(faultId),[]);
    eq(await ledger(),before);eq(external,0);
    console.log(`CANVAS_IMPORT_OWNER_PG=${baseline?"BASELINE_REPRODUCED":"PASS"} checks=${checks} ACTUAL_HTTP=1 REAL_PG=1 MEDIA_LOCK=${baseline?"HELD":"FREE"} TEMPLATE_REPLAY=${baseline?"DUPLICATES":"SAME_ID"} LEDGER=UNCHANGED EXTERNAL=0`);
  }finally{
    if(db)await db.getPool().end();await (await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();await f.cleanup();
    const resolved=path.resolve(media),base=path.resolve("output/refactor-r7a-20261028/fixture-media");assert.ok(resolved.startsWith(base+path.sep));await fs.rm(resolved,{recursive:true,force:true});
    console.log("IMPORT_OWNER_CLEANUP=PASS OWN_SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1 OWN_MEDIA_REMOVED=1");
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
