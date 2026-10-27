const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('src/app/api/generate-image/route.ts','utf8'),ast=ts.createSourceFile('route.ts',source,99,true),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='runJob').getText(ast);
(async()=>{
 for(const fault of ['image-checkpoint','artworks','settlement','final-receipt']){
  let state={status:'pending',paidOperations:{original:{state:'done',result:[{id:'original',url:'data:image/png;base64,fixture'}]}}},failed=false,provider=0,settles=0;
  const trip=s=>{if(s===fault&&!failed){failed=true;throw Object.assign(Error('synthetic transient failure'),{code:'ECONNRESET'});}};
  const context={console,Buffer,Date,Error,Promise,Set,Math,setTimeout,currentModelExecution:()=>null,imageOutputNotice:()=>({}),imageFailureEvidence:()=>({causes:[]}),imageFailureFrames:()=>[],taskFailureDiagnostic:()=>({version:1,stage:'execute',reason:null,causes:[]}),
   storedDeliveryCheckpoint:s=>s.images?.length?{images:s.images,allDone:true,final:true}:s.paidOperations?{images:s.paidOperations.original.result,allDone:true,final:false}:null,
   JOBS:{get:async()=>state,paidOperation:async()=>{provider++;return state.paidOperations.original.result},patch:async(id,p)=>{if(p.images)trip('image-checkpoint');state={...state,...p}},set:async(id,s)=>{trip('final-receipt');state=s},settleResults:async()=>{trip('settlement');settles=1}},
   enforceOutputShape:async i=>i,upscaleImages:async i=>i,attachImageDimensions:async i=>i,persistToStorage:async i=>i,storageEnabled:false,
   addArtworks:async()=>trip('artworks'),getUser:async()=>null,getImageJobChargedCredits:async()=>6,auditSettledImage:async()=>{},provenanceEntry:()=> 'canvas',
   ImageOperationPending:class extends Error{},PostprocessPending:class extends Error{},safeError:()=> 'failed'};
  vm.createContext(context);vm.runInContext(ts.transpileModule(fn,{compilerOptions:{target:9,module:1}}).outputText+'\nglobalThis.runJob=runJob;',context);
  await context.runJob('fixture',{email:'fixture@example.test',images:[],parentIds:[],count:1,quality:'medium',prompt:'fixture'},'fixture',{provider:'openai-images',id:'fixture'},'','',null,true,6);
  assert.equal(state.status,'done');assert.equal(state.images.length,1);assert.equal(provider,1,'delivery retry cannot enter provider code');assert.equal(settles,1);
 }
 console.log('DELIVERY_RETRY=PASS FAULTS=4 PROVIDER_ENTRIES_PER_TASK=1 IMAGES=DELIVERED SETTLEMENT=ONCE');
})().catch(e=>{console.error(e);process.exitCode=1});
