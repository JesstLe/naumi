// Actual production React components; only HTTP/auth/Next navigation are fixture ports.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import sharp from 'sharp';

const out=path.resolve(process.argv[2]||'output/admin-details-audit/ui');await fs.mkdir(out,{recursive:true});
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
import {SupplierModelLibrary} from './src/components/admin/model-management/supplier-model-library';
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
return new Promise(resolve=>{call.resolve=(value,status=200)=>resolve(Response.json(value,{status}))})};
function Library(){const lib=useSupplierLibrary();return <><button onClick={()=>lib.change('q','second')}>second</button><button onClick={()=>lib.change('q','third')}>third</button><output id="library">{lib.listing?.total}</output></>}
function Query(){const [value,set]=useState('');window.externalQuery=set;return <><AdminQueryInput aria-label="query" value={value} onCommit={v=>{f.commits.push(v);window.pendingQuery=v}}/><button onClick={()=>set(window.pendingQuery)}>acknowledge</button></>}
const media={id:'image',direction:'output',role:'result',mediaType:'image',availability:'recorded',position:0};
function App(){const [view,setView]=useState('bi'),[days,setDays]=useState(30);window.setView=setView;const params=useSearchParams();return view==='bi'?<BiDashboard embedded initialSection={params.get('section')||'users'}/>:view==='library'?<SupplierModelLibrary/>:view==='query'?<Query/>:view==='media'?<><div style={{height:1800}}>Scroll to media</div><CreationMedia asset={media} api="/fixture-image"/></>:view==='fleet'?<FleetManager/>:view==='health'?<ModelHealthPanel/>:view==='usage'?<AdminUsagePanel token="local" usageDays={days} setUsageDays={setDays} onManageUsers={()=>{}}/>:<p>Unmounted</p>}
createRoot(document.getElementById('root')).render(<App/>);`;
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},outfile:path.join(out,'app.js'),bundle:true,jsx:'automatic',platform:'browser',minify:true,define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'ports',setup(b){
 b.onResolve({filter:/^(next\/navigation|next\/link|@\/lib\/supabase|@\/lib\/auth-context)$/},a=>({path:a.path,namespace:'port'}));
 b.onLoad({filter:/.*/,namespace:'port'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/navigation'?navigation:a.path==='next/link'?`import React from 'react';export default ({prefetch,...props})=><a {...props}/>`:a.path.endsWith('auth-context')?`export const useAuth=()=>({user:{email:'fixture@test'},ready:true});`:`export const authHeader=async()=>({});export const browserSupabase=()=>null;`}));
}}]});
const server=createServer(async(req,res)=>{if(req.url==='/app.js'||req.url==='/app.css'){res.setHeader('content-type',req.url.endsWith('js')?'application/javascript':'text/css');res.end(await fs.readFile(path.join(out,req.url.slice(1))));}else{res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:#f7f9fc;font:14px system-ui}button,input{font:inherit}</style><div id="root"></div><script src="/app.js"></script></html>')}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const checks=[],errors=[],baseline=process.argv.includes('--expect-defects');
const check=(name,actual,expected)=>checks.push({name,actual,expected,pass:JSON.stringify(actual)===JSON.stringify(expected)});
try{
 browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const waitCalls=(prefix,n)=>page.waitForFunction(({prefix,n})=>fixture.calls.filter(c=>c.url.startsWith(prefix)).length>=n,{prefix,n});
 const resolve=(prefix,index,body,status=200)=>page.evaluate(({prefix,index,body,status})=>fixture.calls.filter(c=>c.url.startsWith(prefix))[index].resolve(body,status),{prefix,index,body,status});
 const count=prefix=>page.evaluate(prefix=>fixture.calls.filter(c=>c.url.startsWith(prefix)).length,prefix);
 const last=prefix=>page.evaluate(prefix=>fixture.calls.filter(c=>c.url.startsWith(prefix)).map(({resolve,...value})=>value).at(-1),prefix);
 const bi=(section,rows)=>({section,rows,total:rows.length,page:1,size:30,generatedAt:'2026-11-10T00:00:00Z',query:{from:'2026-11-01',to:'2026-11-10'}});
 const child={id:'child',email:'fixture@example.test',title:'child artwork',source_artwork_id:'parent',job_id:'job',has_image:false,input_count:0};
 await page.goto(origin+'/?section=artworks');await waitCalls('/api/admin/bi?',1);await resolve('/api/admin/bi?',0,bi('artworks',[child]));
 await page.getByRole('button',{name:'查看',exact:true}).click();await page.getByRole('button',{name:'查看复制源作品'}).click();await waitCalls('/api/admin/bi?',2);
 await page.getByRole('button',{name:'关闭详情'}).click();check('Closing drawer aborts source-artwork lookup',(await last('/api/admin/bi?')).aborted,true);
 await resolve('/api/admin/bi?',1,bi('artworks',[{...child,id:'parent',title:'late parent'}]));await page.waitForTimeout(80);
 check('Late source lookup never reopens closed drawer',await page.getByRole('dialog',{name:'记录详情'}).count(),0);
 if(await page.getByRole('button',{name:'关闭详情'}).count())await page.getByRole('button',{name:'关闭详情'}).click();
 await page.getByRole('button',{name:'查看',exact:true}).click();await page.getByRole('button',{name:'读取执行证据'}).click();await waitCalls('/api/admin/bi/trace?',1);
 await page.getByRole('button',{name:'关闭详情'}).click();check('Closing drawer aborts execution trace',(await last('/api/admin/bi/trace?')).aborted,true);await resolve('/api/admin/bi/trace?',0,{attempts:[]});
 await page.getByRole('button',{name:'查看',exact:true}).click();await page.getByRole('button',{name:'查看复制源作品'}).click();await waitCalls('/api/admin/bi?',3);await page.getByRole('button',{name:'关闭详情'}).click();
 await resolve('/api/admin/bi?',2,{error:'late source failure'},503);await page.waitForTimeout(60);check('Closed source errors do not leak into current page',await page.getByRole('status').filter({hasText:'late source failure'}).count(),0);
 await page.goto(origin+'/?section=conversations');await waitCalls('/api/admin/bi?',1);await resolve('/api/admin/bi?',0,bi('conversations',[{id:'conversation',email:'fixture@example.test',title:'conversation fixture',source:'agent'}]));
 await page.getByRole('button',{name:'查看',exact:true}).click();await waitCalls('/api/admin/bi/conversation?',1);await resolve('/api/admin/bi/conversation?',0,{error:'temporary failure'},503);await page.getByText('无法读取对话内容',{exact:true}).waitFor();
 const retry=page.getByRole('button',{name:'重试',exact:true});check('Conversation read failure offers retry',await retry.count(),1);
 if(await retry.count()){await retry.click();await waitCalls('/api/admin/bi/conversation?',2);await resolve('/api/admin/bi/conversation?',1,{messages:[{role:'user',text:'recovered conversation',truncated:false}],total:1,size:20});await page.getByText('recovered conversation',{exact:true}).waitFor();}

 await page.evaluate(()=>setView('library'));const endpoint='/api/admin/model-management/library';await waitCalls(endpoint,1);
 const model={id:'fixture-model',modelId:'fixture',providerId:'p',providerName:'Fixture Provider',label:'Old library row',family:'Family',brand:'Brand',modality:'image',revision:1,capabilityState:'unknown',capabilitySource:'',catalogOwner:'',checkedAt:'',capabilities:{resolutions:['1K']},prices:[]};
 const listing={models:[model],total:1,page:1,pageSize:50,providers:[{id:'p',name:'Fixture Provider',enabled:true}],facets:{providers:[{id:'p',name:'Fixture Provider'}],families:['Family'],brands:['Brand']}};
 await resolve(endpoint,0,listing);await page.getByText('Old library row',{exact:true}).waitFor();await page.getByLabel('搜索供应商模型').fill('new query');await page.getByRole('button',{name:'搜索',exact:true}).click();await waitCalls(endpoint,2);
 check('Pending library filter does not show previous rows',await page.getByText('Old library row',{exact:true}).count(),0);
 check('Pending library filter cannot export mismatched page',await page.getByRole('button',{name:'导出当前页'}).isDisabled(),true);
 check('Filter choices stay available while rows change',await page.getByLabel('供应商',{exact:true}).locator('option').count(),2);
 await resolve(endpoint,1,{error:'library failed'},503);await page.getByRole('alert').waitFor();check('Failed library query never retains old rows',await page.getByText('Old library row',{exact:true}).count(),0);
 await page.getByRole('button',{name:'刷新元数据库'}).click();await waitCalls(endpoint,3);await resolve(endpoint,2,{...listing,models:[{...model,label:'Current library row'}]});await page.getByText('Current library row',{exact:true}).waitFor();
 await page.getByRole('button',{name:'刷新元数据库'}).click();await waitCalls(endpoint,4);await resolve(endpoint,3,{error:'denied'},403);await page.getByText('denied',{exact:true}).waitFor();
 check('Denied library refresh clears cached data',await page.getByText('Current library row',{exact:true}).count(),0);
 check('Denied library refresh disables export',await page.getByRole('button',{name:'导出当前页'}).isDisabled(),true);
 await page.getByRole('button',{name:'刷新元数据库'}).click();await waitCalls(endpoint,5);await resolve(endpoint,4,listing);await page.getByText('Old library row',{exact:true}).waitFor();
 await page.getByRole('button',{name:'导出当前页'}).click();await waitCalls(endpoint,6);await page.evaluate(()=>setView('none'));await page.waitForTimeout(50);
 check('Leaving library aborts full-page export read',(await last(endpoint)).aborted,true);await resolve(endpoint,5,{models:[model]});
 assert.deepEqual(errors,[]);const failed=checks.filter(c=>!c.pass);await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify({checks,failed:failed.length,errors},null,2));console.log(JSON.stringify(checks,null,2));
 if(baseline)assert.ok(failed.length>0);else assert.deepEqual(failed,[]);
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
