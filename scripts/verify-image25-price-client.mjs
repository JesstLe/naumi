import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const baseline=process.argv.includes('--baseline');
const {outputFiles}=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';
 import {Image25PriceTable} from '@/components/admin/billing/image25-price-table';
 const root=createRoot(document.querySelector('#root'));root.render(<Image25PriceTable/>);window.fixtureUnmount=()=>root.unmount();`,loader:'tsx',resolveDir:process.cwd()},
 bundle:true,write:false,jsx:'automatic',platform:'browser',format:'iife',plugins:[{name:'isolated-session',setup(b){
 b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'auth',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function authHeader(){return {}}'}));
}}]});
const values=await build({stdin:{contents:`
 import {image25TablePayload,IMAGE25_BUDGET_FX} from './src/lib/model-config/image25-price-table';
 export const payload=image25TablePayload({...IMAGE25_BUDGET_FX,referenceOnly:false,modelVersion:9,rateMicros:'7250000',basis:'admin-rate',creditsPerCnyMicros:'12000000',rounding:'ceil'});
`,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {payload}=await import('data:text/javascript;base64,'+Buffer.from(values.outputFiles[0].contents).toString('base64'));
let browser,count=0,abortCount=0;
const held=[];
const finish=res=>{if(res&&!res.destroyed&&!res.writableEnded)res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(payload));};
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://fixture').pathname;
 if(path==='/api/admin/billing/image25-prices'){
  if(++count===1){finish(res);return;}
  held.push(res);res.once('close',()=>{if(!res.writableFinished)abortCount++;});return;
 }
 if(path==='/app.js'){res.writeHead(200,{'content-type':'text/javascript'}).end(outputFiles[0].contents);return;}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<!doctype html><div id="root"></div><script src="/app.js"></script>');
});
async function until(test){const end=Date.now()+3000;while(!test()){assert.ok(Date.now()<end,'fixture request did not reach expected state');await delay(20);}}
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext({acceptDownloads:true});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(4500);await page.goto(origin);
 await page.getByRole('table').waitFor();assert.equal(count,1);
 await page.getByLabel('分辨率',{exact:true}).selectOption('1k');
 await page.getByLabel('比例',{exact:true}).selectOption('1:1');
 await page.getByLabel('原生质量',{exact:true}).selectOption('medium');
 const cell=payload.rows.find(row=>row.resolution==='1k'&&row.ratio==='1:1').prices.medium.gold;
 assert.ok((await page.getByRole('table').textContent()).includes('¥'+cell.saleCny));
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'下载价格明细'}).click()]);
 const exported=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.equal(exported.conversion.modelVersion,9);assert.equal(exported.selectedPrices.length,1);
 assert.equal(exported.selectedPrices[0].saleCny,cell.saleCny);assert.equal(exported.liveBillingChanged,false);
 await page.getByLabel('显示币种',{exact:true}).selectOption('USD');
 assert.ok((await page.getByRole('table').textContent()).includes('$'+cell.saleUsd));assert.equal(count,1);
 await page.getByRole('button',{name:'刷新价格表'}).evaluate(button=>{button.click();button.click();});
 await until(()=>held.length===(baseline?2:1));
 await page.evaluate(()=>window.fixtureUnmount());
 if(baseline){assert.equal(abortCount,0);assert.equal(count,3);}
 else{await until(()=>abortCount===1);assert.equal(count,2);}
 console.log(baseline?'IMAGE25_PRICE_CLIENT_BASELINE=PASS CONCURRENT_REFRESH=2 UNMOUNT_ABORT=0 ACTUAL_REACT=1 BROWSER=1':
  'IMAGE25_PRICE_CLIENT=PASS INITIAL_GET=1 FILTER_EXPORT_GETS=0 EXPORT_FX_MATCH=1 REFRESH_SINGLE_FLIGHT=1 UNMOUNT_ABORT=1 ACTUAL_REACT=1 BROWSER=1');
}finally{
 for(const res of held)finish(res);
 await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
