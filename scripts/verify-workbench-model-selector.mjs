import assert from 'node:assert/strict';
import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import {chromium} from 'playwright';
const mode=process.argv[2]||'modified',asset=path.resolve(process.argv[3]||'public/reference-workbench/native-bridge.js');
const suffixes=['three-four','landscape','four-three','square','portrait'];
const models=[{id:'gpt-image-2',label:'GPT-Image-2.5'},...suffixes.map(s=>({id:`gemini-3.0-pro-image-${s}`,label:'Nano Banana Pro'})),...suffixes.map(s=>({id:`gemini-3.1-flash-image-${s}`,label:'Nano Banana 2'})),...['portrait','landscape'].map(s=>({id:`imagen-4.0-generate-preview-${s}`,label:'Imagen-4'})),{id:'gpt-image-2.5-flare',label:'GPT'},{id:'gpt-image-2.5-sunburst',label:'GPT'},{id:'custom-portrait',label:'Custom'},{id:'custom-landscape',label:'Custom'}];
const server=http.createServer((req,res)=>{
 if(req.url==='/bridge.js'){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(asset));return;}
 if(req.url?.endsWith('/auth/status')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:'fixture'}));return;}
 if(req.url?.endsWith('/settings')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({models}));return;}
 res.setHeader('Content-Type','text/html');res.end('<html><head><script>window.__NAUMI_WORKBENCH__={supabaseUrl:"",supabaseAnon:""};if(!localStorage.getItem("init")){localStorage.setItem("naumi-reference:fixture:native-model","gemini-3.0-pro-image-portrait");localStorage.setItem("init","1")}</script></head><body><select id="active_provider_template"></select><script src="/bridge.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/batchshot/native/workbench`);await page.evaluate(()=>window.NaumiWorkbenchReady);
  const snapshot=await page.locator('select').evaluate(s=>({count:s.options.length,labels:[...s.options].map(o=>o.label),value:s.value}));
  const modified=mode==='modified';assert.equal(snapshot.count,modified?9:18);assert.equal(snapshot.labels.filter(l=>l==='Nano Banana Pro').length,modified?1:5);
  assert.equal(snapshot.labels.filter(l=>l==='Nano Banana 2').length,modified?1:5);assert.equal(snapshot.labels.filter(l=>l==='Imagen-4').length,modified?1:2);
  assert.equal(snapshot.labels.filter(l=>l==='GPT').length,2);assert.equal(snapshot.labels.filter(l=>l==='Custom').length,2);assert.ok(snapshot.value.startsWith('gemini-3.0-pro-image-'));
  await page.selectOption('select','gpt-image-2.5-flare');await page.reload();await page.evaluate(()=>window.NaumiWorkbenchReady);assert.equal(await page.locator('select').inputValue(),'gpt-image-2.5-flare');assert.deepEqual(errors,[]);await context.close();
 }
 console.log(`${mode.toUpperCase()}=PASS OPTIONS${mode==='modified'?9:18} FAMILY_COUNTS=${mode==='modified'?'1,1,1':'5,5,2'} DESKTOP1440=1 MOBILE390=1 SAVED_SELECTION=1 RELOAD=1 ERRORS0=1`);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
