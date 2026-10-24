/** Actual copy/delete/history HTTP adapters and full isolated PG transaction. */
import assert from "node:assert/strict";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {randomUUID} from "node:crypto";
import {createModelFixture} from "./model-config-fixture";
async function main(){
  const baseline=process.argv.includes("--baseline"),at=process.argv.indexOf("--source-root"),root=path.resolve(at<0?".":process.argv[at+1]),load=(p:string)=>import(pathToFileURL(path.join(root,p)).href);
  let checks=0,calls=0,db:typeof import("../src/lib/db")|undefined;const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
  const f=await createModelFixture((_q,r)=>{calls++;r.end("disabled");});Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1"});
  try{
    db=await load("src/lib/db.ts");await db!.ensureSchema();const actor="node-op@fixture.test",other="other-node@fixture.test";await db!.getOrCreateUser(actor);await db!.getOrCreateUser(other);
    const art=(id:string,parentId?:string)=>({id,title:id,category:"main" as const,prompt:"source prompt",style:"source style",ratio:"3:4",resolution:"2K",status:"completed" as const,image:"/media/fixture.png",gradient:"",groupId:"A",parentId,source:"generate",parentIds:parentId?[parentId]:[],width:1200,height:1600,canvasWidth:300,canvasHeight:400});
    await db!.addArtworks(actor,[art("a"),art("b","a")]);await db!.addArtworks(other,[{...art("foreign"),groupId:"B"}]);await db!.getPool().query("UPDATE app_artworks SET canvas_x=10,canvas_y=20 WHERE email=$1",[actor]);
    const now=new Date().toISOString(),text={id:"text-a",projectKey:"tree:A",title:"text",content:"body",prompt:"original prompt",status:"completed" as const,canvasX:10,canvasY:20,width:380,height:240,sourceIds:["b"],targetIds:[],productIds:["b"],createdAt:now,updatedAt:now};await db!.upsertCanvasTextNode(actor,text);
    const v=await load("src/lib/canvas/video-node-repository.ts");await v.ensureVideoNodeSchema();const tx=await db!.getPool().connect();let video;
    try{await tx.query("BEGIN");video=await v.saveVideoNodeTx(tx,actor,{id:"vnode-a",operationId:randomUUID(),expectedRevision:0,x:10,y:20},"tree:A");await tx.query("COMMIT");}finally{tx.release();}
    const copy=await load("src/app/api/canvas/nodes/copy/route.ts"),remove=await load("src/app/api/canvas/nodes/delete/route.ts"),history=await load("src/app/api/canvas/history/route.ts"),{signUserSession,USER_COOKIE}=await load("src/lib/native-auth.ts");
    const call=async(route:{POST:(r:Request)=>Promise<Response>},url:string,body:unknown,email=actor)=>{const response=await route.POST(new Request("http://localhost"+url,{method:"POST",headers:{"content-type":"application/json",cookie:`${USER_COOKIE}=${signUserSession(email,Date.now())}`},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};
    const single={operationId:randomUUID(),ids:["b"],projectKey:"tree:A",singleArtwork:{x:500,y:600,title:"独立副本"}};
    const result=await call(copy,"/api/canvas/nodes/copy",single);eq(result.status,baseline?422:200);
    if(!baseline){
      const id=result.body.artworkIds[0],row=(await db!.listArtworksByIds(actor,[id]))[0];
      eq([row.canvasX,row.canvasY,row.title,row.source,row.parentId,row.parentIds],[500,600,"独立副本","canvas-add","A",[]]);eq([row.prompt,row.style,row.ratio,row.resolution,row.width,row.height],["source prompt","source style","3:4","2K",1200,1600]);
      eq(row.creationProvenance?.operation,"copy");eq(row.creationProvenance?.sourceArtworkId,"b");
      eq((await call(copy,"/api/canvas/nodes/copy",single)).body.idMap,result.body.idMap);
      eq((await call(copy,"/api/canvas/nodes/copy",{...single,singleArtwork:{...single.singleArtwork,x:999}})).status,409);
      eq((await call(copy,"/api/canvas/nodes/copy",{...single,operationId:randomUUID(),ids:["text-a"]})).status,422);
      const group=(await db!.getPool().query("SELECT group_id FROM app_artworks WHERE email=$1 AND id=$2",[actor,id])).rows[0].group_id;eq(group,"A");
    }
    const body={operationId:randomUUID(),ids:["b","text-a",video.id]},mixed=await call(copy,"/api/canvas/nodes/copy",body);eq(mixed.status,200);const r=mixed.body;
    eq(r.textNodes[0].sourceIds,[r.idMap.b]);eq(r.textNodes[0].productIds,[r.idMap.b]);eq(r.textNodes[0].prompt,"original prompt");eq(r.nodes[0].lastTaskId,null);eq(r.nodes[0].lastResultId,null);eq(r.nodes[0].x,50);
    eq((await call(copy,"/api/canvas/nodes/copy",body)).body.idMap,r.idMap);eq((await call(copy,"/api/canvas/nodes/copy",{...body,ids:["a"]})).status,409);
    eq((await call(copy,"/api/canvas/nodes/copy",{operationId:randomUUID(),ids:["b"]},other)).status,404);
    const removal={operationId:randomUUID(),artworkIds:r.artworkIds,textIds:r.textNodes.map((n:{id:string})=>n.id),videoIds:r.nodes.map((n:{id:string})=>n.id)};
    eq((await call(remove,"/api/canvas/nodes/delete",{...removal,artworkIds:[...r.artworkIds,"foreign"]})).status,500);eq((await db!.listArtworksByIds(actor,r.artworkIds)).length,1);
    eq((await call(remove,"/api/canvas/nodes/delete",removal)).status,200);eq((await call(remove,"/api/canvas/nodes/delete",removal)).status,200);eq((await db!.listArtworksByIds(actor,r.artworkIds)).length,0);
    const restore={operationId:randomUUID(),operations:[...r.artworkIds.map((id:string)=>({type:"visibility",id,visible:true})),...r.textNodes.map((node:unknown)=>({type:"text-restore",node})),...r.nodes.map((node:{id:string})=>({type:"video-visibility",id:node.id,visible:true}))]};
    eq((await call(history,"/api/canvas/history",restore)).status,200);eq((await db!.listArtworksByIds(actor,r.artworkIds)).length,1);eq((await v.getVideoNode(actor,r.nodes[0].id)).config,video.config);
    const project={operationId:randomUUID(),projectKey:r.projectKey};eq((await call(remove,"/api/canvas/nodes/delete",project)).status,200);eq((await call(remove,"/api/canvas/nodes/delete",project)).status,200);eq((await db!.listArtworksByIds(actor,["a","b"])).length,2);eq((await db!.listCanvasTextNodes(actor)).some(n=>n.id==="text-a"),true);
    eq(calls,0);console.log(`CANVAS_NODE_OPERATIONS_PG=PASS mode=${baseline?"BASELINE":"MODIFIED"} checks=${checks} ACTUAL_HTTP=1 REAL_PG=1 SINGLE_ARTWORK=${baseline?"OLD_SCHEMA_REJECTS":"DETACHED_PLACED"} MIXED_COPY=PASS DELETE_ATOMIC=PASS UNDO=PASS REPLAY=PASS SUPPLIER=0`);
  }finally{if(db)await db.getPool().end();await (await load("src/lib/imagegen/coordination-pool.ts")).closeImageCoordinationPool();await f.cleanup();console.log("NODE_OP_PG_CLEANUP=PASS RANDOM_SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1");}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
