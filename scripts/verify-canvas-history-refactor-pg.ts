/** Actual history HTTP adapter + command compiler + repository/transaction.
 * Own isolated PG schema, no provider calls or product database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createModelFixture } from "./model-config-fixture";
import { compileCanvasHistory } from "../src/lib/canvas/history-model";
import { defaultNodeSettings } from "../src/lib/canvas/node-settings";

async function main() {
  let checks=0,http=0,db:typeof import("../src/lib/db")|undefined;
  const check=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
  const f=await createModelFixture((_request,response)=>{http++;response.writeHead(500);response.end("disabled");});
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-r3b-token",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-r3b-envelope-secret",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin});
  try {
    db=await import("../src/lib/db");await db.ensureSchema();
    const owner="history-r3b@fixture.test",other="other-r3b@fixture.test";
    await db.getOrCreateUser(owner);await db.getOrCreateUser(other);
    const art=(id:string)=>({id,title:id,category:"main" as const,prompt:"fixture",createdAt:new Date().toISOString(),status:"completed" as const,image:"/media/fixture.png",gradient:"",groupId:"A",canvasX:10,canvasY:20});
    await db.addArtworks(owner,[art("a")]);await db.addArtworks(other,[art("other")]);await db.getPool().query("UPDATE app_artworks SET canvas_x=10,canvas_y=20 WHERE email=$1",[owner]);
    const text={id:"text-a",projectKey:"tree:A",title:"copy",prompt:"",content:"before",status:"completed" as const,canvasX:10,canvasY:20,width:380,height:260,sourceIds:[],targetIds:[],productIds:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    await db.upsertCanvasTextNode(owner,text);
    const video=await import("../src/lib/canvas/video-node-repository");await video.ensureVideoNodeSchema();
    const tx=await db.getPool().connect();let node;
    try {await tx.query("BEGIN");node=await video.saveVideoNodeTx(tx,owner,{id:"video-a",operationId:randomUUID(),expectedRevision:0,x:10,y:20},"tree:A");await tx.query("COMMIT");}finally{tx.release();}
    const {POST}=await import("../src/app/api/canvas/history/route"),{USER_COOKIE,signUserSession}=await import("../src/lib/native-auth");
    const call=(body:unknown,email=owner,authenticated=true)=>POST(new Request("http://localhost/api/canvas/history",{method:"POST",headers:{"content-type":"application/json",...(authenticated?{cookie:`${USER_COOKIE}=${signUserSession(email,Date.now())}`}:{})},body:JSON.stringify(body)}));
    const move={operationId:randomUUID(),operations:compileCanvasHistory({kind:"move-many",moves:["a","text-a","video-a"].map(id=>({id,from:{x:10,y:20},to:{x:200,y:300}}))},false,id=>id===node.id?node:undefined)};
    check((await call(move,owner,false)).status,401);check((await call({operationId:randomUUID(),operations:[]})).status,400);
    check((await call(move)).status,200);
    check((await db.listArtworksByIds(owner,["a"]))[0].canvasX,200);check((await db.listCanvasTextNodes(owner))[0].canvasX,200);check((await video.getVideoNode(owner,"video-a"))!.x,200);
    const revision=(await video.getVideoNode(owner,"video-a"))!.revision;
    check((await call(move)).status,200);check((await video.getVideoNode(owner,"video-a"))!.revision,revision);
    check((await call({...move,operations:[{type:"rename",id:"a",title:"tampered"}]})).status,409);check((await db.listArtworksByIds(owner,["a"]))[0].title,"a");
    const mixed={operationId:randomUUID(),operations:[{type:"rename",id:"a",title:"must rollback"},{type:"rename",id:"other",title:"stolen"}]};
    check((await call(mixed)).status,409);check((await db.listArtworksByIds(owner,["a"]))[0].title,"a");check((await db.listArtworksByIds(other,["other"]))[0].title,"other");
    const current=(await video.getVideoNode(owner,"video-a"))!;
    const vop=compileCanvasHistory({kind:"video-patch",id:current.id,from:{x:current.x},to:{x:400}},false,()=>current);
    const statuses=await Promise.all([1,2].map(async()=> (await call({operationId:randomUUID(),operations:vop})).status));check(statuses.sort(),[200,409]);check((await video.getVideoNode(owner,"video-a"))!.revision,revision+1);
    const settings=defaultNodeSettings(),write={operationId:randomUUID(),operations:compileCanvasHistory({kind:"node-settings",id:"a",text:false,from:settings,to:{...settings,locked:true}},false,()=>undefined)};
    check((await Promise.all([call(write),call(write)])).map(r=>r.status),[200,200]);check(Number((await db.getPool().query("SELECT count(*) FROM app_canvas_history_ops WHERE id=$1",[write.operationId])).rows[0].count),1);
    check((await import("../src/lib/canvas-node-settings-store")).listCanvasNodeSettings instanceof Function,true);
    check((await (await import("../src/lib/canvas-node-settings-store")).listCanvasNodeSettings(owner)).a.locked,true);
    check(http,0);
    console.log(`CANVAS_HISTORY_PG=PASS checks=${checks} REAL_HTTP_HANDLER=1 REAL_PG=1 MIXED_ATOMIC=PASS OWNER=PASS VIDEO_CAS=PASS REPLAY=ONE_COMMIT SUPPLIER=0`);
  } finally {
    if(db)await db.getPool().end();await (await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();await f.cleanup();
    console.log("HISTORY_PG_CLEANUP=PASS RANDOM_SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1");
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
