/** Real pre/post native document owners, with observed auth/HTTP ports. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{build}=require('esbuild');
const arg=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1]},root=path.resolve(arg('--source-root')||'.'),baseline=arg('--mode')==='baseline',out=path.resolve(arg('--out')||'output/native-save-integration');
fs.mkdirSync(out,{recursive:true});const modern=fs.existsSync(path.join(root,'src/lib/canvas/video-node-save-queue.ts'));
async function main(){
 const entry='export * from "./src/lib/canvas/native-node-document";'+(modern?'export {VideoNodeClientError} from "./src/lib/canvas/video-node-save-queue";':'');
 const built=await build({stdin:{contents:entry,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',tsconfig:path.join(root,'tsconfig.json'),nodePaths:[path.resolve('node_modules')],plugins:[{name:'auth-ports',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'port'}));b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'workspace',namespace:'port'}));b.onLoad({filter:/.*/,namespace:'port'},a=>({loader:'js',contents:a.path==='auth'?'export const authHeader=async()=>({});':'export const currentWorkspace=()=>"personal";export const currentWorkspaceRevision=()=>0;'}));}}]});
 const rows=[];let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
 function fixture(kind){let server={id:'vnode-a',projectKey:'tree:fixture',revision:1,title:'seed',x:0,y:0},gate,release;const requests=[],module={exports:{}};
 const context={module,exports:module.exports,require,console,Promise,Map,Set,WeakMap,URL,Headers,Request,Response,AbortController,AbortSignal,crypto:globalThis.crypto,structuredClone,setTimeout,clearTimeout,fetch:async(_url,init={})=>{
  if(!init.method||init.method==='GET')return Response.json({nodes:[server]});const body=JSON.parse(init.body);requests.push(body);
  if(gate){await gate;gate=undefined;}
  if(kind==='conflict'&&body.config)return Response.json({error:'conflict',code:'VIDEO_NODE_REVISION_CONFLICT'},{status:409});
  if(kind==='bad-ack')return Response.json({node:{...server,revision:99}});
  server={...server,...body,revision:server.revision+1};return Response.json({node:server});
 }};vm.createContext(context);vm.runInContext(built.outputFiles[0].text,context);const api=module.exports,scope={account:'a',workspace:'personal',project:'tree:fixture',key:'fixture',documentCurrent:()=>true,viewCurrent:()=>true,assertView(){}};
 const owner=api.createCanvasNativeNodeDocument('video',(m,s,c)=>new (api.VideoNodeClientError||api.NativeNodeClientError)(m,s,c)),view=owner.bind(scope,'fixture@test',false);
 return {view,requests,hold(){gate=new Promise(r=>release=r);},release:()=>release(),server:()=>server};
 }
 let f=fixture('order');await f.view.refresh();f.hold();const first=f.view.save('vnode-a',{title:'A'}),duplicate=f.view.save('vnode-a',{title:'A'}),second=f.view.save('vnode-a',{title:'B'}),third=f.view.save('vnode-a',{title:'A'});eq(first===duplicate,true,'same-tail dedup');f.release();await Promise.all([first,second,third]);eq(f.requests.map(r=>r.title),baseline?['A','B']:['A','B','A'],'A-B-A preserves each intended edit');eq(f.server().title,baseline?'B':'A','last intended title');rows.push({name:'ordered-distinct-tail',titles:f.requests.map(r=>r.title)});
 f=fixture('conflict');await f.view.refresh();await f.view.save('vnode-a',{config:{prompt:'unsaved original draft'}}).catch(()=>{});await f.view.refresh();await f.view.save('vnode-a',{x:32});const clean=await f.view.flush().then(()=>true,()=>false);eq(clean,baseline,'position ACK cannot close failed configuration intent');eq(f.view.getSnapshot().unsavedCount||0,baseline?0:1,'failed draft retained');rows.push({name:'unconfirmed-draft-barrier',flushClean:clean,unsaved:f.view.getSnapshot().unsavedCount||0});
 f=fixture('bad-ack');await f.view.refresh();const accepted=await f.view.save('vnode-a',{title:'bad reply'}).then(()=>true,()=>false);eq(accepted,baseline,'wrong revision is not an ACK');eq(f.requests.length,baseline?1:3,'bounded same-operation retry only');eq(new Set(f.requests.map(r=>r.operationId)).size,1,'retry operation remains original');rows.push({name:'canonical-revision-ack',accepted,requests:f.requests.length,operationIds:1});
 const report={status:'PASS',mode:baseline?'BASELINE':'MODIFIED',root,groups:rows.length,checks,rows,actualDocument:true,authAndHttp:'controlled ports',suppliers:0};fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(`NATIVE_SAVE_INTEGRATION=${baseline?'BASELINE_REPRODUCED':'PASS'} GROUPS=${rows.length} CHECKS=${checks} ACTUAL_DOCUMENT=1 A_B_A=${baseline?'COLLAPSED':'ORDERED'} FAILED_DRAFT=${baseline?'LOST':'RETAINED'} BAD_REVISION_ACK=${baseline?'ACCEPTED':'REJECTED'} DB=0 SUPPLIER=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
