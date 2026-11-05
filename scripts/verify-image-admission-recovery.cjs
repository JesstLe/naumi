const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{buildSync}=require('esbuild'),crypto=require('node:crypto');
const mode=(process.argv[2]||'MODIFIED').toUpperCase(),root=path.resolve(process.argv[3]||'.');let checks=0;
const check=(v,msg)=>{assert(v,msg);checks++};
function pure(rel){const m={exports:{}};const js=buildSync({entryPoints:[path.join(root,rel)],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;vm.runInNewContext(js,{module:m,exports:m.exports,require,console,Error});return m.exports;}
async function bundledPlan(state){
 const {build}=require('esbuild');
 const fixtures={
 '../saas/creation-context':`export const assertCurrentCreationFeature=async()=>{};`,
 '../model-config/resolution-fallback':`export const resolveImageResolution=()=>undefined;export const resolutionFallbackMessage=()=>"";export const resolutionFacts=(x)=>x;export const upstreamAcceptsResolution=()=>true;`,
 './inputs':`export async function readImagegenInputs(r){return r.inputs.map(i=>({...i,width:__fixture.width,height:__fixture.height}))}`,
 '../model-config/server':`export async function getModelAdministration(){return{repo:{current:async()=>({version:121,config:__fixture.config})},billing:{current:async()=>({version:8})}}}`,
 '../model-config/runtime':`export function simulateModel(){return{eligible:__fixture.ids.map(upstreamId=>({upstreamId,providerId:'p',rank:1})),excluded:[],modelVersion:121,billingVersion:8}}`,
 '../model-config/tool-scope':`export function assertToolScope(){};export const featureDefaultModel=()=> 'gpt-image-2'`,
 '../billing/server':`export async function quoteForActor(){__fixture.quotes++;return{tariff:{pricing:{mode:'fixed'}},requestedCredits:6}}`,
 '../billing/quotation':`export async function quoteForActor(){__fixture.quotes++;return{tariff:{pricing:{mode:'fixed'}},requestedCredits:6}}`,
 '../model-config/context':`export const runExecutionBundle=(c,f)=>f()`,
 '../image-skills/server':`export async function resolveImageSkill(){return undefined}`,
 './parameters':`export function mapImagegenParameters(){return{}};export const imagegenWireRequest=r=>r`,
 './capabilities':`export const publishedImagegenCapabilities=()=>({})`,
 '../feature-access/server':`export async function userFeaturePolicy(){return{}};export class FeatureAccessError extends Error{}`,
 '../feature-access/catalog':`export const allows=()=>true`,
 };
 const result=await build({stdin:{contents:fs.readFileSync(path.join(root,'src/lib/imagegen/plan.ts'),'utf8'),resolveDir:path.resolve('src/lib/imagegen'),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,packages:'external',plugins:[{name:'new-request-fixture',setup(b){
 b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
 b.onResolve({filter:/.*/},a=>{const key=a.importer.includes('model-config')&&a.path.startsWith('./')?'../model-config/'+a.path.slice(2):a.path;return fixtures[key]?{path:key,namespace:'fixture'}:undefined;});
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:fixtures[a.path]||'',loader:'ts'}));
 }}]});const m={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module:m,exports:m.exports,require,Buffer,console,URL,Response,Request,Headers,FormData,File,process:{env:{}},__fixture:state});return m.exports;
}
async function legacy(sizeModule,ratio){
 const file=path.join(root,'src/app/api/generate-image/route.ts'),source=require('./lib/image-generation-source.cjs')(root),ast=ts.createSourceFile(file,source,99,true);const typed=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='submitGeneration');const fn=typed||ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='handleObservedPost');assert(fn);
 const state={jobs:0,quotes:0};const env={Request,Response,Buffer,Date,console,crypto,MAX_GENERATION_DIMENSION:4096,dbEnabled:false,NextResponse:{json:(v,i)=>Response.json(v,i)},ExactImageSizeError:sizeModule.ExactImageSizeError,exactImageRequestSize:sizeModule.exactImageRequestSize,
 imageWorkerAuthorized:()=>false,parseParams:async()=>({prompt:'fixture',userPrompt:'fixture',model:'gpt-image-2',origin:'canvas',images:[],targetWidth:0,targetHeight:0,ratio,resolution:'1K',quality:'medium',count:1,email:'fixture@example.test'}),currentImagegenStep:()=>undefined,assertPlatformImageSelection:()=>{},legacyImagegenIntent:()=>null,getOpenAISettings:async()=>({apiKey:'fixture',model:'gpt-image-2'}),clientIp:()=>'',rateLimit:()=>true,getImageModelCatalog:async()=>[{id:'gpt-image-2',provider:'managed',supportsEdit:true}],currentModelExecution:()=>undefined,routeImageModel:id=>id,resolveConfiguredImageQuality:()=>({executed:'medium',requested:'medium'}),imageQualityCost:async()=>{state.quotes++;return 6},getStyleGuide:async()=>({}),buildPrompt:()=> 'fixture',JOBS:{create:async()=>{state.jobs++}},kickGeneration:async()=>{},safeError:()=> 'fixture failed',BillingError:class extends Error{}};
 env.generationResult=(body,options)=>Response.json(body,options);env.generationBillingError=()=>Response.json({error:'fixture failed'},{status:503});
 vm.runInNewContext(ts.transpileModule(fn.getText(ast).replace('submitGeneration','handleObservedPost')+';globalThis.route=handleObservedPost;',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,env);
 const response=typed?await env.route(await env.parseParams(),{actor:async()=>null,ip:null,quote:async()=>undefined}):await env.route(new Request('http://fixture/api/generate-image',{method:'POST'}));return{status:response.status,body:await response.json(),...state};
}
(async()=>{
 const size=pure('src/lib/imagegen/request-size.ts');const state={quotes:0,width:1316,height:1754,ids:['up','apib'],config:{publicModels:[{id:'gpt-image-2',enabled:true,visible:true,modality:'image',target:{type:'upstream',id:'up'},supplierRouting:{channels:[]}}],upstreamModels:[{id:'up',providerId:'p',model:'gpt-image-2',parameterMap:{},enabled:true,capabilities:{qualities:['medium'],nativeResolutions:['1K']}},{id:'apib',providerId:'p',model:'gpt-image-2.5-flare',parameterMap:{apimartImages:{ratios:['3:4','1:1']}},enabled:true,capabilities:{qualities:['medium'],nativeResolutions:['1K']}}],providers:[{id:'p',protocol:'openai-images',enabled:true}],bindings:{'image.generate':'gpt-image-2','image.edit':'gpt-image-2'}}};
 const {planImagegen}=await bundledPlan(state);const req={version:1,operationId:'1472c152-3faa-4f06-a047-815e3f34848f',entry:'canvas',mode:'edit',prompt:'fixture',modelId:'gpt-image-2',inputs:[{artworkId:'fixture',role:'edit-target'}],parameters:{ratio:'auto',quality:'medium',resolution:'1K'}};
 if(mode==='BASELINE'||mode==='ROLLBACK'){
  const p=await planImagegen(req,'fixture@example.test');check(p.request.parameters.ratio==='658:877','original odd ratio accepted');check(state.quotes===1,'original quote reached');const result=await legacy(size,'658:877');check(result.status===200&&result.jobs===1,'original job accepted despite size rejection later');
  console.log(`${mode}=REPRODUCED ODD_RATIO_PLAN_ACCEPTED=1 LEGACY_JOB_CREATED=1 QUOTE_REACHED=1 SUPPLIER_CALLS=0 CHECKS=${checks}`);return;
 }
 for(const [w,h]of [[1316,1754],[658,1062],[158,190],[1120,1560],[1316,1755]]){state.width=w;state.height=h;const before=state.quotes;const p=await planImagegen(req,'fixture@example.test');check(p.ratioContractVersion===2,'new versioned grid contract');check(p.steps[0].eligibleUpstreamIds.join(',')==='up','custom native eligible; finite adapter excluded');check(state.quotes===before+1,'valid request quoted once');check(req.parameters.ratio==='auto','caller unchanged');}
 state.width=750;state.height=1000;const valid=await planImagegen(req,'fixture@example.test');check(valid.request.parameters.ratio==='3:4'&&valid.steps[0].eligibleUpstreamIds.length===2,'standard unchanged');
 for(const ratio of ['658:877','329:531','79:95','28:39','9:21','3:1','1:3']){const r=await legacy(size,ratio);check(r.status===200&&r.jobs===1,'valid custom grid job accepted');}
 for(const ratio of ['100:1','1:100','0:1']){const r=await legacy(size,ratio);check(r.status===400&&r.body.code==='IMAGE_SIZE_UNSUPPORTED'&&r.body.accepted===false,'invalid dimensions rejected before job');check(r.jobs===0&&r.quotes===0,'zero job quote/reserve');}
 const r=await legacy(size,'3:4');check(r.status===200&&r.jobs===1,'valid request still accepted');
 const api=pure('src/lib/api-error.ts');check(api.safeError(Error('503 当前图片通道暂时不可用，请稍后再试；本次未提交生成，未扣积分')).includes('暂时不可用'),'cooldown truthful');check(!api.safeError(Error('403 api-key=secret-user@vendor')).includes('secret'),'supplier detail hidden');
 const evidence=pure('src/lib/supplier-cost/failure-evidence.ts');for(const [status,body,expected]of [[403,{error:{message:'insufficient_quota sk-secret'}},'quota'],[403,{error:{message:'invalid_api_key sk-secret'}},'credential'],[403,{error:{message:'model_not_allowed'}},'model-permission'],[403,{},'authorization-or-edge'],[429,{},'rate-limit'],[503,{},'upstream-unavailable'],[400,{error:{message:'content_policy'}},'content-policy']]){const e=evidence.supplierFailureEvidence(status,body);check(e.failureCategory===expected,'bounded category');check(!JSON.stringify(e).includes('secret'),'no body leaked');}
 check(evidence.supplierFailureEvidence(0,undefined,{cause:{code:'ECONNREFUSED'}}).transportCode==='ECONNREFUSED','transport cause retained');check(!JSON.stringify(evidence.supplierFailureEvidence(0,undefined,{code:'sk-secret'})).includes('secret'),'transport allowlist');
 console.log(`MODIFIED=PASS CHECKS=${checks} AUTO_CUSTOM_PLAN=5 LEGACY_HANDLER_GRID_ACCEPT=7 INVALID_PREACCEPT_REJECT=3 FINITE_ADAPTER=EXCLUDED VALID_3_4=UNCHANGED ERROR_CATEGORIES=BOUNDED SUPPLIER_CALLS=0`);
})().catch(e=>{console.error(e);process.exitCode=1});
