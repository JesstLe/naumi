// Actual production React components; only HTTP/auth/Next navigation are fixture ports.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import sharp from 'sharp';

const out=path.resolve(process.argv[2]||'output/admin-query/ui');await fs.mkdir(out,{recursive:true});
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
import {CreationMedia} from './src/components/saas/creation-browser';
import {FleetManager} from './src/components/admin/fleet-manager';
import {ModelHealthPanel} from './src/components/admin/model-health/model-health';
import {AdminUsagePanel} from './src/components/admin/usage/usage-panel';
window.fixture={calls:[],commits:[],created:[],revoked:[]};const f=window.fixture;
const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=create(blob);f.created.push(url);return url};URL.revokeObjectURL=url=>{f.revoked.push(url);revoke(url)};
window.fetch=(input,init={})=>{const url=String(input),call={url,aborted:!!init.signal?.aborted};f.calls.push(call);init.signal?.addEventListener('abort',()=>call.aborted=true);
if(url.startsWith('/fixture-image'))return Promise.resolve(new Response(Uint8Array.from(atob('${fixturePng}'),c=>c.charCodeAt(0)),{headers:{'content-type':'image/png'}}));
return new Promise(resolve=>{call.resolve=value=>resolve(Response.json(value))})};
function Library(){const lib=useSupplierLibrary();return <><button onClick={()=>lib.change('q','second')}>second</button><button onClick={()=>lib.change('q','third')}>third</button><output id="library">{lib.listing?.total}</output></>}
function Query(){const [value,set]=useState('');window.externalQuery=set;return <><AdminQueryInput aria-label="query" value={value} onCommit={v=>{f.commits.push(v);window.pendingQuery=v}}/><button onClick={()=>set(window.pendingQuery)}>acknowledge</button></>}
const media={id:'image',direction:'output',role:'result',mediaType:'image',availability:'recorded',position:0};
function App(){const [view,setView]=useState('bi'),[days,setDays]=useState(30);window.setView=setView;const params=useSearchParams();return view==='bi'?<BiDashboard embedded initialSection={params.get('section')||'users'}/>:view==='library'?<Library/>:view==='query'?<Query/>:view==='media'?<><div style={{height:1800}}>Scroll to media</div><CreationMedia asset={media} api="/fixture-image"/></>:view==='fleet'?<FleetManager/>:view==='health'?<ModelHealthPanel/>:view==='usage'?<AdminUsagePanel token="local" usageDays={days} setUsageDays={setDays} onManageUsers={()=>{}}/>:<p>Unmounted</p>}
createRoot(document.getElementById('root')).render(<App/>);`;
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},outfile:path.join(out,'app.js'),bundle:true,jsx:'automatic',platform:'browser',minify:true,define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'ports',setup(b){
 b.onResolve({filter:/^(next\/navigation|next\/link|@\/lib\/supabase|@\/lib\/auth-context)$/},a=>({path:a.path,namespace:'port'}));
 b.onLoad({filter:/.*/,namespace:'port'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/navigation'?navigation:a.path==='next/link'?`import React from 'react';export default ({prefetch,...props})=><a {...props}/>`:a.path.endsWith('auth-context')?`export const useAuth=()=>({user:{email:'fixture@test'},ready:true});`:`export const authHeader=async()=>({});export const browserSupabase=()=>null;`}));
}}]});
const server=createServer(async(req,res)=>{if(req.url==='/app.js'||req.url==='/app.css'){res.setHeader('content-type',req.url.endsWith('js')?'application/javascript':'text/css');res.end(await fs.readFile(path.join(out,req.url.slice(1))));}else{res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:#f7f9fc;font:14px system-ui}button,input{font:inherit}</style><div id="root"></div><script src="/app.js"></script></html>')}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const checks=[],errors=[];
try{
 browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));
 const calls=prefix=>page.evaluate(prefix=>fixture.calls.filter(c=>c.url.startsWith(prefix)).map(({resolve,...c})=>c),prefix);
 const resolve=async(prefix,index,body)=>page.evaluate(({prefix,index,body})=>fixture.calls.filter(c=>c.url.startsWith(prefix))[index].resolve(body),{prefix,index,body});
 const waitCount=async(prefix,n)=>page.waitForFunction(({prefix,n})=>fixture.calls.filter(c=>c.url.startsWith(prefix)).length>=n,{prefix,n});
 const view=async name=>{await page.evaluate(name=>setView(name),name);await page.waitForTimeout(60)};
 await page.goto(`http://127.0.0.1:${server.address().port}/?section=users`);await waitCount('/api/admin/bi?',1);await page.waitForTimeout(100);
 assert.equal((await calls('/api/admin/bi?')).length,1,'Initial URL synchronization must not double-read');
 await page.getByLabel('搜索账户',{exact:true}).fill('new-user');await page.locator('form').first().evaluate(form=>form.requestSubmit());
 await waitCount('/api/admin/bi?',2);await page.waitForTimeout(100);assert.equal((await calls('/api/admin/bi?')).length,2,'URL acknowledgement must not resend query');
 const biBody=name=>({section:'users',rows:[{email:name+'@test',name}],total:1,page:1,size:30,generatedAt:'2026-11-10T00:00:00Z',query:{from:'2026-10-11',to:'2026-11-10'}});
 await resolve('/api/admin/bi?',1,biBody('latest-user'));await resolve('/api/admin/bi?',0,biBody('stale-user'));await page.getByText('latest-user',{exact:true}).waitFor();
 assert.equal(await page.getByText('stale-user',{exact:true}).count(),0);assert.equal((await calls('/api/admin/bi?'))[0].aborted,true);
 await page.screenshot({path:path.join(out,'bi.png'),fullPage:true});checks.push('BI initial/filter URL synchronization: one read; stale completion ignored');
 await view('library');await waitCount('/api/admin/model-management/library',1);await resolve('/api/admin/model-management/library',0,{total:1});
 await page.getByRole('button',{name:'second',exact:true}).click();await waitCount('/api/admin/model-management/library',2);
 await page.getByRole('button',{name:'third',exact:true}).click();await waitCount('/api/admin/model-management/library',3);
 await resolve('/api/admin/model-management/library',2,{total:3});await resolve('/api/admin/model-management/library',1,{total:2});await page.waitForFunction(()=>document.querySelector('#library')?.textContent==='3');
 assert.equal((await calls('/api/admin/model-management/library'))[1].aborted,true);await view('none');assert.equal((await calls('/api/admin/model-management/library'))[2].aborted,true);checks.push('Supplier hook: changed filters/unmount abort; late read never replaces latest');
 await view('query');await page.getByLabel('query').pressSequentially('Directory',{delay:20});await page.waitForTimeout(300);assert.deepEqual(await page.evaluate(()=>fixture.commits),['Directory']);
 await page.getByLabel('query').fill('Directory new');await page.getByRole('button',{name:'acknowledge'}).click();assert.equal(await page.getByLabel('query').inputValue(),'Directory new');
 await page.waitForTimeout(300);await page.getByRole('button',{name:'acknowledge'}).click();await page.evaluate(()=>externalQuery('back-navigation'));await page.waitForFunction(()=>document.querySelector('input')?.value==='back-navigation');
 await page.getByLabel('query').fill('discard');await view('none');await page.waitForTimeout(300);assert.deepEqual(await page.evaluate(()=>fixture.commits),['Directory','Directory new']);checks.push('Text search: immediate typing, one debounced commit, delayed acknowledgement/back/unmount');
 await view('media');assert.equal((await calls('/fixture-image')).length,0,'Offscreen assets must not download');
 await page.getByText('Scroll to media').evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await waitCount('/fixture-image',1);await page.waitForFunction(()=>fixture.created.length===1);
 await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth===320);await page.getByRole('button',{name:'放大图片',exact:true}).click();await page.getByRole('dialog',{name:'图片预览'}).waitFor();await page.screenshot({path:path.join(out,'media.png'),fullPage:true});await page.getByRole('button',{name:'关闭预览'}).click();await view('none');assert.deepEqual(await page.evaluate(()=>fixture.revoked),await page.evaluate(()=>fixture.created));checks.push('Media: no offscreen request, visible read once, object URL released');
 await page.evaluate(()=>window.scrollTo(0,0));await view('usage');await waitCount('/api/admin/usage?',1);
 const users=Array.from({length:30},(_,i)=>({email:'member-'+i+'@test',name:'Member '+i,role:'user',credits:6,operations:1,balance:90,lastUsedAt:null}));
 const usage={rangeDays:30,totals:{credits:600,operations:100,activeUsers:100},users,daily:[],pagination:{page:1,size:30,total:100}};
 await resolve('/api/admin/usage?',0,usage);await waitCount('/api/admin/users?view=members',1);
 const directoryCall=(await calls('/api/admin/users?view=members'))[0];assert.equal(new URL(directoryCall.url,'http://fixture').searchParams.getAll('member').length,30);
 await resolve('/api/admin/users?view=members',0,{users:users.map(u=>({...u,plan:'free',creditsTotal:100,creditsUsed:10,artworks:0,banned:false,lastIp:null,recent7:6,note:''}))});
 assert.equal(await page.locator('tbody tr').count(),30);await page.getByRole('button',{name:'下一页',exact:true}).click();await waitCount('/api/admin/usage?',2);assert.ok((await calls('/api/admin/usage?'))[1].url.includes('page=2'));
 await resolve('/api/admin/usage?',1,{...usage,users:users.map(u=>({...u,email:'next-'+u.email})),pagination:{page:2,size:30,total:100}});
 await page.screenshot({path:path.join(out,'usage.png'),fullPage:true});checks.push('Usage: 30 rendered rows, 30 scoped member reads, next page requests page=2');
 await view('fleet');await waitCount('/api/admin/fleet',1);await page.waitForTimeout(10500);assert.equal((await calls('/api/admin/fleet')).length,1,'Slow read must not accumulate interval requests');
 await view('none');assert.equal((await calls('/api/admin/fleet'))[0].aborted,true);checks.push('Fleet: a >10s read stays single-flight and aborts on unmount');
 await view('health');await waitCount('/api/admin/model-health',1);await view('none');assert.equal((await calls('/api/admin/model-health'))[0].aborted,true);checks.push('Health: pending initial read aborted on unmount');
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify({checks,errors,realReact:true,http:'fixture',productionWrites:0},null,2));console.log('ADMIN_QUERY_UI=PASS '+JSON.stringify(checks));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
