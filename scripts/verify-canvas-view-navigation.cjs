/** Actual old/new Canvas focus/import callers. Actual document scope and
 * geometry; frame/timer,Flow and existing document/history ports are controlled. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),esbuild=require('esbuild');
const arg=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(arg('--source-root')||'.'),out=path.resolve(arg('--out')||process.env.VIEW_NAVIGATION_EVIDENCE||'output/canvas-view-navigation'),baseline=process.argv.includes('--baseline');
const source=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),ast=ts.createSourceFile('canvas.tsx',source,99,true,4);let area,workflow;
(function walk(n){
 if(ts.isFunctionDeclaration(n)&&n.name?.text==='focusEditableCanvasArea')area=n.getText(ast);
 if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useWorkflowPaste')workflow=n.arguments[0].properties.find(p=>p.name?.getText(ast)==='onCommitted')?.initializer?.getText(ast);
 ts.forEachChild(n,walk);
})(ast);assert.ok(area&&workflow,'actual Canvas area/import callers');
const plain=x=>JSON.parse(JSON.stringify(x)),compile=s=>ts.transpileModule(s,{compilerOptions:{target:9,module:1}}).outputText;
async function bundle(){return(await esbuild.build({stdin:{contents:`export {createCanvasDocumentContext} from './src/lib/canvas/document-scope';${baseline?'':"export * from './src/lib/canvas/view-navigation';"}`,resolveDir:root,loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false,nodePaths:[path.resolve('node_modules')],plugins:[{name:'scope-ports',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/saas\/workspace-client$/},()=>({path:'workspace',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?'export const authHeader=async()=>({});':'export const currentWorkspace=()=>__workspace.value;export const currentWorkspaceRevision=()=>__workspace.revision;'}));}}]})).outputFiles[0].text;}
function fixture(code,options={}){
 const frames=new Map(),timers=new Map(),callbacks=[],trace=[],documents=[];let serial=0,epoch=0,project='P',navigation,queuedProject,revision={current:0};
 const c={module:{exports:{}},exports:{},console,Map,Set,Promise,Math,Number,Error,__workspace:{value:'personal',revision:0}};
 c.exports=c.module.exports;vm.createContext(c);vm.runInContext(code,c);Object.assign(c,c.module.exports);
 const context=c.createCanvasDocumentContext();let scope=context.render('owner',project);
 const frame=fn=>{callbacks.push(fn);frames.set(++serial,fn);return serial;},timer=fn=>{callbacks.push(fn);timers.set(++serial,fn);return serial;};
 const flow={getViewport:()=>options.viewport||{x:0,y:0,zoom:1},setCenter:(x,y,settings)=>{trace.push({kind:'area',project,x,y,settings:plain(settings)});return Promise.resolve(true);},fitView:settings=>{trace.push({kind:'fit',project,settings:plain(settings)});return Promise.resolve(true);}};
 c.window={requestAnimationFrame:frame,cancelAnimationFrame:id=>frames.delete(id),setTimeout:timer,clearTimeout:id=>timers.delete(id)};
 c.rfRef={current:options.noFlow?null:flow};c.canvasAreaRef={current:options.noArea?null:{clientWidth:options.width||1000,clientHeight:options.height||700}};
 c.canvasContextEpochRef={get current(){return epoch;}};c.activeProjectRef={get current(){return {key:project};}};
 const bind=()=>navigation?.bind({scope,contextKey:scope.key,browsing:false});
 if(!baseline){navigation=c.createCanvasViewNavigation({frame:run=>{const id=frame(run);return()=>frames.delete(id);},timer:run=>{const id=timer(run);return()=>timers.delete(id);},flow:()=>c.rfRef.current,area:()=>c.canvasAreaRef.current,onIntent:()=>{}});bind();revision=navigation.navigationRevision;}
 c.viewControls=baseline?{navigationRevision:revision,cancelFocus:()=>revision.current++}:{navigationRevision:revision,cancelFocus:()=>navigation.cancel(),capture:origin=>navigation.capture(origin)};
 c.canvasArtworkDocument={scope,accept:rows=>documents.push(['artworks',plain(rows)])};c.canvasTextDocument={accept:rows=>documents.push(['texts',plain(rows)])};c.workflowDocument={accept:value=>documents.push(['manifest',plain(value)])};c.nodePreferences={accept:value=>documents.push(['settings',plain(value)])};c.canvasHistory={record:(s,a)=>documents.push(['history',s.project,plain(a)])};
 c.projectNavigation={open:key=>{documents.push(['navigate',key]);queuedProject=key;}};c.setSelectedId=value=>documents.push(['selected',value]);c.setSelectedTextId=value=>documents.push(['selectedText',value]);c.flashTip=value=>documents.push(['notice',value]);
 vm.runInContext(compile(area+'\nglobalThis.areaEntry=focusEditableCanvasArea;globalThis.importEntry='+workflow+';'),c);
 function change(next,account='owner'){project=next;epoch++;scope=context.render(account,project);c.canvasArtworkDocument.scope=scope;bind();}
 const clock=(queue)=>{const batch=[...queue.values()];queue.clear();for(const fn of batch)fn();};
 function drain(){for(let i=0;(frames.size||timers.size)&&i<12;i++){clock(frames);clock(timers);}assert.equal(frames.size+timers.size,0);}
 return {c,trace,documents,scope:()=>scope,frames:()=>clock(frames),timers:()=>clock(timers),drain,
  manual:()=>c.viewControls.cancelFocus(),change,workspace(){c.__workspace.value='enterprise';c.__workspace.revision++;scope=context.render('owner',project);c.canvasArtworkDocument.scope=scope;bind();},workspaceABA(){this.workspace();c.__workspace.value='personal';c.__workspace.revision++;scope=context.render('owner',project);c.canvasArtworkDocument.scope=scope;bind();},
  expire:()=>context.mount(false),dispose:()=>navigation?.dispose(),commit(){if(queuedProject!==undefined){change(queuedProject);queuedProject=undefined;}},replay:()=>callbacks.forEach(fn=>fn()),
  imported(){c.importEntry({artworks:[{id:'image',image:'/media/original.png',source:'workflow'}],textNodes:[{id:'text',content:'original'}],manifest:{id:'workflow'},settings:{image:{locked:false}},projectKey:'target',missingReferences:0},scope,true);},
 };
}
(async()=>{fs.mkdirSync(out,{recursive:true});const code=await bundle(),common=[],counterexamples=[];let checks=0;
 const eq=(a,b)=>{assert.deepEqual(plain(a),plain(b));checks++;};
 const vectors=[{x:2000,y:1000,width:320,height:236},{x:-2000,y:100,width:380,height:240},{x:20,y:20,width:320,height:236},{x:0,y:0,width:20,height:20},{x:0,y:0,width:2000,height:2000}];
 for(const viewport of [{x:0,y:0,zoom:1},{x:120,y:-90,zoom:.1},{x:-50,y:40,zoom:3}])for(const rect of vectors){const h=fixture(code,{viewport});h.c.areaEntry(rect);h.drain();common.push({name:JSON.stringify({viewport,rect}),trace:h.trace});eq(h.trace.length<=1,true);}
 for(const flag of ['noFlow','noArea']){const h=fixture(code,{[flag]:true});h.c.areaEntry(vectors[0]);h.drain();eq(h.trace,[]);common.push({name:flag,trace:h.trace});}
 for(const [name,change,between]of [
  ['manual-before-frame',h=>h.manual(),false],['manual-between-frame-and-timer',h=>h.manual(),true],
  ['project-switch',h=>h.change('other'),false],['project-ABA',h=>{h.change('other');h.change('P');},true],
  ['account-switch',h=>h.change('P','other'),false],['workspace-ABA',h=>h.workspaceABA(),true],['origin-expired',h=>h.expire(),false],
 ]){const h=fixture(code);h.c.areaEntry(vectors[0]);if(between)h.frames();change(h);h.drain();eq(h.trace.length,baseline?1:0);counterexamples.push({name,viewportWrites:h.trace.length});}
 {const h=fixture(code);h.imported();h.commit();h.drain();eq(h.trace.length,1);eq(h.trace[0].settings,{nodes:[{id:'image'},{id:'text'}],padding:.2,duration:240,maxZoom:1});common.push({name:'workflow-target-navigation',trace:h.trace,documents:h.documents});}
 for(const between of [false,true]){const h=fixture(code);h.imported();h.commit();if(between)h.frames();h.manual();h.drain();eq(h.trace.length,baseline?1:0);eq(h.documents.filter(r=>r[0]==='history').length,1);counterexamples.push({name:'workflow-manual-'+between,viewportWrites:h.trace.length});}
 if(!baseline){
  const h=fixture(code);const intent=h.c.viewControls.capture(h.scope());h.change('target');intent.area(vectors[0],'target');h.drain();eq(h.trace.length,1);
  const stale=h.c.viewControls.capture(h.scope());h.change('other');h.change('target');eq(stale.area(vectors[0]),false);h.drain();eq(h.trace.length,1);
  const late=fixture(code);late.c.areaEntry(vectors[0]);late.manual();late.replay();eq(late.trace,[]);
  const stopped=fixture(code);stopped.c.areaEntry(vectors[0]);stopped.dispose();stopped.drain();eq(stopped.trace,[]);
 }
 const compare=arg('--compare');if(compare)eq(common,JSON.parse(fs.readFileSync(compare,'utf8')).common);
 const result={status:baseline?'BASELINE_REPRODUCED':'PASS',checks,normalCases:common.length,common,counterexamples,comparison:compare?'EXACT':'CAPTURED',actualCanvasCallers:true,actualDocumentScope:true,controlled:['frame/timer','Flow','original document/history ports'],network:0,paidPosts:0};
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');console.log('CANVAS_VIEW_NAVIGATION='+result.status+' NORMAL='+common.length+' CHECKS='+checks+' STALE_VIEW_WRITES='+counterexamples.reduce((n,r)=>n+r.viewportWrites,0)+' ORIGINAL_GEOMETRY_IMPORT='+(compare?'EXACT':'CAPTURED')+' DOCUMENT_WRITES=ORIGINAL NETWORK=0');
})().catch(e=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:String(e),stack:e.stack},null,2)+'\n');console.error(e);process.exitCode=1;});
