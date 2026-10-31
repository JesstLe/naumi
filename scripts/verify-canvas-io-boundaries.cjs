// Actual component callbacks, artwork document/scope and prompt browser adapter.
// Authentication/workspace/HTTP are explicit local ports, not a live-App claim.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{build}=require('esbuild');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const root=path.resolve(arg('--source-root','.')),baseline=args.includes('--baseline'),out=path.resolve(arg('--out',process.env.CANVAS_IO_EVIDENCE||'output/canvas-io-boundaries'));
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4),fn={};
let dimensions,video;
function walk(n){
 if(ts.isFunctionDeclaration(n)&&n.name)fn[n.name.text]=n.getText(ast);
 if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='onNodeDimensions'&&n.initializer&&ts.isCallExpression(n.initializer))dimensions=n.initializer.arguments[0].getText(ast);
 if(ts.isJsxAttribute(n)&&n.name.getText(ast)==='onOptimize'&&n.initializer?.expression){const s=n.initializer.expression.getText(ast);if(s.includes('canvas-video')||s.includes('optimizeCanvasVideoPrompt'))video=s;}
 ts.forEachChild(n,walk);
}walk(ast);
assert.ok(video,'actual video dialog callback');assert.equal(!!dimensions,baseline,'selected ownership shape');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:9,module:1}}).outputText,plain=x=>JSON.parse(JSON.stringify(x));
const tick=()=>new Promise(r=>setImmediate(r)),deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
let checks=0,cases=0;const normal=[],observations={},eq=(a,b,m)=>{assert.deepEqual(plain(a),plain(b),m);checks++;},ok=(x,m)=>{assert.ok(x,m);checks++;};
const art=(id='a')=>({id,title:id,image:'/fixture.png',createdAt:'2026-10-31',width:10,height:20,canvasX:100,canvasY:200,canvasWidth:300,canvasHeight:400,canvasImageRevision:3});
const wire=c=>c.map(({url,method,body,contentType})=>({url,method,body,contentType}));
async function test(name,work,stable=true){const result=await work();if(stable)normal.push([name,result]);cases++;console.log('PASS '+name);}
async function bundle(){return (await build({stdin:{contents:['artwork-document','document-scope','prompt-optimizer-client'].map(n=>'export * from '+JSON.stringify(path.join(root,'src/lib/canvas',n+'.ts'))+';').join('\n'),resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'explicit-browser-ports',setup(b){
 b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'workspace',namespace:'fixture'}));b.onResolve({filter:/model-config\/feature-client$/},()=>({path:'model',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='auth'?'export const authHeader=()=>__ports.auth();':a.path==='model'?'export const ensureFeatureModelSelection=async()=>{__ports.models++;return "original-text-model";}':'export const currentWorkspace=()=>__ports.workspace,currentWorkspaceRevision=()=>__ports.revision;'}));
 }}]})).outputFiles[0].text;}
function setup(built,{readOnly=false,owner='owner@test'}={}){
 const state={calls:[],actor:owner,owner,project:'tree:A',readOnly,respond:async()=>Response.json({ok:true}),authWait:async()=>{},modelCalls:0};
 const ports={workspace:'personal',revision:0,models:0,async auth(){await state.authWait();return {authorization:'fixture:'+state.actor,'x-naumi-workspace':ports.workspace};}};
 const module={exports:{}};const c={module,exports:module.exports,__ports:ports,console,Map,Set,Headers,Response,Request,AbortSignal,AbortController,URL,URLSearchParams,Blob,structuredClone,setTimeout,clearTimeout,
 dimensionSyncRef:{current:new Set()},authHeader:()=>ports.auth()};
 c.fetch=async(url,init={})=>{const headers=new Headers(init.headers);state.calls.push({url,method:init.method||'GET',body:init.body?JSON.parse(init.body):null,contentType:headers.get('content-type'),headers:Object.fromEntries(headers),signal:init.signal});if(init.signal?.aborted)throw init.signal.reason;return state.respond(url,init);};
 vm.createContext(c);vm.runInContext(built,c);Object.assign(c,module.exports);vm.runInContext(compile(fn.privateFetchRaw+'\n'+fn.readJsonSafe+'\nglobalThis.__video='+video+(baseline?'\nglobalThis.__dimensions=(user,readOnly,setWorks)=>('+dimensions+');':'')),c);
 const context=c.createCanvasDocumentContext(),store=c.createCanvasArtworkDocument();let doc,observe;
 const render=()=>{const scope=context.render(JSON.stringify([state.actor,state.owner]),state.project);doc=store.bind(scope,state.owner,!!state.actor&&!state.readOnly);observe=baseline?c.__dimensions(state.actor?{email:state.actor}:null,state.readOnly,doc.set):doc.recordDimensions;return {doc,observe,scope};};
 render();doc.accept([art()]);
 return {state,ports,c,context,render,doc:()=>doc,observe:(...v)=>observe(...v),async settled(){for(let i=0;i<4;i++)await tick();}};
}
async function main(){
 const built=await bundle();
 await test('component-uses-specific-owners',async()=>{if(!baseline){ok(source.includes('recordDimensions:onNodeDimensions'));ok(!source.includes('dimensionSyncRef'));ok(!source.includes('/api/artworks/dimensions'));ok(!source.includes("privateFetchRaw('/api/prompt-assist'"));}return 'wired';});
 await test('rounded-metadata-wire-and-layout-fields-exact',async()=>{const f=setup(built);await f.observe('a',400.6,200.2);await f.settled();const a=f.doc().getSnapshot().nodes[0];eq([a.width,a.height,a.canvasX,a.canvasY,a.canvasWidth,a.canvasHeight,a.canvasImageRevision],[401,200,100,200,300,400,3]);eq(wire(f.state.calls),[{url:'/api/artworks/dimensions',method:'POST',body:{id:'a',width:401,height:200},contentType:'application/json'}]);if(!baseline){eq(f.state.calls[0].headers['x-naumi-workspace'],'personal');eq(f.state.calls[0].headers['x-naumi-project-context'],'tree:A');}return [plain(a),wire(f.state.calls)];});
 await test('duplicate-observation-one-write',async()=>{const f=setup(built);await Promise.all([f.observe('a',400,200),f.observe('a',400,200)]);await f.settled();eq(f.state.calls.length,1);return wire(f.state.calls);});
 await test('read-only-decode-local-only',async()=>{const f=setup(built,{readOnly:true});await f.observe('a',400,200);await f.settled();eq(f.state.calls.length,0);eq(f.doc().getSnapshot().nodes[0].width,400);return plain(f.doc().getSnapshot().nodes[0]);});
 for(const [id,w,h] of [['',100,100],['a',0,100],['a',100,-1],['a',8193,100],['a',100,Infinity]])await test('invalid-dimensions-'+id+'-'+w+'-'+h,async()=>{const f=setup(built);await f.observe(id,w,h);await f.settled();eq(f.state.calls.length,0);eq(f.doc().getSnapshot().nodes[0].width,10);return 'no-write';});
 await test('network-failure-no-auto-retry-explicit-observation-releases',async()=>{const f=setup(built);f.state.respond=async()=>{throw Error('offline')};await f.observe('a',400,200);await f.settled();eq(f.state.calls.length,1);f.state.respond=async()=>Response.json({ok:true});await f.observe('a',400,200);await f.settled();eq(f.state.calls.length,2);return wire(f.state.calls);});
 await test('same-document-project-navigation-keeps-metadata',async()=>{const f=setup(built),gate=deferred(),entered=deferred();f.state.authWait=()=>{entered.resolve();return gate.promise};const pending=f.observe('a',400,200);await entered.promise;f.state.project='tree:B';f.render();gate.resolve();await pending;await f.settled();eq(f.state.calls.length,1);if(!baseline)eq(f.state.calls[0].headers['x-naumi-project-context'],'tree:A');return wire(f.state.calls);});
 for(const kind of ['account','workspace'])await test('dimension-marker-owned-by-'+kind,async()=>{const f=setup(built);await f.observe('a',400,200);await f.settled();if(kind==='account'){f.state.actor=f.state.owner='other@test';}else{f.ports.workspace='tenant';f.ports.revision++;}f.render();f.doc().accept([art()]);await f.observe('a',600,300);await f.settled();eq(f.state.calls.length,baseline?1:2);observations[kind+'MarkerSuppressed']=baseline?1:0;},false);
 await test('http-failure-releases-only-on-next-observation',async()=>{const f=setup(built);f.state.respond=async()=>Response.json({error:'unavailable'},{status:503});await f.observe('a',400,200);await f.settled();eq(f.state.calls.length,1);f.state.respond=async()=>Response.json({ok:true});await f.observe('a',400,200);await f.settled();eq(f.state.calls.length,baseline?1:2);observations.httpFailureStuck=baseline?1:0;},false);
 await test('nonfinite-metadata-does-not-become-null',async()=>{const f=setup(built);await f.observe('a',NaN,200);await f.settled();eq(f.state.calls.length,baseline?1:0);if(baseline)eq(f.state.calls[0].body.width,null);observations.nonfinitePost=baseline?1:0;},false);
 for(const kind of ['account-ABA','workspace-ABA','unmount'])await test('metadata-scope-after-auth-'+kind,async()=>{const f=setup(built),gate=deferred(),entered=deferred();f.state.authWait=()=>{entered.resolve();return gate.promise};const pending=f.observe('a',400,200);await entered.promise;
  if(kind==='account-ABA'){const actor=f.state.actor;f.state.actor='other@test';f.render();f.state.actor=actor;f.render();}else if(kind==='workspace-ABA'){f.ports.workspace='tenant';f.ports.revision++;f.ports.workspace='personal';f.ports.revision++;}else f.context.mount(false);
  gate.resolve();await pending;await f.settled();eq(f.state.calls.length,baseline?1:0);observations[kind+'LatePost']=baseline?1:0;
 },false);
 const responseCases=[['success',200,JSON.stringify({prompt:'  原文“保留”【图1】  '}),'  原文“保留”【图1】  '],['empty-prompt',200,'{"prompt":""}',''],['json-error',403,'{"error":"原始明确原因"}','原始明确原因'],['missing-prompt',200,'{}','提示词优化失败，原文已保留'],['wrong-type',200,'{"prompt":3}','提示词优化失败，原文已保留'],['empty-body',200,'','提示词优化失败，原文已保留'],['null',200,'null','提示词优化失败，原文已保留'],['html-error',503,'<html>unavailable</html>','服务暂时不可用(503),请刷新页面后重试'],['malformed-ok',200,'broken','服务返回异常,请重试'],['empty-error',500,'','提示词优化失败，原文已保留']];
 for(const [name,status,body,expected] of responseCases)await test('video-'+name,async()=>{const f=setup(built),controller=new AbortController();f.state.respond=async()=>new Response(body,{status});let output,error;try{output=await f.c.__video('原提示词【图1】',controller.signal);}catch(e){error=e.message;}eq(error??output,expected);eq(f.state.calls.length,1);ok(f.state.calls[0].signal===controller.signal,'same AbortSignal identity');eq(f.ports.models,0);return {output,error,wire:wire(f.state.calls)};});
 for(const stage of ['network','before-request','body-read'])await test('video-abort-or-network-'+stage,async()=>{const f=setup(built),controller=new AbortController(),cause=Error('original-'+stage);if(stage==='before-request')controller.abort(cause);f.state.respond=async()=>{if(stage==='body-read')return {ok:true,status:200,text:async()=>{throw cause}};throw cause;};let error;try{await f.c.__video('原文',controller.signal);}catch(e){error=e;}ok(error===cause,'original error identity');eq(f.state.calls.length,1);eq(f.ports.models,0);return {error:error.message,wire:wire(f.state.calls)};});
 for(const tool of ['canvas-image','canvas-text'])await test('existing-'+tool+'-transport-unchanged',async()=>{const f=setup(built);f.state.respond=async()=>Response.json({prompt:'same output'});eq(await f.c.optimizeCanvasPrompt(tool,'same input',new AbortController().signal),'same output');eq(f.ports.models,1);eq(f.state.calls[0].headers['x-naumi-feature-model'],'original-text-model');return wire(f.state.calls);});
 if(arg('--compare')){const before=JSON.parse(fs.readFileSync(arg('--compare'),'utf8'));eq(normal,before.normal,'all normal metadata/video/image/text contracts exact');}
 const result={status:baseline?'BASELINE_CAPTURED':'PASS',baseline,sourceRoot:root,cases,checks,normal,observations,comparison:arg('--compare')?'EXACT':'CAPTURED',ports:['auth','workspace','HTTP'],realComponentCallbacks:true,realDocumentOwner:true,realPromptAdapter:true,pg:0,supplierPosts:0};
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');
 console.log(`CANVAS_IO_BOUNDARIES=${baseline?'BASELINE_CAPTURED':'PASS'} CASES=${cases} CHECKS=${checks} NORMAL=${result.comparison} ABNORMAL_OBSERVATIONS=${Object.values(observations).reduce((a,b)=>a+b,0)} COMPONENT_CALLBACKS=ACTUAL DOCUMENT=ACTUAL PROMPT_ADAPTER=ACTUAL PG=0 SUPPLIER_POSTS=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
