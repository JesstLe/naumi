import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const asset=await build({stdin:{contents:`
 import React from 'react';
 import {createRoot} from 'react-dom/client';
 import {BillingManager} from '@/components/admin/billing/billing-manager';
 import {resolveLegacyBillingTab} from '@/components/admin/billing/legacy-tabs';
 const query=new URLSearchParams(location.search);
 createRoot(document.querySelector('#root')).render(<BillingManager initialTab={resolveLegacyBillingTab(query.get('tab'),query.get('section'))}/>);
`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',platform:'browser',format:'iife',plugins:[{name:'loopback-navigation',setup(b){
 b.onResolve({filter:/^(next\/(navigation|link)|@\/lib\/supabase)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path==='next/navigation'?`
  import {useMemo,useSyncExternalStore} from 'react';
  const event='fixture:history',read=()=>location.search;
  for(const name of ['replaceState','pushState']){
   const native=history[name].bind(history);history[name]=(...args)=>{native(...args);window.dispatchEvent(new Event(event));};
  }
  const subscribe=fn=>{window.addEventListener(event,fn);window.addEventListener('popstate',fn);return()=>{window.removeEventListener(event,fn);window.removeEventListener('popstate',fn);};};
  export function useSearchParams(){const search=useSyncExternalStore(subscribe,read);return useMemo(()=>new URLSearchParams(search),[search]);}
 `:a.path==='next/link'?`import React from 'react';export default function Link(props){return React.createElement('a',props)}`:`export async function authHeader(){return {}}`}));
}}]});
const values=await build({stdin:{contents:`
 import {fixtureConfig,facts} from './scripts/billing-unit-fixture';
 import {quote} from './src/lib/billing/quote';
 export const config=fixtureConfig(),frozenQuote=quote({version:3,config},facts({feature:'tool.cutout'}));
`,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {config,frozenQuote}=await import('data:text/javascript;base64,'+Buffer.from(values.outputFiles[0].contents).toString('base64'));
const original={id:'historic-op',email:'original@example.test',feature:'tool.cutout',reserved_credits:1};
const send=(res,value,status=200)=>{if(!res.destroyed&&!res.writableEnded)res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(value));};
const payload={snapshot:{version:8,config},effective:{metering:true}};
let browser,configReads=0,listReads=0,configMode='error',heldConfig,configAborts=0,holdList=false,listAborts=0,heldList,heldPost,postAborts=0;
const posts=[];
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/api/admin/billing'){
  assert.equal(req.method,'GET');configReads++;
  if(configMode==='hold'){heldConfig=res;res.once('close',()=>{if(!res.writableFinished)configAborts++;});}
  else if(configMode==='error')send(res,{error:'fixture active pricing unavailable'},503);
  else send(res,payload);
  return;
 }
 if(url.pathname==='/api/admin/billing/operations'){
  if(req.method==='POST'){const chunks=[];for await(const part of req)chunks.push(part);posts.push(JSON.parse(Buffer.concat(chunks).toString()));heldPost=res;res.once('close',()=>{if(!res.writableFinished)postAborts++;});return;}
  if(url.searchParams.has('id'))send(res,{...original,quote:frozenQuote});
  else{listReads++;if(holdList){heldList=res;res.once('close',()=>{if(!res.writableFinished)listAborts++;});}else send(res,[original]);}
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
 const page=await context.newPage();page.setDefaultTimeout(4500);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const operation=page.getByRole('button',{name:/original@example\.test/});
 const tab=name=>page.getByRole('navigation',{name:'计费管理分区'}).getByRole('button',{name,exact:true});
 for(const suffix of ['?tab=operations','?section=operations&email=keep%40example.test#keep']){
  await page.goto(origin+'/admin/billing'+suffix);await operation.waitFor();
  assert.equal(await tab('人工核对').getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('button',{name:'发布配置'}).count(),0);
 }
 assert.equal(configReads,0);assert.equal(listReads,2);
 await tab('业务收费').click();
 await page.getByRole('status').filter({hasText:'fixture active pricing unavailable'}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get('email'),'keep@example.test');assert.equal(new URL(page.url()).hash,'#keep');
 await tab('人工核对').click();await operation.waitFor();assert.equal(configReads,1);

 configMode='hold';await tab('业务收费').click();await until(()=>!!heldConfig,'configuration request did not start');
 await tab('特殊定价规则').click();assert.equal(configReads,2);
 await tab('人工核对').click();await until(()=>configAborts===1,'leaving configuration did not cancel its request');
 send(heldConfig,payload);

 configMode='error';await tab('赠送与总开关').click();
 await page.getByRole('status').filter({hasText:'fixture active pricing unavailable'}).waitFor();
 configMode='ok';await page.getByRole('button',{name:'重新读取'}).click();
 await page.getByText(/当前版本 8/).waitFor();assert.equal(configReads,4);
 const amount=page.getByRole('spinbutton',{name:'注册赠送积分',exact:true});
 await amount.fill('123');await page.getByLabel('发布说明').fill('保留价格草稿');
 const compare=page.getByRole('button',{name:'查看当前版本'});configMode='hold';heldConfig=undefined;
 await compare.evaluate(button=>{button.click();button.click();});
 await until(()=>!!heldConfig,'comparison request did not start');assert.equal(configReads,5);
 await tab('人工核对').click();await operation.waitFor();await until(()=>configAborts===2,'leaving configuration did not cancel comparison');
 await operation.click();await page.getByText('报价版本 3，任务数量 1').waitFor();
 await page.getByRole('spinbutton',{name:'已确认成功数量',exact:true}).fill('1');
 await page.getByLabel('核对说明').fill('保留原核对依据');await page.getByLabel('供应商结果或产物核对依据').fill('已确认原产物');
 const settle=page.getByRole('button',{name:'确认账务核对'});await settle.click();
 await until(()=>posts.length===1,'reconciliation did not start');assert.equal(posts[0].operationId,original.id);
 holdList=true;await page.getByRole('button',{name:'刷新待核对列表'}).click();await until(()=>!!heldList,'review list did not start');
 await tab('赠送与总开关').click();await until(()=>listAborts===1,'leaving review did not cancel its list');
 assert.equal(await amount.inputValue(),'123');assert.equal(await page.getByLabel('发布说明').inputValue(),'保留价格草稿');
 const readsBefore=listReads;
 const hiddenResponse=page.waitForResponse(response=>response.request().method()==='POST');
 send(heldPost,{error:'fixture unknown outcome'},503);assert.equal((await hiddenResponse).status(),503);assert.equal(postAborts,0);
 assert.equal(listReads,readsBefore);
 holdList=false;await tab('人工核对').click();
 await page.getByRole('alert').filter({hasText:'fixture unknown outcome'}).waitFor();
 assert.equal(await page.getByLabel('核对说明').inputValue(),'保留原核对依据');
 await settle.click();await until(()=>posts.length===2,'reconciliation did not retry');assert.deepEqual(posts[1],posts[0]);
 send(heldPost,{charge:1});await page.getByRole('status').filter({hasText:'已核对'}).waitFor();

 // Same document navigation can also restore a legacy section without an explicit tab.
 await page.evaluate(()=>{history.pushState(null,'','?section=wallet');history.pushState(null,'','?section=operations');history.back();});
 await page.getByText(/历史订阅和授权商品保持停售/).waitFor();
 await page.evaluate(()=>history.forward());await operation.waitFor();
 assert.equal(configReads,5);assert.equal(postAborts,0);assert.deepEqual(errors,[]);
 console.log('BILLING_REVIEW_ENTRY=PASS OPERATIONS_DEEP_LINKS=2 INITIAL_CONFIG_READS=0 CONFIG_ABORTS=2 REVIEW_ABORTS=1 DRAFTS_PRESERVED=2 POST_NOT_CANCELED=1 RETRY_BODY_EXACT=1 BROWSER_HISTORY=1 ACTUAL_REACT=1 BROWSER=1 FIXTURE_ONLY=1');
}finally{
 send(heldConfig??{destroyed:true},payload);send(heldList??{destroyed:true},[original]);send(heldPost??{destroyed:true},{error:'fixture cleanup'},503);
 await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
