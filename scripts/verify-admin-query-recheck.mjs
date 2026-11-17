// Actual production React components; only HTTP/auth/Next navigation are fixture ports.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import sharp from 'sharp';

const out=path.resolve(process.argv[2]||'output/admin-recheck/ui');await fs.mkdir(out,{recursive:true});
const navigation=`import {useEffect,useState} from 'react';const listeners=new Set();
export function useSearchParams(){const [value,set]=useState(location.search);useEffect(()=>{const update=()=>set(location.search);listeners.add(update);return()=>listeners.delete(update)},[]);return new URLSearchParams(value)}
export const usePathname=()=>location.pathname;
function navigate(href){history.replaceState({},'',href);for(const update of listeners)update()}
export const useRouter=()=>({push:navigate,replace:navigate,refresh:()=>{}});`;
const fixturePng=(await sharp({create:{width:320,height:240,channels:3,background:'#dbeafe'}}).png().toBuffer()).toString('base64');
const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {useSearchParams} from 'next/navigation';
import {BiDashboard} from './src/components/admin/bi/dashboard';
import {useSupplierLibrary} from './src/components/admin/model-management/supplier-library/use-supplier-library';
import {AdminQueryInput} from './src/components/admin/query-input';
import {CreationBrowser,CreationMedia} from './src/components/saas/creation-browser';
import {FleetManager} from './src/components/admin/fleet-manager';
import {ModelHealthPanel} from './src/components/admin/model-health/model-health';
import {AdminUsagePanel} from './src/components/admin/usage/usage-panel';
import {useUsageQuery} from './src/components/admin/usage/use-usage-query';
window.fixture={calls:[],commits:[],created:[],revoked:[]};const f=window.fixture;
const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=create(blob);f.created.push(url);return url};URL.revokeObjectURL=url=>{f.revoked.push(url);revoke(url)};
window.fetch=(input,init={})=>{const url=String(input),call={url,method:init.method||'GET',body:init.body?JSON.parse(init.body):null,aborted:!!init.signal?.aborted};f.calls.push(call);init.signal?.addEventListener('abort',()=>call.aborted=true);
if(url.startsWith('/fixture-image'))return Promise.resolve(new Response(f.imageBad?new Uint8Array([0]):Uint8Array.from(atob('${fixturePng}'),c=>c.charCodeAt(0)),{headers:{'content-type':'image/png'}}));
return new Promise(resolve=>{call.resolve=(value,status=200)=>resolve(Response.json(value,{status}))})};
function Library(){const lib=useSupplierLibrary();return <><button onClick={()=>lib.change('q','second')}>second</button><button onClick={()=>lib.change('q','third')}>third</button><output id="library">{lib.listing?.total}</output></>}
function Query(){const [value,set]=useState('');window.externalQuery=set;return <><AdminQueryInput aria-label="query" value={value} onCommit={v=>{f.commits.push(v);window.pendingQuery=v}}/><button onClick={()=>set(window.pendingQuery)}>acknowledge</button></>}
function DirectoryRace(){const read=useUsageQuery('local',30);window.commitDirectory=read.patchMember;return <><output id="directory-state">{JSON.stringify(read.usersData)}</output><button onClick={read.refresh}>directory-refresh</button><button onClick={()=>read.setPage(2)}>directory-next</button></>}
const media={id:'image',direction:'output',role:'result',mediaType:'image',availability:'recorded',position:0};
function App(){const [view,setView]=useState('bi'),[days,setDays]=useState(30);window.setView=setView;window.setDays=setDays;const params=useSearchParams();return view==='bi'?<BiDashboard embedded initialSection={params.get('section')||'users'}/>:view==='library'?<Library/>:view==='query'?<Query/>:view==='directory'?<DirectoryRace/>:view==='creations'?<CreationBrowser/>:view==='media'?<><div style={{height:1800}}>Scroll to media</div><CreationMedia asset={media} api="/fixture-image"/></>:view==='fleet'?<FleetManager/>:view==='health'?<ModelHealthPanel/>:view==='usage'?<AdminUsagePanel token="local" usageDays={days} setUsageDays={setDays} onManageUsers={()=>{}}/>:<p>Unmounted</p>}
createRoot(document.getElementById('root')).render(<App/>);`;
if(process.argv.includes('--reuse-bundle'))await fs.access(path.join(out,'app.js'));
else await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},outfile:path.join(out,'app.js'),bundle:true,jsx:'automatic',platform:'browser',minify:true,define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'ports',setup(b){
 b.onResolve({filter:/^(next\/navigation|next\/link|@\/lib\/supabase|@\/lib\/auth-context)$/},a=>({path:a.path,namespace:'port'}));
 b.onLoad({filter:/.*/,namespace:'port'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/navigation'?navigation:a.path==='next/link'?`import React from 'react';export default ({prefetch,...props})=><a {...props}/>`:a.path.endsWith('auth-context')?`export const useAuth=()=>({user:{email:'fixture@test'},ready:true});`:`export const authHeader=async()=>({});export const browserSupabase=()=>null;`}));
}}]});
const server=createServer(async(req,res)=>{if(req.url==='/app.js'||req.url==='/app.css'){res.setHeader('content-type',req.url.endsWith('js')?'application/javascript':'text/css');res.end(await fs.readFile(path.join(out,req.url.slice(1))));}else{res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:#f7f9fc;font:14px system-ui}button,input{font:inherit}</style><div id="root"></div><script src="/app.js"></script></html>')}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const checks=[],errors=[],expectDefects=process.argv.includes('--expect-defects');
const check=(name,actual,expected)=>checks.push({name,actual,expected,pass:JSON.stringify(actual)===JSON.stringify(expected)});
try{
 browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));
 const count=prefix=>page.evaluate(prefix=>fixture.calls.filter(c=>c.url.startsWith(prefix)).length,prefix);
 const resolve=(prefix,index,body,status=200)=>page.evaluate(({prefix,index,body,status})=>fixture.calls.filter(c=>c.url.startsWith(prefix))[index].resolve(body,status),{prefix,index,body,status});
 const waitCount=(prefix,n)=>page.waitForFunction(({prefix,n})=>fixture.calls.filter(c=>c.url.startsWith(prefix)).length>=n,{prefix,n});
 const view=async name=>{await page.evaluate(name=>setView(name),name);await page.waitForTimeout(70)};
 await page.goto(`http://127.0.0.1:${server.address().port}/?section=users`);
 const overviewPage=await browser.newPage();
 try{
  overviewPage.on('pageerror',e=>errors.push(e.message));
  await overviewPage.goto(`http://127.0.0.1:${server.address().port}/?section=overview&period=all&from=2026-11-01&to=2026-11-07`);
  await overviewPage.waitForFunction(()=>fixture.calls.some(c=>c.url.startsWith('/api/admin/bi?')));
  await overviewPage.waitForTimeout(120);
  const periods=await overviewPage.evaluate(()=>fixture.calls.filter(c=>c.url.startsWith('/api/admin/bi?')).map(c=>new URL(c.url,location.origin).searchParams.get('period')));
  check('Overview canonicalizes a legacy all-history URL before its first GET',periods,['range']);
 }finally{await overviewPage.close();}
 if(!process.argv.includes('--overview-only')){
 await view('query');const query=page.getByLabel('query');
 await query.dispatchEvent('compositionstart');await query.fill('zhong');await page.waitForTimeout(350);
 check('IME does not query uncommitted composition',await page.evaluate(()=>fixture.commits.length),0);
 await query.fill('中文');await query.dispatchEvent('compositionend',{data:'中文'});await page.waitForTimeout(350);
 check('IME commits final text once',await page.evaluate(()=>fixture.commits.at(-1)),'中文');
 await page.getByRole('button',{name:'acknowledge'}).click();
 const before=await page.evaluate(()=>fixture.commits.length);await query.fill('external-match');await page.evaluate(()=>externalQuery('external-match'));await page.waitForTimeout(350);
 check('External URL matching draft cancels pending duplicate',await page.evaluate(()=>fixture.commits.length),before);
 for(const text of ['repeat-a','repeat-b','repeat-a']){await query.fill(text);await page.waitForTimeout(300);}
 check('Returning to an unacknowledged previous term is a new intent',await page.evaluate(()=>fixture.commits.slice(-3)),['repeat-a','repeat-b','repeat-a']);

 await view('usage');await waitCount('/api/admin/usage?',1);
 const users=Array.from({length:30},(_,i)=>({email:`member-${i}@test`,name:`Member ${i}`,role:'user',credits:6,operations:1,balance:90,lastUsedAt:null}));
 const usage={rangeDays:30,totals:{credits:600,operations:100,activeUsers:100},users,daily:[],pagination:{page:1,size:30,total:100}};
 const memberRows=users.map(u=>({...u,plan:'free',creditsTotal:100,creditsUsed:10,artworks:0,banned:false,lastIp:null,recent7:6,note:''}));
 await resolve('/api/admin/usage?',0,usage);await waitCount('/api/admin/users?view=members',1);
 await resolve('/api/admin/users?view=members',0,{users:memberRows});await page.getByRole('button',{name:'下一页',exact:true}).click();await waitCount('/api/admin/usage?',2);
 check('Pending page 2 does not display page 1 rows',await page.locator('tbody tr').count(),0);
 await resolve('/api/admin/usage?',1,{error:'fixture failure'},503);await page.getByRole('alert').waitFor();
 check('Failed page 2 does not retain page 1 as current',await page.locator('tbody tr').count(),0);
 await page.evaluate(()=>setDays(7));await page.waitForTimeout(100);
 const rangeUrl=await page.evaluate(()=>fixture.calls.filter(c=>c.url.startsWith('/api/admin/usage?')).at(-1).url);
 check('External date change resets pagination',new URL(rangeUrl,'http://fixture').searchParams.get('page'),'1');
 await resolve('/api/admin/usage?',(await count('/api/admin/usage?'))-1,{...usage,rangeDays:7,pagination:{page:1,size:30,total:100}});await page.waitForTimeout(100);
 const directoryBefore=await count('/api/admin/users?view=members');
 if(directoryBefore>1)await resolve('/api/admin/users?view=members',directoryBefore-1,{error:'directory unavailable'},503);
 await page.getByRole('button',{name:'刷新',exact:true}).click();await page.waitForTimeout(60);
 await resolve('/api/admin/usage?',(await count('/api/admin/usage?'))-1,{...usage,rangeDays:7});await page.waitForTimeout(100);
 check('Refresh retries same-page member directory',await count('/api/admin/users?view=members')>directoryBefore,true);
 await page.evaluate(()=>setDays(30));await page.waitForTimeout(100);
 const returnedRangeUrl=await page.evaluate(()=>fixture.calls.filter(c=>c.url.startsWith('/api/admin/usage?')).at(-1).url);
 check('Returning to earlier date range also starts page 1',new URL(returnedRangeUrl,'http://fixture').searchParams.get('page'),'1');

 let usageIndex=await count('/api/admin/usage?'),directoryIndex=await count('/api/admin/users?view=members');
 await view('directory');await resolve('/api/admin/usage?',usageIndex,{...usage,users:[users[0]]});await waitCount('/api/admin/users?view=members',directoryIndex+1);
 await resolve('/api/admin/users?view=members',directoryIndex,{users:[memberRows[0]]});await page.waitForTimeout(60);
 await page.getByRole('button',{name:'directory-refresh'}).click();await waitCount('/api/admin/usage?',usageIndex+2);await resolve('/api/admin/usage?',usageIndex+1,{...usage,users:[users[0]]});await waitCount('/api/admin/users?view=members',directoryIndex+2);
 await page.evaluate(email=>commitDirectory(email,{banned:true}),memberRows[0].email);await resolve('/api/admin/users?view=members',directoryIndex+1,{users:[memberRows[0]]});await page.waitForTimeout(60);
 check('Directory GET cannot undo a confirmed member mutation',JSON.parse(await page.locator('#directory-state').textContent()).users[0].banned,true);
 await page.evaluate(()=>window.previousDirectorySetter=commitDirectory);await page.getByRole('button',{name:'directory-next'}).click();await waitCount('/api/admin/usage?',usageIndex+3);
 await resolve('/api/admin/usage?',usageIndex+2,{...usage,users:[users[1]],pagination:{page:2,size:30,total:100}});await waitCount('/api/admin/users?view=members',directoryIndex+3);await resolve('/api/admin/users?view=members',directoryIndex+2,{users:[memberRows[1]]});await page.waitForTimeout(60);
 await page.evaluate(email=>previousDirectorySetter(email,{banned:true}),memberRows[1].email);await page.waitForTimeout(60);
 check('A previous page mutation cannot update current directory',JSON.parse(await page.locator('#directory-state').textContent()).users[0].banned,memberRows[1].banned);

 await page.evaluate(()=>history.replaceState(null,'','/?creationId=fixture-record'));
 await view('creations');const records='/api/admin/creations?',record='/api/admin/creations/fixture-record?';
 await waitCount(records,1);await waitCount(record,1);
 const blurAndReturn=()=>page.evaluate(()=>{
   for(const value of ['hidden','visible','visible']){
     Object.defineProperty(document,'visibilityState',{configurable:true,value});
     document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));
   }
 });
 await blurAndReturn();await page.waitForTimeout(80);
 check('Creation reads in flight survive repeated visibility and focus events',[await count(records),await count(record)],[1,1]);
 await resolve(records,0,{items:[],pagination:{page:1,size:20,total:0},appliedFilters:{}});
 await resolve(record,0,{error:'fixture details unavailable'},503);
 await page.getByText('fixture details unavailable',{exact:false}).waitFor();
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(80);
 check('Creation window focus does not refresh the list or detail',[await count(records),await count(record)],[1,1]);
 await page.getByRole('button',{name:'重试',exact:true}).click();await waitCount(record,2);
 check('Retrying only the failed creation detail does not requery history',await count(records),1);
 await resolve(record,1,{error:'fixture retry also failed'},503);
 await page.getByText('fixture retry also failed',{exact:false}).waitFor();
 await blurAndReturn();await waitCount(records,2);await waitCount(record,3);await page.waitForTimeout(80);
 check('Returning to a hidden creation tab refreshes each data source once',[await count(records),await count(record)],[2,3]);
 await page.evaluate(()=>{delete document.visibilityState;window.dispatchEvent(new Event('naumi:cache-session-ended'));});
 await page.getByText('请重新登录',{exact:false}).first().waitFor();
 check('Session teardown aborts both active creation reads',await page.evaluate(()=>fixture.calls.filter(c=>c.url.startsWith('/api/admin/creations')).slice(-2).every(c=>c.aborted)),true);

 await page.evaluate(()=>fixture.imageBad=true);await view('media');await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await waitCount('/fixture-image',1);await page.waitForTimeout(180);
 const retry=page.getByRole('button',{name:'重试读取',exact:true});check('Undecodable image offers retry',await retry.count(),1);
 if(await retry.count()){await page.evaluate(()=>fixture.imageBad=false);await retry.click();await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth===320);}
 await view('health');await page.evaluate(()=>window.scrollTo(0,0));await waitCount('/api/admin/model-health',1);
 const model={key:'m',label:'Fixture model',model:'fixture',upstreamIds:['m'],modality:'image',state:'checking',reason:null,lastStatus:null,lastBusinessSuccessAt:null,lastProbeAt:null,lastSuccessAt:null,lastObservedAt:null,nextEligibleAt:null,latencyMs:null};
 const health={revision:1,policy:{enabled:true,staleHours:6,dailyMaxCalls:12},modelVersion:1,budget:{day:'2026-11-10',used:0,limit:12},worker:{lastTickAt:null},providers:[{id:'p',name:'Fixture provider',state:'unknown',models:[model]}],recent:[]};
 await resolve('/api/admin/model-health',0,health);await waitCount('/api/admin/model-health',2);
 const hours=page.getByLabel('数据过期阈值（小时）',{exact:false});await hours.fill('7');await page.getByRole('button',{name:'保存设置',exact:true}).click();await waitCount('/api/admin/model-health',3);
 await resolve('/api/admin/model-health',2,{...health,revision:2,policy:{...health.policy,staleHours:7},providers:[]});await page.getByText('已保存',{exact:true}).waitFor();
 await resolve('/api/admin/model-health',1,{...health,providers:[]});await page.waitForTimeout(100);
 check('Late health GET cannot overwrite saved policy',await hours.inputValue(),'7');
 await hours.fill('8');await page.getByRole('button',{name:'保存设置',exact:true}).click();await waitCount('/api/admin/model-health',4);
 check('Next save retains server-confirmed revision',await page.evaluate(()=>fixture.calls.filter(c=>c.url==='/api/admin/model-health').at(-1).body.revision),2);
 await resolve('/api/admin/model-health',3,{...health,revision:3,policy:{...health.policy,staleHours:8}});await page.waitForTimeout(80);
 // A genuinely newer server revision must not silently rebase an edited draft.
 await hours.fill('9');const conflictRead=await count('/api/admin/model-health');await waitCount('/api/admin/model-health',conflictRead+1);
 await resolve('/api/admin/model-health',conflictRead,{...health,revision:4,policy:{...health.policy,staleHours:10}});await page.waitForTimeout(70);
 check('New server policy preserves unsaved draft',await hours.inputValue(),'9');
 await page.getByRole('button',{name:'保存设置',exact:true}).click();await waitCount('/api/admin/model-health',conflictRead+2);
 check('Dirty draft preserves optimistic conflict revision',await page.evaluate(()=>fixture.calls.filter(c=>c.url==='/api/admin/model-health').at(-1).body.revision),3);
 await resolve('/api/admin/model-health',conflictRead+1,{error:'fixture conflict'},409);await page.getByRole('button',{name:'拉取最新配置'}).click();await waitCount('/api/admin/model-health',conflictRead+3);
 await resolve('/api/admin/model-health',conflictRead+2,{...health,revision:4,policy:{...health.policy,staleHours:10}});await page.waitForTimeout(70);
 check('Explicit conflict reload adopts newest settings',await hours.inputValue(),'10');
 const healthBefore=await count('/api/admin/model-health');await waitCount('/api/admin/model-health',healthBefore+1);await resolve('/api/admin/model-health',healthBefore,{error:'temporary failure'},503);
 await page.waitForTimeout(5300);check('Transient health poll failure keeps polling',await count('/api/admin/model-health')>healthBefore+1,true);
 if(await count('/api/admin/model-health')>healthBefore+1){
  const deniedIndex=(await count('/api/admin/model-health'))-1;await resolve('/api/admin/model-health',deniedIndex,{error:'denied'},403);await page.waitForTimeout(100);
  check('Denied health read clears prior data',await page.getByRole('region',{name:'巡检概览'}).count(),0);
  check('Silent authorization failure is visible',await page.getByRole('alert').count(),1);
  const stopped=await count('/api/admin/model-health');await page.waitForTimeout(5300);check('Authorization failure stops automatic polling',await count('/api/admin/model-health'),stopped);
 }
 await view('none');
 }
 assert.deepEqual(errors,[]);
 const failed=checks.filter(c=>!c.pass);await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify({checks,errors,failed:failed.length,actualReact:true},null,2));
 console.log(JSON.stringify(checks,null,2));if(expectDefects)assert.ok(failed.length>0,'Baseline must reproduce defects');else assert.deepEqual(failed,[]);
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
