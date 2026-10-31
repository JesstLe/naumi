/** Real artwork document -> native account/get/trash handlers -> isolated PG. */
import assert from "node:assert/strict";
import vm from "node:vm";
import {build} from "esbuild";
import {createModelFixture} from "./model-config-fixture";

async function main(){
 let checks=0,supplier=0,db:typeof import("../src/lib/db")|undefined;
 const eq=(a:unknown,b:unknown)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));checks++;};
 const f=await createModelFixture((_q,r)=>{supplier++;r.end("disabled");});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"r3b3-fixture-token",MODEL_CONFIG_ENVELOPE_SECRET:"r3b3-fixture-envelope",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin});
 try{
  db=await import("../src/lib/db");await db.ensureSchema();const owner="art-doc@fixture.test",other="art-other@fixture.test";await db.getOrCreateUser(owner);await db.getOrCreateUser(other);
  const art=(id:string)=>({id,title:id,category:"main" as const,prompt:"fixture",status:"completed" as const,image:"/media/fixture.png",gradient:"",groupId:"A",canvasX:10,canvasY:20,createdAt:new Date().toISOString()});
  await db.addArtworks(owner,[art("a")]);await db.addArtworks(other,[art("foreign")]);
  const account=await import("../src/app/api/account/route"),get=await import("../src/app/api/artworks/get/route"),trash=await import("../src/app/api/artworks/trash/route"),dimensions=await import("../src/app/api/artworks/dimensions/route"),{USER_COOKIE,signUserSession}=await import("../src/lib/native-auth");
  const cookie=`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,events:string[]=[];
  let waitForRead:(()=>Promise<void>)|undefined;
  const fetch=async(url:string,init:RequestInit={})=>{
   const request=new Request("http://localhost"+url,init),pathname=new URL(request.url).pathname;events.push((init.method||"GET")+" "+pathname);
   const response=pathname==="/api/account"?await account.GET(request):pathname==="/api/artworks/get"?await get.GET(request):pathname==="/api/artworks/dimensions"?await dimensions.POST(request):init.method==="POST"?await trash.POST(request):await trash.GET(request);
   await waitForRead?.();return response;
  };
  const bundle=await build({stdin:{contents:'export * from "./src/lib/canvas/artwork-document"; export * from "./src/lib/canvas/document-scope";',resolveDir:process.cwd(),loader:"ts"},bundle:true,write:false,platform:"node",format:"cjs",plugins:[{name:"auth",setup(b){b.onResolve({filter:/supabase$/},()=>({path:"auth",namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:'export const authHeader=()=>({cookie:__cookie});',loader:"js"}));}}]});
  const module={exports:{}} as {exports:typeof import("../src/lib/canvas/artwork-document")&typeof import("../src/lib/canvas/document-scope")};
  const cache=new Map<string,string>(),context=vm.createContext({module,exports:module.exports,__cookie:cookie,fetch,console,Map,Set,Headers,Request,Response,AbortSignal,Blob,URL,structuredClone,setTimeout,clearTimeout,localStorage:{getItem:(k:string)=>cache.get(k)||null,setItem:(k:string,v:string)=>cache.set(k,v)}});vm.runInContext(bundle.outputFiles[0].text,context);
  const api=module.exports,scope=api.createCanvasDocumentContext().render(owner,"tree:A"),document=api.createCanvasArtworkDocument().bind(scope,owner,true);
  eq((await document.load()).map(n=>n.id),["a"]);eq(document.getSnapshot().phase,"ready");
  await document.recordDimensions("a",400.6,200.2);
  eq([document.getSnapshot().nodes![0].width,document.getSnapshot().nodes![0].height],[401,200]);
  eq((await db.listArtworksByIds(owner,["a"])).map(n=>[n.width,n.height]),[[401,200]]);
  const dimensionPosts=()=>events.filter(e=>e==="POST /api/artworks/dimensions").length;
  await document.recordDimensions("a",401,200);eq(dimensionPosts(),1);
  const readOnly=api.createCanvasArtworkDocument().bind(scope,owner,false);readOnly.accept([art("a")]);
  await readOnly.recordDimensions("a",600,300);eq(readOnly.getSnapshot().nodes![0].width,600);eq(dimensionPosts(),1);
  eq((await db.listArtworksByIds(owner,["a"]))[0].width,401);
  const foreignBefore=(await db.listArtworksByIds(other,["foreign"]))[0];
  await document.recordDimensions("foreign",800,600);
  eq((await db.listArtworksByIds(other,["foreign"]))[0].width,foreignBefore.width);
  eq(document.getSnapshot().nodes!.some(n=>n.id==="foreign"),false);
  eq((await dimensions.POST(new Request("http://localhost/api/artworks/dimensions",{method:"POST",body:JSON.stringify({id:"a",width:900,height:900})}))).status,401);
  await db.addArtworks(owner,[art("b")]);await document.merge(["b"]);eq(document.getSnapshot().nodes!.length,2);
  const before=events.length;await assert.rejects(document.merge(["foreign"]));checks++;eq(events.slice(before),["GET /api/artworks/get"]);eq(document.getSnapshot().nodes!.length,2);
  let entered!:()=>void,release!:()=>void;const gate=new Promise<void>(r=>release=r),start=new Promise<void>(r=>entered=r);waitForRead=()=>{entered();return gate;};
  const read=document.refresh();await start;document.set(nodes=>nodes!.map(n=>n.id==="a"?{...n,canvasX:800}:n));release();await read;eq(document.getSnapshot().nodes!.find(n=>n.id==="a")!.canvasX,800);waitForRead=undefined;
  await db.getPool().query("UPDATE app_artworks SET deleted_at=now() WHERE email=$1 AND id=$2",[owner,"b"]);document.remove(["b"]);await document.loadTrash();eq(document.getSnapshot().trash!.map(n=>n.id),["b"]);
  await document.trashAction("restore",["b"]);eq(document.getSnapshot().nodes!.length,2);eq(document.getSnapshot().trash,[]);eq((await db.listArtworksByIds(owner,["b"])).length,1);
  eq((await get.GET(new Request("http://localhost/api/artworks/get?ids=a"))).status,401);
  eq((await db.listArtworksByIds(other,["a","b"])).length,0);eq(supplier,0);
  console.log(`CANVAS_ARTWORK_DOCUMENT_PG=PASS checks=${checks} ACTUAL_OWNER=1 ACTUAL_HANDLERS=1 REAL_PG=1 DIMENSIONS=SCOPED_ONCE READ_ONLY=LOCAL_ONLY FOREIGN_METADATA=UNCHANGED PARTIAL_OWNERSHIP=PASS RESTORE=PASS LATE_READ=LOCAL_EDIT_RETAINED SUPPLIER=0`);
 }finally{if(db)await db.getPool().end();await(await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();await f.cleanup();console.log("ARTWORK_PG_CLEANUP=PASS SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1");}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
