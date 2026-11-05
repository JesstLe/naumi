// Real ModelEditor mapping dialog with the conventional contract switch; local Chrome, no network.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {build}=require('esbuild'),{chromium}=require('playwright');
async function main(){
 const out=path.resolve(process.argv[2]||'output/image-parameter-contract-ui');fs.mkdirSync(out,{recursive:true});
 // A newly connected channel: nothing mapped yet, no supplier metadata.
 const quality={mode:'map',choices:[{id:'medium',label:'标准'},{id:'high',label:'高'}]},resolution={mode:'map',field:'resolution',values:{}};
 const row={id:'image-a',publicIds:['image-a'],displayResolutions:['1K','2K','4K'],qualityConfig:{choices:quality.choices,routes:[{upstreamId:'u1',mode:'map',values:{}}]},resolutionConfig:{routes:[{upstreamId:'u1',...resolution}]},parameterSources:[{id:'u1',model:'fixture-image',provider:'第二供应商',protocol:'openai-images',nativeResolutions:[],parameterMap:{qualityPolicy:quality,resolutionPolicy:resolution}}]};
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {ModelEditor} from './src/components/admin/model-management/model-editor';function App(){const [saved,setSaved]=React.useState(null);return <main><h1>图片参数映射</h1><ModelEditor editor={{kind:"mapping",row:${JSON.stringify(row)}}} state={{rows:[${JSON.stringify(row)}],providers:[],candidates:[],catalogs:[]}} locked={false} busy={false} error="" refreshing={[]} onRefresh={()=>{}} onChange={()=>{}} operation={(action,fields)=>({action,id:"fixture-map",expectedVersion:7,...fields})} onPublish={async value=>{setSaved(value)}}/><output>{saved?JSON.stringify(saved):''}</output></main>}createRoot(document.getElementById('root')).render(<App/>);`;
 await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',outfile:path.join(out,'fixture.js'),jsx:'automatic',loader:{'.css':'css'},define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}});
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><style>body{margin:0;background:#f4f7fb;color:#172033;font:14px system-ui}main{max-width:800px;margin:16px auto;background:white;border:1px solid #e2e8f0;border-radius:12px}h1{font-size:20px;margin:24px}fieldset{border:0;min-width:0}output{display:block;overflow-wrap:anywhere;margin:16px}input,select{max-width:100%}</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const errors=[],network=[],checks=[];
 try{const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));await p.route(/^https?:/,r=>{network.push(r.request().url());return r.abort();});
  for(const width of [1440,390]){
   await p.setViewportSize({width,height:1080});await p.goto(pathToFileURL(path.join(out,'index.html')).href);
   const save=p.getByRole('button',{name:'保存映射并生效'}),toggle=p.getByLabel('u1按协议默认发送');await toggle.waitFor();
   assert.equal(await toggle.isChecked(),false,'new channel starts strict');assert.ok(await save.isDisabled(),'strict empty map cannot be saved');
   await toggle.check();assert.ok(await save.isEnabled(),'conventional empty map can be saved');
   assert.equal(await p.getByLabel('u1 4K映射').getAttribute('placeholder'),'留空保持协议原值');assert.equal(await p.getByLabel('u1 high映射').getAttribute('placeholder'),'留空发送 high');
   let preview=await p.locator('pre').innerText();assert.ok(preview.includes('"quality": "medium"'),preview);assert.ok(!preview.includes('"resolution"'),'empty 4K keeps protocol size');
   await p.getByLabel('u1 4K映射').fill('2k');preview=await p.locator('pre').innerText();assert.ok(preview.includes('"resolution": "2k"'),'4K override previewed');
   await save.click();const result=JSON.parse(await p.locator('output').innerText());const route=result.mapping.routes[0];
   assert.equal(result.action,'image-mapping');assert.equal(route.contract,'conventional');assert.deepEqual(route.resolution.values,{'4K':'2k'});assert.deepEqual(route.quality.choices.map(c=>c.value),[undefined,undefined]);
   await toggle.uncheck();assert.ok(await save.isDisabled(),'turning the switch off restores the strict rule');
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
   await toggle.check();await p.screenshot({path:path.join(out,`contract-${width}.png`),fullPage:true});checks.push({width,strictDisabled:true,conventionalSaved:true,override:'4K->2k'});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({checks,errors,network},null,2));
  console.log('IMAGE_PARAMETER_CONTRACT_UI=PASS WIDTHS=1440,390 EDITOR=ACTUAL STRICT_EMPTY=DISABLED CONVENTIONAL_EMPTY=SAVED OVERRIDE=4K->2k PAYLOAD=EXACT PAGEERROR=0 NETWORK=0');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
