const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),esbuild=require('esbuild'),ts=require('typescript');
const args=process.argv.slice(2),baseline=args.includes('--baseline'),root=path.resolve(args.includes('--source-root')?args[args.indexOf('--source-root')+1]:'.');
function bundle(file){const code=esbuild.buildSync({stdin:{contents:`export * from ${JSON.stringify(path.join(root,file).replaceAll('\\','/'))}`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',nodePaths:[path.resolve('node_modules')],tsconfigRaw:{compilerOptions:{baseUrl:root,paths:{'@/*':['src/*']}}}}).outputFiles[0].text;const m={exports:{}};vm.runInThisContext('(function(module,exports,require){'+code+'\n})')(m,m.exports,require);return m.exports;}
const receipts=bundle('src/lib/video/canvas-receipts.ts'),batch=bundle('src/lib/video/canvas-batch-client.ts'),app=baseline?null:bundle('src/lib/video/canvas-submission.ts');
let oldFunction;
if(baseline){const file=path.join(root,'src/components/canvas/canvas-client.tsx'),text=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='generateVideoDraft')found=n;ts.forEachChild(n,visit)}visit(ast);assert.ok(found);oldFunction=esbuild.transformSync(found.getText(ast),{loader:'ts',target:'node24'}).code;}
let checks=0,cases=0;const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++};
const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
function setup(options={}){
 const store=new Map(),events=[],state={epoch:1,account:'owner',project:'tree:v',save:0,post:0,billing:0,refresh:0,persist:[],task:'task-one'},node={id:'v',projectKey:'tree:v',revision:7,title:'Video',config:{modelId:'video-model',prompt:'prompt',mode:'text',...(options.byoc?{comfyWorkflowId:'byoc'}:{})},inputs:[]};
 const draft=()=>({title:node.title,config:structuredClone(node.config),inputs:structuredClone(node.inputs),expectedRevision:node.revision});
 const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const scope={isCurrent:()=>state.epoch===1&&state.account==='owner'&&state.project==='tree:v',assertCurrent(){if(!this.isCurrent())throw Error('STALE_VIEW')}};
 // Batch receives the scope's assertion as a bare callback, as the actual adapter does.
 scope.assertCurrent=scope.assertCurrent.bind(scope);
 const ports={storage,node:()=>node,save:async()=>{state.save++;if(options.afterSave)options.afterSave(state);node.revision++;return structuredClone(node)},refreshNodes:async()=>{state.refresh++},refreshTasks:async()=>{state.refresh++},refreshCredits:async()=>{state.refresh++}};
 ports.request=async(url,init={})=>{events.push({url,method:init.method||'GET',body:init.body});if(init.method==='POST'){state.post++;if(options.afterPost)options.afterPost(state);return options.post?.(state)||response(options.status||202,options.data||{taskId:state.task})}return options.get?.(url,state)||response(404,{error:'missing'})};
 ports.submit=async(url,init,quote,onIdentity)=>{state.billing++;check(quote,options.quote??quote,'quote not recalculated');if(options.beforeIdentity)options.beforeIdentity(state);if(options.actualId)onIdentity(options.actualId);return ports.request(url,init)};
 const run=async(count=1,quote={version:3,credits:6,reserveCredits:6},d=draft())=>{
  if(!baseline)return app.generateCanvasVideo({email:'OWNER@fixture.test',nodeId:'v',draft:d,quote,count,onPersisted:r=>state.persist.push(r)},scope,ports);
  const deps={user:{email:'OWNER@fixture.test'},readOnly:false,localStorage:storage,...receipts,...batch,privateFetchRaw:ports.request,
   videoNodesStore:{nodes:[node],refresh:ports.refreshNodes},videoTaskStore:{refresh:ports.refreshTasks},refreshCredits:ports.refreshCredits,
   saveVideoDraft:(_,draft)=>ports.save('v',draft),billing:{submit:ports.submit},readJsonSafe:r=>r.json().catch(()=>null),canvasAccountRef:{get current(){return state.account}},activeProjectRef:{get current(){return {key:state.project}}}};
  const factory=Function(...Object.keys(deps),oldFunction+'\nreturn generateVideoDraft;');return factory(...Object.values(deps))('v',d,quote,r=>state.persist.push(r),count);
 };
 const retained=(patch={})=>{const value={idempotencyKey:'original-operation',nodeId:'v',projectKey:'tree:v',expectedRevision:node.revision,...patch};receipts.saveVideoReceipt(storage,'OWNER@fixture.test',value);return value};
 const receipt=()=>receipts.readVideoReceipt(storage,'OWNER@fixture.test','v');
 return {state,node,storage,store,events,scope,ports,draft,run,retained,receipt};
}
async function scenario(fn){await fn();cases++}
async function rejected(p,message){let e;try{await p}catch(error){e=error}check(!!e,true,'expected rejection');if(message){check(e.message.includes(message),true,e.message)}return e;}
async function main(){
 await scenario(async()=>{const h=setup();await h.run();check([h.state.save,h.state.post,h.state.billing,h.state.refresh],[1,1,1,3]);check(h.state.persist,[8]);check(h.receipt().taskId,'task-one');const body=JSON.parse(h.events[0].body);check(body.expectedRevision,8);check(body.idempotencyKey,h.receipt().idempotencyKey)});
 await scenario(async()=>{const h=setup({byoc:true});await h.run();check([h.state.post,h.state.billing],[1,0])});
 await scenario(async()=>{const h=setup({get:()=>response(200,{task:{status:'queued'}})});h.retained();await rejected(h.run(),'仍在执行');check([h.state.save,h.state.post,h.state.refresh],[0,0,2]);check(h.receipt().idempotencyKey,'original-operation')});
 for(const status of ['completed','failed','cancelled'])await scenario(async()=>{const h=setup({get:()=>response(200,{task:{status}})});h.retained({taskId:'old-task'});await h.run();check([h.state.save,h.state.post],[1,1]);check(h.receipt().idempotencyKey!=='original-operation',true);check(h.events[0].url,'/api/video/tasks?id=old-task')});
 await scenario(async()=>{const h=setup({get:()=>response(503,{error:'pending lookup'})});h.retained();await rejected(h.run(),'pending lookup');check([h.state.save,h.state.post],[0,0]);check(h.receipt().idempotencyKey,'original-operation')});
 await scenario(async()=>{const h=setup();h.retained();const d=h.draft();d.expectedRevision++;await rejected(h.run(1,null,d),'节点已更新');check(h.state.post,0)});
 await scenario(async()=>{const h=setup();h.retained();const d=h.draft();d.title='new';await rejected(h.run(1,null,d),'恢复原设置');check(h.state.post,0)});
 await scenario(async()=>{const h=setup();h.retained();await h.run();check(h.state.save,0);check(h.state.persist,[]);check(JSON.parse(h.events[1].body).idempotencyKey,'original-operation');check(h.receipt().taskId,'task-one')});
 for(const [status,code,kept]of [[400,'INVALID',false],[402,'INSUFFICIENT_CREDITS',false],[409,'OPERATION_PENDING',true],[409,'OPERATION_CONFLICT',true],[503,'UPSTREAM',true]])await scenario(async()=>{const h=setup({status,data:{code,error:'original error'}});await rejected(h.run(),'original error');check(!!h.receipt(),kept);check(h.state.post,1)});
 await scenario(async()=>{const h=setup({post:()=>new Response('invalid',{status:202})});await rejected(h.run());check(!!h.receipt(),true);check(h.state.post,1)});
 await scenario(async()=>{const h=setup({data:{ok:true}});if(baseline){await h.run();check(h.receipt().taskId,'undefined')}else {await rejected(h.run(),'尚未核实');check(h.receipt().taskId,undefined);check(h.state.refresh,0)}});
 await scenario(async()=>{const h=setup({actualId:'server-operation'});await h.run();check(h.receipt().idempotencyKey,'server-operation')});
 await scenario(async()=>{const h=setup({afterSave:s=>{s.epoch=2}});if(baseline){await h.run();check(h.state.post,1)}else {await rejected(h.run(),'STALE_VIEW');check(h.state.post,0);check(h.receipt(),null)}});
 await scenario(async()=>{const h=setup({afterPost:s=>{s.epoch=2}});if(baseline){await h.run();check(h.state.refresh,3)}else {await rejected(h.run(),'STALE_VIEW');check(h.state.refresh,0)}check(h.receipt().taskId,'task-one')});
 await scenario(async()=>{const h=setup();h.state.epoch=3;if(baseline){await h.run();check(h.state.post,1)}else {await rejected(h.run(),'STALE_VIEW');check([h.state.save,h.state.post],[0,0])}});
 for(const count of [2,4])await scenario(async()=>{const run={nodes:Array.from({length:count},(_,i)=>({id:'v'+i,status:'processing',taskId:'task'+i}))},h=setup({data:{run}});await h.run(count);check([h.state.save,h.state.post,h.state.billing,h.state.refresh],[1,1,1,3]);check(JSON.parse(h.events[0].body).count,count);check(h.storage.getItem('naumi:canvas-video-batch:owner@fixture.test:v'),null)});
 await scenario(async()=>{const h=setup({data:{run:{nodes:[{id:'v',status:'needs_attention',error:'inspect original'}]}}});await rejected(h.run(2),'inspect original');check(h.state.post,1);check(h.state.refresh,3)});
 await scenario(async()=>{const h=setup();h.retained();await rejected(h.run(2),'单个视频');check(h.state.post,0)});
 await scenario(async()=>{const h=setup(),key='naumi:canvas-video-batch:owner@fixture.test:v';h.storage.setItem(key,'invalid');await rejected(h.run(1),'记录');check(h.state.post,0);check(h.storage.getItem(key),'invalid')});
 await scenario(async()=>{const h=setup({get:()=>response(200,{run:{nodes:[{id:'v',status:'processing',taskId:'retained-task'}]}})}),key='naumi:canvas-video-batch:owner@fixture.test:v';h.storage.setItem(key,JSON.stringify({draft:'frozen',body:{expectedRevision:3,idempotencyKey:'retained-batch',count:4,billingVersion:1,billingCredits:24}}));await h.run(1);check([h.state.save,h.state.post],[0,0]);check(h.storage.getItem(key),null)});
 await scenario(async()=>{const h=setup({data:{run:{nodes:[{id:'v',status:'pending'}]}}});await rejected(h.run(2),'原批次');check(!!h.storage.getItem('naumi:canvas-video-batch:owner@fixture.test:v'),true);check(h.state.post,1)});
 await scenario(async()=>{const h=setup({data:{run:{nodes:[{id:'v',status:'processing',taskId:'same'}]}}}),key='naumi:canvas-video-batch:owner@fixture.test:v',body={expectedRevision:7,idempotencyKey:'original-batch',count:2,billingVersion:1,billingCredits:12};h.storage.setItem(key,JSON.stringify({draft:JSON.stringify({title:h.node.title,config:h.node.config,inputs:h.node.inputs}),body}));await h.run(2);check(JSON.parse(h.events[1].body),body);check(h.state.save,0)});
 await scenario(async()=>{const h=setup({actualId:'same-original',beforeIdentity:s=>{s.epoch=2}});if(baseline){await h.run();check(h.state.post,1)}else {await rejected(h.run(),'STALE_VIEW');check(h.state.post,0);check(h.receipt().taskId,undefined)}});
 console.log(`CANVAS_VIDEO_SUBMISSION=PASS MODE=${baseline?'BASELINE':'MODIFIED'} CASES=${cases} CHECKS=${checks} ORIGINAL_HELPERS=ACTUAL AUTOMATIC_REPOSTS=0 DB=0 SUPPLIER=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
