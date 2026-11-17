/** Exercise actual embedded UI scripts in a browser, with controlled HTTP and time. */
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.setContent('<div id="overlay"></div><span id="nfBadge"></span>');
 await page.addScriptTag({content:`
  let view='dashboard',contextEpoch=1,visible='visible';
  const workspace={active:true,context:{},directory:{},enterpriseId:'enterprise'};
  const $=q=>document.querySelector(q),$$=q=>document.querySelectorAll(q);
  const workspaceTeam=()=> 'team',requirementScope=()=>({active:true,epoch:contextEpoch,enterpriseId:'enterprise',teamId:'team',email:'viewer'});
  const scopeCurrent=s=>s.epoch===contextEpoch;
  function workspaceClear(){contextEpoch++;workspace.context=null;workspace.directory=null;}
  async function workspaceChooseTeam(){}
  function renderPage(){} function bind(){} function shell(){} function overlay(){}
  function workspaceError(e){return e.message;}
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visible});
  document.documentElement.dataset.workspaceMode='enterprise';
  globalThis.__NAUMI_SITE__={brand:'Fixture',revision:1,workspaceModules:['notifications','dashboard']};
  const intervals=[],calls=[];
  globalThis.setInterval=fn=>{intervals.push(fn);return intervals.length;};
  globalThis.fetch=(url,options={})=>new Promise((resolve,reject)=>{
   const call={url:String(url),resolve:(body,status=200)=>resolve(Response.json(body,{status})),aborted:false};
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
 assert.deepEqual(errors,[]);
 console.log('WORKFLOW_POLLING_PASS hidden=0 policy_focus_coalesced=1 badge_only=1 inbox_suppression=1 scope_cancelled=1 rollout_fallback=1 account_change_cleared=1');
}finally{await browser.close();}
