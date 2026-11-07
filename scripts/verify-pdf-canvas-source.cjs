// Executes the selected source functions with deferred React updates, not copied implementations.
require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=process.cwd(),sourceRoot=path.resolve(process.env.PDF_SOURCE_ROOT||root),baseline=process.argv.includes('--baseline');
const src=fs.readFileSync(path.join(sourceRoot,'src/components/canvas/canvas-client.tsx'),'utf8');
const ast=ts.createSourceFile('canvas.tsx',src,99,true,4),functions={},expressions={};
function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)functions[n.name.text]=n.getText(ast);if(ts.isVariableDeclaration(n)&&['dockRefs','dockReferenceState'].includes(n.name.getText(ast)))expressions[n.name.getText(ast)]=n.initializer.getText(ast);ts.forEachChild(n,visit)}visit(ast);
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const refs=require(root+'/src/lib/canvas/input-references.ts'),media=require(root+'/src/lib/canvas/media-loading.ts');
const product={id:'product',image:'/product.png',width:1500,height:1500,canvasWidth:320,canvasHeight:420,source:'canvas-add'};
const reference={id:'reference',image:'/reference.png',width:750,height:1000,parentId:'product',parentIds:['product'],source:'canvas-add'};
let checks=0;const check=(ok,label)=>{assert.ok(ok,label);checks++};
async function main(){
 const c=vm.createContext({...refs,Set,Map,Error,useMemo:fn=>fn(),selected:reference,active:{members:[product,reference]},adaptiveCanvasImageSize:()=>({width:320,height:320})});
 vm.runInContext(compile(functions.artworkImageSize+'\n'+functions.lineageChain+'\nglobalThis.actualReferences='+expressions.dockRefs.replaceAll('dockReferenceState','globalThis.referenceState')+';'),Object.assign(c,{referenceState:{references:refs.canvasGenerationReferences(reference,[product,reference])}}));
 check(c.artworkImageSize(product).height===(baseline?420:320),'source display dimensions respect intrinsic aspect');
 check(c.lineageChain([product,reference],'reference').has('product')===!baseline,'explicit canvas-add parent participates in lineage');
 check(c.actualReferences.length===(baseline?1:2),'Dock source includes real explicit product reference');
 for(const scenario of ['fresh-row','http-error','account-switch']){
  const queued=[],old=[{...product}],loaded={...reference};let current=old;
  const c=vm.createContext({works:old,worksRef:{current:old},canvasAccountRef:{current:'account-a'},targetEmail:null,user:{email:'fixture@example.test'},invalidateBrowserData:()=>{},t:k=>k,
   setWorks:update=>queued.push(()=>{current=typeof update==='function'?update(current):update}),
   expectJsonOk:async r=>{if(!r.ok)throw Error('read failure');return r.json()},authHeader:async()=>({}),
   privateFetchRaw:async()=>{if(scenario==='account-switch')c.canvasAccountRef.current='account-b';return {ok:true,json:async()=>({artworks:[loaded]})}},
   fetch:async()=>({ok:false,json:async()=>({error:'temporary read failure'})})});
  vm.runInContext(compile(functions.mergeWorks+'\n'+functions.refetchWorks),c);
  if(scenario==='http-error'){await c.refetchWorks();for(const run of queued)run();check(current.length===(baseline?0:1),'HTTP500 does not overwrite works with empty list');}
  else {const result=await c.mergeWorks(['reference']);check(result.some(a=>a.id==='product')===(scenario==='fresh-row'&&!baseline),'returns complete merged snapshot before React schedules state');if(scenario==='account-switch')check(queued.length===0,'account switch never schedules stale writes');}
 }
 if(!baseline){
  for(const scenario of ['allowed','locked','read-only','no-feature','missing-config','read-failure']){
   let submitted=0,lifecycle=0,form;
   const c=vm.createContext({readOnly:scenario==='read-only',user:{email:'fixture@example.test'},canFeature:()=>scenario!=='no-feature',isNodeLocked:()=>scenario==='locked',cutoutCatalog:scenario==='missing-config'?null:{supported:true,available:true},cutoutCatalogError:null,setGenError:()=>{},
    readBrowserImage:async()=>{if(scenario==='read-failure')throw Error('fixture no original');return new Blob(['ORIGINAL'],{type:'image/png'})},Blob,File,FormData,
    ImagegenHttpError:require(root+'/src/lib/imagegen/http.ts').ImagegenHttpError,authHeader:async()=>({}),
    privateFetch:async(_url,opts)=>{submitted++;form=opts.body;return {ok:true}},landEditResult:async(_source,submit)=>{lifecycle++;try{return await submit()}catch(e){assert.equal(e.accepted,false);return null}}});
   vm.runInContext(compile(functions.runCutout),c);await c.runCutout(product);
   check(submitted===(scenario==='allowed'?1:0),'cutout guard '+scenario);
   if(scenario==='allowed'){check(lifecycle===1,'reuse existing lifecycle');check(await form.get('image').text()==='ORIGINAL'&&!form.has('sourceUrl'),'authenticated original File, not remote URL');}
  }
  const common={selected:reference,dockReferenceState:{error:''},visibleDockRefs:[product,reference],extraFiles:[],MAX_TOTAL_IMAGES:16,generationMode:'standard',editPrompt:'use product',genRatio:'auto',genStyle:'',genCount:1,genResolution:'1K',setGenError:()=>{},FAITHFUL_REGEN_PROMPT:'faithful'};
  let options;const c=vm.createContext({...common,runGen:async(_source,_text,opts)=>{options=opts}});vm.runInContext(compile(functions.generateChild),c);await c.generateChild();
  check(options.refUrls.join(',')==='/product.png,/reference.png','actual generateChild sends Dock reference URLs');
  check(options.parentIds.join(',')==='product','generated lineage retains actual product input');
  options=null;c.extraFiles=Array.from({length:15},()=>({}));await c.generateChild();check(!options,'excess references rejected before upload, no silent clipping');
 }
 const imageSrc=fs.readFileSync(path.join(sourceRoot,'src/components/canvas/canvas-image.tsx'),'utf8');
 const imageAst=ts.createSourceFile('image.tsx',imageSrc,99,true,4);let selector;
 function imageVisit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(imageAst)==='requested')selector=n.initializer.arguments[0].getText(imageAst);ts.forEachChild(n,imageVisit)}imageVisit(imageAst);
 const c2=vm.createContext({forceOriginal:false,hasDimensions:true,localWidth:320,pixelRatio:1,canvasMediaVariant:media.canvasMediaVariant});
 vm.runInContext(compile('globalThis.select='+selector),c2);
 check(c2.select({transform:[0,0,1]})===(baseline?'thumbnail':'original'),'whole-board original request at 100%');
 check(c2.select({transform:[0,0,.25]})===(baseline?'thumbnail':'preview'),'zoomed out uses the 4x-oversampled preview, never the soft thumbnail');
 console.log(`${baseline?'BASELINE':'MODIFIED'}=PASS PDF_SOURCE_CHECKS=${checks} EXPLICIT_REFS=${baseline?'MISSING':'PRESENT'} DEFERRED_MERGE=${baseline?'PARTIAL':'COMPLETE'} HTTP500=${baseline?'CLEARS_BOARD':'RETAINS_BOARD'} ORIGINAL_100=${baseline?'THUMBNAIL':'ORIGINAL'} SUPPLIER_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
