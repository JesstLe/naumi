/** Actual AdminClient + entry hook in React. Only auth provider/navigation and
 * protected child content are explicit ports; HTTP is an owned loopback server.
 * Baseline executes full old entry source, not a rewritten state machine. */
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {build} from 'esbuild';import {chromium} from '@playwright/test';
const arg=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1]},root=path.resolve(arg('--source-root')||'.'),baseline=process.argv.includes('--baseline'),control=arg('--control-entry'),out=path.resolve(arg('--out')||path.join(process.env.ADMIN_ENTRY_EVIDENCE||'output/admin-entry','run'));
await fs.mkdir(out,{recursive:true});let checks=0,server,browser,requests=[],errors=[],external=[],snapshots=[],contexts=[],passwordReadRaces=[];
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},wait=async test=>{for(let n=0;n<300;n++){if(test())return;await new Promise(r=>setTimeout(r,10));}throw Error('ENTRY_FIXTURE_WAIT_TIMEOUT');};
let state,held=[];
const entry=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{AdminClient}from'./src/components/admin/admin-client';window.authOpened=[];window.navigation=[];window.sessionCalls=0;window.sessionWaiters=[];window.token='cloud-'+window.initial.email;window.holdSession=false;function App(){const[alive,set]=useState(true);window.fixtureMount=set;return alive?<AdminClient/>:null;}createRoot(document.getElementById('root')).render(<App/>);`;
const auth=`import{useSyncExternalStore}from'react';let state={ready:window.initial.ready??true,user:window.initial.email?{email:window.initial.email}:null};const listeners=new Set();window.fixtureAccount=(email,ready=true)=>{state={ready,user:email?{email}:null};window.token='cloud-'+email;for(const f of listeners)f();};export const useAuth=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f)},()=>state);`;
const supabase=`export const browserSupabase=()=>({auth:{getSession:async()=>{window.sessionCalls++;const token=window.token;if(window.holdSession)await new Promise(r=>window.sessionWaiters.push(r));return{data:{session:token?{access_token:token}:null}};}}});`;
const navigation=`export const useSearchParams=()=>new URLSearchParams(location.search);const router={replace:href=>window.navigation.push(href)};export const useRouter=()=>router;`;
try{
 const bundle=await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},outfile:path.join(out,'app.js'),bundle:true,write:true,metafile:true,platform:'browser',format:'iife',jsx:'automatic',tsconfig:path.join(root,'tsconfig.json'),nodePaths:[path.resolve('node_modules')],alias:{react:path.resolve('node_modules/react'),'react-dom':path.resolve('node_modules/react-dom')},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'entry-boundaries',setup(b){
  b.onResolve({filter:/^(next\/navigation|@\/lib\/(auth-context|auth-modal-context|supabase)|@\/components\/admin\/(admin-settings|center-shell))$/},a=>({path:a.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'tsx',contents:a.path==='next/navigation'?navigation:a.path.endsWith('/auth-context')?auth:a.path.endsWith('/auth-modal-context')?`const openAuth=mode=>window.authOpened.push(mode);export const useAuthModal=()=>({openAuth});`:a.path.endsWith('/supabase')?supabase:a.path.endsWith('/admin-settings')?`import React from'react';export const AdminSettings=({localAdmin})=><section data-testid="protected" data-channel={localAdmin?'local':'cloud'}>protected fixture child</section>;`:`import React from'react';export const AdminCenterShell=({children})=><main>{children}</main>;`}));
  if(control)b.onLoad({filter:/[\\/]admin-client\.tsx$/},async()=>({contents:await fs.readFile(control,'utf8'),loader:'tsx',resolveDir:path.join(root,'src/components/admin')}));
 }}]});
 await fs.writeFile(path.join(out,'SOURCE_INPUTS.json'),JSON.stringify({root,control,inputs:Object.keys(bundle.metafile.inputs)},null,2)+'\n');
 server=createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://fixture');if(u.pathname==='/app.js'){res.setHeader('content-type','application/javascript');res.end(await fs.readFile(path.join(out,'app.js')));return;}
  if(!u.pathname.startsWith('/api/')){res.setHeader('content-type','text/html;charset=utf-8');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script>window.initial='+JSON.stringify({email:state.email,ready:state.ready??true})+'</script><script src="/app.js"></script></body></html>');return;}
  const parts=[];for await(const c of req)parts.push(c);const raw=Buffer.concat(parts).toString();requests.push({url:u.pathname,method:req.method,authorization:req.headers.authorization||null,body:raw?JSON.parse(raw):null});
  const send=(status,value)=>{if(res.destroyed)return;res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(u.pathname==='/api/admin/login'){
   if(req.method==='POST'){const result=()=>send(state.postStatus??200,state.postBody??{ok:true});if(state.holdPost){held.push(result);return;}return result();}
   const status=state.loginStatus??200,body=structuredClone(state.login??{localAvailable:true,passwordRequired:true});if(state.holdLogin){held.push(()=>send(status,body));return;}return send(status,body);
  }
  if(u.pathname==='/api/admin/settings'){const status=state.cloudStatus??200;if(state.holdCloud){held.push(()=>send(status,{}));return;}return send(status,{});}
  return send(404,{});
 }catch(e){res.statusCode=500;res.end(String(e));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const open=async(options={})=>{
  for(const c of contexts)await c.close();contexts=[];for(const release of held.splice(0))release();requests=[];
  state={email:'first@fixture.test',...options};const c=await browser.newContext();contexts.push(c);
  if(options.cache)await c.addInitScript(cache=>sessionStorage.setItem('naumi:adminVerifiedV1',JSON.stringify(cache)),options.cache);
  const p=await c.newPage();p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));await p.route(/^https?:/,r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});
  await p.goto(origin+(options.url||'/admin?view=settings'));return p;
 };
 const visible=async(p,test='protected')=>{await p.getByTestId(test).waitFor();checks++;};
 const settle=async p=>{await p.waitForTimeout(60);};
 const snap=async(p,name)=>{snapshots.push({name,html:await p.locator('#root').innerHTML()});checks++;};
 let p=await open({login:{localAuthed:true}});await visible(p);eq(await p.getByTestId('protected').getAttribute('data-channel'),'local');await snap(p,'local-settings');
 p=await open({login:{nativeAdmin:true}});await visible(p);eq(await p.getByTestId('protected').getAttribute('data-channel'),'local');
 p=await open();await p.getByRole('heading',{name:'管理中心访问验证'}).waitFor();await snap(p,'password-form');await p.getByPlaceholder('后台访问密码').fill('exact-fixture-password');await p.getByRole('button',{name:'登录',exact:true}).click();await visible(p);eq(requests.filter(r=>r.method==='POST').map(r=>r.body),[{password:'exact-fixture-password'}]);
 for(const [status,body] of [[403,{error:'密码不匹配'}],[200,{ok:false}],[502,{}]]){p=await open({postStatus:status,postBody:body});await p.getByPlaceholder('后台访问密码').fill('wrong');await p.getByRole('button',{name:'登录',exact:true}).click();await p.getByText(body.error||'登录失败',{exact:true}).waitFor();eq(await p.getByTestId('protected').count(),0);eq(await p.getByPlaceholder('后台访问密码').inputValue(),'wrong');eq(requests.filter(r=>r.method==='POST').length,1);}
 p=await open({login:{localAuthed:true},url:'/admin?next=%2Fadmin%2Fmodel-management'});await p.waitForFunction(()=>window.navigation.length);eq(await p.evaluate(()=>window.navigation.at(-1)),'/admin/model-management');
 p=await open({login:{}});await visible(p);eq(await p.getByTestId('protected').getAttribute('data-channel'),'cloud');eq(requests.find(r=>r.url==='/api/admin/settings').authorization,'Bearer cloud-first@fixture.test');await snap(p,'cloud-settings');eq((await p.evaluate(()=>JSON.parse(sessionStorage.getItem('naumi:adminVerifiedV1')))).email,'first@fixture.test');
 for(const status of [401,403,404]){p=await open({login:{},cloudStatus:status});await p.getByText('无权限访问',{exact:true}).waitFor();eq(await p.getByTestId('protected').count(),0);}
 p=await open({email:null,login:{}});await p.waitForFunction(()=>window.authOpened.length);eq(await p.evaluate(()=>window.authOpened),['sign-in']);eq(requests.filter(r=>r.url==='/api/admin/settings').length,0);
 for(const [cached,expected] of [[{email:'first@fixture.test',ts:Date.now()},1],[{email:'other@fixture.test',ts:Date.now()},0],[{email:'first@fixture.test',ts:Date.now()-360000},0]]){
  p=await open({login:{},holdCloud:true,cache:cached});await wait(()=>held.length===1);await settle(p);eq(await p.getByTestId('protected').count(),expected,'original same-account cache key and TTL');held.shift()();await visible(p);
 }
 // Network loss and a server fault are not an administrator rejection.
 p=await open({loginStatus:503});await p.getByText(baseline&&!control?'后台验证暂不可用，请稍后重试':'后台验证暂不可用',{exact:true}).waitFor();eq(await p.getByTestId('protected').count(),0);
 if(!baseline){state.loginStatus=200;state.login={localAuthed:true};await p.getByRole('button',{name:'重新验证',exact:true}).click();await visible(p);eq(requests.filter(r=>r.method==='POST').length,0);}
 // Account switch revokes old UI immediately even while the next read is held.
 p=await open({login:{}});await visible(p);state.holdLogin=true;await p.evaluate(()=>window.fixtureAccount('second@fixture.test'));await wait(()=>held.length===1);await settle(p);eq(await p.getByTestId('protected').count(),baseline?1:0,'old account content during held revalidation');state.holdLogin=false;state.cloudStatus=403;held.shift()();await p.getByText('无权限访问',{exact:true}).waitFor();
 // getSession cannot launch another account's protected read after it resolves.
 p=await open({login:{localAvailable:true}});await p.getByPlaceholder('后台访问密码').waitFor();await p.evaluate(()=>window.holdSession=true);state.login={};await p.evaluate(()=>window.fixtureAccount('second@fixture.test'));await p.waitForFunction(()=>window.sessionWaiters.length===1);state.login={localAvailable:true};await p.evaluate(()=>window.fixtureAccount('third@fixture.test'));await p.getByPlaceholder('后台访问密码').waitFor();const before=requests.filter(r=>r.url==='/api/admin/settings').length;await p.evaluate(()=>window.sessionWaiters.shift()());await settle(p);eq(requests.filter(r=>r.url==='/api/admin/settings').length-before,baseline?1:0,'late cloud session must not issue old protected read');
 // A completed password request is not cancelled; only its old UI result ends.
 p=await open({holdPost:true});await p.getByPlaceholder('后台访问密码').fill('old-password');await p.getByRole('button',{name:'登录',exact:true}).click();await wait(()=>held.length===1);await p.evaluate(()=>window.fixtureAccount('second@fixture.test'));await settle(p);held.shift()();await settle(p);eq(await p.getByTestId('protected').count(),baseline?1:0,'old password response must not grant new account UI');eq(requests.filter(r=>r.method==='POST').length,1);
 // Missing cloud token must close an optimistic cached UI, then ask for login.
 p=await open({login:{localAvailable:true},cache:{email:'first@fixture.test',ts:Date.now()}});await p.getByPlaceholder('后台访问密码').waitFor();await p.evaluate(()=>{window.holdSession=true;});state.login={};await p.evaluate(()=>window.fixtureAccount('first@fixture.test',false));await settle(p);await p.evaluate(()=>{window.fixtureAccount('first@fixture.test');window.token=null;});await p.waitForFunction(()=>window.sessionWaiters.length);await p.evaluate(()=>window.sessionWaiters.shift()());await p.waitForFunction(()=>window.authOpened.length);await settle(p);eq(await p.getByTestId('protected').count(),baseline?1:0,'expired cloud token must close cached content');
 // HTTP denial remains denial; cloud 5xx now has the same explicit read retry UI.
 p=await open({login:{},cloudStatus:503});await p.getByText(baseline?'无权限访问':'后台验证暂不可用',{exact:true}).waitFor();eq(await p.getByTestId('protected').count(),0);
 if(!baseline){
  // A/B/A cannot make the original continuation current again.
  p=await open({holdPost:true});await p.getByPlaceholder('后台访问密码').fill('aba-password');await p.getByRole('button',{name:'登录',exact:true}).click();await wait(()=>held.length===1);await p.evaluate(()=>window.fixtureAccount('second@fixture.test'));await settle(p);await p.evaluate(()=>window.fixtureAccount('first@fixture.test'));await settle(p);held.shift()();await settle(p);eq(await p.getByTestId('protected').count(),0);eq(await p.getByPlaceholder('后台访问密码').isEnabled(),true);
  p=await open({holdPost:true});await p.getByPlaceholder('后台访问密码').fill('unmounted');await p.getByRole('button',{name:'登录',exact:true}).click();await wait(()=>held.length===1);await p.evaluate(()=>window.fixtureMount(false));await settle(p);held.shift()();await settle(p);eq(await p.locator('#root').innerHTML(),'');eq(requests.filter(r=>r.method==='POST').length,1);
 }
 // A same-account auth refresh may start a read while a password POST is held.
 // Its pre-cookie response must not override the later accepted password result.
 if(!baseline&&!control)for(const readStatus of [200,503]){
  p=await open({holdPost:true});await p.getByPlaceholder('后台访问密码').fill('accepted-password');await p.getByRole('button',{name:'登录',exact:true}).click();await wait(()=>held.length===1);const releasePost=held.shift();
  state.holdLogin=true;state.loginStatus=readStatus;await p.evaluate(()=>window.fixtureAccount('first@fixture.test'));await wait(()=>held.length===1);const releaseRead=held.shift();releasePost();await visible(p);releaseRead();await settle(p);
  const actual=await p.getByTestId('protected').count();passwordReadRaces.push({readStatus,visibleAfterLateRead:actual,postCount:requests.filter(r=>r.method==='POST').length});eq(actual,process.argv.includes('--access-race-baseline')?0:1,'pre-cookie read '+readStatus+' cannot override a later accepted password');eq(requests.filter(r=>r.method==='POST').length,1);eq(requests.filter(r=>r.url==='/api/admin/login'&&r.method==='GET').length,2);
 }
 // Do not offer an editable password form under a still-bootstrapping owner.
 // The real AuthProvider starts with null/ready=false before cookie hydration.
 if(!baseline&&!control){
  p=await open({email:null,ready:false});await settle(p);const offered=await p.getByPlaceholder('后台访问密码').count();eq(offered,process.argv.includes('--access-race-baseline')?1:0,'bootstrap cannot offer a draft that identity hydration immediately clears');
  if(process.argv.includes('--access-race-baseline'))await p.getByPlaceholder('后台访问密码').fill('lost-bootstrap-draft');
  await p.evaluate(()=>window.fixtureAccount('first@fixture.test',true));await p.getByPlaceholder('后台访问密码').waitFor();eq(await p.getByPlaceholder('后台访问密码').inputValue(),'');await p.getByPlaceholder('后台访问密码').fill('stable-password');eq(await p.getByRole('button',{name:'登录',exact:true}).isEnabled(),true);
  passwordReadRaces.push({bootstrapFormOffered:offered,identityHydrated:true,stableFormEnabled:true});
 }
 if(arg('--baseline-report')){const old=JSON.parse(await fs.readFile(arg('--baseline-report'),'utf8'));eq(snapshots,old.snapshots,'ordinary password/local/cloud markup is unchanged');}
 eq(errors,[]);eq(external,[]);
 const report={status:'PASS',mode:baseline?control?'INCOMING_CONTROL':'BASELINE':'MODIFIED',checks,actualReact:true,actualEntry:true,actualLoopbackHttp:true,protectedChild:'EXPLICIT_PORT',authProvider:'EXPLICIT_PORT',serverAuthorization:'NOT_REPLACED_OR_TESTED_HERE',snapshots,errors,external,oldAccountUi:baseline?'RETAINED':'HIDDEN',oldSessionRead:baseline?'SENT':'STOPPED',oldPasswordResult:baseline?'APPLIED':'IGNORED',passwordReadRaces,postsReplayed:0,localReadAfterPassword:process.argv.includes('--access-race-baseline')?'OVERWROTE_ACCEPTED':'IGNORED',productionCalls:0};
 await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(`ADMIN_ENTRY=PASS MODE=${report.mode} CHECKS=${checks} ACTUAL_REACT=1 ACTUAL_ENTRY=1 LOOPBACK_HTTP=1 OLD_ACCOUNT_UI=${report.oldAccountUi} LATE_CLOUD_READ=${report.oldSessionRead} LATE_PASSWORD=${report.oldPasswordResult} AUTOMATIC_POSTS=0 STALE_PASSWORD_READ=${report.localReadAfterPassword} SUPPLIER=0`);
}catch(error){const pages=[];for(const context of contexts)for(const page of context.pages())pages.push({url:page.url(),html:await page.content().catch(()=>''),text:await page.locator('body').innerText().catch(()=>'')});await fs.writeFile(path.join(out,'FAILURE.json'),JSON.stringify({error:error.stack,checks,requests,errors,snapshots,pages},null,2)+'\n');throw error;}
finally{for(const release of held.splice(0))release();for(const c of contexts)await c.close();await browser?.close();if(server)await new Promise(r=>server.close(r));console.log('ADMIN_ENTRY_CLEANUP=PASS OWN_BROWSER_CLOSED=1 OWN_LOOPBACK_CLOSED=1');}
