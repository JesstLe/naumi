/* Real A+ parser/worker/query functions + native Sharp. In-memory IO, no external requests. */
require('tsx/cjs');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),sharp=require('sharp');
const root=process.cwd(),sourceRoot=path.resolve(process.argv[2]||root),source=fs.readFileSync(sourceRoot+'/src/app/api/aplus/route.ts','utf8');
const ast=ts.createSourceFile('aplus.ts',source,99,true),parts=[];
const names=['ratioFor','sizeFor','parseInput','runAplusGeneration','genOneShot','editWithSelectedProvider','editImagesMultipart','persistOne','GET','handleObservedPost','createSubmission','POST'];
for(const node of ast.statements){if(ts.isFunctionDeclaration(node)&&names.includes(node.name?.text))parts.push(node.getText(ast));if(ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>['APLUS_FORMATS','APLUS_MODULES','GRADIENTS'].includes(d.name.getText(ast))))parts.push(node.getText(ast));}
assert.equal(parts.length,names.length+3);
const code=ts.transpileModule(parts.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
async function main(){let cases=0;const records=[];
for(const scenario of [
 ...['1:1','2:3','3:2','3:4','4:3','9:16','16:9','auto'].map(format=>({format,model:'gpt-image-2',version:1})),
 {format:'3:4',model:'gpt-image-2',version:1,wrong:true},
 {format:'3:4',model:'gpt-image-1',version:1,wrong:true},
 {format:'aplus-web',model:'gpt-image-2',version:undefined},
 {format:'9:16',model:'gpt-image-2',version:undefined}
]){
 let wire=0,rows=[],saved,wireSize,wireRatio,created,quoted;const paid=new Map();
 const reference=await sharp({create:{width:120,height:160,channels:4,background:{r:20,g:80,b:150,alpha:0.7}}}).png().toBuffer();
 const job={frameVersion:scenario.version,format:scenario.format,model:scenario.model,quality:{requested:'medium',executed:'medium',fallbackReason:null},sourceBuffers:[reference],sources:[],sourceHistory:[],shots:[{id:'result',role:'hero',label:'fixture',ratio:'1:1',prompt:'fixture content',status:'pending'}],modules:['hero'],email:'fixture@example.test',origin:'canvas',parentId:'source',parentIds:[],useDb:true,reserved:true,cost:8,status:'pending'};
 const c={console,require,exports:{},Buffer,File,Blob,FormData,Request,Response,URL,Date,Math,Error,process:{env:{}},setTimeout:f=>{f();return 1},NextResponse:{json:Response.json},dbEnabled:true,storageEnabled:false,
  ...require(root+'/src/lib/imagegen/request-size.ts'),...require(root+'/src/lib/imagegen/output-shape.ts'),...require(root+'/src/lib/image-job-failure.ts'),
  JOBS:{create:async(id,email,snapshot)=>{created=snapshot},get:async()=>job,paidOperation:async(id,model,opts,run)=>{wireRatio=opts.ratio;if(paid.has(opts.id))return paid.get(opts.id);const b=await run();paid.set(opts.id,b);return b},settleResults:async()=>{},handlePending:async()=>{throw Error('unexpected pending')}},
  patchJob:async(id,patch)=>Object.assign(job,patch),getOpenAISettings:async()=>({apiKey:'fixture',model:scenario.model}),getOpenAIBaseUrl:async()=> 'http://fixture.invalid/v1',observeOpenAI:v=>v,modelAwareOpenAI:()=>({}),planShots:()=>{throw Error('unexpected planner')},touchReservation:async()=>{},isImageGatewayModel:()=>false,ImageOperationPending:class extends Error{},withQualityFallback:async(q,fn)=>fn(q.executed),getImageJobChargedCredits:async()=>8,addArtworks:async(email,arts)=>{rows=arts},getUser:async()=>({email:job.email,creditsTotal:99999,creditsUsed:0}),auditSettledImage:async()=>{},safeError:e=>e.message,
  crypto:require('node:crypto'),getImageModelCatalog:async()=>[{id:scenario.model,supportsEdit:true}],clientIp:()=> '127.0.0.1',rateLimit:()=>true,isBanned:async()=>false,sweepStaleReservations:async()=>{},imageRequestBilling:async()=>({quality:job.quality,cost:8}),quoteForRequest:async(request,facts)=>{quoted=facts;return {requestedCredits:8}},assertQuotedVersion:()=>{},requestQuoteConfirmation:()=>({}),listArtworksByIds:async()=>[{id:'source'}],requestedTextModel:()=> 'fixture-planner',kickAplus:async()=>{},withBillingIntent:async(req,run)=>run(),withBiRequest:async(req,run)=>run(),billingErrorResponse:e=>{throw e},
  resolveImageModel:async()=>({provider:'openai'}),PER_SHOT_TIMEOUT:1000,CONCURRENCY:1,SHOT_RETRIES:3,AbortSignal,imageOperationQuality:v=>v,appendImageGatewayFields:()=>{},resolveUserEmail:async()=>job.email,imageWorkerAuthorized:()=>false,
  managedImageEditFetch:async(base,key,form)=>{
   wire++;assert.equal(form.getAll('image').length+form.getAll('image[]').length,scenario.version?1:(scenario.format==='aplus-web'?2:1),'no extra reference slot for new jobs');wireSize=form.get('size');const dims=wireSize==='auto'?[120,160]:wireSize.split('x').map(Number);
   saved=scenario.wrong?await sharp(reference).resize(120,180,{fit:'fill'}).png().toBuffer():await sharp(reference).resize(dims[0],dims[1],{fit:'fill'}).png().toBuffer();
   return Response.json({data:[{b64_json:saved.toString('base64')}]});
  }
 };
 vm.createContext(c);vm.runInContext(code,c);
 const form=new FormData();form.append('format',scenario.format);form.append('prepared','1');form.append('parentId','source');form.append('module','hero');form.append('image',new File([reference],'fixture.png',{type:'image/png'}));
 const parsed=await c.parseInput(new Request('http://fixture.invalid/api/aplus',{method:'POST',body:form}));assert.equal(parsed.format,scenario.format);
 const submitted=await c.POST(new Request('http://fixture.invalid/api/aplus',{method:'POST',body:form}));assert.equal(submitted.status,200,await submitted.text());assert.equal(created.frameVersion,1);assert.equal(created.format,scenario.format);assert.equal(quoted.ratio,c.ratioFor(scenario.format));
 await c.runAplusGeneration('job');assert.equal(job.status,'done',job.error);assert.equal(wire,1);assert.equal(rows.length,1);
 const delivered=Buffer.from(rows[0].image.split(',')[1],'base64');assert.ok(delivered.equals(saved),'provider bytes preserved without crop/resize');
 if(scenario.version){assert.equal(wireRatio,scenario.format);assert.equal(wireSize,c.sizeFor(scenario.format,scenario.model,true));const meta=await sharp(saved).metadata();assert.equal(rows[0].width,meta.width);assert.equal(rows[0].height,meta.height);assert.equal(!!job.frameError,!!scenario.wrong)}
 else {assert.equal(wireSize,scenario.format==='9:16'?'1024x1536':'1536x1024');assert.equal(wireRatio,'1:1');assert.equal(rows[0].width,undefined)}
 const response=await c.GET(new Request('http://fixture.invalid/api/aplus?job=job'));const query=await response.json();assert.equal(query.status,scenario.wrong?'error':'done');assert.equal(query.shots[0].ratio,job.shots[0].ratio);assert.equal(query.reviewRequired,false);
 const beforeRatio=job.shots[0].ratio;await c.runAplusGeneration('job');assert.equal(wire,1,'completed checkpoint must not regenerate');assert.equal(job.shots[0].ratio,beforeRatio,'resume preserves actual ratio');
 job.status='needs_attention';const review=await (await c.GET(new Request('http://fixture.invalid/api/aplus?job=job'))).json();assert.equal(review.reviewRequired,true);assert.equal(review.operationStatus,'needs_attention');
 form.set('format','invalid-ratio');assert.equal(await c.parseInput(new Request('http://fixture.invalid/api/aplus',{method:'POST',body:form})),null);
 records.push({scenario,wireSize,wireRatio,actualRatio:beforeRatio,retainedBytes:true,fixtureWireCalls:wire});cases++;
}
const out=path.resolve(process.env.FIXES_OUT||'output/canvas-postrelease-fixes47-20261019');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'aplus-matrix.json'),JSON.stringify(records,null,2));
console.log(`APLUS_FRAME=PASS CASES=${cases} POST_PARSER_WORKER_QUERY=REAL SHARP=REAL BYTES_PRESERVED=YES CHECKPOINT_REPLAY=0 EXTERNAL_SUPPLIER_CALLS=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
