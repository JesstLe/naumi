// Execute real Canvas entry functions and task modules; only browser I/O is fixture.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{build}=require('esbuild');
const root=path.resolve(process.env.TASK_SOURCE_ROOT||process.cwd()),out=path.resolve(process.env.TASK_EVIDENCE||'output/refactor-r3b4-20261024'),baseline=process.argv.includes('--baseline');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4),functions={};
function walk(node){if(ts.isFunctionDeclaration(node)&&node.name)functions[node.name.text]=node.getText(ast);ts.forEachChild(node,walk);}walk(ast);
const names=['canvasGenerationRunContext','privateFetch','landEditResult','generateDetailSequence','runCutout','onExpand','submitAnnotations','restoreEditTasks','rememberGenerationDrag','onPendRemove','appendComposerReferences','artworkNodeSize','artworkImageSize'];
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:9,module:1}}).outputText;
const billingSource=fs.readFileSync(path.join(root,'src/lib/billing/client.tsx'),'utf8'),billingAst=ts.createSourceFile('client.tsx',billingSource,99,true,4),callbacks={};
(function walk(n){if(ts.isVariableDeclaration(n)&&['submit','quoteAndSubmit'].includes(n.name.getText(billingAst))&&n.initializer)callbacks[n.name.getText(billingAst)]=n.initializer.getText(billingAst);ts.forEachChild(n,walk);})(billingAst);
const plain=value=>JSON.parse(JSON.stringify(value));let checks=0;const eq=(actual,expected,label)=>{assert.deepEqual(plain(actual),plain(expected),label);checks++;};
const modules=[...(fs.existsSync(path.join(root,'src/lib/canvas/edit-run.ts'))?['canvas/edit-run','canvas/detail-run','canvas/workflow-runs']:[]),...(fs.existsSync(path.join(root,'src/lib/canvas/pending-presentation.ts'))?['canvas/pending-presentation']:[]),...(fs.existsSync(path.join(root,'src/lib/canvas/generation-presentation.ts'))?['canvas/generation-presentation']:[]),...(fs.existsSync(path.join(root,'src/lib/canvas/creation-request.ts'))?['canvas/creation-request']:[]),...(fs.existsSync(path.join(root,'src/lib/canvas/generation-activity.ts'))?['canvas/generation-activity']:[]),...(fs.existsSync(path.join(root,'src/lib/canvas/node-geometry.ts'))?['canvas/node-geometry']:[]),'mock-data','canvas/input-references','imagegen/http','canvas/generation-failure','canvas/generation-feedback','canvas/generation-parameters','canvas/image-task-request','canvas/image-task-scope','canvas/image-references','imagegen/reference-labels','billing/client-intent',...(!baseline?['billing/client-submission','canvas/edit-task','canvas/detail-task-controller','canvas/detail-task-request','canvas/result-attachment']:[])];
async function bundle(){return (await build({stdin:{contents:modules.map(m=>`export * from './src/lib/${m}';`).join('\n'),resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'ports',setup(b){
 b.onResolve({filter:/model-config\/selection-policy$/},()=>({path:'model',namespace:'request-port'}));
 b.onResolve({filter:/model-config\/feature-client$/},()=>({path:'feature',namespace:'request-port'}));
 b.onResolve({filter:/imagegen\/canvas-client$/},()=>({path:'imagegen',namespace:'request-port'}));
 b.onLoad({filter:/.*/,namespace:'request-port'},a=>({loader:'js',contents:a.path==='model'?'export const adminConfiguredFeature=(...a)=>__requestPorts.adminConfiguredFeature(...a);':a.path==='feature'?'export const featureModelManaged=(...a)=>__requestPorts.featureModelManaged(...a);export const chosenFeatureModel=(...a)=>__requestPorts.chosenFeatureModel(...a);':'export const resolveCanvasDetailFrame=(...a)=>__requestPorts.resolveCanvasDetailFrame(...a);export const resolveCanvasLegacyFrame=(...a)=>__requestPorts.resolveCanvasLegacyFrame(...a);export const submitCanvasImagegen=(...a)=>__requestPorts.submitCanvasImagegen(...a);'}));
 b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/browser-image-cache$/},()=>({path:'image',namespace:'fixture'}));b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'workspace',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?'export const authHeader=()=>__ports.auth();':a.path==='image'?'export const readBrowserImage=(...args)=>__ports.image(...args);':'export const currentWorkspace=()=>__ports.workspace;export const currentWorkspaceRevision=()=>__ports.revision;',loader:'js'}));
 }}]})).outputFiles[0].text;}
function setup(kind,scenario,built){
 const art={id:'source',image:'/source.png',title:'Source',category:'main',ratio:'1:1',resolution:'1K',width:320,height:320},other={...art,id:'source2',image:'/source2.png'},pend={id:'pend-A',label:'detail',inputs:['source'],x:600,y:300};
 const images=[{id:'result-1',url:'/result-1.png',image:'/result-1.png',status:'done',width:512,height:1024},{id:'result-2',url:'/result-2.png',image:'/result-2.png',status:'done',width:1024,height:512}];
 const state={posts:0,supplier:0,quotes:0,frames:0,polls:0,metadata:0,merges:0,positions:[],history:[],forms:[],headers:[],notices:[],user:0,retried:false,clock:1,authCalls:0,reads:0,storage:new Map(),intents:new Map(),server:new Map(),uuid:0,intervals:new Map()};
 const module={exports:{}},ports={workspace:'personal',revision:0,async auth(){state.authCalls++;if(scenario==='auth-aba'&&state.authCalls===1){ports.revision+=2;}return {'x-naumi-workspace':ports.workspace,authorization:'Bearer local-fixture'};},async image(url){state.reads++;if(scenario==='reference-fails'&&!state.retried)throw Error('fixture reference failed');return new Blob(['bytes:'+url],{type:'image/png'});}};
 const c={canvasHistory:{consumePending(){}},process:{env:{}},__ports:ports,module,exports:module.exports,require,console,Buffer,Error,Math,Promise,Set,Map,WeakMap,WeakSet,Date:class extends Date{static now(){return state.clock}},Headers,Response,Request,File,Blob,FormData,URL,AbortSignal,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,crypto:globalThis.crypto,structuredClone,encodeURIComponent,
  setTimeout:f=>{state.clock+=2500;queueMicrotask(f);return 1},clearTimeout(){},
  window:{setInterval:f=>{state.intervals.set(1,f);return 1},clearInterval:id=>state.intervals.delete(id),dispatchEvent(){}},localStorage:{getItem:k=>state.storage.get(k)||null,setItem:(k,v)=>state.storage.set(k,v),removeItem:k=>state.storage.delete(k)},
  readOnly:false,user:{email:'fixture@example.test'},active:{key:'tree:source',members:[art]},activeKey:'tree:source',source:art,selected:art,annotateArtwork:art,expandAnchor:'center',genModel:'fixture-model',genQuality:'medium',canvasToolQualities:{},genRatio:'3:4',genCount:2,generationTasks:[],pendNodes:kind==='detail-blank'?[pend]:[],rfNodes:[],
  canvasAccountRef:{current:'fixture-account'},canvasContextEpochRef:{current:0},batchRunMountedRef:{current:true},activeProjectRef:{current:{key:'tree:source'}},selectedIdRef:{current:'source'},selectedPendIdRef:{current:pend.id},generationOperationRef:{current:new Set()},generationTaskPosRef:{current:{}},generationTaskSizeRef:{current:{}},pendNodesRef:{current:[]},editTaskStateRef:{current:new Map()},
  rfRef:{current:{getNode:()=>({position:{x:100,y:200}}),getNodes:()=>[]}},flowNodeSize:()=>({width:320,height:320}),X_GAP:40,NODE_W:320,NODE_LABEL_H:36,MAX_GENERATION_COUNT:8,MAX_TOTAL_IMAGES:6,DETAIL_MODULE_ORDER:['hero','selling','scene','angles','ingredients','usage','specs','assurance'],
  t:k=>k,fmt:(s,vars)=>s+JSON.stringify(vars),flashTip:s=>state.notices.push(s),setGenError:s=>{state.error=s},setExpandOpen(){},canFeature:()=>true,isNodeLocked:()=>false,cutoutCatalog:{available:true},cutoutCatalogError:null,
  browserRandomUUID:()=>`12345678-1234-4234-a234-${String(++state.uuid).padStart(12,'0')}`,authHeader:ports.auth,currentWorkspace:()=>ports.workspace,readBrowserImage:ports.image,
  adminConfiguredFeature:()=>true,featureModelManaged:()=>false,chosenFeatureModel:()=>undefined,frameChoice:{chooseFrame:()=>{}},resolveCanvasLegacyFrame:async()=>{},resolveCanvasDetailFrame:async()=>{state.frames++;if(scenario==='cancelled')throw new c.ImagegenPreparationCancelled();},
  readJsonSafe:r=>r.json(),expectJsonOk:async(r,fallback)=>{const data=await r.json();if(!r.ok)throw Error(data.error||fallback);return data;},applyServerUser:()=>{state.user++},
  reserveGenerationPosition:(id,pos)=>{c.generationTaskPosRef.current[id]=pos;return pos},livePendingPosition:(id,fallback)=>c.pendNodes.find(n=>n.id===id)||fallback,
  pushAddUndoMany:ids=>state.history.push([...ids]),pushAddUndo:id=>state.history.push([id]),
  useCallback:f=>f,catalog:null,refresh:async()=>{},toast(){},invalidateBrowserData(){},MODEL_CATALOG_REFRESH:'fixture',intents:{current:state.intents},
 };
 c.setGenerationTasks=f=>{c.generationTasks=typeof f==='function'?f(c.generationTasks):f};c.setPendNodes=f=>{c.pendNodes=typeof f==='function'?f(c.pendNodes):f;c.pendNodesRef.current=c.pendNodes};c.setSelectedPendId=f=>{c.selectedPendIdRef.current=typeof f==='function'?f(c.selectedPendIdRef.current):f};
 c.mergeWorks=async(ids,current=()=>true)=>{state.merges++;if(scenario==='sync-missing'&&!state.retried)throw Error('fixture merge failed');return current()?images.filter(r=>ids.includes(r.id)):[];};
 c.taskDocumentRef={current:{merge:c.mergeWorks,history:c.pushAddUndoMany}};
 const serialize=async body=>typeof body==='string'?JSON.parse(body):await Promise.all([...body.entries()].map(async([k,v])=>[k,typeof v==='string'?v:{name:v.name,type:v.type,bytes:await v.text()}]));
 const switchView=()=>{c.activeProjectRef.current={key:'tree:B'};c.canvasContextEpochRef.current++;c.pendNodes=[];if(scenario==='project-aba'){c.activeProjectRef.current={key:'tree:source'};c.canvasContextEpochRef.current++;}if(scenario==='unmounted')c.batchRunMountedRef.current=false;};
 c.fetch=async(url,init={})=>{
  const u=String(url);
  if(u==='/api/artworks/position'){state.positions.push(JSON.parse(init.body));if(scenario==='position-fails'&&!state.retried)return Response.json({error:'fixture position failure'},{status:503});return Response.json({ok:true});}
  if(u.includes('/api/artworks/get')){state.metadata++;if(scenario==='metadata-fails'&&!state.retried)return Response.json({error:'fixture metadata failure'},{status:503});return Response.json({artworks:images});}
  if(init.method==='POST'){
   state.posts++;state.headers.push(Object.fromEntries(new Headers(init.headers)));state.forms.push(await serialize(init.body));
   if(scenario==='rejected'&&!state.retried)return Response.json({error:'fixture rejection',accepted:false},{status:402});
   const operation=new Headers(init.headers).get('x-naumi-billing-operation-id');
   if(!state.server.has(operation)){state.supplier++;state.server.set(operation,kind.startsWith('detail')?{jobId:'aplus-'+operation}:{id:'result-1',user:{creditsTotal:50}});}
   if(['project-switch','project-aba','unmounted'].includes(scenario)&&!state.retried)switchView();
   if(['submit-unknown','identity-collision'].includes(scenario)&&!state.retried)throw Error('fixture lost successful response');
   if(scenario==='pending'&&!state.retried)return Response.json({code:'OPERATION_PENDING',error:'original pending',operationId:'tool-'+operation},{status:409});
   return Response.json(state.server.get(operation));
  }
  state.polls++;if(state.polls>8)throw Error('fixture poll runaway');
  if(scenario==='poll-fails'&&!state.retried)throw Error('fixture poll failure');
  if(scenario==='poll-malformed'&&!state.retried)return new Response('<html>bad gateway</html>',{status:502});
  if(scenario==='terminal')return Response.json({status:'error',error:'terminal fixture',shots:[]});
  return Response.json({status:scenario==='partial'?'error':'done',operationStatus:scenario==='partial'?'partial':'succeeded',error:scenario==='partial'?'one of two failed':undefined,done:2,shots:scenario==='short-done'?images.slice(0,1):images,user:{creditsTotal:50}});
 };
 c.privateFetchRaw=(url,init)=>c.fetch(url,init);
 c.getQuote=async facts=>{state.quotes++;return {...facts,credits:state.retried?99:3,version:state.retried?2:1,reserveCredits:3};};
 c.__requestPorts=Object.fromEntries(['adminConfiguredFeature','featureModelManaged','chosenFeatureModel','resolveCanvasDetailFrame','resolveCanvasLegacyFrame','submitCanvasImagegen'].map(name=>[name,c[name]]));
 vm.createContext(c);vm.runInContext(built,c);Object.assign(c,module.exports);c.appendComposerReferences=c.appendCanvasImageReferences;
 const presentation=require('./verification/canvas-generation-presentation-fixture.cjs').bindGenerationPresentation(c,module.exports,()=>ports.workspace);
 vm.runInContext(compile(`const submit=${callbacks.submit};const quoteAndSubmit=${callbacks.quoteAndSubmit};globalThis.billing={quote:getQuote,submit,quoteAndSubmit};`),c);
 vm.runInContext(compile(names.map(n=>functions[n]||'').join('\n')),c);
 const extra=[new File(['uploaded bytes'],'uploaded.webp',{type:'image/webp'})];
 const refs=scenario==='roles'?[{key:'src',number:1,role:'edit-target',title:'Source',sourceNodeId:art.id,url:art.image},{key:'style',number:2,role:'style',title:'style',url:'',file:extra[0]}]:undefined;
 const run=()=>kind.startsWith('detail')?c.generateDetailSequence(art,[art,other],'detail brief',extra,kind==='detail-blank'?pend:undefined,refs):kind==='cutout'?c.runCutout(art):kind==='expand'?c.onExpand('3:4'):c.submitAnnotations((()=>{const f=new FormData();f.set('artworkId',art.id);f.set('image',extra[0]);f.set('instructions','annotate brief');return f;})());
 const retry=()=>kind==='detail'?c.generationTasks[0]?.onRetry:c.pendNodes[0]?.onGenerationRetry;
 const restore=()=>{c.activeProjectRef.current={key:'tree:source'};c.canvasContextEpochRef.current++;c.batchRunMountedRef.current=true;presentation?.render();c.restoreEditTasks();};
 return {c,state,run,retry,restore,ports,presentation};
}
module.exports={bundle,setup,root};
if(require.main===module)(async()=>{
 const built=await bundle(),rows=[];
 const scenarios=['done','reference-fails','rejected','submit-unknown','identity-collision','pending','position-fails','sync-missing','project-switch','project-aba','unmounted','auth-aba'];
 for(const kind of ['detail','detail-blank','cutout','expand','annotate'])for(const scenario of [...scenarios,...(kind.startsWith('detail')?['poll-fails','poll-malformed','metadata-fails','partial','short-done','terminal','roles','cancelled']:[])]){
  if(scenario==='reference-fails'&&['expand','annotate'].includes(kind))continue;
  const f=setup(kind,scenario,built),{c,state}=f;await f.run();
  eq(c.generationOperationRef.current.size,0,kind+'/'+scenario+' unlock');eq(state.intervals.size,0,'no leaked timers');
  console.log('CASE',kind,scenario,'posts='+state.posts,'history='+state.history.length,'error='+state.error,'notice='+state.notices.at(-1));
  const first={posts:state.posts,supplier:state.supplier,quotes:state.quotes,history:state.history.length,positions:state.positions.length};
  if(['project-switch','project-aba','unmounted'].includes(scenario))f.restore();
  let retry=f.retry(),retryError;
  const retryable=['reference-fails','rejected','submit-unknown','identity-collision','pending','position-fails','sync-missing','poll-fails','poll-malformed','metadata-fails','partial','short-done','terminal','project-switch','project-aba','unmounted','auth-aba'].includes(scenario);
  if(retryable&&typeof retry==='function'){
   state.retried=true;
   if(scenario==='identity-collision')for(const key of state.intents.keys()){state.intents.set(key,'rival-operation-12345678');state.storage.set(key,'rival-operation-12345678');}
   try{if(baseline)await retry();else {await Promise.all([retry(),retry()]);await retry();}}catch(e){retryError=String(e);if(!baseline)throw e;}
  }
  if(scenario==='done'||scenario==='roles'){eq(state.posts,1,'actual caller submits');eq(state.history.length,1,'actual caller attaches');}
  if(!baseline){
   if(scenario==='done'||scenario==='roles'){eq(state.posts,1,'one paid submission');eq(state.history.length,1,'one undo');}
   if(['poll-fails','poll-malformed','metadata-fails','position-fails','sync-missing'].includes(scenario)){eq(state.posts,1,'known job/result never re-submitted');eq(state.history.length,1,'recovery adds one undo');eq(state.quotes,1,'known task never re-quoted');}
   if(['submit-unknown','identity-collision','pending'].includes(scenario)){eq(state.supplier,1,'receipt retry has zero supplier replay');eq(state.quotes,1,'unknown preserves original quote');eq(state.headers.map(h=>h['x-naumi-billing-credits']),['3','3'],'same original price');eq(state.forms[0],state.forms[1],'original body bytes');eq(state.history.length,1,'receipt result attached');}
   if(scenario==='partial'||scenario==='short-done'){eq(state.history.length,1,'partial output has single undo');eq(state.posts,1,'partial recheck only GET');eq(state.polls,3,'explicit checks query same partial task');}
   if(['project-switch','project-aba','unmounted'].includes(scenario)){eq(first.positions,0,'stale attempt never attaches');eq(state.posts,1,'restore retains accepted identity');if(kind!=='detail')eq(state.history.length,1,'original view resumes result');}
   if(scenario==='auth-aba'){eq(first.posts,0,'auth ABA prevents paid POST');}
   if(scenario==='cancelled'){eq(state.posts,0,'cancelled frame zero POST');eq(c.generationTasks.length,0,'cancel removes task');}
   if(scenario==='identity-collision')eq(state.headers[0]['x-naumi-billing-operation-id'],state.headers[1]['x-naumi-billing-operation-id'],'explicit original ID wins shared cache');
   if(scenario==='done'&&kind.startsWith('detail')){eq(state.positions[1].y-state.positions[0].y,c.artworkNodeSize({width:512,height:1024}).height+24,'detail spacing uses displayed artwork height');}
  }
  if(baseline&&kind.startsWith('detail')&&['poll-fails','position-fails','sync-missing','metadata-fails'].includes(scenario))eq(state.posts,2,'baseline recreates accepted job');
  if(baseline&&scenario==='partial')eq(state.history.length,2,'baseline repeats partial undo');
  rows.push({kind,scenario,first,posts:state.posts,supplier:state.supplier,quotes:state.quotes,polls:state.polls,history:state.history,positions:state.positions,forms:state.forms,retryError});
 }
 fs.writeFileSync(path.join(out,`${baseline?'BASELINE':'MODIFIED'}_RESULT.json`),JSON.stringify({root,checks,cases:rows.length,rows},null,2));
 console.log(`CANVAS_TASK_BOUNDARIES=PASS mode=${baseline?'BASELINE':'MODIFIED'} cases=${rows.length} checks=${checks} ACTUAL_CANVAS=1 ACTUAL_BILLING_CLIENT=1 KNOWN_RETRY=${baseline?'REPOST_OR_UNHANDLED':'RESUME'} SUPPLIER=FIXTURE EXTERNAL=0`);
})().catch(error=>{console.error(error);process.exitCode=1;});
