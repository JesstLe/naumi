// Real Canvas function bodies + actual new controller/request/scope modules.
// Browser transport/document ports are local fixtures; no product DB or suppliers.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{build}=require('esbuild');
const root=path.resolve(process.env.CANVAS_IMAGE_SOURCE_ROOT||process.cwd()),baseline=process.argv.includes('--baseline'),out=path.resolve(process.env.R3_EVIDENCE||'output/refactor-r3a-20261024');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4),fns={};
function walk(node){if(ts.isFunctionDeclaration(node)&&['runGen','generatePend','appendComposerReferences'].includes(node.name?.text))fns[node.name.text]=node.getText(ast);ts.forEachChild(node,walk);}walk(ast);
const declarations=ts.transpileModule(Object.values(fns).join('\n'),{compilerOptions:{target:9,module:1}}).outputText;
const shared=fs.existsSync(path.join(root,'src/lib/canvas/image-task-controller.ts'));assert.equal(shared,!baseline,'mode must match whole source tree');
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const plain=x=>JSON.parse(JSON.stringify(x));
async function bundle(){
 const entry=[...(fs.existsSync(path.join(root,'src/lib/canvas/generation-presentation.ts'))?['export * from "./src/lib/canvas/generation-presentation";']:[]),...(fs.existsSync(path.join(root,'src/lib/canvas/generation-activity.ts'))?['export * from "./src/lib/canvas/generation-activity";']:[]),'export * from "./src/lib/imagegen/http";','export * from "./src/lib/canvas/generation-failure";','export * from "./src/lib/canvas/generation-feedback";','export * from "./src/lib/canvas/generation-parameters";','export * from "./src/lib/imagegen/output-advisory";','export * from "./src/lib/imagegen/client-recovery";','export * from "./src/lib/canvas/image-references";','export * from "./src/lib/imagegen/reference-labels";',...(shared?['export * from "./src/lib/canvas/image-task-controller";',...(fs.existsSync(path.join(root,'src/lib/canvas/image-creation.ts'))?['export * from "./src/lib/canvas/image-creation";']:[]),'export * from "./src/lib/canvas/image-task-request";','export * from "./src/lib/canvas/image-task-scope";']:[])].join('\n');
 return (await build({stdin:{contents:entry,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'local-browser-ports',setup(b){
  b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));
  b.onResolve({filter:/browser-image-cache$/},()=>({path:'image',namespace:'fixture'}));
  b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'workspace',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?'export const authHeader=()=>__ports.auth();':a.path==='image'?'export const readBrowserImage=(...args)=>__ports.read(...args);':'export const currentWorkspace=()=>__ports.workspace;export const currentWorkspaceRevision=()=>__ports.revision;',loader:'js'}));
 }}]})).outputFiles[0].text;
}
function setup(kind,scenario,built){
 const src={id:'source',image:'/media/source.png',prompt:'source recipe',title:'source',category:'main',ratio:'3:4',resolution:'2K'},pend={id:'pend-A',label:'blank A',inputs:['source'],x:500,y:200};
 const results=[{id:'result-1',url:'/media/result-1.png',width:400,height:600},{id:'result-2',url:'/media/result-2.png',width:500,height:300}];
 const variations={
  'base-file':{baseFile:new File(['base fixture'],'chosen.png',{type:'image/png'}),extra:[new File(['extra fixture'],'extra.png',{type:'image/png'})]},
  'ref-urls':{refUrls:['/media/ref1.png','/media/ref2.png'],parentId:'source',parentIds:['other-source']},
  'explicit-roles':{referenceInputs:[{key:'node:source',sourceNodeId:'source',title:'source',url:'/media/source.png',number:1,role:'edit-target'},{key:'uploaded',title:'style',url:'',file:new File(['style fixture'],'style.png',{type:'image/png'}),number:2,role:'style'}]},
  'transparent':{transparent:true},'ratiogen':{ratiogen:true},
 };
 const state={post:0,polls:0,positions:[],history:[],merges:0,forms:[],headers:[],notices:[],user:0,clock:1,authCalls:0,storage:new Map(),retried:false};
 const operation='12345678-1234-4234-a234-123456789012',jobId='imagegen-'+operation;
 const ports={workspace:'personal',revision:0,async auth(){state.authCalls++;if(scenario==='workspace-aba'&&state.authCalls===2){ports.workspace='tenant-B';ports.revision++;ports.workspace='personal';ports.revision++;}return {'x-naumi-workspace':'wrong-current','x-naumi-project-context':'tree:wrong'};},async read(){if(scenario==='reference-fails')throw Error('reference failed');return new Blob(['fixture pixels'],{type:'image/png'});}};
 const module={exports:{}};
 const c={__ports:ports,console,Buffer,Date:class extends Date{static now(){return state.clock;}},Math,Promise,Set,Map,Response,Request,Headers,AbortSignal,FormData,File,Blob,URL,crypto:globalThis.crypto,TextEncoder,encodeURIComponent,structuredClone,
  setTimeout:f=>{state.clock+=2500;queueMicrotask(f);return 1},clearTimeout(){},module,exports:module.exports,require,
  sessionStorage:{getItem:k=>state.storage.get(k)||null,setItem:(k,v)=>state.storage.set(k,v),removeItem:k=>state.storage.delete(k),get length(){return state.storage.size},key:i=>Array.from(state.storage.keys())[i]},
  composerReferences:undefined,readOnly:false,user:{email:'fixture@example.test'},t:k=>k,genQuality:'medium',genCount:2,genRatio:'3:4',genStyle:'default',genResolution:'2K',genModel:'fixture',imageModels:[],generationMode:'standard',editPrompt:'fixture prompt',textNodes:[],pendNodes:[pend],generationTasks:[],rfNodes:[],works:[src],worksRef:{current:[src]},active:{key:'tree:source',members:[src]},activeKey:'tree:source',targetEmail:null,
  canvasAccountRef:{current:'fixture-account'},canvasContextEpochRef:{current:0},batchRunMountedRef:{current:true},activeProjectRef:{current:{key:'tree:source'}},selectedIdRef:{current:'source'},selectedPendId:'pend-A',selectedPendIdRef:{current:'pend-A'},pendingNodeRef:{current:null},generationOperationRef:{current:new Set()},generationTaskPosRef:{current:{}},generationTaskSizeRef:{current:{}},editTaskStateRef:{current:new Map()},pendNodesRef:{current:[pend]},textNodesRef:{current:[]},rfRef:{current:{getNode:id=>({id,position:{x:500,y:200},data:{}}),getNodes:()=>[]}},
  X_GAP:40,NODE_LABEL_H:36,FAITHFUL_REGEN_PROMPT:'keep',isNodeLocked:()=>false,flowNodeSize:()=>({width:320,height:320}),routeImageModel:v=>v,rememberGenerationDrag:()=>{},authHeader:ports.auth,currentWorkspace:()=>ports.workspace,
  readJsonSafe:r=>r.json(),expectJsonOk:async(r,fallback)=>{const b=await r.json();if(!r.ok)throw Error(b.error||fallback);return b;},
  applyServerUser:()=>{state.user++},pushAddUndoMany:(ids)=>state.history.push([...ids]),pushAddUndo:id=>state.history.push([id]),flashTip:m=>state.notices.push(m),setGenError:m=>{state.error=m},persistTextNode:async()=>{},setTextNodes:f=>{c.textNodes=typeof f==='function'?f(c.textNodes):f;},
  reserveGenerationPosition:(id,pos)=>{c.generationTaskPosRef.current[id]=pos;return pos},livePendingPosition:()=>({x:500,y:200}),readBrowserImage:ports.read,
 };
 c.setGenerationTasks=f=>{c.generationTasks=typeof f==='function'?f(c.generationTasks):f};c.setPendNodes=f=>{c.pendNodes=typeof f==='function'?f(c.pendNodes):f;c.pendNodesRef.current=c.pendNodes};c.setSelectedPendId=f=>{c.selectedPendId=typeof f==='function'?f(c.selectedPendId):f};
 const save=async(_url,init)=>{state.positions.push(JSON.parse(init.body));if(scenario==='position-fails'&&!state.retried)return Response.json({error:'fixture save failure'},{status:500});return Response.json({ok:true});};
 c.fetch=async(url,init)=>{
  if(String(url).includes('/position'))return save(url,init);
  state.polls++;state.headers.push(Object.fromEntries(new Headers(init?.headers)));if(state.polls>8)throw Error('fixture poll runaway');
  if(scenario==='malformed-query')return new Response('<html>502</html>',{status:502});
  if(scenario==='partial-error')return Response.json({status:'error',operationStatus:'failed',error:'partial fixture',images:results});
  if(scenario==='needs-review'||scenario==='stored-recovery')return Response.json({status:'error',operationStatus:'needs_attention',reviewRequired:true,error:'fixture review'});
  if(scenario==='poll-transient'&&!state.retried)throw Error('fixture network failure');
  if(scenario==='switch-project'){c.activeProjectRef.current={key:'tree:B'};c.canvasContextEpochRef.current++;}
  if(scenario==='unmounted')c.batchRunMountedRef.current=false;
  if(scenario==='terminal-failed')return Response.json({status:'error',operationStatus:'failed',error:'fixture terminal failure'});
  return Response.json({status:'done',warnings:scenario==='ratio-warning'?['ratio fixture notice']:undefined,operationStatus:scenario==='partial'?'partial':'succeeded',images:results,user:{creditsTotal:7}});
 };
 c.privateFetchRaw=save;
 c.mergeWorks=async(ids,current=()=>true)=>{state.merges++;if(scenario==='sync-missing'&&!state.retried)return [src];if(!current())return[];const works=[src,...results.map(r=>({...r,image:r.url}))];c.worksRef.current=works;return works;};
 vm.createContext(c);vm.runInContext(built,c);Object.assign(c,module.exports);
 if(shared)c.appendComposerReferences=c.appendCanvasImageReferences;
 const presentation=require('./verification/canvas-generation-presentation-fixture.cjs').bindGenerationPresentation(c,module.exports,()=>ports.workspace);
 c.privateFetch=async(_url,init)=>{
  state.post++;const fields=[];for(const [key,value]of init.body)fields.push([key,typeof value==='string'?value:{name:value.name,type:value.type,bytes:await value.text()}]);state.forms.push(fields);
  if(scenario==='cancelled')throw new c.ImagegenPreparationCancelled();
  if(scenario==='prepare-rejected')throw new c.ImagegenHttpError('fixture not accepted',400,false);
  if(scenario==='submit-unknown')throw Error('fixture network unknown');
  const receipt={version:1,owner:c.user.email,workspace:'personal',project:'tree:source',actionKey:'fixture',operationId:operation,request:{operationId:operation},authorizedCredits:6,confirmationRequired:false,accepted:'accepted',jobId,context:{workspace:'personal',projectContext:'tree:source'}};
  c.savePendingAttempt(c.pendingAttemptKey(receipt.owner,receipt.workspace,receipt.project,receipt.actionKey),receipt);
  return Response.json({jobId});
 };
 vm.runInContext(declarations+'\nglobalThis.entry={runGen,generatePend};',c);
 return {c,state,src,pend,presentation,run:()=>kind==='derived'?c.entry.runGen(src,'fixture prompt',{ratio:'3:4',count:2,resolution:'2K',style:'default',...(variations[scenario]||{})}):c.entry.generatePend({referenceInputs:variations[scenario]?.referenceInputs}),retry:()=>{const item=kind==='derived'?c.generationTasks[0]:c.pendNodes[0];return kind==='derived'?item?.onRetry:item?.onGenerationRetry;}};
}
module.exports={bundle,setup,root};
if(require.main===module)(async()=>{
 const built=await bundle(),report=[];
 for(const kind of ['derived','blank'])for(const scenario of ['done','partial','reference-fails','cancelled','poll-transient','position-fails','sync-missing','workspace-aba','switch-project','unmounted','prepare-rejected','submit-unknown','terminal-failed','partial-error','needs-review','stored-recovery','malformed-query','ratio-warning','base-file','ref-urls','explicit-roles','transparent','ratiogen']){
  const f=setup(kind,scenario,built),{c,state}=f;await f.run();
  eq(c.generationOperationRef.current.size,0,`${kind}/${scenario} unlock`);
  if(['reference-fails','cancelled','switch-project'].includes(scenario)){eq(state.positions.length,0,scenario+' no attachment');eq(state.history.length,0,scenario+' no undo');}
  if(scenario==='reference-fails')eq(state.post,0,'preparation failure zero submit');
  if(scenario==='done'||scenario==='partial'||scenario==='ratio-warning'){
   eq(state.post,1,'one submit');eq(state.positions.length,2,'all outputs placed');eq(plain(state.history),[kind==='blank'&&baseline?['result-1']:['result-1','result-2']],'one undo includes the full batch');
   eq(state.storage.size,scenario==='partial'&&!baseline?1:0,'only complete delivery clears receipt');
  }
  if(['poll-transient','position-fails','sync-missing'].includes(scenario)){
   assert.equal(typeof f.retry(),'function');checks++;state.retried=true;await f.retry()();
   eq(state.post,scenario==='poll-transient'&&baseline?2:1,'known job retry bypasses submit adapter');
   eq(state.positions.filter(p=>p.id==='result-1').length>0,true,'retry persists first coordinate');
   eq(state.history.length,baseline&&scenario!=='poll-transient'?0:1,'attachment retry creates undo once');
  }
  if(['prepare-rejected','submit-unknown','terminal-failed','partial-error','needs-review','stored-recovery','malformed-query'].includes(scenario)){
   const item=kind==='derived'?c.generationTasks[0]:c.pendNodes[0],failure=kind==='derived'?item?.failure:item?.generationFailure;
   eq(failure?.kind,scenario==='prepare-rejected'?'not-started':scenario==='partial-error'?'sync':'failed','accurate local failure outcome');
   eq(state.history.length,0,'no undo before attachment');eq(typeof f.retry(),'function','explicit retry remains');
  }
  if(Object.keys({'base-file':1,'ref-urls':1,'explicit-roles':1,'transparent':1,'ratiogen':1}).includes(scenario)){eq(state.post,1,'prepared one request');eq(state.forms.length,1,'ordered input prepared');}
  if(scenario==='workspace-aba'){eq(state.polls,baseline?1:0,'ABA invalidates auth wait');eq(state.positions.length,baseline?2:0,'ABA no cross-context writes');}
  if(scenario==='unmounted'){eq(state.positions.length,baseline?2:0,'unmount prevents canvas writes');}
  report.push({kind,scenario,post:state.post,polls:state.polls,positionWrites:state.positions.length,history:plain(state.history),remainingReceipts:state.storage.size,fields:state.forms[0]});
 }
 if(!baseline){const f=setup('derived','locked',built);f.c.isNodeLocked=()=>true;await f.run();eq(f.state.post,0,'locked source does not submit');eq(f.state.positions.length,0,'locked source does not move');eq(f.state.history.length,0,'locked source adds no undo');report.push({kind:'derived',scenario:'locked',post:0,positionWrites:0});}
 fs.writeFileSync(path.join(out,`${baseline?'BASELINE':'MODIFIED'}_RESULT.json`),JSON.stringify({checks,sourceRoot:root,controller:shared,scenarios:report},null,2));
 console.log(`CANVAS_IMAGE_TASK_REFACTOR=PASS mode=${baseline?'BASELINE':'MODIFIED'} cases=${report.length} checks=${checks} ACTUAL_CANVAS_CALLERS=2 CONTROLLER=${shared?'SHARED':'DUPLICATED'} KNOWN_JOB_SUBMIT_ADAPTER_REENTRY=${baseline?1:0} PARTIAL_RECEIPT=${baseline?'CLEARED':'RETAINED'} BLANK_UNDO=${baseline?'FIRST_ONLY':'ALL_RESULTS'} WORKSPACE_ABA=${baseline?'WRITES':'STOPPED'} UNMOUNT=${baseline?'WRITES':'STOPPED'} HTTP=FIXTURE SUPPLIER=0`);
})().catch(error=>{console.error(error);process.exitCode=1});
