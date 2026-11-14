// Real production React composer, mode picker, draft helper and contract validator.
// Own headless browser + intercepted local HTML; no server, account or supplier API.
require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const {build}=require('esbuild'),postcss=require('postcss'),tailwind=require('tailwindcss'),{chromium}=require('@playwright/test');
const root=process.cwd(),baseline=process.argv.includes('--baseline');
const out=path.resolve(process.env.VIDEO_MODE_UI_OUT||'E:/Workspace/naumi/output/canvas-video-modes-20261102/ui');
const variant=baseline?'baseline':'modified',dir=path.join(out,variant);fs.mkdirSync(dir,{recursive:true});
const oldCommit='2b990949421214802ae900e34f2baf6869f78443',repoRoot=process.env.VIDEO_MODE_REPO_ROOT||'E:/Workspace/naumi-canvas-video-modes-20261102';
const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {VideoCompactComposer} from '@/components/canvas/video/compact-composer';
import {catalogCapability,reconcileVideoSettings,validateVideoSettings} from '@/lib/video/legacy-client-settings';
const cap=(modes,limits)=>({sources:{},modes,limits,durationResolutionMap:[{durations:[5,10],resolutions:['720p']}],aspectRatios:['16:9','9:16'],requiresPrompt:true});
const models=[{providerId:'fixture',modelId:'text',label:'文生模型',definition:cap(['text'],{images:0,videos:0,audios:0})},
{providerId:'fixture',modelId:'image',label:'图像参考模型',definition:cap(['text','single_image','frames_required','reference'],{images:4,videos:0,audios:0})},
{providerId:'fixture',modelId:'omni',label:'多模态模型',definition:cap(['text','single_image','frames_required','reference'],{images:4,videos:2,audios:1})}];
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="#c6d9e8"/><circle cx="60" cy="45" r="23" fill="#6b93b1"/></svg>');
const choices=[1,2,3].map(n=>({id:'i'+n,nodeId:'image:fixture-'+n,kind:'image',title:'参考图 '+n,value:image,thumbnail:image,available:true})).concat([
{id:'video',nodeId:'video:fixture-motion',kind:'video',title:'运动视频',value:'https://fixture.test/motion.mp4',available:true},
{id:'audio',nodeId:'audio-node:audio-fixture-music',kind:'audio',title:'配乐音频',value:'https://fixture.test/music.wav',available:true}]);
const fresh=(model=models[0])=>reconcileVideoSettings({providerId:model.providerId,modelId:model.modelId,prompt:'清晨海岸，保留完整对白“现在开始”。',mode:'text'},catalogCapability(model)).config;
const asInput=choice=>({id:'input-'+choice.id,nodeId:choice.nodeId,kind:choice.kind,role:choice.kind==='video'?'source_video':choice.kind==='audio'?'source_audio':'reference',value:choice.value});
function App(){const [config,setConfig]=useState(fresh),[inputs,setInputs]=useState([]),[blocked,setBlocked]=useState(false),[count,setCount]=useState(1),[submitted,setSubmitted]=useState([]),[epoch,setEpoch]=useState(0);
const current=models.find(m=>m.modelId===config.modelId),invalid=validateVideoSettings(config,inputs,catalogCapability(current),choices);
window.fixtureState={config,inputs,blocked,submitted,invalid};
return <main><header><strong>Naumi</strong><span>视频节点 · 交互回归</span><button onClick={()=>{setConfig(fresh());setInputs([]);setEpoch(x=>x+1)}}>重置测试</button><button onClick={()=>setInputs(old=>old.some(i=>i.id==='input-i1')?old:[...old,asInput(choices[0])])}>连接图片节点</button><label><input type="checkbox" aria-label="锁定节点" checked={blocked} onChange={e=>setBlocked(e.target.checked)}/>锁定</label></header>
<section className="canvas-ui-light fixture-node"><div className="preview"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="14" height="14" rx="3"/><path d="m17 10 4-3v10l-4-3"/></svg></div>
<VideoCompactComposer key={epoch} config={config} inputs={inputs} models={models} choices={choices} nodeId="fixture-video" light blocked={blocked} onConfig={setConfig} onInputs={setInputs} onImportBusyChange={()=>{}} onAdvanced={()=>{}} count={count} onCount={setCount} onOptimize={async p=>p}
actions={<button aria-label="生成视频" disabled={blocked||!!invalid} onClick={()=>setSubmitted(s=>[...s,structuredClone({config,inputs})])} className="canvas-ui-primary rounded-lg px-3 py-2 text-xs">生成</button>}
feedback={invalid&&<p role="alert" className="px-4 pb-2 text-xs text-amber-700">{invalid}</p>}/></section></main>}
createRoot(document.getElementById('app')).render(<App/>);`;

async function main(){
 if(!baseline){require('./verify-video-ui-gate-exit.cjs');return;}

 const file=path.join(dir,'entry.tsx');fs.writeFileSync(file,entry);
 const plugins=baseline?[{name:'baseline-composer',setup(b){b.onLoad({filter:/compact-composer\.tsx$/},args=>({contents:cp.execFileSync('git',['show',oldCommit+':src/components/canvas/video/compact-composer.tsx'],{cwd:repoRoot,encoding:'utf8'}),loader:'tsx',resolveDir:path.dirname(args.path)}));}}]:[];
 // Evidence lives outside the test checkout: pin the renderer used by both the
 // fixture entry and product modules instead of inheriting a shared old React.
 const result=await build({entryPoints:[file],bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:path.join(dir,'app.js'),loader:{'.css':'local-css'},tsconfig:path.join(root,'tsconfig.json'),alias:{react:path.dirname(require.resolve('react/package.json')),'react-dom':path.dirname(require.resolve('react-dom/package.json'))},define:{'process.env.NODE_ENV':'"development"'},banner:{js:'var process={env:{},browser:true};'},metafile:true,plugins});
 const css=(await postcss([tailwind({...require(path.join(root,'tailwind.config.ts')).default,content:['./src/**/*.{ts,tsx}',file]})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css+'\n'+fs.readFileSync(path.join(dir,'app.css'),'utf8');
 const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><style>body{margin:0;background:#f5f7fa;color:#283448;font-family:Arial,"Microsoft YaHei",sans-serif}main{max-width:1040px;margin:auto;padding:28px}header{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:24px;font-size:12px}header strong{font-size:24px}header span{color:#758398}header button{padding:6px 8px;background:white;border:1px solid #dce4ed;border-radius:7px}header label{margin-left:auto}.fixture-node{border:1px solid #dfe6ef;border-radius:16px;overflow:hidden;background:white;box-shadow:0 12px 30px #2030490a}.preview{height:290px;background:linear-gradient(130deg,#e6eef6,#f8fafc);display:flex;align-items:center;justify-content:center;color:#9aacbd}[data-composer-body]{padding:16px}[data-composer-footer]{padding:12px}@media(max-width:600px){main{padding:12px}.preview{height:210px}header span{display:none}}</style></head><body><div id="app"></div><script>window.fixtureApiRequests=0;window.fetch=()=>{window.fixtureApiRequests++;throw Error("No API transport in component fixture")}</script><script>'+fs.readFileSync(path.join(dir,'app.js'),'utf8').replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
 fs.writeFileSync(path.join(dir,'index.html'),html);
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage();
 const errors=[],external=[],checks=[],pass=name=>{checks.push(name);console.log('UI_CHECK='+name)};
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',route=>{if(route.request().url()==='http://video-mode.fixture/')return route.fulfill({contentType:'text/html',body:html});external.push(route.request().url());return route.abort();});
 const state=()=>page.evaluate(()=>window.fixtureState),pick=async(label,option)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('listbox',{name:label,exact:true}).getByRole('option',{name:option,exact:true}).click();};
 const add=async(name)=>{await page.getByRole('button',{name:'添加引用',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();};
 const reset=async()=>{await page.getByRole('button',{name:'重置测试',exact:true}).click();await page.waitForFunction(()=>window.fixtureState.config.modelId==='text'&&window.fixtureState.inputs.length===0);};
 try{
  await page.goto('http://video-mode.fixture/');await page.getByTestId('video-compact-composer').waitFor();
  const original=(await state()).config.prompt;
  await page.getByRole('combobox',{name:'视频生成模式',exact:true}).click();
  const labels=await page.getByRole('listbox',{name:'视频生成模式',exact:true}).getByRole('option').allTextContents();
  if(baseline){
   assert.deepEqual(labels,['文生视频']);await page.keyboard.press('Escape');await pick('视频模型','图像参考模型');await add('参考图 1');
   assert.equal((await state()).config.mode,'text');assert.equal((await state()).inputs.length,1);assert.equal(await page.getByRole('button',{name:'生成视频',exact:true}).isDisabled(),true);
   await page.screenshot({path:path.join(out,'video-mode-baseline.png'),fullPage:true});
   console.log('VIDEO_MODE_UI=REPRODUCED CHECKS=3 CURRENT_MODEL_HIDES_MODES=1 IMAGE_ATTACH_STAYS_TEXT=1 API_SUBMISSIONS=0 SUPPLIER_CALLS=0');
   fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({result:'REPRODUCED',labels,config:(await state()).config,errors,external,apiSubmissions:0},null,2));return;
  }
  assert.deepEqual(labels,['文生视频','图生视频','首尾帧','图片参考','全能参考']);pass('all_five_modes_discoverable_from_text_only_model');
  await page.screenshot({path:path.join(out,'video-mode-menu-desktop.png'),fullPage:true});
  await page.getByRole('option',{name:'图生视频',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'选择视频模型',exact:true});await dialog.waitFor();
  assert.equal((await state()).config.modelId,'text');assert.equal((await state()).config.mode,'text');assert.equal((await state()).config.prompt,original);
  await page.getByRole('button',{name:'取消切换模型',exact:true}).click();assert.equal((await state()).config.modelId,'text');pass('opening_and_cancelling_never_changes_model_or_prompt');
  await pick('视频生成模式','图生视频');await dialog.getByRole('button',{name:'图像参考模型',exact:true}).click();
  assert.equal((await state()).config.modelId,'image');assert.equal((await state()).config.mode,'single_image');assert.equal((await state()).config.prompt,original);pass('explicit_supported_model_selection_applies_intent');
  await pick('视频生成模式','文生视频');await add('参考图 1');assert.equal((await state()).config.mode,'single_image');assert.equal((await state()).inputs[0].role,'first_frame');assert.equal((await state()).invalid,null);
  await page.getByRole('button',{name:'生成视频',exact:true}).click();assert.equal((await state()).submitted.length,1);pass('image_attach_selects_supported_same_model_mode_and_validates');
  await pick('视频生成模式','首尾帧');assert.equal((await state()).inputs.length,1);assert.ok((await state()).invalid);await add('参考图 2');assert.deepEqual((await state()).inputs.map(x=>x.role),['first_frame','last_frame']);assert.equal((await state()).invalid,null);pass('first_last_frames_keep_sources_and_validate_required_pair');
  await pick('视频生成模式','图片参考');assert.equal((await state()).config.mode,'reference');assert.deepEqual((await state()).inputs.map(x=>x.role),['reference','reference']);assert.equal((await state()).invalid,null);pass('image_reference_maps_to_existing_backend_mode');
  const priorInputs=(await state()).inputs;await pick('视频生成模式','全能参考');assert.equal((await state()).config.modelId,'image');await dialog.getByRole('button',{name:'多模态模型',exact:true}).click();
  assert.deepEqual((await state()).inputs,priorInputs);await add('运动视频');await add('配乐音频');assert.equal((await state()).config.mode,'reference');assert.equal((await state()).inputs.length,4);assert.equal((await state()).inputs[3].role,'source_audio');assert.equal((await state()).invalid,null);pass('omni_explicit_model_choice_preserves_images_and_native_audio_role');
  await page.screenshot({path:path.join(out,'video-mode-omni-desktop.png'),fullPage:true});
  await pick('视频生成模式','图片参考');assert.equal((await state()).inputs.length,4);assert.equal((await state()).config.mode,'reference');await page.getByText('图片参考仅使用图片，请移除视频或音频，或选择全能参考',{exact:true}).waitFor();pass('image_only_intent_never_discards_video_audio');
  await page.getByRole('checkbox',{name:'锁定节点'}).check();assert.equal(await page.getByRole('combobox',{name:'视频生成模式',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'添加引用',exact:true}).isDisabled(),true);await page.getByRole('checkbox',{name:'锁定节点'}).uncheck();pass('read_only_controls_preserved');
  await reset();await pick('视频模型','图像参考模型');await page.getByRole('button',{name:'连接图片节点',exact:true}).click();await page.waitForFunction(()=>window.fixtureState.config.mode==='single_image');assert.equal((await state()).inputs[0].role,'first_frame');pass('external_connection_adopts_same_model_image_mode');
  await reset();await page.setViewportSize({width:390,height:844});const mode=page.getByRole('combobox',{name:'视频生成模式',exact:true});await mode.focus();await mode.press('ArrowDown');await mode.press('End');await mode.press('Enter');await dialog.waitFor();assert.equal((await state()).config.modelId,'text');
  await page.keyboard.press('Tab');await page.keyboard.press('Enter');assert.equal((await state()).config.modelId,'omni');assert.equal((await state()).config.mode,'reference');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));pass('keyboard_mode_then_model_selection_390px_no_overflow');
  await add('参考图 1');assert.equal((await state()).invalid,null);await mode.click();await page.screenshot({path:path.join(out,'video-mode-menu-mobile.png'),fullPage:true});await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(await page.evaluate(()=>window.fixtureApiRequests),0);
  const sources=Object.keys(result.metafile.inputs).filter(p=>p.startsWith('src/')).map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}));
  fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({result:'PASS',checks,errors,external,apiSubmissions:0,supplierCalls:0,sources},null,2));
  console.log(`VIDEO_MODE_UI=PASS CHECKS=${checks.length} DESKTOP=1366 MOBILE=390 AUTO_MODEL_SWITCH=0 INPUT_LOSS=0 API_SUBMISSIONS=0 SUPPLIER_CALLS=0`);
 }catch(error){await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true});fs.writeFileSync(path.join(dir,'failure.json'),JSON.stringify({error:String(error),errors,external,checks},null,2));throw error;}finally{await context.close();await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
