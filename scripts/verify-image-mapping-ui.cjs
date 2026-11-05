// P1-b unified mapping dialog on the 103 GPT-Image-2.5 shape: two mapped apib channels with supplier
// metadata plus a stopped channel that never had a resolution policy. Real ModelEditor, local Chrome, no network.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {build}=require('esbuild'),{chromium}=require('playwright');
async function main(){
 const out=path.resolve(process.argv[2]||'output/image-mapping-ui');fs.mkdirSync(out,{recursive:true});
 const ids=['low','medium','high'],choices=ids.map(id=>({id,label:id,value:id}));
 const meta=(values,nativeValues)=>({id:'m',revision:1,mode:'map',values,nativeValues,source:'供应商正式参数文档',state:'documented',checkedAt:'2026-10-27T00:00:00Z',available:true,reason:''});
 const apib=id=>({id,model:'gpt-image-2.5-'+id,provider:'APIB Images',protocol:'openai-images',enabled:true,nativeResolutions:[],parameterMap:{qualityPolicy:{mode:'map',choices},resolutionPolicy:{mode:'map',field:'resolution',values:{'1K':'1k','2K':'2k','4K':'4k'}}}});
 const sources=[apib('sunburst'),apib('flare'),{id:'geeknow',model:'gpt-image-2.5-sunburst',provider:'Geeknow 备用生图通道',protocol:'openai-images',enabled:false,nativeResolutions:[],parameterMap:{qualityPolicy:{mode:'map',choices}}}];
 const row={id:'gpt-image-2',publicIds:['gpt-image-2'],displayResolutions:['1K','2K','4K'],
  qualityConfig:{choices:choices.map(({id,label})=>({id,label})),routes:[
   {upstreamId:'sunburst',mode:'map',values:{low:'low',medium:'medium',high:'high'},metadataDefaults:meta({low:'low',medium:'medium',high:'high'},['low','medium','high'])},
   {upstreamId:'flare',mode:'map',values:{low:'low',medium:'medium',high:'high'},metadataDefaults:null},
   {upstreamId:'geeknow',mode:'map',values:{low:'low',medium:'medium',high:'high'},metadataDefaults:meta({low:'low',medium:'medium',high:'high'},['low','medium','high'])}]},
  resolutionConfig:{routes:[
   {upstreamId:'sunburst',mode:'map',field:'resolution',values:{'1K':'1k','2K':'2k','4K':'4k'},metadataDefaults:meta({'1K':'1k','2K':'2k','4K':'4k'},['1k','2k','4k'])},
   {upstreamId:'flare',mode:'map',field:'resolution',values:{'1K':'1k','2K':'2k','4K':'4k'},metadataDefaults:null},
   {upstreamId:'geeknow',mode:'legacy',field:'size',values:{},metadataDefaults:meta({'1K':'1k','2K':'2k','4K':'2k'},['1k','2k'])}]},
  parameterSources:sources};
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {ModelEditor} from './src/components/admin/model-management/model-editor';function App(){const [saved,setSaved]=React.useState(null);return <main><h1>图片参数映射</h1><ModelEditor editor={{kind:"mapping",row:${JSON.stringify(row)}}} state={{rows:[${JSON.stringify(row)}],providers:[],candidates:[],catalogs:[]}} locked={false} busy={false} error="" refreshing={[]} onRefresh={()=>{}} onChange={()=>{}} operation={(action,fields)=>({action,id:"fixture-map",expectedVersion:117,...fields})} onPublish={async value=>{setSaved(value)}}/><output>{saved?JSON.stringify(saved):''}</output></main>}createRoot(document.getElementById('root')).render(<App/>);`;
 await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',outfile:path.join(out,'fixture.js'),jsx:'automatic',loader:{'.css':'css'},define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}});
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><style>body{margin:0;background:#f4f7fb;color:#172033;font:14px system-ui}main{max-width:800px;margin:16px auto;background:white;border:1px solid #e2e8f0;border-radius:12px}h1{font-size:20px;margin:24px}fieldset{border:0;min-width:0}output{display:block;overflow-wrap:anywhere;margin:16px}input,select{max-width:100%}</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const errors=[],network=[],checks=[];
 try{const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));await p.route(/^https?:/,r=>{network.push(r.request().url());return r.abort();});
  for(const width of [1440,390]){
   await p.setViewportSize({width,height:1080});await p.goto(pathToFileURL(path.join(out,'index.html')).href);
   const save=p.getByRole('button',{name:'保存映射并生效'});await p.getByLabel('sunburst 4K映射').waitFor();
   assert.ok(await save.isEnabled(),'a stopped channel without a resolution policy no longer blocks saving');
   const stopped=p.locator('details',{has:p.locator('summary',{hasText:'已停用通道（1）'})});assert.equal(await stopped.getAttribute('open'),null,'stopped channel folded');
   assert.equal(await p.getByLabel('geeknow分辨率处理').inputValue(),'legacy','legacy channel shown as 沿用协议');
   const supplierText=await p.locator('section',{has:p.getByLabel('sunburst 4K映射')}).innerText();assert.ok(supplierText.includes('供应商资料：质量 low / medium / high · 分辨率 1k / 2k / 4k'),supplierText);assert.ok(supplierText.includes('2026-10-27'));
   assert.deepEqual(await p.locator('#sunburst-resolution-values option').evaluateAll(o=>o.map(x=>x.value)),['1k','2k','4k'],'supplier values offered as candidates');
   await p.getByLabel('sunburst 4K映射').fill('8k');assert.ok((await p.locator('section',{has:p.getByLabel('sunburst 4K映射')}).innerText()).includes('资料未列出 8k'),'mismatch hinted');
   assert.equal(await p.getByLabel('sunburst 4K映射').getAttribute('data-hint'),'true');assert.ok(await save.isEnabled(),'hint never blocks');
   await p.getByLabel('sunburst 4K映射').fill('4k');
   await p.locator('details > summary',{hasText:'已停用通道（1）'}).click();await p.getByLabel('geeknow按协议默认发送').check();
   await p.locator('section',{has:p.getByLabel('geeknow分辨率处理')}).getByRole('button',{name:'按资料填充空格'}).click();
   assert.equal(await p.getByLabel('geeknow分辨率处理').inputValue(),'map','fill switches the stopped channel to map');assert.equal(await p.getByLabel('geeknow 4K映射').inputValue(),'2k','library suggestion 4K->2k');assert.equal(await p.getByLabel('geeknow high映射').inputValue(),'high');
   await save.click();const result=JSON.parse(await p.locator('output').innerText());const byId=Object.fromEntries(result.mapping.routes.map(r=>[r.upstreamId,r]));
   assert.deepEqual(byId.sunburst.resolution.values,{'1K':'1k','2K':'2k','4K':'4k'});assert.equal(byId.sunburst.contract,null);
   assert.equal(byId.geeknow.contract,'conventional');assert.deepEqual(byId.geeknow.resolution.values,{'1K':'1k','2K':'2k','4K':'2k'});
   await p.reload();await p.getByLabel('sunburst 4K映射').waitFor();await save.click();const untouched=JSON.parse(await p.locator('output').innerText()).mapping.routes.find(r=>r.upstreamId==='geeknow');
   assert.equal(untouched.resolution,null,'saving without changes keeps the stopped channel on its protocol size');
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
   await p.screenshot({path:path.join(out,`mapping-${width}.png`),fullPage:true});checks.push({width,saveUnblocked:true,stoppedFolded:true,supplierFacts:true,hint:true,fill:'4K->2k'});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({checks,errors,network},null,2));
  console.log('IMAGE_MAPPING_UI=PASS WIDTHS=1440,390 STOPPED_LEGACY=NOT_BLOCKING STOPPED=FOLDED SUPPLIER_FACTS=VISIBLE CANDIDATES=DATALIST MISMATCH=HINT_ONLY FILL=LIBRARY PAYLOAD=EXACT PAGEERROR=0 NETWORK=0');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
