import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const asset=await build({stdin:{contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {BillingManager} from '@/components/admin/billing/billing-manager';
 createRoot(document.querySelector('#root')).render(<BillingManager initialTab="history"/>);
`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',platform:'browser',format:'iife',plugins:[{name:'loopback-navigation',setup(b){
 b.onResolve({filter:/^(next\/(navigation|link)|@\/lib\/supabase)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path==='next/navigation'?`
  import {useMemo,useSyncExternalStore} from 'react';
  const event='fixture:history',read=()=>location.search,native=history.replaceState.bind(history);
  history.replaceState=(...args)=>{native(...args);dispatchEvent(new Event(event));};
  const subscribe=fn=>{addEventListener(event,fn);return()=>removeEventListener(event,fn);};
  export function useSearchParams(){const search=useSyncExternalStore(subscribe,read);return useMemo(()=>new URLSearchParams(search),[search]);}
 `:a.path==='next/link'?`import React from 'react';export default function Link(props){return React.createElement('a',props)}`:`export async function authHeader(){return {}}`}));
}}]});
const values=await build({stdin:{contents:`import {fixtureConfig} from './scripts/billing-unit-fixture';export const config=fixtureConfig();`,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {config}=await import('data:text/javascript;base64,'+Buffer.from(values.outputFiles[0].contents).toString('base64'));
const rows=[8,7,6,5,4].map(version=>({version,actor:'fixture',reason:'版本 '+version,createdAt:'2026-01-01T00:00:00Z'}));
const snapshot=version=>{const value=structuredClone(config);value.credits.signup.amount=version;if(version===9)value.thresholds.agentConfirmCredits+=10;return {version,config:value};};
const send=(res,value,status=200,headers={})=>{if(res&&!res.destroyed&&!res.writableEnded)res.writeHead(status,{'content-type':'application/json',...headers}).end(JSON.stringify(value));};
const held=[],posts=[],details=[],listReads=[];
let browser,holdList=false,holdVersions=new Set([7]),versionAborts=0,listAborts=0,liveVersion=8,oldServer=false;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/api/admin/billing'){send(res,{snapshot:snapshot(liveVersion),effective:{metering:true}});return;}
 if(url.pathname==='/api/admin/billing/versions'){
  if(req.method==='POST'){const chunks=[];for await(const part of req)chunks.push(part);posts.push(JSON.parse(Buffer.concat(chunks).toString()));
   if(posts.length===1)send(res,{error:'fixture lost acknowledgement'},503);else send(res,snapshot(10));
   return;
  }
  const version=Number(url.searchParams.get('version'));
  if(version){details.push(version);if(holdVersions.has(version)){held.push({version,res});res.once('close',()=>{if(!res.writableFinished)versionAborts++;});}else send(res,snapshot(version));return;}
  const before=url.searchParams.get('before');listReads.push(before);
  if(holdList){held.push({version:0,res});res.once('close',()=>{if(!res.writableFinished)listAborts++;});}
  else if(before==='6')send(res,rows.slice(3));
  else send(res,rows.slice(0,3),200,oldServer?{}:{'X-Naumi-Billing-Next-Version':'6'});
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
 const restore=version=>page.getByRole('row').filter({has:page.getByText('版本 '+version,{exact:true})}).getByRole('button',{name:'预览恢复'});
 const tab=name=>page.getByRole('navigation',{name:'计费管理分区'}).getByRole('button',{name,exact:true});
 const reason=page.getByLabel('发布说明');
 await page.goto(origin+'/admin/billing?tab=history');
 await restore(7).evaluate(button=>{button.click();button.click();});await until(()=>held.length===1,'older restore selection was not requested');
 await restore(6).click();await page.waitForFunction(()=>document.querySelector('input[placeholder="填写调整原因，保留在版本历史"]')?.value==='恢复版本 6');
 await until(()=>versionAborts===1,'superseded detail was not canceled');
 send(held[0].res,snapshot(7));
 assert.equal(await reason.inputValue(),'恢复版本 6');assert.deepEqual(details,[7,6]);
 const more=page.getByRole('button',{name:'加载更早版本'});
 await more.evaluate(button=>{button.click();button.click();});await restore(4).waitFor();
 assert.deepEqual(listReads,[null,'6']);assert.equal(await more.count(),0);
 holdVersions.add(5);await restore(5).click();await until(()=>held.some(x=>x.version===5),'last preview did not start');
 await tab('业务收费').click();await until(()=>versionAborts===2,'leaving history did not cancel the preview');
 assert.equal(await reason.inputValue(),'恢复版本 6');
 holdList=true;await tab('业务收费').click();await tab('版本历史').click();
 await until(()=>held.some(x=>x.version===0),'history was not read on revisit');await tab('业务收费').click();
 await until(()=>listAborts===1,'leaving history did not cancel the list');
 send(held.find(x=>x.version===0).res,rows);assert.equal(posts.length,0);
 liveVersion=9;holdList=false;oldServer=true;
 await tab('版本历史').click();await restore(6).waitFor();assert.equal(await more.count(),0);
 await page.getByRole('button',{name:'查看当前版本'}).click();await page.getByRole('button',{name:'以当前版本合并草稿'}).click();
 await tab('赠送与总开关').click();
 assert.equal(await page.getByRole('spinbutton',{name:'注册赠送积分',exact:true}).inputValue(),'6');
 assert.equal(await page.getByRole('spinbutton',{name:'Agent 大额确认门槛（积分）',exact:true}).inputValue(),String(config.thresholds.agentConfirmCredits));
 const publish=page.getByRole('button',{name:'发布配置'});
 await publish.evaluate(button=>{button.click();button.click();});
 await page.getByRole('alert').filter({hasText:'fixture lost acknowledgement'}).waitFor();
 assert.equal(posts.length,1);assert.equal(posts[0].expectedVersion,9);assert.equal(posts[0].targetVersion,6);
 await publish.click();await page.getByRole('status').filter({hasText:'已发布版本 10'}).waitFor();assert.deepEqual(posts,[posts[0],posts[0]]);
 console.log('BILLING_HISTORY_CLIENT=PASS STALE_PREVIEW_REPLACES_NEW=0 LIST_ABORTS=1 DETAIL_ABORTS=2 MORE_SINGLE_FLIGHT=1 OLD_NO_CURSOR=1 RESTORE_REBASE_MATCHES_TARGET=1 POST_RETRY_EXACT=1 ACTUAL_REACT=1 BROWSER=1');
}finally{
 for(const item of held)send(item.res,{error:'fixture cleanup'},503);
 await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
