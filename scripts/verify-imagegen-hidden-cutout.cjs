// Real planner/selection/preparation/quotation; only I/O boundaries are fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {build} = require('esbuild');
const root = process.cwd();
const baseline = process.argv.includes('--baseline');
const quotedHeaderBaseline = process.argv.includes('--quoted-header-baseline');
const preparationSource = process.env.CUTOUT_PREPARATION_SOURCE;

async function main() {
  const state = {denied: false};
  const modules = {
    'src/lib/model-config/clients.ts': 'export function executionOpenAI(){throw Error("Unexpected supplier call")}',
    'src/lib/text-models.ts': 'export function selectedTextModel(){throw Error("Unexpected text fallback")}',
    'src/lib/image-model-legacy-catalog.ts': 'export function isNewApiFlowImageModel(){return false}',
    'src/platform/db/pool.ts': 'export const dbEnabled=true; export function getPool(){throw Error("Unexpected database access")}',
    'src/lib/payments/history.ts': 'export async function totalPaidCents(){return 0}',
    'src/lib/user-image-provider.ts': 'export async function getUserImageProvider(){return null}; export const upstreamUserImageModel=x=>x',
    'src/lib/settings.ts': 'export async function getOpenAISettings(){return {model:"image-a"}};export async function getCutoutSettings(){throw Error("Unexpected legacy fallback")}',
    'src/lib/image-model-catalog.ts': 'export async function getUserDefaultImageModel(){return null};export async function getImageModelCatalog(){return []}',
    'src/lib/billing/runtime.ts': 'export async function meteringFor(){return true};export function getBillingRuntime(){throw Error("Expected frozen billing snapshot")}',
    'src/lib/model-config/published.ts': 'export async function readPublishedModelSnapshot(){throw Error("Expected frozen model snapshot")}',
    'src/lib/model-config/availability.ts': 'export async function modelConfigurationEnabled(){return true}',
    'src/lib/model-config/execution-services.ts': 'export function getModelExecutionServices(){return {models:{current:async()=>__fixture.models,byVersion:async()=>__fixture.models},billing:{current:async()=>__fixture.billing,byVersion:async()=>__fixture.billing}}}',
    'src/lib/image-skills/server.ts': 'export async function resolveImageSkill(){return undefined}',
    'src/lib/canvas/image-version-store.ts': 'export async function assertCanvasRegeneration(){}',
    'src/lib/feature-access/repository.ts': 'export async function userFeaturePolicy(){return {}}; export class FeatureAccessError extends Error{}',
    'src/lib/feature-access/catalog.ts': 'export function allows(_p,id){return !(__fixture.denied&&id==="cutout")}',
    'src/lib/saas/creation-access.ts': 'export async function assertCurrentCreationFeature(){return undefined}',
    'src/lib/imagegen/inputs.ts': 'export async function readImagegenInputs(request){return request.inputs.map(i=>({...i,width:1024,height:1024}))}',
  };
  const entry = `export {planImagegen} from './src/lib/imagegen/plan';
    export {createModelExecutor} from './src/lib/model-config/execution';
    export {prepareImageOperation} from './src/lib/model-config/image-preparation';
    export {selectFeatureModel} from './src/lib/model-config/model-selection';
    export {managedBillingSelection} from './src/lib/model-config/billing-model';
    export {validatePreparedImage} from './src/lib/model-config/prepared-image-contract';
    export {creationToolArguments} from './src/lib/agent/creation-settings';
    export {fixtureModelConfig} from './scripts/model-config-unit-fixture';
    export {fixtureConfig} from './scripts/billing-unit-fixture';`;
  const result = await build({stdin:{contents:entry,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,packages:'external',plugins:[{name:'io-fixtures',setup(b){
    if(preparationSource)b.onLoad({filter:/[\\/]model-config[\\/]image-preparation\.ts$/},()=>({contents:fs.readFileSync(preparationSource,'utf8'),loader:'ts'}));
    b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
    b.onResolve({filter:/.*/},args=>{
      const candidate=args.path.startsWith('@/')?path.join(root,'src',args.path.slice(2)):args.path.startsWith('.')?path.resolve(args.resolveDir,args.path):'';
      const key=path.relative(root,candidate).replaceAll('\\','/')+'.ts';
      if(modules[key])return {path:key,namespace:'fixture'};
    });
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:modules[args.path]||'',loader:'ts'}));
  }}]});
  const module = {exports:{}};
  vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require,process:{env:{}},console,Buffer,URL,Request,Response,Headers,FormData,File,structuredClone,__fixture:state,setTimeout,clearTimeout});
  const api=module.exports;
  const config=api.fixtureModelConfig('https://fixture.example/v1','2f751158-e0e1-4c0f-8391-fbed8aa08e55');
  const cutout=structuredClone(config.upstreamModels[0]);cutout.id='cutout-up';cutout.model='cutout-wire';cutout.capabilities.transparent=true;cutout.capabilities.preserveIdentity=true;
  config.upstreamModels.push(cutout);
  config.publicModels.push({id:'image-cutout-verified',label:'Internal cutout',enabled:true,visible:false,modality:'image',target:{type:'upstream',id:cutout.id},toolScope:{features:['tool.cutout'],defaultFor:[]}});
  config.bindings['image.cutout']='image-cutout-verified';
  config.publicModels[0].toolScope={features:['image.generate','canvas.image'],defaultFor:['image.generate']};
  config.publicModels.push({...structuredClone(config.publicModels[1]),id:'visible-cutout',visible:true});
  state.models={version:153,digest:'0'.repeat(64),config};state.billing={version:8,config:api.fixtureConfig()};
  const req={version:1,operationId:'1472c152-3faa-4f06-a047-815e3f34848f',entry:'agent',mode:'generate',prompt:'Draw a product',output:{format:'png',background:'transparent'},parameters:{quality:'medium',resolution:'1K',ratio:'1:1'}};
  if(baseline){
    await assert.rejects(()=>api.planImagegen(req,'fixture@example.test'),e=>e.code==='MODEL_UNAVAILABLE'&&e.message==='所选模型不可用，请刷新模型列表后重试');
    console.log('BASELINE=REPRODUCED MODEL_UNAVAILABLE: 所选模型不可用，请刷新模型列表后重试 SUPPLIER_CALLS=0');return;
  }
  let checks=0;
  const check=(ok,label)=>{assert.ok(ok,label);checks++};
  const executor=api.createModelExecutor({runtime:{byVersion:async()=>state.models,prepareExecution:async()=>{throw Error('Unexpected router call')}},credentials:{read:async()=> 'fixture-only'},gateway:()=>({})});
  const plan=await api.planImagegen(req,'fixture@example.test');
  check(plan.steps.length===2,'transparent generation composes two steps');
  check(plan.steps[0].modelId==='image-a'&&plan.steps[1].modelId==='image-cutout-verified','default and hidden binding identities');
  for(const step of plan.steps){
    check(step.modelId===step.preparedImage.modelId&&step.modelId===step.billingQuote.facts.modelId,'prepared and quoted identity agree');
    check(step.preparedImage.modelVersion===153&&step.billingQuote.modelVersion===153,'frozen model version');
    check(api.validatePreparedImage(step.preparedImage,state.models,state.billing,step.preparedImage.feature,step.preparedImage.binding).modelId===step.modelId,'frozen execution contract');
    const execution=await executor.resolve({preparedImage:step.preparedImage,feature:step.preparedImage.feature,binding:step.preparedImage.binding,requestedModelId:step.modelId,snapshot:state.models,billing:state.billing,imageParameterPlans:step.billingQuote.imageParameterPlans});
    check(execution.publicModelId===step.modelId,'real executor accepts prepared hidden default');
    const resumed=await executor.describe(execution);
    check(resumed.frozen.publicModelId===step.modelId&&resumed.connection.wireModel===(step.operation==='cutout'?'cutout-wire':'wire-image-one'),'frozen execution resolves the correct supplier model');
  }
  check(plan.totalCredits===plan.steps.reduce((sum,s)=>sum+s.credits,0),'both steps priced exactly once');
  const multi=await api.planImagegen({...req,variants:3},'fixture@example.test');
  check(multi.steps.length===4&&multi.steps.slice(1).every(s=>s.billingQuote.facts.quantity===1),'one cutout per variant');
  const direct=await api.planImagegen({...req,mode:'edit',prompt:'Remove background',inputs:[{artworkId:'fixture-source',role:'edit-target'}]},'fixture@example.test');
  check(direct.steps.length===1&&direct.steps[0].modelId==='image-cutout-verified','standalone Agent cutout');
  const prep={path:'/api/cutout',binding:'image.cutout',feature:'tool.cutout',references:1,body:{quality:'medium',resolution:'1K',ratio:'1:1'}};
  check(api.prepareImageOperation(prep,state.models,state.billing).modelId==='image-cutout-verified','implicit default preparation');
  const quoted=direct.steps[0].billingQuote;
  check(api.prepareImageOperation({...prep,quote:quoted},state.models,state.billing).modelId==='image-cutout-verified','owner-bound quoted default remains implicit');
  const echoedQuote=()=>api.prepareImageOperation({...prep,quote:quoted,featureModel:'image-cutout-verified'},state.models,state.billing);
  if(quotedHeaderBaseline){
    assert.throws(echoedQuote,e=>e.code==='MODEL_UNAVAILABLE');
    console.log('QUOTED_HEADER_BASELINE=REPRODUCED MODEL_UNAVAILABLE HTTP409 BEFORE_SUPPLIER=YES');return;
  }
  check(echoedQuote().modelId==='image-cutout-verified','browser echo of owner-bound default quote remains implicit');
  for(const body of [{model:'image-cutout-verified'},{modelId:'image-cutout-verified'}]){
    assert.throws(()=>api.prepareImageOperation({...prep,body:{...prep.body,...body},quote:quoted,featureModel:'image-cutout-verified'},state.models,state.billing),e=>e.code==='MODEL_UNAVAILABLE');checks++;
  }
  assert.throws(()=>api.prepareImageOperation({...prep,quote:quoted,featureModel:'visible-cutout'},state.models,state.billing),e=>e.code==='MODEL_UNAVAILABLE');checks++;
  const foreign=structuredClone(config.publicModels[1]);foreign.id='hidden-not-default';config.publicModels.push(foreign);
  assert.throws(()=>api.prepareImageOperation({...prep,quote:{...quoted,facts:{...quoted.facts,modelId:'hidden-not-default'}}},state.models,state.billing),e=>e.code==='MODEL_UNAVAILABLE');checks++;
  config.publicModels.pop();

  check(api.prepareImageOperation({...prep,body:{...prep.body,model:'visible-cutout'}},state.models,state.billing).modelId==='visible-cutout','visible explicit tool choice preserved');
  const unavailable=e=>e.code==='MODEL_UNAVAILABLE';
  for(const id of ['image-cutout-verified','missing-model']){
    assert.throws(()=>api.prepareImageOperation({...prep,body:{...prep.body,model:id}},state.models,state.billing),unavailable);checks++;
    await assert.rejects(()=>api.managedBillingSelection({},'tool.cutout',id,state.models),unavailable);checks++;
    await assert.rejects(()=>executor.resolve({feature:'tool.cutout',binding:'image.cutout',requestedModelId:id,snapshot:state.models,billing:state.billing}),unavailable);checks++;
  }
  await assert.rejects(()=>executor.resolve({preparedImage:{...plan.steps[1].preparedImage,modelVersion:152},feature:'tool.cutout',binding:'image.cutout',snapshot:state.models,billing:state.billing}),e=>e.code==='EXECUTION_MISMATCH');checks++;
  config.publicModels[1].enabled=false;
  await assert.rejects(()=>api.planImagegen(req,'fixture@example.test'),/用途绑定无效|模型不可用/);checks++;
  config.publicModels[1].enabled=true;config.publicModels[1].toolScope.features=['canvas.image'];
  await assert.rejects(()=>api.planImagegen(req,'fixture@example.test'),/工具范围|当前工具/);checks++;
  config.publicModels[1].toolScope.features=['tool.cutout'];state.denied=true;
  await assert.rejects(()=>api.planImagegen(req,'fixture@example.test'),/抠图功能尚未授权/);checks++;state.denied=false;
  config.upstreamModels[0].capabilities.transparent=true;
  check((await api.planImagegen(req,'fixture@example.test')).steps.length===1,'native transparency skips cutout');
  check(api.creationToolArguments('generate_image',{model:'image-a'},{image:{}}).model==='image-a','smart is not a model ID');
  check(api.creationToolArguments('generate_image',{model:'other'},{image:{modelId:'image-a'}}).model==='image-a','user creation setting wins');
  console.log(`MODIFIED=PASS CHECKS=${checks} TRANSPARENT=generate+cutout DIRECT_CUTOUT=PASS EXPLICIT_HIDDEN=REJECTED QUOTE_PREPARED=IDENTICAL SUPPLIER_CALLS=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
