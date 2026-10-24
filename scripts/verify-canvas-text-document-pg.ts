/** Actual document owner -> real text/history Request handlers -> isolated PG.
 * Browser auth is a native fixture session; no external transport or supplier. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import vm from "node:vm";
import {build} from "esbuild";
import {createModelFixture} from "./model-config-fixture";

async function main(){
 let checks=0,supplier=0,db:typeof import("../src/lib/db")|undefined;
 const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 const f=await createModelFixture((_q,r)=>{supplier++;r.end("disabled");});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"r3b2-fixture-token",MODEL_CONFIG_ENVELOPE_SECRET:"r3b2-fixture-envelope",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin});
 try{
  db=await import("../src/lib/db");await db.ensureSchema();const actor="r3b2@fixture.test",other="r3b2-other@fixture.test";await db.getOrCreateUser(actor);await db.getOrCreateUser(other);
  const now=new Date().toISOString(),node={id:"text-r3b2",projectKey:"tree:r3b2",title:"draft",prompt:"",content:"before",status:"completed" as const,canvasX:0,canvasY:0,width:380,height:240,sourceIds:[],targetIds:[],productIds:[],createdAt:now,updatedAt:now};
  await db.upsertCanvasTextNode(actor,node);
  const text=await import("../src/app/api/canvas/text-nodes/route"),history=await import("../src/app/api/canvas/history/route"),{signUserSession,USER_COOKIE}=await import("../src/lib/native-auth");
  const headers={cookie:`${USER_COOKIE}=${signUserSession(actor,Date.now())}`};let posts=0,historyCalls=0,holdHistory:(()=>Promise<void>)|undefined;
  const fetch=async(url:string,init:RequestInit={})=>{
   const request=new Request("http://localhost"+url,init);
   if(url==="/api/canvas/history"){historyCalls++;await holdHistory?.();return history.POST(request);}
   if(init.method==="POST"){posts++;return text.POST(request);}return text.GET(request);
  };
  const compiled=await build({stdin:{contents:'export * from "./src/lib/canvas/text-document"; export * from "./src/lib/canvas/document-scope";',resolveDir:process.cwd(),loader:"ts"},platform:"node",bundle:true,write:false,format:"cjs",plugins:[{name:"browser-auth",setup(b){
    b.onResolve({filter:/supabase$/},()=>({path:"auth",namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:"export const authHeader=()=>__headers;",loader:"js"}));
  }}]});
  const module={exports:{}} as {exports:typeof import("../src/lib/canvas/text-document")&typeof import("../src/lib/canvas/document-scope")};
  const context=vm.createContext({module,exports:module.exports,__headers:headers,fetch,console,Headers,Response,Request,AbortSignal,structuredClone,Map,Set,Promise});vm.runInContext(compiled.outputFiles[0].text,context);
  const api=module.exports,scope=api.createCanvasDocumentContext().render(actor,"tree:r3b2"),storage=new Map<string,string>();
  const document=api.createCanvasTextDocument({storage:()=>({getItem:k=>storage.get(k)||null,setItem:(k,v)=>{storage.set(k,v);}}),notice:()=>{}}).bind(scope,actor,actor,true);
  eq(await document.load(),true);eq(document.getSnapshot().nodes[0].content,"before");
  const changed={...node,content:"typed"};document.set([changed]);await document.save(changed);eq((await db.listCanvasTextNodes(actor))[0].content,"typed");eq(document.getSnapshot().unsaved,0);
  let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>{enter=r;}),gate=new Promise<void>(r=>{release=r;});holdHistory=()=>{enter();return gate;};
  const fields={title:node.title,content:node.content,sourceIds:[],targetIds:[],productIds:[],width:380,height:240};
  const operation={type:"text-patch" as const,id:node.id,fields};
  const edit=document.history.transaction(scope,async()=>{
   const result=await api.canvasDocumentFetch(scope,"/api/canvas/history",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operationId:randomUUID(),operations:[operation]})},true);eq(result.status,200);document.history.applyHistory(scope,[operation]);
  });
  await entered;document.set([{...changed,width:600}]);const later=document.save({...changed,width:600});eq(posts,1);release();await Promise.all([edit,later]);
  const saved=(await db.listCanvasTextNodes(actor))[0];eq(saved.content,"before");eq(saved.width,600);eq(document.getSnapshot().nodes[0].width,600);eq(document.getSnapshot().unsaved,0);eq(posts,2);eq(historyCalls,1);
  const invalid=await text.POST(new Request("http://localhost/api/canvas/text-nodes",{method:"POST",headers:{...headers,"content-type":"application/json"},body:JSON.stringify({...node,id:"invalid",sourceIds:["foreign"]})}));eq(invalid.status,400);
  const unauth=await text.POST(new Request("http://localhost/api/canvas/text-nodes",{method:"POST",body:JSON.stringify(node)}));eq(unauth.status,401);
  eq((await db.listCanvasTextNodes(other)).length,0);eq(supplier,0);
  console.log(`CANVAS_TEXT_DOCUMENT_PG=PASS checks=${checks} ACTUAL_OWNER=1 ACTUAL_HANDLERS=1 REAL_PG=1 SAVE_HISTORY_SAVE=ORDERED CONTENT=before WIDTH=600 SUPPLIER=0`);
 }finally{if(db)await db.getPool().end();await(await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();await f.cleanup();console.log("TEXT_DOCUMENT_PG_CLEANUP=PASS SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1");}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
