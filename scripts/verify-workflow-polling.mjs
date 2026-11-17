/** Exercise actual embedded UI scripts in a browser, with controlled HTTP and time. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const preview=await readFile('design/enterprise-demo/preview.html','utf8');
const notifications=await readFile('design/enterprise-demo/notifications-ui.js','utf8');
const start=preview.indexOf('/* Server-owned inbox and outbox');
assert(start>=0);assert.equal(preview.slice(start,preview.indexOf('/* G16:',start)).trim(),notifications.trim());
const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.setContent('<div id="overlay"></div><span id="nfBadge"></span>');
 await page.addScriptTag({content:`
  let view='dashboard',contextEpoch=1,visible='visible';
  const workspace={active:true,context:{},directory:{},enterpriseId:'enterprise',teamId:'team'};
  const $=q=>document.querySelector(q),$$=q=>document.querySelectorAll(q);
  const workspaceTeam=()=>workspace.teamId,requirementScope=()=>({active:true,epoch:contextEpoch,enterpriseId:workspace.enterpriseId,teamId:workspace.teamId,email:'viewer'});
  const scopeCurrent=s=>s.epoch===contextEpoch;
  function workspaceClear(){contextEpoch++;workspace.context=null;workspace.directory=null;}
  async function workspaceChooseTeam(id){workspaceClear();workspace.teamId=id;workspace.context={};workspace.directory={};}
  function renderPage(){} function bind(){} function shell(){} function overlay(){}
  function workspaceError(e){return e.message;}
  function realTaskError(e){return e.message;}
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visible});
  document.documentElement.dataset.workspaceMode='enterprise';
  globalThis.__NAUMI_SITE__={brand:'Fixture',revision:1,workspaceModules:['notifications','dashboard']};
  const intervals=[],calls=[];
  globalThis.setInterval=fn=>{intervals.push(fn);return intervals.length;};
  globalThis.fetch=(url,options={})=>new Promise((resolve,reject)=>{
   const call={url:String(url),method:options.method,hasSignal:!!options.signal,resolve:(body,status=200)=>resolve(Response.json(body,{status})),aborted:false,
    deferBody:(status)=>resolve({ok:status<400,status,json:()=>new Promise(done=>{call.finishBody=done;})})};
   calls.push(call);options.signal?.addEventListener('abort',()=>{call.aborted=true;reject(Error('aborted'));},{once:true});
  });
 `});
 await page.addScriptTag({path:'design/enterprise-demo/notifications-ui.js'});
 await page.addScriptTag({path:'design/enterprise-demo/enterprise-site-ui.js'});
 await page.evaluate(()=>{visible='hidden';intervals.forEach(fn=>fn());window.dispatchEvent(new Event('focus'));});
 assert.equal(await page.evaluate(()=>calls.length),0);
 await page.evaluate(()=>{visible='visible';document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));intervals[1]();});
 assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.url)),['/api/site-profile']);
 await page.evaluate(()=>calls[0].resolve({mode:'enterprise',policy:{revision:2,brand:'Updated',enabledFeatures:['team'],workspaceModules:['notifications','dashboard']}}));
 await page.waitForFunction(()=>document.title.startsWith('Updated'));

 await page.evaluate(()=>{intervals[0]();intervals[0]();});
 assert.deepEqual(await page.evaluate(()=>calls.slice(1).map(c=>new URL(c.url,'https://fixture.test').searchParams.get('action'))),['badge']);
 await page.evaluate(()=>calls[1].resolve({unread:9}));
 await page.waitForFunction(()=>document.querySelector('#nfBadge').textContent==='9');
 await page.evaluate(()=>{view='notifications';nf.tab='inbox';intervals[0]();});
 assert.equal(await page.evaluate(()=>calls.length),2);
 await page.evaluate(()=>{view='dashboard';intervals[0]();workspaceClear();});
 assert.equal(await page.evaluate(()=>calls[2].aborted),true);

 // An old proxy or workflow service may reject the new action. Fall back
 // once for that page; future polls directly use the backward-compatible API.
 await page.evaluate(()=>{intervals[0]();calls[3].resolve({error:{code:'INVALID_INPUT'}},400);});
 await page.waitForFunction(()=>calls.length===5);
 await page.evaluate(()=>calls[4].resolve({unread:3}));
 await page.waitForFunction(()=>document.querySelector('#nfBadge').textContent==='3');
 await page.evaluate(()=>intervals[0]());
 assert.deepEqual(await page.evaluate(()=>calls.slice(3,6).map(c=>new URL(c.url,'https://fixture.test').searchParams.get('action'))),['badge','inbox','inbox']);
 await page.evaluate(()=>calls[5].resolve({error:'ACCOUNT_CHANGED'},409));
 await page.waitForFunction(()=>!workspace.context&&!workspace.directory&&nf.unread===0&&workspace.enterpriseId==='');
 const checks=await page.evaluate(async()=>{
  const list=id=>({notifications:[{id}],total:1,unread:1});
  const expect=(condition,message)=>{if(!condition)throw Error(message);};
  const action=c=>new URL(c.url,'https://fixture.test').searchParams.get('action');
  workspace.context={};workspace.directory={};workspace.enterpriseId='enterprise';view='dashboard';
  intervals[0]();const background=calls.at(-1);
  visible='hidden';document.dispatchEvent(new Event('visibilitychange'));
  expect(background.aborted,'hidden tab leaves a badge request in flight');
  visible='visible';view='notifications';
  const saved=calls.length,first=nfLoad();expect(first===nfLoad()&&calls.length===saved+1,'duplicate reads did not share one request');
  const replaced=calls.at(-1);nf.page=2;const second=nfLoad();
  expect(replaced.aborted&&calls.length===saved+2,'new page did not abort the old read');
  calls.at(-1).resolve(list('page2'));await first;await second;
  expect(nf.rows[0].id==='page2'&&!nf.loading,'new page did not own the result');

  const stale=nfLoad();const delayed=calls.at(-1);delayed.deferBody(403);
  await Promise.resolve();await Promise.resolve();
  expect(typeof delayed.finishBody==='function','test did not reach the delayed response body');
  const beforeTeam=calls.length,switched=workspaceChooseTeam('new-team');
  await Promise.resolve();await Promise.resolve();
  expect(delayed.aborted&&calls.length===beforeTeam+1&&action(calls.at(-1))==='inbox','switch must cancel old read and fetch one inbox only');
  expect(new URL(calls.at(-1).url,'https://fixture.test').searchParams.get('teamId')==='new-team','incorrect inbox scope');
  delayed.finishBody({error:{code:'MEMBERSHIP_REQUIRED'}});await stale;
  calls.at(-1).resolve(list('new-team'));await switched;
  expect(workspace.context&&nf.rows[0].id==='new-team'&&!nf.error,'an obsolete 403 cleared the new workspace');

  const inFlight=nfLoad(),obsolete=calls.at(-1);
  const mutation=nfRequest('command',{}, {fixture:true}),command=calls.at(-1);
  expect(command.method==='POST'&&!command.hasSignal,'notification command was attached to read cancellation');
  command.resolve({ok:true});await mutation;
  const refreshed=nfLoad(true);expect(obsolete.aborted,'acknowledged command did not refresh its page');
  view='dashboard';shell();expect(calls.at(-1).aborted,'leaving notifications did not abort');
  await inFlight;await refreshed;expect(!nf.loading&&!nf.error,'aborted read changed the destination state');
  return true;
 });
 assert.equal(checks,true);
 assert.deepEqual(errors,[]);
 console.log('WORKFLOW_POLLING_PASS hidden=0 policy_focus_coalesced=1 badge_only=1 inbox_suppression=1 scope_cancelled=1 rollout_fallback=1 account_change_cleared=1 hidden_abort=1 duplicate_page_coalesced=1 page_replaced=1 team_one_inbox=1 stale_403_ignored=1 write_detached=1 navigation_abort=1');
}finally{await browser.close();}
