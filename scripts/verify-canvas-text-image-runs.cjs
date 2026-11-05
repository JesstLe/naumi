'use strict';
/** Actual Canvas entries + complete text-image owner. The intercepted boundary
 * is generatePend (no PG/provider); full original source is selected explicitly.
 * Both versions execute the same business scenarios; --compare checks traces.
 * Scope probes separately record the intentional removal of cross-project busy.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{buildSync}=require('esbuild'),{createHash}=require('node:crypto');
const arg=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(arg('--source-root')||'.'),baseline=arg('--mode')==='baseline',out=path.resolve(arg('--out')||process.env.TEXT_IMAGE_RUN_EVIDENCE||'output/canvas-text-image-runs');
fs.mkdirSync(out,{recursive:true});let cases=0,checks=0,network=0;const rows=[];
const plain=x=>JSON.parse(JSON.stringify(x)),eq=(a,b,label)=>{checks++;assert.deepEqual(plain(a),plain(b),label);},ok=(x,label)=>{checks++;assert.ok(x,label);};
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),source=read('src/components/canvas/canvas-client.tsx'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4);
const functions={},vars={};(function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)functions[n.name.text]=n;if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name))vars[n.name.text]=n;ts.forEachChild(n,visit);})(ast);
const functionText=name=>{assert.ok(functions[name]?.body,'actual '+name);return functions[name].getText(ast);};
const transpile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function load(file,ports={}){
 const output=buildSync({entryPoints:[path.join(root,file)],bundle:true,write:false,platform:'node',format:'cjs',external:['../supabase','../saas/workspace-client']}).outputFiles[0].text;
 const loadedModule={exports:{}},box={module:loadedModule,exports:loadedModule.exports,Error,Map,Set,Date:class extends Date{static now(){return 1793318400000;}},console,require:name=>{if(name in ports)return ports[name];throw Error('unexpected runtime dependency '+name);}};vm.createContext(box);vm.runInContext(output,box,{filename:file});return loadedModule.exports;
}
const inputs=load('src/lib/canvas/text-image-inputs.ts'),media=load('src/lib/media-url.ts');
const ownerSource=arg('--owner-source');
const ownerModule=baseline?null:ownerSource?(()=>{
 const loadedModule={exports:{}},box={module:loadedModule,exports:loadedModule.exports,Error,Map,Set,Date,console,require:name=>name==='../media-url'?media:name==='./text-image-inputs'?inputs:(()=>{throw Error('unexpected original owner dependency '+name);})()};
 vm.createContext(box);vm.runInContext(transpile(fs.readFileSync(path.resolve(ownerSource),'utf8')),box,{filename:ownerSource});return loadedModule.exports;
})():load('src/lib/canvas/text-image-runs.ts');
const node=(id='text-a',content='一只白鹭站在雨后的石桥上',extra={})=>({id,content,prompt:'',projectKey:'tree:project-a',title:id,sourceIds:[],productIds:[],status:'completed',canvasX:20.4,canvasY:30.6,width:380,...extra});
const art=(id,extra={})=>({id,image:'/media/'+id+'.png',source:'upload',...extra});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function harness(options={}){
 const texts=options.nodes||[node()],project={key:'tree:project-a',members:options.members||[]};
 const c={Error,console,Map,Set,Date:class extends Date{static now(){return 1793318400000;}},
  readOnly:false,user:{email:'fixture@example.test'},allowed:true,nodeSettingsReady:true,
  active:project,activeKey:project.key,activeProjectRef:{current:project},textNodes:texts,textNodesRef:{current:texts},selectedTextId:null,textPrompt:'',
  workspace:'workspace-a',workspaceRevision:0,currentWorkspace:()=>c.workspace,canvasAccountRef:{current:'account-a'},canvasContextEpochRef:{current:0},
  textImageContextRef:{current:{key:JSON.stringify(['account-a',project.key,'workspace-a']),revision:0}},batchRunMountedRef:{current:true},textImageSubmittingRef:{current:false},
  textImageSubmitting:false,genImageMenu:null,menuUpdates:[],submittingUpdates:[],locked:new Set(),
  canFeature:feature=>feature==='generate'&&c.allowed,isNodeLocked:id=>c.locked.has(id),hasRenderableImage:media.isHostedImageUrl,
  pendSeqRef:{current:1},rfRef:{current:{getNodes:()=>options.graph||[]}},pending:[],pendingUpdaters:[],pendSetterCalls:0,calls:[],tips:[],
  t:key=>key,L:(zh,en)=>options.locale==='en'?en:zh,flashTip:message=>c.tips.push(String(message)),MAX_TOTAL_IMAGES:16,X_GAP:90,TEXT_NODE_DEFAULT_W:380,
  setGenImageMenu:value=>{c.genImageMenu=typeof value==='function'?value(c.genImageMenu):value;c.menuUpdates.push(c.genImageMenu);},
  setTextImageSubmitting:value=>{c.textImageSubmitting=value;c.submittingUpdates.push(value);},
  setPendNodes:updater=>{c.pendSetterCalls++;if(options.deferPending)c.pendingUpdaters.push(updater);else c.pending=updater(c.pending);},
  generatePend:async opts=>{c.calls.push(opts);return options.generatePend?options.generatePend(opts,c,c.calls.length):true;},...inputs,
  textBusy:new Set(options.busy||[]),textTasks:{state:id=>({busy:c.textBusy.has(id)})},
  canvasTextDocument:{getSnapshot:()=>({nodes:c.textNodesRef.current}),flush:async()=>{},hasUnsaved:()=>false},
  textAutosave:{flush:async()=>{},hasPending:()=>false},
 };
 const scopes=load('src/lib/canvas/document-scope.ts',{'../supabase':{authHeader:()=>({})},'../saas/workspace-client':{currentWorkspace:()=>c.workspace,currentWorkspaceRevision:()=>c.workspaceRevision}}).createCanvasDocumentContext();
 const owner=ownerModule?.createCanvasTextImageRuns();let lastView,lastScope,unsubscribe;
 const names=baseline?['textImageScopeCurrent','openTextImageMenu','textImageRequests','textImageReferenceCount','generateImagesFromTextNodes']:['canvasTextImageContext','openTextImageMenu','generateImagesFromTextNodes'];
 let revision='';if(baseline){const branch=[];(function visit(n){if(ts.isIfStatement(n)&&n.expression.getText(ast).includes('textImageContextRef.current.key !== textImageContextKey'))branch.push(n);ts.forEachChild(n,visit);})(ast);assert.equal(branch.length,1);revision=`const textImageContextKey=${vars.textImageContextKey.initializer.getText(ast)};${branch[0].getText(ast)}`;}
 vm.createContext(c);vm.runInContext(transpile(`globalThis.capture=function(state){const {genImageMenu,readOnly,user,nodeSettingsReady,selectedTextId,textPrompt,active,activeKey,textNodes,textImages,canvasArtworkDocument}=state;${revision}\n${names.map(functionText).join('\n')}\nreturn {${names.join(',')}};};`),c);
 const h={c,owner,render(){scopes.mount(c.batchRunMountedRef.current);const scope=scopes.render(c.canvasAccountRef.current,c.activeProjectRef.current?.key||null);
   if(owner){lastView=owner.bind(scope);if(scope!==lastScope){unsubscribe?.();unsubscribe=lastView.subscribe(()=>{const s=lastView.getSnapshot();if(c.genImageMenu!==s.menu){c.genImageMenu=s.menu;c.menuUpdates.push(s.menu);}if(c.textImageSubmitting!==s.submitting){c.textImageSubmitting=s.submitting;c.submittingUpdates.push(s.submitting);}c.textImageSubmittingRef.current=s.submitting;});lastScope=scope;const s=lastView.getSnapshot();c.genImageMenu=s.menu;c.textImageSubmitting=s.submitting;c.textImageSubmittingRef.current=s.submitting;}}
   c.canvasArtworkDocument={scope};return c.capture({...c,active:c.activeProjectRef.current,activeKey:c.activeProjectRef.current?.key||'',textNodes:c.textNodesRef.current,textImages:lastView});},
  open(ids=['text-a'],images=[]){h.render().openTextImageMenu(ids,images);return c.genImageMenu;},
  submit(mode='general',settings={}){return h.render().generateImagesFromTextNodes(mode,{combine:true,useReferences:true,...settings});},
  references(){const render=h.render();return baseline?render.textImageReferenceCount(c.genImageMenu):lastView.referenceCount(render.canvasTextImageContext());},
  flush(){for(const updater of c.pendingUpdaters.splice(0))c.pending=updater(c.pending);},
  move(nextProject,nextTexts=[]){c.activeProjectRef.current=nextProject;c.textNodesRef.current=nextTexts;c.canvasContextEpochRef.current++;return h.render();},
  snapshot(){h.render();return baseline?{menu:c.genImageMenu,submitting:c.textImageSubmitting}:lastView.getSnapshot();},
  async afterAcknowledgements(){for(let i=0;i<16;i++)await Promise.resolve();},
 };
 h.render();return h;
}
async function test(name,fn,trace=true){const h=await fn();if(trace&&h)rows.push({name,calls:h.c.calls.map(call=>({pend:call.pend,prompt:call.prompt,forceStandard:call.forceStandard})),pending:h.c.pending,tips:h.c.tips});cases++;console.log('CASE='+name+' PASS');}
function blocked(h,tip){eq(h.c.calls.length,0,'no generation');eq(h.c.pendSetterCalls,0,'whole batch validated before placeholders');eq(h.c.textImageSubmittingRef.current,false,'busy released');if(tip)ok(h.c.tips.some(t=>tip.test(t)),h.c.tips.join('|'));}

/** Execute the real owner with save-ACK ports. No component, network, PG or
 * provider is substituted for these ordering and immutable-recipe assertions. */
async function runAckContract(){
 function fixture(options={}){
  const state={current:true,writable:true,nodes:options.nodes||[node()],calls:[],pending:[],flushes:[],unsaved:new Set(),locked:new Set(),errors:[],notices:0,sequence:0};
  const scope={account:'account-a',workspace:'workspace-a',project:'tree:project-a',key:'ack-fixture',documentCurrent:()=>state.current,viewCurrent:()=>state.current,assertView:()=>{assert.ok(state.current);}};
  const ctx={scope,current:()=>state.current,writable:()=>state.writable,canGenerate:true,ready:true,project:()=>({key:scope.project,members:options.members||[]}),texts:()=>state.nodes,locked:id=>state.locked.has(id),draft:{id:null,text:''},
   flushTexts:async ids=>{state.flushes.push([...ids]);if(options.flush)await options.flush(ids,state);},textUnsaved:id=>state.unsaved.has(id),positions:()=>new Map(),nextSequence:()=>++state.sequence,gap:90,textWidth:380,imageLabel:'image',maxImages:16,
   pending:change=>{state.pending=change(state.pending);},generate:async opts=>{state.calls.push(opts);return true;},lockedNotice:()=>state.notices++,error:error=>state.errors.push(String(error.message||error))};
  const view=ownerModule.createCanvasTextImageRuns().bind(scope);view.open(options.ids||['text-a'],[],ctx);
  return {state,view,ctx,run:(mode='general',settings={})=>view.run(mode,{combine:true,useReferences:true,...settings},ctx)};
 }
 async function ackTest(name,work){await work();cases++;console.log('CASE=ack-'+name+' PASS');}
 await ackTest('wait-before-placeholder-and-freeze-current-recipe',async()=>{
  const gate=deferred(),f=fixture({nodes:[node('text-a','old',{sourceIds:['text-b']}),node('text-b','upstream')],flush:()=>gate.promise}),run=f.run();
  eq(f.state.flushes,[['text-a','text-b']],'every preview source waits for ACK exactly once');eq(f.state.calls,[],'no generation before ACK');eq(f.state.pending,[],'no placeholder before ACK');eq(f.view.getSnapshot().submitting,true);
  f.state.nodes=[node('text-a','ACKed body',{sourceIds:['text-b']}),node('text-b','ACKed upstream')];gate.resolve();await run;
  eq(f.state.calls.length,1);eq(f.state.calls[0].prompt,'ACKed body\n\nACKed upstream');eq(f.state.calls[0].frozenTextPrompt,f.state.calls[0].prompt,'explicit recipe bypasses direct-edge recomposition');eq(f.state.calls[0].pend.inputs,['text-a','text-b']);eq(f.view.getSnapshot().submitting,false);
 });
 await ackTest('deduplicated-batch-source-ack',async()=>{const f=fixture({nodes:[node('text-a','A',{sourceIds:['text-c']}),node('text-b','B',{sourceIds:['text-c']}),node('text-c','C')],ids:['text-a','text-b']});await f.run('general',{combine:false});eq(f.state.flushes,[['text-a','text-c','text-b']]);eq(f.state.calls.length,2);for(const call of f.state.calls)eq(call.frozenTextPrompt,call.prompt);});
 for(const failure of ['rejected','unsaved'])await ackTest(failure+'-save-stops-all-purchases',async()=>{const f=fixture({flush:(_ids,state)=>{if(failure==='rejected')throw Error('save rejected');state.unsaved.add('text-a');}});await f.run();eq(f.state.pending,[]);eq(f.state.calls,[]);eq(f.state.errors.length,1);eq(f.view.getSnapshot().submitting,false);});
 for(const stale of ['scope','readonly'])await ackTest(stale+'-during-ack',async()=>{const gate=deferred(),f=fixture({flush:()=>gate.promise}),run=f.run();if(stale==='scope')f.state.current=false;else f.state.writable=false;gate.resolve();await run;eq(f.state.pending,[]);eq(f.state.calls,[]);eq(f.state.errors,[]);eq(f.view.getSnapshot().submitting,false);});
 await ackTest('new-source-after-ack-requires-reconfirmation',async()=>{const gate=deferred(),f=fixture({nodes:[node(),node('text-b','new source')],flush:()=>gate.promise}),run=f.run();f.state.nodes=[node('text-a','changed',{sourceIds:['text-b']}),node('text-b','new source')];gate.resolve();await run;eq(f.state.flushes,[['text-a']]);eq(f.state.pending,[]);eq(f.state.calls,[]);ok(f.state.errors.some(error=>error.includes('连线已变更')));});
 await ackTest('removed-source-replans-current-recipe',async()=>{const gate=deferred(),f=fixture({nodes:[node('text-a','A',{sourceIds:['text-b']}),node('text-b','B')],flush:()=>gate.promise}),run=f.run();f.state.nodes=[node('text-a','new A'),node('text-b','B')];gate.resolve();await run;eq(f.state.calls.length,1);eq(f.state.calls[0].prompt,'new A');eq(f.state.calls[0].pend.inputs,['text-a']);});
 for(const invalid of ['busy','locked'])await ackTest(invalid+'-source-after-ack',async()=>{const gate=deferred(),f=fixture({flush:()=>gate.promise}),run=f.run();if(invalid==='busy')f.state.nodes[0]={...f.state.nodes[0],status:'generating'};else f.state.locked.add('text-a');gate.resolve();await run;eq(f.state.pending,[]);eq(f.state.calls,[]);eq(invalid==='busy'?f.state.errors.length:f.state.notices,1);});
 for(const mode of ['pure','replicate'])await ackTest(mode+'-recipe-remains-frozen',async()=>{const f=fixture({nodes:[node('text-a','@product\nbody',{productIds:['product'],sourceIds:['reference']})],members:[art('product'),art('reference')]});await f.run(mode);eq(f.state.calls.length,1);eq(f.state.calls[0].frozenTextPrompt,f.state.calls[0].prompt);if(mode==='replicate')ok(f.state.calls[0].prompt.includes('产品必须完全取自第一张参考图'));else eq(f.state.calls[0].prompt,'body');});
}

async function run(){
 const originalFetch=global.fetch;global.fetch=()=>{network++;throw Error('no network in application fixture');};
 try{
 if(!baseline)await runAckContract();
 await test('actual-entry-boundary',()=>{
  const count=name=>{let n=0;(function visit(x){if(ts.isCallExpression(x)&&x.expression.getText(ast)===name)n++;ts.forEachChild(x,visit);})(ast);return n;};
  eq(count('openTextImageMenu'),5,'all five real UI openers');eq(count('buildTextImageRequests'),baseline?1:0,'planning leaves component');
  if(!baseline){ok(functionText('generateImagesFromTextNodes').includes('textImages.run('));ok(functionText('canvasTextImageContext').includes('canvasTextDocument.getSnapshot().nodes'));ok(source.includes('onClose={textImages.close}'));ok(!vars.textImageContextRef,'no duplicate context revision');ok(!vars.textImageSubmittingRef,'no component-global text-image busy');}
 },false);
 for(const [name,options,ids,images,mode,settings] of [
  ['plain',{},['text-a'],[],'general',{}],
  ['at-lines',{nodes:[node('text-a','@晨光\n自然 @朋友')]},['text-a'],[],'general',{}],
  ['combined',{nodes:[node('text-a','甲'),node('text-b','乙')]},['text-b','text-a','text-b'],[],'general',{combine:true}],
  ['separate',{nodes:[node('text-a','甲'),node('text-b','乙')]},['text-a','text-b'],[],'general',{combine:false}],
  ['graph-references',{nodes:[node('text-a','主文字',{sourceIds:['text-b','image-a']}),node('text-b','上游',{sourceIds:['text-a','image-b']})],members:[art('image-a'),art('image-b'),art('selected')]},['text-a'],['selected','selected'],'general',{}],
  ['text-only-stale',{nodes:[node('text-a','纯文字',{sourceIds:['missing-image'],productIds:['missing-product']})]},['text-a'],['missing-selected'],'general',{useReferences:false}],
  ['foreign-selection',{nodes:[node(),node('text-b','乙'),node('text-foreign','secret',{projectKey:'tree:other'})]},['text-b','text-foreign','missing','text-a'],[],'general',{}],
  ['pure',{nodes:[node('text-a','@产品\n白底',{productIds:['product'],sourceIds:['ref']})],members:[art('product'),art('ref')]},['text-a'],[],'pure',{}],
  ['replicate',{nodes:[node('text-a','@产品\n场景',{productIds:['product'],sourceIds:['ref','product','ref']})],members:[art('product'),art('ref')]},['text-a'],[],'replicate',{}],
  ['position',{graph:[{id:'text-a',position:{x:100.25,y:200.75}}]},['text-a'],[],'general',{}],
  ['max-prompt',{nodes:[node('text-a','字'.repeat(6000))]},['text-a'],[],'general',{}],
  ['max-references',{members:Array.from({length:16},(_,i)=>art('image-'+i))},['text-a'],Array.from({length:16},(_,i)=>'image-'+i),'general',{}],
 ])await test(name,async()=>{const h=harness(options),before=JSON.stringify([h.c.textNodesRef.current,h.c.activeProjectRef.current]);h.open(ids,images);ok(h.c.genImageMenu);await h.submit(mode,settings);eq(h.c.calls.length,settings.combine===false?2:1);if(!baseline)for(const call of h.c.calls)eq(call.frozenTextPrompt,call.prompt,'explicit composed recipe remains frozen');eq(JSON.stringify([h.c.textNodesRef.current,h.c.activeProjectRef.current]),before,'inputs immutable');eq(h.c.textImageSubmittingRef.current,false);return h;});
 for(const [name,content,draft,prompt,expected,status] of [['draft','','saved draft','',baseline?'saved draft':null,'completed'],['output','output','draft','old','output','completed'],['prompt','','','saved prompt','saved prompt','idle'],...(!baseline?[['completed-empty','','AI draft','old instruction',null,'completed']]:[])])await test(name,async()=>{const h=harness({nodes:[node('text-a',content,{prompt,status})]});h.c.selectedTextId='text-a';h.c.textPrompt=draft;h.open();h.c.textPrompt='later draft';await h.submit();if(expected===null)blocked(h,/先输入/);else eq(h.c.calls[0].prompt,expected);return h;});
 for(const [name,nodes,members,ids,images,settings,tip] of [
  ['empty',[node('text-a','')],[],['text-a'],[],{},/先输入/],
  ['oversize',[node('text-a','字'.repeat(6001))],[],['text-a'],[],{},/6000/],
  ['second-invalid',[node(),node('text-b','')],[],['text-a','text-b'],[],{combine:false},/先输入/],
  ['second-busy',[node(),node('text-b','busy',{status:'generating'})],[],['text-a','text-b'],[],{combine:false},null],
  ['upstream-busy',[node('text-a','主',{sourceIds:['text-b']}),node('text-b','busy',{status:'generating'})],[],['text-a'],[],{},/仍在生成/],
  ['stale-reference',[node()],[],['text-a'],['missing'],{},/引用图片/],
  ['too-many',[node()],Array.from({length:17},(_,i)=>art('image-'+i)),['text-a'],Array.from({length:17},(_,i)=>'image-'+i),{},/最多使用/],
  ...[['video',{videoUrl:'/video.mp4'}],['decoration',{source:'workflow-decoration'}],['placeholder',{source:'workflow-placeholder'}],['unrenderable',{image:''}]].map(([label,extra])=>[label,[node()],[art('bad',extra)],['text-a'],['bad'],{},/引用图片/]),
 ])await test(name,async()=>{const h=harness({nodes,members});h.open(ids,images);await h.submit('general',settings);blocked(h,tip);return h;});
 for(const mode of ['pure','replicate'])await test(mode+'-no-product',async()=>{const h=harness();h.open();await h.submit(mode);blocked(h,/canvas.textNoProduct/);return h;});
 for(const [name,change] of [['readonly',c=>c.readOnly=true],['no-user',c=>c.user=null],['feature',c=>c.allowed=false],['not-ready',c=>c.nodeSettingsReady=false],['locked',c=>c.locked.add('text-a')],['busy-text',c=>c.textNodesRef.current[0].status='generating'],...(!baseline? [['saving-text',c=>c.textBusy.add('text-a')]]:[]),['no-project',c=>c.activeProjectRef.current=null]])await test('open-'+name,async()=>{const h=harness();change(h.c);h.open();await h.submit();blocked(h);return h;});
 for(const [name,change] of [['readonly',c=>c.readOnly=true],['feature',c=>c.allowed=false],['not-ready',c=>c.nodeSettingsReady=false],['locked',c=>c.locked.add('text-a')]])await test('submit-'+name,async()=>{const h=harness();h.open();change(h.c);await h.submit();blocked(h);return h;});
 await test('upstream-locked',async()=>{const h=harness({nodes:[node('text-a','主',{sourceIds:['text-b']}),node('text-b','upstream')]});h.open();h.c.locked.add('text-b');await h.submit();blocked(h,/已锁定/);return h;});
 for(const stop of ['false','undefined','throw'])await test('stop-'+stop,async()=>{const h=harness({nodes:[node(),node('text-b','乙')],generatePend:()=>{if(stop==='throw')throw Error('fixture failure');return stop==='false'?false:undefined;}});h.open(['text-a','text-b']);await h.submit('general',{combine:false});eq(h.c.calls.length,1);eq(h.c.pending.length,1);eq(h.c.textImageSubmittingRef.current,false);return h;});
 await test('serial-await-and-double-click',async()=>{const gate=deferred(),h=harness({nodes:[node(),node('text-b','乙')],generatePend:(_o,_c,i)=>i===1?gate.promise:true});h.open(['text-a','text-b']);const render=h.render(),run=render.generateImagesFromTextNodes('general',{combine:false,useReferences:true});await render.generateImagesFromTextNodes('general',{combine:false,useReferences:true});await h.afterAcknowledgements();eq(h.c.calls.length,1);gate.resolve(true);await run;eq(h.c.calls.length,2);return h;});
 for(const kind of ['account','project','workspace','unmount','epoch'])await test('stale-'+kind,async()=>{const gate=deferred(),h=harness({nodes:[node(),node('text-b','乙')],deferPending:true,generatePend:()=>gate.promise});h.open(['text-a','text-b']);const run=h.submit('general',{combine:false});await h.afterAcknowledgements();if(kind==='account')h.c.canvasAccountRef.current='account-b';if(kind==='project')h.move({key:'tree:b',members:[]});if(kind==='workspace'){h.c.workspace='workspace-b';h.c.workspaceRevision++;}if(kind==='unmount')h.c.batchRunMountedRef.current=false;if(kind==='epoch')h.c.canvasContextEpochRef.current++;h.render();h.flush();gate.reject(Error('late stale failure'));await run;eq(h.c.calls.length,1);eq(h.c.pending,[]);eq(h.c.tips,[]);return h;});
 for(const kind of ['account','project','workspace'])await test('aba-'+kind,async()=>{const h=harness();h.open();const old=h.render(),project=h.c.activeProjectRef.current;if(kind==='account')h.c.canvasAccountRef.current='account-b';if(kind==='project')h.c.activeProjectRef.current={key:'tree:b',members:[]};if(kind==='workspace'){h.c.workspace='workspace-b';h.c.workspaceRevision++;}h.render();h.c.canvasAccountRef.current='account-a';h.c.activeProjectRef.current=project;if(kind==='workspace'){h.c.workspace='workspace-a';h.c.workspaceRevision++;}h.render();h.open();const menu=h.c.genImageMenu;await old.generateImagesFromTextNodes('general',{combine:true,useReferences:true});eq(h.c.calls.length,0);eq(h.c.genImageMenu,menu);await h.submit();eq(h.c.calls.length,1);return h;});
 await test('deferred-valid-pending',async()=>{const h=harness({deferPending:true});h.c.pending=[{id:'existing'}];h.open();await h.submit();eq(h.c.pending.length,1);h.flush();eq(h.c.pending.length,2);eq(h.c.pending[0].id,'existing');return h;});
 await test('reference-inventory-not-validation',()=>{const h=harness({nodes:[node('text-a','',{sourceIds:['text-b','gone','text-deleted'],productIds:['product']}),node('text-b','',{sourceIds:['text-a','gone']})]});h.open(['text-a'],['selected','selected']);eq(h.references(),3);return h;});
 const scopeProbe={};
 await test('scope-owned-busy-and-late-finally',async()=>{
  const a=deferred(),b=deferred(),h=harness({nodes:[node(),node('text-a2','A second')],generatePend:(_o,_c,i)=>i===1?a.promise:b.promise});h.open(['text-a','text-a2']);const runA=h.submit('general',{combine:false});await h.afterAcknowledgements();eq(h.c.calls.length,1);
  h.move({key:'tree:b',members:[]},[node('text-b','B',{projectKey:'tree:b'})]);h.open(['text-b']);scopeProbe.crossProjectBlocked=!h.c.genImageMenu;
  if(baseline){eq(h.c.genImageMenu,null,'reproduce original global lock');a.resolve(true);await runA;eq(h.c.calls.length,1);scopeProbe.oldFinallyClearsGlobal=true;}
  else{ok(h.c.genImageMenu,'B can open while A in flight');eq(h.snapshot().submitting,false);const runB=h.submit();await h.afterAcknowledgements();eq(h.c.calls.length,2);eq(h.snapshot().submitting,true);a.reject(Error('late A failure'));await runA;eq(h.snapshot().submitting,true,'A finally cannot clear B busy');eq(h.c.tips,[]);b.resolve(true);await runB;eq(h.snapshot().submitting,false);eq(h.c.calls.length,2,'no A continuation or replay');scopeProbe.oldFinallyClearsGlobal=false;}
 },false);
 if(!baseline)await test('late-finally-preserves-other-menu',async()=>{const gate=deferred(),h=harness({generatePend:()=>gate.promise});h.open();const run=h.submit();await h.afterAcknowledgements();h.move({key:'tree:b',members:[]},[node('text-b','B',{projectKey:'tree:b'})]);h.open(['text-b']);const menu=h.c.genImageMenu;gate.resolve(true);await run;eq(h.snapshot().menu,menu);eq(h.snapshot().submitting,false);eq(h.c.calls.length,1);},false);
 if(!baseline)await test('inflight-aba-preserves-original-busy-without-replay',async()=>{
  const gate=deferred(),texts=[node(),node('text-a2','second')],h=harness({nodes:texts,generatePend:()=>gate.promise}),project=h.c.activeProjectRef.current;
  h.open(['text-a','text-a2']);const old=h.render(),run=h.submit('general',{combine:false});await h.afterAcknowledgements();
  h.move({key:'tree:b',members:[]},[node('text-b','B',{projectKey:'tree:b'})]);h.open(['text-b']);ok(h.snapshot().menu);eq(h.snapshot().submitting,false);
  h.move(project,texts);eq(h.snapshot().submitting,true,'same project retains original in-flight busy');h.open(['text-a']);await h.submit();await old.generateImagesFromTextNodes('general',{combine:false,useReferences:true});eq(h.c.calls.length,1,'no new paid call on return');
  gate.resolve(true);await run;eq(h.snapshot().submitting,false);eq(h.c.calls.length,1,'old serial batch does not resume after ABA');
 },false);
 const compare=arg('--compare');if(compare)eq(rows,JSON.parse(fs.readFileSync(compare,'utf8')).rows,'complete original/current prompt/reference/sequence/geometry/error trace');
 const report={status:'PASS',mode:baseline?'BASELINE':'MODIFIED',sourceRoot:root,canvasHash:createHash('sha256').update(fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'))).digest('hex'),cases,checks,commonCases:rows.length,trace:compare?'EXACT':'CAPTURED',scopeProbe,actualCanvas:true,actualOwner:!baseline,generatePend:'INTERCEPTED',pg:false,network,rows};
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`CANVAS_TEXT_IMAGE_RUNS=${baseline?'BASELINE_REPRODUCED':'PASS'} CASES=${cases} COMMON=${rows.length} CHECKS=${checks} ORIGINAL_TRACE=${report.trace} CROSS_PROJECT_BLOCKED=${Number(scopeProbe.crossProjectBlocked)} ACTUAL_CANVAS=1 ACTUAL_OWNER=${Number(!baseline)} GENERATE_PEND=INTERCEPTED PG=0 NETWORK=${network}`);
 }finally{global.fetch=originalFetch;}
}
(process.argv.includes('--ack-only')?(async()=>{await runAckContract();const report={status:'PASS',cases,checks,ownerSource:ownerSource||'src/lib/canvas/text-image-runs.ts',actualOwner:true,actualCanvas:false,network};fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(`TEXT_IMAGE_ACK_CONTRACT=PASS CASES=${cases} CHECKS=${checks} NETWORK=${network}`);})():run()).catch(error=>{fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:error.stack,cases,checks},null,2));console.error(error);process.exitCode=1;});
