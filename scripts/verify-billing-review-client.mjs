import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const asset=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {OperationReconciliation} from '@/components/admin/billing/operation-reconciliation';let root;window.fixtureMount=()=>{root=createRoot(document.querySelector('#root'));root.render(<OperationReconciliation/>);};window.fixtureUnmount=()=>root.unmount();window.fixtureMount();`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',platform:'browser',format:'iife',plugins:[{name:'isolated-session',setup(b){b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function authHeader(){return {}}'}));}}]});
const values=await build({stdin:{contents:`import {fixtureConfig,facts} from './scripts/billing-unit-fixture';import {quote} from './src/lib/billing/quote';export const fixtureQuote=version=>quote({version,config:fixtureConfig()},facts({feature:'tool.cutout'}));`,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {fixtureQuote}=await import('data:text/javascript;base64,'+Buffer.from(values.outputFiles[0].contents).toString('base64'));
let browser,slow,slowAborted=false,holdLists=false,heldLists=[],listReads=0,detailReads=[],posts=[],heldPost,abortPosts=0;
const quotes=[fixtureQuote(1),fixtureQuote(2)];
const rows=[{id:'old-operation',email:'old@example.test',feature:'tool.cutout',reserved_credits:1},{id:'new-operation',email:'new@example.test',feature:'tool.cutout',reserved_credits:2}];
const send=(res,value,status=200)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(value));}};
const reply=(res,id)=>send(res,{...rows.find(row=>row.id===id),quote:quotes[id==='old-operation'?0:1]});
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(req.method==='POST'){const chunks=[];for await(const part of req)chunks.push(part);posts.push(JSON.parse(Buffer.concat(chunks).toString()));heldPost=res;res.once('close',()=>{if(!res.writableFinished)abortPosts++;});return;}
 if(url.pathname==='/api/admin/billing/operations'){
  const id=url.searchParams.get('id');
  if(id){detailReads.push(id);if(id==='old-operation'){slow=res;res.once('close',()=>{if(!res.writableFinished)slowAborted=true;});}else reply(res,id);return;}
  listReads++;if(holdLists){heldLists.push(res);return;}send(res,rows);return;
 }
 if(url.pathname==='/app.js'){res.writeHead(200,{'content-type':'text/javascript'}).end(asset.outputFiles[0].contents);return;}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<!doctype html><div id="root"></div><script src="/app.js"></script>');
});
async function until(check,message){const end=Date.now()+2600;while(!check()){assert.ok(Date.now()<end,message);await delay(20);}}
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(3500);await page.goto(origin);
 const old=page.getByRole('button',{name:/old@example\.test/});
 await old.click();await until(()=>!!slow,'first detail did not start');await old.click();
 await page.getByRole('button',{name:/new@example\.test/}).click();await page.getByText('报价版本 2，任务数量 1').waitFor();
 await until(()=>slowAborted,'switching details did not abort the previous GET');reply(slow,'old-operation');
 assert.equal(await page.getByText('报价版本 1，任务数量 1').count(),0);
 assert.deepEqual(detailReads,['old-operation','new-operation']);
 const refresh=page.getByRole('button',{name:'刷新待核对列表'}),before=listReads;holdLists=true;
 await refresh.click();await refresh.click();await until(()=>heldLists.length===1,'the list request did not start');
 assert.equal(listReads-before,1);assert.equal(posts.length,0);
 await page.getByLabel('已确认成功数量').fill('1');await page.getByLabel('核对说明').fill('fixture original result');
 await page.getByLabel('供应商结果或产物核对依据').fill('fixture verified output');
 const submit=page.getByRole('button',{name:'确认账务核对'});
 await submit.evaluate(button=>{button.click();button.click();});await until(()=>posts.length===1,'reconciliation did not start');
 assert.equal(posts[0].operationId,'new-operation');assert.equal(await old.isDisabled(),true);assert.equal(await page.getByLabel('核对说明').isDisabled(),true);
 send(heldPost,{error:'fixture unknown outcome'},503);await page.getByRole('alert').getByText('fixture unknown outcome').waitFor();
 await submit.click();await until(()=>posts.length===2,'retry did not start');assert.deepEqual(posts[0],posts[1]);
 holdLists=false;send(heldPost,{charge:quotes[1].requestedCredits});await page.getByRole('status').waitFor();
 await until(()=>heldLists[0].destroyed,'successful reconciliation did not replace the pre-settlement GET');
 await old.click();await until(()=>detailReads.length===3,'last held detail did not start');
 holdLists=true;await refresh.click();await until(()=>heldLists.length===2,'last held list did not start');
 await page.evaluate(()=>window.fixtureUnmount());await until(()=>slow.destroyed&&heldLists[1].destroyed,'unmount left a list or detail connection open');
 holdLists=false;await page.evaluate(()=>window.fixtureMount());await page.getByRole('button',{name:/new@example\.test/}).click();
 await page.getByLabel('已确认成功数量').fill('1');await page.getByLabel('核对说明').fill('fixture continued outcome');
 await page.getByLabel('供应商结果或产物核对依据').fill('fixture separate verified output');
 await submit.click();await until(()=>posts.length===3,'second session did not submit');
 const readBeforeUnmount=listReads,finished=page.waitForResponse(response=>response.request().method()==='POST');
 await page.evaluate(()=>window.fixtureUnmount());send(heldPost,{charge:quotes[1].requestedCredits});
 assert.equal((await finished).status(),200);assert.equal(abortPosts,0);assert.equal(listReads,readBeforeUnmount);
 console.log('BILLING_REVIEW_CLIENT=PASS STALE_DETAIL_OVERWRITE=0 LIST_SINGLE_FLIGHT=1 UNMOUNT_ABORTS=2 RETRY_BODY_EXACT=1 POST_NOT_CANCELED=1 ACTUAL_REACT=1 BROWSER=1 FIXTURE_ONLY=1');
}finally{
 if(slow)reply(slow,'old-operation');for(const res of heldLists)send(res,rows);
 if(heldPost)send(heldPost,{error:'fixture cleanup'},503);
 await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
