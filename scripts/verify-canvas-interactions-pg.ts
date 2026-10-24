/** Full source-root A/B. Real history HTTP handler, DB ownership transaction,
 * direct parent API and stored receipts; no supplier or production connections. */
import assert from "node:assert/strict";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {randomUUID} from "node:crypto";
import {createModelFixture} from "./model-config-fixture";

async function main(){
  const baseline=process.argv.includes("--baseline"),at=process.argv.indexOf("--source-root"),root=path.resolve(at<0?".":process.argv[at+1]);
  const load=(name:string)=>import(pathToFileURL(path.join(root,name)).href);
  let checks=0,calls=0,db:typeof import("../src/lib/db")|undefined;
  const check=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
  const f=await createModelFixture((_q,r)=>{calls++;r.writeHead(500);r.end("disabled");});
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1"});
  try{
    db=await load("src/lib/db.ts");await db!.ensureSchema();
    const owner="interactions@fixture.test",other="other-interactions@fixture.test";
    await db!.getOrCreateUser(owner);await db!.getOrCreateUser(other);
    const art=(id:string)=>({id,title:id,category:"main" as const,prompt:"fixture",createdAt:new Date().toISOString(),status:"completed" as const,image:"/media/fixture.png",gradient:"",groupId:"A",source:"canvas-add",parentIds:[],canvasX:10,canvasY:20});
    await db!.addArtworks(owner,["a","b","c","d"].map(art));await db!.addArtworks(other,[art("other")]);
    await db!.getPool().query("UPDATE app_artworks SET canvas_x=10,canvas_y=20 WHERE email=$1",[owner]);
    await db!.getPool().query("UPDATE app_artworks SET parent_id='a' WHERE email=$1 AND id='b'",[owner]);
    const {POST}=await load("src/app/api/canvas/history/route.ts"),{USER_COOKIE,signUserSession}=await load("src/lib/native-auth.ts");
    const call=(operations:unknown[],operationId=randomUUID(),email=owner)=>POST(new Request("http://localhost/api/canvas/history",{method:"POST",headers:{"content-type":"application/json",cookie:`${USER_COOKIE}=${signUserSession(email,Date.now())}`},body:JSON.stringify({operationId,operations})})) as Promise<Response>;
    const read=async(id:string)=>{const a=(await db!.listArtworksByIds(owner,[id]))[0];return {parentId:a.parentId||null,parentIds:a.parentIds||[],x:a.canvasX};};
    const parent=(id:string,parentId:string,add:boolean)=>({type:"parent",id,parentId,add});
    check((await call([parent("b","a",true)])).status,200);check((await read("b")).parentIds,baseline?[]:["a"]);
    check((await call([parent("b","a",false)])).status,200);check((await read("b")).parentId,baseline?null:"a");
    // The legacy direct API is the behavior reference for project membership.
    await db!.getPool().query("UPDATE app_artworks SET parent_id='a',parent_ids='[]'::jsonb WHERE email=$1 AND id='b'",[owner]);
    await db!.addArtworkParent(owner,"b","a");check((await read("b")).parentIds,["a"]);await db!.removeArtworkParent(owner,"b","a");check((await read("b")).parentId,"a");check((await read("b")).parentIds,[]);
    check((await call([parent("a","b",true)])).status,baseline?409:200);
    if(!baseline){check((await read("a")).parentIds,["b"]);check((await call([parent("b","a",true)])).status,409);}
    const op=randomUUID();check((await call([parent("d","c",true)],op)).status,200);check((await call([parent("d","c",true)],op)).status,200);
    check(Number((await db!.getPool().query("SELECT count(*) FROM app_canvas_history_ops WHERE email=$1 AND id=$2",[owner,op])).rows[0].count),1);
    check((await call([parent("d","a",true)],op)).status,409);check((await call([parent("c","d",true)])).status,409);
    check((await call([parent("d","other",true)])).status,409);
    check((await call([{type:"position",id:"a",text:false,x:90,y:100},{type:"position",id:"other",text:false,x:90,y:100}])).status,409);check((await read("a")).x,10);
    const text=(id:string)=>({id,projectKey:"tree:A",title:id,prompt:"",content:"before",status:"completed" as const,canvasX:10,canvasY:20,width:380,height:260,sourceIds:[],targetIds:[],productIds:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    await db!.upsertCanvasTextNode(owner,text("text-a"));await db!.upsertCanvasTextNode(owner,text("text-b"));
    const fields={title:"product",content:"@product\n\nbody",sourceIds:[],targetIds:[],productIds:["a"],width:380,height:260};
    const batch=[{type:"text-patch",id:"text-a",fields},{type:"text-patch",id:"missing",fields}];
    check((await call(batch)).status,409);check((await db!.listCanvasTextNodes(owner)).find(n=>n.id==="text-a")?.content,"before");
    batch[1].id="text-b";check((await call(batch)).status,200);check((await db!.listCanvasTextNodes(owner)).map(n=>n.content),[fields.content,fields.content]);
    // Mixed image/text/video motion keeps a single receipt and video revision.
    const video=await load("src/lib/canvas/video-node-repository.ts");await video.ensureVideoNodeSchema();const tx=await db!.getPool().connect();let node;
    try{await tx.query("BEGIN");node=await video.saveVideoNodeTx(tx,owner,{id:"video-a",operationId:randomUUID(),expectedRevision:0,x:10,y:20},"tree:A");await tx.query("COMMIT");}finally{tx.release();}
    const {compileCanvasHistory}=await load("src/lib/canvas/history-model.ts"),moveId=randomUUID(),moves=["a","text-a","video-a"].map(id=>({id,from:{x:10,y:20},to:{x:120,y:230}}));
    const operations=compileCanvasHistory({kind:"move-many",moves},false,(id:string)=>id===node.id?node:undefined);
    check((await call(operations,moveId)).status,200);check((await call(operations,moveId)).status,200);
    check((await read("a")).x,120);check((await db!.listCanvasTextNodes(owner)).find(n=>n.id==="text-a")?.canvasX,120);check((await video.getVideoNode(owner,"video-a")).revision,node.revision+1);
    check(calls,0);
    console.log(`CANVAS_INTERACTIONS_PG=PASS mode=${baseline?"BASELINE":"MODIFIED"} checks=${checks} ACTUAL_HANDLER=1 REAL_PG=1 DIRECT_PARENT=PASS HISTORY_MEMBERSHIP=${baseline?"BUG_REPRODUCED":"RETAINED"} MIXED_ATOMIC=PASS REPLAY=ONE_COMMIT SUPPLIER=0`);
  }finally{
    if(db)await db.getPool().end();await (await load("src/lib/imagegen/coordination-pool.ts")).closeImageCoordinationPool();await f.cleanup();
    console.log("INTERACTIONS_PG_CLEANUP=PASS RANDOM_SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1");
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
