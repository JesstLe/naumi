const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{build}=require('esbuild'),sharp=require('sharp');
const mode=process.argv[2]||'modified',sourceRoot=path.resolve(process.argv[3]||'.');let checks=0;
const check=(ok,label)=>{assert(ok,label);checks++};
async function loadRoute(rel,state,extras={}){
 const file=path.join(sourceRoot,rel),source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,99,true),automatic={};
 for(const n of ast.statements)if(ts.isImportDeclaration(n)&&n.importClause){const exports=[];if(n.importClause.name)exports.push('export default class FixtureDefault {}');const bindings=n.importClause.namedBindings;if(bindings&&ts.isNamedImports(bindings))for(const e of bindings.elements)if(!e.isTypeOnly)exports.push(`export const ${(e.propertyName||e.name).text}=()=>undefined;`);automatic[n.moduleSpecifier.text]=exports.join('\n')}
 const special={
 'next/server':'export const NextResponse={json:(body,init)=>Response.json(body,init)}',
 '@/lib/db':`export const dbEnabled=false;export const getPool=()=>({query:async()=>({rows:[],rowCount:0})});export async function listArtworksByIds(){if(__fixture.error==='lookup')throw Error('db connection lost');return __fixture.missing?[]:[{id:'source',image:'/fixture.png',width:64,height:64,resolution:'1K'}]};export async function addArtworks(email,rows){if(__fixture.error==='save')throw Error('local storage failure');__fixture.artworks.push(...rows)};export async function getUser(){return{}};export async function reserveCredits(){__fixture.reserves++;return true};export async function refundCredits(){__fixture.refunds++};export async function isBanned(){return false};export async function sweepStaleReservations(){}`,
 '@/lib/storage':'export const storageEnabled=false;export async function uploadImage(){throw Error("fixture storage disabled")};export function dataUrlToBytes(){return null};export async function readManagedObject(){}',
 '@/lib/request-auth':`export async function authenticatedEmail(){return __fixture.unauthorized?null:'fixture@example.test'}`,
 '@/lib/admin-auth':`export async function resolveUserEmail(){return'fixture@example.test'}`,
 '@/lib/ip':`export const clientIp=()=> 'fixture'`,
 '@/lib/rate-limit':`export const rateLimit=()=>true`,
 '@/lib/billing/synchronous':`export async function withBillingRequest(req,feature,fn){return fn()};export const currentSynchronousBilling=()=>({id:'tool-fixture-stable'})`,
 '@/lib/image-quality-request':`import{BillingError}from'@/lib/billing/types';export const requestImageQuality=()=>({requested:'medium',executed:'medium'});export async function imageRequestBilling(){if(__fixture.error==='quote')throw new BillingError('PRICE_CHANGED','price changed',409);__fixture.quotes++;return{cost:6}};export async function imageQualityCost(){return 0};export async function settleToolImage(){__fixture.settled++};export function auditSettledImage(){}`,
 '@/lib/image-edit':`import{ImageOperationPending}from'@/lib/image-gateway';export function isImageTimeout(e){return e?.status===504||/timeout/i.test(e?.name+' '+e?.message)};export async function editImage(input){__fixture.calls++;__fixture.editInput=input;if(__fixture.error==='timeout')throw Object.assign(new Error('timeout secret model name'),{status:504});if(__fixture.error==='pending')throw new ImageOperationPending('fixture',Error('hidden'));if(__fixture.error==='rejected')throw Object.assign(Error('supplier secret'),{status:400});if(__fixture.error==='network')throw new TypeError('fetch failed');return __fixture.edited}`,
 '@/lib/image-gateway':`export class ImageOperationPending extends Error{constructor(operationId,cause){super('pending');this.operationId=operationId;this.cause=cause}};export const imageGatewayFields=()=>({});export const isImageGatewayModel=()=>false;export const withImageIndex=(m,i,f)=>f()`,
 '@/lib/canvas-image-input':`export async function readCanvasImage(){if(__fixture.error==='source')throw Error('private source missing');return{buffer:__fixture.original,mimeType:'image/png'}}`,
 '@/lib/settings':`export async function getOpenAISettings(){return{apiKey:'fixture-only',model:'image',cutoutModel:'image'}}`,
 '@/lib/openai-base':`export async function getOpenAIBaseUrl(){return'http://127.0.0.1:1/v1'}`,
 '@/lib/model-config/context':`export const currentModelExecution=()=>undefined`,
 '@/lib/model-config/selection-policy':`export function assertPlatformImageSelection(){}`,
 '@/lib/model-config/image-quality':`export const resolveConfiguredImageQuality=()=>({requested:'medium',executed:'medium'})`,
 '@/lib/image-quality':`export function resolveImageQuality(){return{requested:'medium',executed:'medium'}};export const isQualityUnsupportedError=()=>false`,
 '@/lib/image-model-catalog':`export async function getImageModelCatalog(){return[{id:'image',supportsEdit:true}]};export async function getUserDefaultImageModel(){return'image'};export const isOpenAIImagesEditModel=()=>true`,
 '@/lib/image-model-routing':`export const routeImageModel=id=>id`,
 '@/lib/prompt-config':`export async function getStyleGuide(){return{}}`,
 '@/lib/provenance-entry':`export const provenanceEntry=(v,f)=>v||f`,
 '@/lib/artwork-provenance':`export const provenanceEntry=(v,f)=>v||f`,
 '@/lib/durable-image-jobs':`export class DurableImageJobs{async create(id,email,snapshot,payload){__fixture.job=payload};async kick(){};async get(){return null}};export const imageWorkerAuthorized=()=>false`,
 '@/lib/billing/intent':`export async function withBillingIntent(request,fn){__fixture.originalRatio=String((await request.clone().formData()).get('ratio'));return fn()}`,
 '@/lib/bi/model-observer':`export const observeOpenAI=x=>x;export async function withBiRequest(request,fn){if(request.headers.get('content-type')?.includes('multipart'))__fixture.boundRatio=String((await request.clone().formData()).get('ratio'));return fn()}`,
 ...extras
 };
 special['@/lib/mock-data']=`export const MAX_GENERATION_DIMENSION=4096;export const resolutionForLongSide=()=> '1K';export const resolutionLongSide=()=>1024`;special['@/lib/images']=`export const CATEGORY_IMAGES={main:[]};export const img=x=>x`;
 for(const [key,value]of Object.entries(automatic)){if(!special[key])continue;for(const name of [...value.matchAll(/export const (\w+)/g)].map(m=>m[1]))if(!new RegExp('export (?:async )?(?:const|function|class) '+name+'\\b').test(special[key]))special[key]+='\nexport const '+name+'=()=>undefined;';}
 const actual=new Set(['@/lib/imagegen/aspect','@/lib/imagegen/output-shape','@/lib/imagegen/context','@/lib/imagegen/legacy-intent','@/lib/imagegen/legacy-frame-request','@/lib/canvas/generation-parameters','@/lib/canvas/expand-image','@/lib/billing/types','@/lib/billing/request','@/lib/api-error','@/lib/mock-data','@/lib/images']);
 // billing/request imports service-heavy model metadata; this response shim preserves actual BillingError identity.
 special['@/lib/billing/request']=`import{BillingError}from'@/lib/billing/types';export function billingErrorResponse(e){return Response.json({error:e.message,code:e.code},{status:e.status||503})};export function assertQuotedVersion(){};export function requestQuoteConfirmation(){return{}}`;
 const result=await build({stdin:{contents:source,resolveDir:path.resolve(path.dirname(rel)),sourcefile:path.basename(rel),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'isolated-route',setup(b){
 b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
 b.onResolve({filter:/.*/},args=>{
  if(args.kind==='dynamic-import'&&args.path!=='sharp')return{path:'dynamic',namespace:'fixture'};
  if(args.path==='sharp')return{path:'sharp',external:true};
  if(special[args.path])return{path:args.path,namespace:'fixture'};
  if(actual.has(args.path))return{path:path.resolve('src',args.path.slice(2)+'.ts')};
  if(automatic[args.path]!==undefined&&!actual.has(args.path))return{path:args.path,namespace:'fixture'};
 });
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:special[args.path]||automatic[args.path]||'',loader:'ts',resolveDir:process.cwd()}));
 }}]});
 const module={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require,Buffer,Response,Request,File,FormData,Headers,AbortSignal,URL,structuredClone,console,crypto:require('node:crypto').webcrypto,process:{env:{}},setTimeout,clearTimeout,__fixture:state});return module.exports;
}
(async()=>{
 const product=await sharp({create:{width:1500,height:1500,channels:3,background:'white'}}).png().toBuffer(),layout=await sharp({create:{width:750,height:1000,channels:3,background:'red'}}).png().toBuffer();
 const s={original:product,artworks:[],quotes:0,calls:0,reserves:0,refunds:0,settled:0};
 const route=await loadRoute('src/app/api/generate-image/route.ts',s);
 const req=(ratio='auto',files=[product,layout],extra={})=>{const form=new FormData();form.set('prompt','用产品替换参考海报主体');form.set('ratio',ratio);form.set('model','image');for(const[k,v]of Object.entries(extra))form.set(k,v);for(const b of files)form.append('image',new File([b],'input.png',{type:'image/png'}));return new Request('http://fixture/api/generate-image',{method:'POST',body:form,headers:{'x-naumi-billing-operation-id':'fixture-original-operation'}})};
 let response=await route.POST(req()),data=await response.json();check(response.status===200,'route accepted '+JSON.stringify(data));
 const expected=mode==='baseline'?'1:1':'3:4';check(s.job.p.ratio===expected,'persisted frame '+s.job.p.ratio);check(s.originalRatio==='auto','outer receipt fingerprint original');
 if(mode!=='baseline'){
  check(s.boundRatio==='3:4','model binding before ratio');check(s.job.p.images.length===2,'two refs remain');
  for(const [ratio,extra,want]of [['9:16',{},'9:16'],['auto',{targetWidth:'768',targetHeight:'1024'},'auto'],['auto',{prompt:'风格迁移，保留产品'},'1:1']]){await route.POST(req(ratio,[product,layout],extra));check(s.job.p.ratio===want,'override/style '+want)}
  response=await route.POST(req('auto',[product,layout,layout]));check(response.status===400,'multi refs requires fixed');
  response=await route.POST(req('auto',[Buffer.from('not an image')]));check(response.status===400,'bad ref input clear');
  await route.POST(req('auto',[layout]));check(s.job.p.ratio==='3:4','single keeps own');
  response=await route.POST(req('auto',[product,layout],{targetWidth:'0',targetHeight:'0'}));check(response.ok&&s.job.p.ratio==='3:4','zero optional pixels do not suppress auto');
 }
 const original=await sharp({create:{width:64,height:64,channels:4,background:{r:10,g:70,b:210,alpha:1}}}).png().toBuffer(),edited=await sharp({create:{width:128,height:128,channels:4,background:'red'}}).png().toBuffer();
 const e={original,edited,artworks:[],quotes:0,calls:0,reserves:0,refunds:0,settled:0};const expand=await loadRoute('src/app/api/canvas/expand/route.ts',e);
 const expandReq=anchor=>new Request('http://fixture/api/canvas/expand',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({artworkId:'source',ratio:'3:4',anchor:anchor||'center'})});
 response=await expand.POST(expandReq());data=await response.json();check(response.ok,'expansion succeeds '+JSON.stringify(data));
 const saved=e.artworks.at(-1),decoded=await sharp(Buffer.from(saved.image.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true}),offset=(20*decoded.info.width+20)*4,pixel=[...decoded.data.subarray(offset,offset+4)];
 check(pixel.join(',')===(mode==='baseline'?'255,0,0,255':'10,70,210,255'),'original center bytes '+pixel.join(','));
 e.error='quote';response=await expand.POST(expandReq());check(response.status===(mode==='baseline'?502:409),'quote error status');
 e.error='timeout';const refunds=e.refunds;response=await expand.POST(expandReq());data=await response.json();check(response.status===(mode==='baseline'?502:409),'unknown timeout status');
 if(mode!=='baseline'){
  check(data.code==='OPERATION_PENDING'&&e.refunds===refunds,'no refund unknown accepted');check(e.editInput.operationId==='tool-fixture-stable','stable operation identity');
  e.error='lookup';response=await expand.POST(expandReq());check(response.status===500,'database lookup not image415');
  e.error='source';response=await expand.POST(expandReq());check(response.status===415,'source not gateway502');
  e.error='save';response=await expand.POST(expandReq());check(response.status===500,'local failure not upstream502');
  e.error='rejected';response=await expand.POST(expandReq());data=await response.json();check(response.status===502&&data.code==='EXPAND_PROVIDER_REJECTED','real provider rejection distinct');
  e.error='network';response=await expand.POST(expandReq());check(response.status===409,'network unknown preserves task');
  e.error='pending';response=await expand.POST(expandReq());check(response.status===409,'explicit pending retained');
  e.error='';e.edited=Buffer.from('broken output');response=await expand.POST(expandReq());check(response.status===502,'invalid output distinct');e.edited=edited;
  for(const anchor of ['nw','n','ne','w','center','e','sw','s','se']){response=await expand.POST(expandReq(anchor));check(response.ok,'anchor '+anchor);const row=e.artworks.at(-1),bytes=Buffer.from(row.image.split(',')[1],'base64'),d=await sharp(bytes).raw().toBuffer({resolveWithObject:true}),top=anchor.startsWith('s')?21:anchor.startsWith('n')?0:11;const originalPixels=await sharp(original).ensureAlpha().raw().toBuffer();let exact=true;for(let row=0;row<64;row++)if(!d.data.subarray(((row+top)*d.info.width)*4,((row+top)*d.info.width+64)*4).equals(originalPixels.subarray(row*64*4,(row+1)*64*4)))exact=false;check(exact,'anchor preserves every original RGBA pixel '+anchor)}
 }
 if(mode!=='baseline'){
  const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/canvas/expand-image.ts','utf8').replace('import "server-only";',''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require});
  for(const [w,h]of [[1,1],[3,4],[9,16],[16,9],[2,3],[3,2]]){const g=m.exports.expansionGeometry(800,600,w,h);check(g.targetW>=g.sourceW&&g.targetH>=g.sourceH&&Math.max(g.targetW,g.targetH)<=4096,'geometry bounded '+w+':'+h)}
  for(const [w,h]of [[0,1],[Infinity,1],[1,1e10],[4,3]]){assert.throws(()=>m.exports.expansionGeometry(800,600,w,h));checks++}
  e.edited=await sharp({create:{width:64,height:85,channels:4,background:{r:50,g:60,b:70,alpha:0}}}).png().toBuffer();response=await expand.POST(expandReq());check(response.status===502&&(await response.json()).code==='EXPAND_OUTPUT_INVALID','transparent surroundings not falsely marked complete');
 }
 const requestsSource=fs.readFileSync(path.join(sourceRoot,'src/lib/model-config/requests.ts'),'utf8'),requestsAst=ts.createSourceFile('requests.ts',requestsSource,99,true);let factsSource;ts.forEachChild(requestsAst,n=>{if(ts.isFunctionDeclaration(n)&&n.name?.text==='requestFacts')factsSource=n.getText(requestsAst)});const c={Request,URL};vm.runInNewContext(ts.transpileModule(factsSource+';globalThis.facts=requestFacts;',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,c);const facts=await c.facts(expandReq());check(!!facts.body.needsMask===(mode!=='baseline'),'expand requires mask-capable channel');
 console.log(mode==='baseline'?'BASELINE=REPRODUCED PRODUCT_FRAME=1:1 MODEL_FACTS=auto EXPAND_QUOTE=502 EXPAND_TIMEOUT=502 ORIGINAL_REGION=MODIFIED EXIT=0':`MODIFIED=PASS CASES=${checks} LEGACY_AUTO=REFERENCE_3:4 MODEL_FACTS=3:4 ORIGINAL_FINGERPRINT=auto EXPAND_QUOTE=409 UNKNOWN=409 SOURCE=415 ORIGINAL_REGION=EXACT ANCHORS=9 SUPPLIER_CALLS=0 EXIT=0`);
})().catch(e=>{console.error(e);process.exitCode=1});
