import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const baseline=process.argv.includes('--baseline');
const {outputFiles}=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';
 import {SupplierCostManager} from '@/components/admin/billing/supplier-cost-manager';
 createRoot(document.querySelector('#root')).render(<SupplierCostManager/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',platform:'browser',format:'iife',plugins:[{name:'loopback',setup(b){
 b.onResolve({filter:/^(next\/link|@\/lib\/supabase)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path==='next/link'?`import React from 'react';export default function Link(props){return React.createElement('a',props)}`:`export async function authHeader(){return {}}`}));
}}]});
const operation='long-operation';
const rows=Array.from({length:133},(_,i)=>({id:'id-'+i,operation_id:operation,attempt_id:'attempt-'+i,account_id:'fixture-account',
 provider_id:'fixture',model:'test-model',phase:'long-stage-'+i,feature:'canvas.image',currency:'CNY',cost_status:'reported',state:'completed',amount_micros:'123'}));
const callDetail=id=>({parameters:{fixture:'payload-marker-'+id},outputs:[{call_id:id,output_index:0,state:'succeeded'}]});
const legacy={rows:rows.map(row=>({...row,parameters:callDetail(row.id).parameters})),outputs:rows.flatMap(row=>callDetail(row.id).outputs),
 billing:{marker:'billing-fixture'},feeReviews:[{id:'fee-0',note:'original fee review'}],adjustments:[]};
const send=(res,payload)=>{if(!res.destroyed&&!res.writableEnded)res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(payload));};
let browser,oldServer=baseline,aborted=0,held,heldFinance,financeAborted=0;
const requests=[];
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/api/admin/supplier-cost'){send(res,{rows:[rows[0]],total:1,accounts:[{id:'fixture-account',label:'Fixture'}]});return;}
 if(url.pathname==='/api/admin/supplier-cost/operations/'+operation){
  const view=url.searchParams.get('view'),after=url.searchParams.get('after'),call=url.searchParams.get('call');
  requests.push([view,after,call]);
  if(oldServer){send(res,legacy);return;}
  if(view==='calls'){
   const start=after?rows.findIndex(row=>row.id===after)+1:0;
   const batch=rows.slice(start,start+25);send(res,{view,rows:batch,next:start+batch.length<rows.length?batch.at(-1).id:null});return;
  }
  if(view==='billing'){send(res,{view,billing:legacy.billing});return;}
  if(view==='reviews'){send(res,{view,rows:legacy.feeReviews,next:null});return;}
  if(view==='adjustments'){heldFinance=res;res.once('close',()=>{if(!res.writableFinished)financeAborted++;});return;}
  if(view==='call'&&call==='id-0'){held=res;res.once('close',()=>{if(!res.writableFinished)aborted++;});return;}
  if(view==='call'){send(res,{view,detail:callDetail(call)});return;}
 }
 if(url.pathname==='/app.js'){res.writeHead(200,{'content-type':'text/javascript'}).end(outputFiles[0].contents);return;}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<!doctype html><div id="root"></div><script src="/app.js"></script>');
});
async function until(check){const end=Date.now()+3000;while(!check()){assert.ok(Date.now()<end,'fixture operation did not finish');await delay(20);}}
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(4500);await page.goto(origin);
 const dialog=page.getByRole('dialog',{name:'完整调用链'}),articles=dialog.getByTestId('supplier-chain-call');
 const open=page.getByRole('button',{name:'展开'}),close=dialog.getByRole('button',{name:'关闭'});
 await open.click();await dialog.waitFor();
 if(baseline){
  assert.equal(await dialog.getByText(/long-stage-/).count(),133);assert.equal(await dialog.locator('pre').count(),135);
  console.log('SUPPLIER_CHAIN_BROWSER_BASELINE=PASS ROWS=133 SERIALIZED_BLOCKS=135 ACTUAL_REACT=1 BROWSER=1');
 }else{
  assert.equal(await articles.count(),25);assert.equal(await dialog.locator('pre').count(),0);
  assert.deepEqual(requests,[['calls',null,null]]);
  await dialog.getByRole('button',{name:'加载更多调用'}).evaluate(button=>{button.click();button.click();});
  await articles.nth(49).waitFor();assert.deepEqual(requests.slice(1),[['calls','id-24',null]]);
  await articles.nth(0).getByRole('button',{name:'查看调用详情'}).click();await until(()=>!!held);
  await articles.nth(1).getByRole('button',{name:'查看调用详情'}).click();
  await until(()=>aborted===1);send(held,{view:'call',detail:callDetail('id-0')});
  await dialog.getByText(/payload-marker-id-1/).waitFor();assert.equal(await dialog.getByText(/payload-marker-id-0/).count(),0);
  await dialog.getByRole('button',{name:'账务记录'}).click();await dialog.getByText(/billing-fixture/).waitFor();
  await dialog.getByRole('button',{name:'费用复核'}).click();await dialog.getByText(/original fee review/).waitFor();
  await dialog.getByRole('button',{name:'退款 / 费用修订'}).click();await until(()=>!!heldFinance);
  await close.click();await dialog.waitFor({state:'hidden'});
  await until(()=>financeAborted===1);
  oldServer=true;
  const before=requests.length;await open.click();await dialog.waitFor();assert.equal(await articles.count(),25);assert.equal(await dialog.locator('pre').count(),0);
  await dialog.getByRole('button',{name:'加载更多调用'}).click();await articles.nth(49).waitFor();
  await articles.nth(48).getByRole('button',{name:'查看调用详情'}).click();await dialog.getByText(/payload-marker-id-48/).waitFor();
  await dialog.getByRole('button',{name:'费用复核'}).click();await dialog.getByText(/original fee review/).waitFor();
  assert.equal(requests.length,before+1);
  console.log('SUPPLIER_CHAIN_BROWSER=PASS INITIAL_ROWS=25 INITIAL_SERIALIZED_BLOCKS=0 PAGE_SINGLE_FLIGHT=1 DETAIL_ABORT=1 FINANCE_ON_DEMAND=1 CLOSE_ABORT=1 OLD_SERVER_LOCAL_PAGING=1 ACTUAL_REACT=1 BROWSER=1');
 }
}finally{
 if(held)send(held,{view:'call',detail:callDetail('id-0')});
 if(heldFinance)send(heldFinance,{view:'adjustments',rows:[],next:null});
 await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
