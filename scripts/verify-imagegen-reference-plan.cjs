const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{build}=require('esbuild'),sharp=require('sharp');
const mode=process.argv[2]||'modified',root=process.cwd();
async function bundle(entry,state,modules,source){
 const result=await build({entryPoints:[path.resolve(entry)],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'isolated-plan',setup(b){
 b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
 b.onResolve({filter:/.*/},args=>{if(modules[args.path])return{path:args.path,namespace:'fixture'}});
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:modules[args.path]||'',loader:'ts'}));
 if(source)b.onLoad({filter:/imagegen[\\/]plan\.ts$/},()=>({contents:fs.readFileSync(source,'utf8'),loader:'ts',resolveDir:path.resolve('src/lib/imagegen')}));
 }}]});
 const m={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module:m,exports:m.exports,require,Buffer,console,URL,Response,Request,FormData,File,Headers,process:{env:{}},__fixture:state});return m.exports;
}
(async()=>{
 const product=await sharp({create:{width:1500,height:1500,channels:3,background:'white'}}).png().toBuffer(),layout=await sharp({create:{width:750,height:1000,channels:3,background:'red'}}).png().toBuffer();
 const image=async(artworkId,role,buffer)=>{const m=await sharp(buffer).metadata();return{artworkId,role,buffer,mimeType:'image/png',width:m.width,height:m.height}};
 const a=await image('product','edit-target',product),b=await image('layout','reference',layout);
 const state={inputs:[a,b],quotes:[],simulations:[],forms:[]};
 const modules={
 './inputs':'export async function readImagegenInputs(request){return request.inputs.map(i=>({...__fixture.inputs.find(x=>x.artworkId===i.artworkId),...i}))}',
 '../model-config/server':`const config={publicModels:[{id:'image-a',enabled:true,visible:true,modality:'image',target:{type:'upstream'}}],upstreamModels:[{id:'up',providerId:'provider',parameterMap:{imagegen:{pixelSize:'size'}},capabilities:{}}],providers:[{id:'provider',protocol:'openai-images'}]};export async function getModelAdministration(){return{repo:{current:async()=>({version:117,config})},billing:{current:async()=>({version:8})}}}`,
 '../model-config/runtime':`export function simulateModel(m,b,id,facts){__fixture.simulations.push(facts);return{eligible:__fixture.allowed&&!__fixture.allowed.includes(facts.ratio)?[]:[{upstreamId:'up'}],excluded:[]}}`,
 '../model-config/tool-scope':`export function assertToolScope(){};export function featureDefaultModel(){return'image-a'}`,
 '../mock-data':`export const MAX_GENERATION_DIMENSION=4096;export function resolutionForLongSide(){return'1K'}`,
 '../image-model-routing':`export function routeImageModel(id){return id}`,
 '../billing/server':`export async function quoteForActor(owner,facts){__fixture.quotes.push(facts);return{tariff:{pricing:{mode:'fixed'}},requestedCredits:6}}`,
 '../model-config/context':`export async function runExecutionBundle(context,fn){return fn()}`,
 '../image-skills/server':`export async function resolveImageSkill(){return undefined}`,
 './parameters':`export function mapImagegenParameters(){return{}};export function imagegenWireRequest(request){return request}`,
 './capabilities':`export function publishedImagegenCapabilities(){return{}}`,
 '../feature-access/server':`export async function userFeaturePolicy(){return{}};export class FeatureAccessError extends Error{}`,
 '../feature-access/catalog':`export function allows(){return true}`,
 };
 const source=mode==='baseline'?(process.argv[3]||'output/imagegen-frame-choice-20261017/BASELINE-plan.ts'):undefined;
 if(source&&!fs.existsSync(source)){fs.mkdirSync(path.dirname(source),{recursive:true});fs.writeFileSync(source,require('node:child_process').execFileSync('git',['show','e4c4e356942b2ea1aefd6b0ad210dfdc2072d6bb:src/lib/imagegen/plan.ts']));}
 const {planImagegen,imagegenFingerprint}=await bundle('src/lib/imagegen/plan.ts',state,modules,source);
 const req={version:1,operationId:'1472c152-3faa-4f06-a047-815e3f34848f',entry:'agent',mode:'edit',prompt:'用产品替换参考海报主体，保持海报画幅',modelId:'image-a',parameters:{ratio:'auto',quality:'medium',resolution:'1K'},inputs:[{artworkId:'product',role:'edit-target'},{artworkId:'layout',role:'reference'}]};
 const plan=await planImagegen(req,'fixture@example.test');
 if(mode==='baseline'){assert.equal(plan.request.parameters.ratio,'auto');assert.equal(plan.steps[0].parameters.ratio,'auto');console.log('BASELINE_PLAN=REPRODUCED REQUEST=auto STEP=auto FIRST_INPUT=1500x1500 REFERENCE=750x1000 SUPPLIER_CALLS=0 EXIT=0');return;}
 let checks=0;const check=(ok,label)=>{assert(ok,label);checks++};
 check(plan.request.parameters.ratio==='3:4','resolved plan request');check(plan.steps[0].parameters.ratio==='3:4','frozen step');check(state.quotes.at(-1).ratio==='3:4','billing uses reference frame');check(state.simulations.at(-1).ratio==='3:4','model eligibility uses reference frame');check(plan.fingerprint===imagegenFingerprint(req),'caller fingerprint unchanged for retry');check(req.parameters.ratio==='auto','caller not mutated');check(plan.intent.requirements.find(r=>r.name==='ratio').value==='3:4','intent consistent');
 const missing=await planImagegen({...req,parameters:{quality:'medium',resolution:'1K'}},'fixture@example.test');check(missing.request.parameters.ratio==='3:4','missing ratio resolves reference');
 const reversed=await planImagegen({...req,inputs:[...req.inputs].reverse()},'fixture@example.test');check(reversed.request.parameters.ratio==='3:4','order independent');
 const {IMAGEGEN_USE_CASES}=await bundle('src/lib/imagegen/catalog.ts',state,{});
 for(const useCase of IMAGEGEN_USE_CASES.filter(item=>item.mode==='generate')){
  const referenceInsert={...req,mode:'generate',useCase:useCase.id,inputs:[{artworkId:'layout',role:'reference'},{artworkId:'product',role:'insert'}]};
  const inherited=await planImagegen(referenceInsert,'fixture@example.test');
  check(inherited.request.parameters.ratio==='3:4','unique reference for '+useCase.id);
  check(inherited.steps[0].parameters.ratio==='3:4'&&state.quotes.at(-1).ratio==='3:4','quote/frozen step for '+useCase.id);
  check(inherited.fingerprint===imagegenFingerprint(referenceInsert),'original identity for '+useCase.id);
  const reordered=await planImagegen({...referenceInsert,inputs:[...referenceInsert.inputs].reverse()},'fixture@example.test');
  check(reordered.request.parameters.ratio==='3:4','reference identity survives reorder for '+useCase.id);
 }
 const fixed=await planImagegen({...req,parameters:{...req.parameters,ratio:'9:16'}},'fixture@example.test');check(fixed.request.parameters.ratio==='9:16','explicit preserved');
 const style=await planImagegen({...req,useCase:'style-transfer'},'fixture@example.test');check(style.request.parameters.ratio==='1:1','style keeps edit target');
 state.inputs.push({...a,artworkId:'mask',role:'mask'});const masked=await planImagegen({...req,inputs:[...req.inputs,{artworkId:'mask',role:'mask'}]},'fixture@example.test');check(masked.request.parameters.ratio==='1:1','mask keeps target');
 state.inputs.push({...b,artworkId:'layout2'});const q=state.quotes.length;await assert.rejects(()=>planImagegen({...req,inputs:[...req.inputs,{artworkId:'layout2',role:'reference'}]},'fixture@example.test'),/多张参考图/);check(state.quotes.length===q,'ambiguity stops before quote');
 const single=await planImagegen({...req,inputs:[{...req.inputs[1],role:'edit-target'}]},'fixture@example.test');check(single.request.parameters.ratio==='3:4','single retains original');
 const pixels=await planImagegen({...req,parameters:{...req.parameters,width:768,height:1024}},'fixture@example.test');check(pixels.request.parameters.width===768&&pixels.request.parameters.ratio==='auto','explicit pixel controls preserved');
 const text=await planImagegen({...req,mode:'generate',inputs:[]},'fixture@example.test');check(text.request.parameters.ratio==='auto','text only unchanged');
 const frozen=await planImagegen(plan.request,'fixture@example.test');check(frozen.request.parameters.ratio==='3:4','frozen resolved input stable');
 state.allowed=['1:1'];const beforeUnsupported=state.quotes.length;await assert.rejects(()=>planImagegen(req,'fixture@example.test'),/没有已核实支持|没有支持本次生成参数的可用通道/);check(state.quotes.length===beforeUnsupported,'unsupported never falls back to square or quotes');delete state.allowed;
 state.inputs[1]={...b,width:751};const customFrame=await planImagegen(req,'fixture@example.test');check(customFrame.request.parameters.ratio==='751:1000','v2 accepts actual coprime reference instead of forcing square');state.inputs[1]=b;
 const inferredStyle=await planImagegen({...req,prompt:'风格迁移，保持产品主体'},'fixture@example.test');check(inferredStyle.request.parameters.ratio==='1:1','intent workflow keeps target frame');
 const local=await planImagegen({...req,mode:'postprocess'},'fixture@example.test');check(local.request.parameters.ratio==='auto'&&local.totalCredits===0,'local processing untouched');
 const core=await bundle('src/lib/imagegen/generation-core.ts',state,{
 './inputs':modules['./inputs'],
 '../native-auth':`export function signUserSession(){return'fixture'};export const USER_COOKIE='fixture-session'`,
 '../model-config/accepted-context':`export async function signAcceptedModelContext(){return'fixture'}`,
 './context':`export async function withImagegenStep(request,intent,fn){return fn()}`,
 '../db':`export async function listArtworksByIds(){return[]}`,
 '../../app/api/generate-image/route':`export async function POST(req){const form=await req.formData();__fixture.forms.push(form);return Response.json({ratio:form.get('ratio'),count:form.getAll('image').length})}`
 });
 const response=await core.submitGenerationCore(plan,'generate','fixture@example.test'),body=await response.json();check(body.ratio==='3:4'&&body.count===2,'actual adapter FormData ratio and references');check(state.forms[0].get('userPrompt')===req.prompt,'original user prompt unchanged');check(req.inputs[0].role==='edit-target','input roles unchanged');
 console.log(`SERVER_FRAME=PASS CASES=${checks} INPUT=1500x1500+750x1000 AUTO=3:4 QUOTE=3:4 FROZEN_STEP=3:4 ACTUAL_FORM=3:4 FINGERPRINT=ORIGINAL AMBIGUITY=BLOCKED SUPPLIER_CALLS=0 EXIT=0`);
})().catch(error=>{console.error(error);process.exitCode=1});
