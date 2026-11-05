// Execute the actual Canvas caller and original/new arrangement code. Controlled
// history/Flow/frame ports expose ordering and stale intents; no paid task/PG.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript'),esbuild=require('esbuild');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const root=path.resolve(arg('--source-root','.')),out=path.resolve(arg('--out',process.env.CANVAS_ARRANGE_EVIDENCE||'output/canvas-arrange')),baseline=args.includes('--baseline');fs.mkdirSync(out,{recursive:true});
const files=['src/components/canvas/canvas-client.tsx','src/lib/canvas/smart-layout.ts','src/lib/canvas/node-geometry.ts',...(!baseline?['src/lib/canvas/arrange.ts']:[])];
const hashes=()=>Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')])),before=hashes();
const source=fs.readFileSync(path.join(root,files[0]),'utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4);let caller;
function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='tidyLayout')caller=n.getText(ast);ts.forEachChild(n,walk)}walk(ast);assert(caller);
const clone=x=>JSON.parse(JSON.stringify(x)),wait=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const node=(id,index=0,type='image')=>({id,type,position:{x:900-index*17,y:600-index*31},data:{width:220+index*10,height:150+index*13,nodeKind:type==='text'?'text':undefined,canvasGroupId:index<2?'original-group':null}});
const project=()=>({members:[{id:'image'}],textNodes:[{id:'text'}],videoNodes:[{id:'video'}],directorNodes:[{id:'director'}],characterNodes:[{id:'character'}],sceneNodes:[{id:'scene'}],audioNodes:[{id:'audio'}],timelineNodes:[{id:'timeline'}]});
const checks=[],common=[],counterexamples=[];const pass=n=>{checks.push(n);console.log('PASS '+n)};
(async()=>{
 const built=(await esbuild.build({stdin:{contents:`export {smartLayout} from './src/lib/canvas/smart-layout';export {flowNodeSize} from './src/lib/canvas/node-geometry';${baseline?'':"export {arrangeCanvasDocument,planCanvasArrangement} from './src/lib/canvas/arrange';"}`,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs'})).outputFiles[0].text;
 function setup(){
  const state={trace:[],notices:[],actions:[],undo:[],frames:[],fits:[],live:true,revision:0,flush:async()=>{},save:async()=>{},unsaved:0,autoSync:true,settings:new Set(['video']),active:project(),readOnly:false,user:{email:'fixture'},nodeSettingsReady:true,textNodesReady:true};
  state.nodes=['image','text','video','director','character','scene','audio','timeline','transient'].map((id,i)=>node(id,i,id==='text'?'text':'image'));state.nodes.push(node('group',9,'workflowGroup'));
  state.edges=[{source:'image',target:'text'},{source:'text',target:'scene'},{source:'gone',target:'audio'}];
  const module={exports:{}};const busy={current:false};
  const scope={account:'fixture',workspace:'personal',project:'P',key:'fixture:P',documentCurrent:()=>state.live,viewCurrent:()=>state.live,assertView(){assert(state.live)}};
  const apply=async action=>{state.trace.push('save');state.actions.push(clone(action));await state.save(action);if(state.autoSync)sync(action);state.trace.push('saved')};
  const record=action=>{state.trace.push('undo');state.undo.push(clone(action))};
  function sync(action=state.actions.at(-1)){for(const move of action?.moves||[]){const n=state.nodes.find(n=>n.id===move.id);if(n)n.position={...move.to}}}
  const c={module,exports:module.exports,console,Map,Set,Promise,Error,Math,Object,Number,Array,structuredClone,historyBusyRef:busy,
   rfRef:{current:{getNodes:()=>state.nodes,getEdges:()=>state.edges,fitView:o=>{state.trace.push('fit');state.fits.push(clone(o));return Promise.resolve(true)}}},rfNodes:state.nodes,rfEdges:state.edges,
   canvasHistory:{scope},canvasTextDocument:{flush:async()=>{state.trace.push('flush');await state.flush()},getSnapshot:()=>({unsaved:state.unsaved})},
   setCtxMenu:v=>state.trace.push('menu:'+v),setHistorySaving:v=>{busy.current=v;state.trace.push('busy:'+v)},isNodeLocked:id=>state.settings.has(id),applyHistory:apply,pushUndo:record,historyCurrent:()=>state.live,
   flashTip:s=>state.notices.push(s),t:s=>s,L:s=>s,requestAnimationFrame:fn=>{state.frames.push(fn);return state.frames.length},
   viewControls:{navigationRevision:{get current(){return state.revision}},cancelFocus:()=>{state.revision++}},
  };for(const key of ['active','readOnly','user','nodeSettingsReady','textNodesReady'])Object.defineProperty(c,key,{get:()=>state[key]});
  vm.createContext(c);vm.runInContext(built,c);Object.assign(c,module.exports);
  vm.runInContext(ts.transpileModule(caller,{compilerOptions:{target:9,module:0}}).outputText,c);
  const frame=()=>{const batch=state.frames.splice(0);for(const f of batch)f()};
  const drain=()=>{for(let n=0;state.frames.length&&n<100;n++)frame();assert.equal(state.frames.length,0)};
  const snap=()=>clone({trace:state.trace,actions:state.actions,undo:state.undo,fits:state.fits,notices:state.notices,nodes:state.nodes});
  return {s:state,c,run:()=>c.tidyLayout(),frame,drain,snap,sync,busy};
 }
 async function ordinary(name,prepare,verify){const h=setup();prepare?.(h);await h.run();h.drain();verify?.(h);common.push({name,value:h.snap()});pass(name)}
 await ordinary('EIGHT_DOCUMENT_KINDS_ATOMIC_ONE_UNDO',null,h=>{
  assert.equal(h.s.actions.length,1);assert.equal(h.s.undo.length,1);assert.deepEqual(h.s.actions,h.s.undo);assert.equal(h.s.fits.length,1);
  const ids=h.s.actions[0].moves.map(m=>m.id);assert(!ids.includes('video'));assert(!ids.includes('transient'));assert(!ids.includes('group'));for(const id of ['image','text','director','character','scene','audio','timeline'])assert(ids.includes(id));
  assert.deepEqual(h.s.fits[0],{nodes:['image','text','video','director','character','scene','audio','timeline'].map(id=>({id})),duration:500,padding:0.18,maxZoom:1});assert(h.s.trace.indexOf('saved')<h.s.trace.indexOf('undo'));assert(h.s.trace.indexOf('undo')<h.s.trace.indexOf('fit'));
 });
 await ordinary('ALREADY_ARRANGED_NO_EXTRA_SAVE_OR_UNDO',h=>{h.s.nodes=h.s.nodes.filter(n=>n.id==='image');h.s.nodes[0].position={x:0,y:0};h.s.active={...project(),members:[{id:'image'}],textNodes:[],videoNodes:[],directorNodes:[],characterNodes:[],sceneNodes:[],audioNodes:[],timelineNodes:[]}},h=>{assert.equal(h.s.actions.length,0);assert.equal(h.s.undo.length,0);assert.equal(h.s.fits.length,1)});
 for(const key of ['readOnly','user','active','nodeSettingsReady','textNodesReady'])await ordinary('GUARD_'+key,h=>{h.s[key]=key==='readOnly'?true:key==='user'||key==='active'?null:false},h=>assert.deepEqual(h.s.trace,[]));
 await ordinary('SHARED_HISTORY_BUSY_GUARD',h=>{h.busy.current=true},h=>assert.deepEqual(h.s.trace,[]));
 await ordinary('UNSAVED_TEXT_PRESERVED',h=>{h.s.unsaved=1},h=>{assert.equal(h.s.actions.length,0);assert.deepEqual(h.s.notices,['请先保存未保存的文字节点']);assert.equal(h.busy.current,false)});
 for(const message of ['EXPLICIT_REJECTION','UNKNOWN_RECEIPT_LOST'])await ordinary(message,h=>{h.s.save=async()=>{throw Error(message)}},h=>{assert.equal(h.s.undo.length,0);assert.equal(h.s.fits.length,0);assert.deepEqual(h.s.notices,[message]);assert.equal(h.s.actions.length,1);assert.equal(h.busy.current,false)});
 await ordinary('FLUSH_ERROR_NO_DOCUMENT_WRITE',h=>{h.s.flush=async()=>{throw Error('FLUSH_FAILED')}},h=>{assert.deepEqual(h.s.notices,['FLUSH_FAILED']);assert.equal(h.s.actions.length,0)});
 await ordinary('400_MOVES_LIMIT_BEFORE_HISTORY',h=>{h.s.nodes=Array.from({length:401},(_,i)=>node('many-'+i,i));h.s.active={...project(),members:h.s.nodes.map(n=>({id:n.id}))}},h=>{assert.equal(h.s.actions.length,0);assert.deepEqual(h.s.notices,['本次整理最多支持400个移动节点'])});
 const lag=setup();lag.s.autoSync=false;await lag.run();lag.frame();assert.equal(lag.s.fits.length,0);lag.sync();lag.drain();assert.equal(lag.s.fits.length,1);common.push({name:'WAIT_FOR_LIVE_COMMIT',value:lag.snap()});pass('WAIT_FOR_LIVE_COMMIT_NO_PREMATURE_FIT');
 const never=setup();never.s.autoSync=false;await never.run();never.drain();assert.equal(never.s.fits.length,0);common.push({name:'BOUNDED_60_FRAMES',value:never.snap()});pass('BOUNDED_60_FRAMES_NO_NEW_TASK');
 const pending=setup(),gate=wait();pending.s.flush=()=>gate.promise;const first=pending.run();await pending.run();gate.resolve();await first;pending.drain();assert.equal(pending.s.actions.length,1);common.push({name:'BUSY_PREVENTS_CONCURRENT_ARRANGE',value:pending.snap()});pass('BUSY_PREVENTS_CONCURRENT_ARRANGE');
 for(const phase of ['before-fit','during-save','during-flush']){
  const h=setup(),gate=wait();if(phase==='during-save')h.s.save=()=>gate.promise;if(phase==='during-flush')h.s.flush=()=>gate.promise;
  const work=h.run();if(phase==='during-save')for(let i=0;i<8&&!h.s.actions.length;i++)await Promise.resolve();if(phase==='before-fit')await work;
  h.c.viewControls.cancelFocus();gate.resolve();await work;h.drain();assert.equal(h.s.fits.length,baseline?1:0);assert.equal(h.s.undo.length,1);counterexamples.push({phase,fits:h.s.fits.length,trace:h.s.trace});pass((baseline?'REPRODUCED_':'PREVENTED_')+'MANUAL_NAVIGATION_'+phase);
 }
 const stale=setup(),oldFlush=wait();stale.s.flush=()=>oldFlush.promise;const staleWork=stale.run();stale.s.live=false;oldFlush.resolve();await staleWork;stale.drain();assert.equal(stale.s.actions.length,baseline?1:0);assert.equal(stale.busy.current,false);counterexamples.push({phase:'document-switch-during-flush',historyAttempts:stale.s.actions.length});pass((baseline?'REPRODUCED_':'PREVENTED_')+'STALE_DOCUMENT_PREPARATION');
 const staleError=setup(),badFlush=wait();staleError.s.flush=()=>badFlush.promise;const failing=staleError.run();staleError.s.live=false;badFlush.reject(Error('OLD_DOCUMENT_ERROR'));await failing;assert.equal(staleError.s.notices.length,baseline?1:0);pass((baseline?'REPRODUCED_':'PREVENTED_')+'OLD_DOCUMENT_NOTICE');
 const twice=setup();await twice.run();await twice.run();twice.drain();assert.equal(twice.s.fits.length,baseline?2:1);assert.equal(twice.s.actions.length,1);pass((baseline?'REPRODUCED_':'PREVENTED_')+'OLDER_ARRANGE_FIT_AFTER_NEWER_INTENT');
 const perf=setup();perf.s.nodes=Array.from({length:400},(_,i)=>node('perf-'+i,i));perf.s.active={...project(),members:perf.s.nodes.map(n=>({id:n.id}))};await perf.run();let lookups=0;for(const n of perf.s.nodes){const id=n.id;Object.defineProperty(n,'id',{get(){lookups++;return id}})}perf.drain();assert.equal(perf.s.fits.length,1);assert.equal(lookups,baseline?80200:400);counterexamples.push({phase:'readiness400',idReads:lookups,wallTimeCapacityClaim:false});pass('READINESS_400_ID_READS_'+lookups);
 if(!baseline){const s=fs.readFileSync(path.join(root,'src/lib/canvas/arrange.ts'),'utf8');assert(!/from ["'](?:react|next|.*supabase|.*db)["']/.test(s));assert(!s.includes('/api/'));assert(!source.includes('smartLayout('));pass('PURE_LAYOUT_APPLICATION_NO_REACT_HTTP_OR_PARALLEL_HISTORY');}
 const compare=arg('--compare');if(compare){assert.deepEqual(common,JSON.parse(fs.readFileSync(compare,'utf8')).common);pass('ORIGINAL_COMMON_TRACES_EXACT')}
 assert.deepEqual(hashes(),before);pass('SOURCE_UNCHANGED_SUPPLIER_POSTS_ZERO');
 const literal=`CANVAS_ARRANGE=${baseline?'REPRODUCED':'PASS'} CHECKS=${checks.length} COMMON_TRACES=${common.length} ACTUAL_CALLER=1 EIGHT_KINDS=1 PAID_POSTS=0 EXIT=${baseline?1:0}`;
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:baseline?'REPRODUCED':'PASS',checks,common,counterexamples,sourceHashes:before,literal,scope:'Actual Canvas tidyLayout caller and actual old/new pure/layout orchestration. Flow/history persistence/frame/navigation ports are controlled. Not PG/native geometry/production capacity.'},null,2));console.log(literal);process.exitCode=baseline?1:0;
})().catch(e=>{console.error(e);process.exitCode=2});
