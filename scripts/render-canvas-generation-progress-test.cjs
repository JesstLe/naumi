/** Real production React component in Chromium; clock is controlled, no suppliers. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {build}=require('esbuild'),{chromium}=require('@playwright/test');
const arg=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(arg('--source-root')||'.'),out=path.resolve(arg('--out')||'output/canvas-generation-progress');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GenerationPlaceholder}from'./src/components/canvas/generation-placeholder';
 let now=1000000,nextTimer=0;const timers=new Map();Date.now=()=>now;window.setInterval=fn=>{const id=++nextTimer;timers.set(id,fn);return id};window.clearInterval=id=>timers.delete(id);
 const roots=new Map();window.show=(props,id='primary')=>{if(!roots.has(id)){const el=document.createElement('div');el.id=id;el.className='card';document.getElementById('app').append(el);roots.set(id,createRoot(el));}flushSync(()=>roots.get(id).render(<GenerationPlaceholder {...props}/>));};
 window.tick=ms=>{now+=ms;flushSync(()=>{for(const fn of timers.values())fn()});};window.clock=()=>now;`;
 const result=await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,outfile:'bundle.js',platform:'browser',jsx:'automatic',alias:{'@':path.join(root,'src')},nodePaths:[path.resolve(__dirname,'../node_modules')],loader:{'.css':'local-css'},plugins:[{name:'locale-port',setup(b){b.onResolve({filter:/locale-context$/},()=>({path:'locale',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useI18n=()=>({locale:window.fixtureLocale||"zh"})'}));}}]});
 const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true}),checks=[],samples=[],errors=[];
 const page=await browser.newPage({viewport:{width:900,height:600},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 const value=async(id='primary')=>Number(await page.locator('#'+id+' [role=progressbar]').getAttribute('aria-valuenow'));
 const show=props=>page.evaluate(props=>window.show(props),props);
 const record=async name=>{const p=await value();samples.push({name,percent:p});return p;};
 const pass=name=>{checks.push(name);console.log('PASS '+name);};
 try{
  await page.setContent(`<meta charset="utf-8"><style>body{margin:24px;background:#f6f8fc;font-family:Arial}#app{display:flex;gap:20px}.card{width:300px;height:300px;background:white;border:1px solid #dfe6f2;border-radius:12px;overflow:hidden}${css}</style><div id="app"></div>`);await page.addScriptTag({content:js});
  let props={taskId:'attempt-a',stage:'preparing',startedAt:1000000,count:3};await show(props);await page.evaluate(()=>window.tick(4000));let before=await record('preparing');
  props={...props,stage:'queued'};await show(props);assert.ok(await record('queued')>=before);await page.evaluate(()=>window.tick(180000));before=await record('long-queue');
  await page.screenshot({path:path.join(out,'BEFORE_ADMISSION.png')});
  props={...props,stage:'generating',startedAt:await page.evaluate(()=>window.clock())};await show(props);const active=await record('admitted');
  await page.screenshot({path:path.join(out,'AFTER_ADMISSION.png')});
  console.log('ADMISSION_SEQUENCE='+JSON.stringify(samples));assert.ok(active>=before,`same task regressed at admission: ${before}% -> ${active}%`);assert.ok(active<99,'queue wait never becomes completed generation');pass('same task preparing/queue/admission never resets displayed progress');
  for(let i=0;i<35;i++){await page.evaluate(()=>window.tick(1000));const p=await value();assert.ok(p>=before,'monotonic timer');assert.ok(p<=99);before=p;}
  assert.ok(before>=90&&before<99);await page.evaluate(()=>window.tick(90000));assert.equal(await value(),99);pass('fast front/middle, slow above 90, then holds at 99 until actual completion');
  props={...props,stage:'queued',startedAt:await page.evaluate(()=>window.clock())};await show(props);assert.equal(await value(),99);pass('late lower-stage receipt and refreshed stage clock do not rewind');
  props={...props,stage:'saving',startedAt:await page.evaluate(()=>window.clock())-40000,completed:2};await show(props);assert.ok(await value()>=99);assert.ok((await page.locator('#primary').innerText()).includes('2/3'));pass('saving and real multi-image count retained');
  props={taskId:'attempt-b',stage:'preparing',startedAt:await page.evaluate(()=>window.clock()),count:1};await show(props);assert.ok(await value()<20);pass('new attempt on same node resets progress');
  await page.evaluate(()=>window.tick(40000));await show({...props,stage:'generating'});assert.ok(await value()>=90);
  await page.evaluate(()=>{const t=window.clock();window.show({taskId:'attempt-c',stage:'generating',startedAt:t});window.show({taskId:'parallel',stage:'queued',startedAt:t},'parallel');});assert.ok(await value()<20);const other=await value('parallel');assert.ok(other<20);pass('new identity resets even at identical timestamps; parallel nodes stay independent');
  await show({stage:'generating',startedAt:1000000});assert.ok(await value()>=90);await show({stage:'generating',startedAt:await page.evaluate(()=>window.clock())});assert.ok(await value()<20);pass('legacy callers without task identity still reset by start time');
  await show({...props,taskId:'failed',failure:{kind:'uncertain',message:'查询原任务'}});assert.equal(await page.getByTestId('generation-failure').count(),1);assert.equal(await page.locator('#primary [role=progressbar]').count(),0);pass('failure is not masked as running or completed');
  await page.evaluate(()=>{window.fixtureLocale='en';window.show({taskId:'english',stage:'queued',startedAt:window.clock()-200000});});assert.ok((await page.locator('#primary').innerText()).includes('no need to resubmit'));pass('English and accessibility retained');
  await page.locator('#primary').evaluate(el=>{el.style.width='180px';el.style.height='180px';el.style.containerType='size';});assert.ok(await page.locator('#primary').evaluate(el=>el.scrollHeight<=el.clientHeight));await page.screenshot({path:path.join(out,'COMPACT.png')});
  assert.deepEqual(errors,[]);pass('compact layout and zero browser page errors');
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,samples,errors,actualProductionReact:true,backend:'none',supplierCalls:0},null,2));
  console.log('COMPONENT_DYNAMIC=PASS CHECKS='+checks.length+' MONOTONIC=PASS RESET=PASS ACTUAL_REACT=1 SUPPLIER=0');
 }catch(error){await page.screenshot({path:path.join(out,'FAILURE.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'FAIL',error:String(error),checks,samples,errors},null,2));throw error;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
