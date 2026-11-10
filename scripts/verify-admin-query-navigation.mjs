// Real SaaS components with delayed App Router acknowledgements and held HTTP.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const out=path.resolve(process.argv[2]||'output/admin-final-audit/ui'),baseline=process.argv.includes('--expect-defects');await fs.mkdir(out,{recursive:true});
const navigation=`import{useState,useEffect}from'react';const listeners=new Set(),replace=history.replaceState.bind(history);
history.replaceState=(state,unused,url)=>{replace(state,unused,url);for(const update of listeners)update()};
export const usePathname=()=>location.pathname;
export function useSearchParams(){const [value,set]=useState(location.search);useEffect(()=>{const update=()=>set(location.search);listeners.add(update);return()=>listeners.delete(update)},[]);return new URLSearchParams(value)}
export const useRouter=()=>({replace:href=>audit.navigation.push(href),push:href=>audit.navigation.push(href)});`;
const entry=`import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{PlatformConsole}from'./src/components/saas/platform-console';import{CreationBrowser}from'./src/components/saas/creation-browser';
window.audit={calls:[],navigation:[]};window.fetch=(url,init={})=>{const call={url:String(url),aborted:!!init.signal?.aborted};audit.calls.push(call);init.signal?.addEventListener('abort',()=>call.aborted=true);return new Promise(resolve=>{call.resolve=body=>resolve(Response.json(body))})};
function App(){const[view,set]=useState('tenants');window.setView=set;return view==='tenants'?<PlatformConsole view="tenants" embedded/>:view==='creation'?<CreationBrowser/>:<p>Unmounted</p>};createRoot(document.getElementById('root')).render(<App/>);`;
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},outfile:path.join(out,'app.js'),bundle:true,minify:true,jsx:'automatic',platform:'browser',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'ports',setup(b){
 b.onResolve({filter:/^(next\/navigation|next\/link|@\/lib\/supabase|@\/lib\/auth-context)$/},a=>({path:a.path,namespace:'port'}));
 b.onLoad({filter:/.*/,namespace:'port'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/navigation'?navigation:a.path==='next/link'?`import React from'react';export default({prefetch,...props})=><a {...props}/>`:a.path.endsWith('auth-context')?`export const useAuth=()=>({user:{email:'fixture@test'},ready:true});`:`export const authHeader=async()=>({});export const browserSupabase=()=>null;`}));
}}]});
const server=createServer(async(req,res)=>{if(req.url==='/app.js'||req.url==='/app.css'){res.setHeader('content-type',req.url.endsWith('js')?'application/javascript':'text/css');res.end(await fs.readFile(path.join(out,req.url.slice(1))));}else{res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>')}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const checks=[],errors=[];const check=(name,actual,expected)=>checks.push({name,actual,expected,pass:JSON.stringify(actual)===JSON.stringify(expected)});
try{
 browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',error=>errors.push(error.message));
 const intended=()=>page.evaluate(()=>audit.navigation.at(-1)||location.href);
 const view=async(name,url)=>{await page.evaluate(()=>setView('none'));await page.waitForTimeout(40);await page.evaluate(({name,url})=>{audit.navigation=[];history.replaceState(null,'',url);setView(name)},{name,url});await page.waitForTimeout(80)};
 await page.goto(`http://127.0.0.1:${server.address().port}/admin/tenants?keep=1#section`);
 await page.getByLabel('搜索企业名称或负责人').fill('north');await page.waitForTimeout(320);await page.getByLabel('租户状态').selectOption('active');await page.waitForTimeout(60);
 let params=new URL(await intended(),'http://fixture').searchParams;
 check('Tenant search survives immediate status change',params.get('q'),'north');check('Tenant unrelated parameters survive',params.get('keep'),'1');
 check('Client filters avoid redundant server navigations',await page.evaluate(()=>audit.navigation.length),0);
 await view('creation','/admin/creations?creationId=old&assetPage=2&keep=1#section');
 await page.getByLabel('搜索创作记录').fill('scene');await page.waitForTimeout(320);await page.locator('summary').filter({hasText:'筛选'}).click();
 await page.getByLabel('成员账号').fill('member@example.test');await page.waitForTimeout(320);
 params=new URL(await intended(),'http://fixture').searchParams;
 check('Creation search and member filter compose',params.get('q'),'scene');check('Member filter remains selected',params.get('user'),'member@example.test');
 check('List change clears prior detail pages',[params.has('creationId'),params.has('assetPage')],[false,false]);
 check('Unrelated parameters and URL fragment survive',[params.get('keep'),new URL(await intended(),'http://fixture').hash],['1','#section']);
 await view('creation','/admin/creations?creationId=record-1');
 const pending=await page.evaluate(()=>({list:audit.calls.findLastIndex(c=>c.url.startsWith('/api/admin/creations?')),detail:audit.calls.findLastIndex(c=>c.url.startsWith('/api/admin/creations/record-1?'))}));
 await page.evaluate(()=>window.dispatchEvent(new Event('naumi:cache-session-ended')));await page.waitForTimeout(60);
 check('Session end aborts list and detail reads',await page.evaluate(p=>[audit.calls[p.list].aborted,audit.calls[p.detail].aborted],pending),[true,true]);
 await page.evaluate(index=>audit.calls[index].resolve({items:[{id:'late',title:'late private row',actorName:'fixture',status:'succeeded',acceptedAt:'2026-11-10T00:00:00Z'}],pagination:{page:1,size:20,total:1},appliedFilters:{from:'2026-11-01',to:'2026-11-10'}}),pending.list);await page.waitForTimeout(100);
 check('Late private list cannot reappear after logout',await page.getByText('late private row',{exact:true}).count(),0);
 check('Logout ends pending-detail placeholder',await page.getByText('正在读取详情',{exact:true}).count(),0);
 const before=await page.evaluate(()=>audit.calls.length);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('button',{name:'刷新创作记录'}).click();await page.waitForTimeout(100);
 check('Focus/manual refresh do not revive ended session',await page.evaluate(()=>audit.calls.length),before);
 await page.screenshot({path:path.join(out,'session-ended.png'),fullPage:true});assert.deepEqual(errors,[]);
 const failed=checks.filter(c=>!c.pass);await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify({checks,failed:failed.length,errors},null,2));console.log(JSON.stringify(checks,null,2));
 if(baseline)assert.ok(failed.length>0);else assert.deepEqual(failed,[]);
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
