// Actual React controls and preview hook in headless Edge. Only transport is
// controlled; compiler/server/DB behavior is verified by the --ui PG suite.
require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {build}=require('esbuild'),{chromium}=require('@playwright/test');
const root=process.cwd(),out=path.resolve(process.env.VIDEO_COMPILER_UI_OUT||'E:/Workspace/naumi/output/video-compiler-ui-20261114/browser');
fs.mkdirSync(out,{recursive:true});
const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {VideoCompactComposer} from '@/components/canvas/video/compact-composer';
import {VideoContractFields} from '@/components/canvas/video/contract-fields';
import {useVideoCompilePreview} from '@/lib/video/use-compile-preview';
import {compileCanvasLink} from '@/lib/canvas/link-command';
import {selectVideoUiModel} from '@/lib/video/ui-draft';
import {activateFeatureCatalogIdentity} from '@/lib/model-config/feature-catalog-browser';
import {selectWorkspace} from '@/lib/saas/workspace-client';
const parameters={durationSeconds:{type:'integer',minimum:1,default:5},resolution:{type:'string',values:['4K','2K'],default:'4K'},aspectRatio:{type:'string',values:['16:9','9:16']},providerOptions:{type:'json'},custom:{type:'string'}};
const contract={version:1,modelVersion:3,modelDigest:'a'.repeat(64),policyRevision:0,defaults:{ordinaryImage:'single_image'},operations:['text','single_image','reference','frames_required'].map(intent=>({intent,parameters}))};
const models=['A','B'].map(label=>({label,providerId:'managed-video',modelId:label,definition:{sources:{},modes:['text'],limits:{images:0}},execution:contract}));
const choices=[1,2].map(n=>({id:'i'+n,nodeId:'image-'+n,kind:'image',title:'参考图 '+n,value:'/media/image-'+n+'.png',available:true}));
window.pending=[];window.reply=(index,kind='ok')=>{const r=window.pending[index];if(!r||r.done)throw Error('invalid reply');r.done=true;
const body=kind==='unavailable'?{error:'fixture network failure'}:kind==='invalid'?{ok:false,diagnostics:[{category:'mapping',code:'INPUT_INTENT_NOT_MAPPABLE',field:'inputs',reason:'素材用途没有映射',actionable:'调整用途'}]}:{ok:true,value:{draftRevision:r.body.draftRevision,planDigest:String(index%10).repeat(64),modelVersion:kind==='mismatch'?99:r.version,modelDigest:r.digest,publicModelId:r.body.modelId,intent:r.body.draft.inputs.length>1?'reference':r.body.draft.inputs.length?'single_image':'text',requestedParameters:r.body.draft.parameters,effectiveParameters:{resolution:'2K'},billingFacts:{durationSeconds:5,resolution:'2K'}}};
r.resolve(new Response(JSON.stringify(body),{status:kind==='unavailable'?503:kind==='invalid'?422:200,headers:{'content-type':'application/json'}}));};
const request=(url,init)=>new Promise(resolve=>window.pending.push({url,body:JSON.parse(init.body),version:window.fixtureState.model.execution.modelVersion,digest:window.fixtureState.model.execution.modelDigest,resolve,done:false}));
function App(){const [config,setConfig]=useState({modelId:'A',providerId:'managed-video',mode:'text',prompt:'保留提示词',parameters:{durationSeconds:5,resolution:'4K',custom:'keep'}}),[inputs,setInputs]=useState([]),[email,setEmail]=useState('a@fixture.test'),[revision,setRevision]=useState(0),[version,setVersion]=useState(3),[blocked,setBlocked]=useState(false),[node,setNode]=useState(true);
const model={...models.find(m=>m.modelId===config.modelId),execution:{...contract,modelVersion:version}},catalog=models.map(m=>({...m,execution:model.execution}));
const preview=useVideoCompilePreview({email,model,config,inputs,node:node?{id:'video-fixture',revision}:undefined,request});
window.fixtureState={config,inputs,email,revision,model,status:preview.status,error:preview.error,value:preview.value};window.fixtureEdit=patch=>setConfig(c=>({...c,...patch}));
function wire(add,n=1){const node={id:'video-fixture',config,inputs};const action=compileCanvasLink({artworks:[],texts:[],videos:[node],pending:[],selected:[],choices,videoModels:catalog,locked:()=>false,productTitle:'',referenceLimit:'',cycleMessage:'',productMention:x=>x},{source:'image-'+n,target:node.id,add});if(action?.kind==='video-patch'){if(action.to.inputs)setInputs(action.to.inputs);if(action.to.config)setConfig(action.to.config);}}
return <main><nav><button onClick={()=>wire(true,1)}>连接一</button><button onClick={()=>wire(true,2)}>连接二</button><button onClick={()=>wire(false,1)}>断开一</button><button onClick={()=>wire(false,2)}>断开二</button>
<button onClick={()=>setInputs(old=>old.map((x,i)=>({...x,role:i?'last_frame':'first_frame'})))}>指定首尾</button>
<button onClick={()=>setConfig(c=>({...c,prompt:c.prompt+'改'}))}>改提示词</button><button onClick={()=>setConfig(c=>selectVideoUiModel(c,catalog[1]))}>切换模型</button><button onClick={()=>setEmail(x=>x.startsWith('a')?'b@fixture.test':'a@fixture.test')}>切换账号</button>
<button onClick={()=>selectWorkspace('tenant-fixture')}>切换空间</button><button onClick={()=>setRevision(x=>x+1)}>增加修订</button><button onClick={()=>setVersion(x=>x+1)}>发布模型</button><button onClick={()=>setNode(x=>!x)}>切换入口</button><button onClick={preview.retry}>重试预览</button><button onClick={()=>setBlocked(x=>!x)}>锁定</button></nav>
<div id='controls'><VideoContractFields contract={model.execution} config={config} inputs={inputs} onChange={setConfig} disabled={blocked}/></div>
<VideoCompactComposer config={config} inputs={inputs} models={catalog} choices={choices} nodeId='video-fixture' light blocked={blocked} onConfig={setConfig} onInputs={setInputs} onImportBusyChange={()=>{}} onAdvanced={()=>{}} count={1} onCount={()=>{}} onOptimize={async p=>p} actions={null} feedback={null}/><output>{preview.status}</output></main>}
createRoot(document.getElementById('root')).render(<App/>);`;
async function main(){
 const file=path.join(out,'entry.tsx');fs.writeFileSync(file,entry);
 const result=await build({entryPoints:[file],bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:path.join(out,'app.js'),loader:{'.css':'local-css'},tsconfig:path.join(root,'tsconfig.json'),alias:{react:path.dirname(require.resolve('react/package.json')),'react-dom':path.dirname(require.resolve('react-dom/package.json'))},define:{'process.env.NODE_ENV':'"development"'},banner:{js:'var process={env:{},browser:true};'},metafile:true});
 const html='<!doctype html><html><head><meta charset="utf-8"><style>body{background:#f8fafc;color:#1e293b;font-family:Arial}main{max-width:900px;margin:20px auto}nav{display:flex;flex-wrap:wrap}nav button{margin:4px;padding:6px}fieldset{border:1px solid #ccd5df;margin:12px;padding:12px}label{display:block}input,select,textarea{margin:6px;max-width:100%}</style></head><body><div id="root"></div><script>'+fs.readFileSync(path.join(out,'app.js'),'utf8').replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
 fs.writeFileSync(path.join(out,'index.html'),html);
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage();
 const checks=[],errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{if(route.request().url()==='http://video-compiler.fixture/')return route.fulfill({contentType:'text/html',body:html});network.push(route.request().url());return route.abort();});
 const state=()=>page.evaluate(()=>window.fixtureState),click=name=>page.getByRole('button',{name,exact:true}).click(),wait=()=>page.waitForTimeout(320),count=()=>page.evaluate(()=>window.pending.length),reply=(i,kind='ok')=>page.evaluate(([i,kind])=>window.reply(i,kind),[i,kind]);
 const pass=name=>{checks.push(name);console.log('UI_CHECK='+name);};
 const settle=async(kind='ok')=>{await wait();const i=await count()-1;await reply(i,kind);await page.waitForFunction(kind=>window.fixtureState.status===(kind==='ok'?'ready':kind==='invalid'?'invalid':'unavailable'),kind);};
 try{
  await page.goto('http://video-compiler.fixture/');await page.waitForFunction(()=>window.pending.length===1);
  await click('改提示词');assert.equal((await state()).status,'pending');await reply(0);assert.notEqual((await state()).status,'ready');await settle();pass('stale_success_ignored_even_when_transport_ignores_abort');
  const before=await count();await click('改提示词');await click('改提示词');await click('改提示词');await settle();assert.equal(await count(),before+1);pass('draft_edits_debounced_one_request');
  await click('连接一');await click('连接二');assert.deepEqual((await state()).inputs.map(x=>x.role),['reference','reference']);assert.equal((await state()).config.mode,'text');await settle();pass('ordinary_images_not_automatically_frames_or_capability_vetoed');
  await click('指定首尾');await settle();await click('断开一');assert.deepEqual((await state()).inputs.map(x=>x.role),['last_frame']);await settle();pass('link_removal_keeps_explicit_role');
  await page.getByRole('combobox',{name:'视频生成模式',exact:true}).click();await page.getByRole('option',{name:'首尾帧',exact:true}).click();assert.equal((await state()).config.intentPreference,'frames_required');await settle('invalid');
  const original=await state();await page.getByRole('combobox',{name:'视频模型',exact:true}).click();await page.getByRole('option',{name:'B',exact:true}).click();assert.equal((await state()).config.modelId,'B');assert.equal((await state()).config.prompt,original.config.prompt);assert.deepEqual((await state()).config.parameters,original.config.parameters);assert.deepEqual((await state()).inputs,original.inputs);assert.equal((await state()).config.intentPreference,'frames_required');await settle();pass('explicit_intent_and_all_inputs_parameters_survive_model_switch');
  const json=page.locator('#controls').getByRole('textbox',{name:'模型参数',exact:true});await json.fill('{');await json.pressSequentially(' "x": 1 }');assert.equal(await json.inputValue(),'{ "x": 1 }');assert.deepEqual((await state()).config.parameters.providerOptions,{x:1});await settle();pass('json_typing_keeps_raw_whitespace_and_parsed_draft');
  await json.fill('{incomplete');assert.equal((await state()).config.parameters.providerOptions,'{incomplete');await settle();pass('incomplete_json_kept_as_editable_draft');
  await click('改提示词');await settle('unavailable');assert.match((await state()).error,/fixture network failure/);await click('重试预览');await settle();pass('transient_error_retry_not_persistent_capability_downgrade');
  for(const name of ['切换账号','切换空间','增加修订','发布模型','切换入口']){
   await click('改提示词');await wait();const old=await count()-1;await click(name);await reply(old,'invalid');assert.equal((await state()).status,'pending');await settle();pass(name+'_invalidates_inflight_identity');
  }
  assert.equal(await page.evaluate(()=>window.pending.at(-1).url),'/api/video/compile-preview');pass('workbench_uses_same_hook_public_preview_entry');
  await click('改提示词');await settle('mismatch');assert.match((await state()).error,/视频配置已更新/);await click('重试预览');await settle();pass('published_model_mismatch_rejected_and_retryable');
  await page.evaluate(()=>window.fixtureEdit({parameters:{...window.fixtureState.config.parameters,resolution:'unmapped'}}));
  const resolution=page.locator('#controls').getByRole('combobox',{name:'视频分辨率',exact:true});assert.equal(await resolution.inputValue(),'current');assert.equal(await resolution.locator('option:checked').innerText(),'unmapped');await resolution.selectOption({label:'2K'});assert.equal((await state()).config.parameters.resolution,'2K');assert.equal((await state()).config.parameters.custom,'keep');await settle();pass('unmapped_value_visible_editable_no_sibling_reset');
  await click('锁定');assert.equal(await page.locator('#controls').getByRole('spinbutton',{name:'视频时长'}).isDisabled(),true);assert.equal(await page.getByRole('combobox',{name:'视频生成模式',exact:true}).isDisabled(),true);pass('read_only_controls_disabled');
  assert.deepEqual(errors,[]);assert(network.every(url=>url.includes('/media/image-')));pass('no_react_errors_no_supplier_or_generation_calls');
  const sources=Object.keys(result.metafile.inputs).filter(p=>p.startsWith('src/'));fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({checks,errors,network,sources,evidence:'actual React components/hook; controlled network transport; not full App browser'},null,2));
  console.log('VIDEO_COMPILER_UI=PASS CASES='+checks.length+' REAL_REACT=true REAL_HEADLESS_EDGE=true PAID_CALLS=0');
 }catch(error){fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),errors,checks,state:await state()},null,2));throw error;}finally{await context.close();await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
