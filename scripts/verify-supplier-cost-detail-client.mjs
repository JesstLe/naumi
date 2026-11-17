import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const baseline=process.argv.includes('--baseline');
const asset=await build({stdin:{contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {SupplierCostManager} from '@/components/admin/billing/supplier-cost-manager';
 createRoot(document.querySelector('#root')).render(<SupplierCostManager/>);
`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',platform:'browser',format:'iife',plugins:[{name:'isolated-session',setup(b){
 b.onResolve({filter:/^(next\/link|@\/lib\/supabase)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path==='next/link'?`import React from 'react';export default function Link(props){return React.createElement('a',props)}`:`export async function authHeader(){return {}}`}));
}}]});
const rows=['alpha','beta'].map(id=>({id,operation_id:id+'-operation',attempt_id:id+'-attempt',user_email:id+'@example.test',account_id:'fixture-account',provider_id:'fixture-provider',model:id+'-model',phase:id+'-stage',feature:'canvas.image',currency:'CNY',cost_status:'reported',amount_micros:'389',cny_micros:'389',state:'completed'}));
const detail=id=>({rows:rows.filter(row=>row.operation_id===id),billing:{charged_credits:1},feeReviews:[],outputs:[],adjustments:[]});
const send=(res,payload,status=200)=>{if(!res.destroyed&&!res.writableEnded)res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(payload));};
let browser,hold=new Set(['alpha-operation']),aborted=0;
const requests=[],held=[];
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname.startsWith('/api/admin/supplier-cost/operations/')){
  const id=decodeURIComponent(url.pathname.split('/').at(-1));requests.push(id);
  if(hold.has(id)){held.push({id,res});res.once('close',()=>{if(!res.writableFinished)aborted++;});}else send(res,detail(id));
  return;
 }
 if(url.pathname==='/api/admin/supplier-cost'){
  const view=url.searchParams.get('view');
  if(view==='accounts')send(res,{accounts:[]});else send(res,{rows,total:52,accounts:[{id:'fixture-account',label:'Fixture'}]});
  return;
 }
 if(url.pathname==='/app.js'){res.writeHead(200,{'content-type':'text/javascript'}).end(asset.outputFiles[0].contents);return;}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<!doctype html><div id="root"></div><script src="/app.js"></script>');
});
async function until(check,message){const end=Date.now()+3000;while(!check()){assert.ok(Date.now()<end,message);await delay(20);}}
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(4000);await page.goto(origin);
 const open=name=>page.getByRole('row').filter({has:page.getByText(name+'@example.test')}).getByRole('button',{name:'展开'});
 const dialog=page.getByRole('dialog',{name:'完整调用链'});
 if(baseline)await open('alpha').click();
 else await open('alpha').evaluate(button=>{button.click();button.click();});
 await until(()=>held.length===1,'first request did not start');
 await open('beta').click();await dialog.getByText('beta-stage',{exact:false}).waitFor();
 if(baseline){
  send(held[0].res,detail(held[0].id));
  await dialog.getByText('alpha-stage',{exact:false}).waitFor();
  assert.deepEqual(requests,['alpha-operation','beta-operation']);
  console.log('SUPPLIER_COST_DETAIL_BASELINE=PASS STALE_CHAIN_OVERRIDES_NEW=1 ACTUAL_REACT=1 BROWSER=1');
 }else{
  await until(()=>aborted===1,'stale chain request was not aborted');
  send(held[0].res,detail(held[0].id));
  assert.equal(await dialog.getByText('alpha-stage',{exact:false}).count(),0);
  assert.deepEqual(requests,['alpha-operation','beta-operation']);
  await dialog.getByRole('button',{name:'关闭'}).click();await dialog.waitFor({state:'hidden'});
  await open('alpha').click();await until(()=>held.length===2,'detail for tab switch did not start');
  await page.getByRole('button',{name:'账户与折算'}).click();
  await until(()=>aborted===2,'tab switch did not cancel the request');
  await page.getByRole('button',{name:'调用成本明细'}).click();await open('alpha').waitFor();
  await open('alpha').click();await until(()=>held.length===3,'detail for page change did not start');
  await page.getByRole('button',{name:'下一页'}).click();
  await until(()=>aborted===3,'pagination did not cancel the request');
  await page.getByText('共 52 条 · 第 2 页',{exact:true}).waitFor();
  assert.equal(await dialog.count(),0);
  await open('alpha').click();await until(()=>held.length===4,'detail for page exit did not start');
  await page.close();await until(()=>aborted===4,'unmount did not cancel the request');
  console.log('SUPPLIER_COST_DETAIL_CLIENT=PASS STALE_CHAIN_OVERRIDES_NEW=0 DEDUPED_DETAIL=1 DETAIL_ABORTS=4 RETURN_NO_OLD_DIALOG=1 ACTUAL_REACT=1 BROWSER=1');
 }
}finally{
 for(const {id,res} of held)send(res,detail(id));
 await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
