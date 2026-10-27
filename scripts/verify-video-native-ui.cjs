const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const loadConfig = require('tailwindcss/loadConfig');
const { chromium } = require('@playwright/test');
const mode = process.argv[2] || 'MODIFIED', root = path.resolve(process.argv[3] || '.');
const out = path.resolve(process.argv[4] || 'output/video-native-ui'), modified = mode === 'MODIFIED';
const abs = file => JSON.stringify(path.join(root, file).replaceAll('\\', '/'));
const source = `
 import React, {useState} from 'react';import {createRoot} from 'react-dom/client';
 import {VideoCompactComposer} from ${abs('src/components/canvas/video/compact-composer.tsx')};
 import {VideoSettingsFields} from ${abs('src/components/canvas/video/settings-fields.tsx')};
 import {compileVideoPrompt} from ${abs('src/lib/video/prompt.ts')};
 import {validateVideoSettings} from ${abs('src/lib/video/client-settings.ts')};
 import {buildVideoCreate} from ${abs('src/lib/video/providers/wire.ts')};
 const cap={sources:{modes:'admin'},modes:['reference','single_image','frames_required','text'],durationResolutionMap:[{durations:[5,10],resolutions:['720p','1080p']}],aspectRatios:['16:9','9:16'],audio:'optional',supportsNegativePrompt:true,supportsWatermark:true,supportsCamera:true,supportsFirstFrame:true,supportsLastFrame:true,limits:{images:8,videos:2,audios:2},providerOptions:{seed:{type:'integer',minimum:0,maximum:99999},cameraFixed:{type:'boolean'},characterOrientation:{type:'enum',values:['image','video']},serviceTier:{type:'enum',values:['default','flex']}}};
 const models=[{providerId:'managed-video',modelId:'fixture-video',id:'fixture-video',label:'Fixture video',definition:cap}];
 const pixel='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#edf0f7"/><rect x="32" y="14" width="32" height="66" rx="7" fill="#a3b6ca"/></svg>');
 const choices=[{id:'a',nodeId:'a',kind:'image',title:'产品正面',value:pixel,thumbnail:pixel,available:true},{id:'b',nodeId:'b',kind:'image',title:'产品背面',value:pixel,thumbnail:pixel,available:true},{id:'pending',nodeId:'pending',kind:'video',title:'待完成片段',value:'',available:false},{id:'v',nodeId:'v',kind:'video',title:'运镜片段',value:'https://fixture.test/v.mp4',available:true},{id:'t',nodeId:'t',kind:'text',title:'镜头文字',value:'原文对白保持完整',available:true}];
 const initialInputs=choices.slice(0,2).map(c=>({id:'ref-'+c.id,nodeId:c.nodeId,kind:c.kind,role:'reference',value:c.value}));
 const initialConfig={providerId:'managed-video',modelId:'fixture-video',mode:'reference',prompt:'对比 {{ref 1}} 与 {{ref 2}}，保持产品一致。',durationSeconds:5,resolution:'720p',aspectRatio:'16:9',generateAudio:false,providerOptions:{seed:0,cameraFixed:false,serviceTier:'flex'}};
 function App(){
 const [config,setConfig]=useState(initialConfig),[inputs,setInputs]=useState(initialInputs),[advanced,setAdvanced]=useState(false),[readOnly,setReadOnly]=useState(false),[count,setCount]=useState(1),[version,setVersion]=useState(0),[saved,setSaved]=useState(false);
 const invalid=validateVideoSettings(config,inputs,cap,choices);
 const state=()=>{let compiled,error;try{compiled=compileVideoPrompt(config.prompt,inputs).prompt}catch(e){error=e.message}return {config,inputs,compiled,error,count}};
 window.__state=state;window.__configure=(value={})=>{setReadOnly(!!value.readonly);window.__locale=value.english?'en':'zh';setVersion(n=>n+1);setAdvanced(false)};
 window.__reset=()=>{setConfig(structuredClone(initialConfig));setInputs(structuredClone(initialInputs));setAdvanced(false);setReadOnly(false);window.__locale='zh';setVersion(n=>n+1)};
 window.__restore=()=>{const value=JSON.parse(localStorage.getItem('fixture-video'));setConfig(value.config);setInputs(value.inputs);setSaved(false)};
 return <main className="canvas-ui-light min-h-screen bg-[#f4f6f9] px-3 py-8"><section style={{maxWidth:680,margin:'0 auto'}} className="canvas-ui-surface overflow-hidden rounded-2xl border p-4"><VideoCompactComposer key={version} config={config} inputs={inputs} models={models} choices={choices} nodeId="node" light blocked={readOnly}
  onConfig={value=>{setSaved(false);setConfig(value)}} onInputs={value=>{setSaved(false);setInputs(value)}} count={count} onCount={setCount} onImportBusyChange={()=>{}}
  onAdvanced={()=>setAdvanced(true)} advancedOpen={advanced} onCloseAdvanced={()=>setAdvanced(false)} onOptimize={async prompt=>prompt}
  advancedContent={<VideoSettingsFields hideComposerFields config={config} inputs={inputs} models={models} choices={choices} nodeId="node" readOnly={readOnly} onConfig={setConfig} onInputs={setInputs}/>}
  feedback={invalid?<p role="status" className="mb-2 text-xs text-amber-700">{invalid}</p>:null}
  actions={<><button type="button" aria-label="保存设置" disabled={readOnly} onClick={()=>{localStorage.setItem('fixture-video',JSON.stringify(state()));setSaved(true)}} className="canvas-ui-control rounded-lg px-3 py-2 text-xs">{saved?'已保存':'保存'}</button><button type="button" aria-label="生成视频" disabled={readOnly||!!invalid} onClick={()=>{
   const compiled=compileVideoPrompt(config.prompt,inputs).prompt;const request={...config,prompt:compiled,references:inputs.filter(x=>x.kind!=='text').map(x=>({...x,url:x.value,artworkId:x.nodeId}))};
   window.__wire=buildVideoCreate({provider:{id:'fixture',protocol:'ark',baseUrl:'https://fixture.test',videoProfile:'ark'},profile:'ark',request});
  }} className="canvas-ui-primary rounded-lg px-3 py-2 text-xs disabled:opacity-40">生成</button></>}/></section></main>;
 }createRoot(document.getElementById('root')).render(<App/>);
`;

async function main() {
 fs.mkdirSync(out,{recursive:true});
 const current=process.cwd();
 const bundle=await esbuild.build({stdin:{contents:source,loader:'tsx',sourcefile:'video-native-fixture.tsx',resolveDir:current},bundle:true,write:false,outfile:path.join(out,mode.toLowerCase()+'.js'),platform:'browser',format:'iife',jsx:'automatic',
  alias:{react:path.join(current,'node_modules/react'),'react-dom':path.join(current,'node_modules/react-dom')},nodePaths:[path.join(current,'node_modules')],
  tsconfigRaw:{compilerOptions:{baseUrl:root,paths:{'@/*':['./src/*']}}},plugins:[{name:'isolated-boundaries',setup(build){
   build.onResolve({filter:/^@\/components\/cached-image$/},()=>({path:'image',namespace:'fixture'}));
   build.onLoad({filter:/^image$/,namespace:'fixture'},()=>({contents:'import React from "react";export const CachedImage=props=><img {...props}/>;',loader:'tsx'}));
   build.onResolve({filter:/^\.\/use-byoc-catalog$/},()=>({path:'byoc',namespace:'fixture'}));
   build.onLoad({filter:/^byoc$/,namespace:'fixture'},()=>({contents:'export const useVideoByocCatalog=()=>({catalog:{workflows:[],endpoint:null},error:"",refresh:async()=>{}});',loader:'js'}));
   build.onResolve({filter:/^@\/lib\/i18n\/locale-context$/},()=>({path:'locale',namespace:'fixture'}));
   build.onLoad({filter:/^locale$/,namespace:'fixture'},()=>({contents:'import {videoEn} from '+abs('src/lib/i18n/video.ts')+';export const useI18n=()=>({locale:window.__locale||"zh",t:key=>videoEn[key.slice(6)]||key.slice(6)});',loader:'js',resolveDir:root}));
   build.onResolve({filter:/^@\/lib\/feature-access\/client$/},()=>({path:'policy',namespace:'fixture'}));
   build.onLoad({filter:/^policy$/,namespace:'fixture'},()=>({contents:'export const useFeatureAccess=()=>({can:()=>true});',loader:'js'}));
  }}]});
 const raw=source+['compact-composer.tsx','prompt-editor.tsx','settings-fields.tsx','settings-panel.tsx','reference-list.tsx','parameter-panel.tsx','form-controls.tsx'].map(file=>{const p=path.join(root,'src/components/canvas/video',file);return fs.existsSync(p)?fs.readFileSync(p,'utf8'):''}).join('\n')+fs.readFileSync(path.join(root,'src/components/canvas/composer-shell.tsx'),'utf8')+fs.readFileSync(path.join(root,'src/components/canvas/canvas-action-menu.tsx'),'utf8');
 const config=loadConfig(path.join(current,'tailwind.config.ts'));
 const css=await postcss([tailwind({...config,content:[{raw,extension:'tsx'}]})]).process(fs.readFileSync(path.join(root,'src/app/globals.css'),'utf8'),{from:path.join(root,'src/app/globals.css')});
 const html=path.join(out,mode.toLowerCase()+'.html'),js=bundle.outputFiles.find(file=>file.path.endsWith('.js')).text,moduleCss=bundle.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'';fs.writeFileSync(html,'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css.css+moduleCss+'</style><body style="margin:0;font-family:Arial,Microsoft YaHei,sans-serif"><div id="root"></div><script>'+js.replaceAll('</script','<\\/script')+'</script></body></html>');
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1100,height:760}}),errors=[],external=[];
 page.on('pageerror',error=>{errors.push(error.message);console.error('PAGE_ERROR='+error.message)});await page.route('**/*',route=>{if(/^https?:/.test(route.request().url())){external.push(route.request().url());return route.abort()}return route.continue()});
 const prompt=()=>page.getByLabel('视频描述',{exact:true}),state=()=>page.evaluate(()=>window.__state());
 const reset=async()=>{await page.evaluate(()=>window.__reset());await page.getByTestId('video-compact-reference').first().waitFor()};
 const advanced=async()=>{await page.getByRole('button',{name:'更多视频参数',exact:true}).click();await page.getByTestId('video-settings-panel').waitFor()};
 try{
  await page.goto(pathToFileURL(html).href);await page.waitForFunction(()=>typeof window.__state==='function');
  if(!modified){assert.ok((await prompt().inputValue()).includes('{{ref 1}}'));await advanced();assert.equal(await page.getByLabel('seed',{exact:true}).isVisible(),true);await page.screenshot({path:path.join(out,mode.toLowerCase()+'.png')});console.log(`${mode}=PASS RAW_REFERENCE_LABELS=PRESENT TECHNICAL_OPTIONS=VISIBLE PAGE_ERRORS=${errors.length} EXTERNAL_REQUESTS=${external.length}`);return}
  assert.equal(await prompt().inputValue(),'对比 @【产品正面】 与 @【产品背面】，保持产品一致。');
  assert.equal((await state()).config.prompt,'对比 {{ref 1}} 与 {{ref 2}}，保持产品一致。');
  await prompt().fill('围绕 @背');await page.getByRole('option',{name:'产品背面',exact:true}).click();
  assert.equal((await state()).inputs.length,2);assert.equal((await state()).config.prompt,'围绕 {{ref 2}}');
  await page.getByRole('button',{name:'引用素材',exact:true}).click();await page.getByRole('option',{name:'镜头文字',exact:true}).click();
  assert.equal((await state()).inputs.length,3);assert.equal((await state()).config.prompt,'围绕 {{ref 2}}{{ref 3}}');
  await advanced();
  assert.equal(await page.getByLabel('随机种子',{exact:true}).inputValue(),'0');
  assert.equal(await page.getByLabel('固定机位',{exact:true}).inputValue(),'false');
  assert.equal(await page.getByLabel('serviceTier',{exact:true}).isVisible(),false);
  await page.getByTestId('video-reference-row').nth(1).getByRole('button',{name:'上移引用2',exact:true}).click();
  assert.equal((await state()).inputs[0].nodeId,'b');assert.equal((await state()).config.prompt,'围绕 {{ref 1}}{{ref 3}}');
  await page.getByLabel('随机种子',{exact:true}).fill('7');await page.getByLabel('随机种子',{exact:true}).fill('0');
  assert.equal((await state()).config.providerOptions.seed,0);assert.equal((await state()).config.providerOptions.cameraFixed,false);assert.equal((await state()).config.providerOptions.serviceTier,'flex');
  await page.getByRole('button',{name:'关闭设置',exact:true}).click();
  assert.ok((await prompt().inputValue()).includes('@【产品背面】'));
  await page.getByRole('button',{name:'保存设置',exact:true}).click();const saved=await state();
  await page.reload();await page.waitForFunction(()=>typeof window.__restore==='function');await page.evaluate(()=>window.__restore());
  assert.deepEqual((await state()).config,saved.config);assert.deepEqual((await state()).inputs,saved.inputs);
  await page.getByRole('button',{name:'生成视频',exact:true}).click();const wire=await page.evaluate(()=>window.__wire);assert.ok(wire.body.content[0].text.includes('围绕 图片1参考文字1'));assert.equal(wire.body.generate_audio,false);assert.equal(wire.body.seed,0);assert.equal(wire.body.camera_fixed,false);
  await page.getByRole('button',{name:'移除引用1',exact:true}).click();assert.ok((await state()).config.prompt.includes('{{ref 0}}'));assert.equal(await page.getByRole('button',{name:'生成视频',exact:true}).isDisabled(),true);assert.ok((await state()).error.includes('已移除'));
  await reset();await prompt().fill('@');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal((await state()).config.prompt,'{{ref 2}}');
  await prompt().fill('普通内容');await page.keyboard.press('End');await page.keyboard.type('@');await page.keyboard.press('Escape');assert.equal(await page.getByRole('listbox',{name:'选择引用素材'}).count(),0);
  await reset();await advanced();await page.getByText('兼容参数',{exact:true}).click();assert.equal(await page.getByLabel('serviceTier',{exact:true}).inputValue(),'1');await page.getByLabel('serviceTier',{exact:true}).selectOption('0');assert.equal((await state()).config.providerOptions.serviceTier,'default');await page.getByRole('button',{name:'关闭设置',exact:true}).click();
  await page.screenshot({path:path.join(out,'modified-desktop.png')});
  await page.setViewportSize({width:390,height:844});await reset();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.getByRole('button',{name:'视频生成参数',exact:true}).click();const panel=page.getByTestId('video-parameter-panel');await panel.waitFor();const box=await panel.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);await page.locator('button[aria-label="关闭"]').click();await page.screenshot({path:path.join(out,'modified-mobile.png')});
  await page.evaluate(()=>window.__configure({readonly:true}));assert.equal(await prompt().getAttribute('readonly'),'');assert.equal(await page.getByRole('button',{name:'引用素材',exact:true}).isDisabled(),true);
  await page.evaluate(()=>window.__configure({english:true}));await page.getByLabel('Video prompt',{exact:true}).fill('@');assert.equal(await page.getByRole('listbox',{name:'Choose a reference'}).isVisible(),true);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('MODIFIED=PASS NAMED_AT=PASS SHARED_INPUTS=PASS REORDER=STABLE DELETE=BLOCKS_GENERATION SAVE_RELOAD=PASS REAL_WIRE=PASS ZERO_FALSE_UNKNOWN=PRESERVED MOBILE=PASS READONLY=PASS ENGLISH=PASS PAGE_ERRORS=0 EXTERNAL_REQUESTS=0');
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
