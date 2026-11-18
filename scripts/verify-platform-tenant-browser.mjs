import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const baseline=process.argv.includes('--baseline');
const bundle=await build({stdin:{contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {PlatformConsole} from '@/components/saas/platform-console';
 createRoot(document.getElementById('root')).render(<PlatformConsole view="tenant" tenantId="fixture-tenant"/>);
`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',platform:'browser',format:'iife',
 outfile:'output/platform-tenant-browser/app.js',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},
 plugins:[{name:'platform-tenant-fixture',setup(plugin){
  plugin.onResolve({filter:/^(next\/(?:link|navigation)|@\/lib\/supabase|@\/components\/admin\/center-shell|\.\/(?:creation-browser|tenant-usage-panel|trend-chart))$/},a=>({path:a.path,namespace:'fixture'}));
  plugin.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path==='next/navigation'?`
    import {useSyncExternalStore,useMemo} from 'react';
    const watch=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);};
    export function usePathname(){return location.pathname;}
    export function useSearchParams(){const s=useSyncExternalStore(watch,()=>location.search);return useMemo(()=>new URLSearchParams(s),[s]);}
    export function useRouter(){return {};}
   `:a.path==='next/link'?`
    import React from 'react';
    export default function Link({href,children,...rest}){return React.createElement('a',{...rest,href,onClick:e=>{e.preventDefault();history.pushState(null,'',href);window.dispatchEvent(new PopStateEvent('popstate'));}},children);}
   `:a.path==='@/lib/supabase'?'export async function authHeader(){return {}}':
    `export const AdminCenterShell=({children})=>children,CreationBrowser=()=>'独立创作入口',TenantUsagePanel=()=>'独立账务入口',TrendChart=()=>null;`}));
 }}]});
const tenant={tenantId:'fixture-tenant',name:'测试企业',owner:{email:'owner@example.test',name:'所有者'},status:'active',
 entitlementName:null,validUntil:null,seatLimit:null,activeMembers:2,version:1,featurePolicy:{},createdAt:'2026-01-01'};
const members=[{name:'只在成员页展示',email:'member@example.test',role_name:'成员',supervisor_email:tenant.owner.email,employment:'permanent',membership_status:'active'}];
const audit=[{id:'fixture-audit',actor:'owner@example.test',action:'update',reason:'只在审计页展示',created_at:'2026-01-01T00:00:00Z'}];
const hits=[];let hold=false,held,closed=0,legacy=baseline;
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/api/admin/tenants/fixture-tenant'){
  const view=url.searchParams.get('projection')||'full';hits.push(view);
  if(hold&&view==='members'){held=res;res.once('close',()=>{if(!res.writableFinished)closed++;});return;}
  res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({tenant,members:legacy||view==='members'?members:[],roles:[],audit:legacy||view==='audit'?audit:[]}));return;
 }
 const file=bundle.outputFiles.find(f=>url.pathname!=='/'&&f.path.replaceAll('\\','/').endsWith(url.pathname));
 if(file){res.writeHead(200,{'content-type':url.pathname.endsWith('.css')?'text/css':'text/javascript'}).end(file.contents);return;}
 res.end('<!doctype html><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
});
async function until(check,label){const end=Date.now()+6000;while(!check()){assert.ok(Date.now()<end,label);await delay(18);}}
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
 const tabs=page.getByRole('navigation',{name:'租户详情标签'}),tab=name=>tabs.getByRole('link',{name,exact:true});
 await page.goto(origin+'/admin/tenants/fixture-tenant');await page.getByRole('heading',{name:/测试企业/}).waitFor();
 if(baseline){assert.deepEqual(hits,['full']);await tab('成员与权限').click();await page.getByText('只在成员页展示').waitFor();
  assert.deepEqual(hits,['full']);console.log('PLATFORM_TENANT_BROWSER_BASELINE=PASS FULL_BEFORE_MEMBERS=1');
 }else{
  assert.deepEqual(hits,['summary']);
  await tab('账务').click();await page.getByText('独立账务入口').waitFor();assert.deepEqual(hits,['summary']);
  hold=true;await tab('成员与权限').click();await until(()=>held,'members did not start');
  await page.getByRole('status').filter({hasText:'正在读取租户详情'}).waitFor();
  await tab('操作记录').click();await until(()=>closed===1,'leaving members did not abort');await page.getByText('只在审计页展示').waitFor();
  assert.deepEqual(hits,['summary','members','audit']);assert.equal(await page.getByText('只在成员页展示').count(),0);
  hold=false;await tab('成员与权限').click();await page.getByText('只在成员页展示').waitFor();assert.equal(await page.getByText('只在审计页展示').count(),0);
  legacy=true;await page.goto(origin+'/admin/tenants/fixture-tenant?tab=members');await page.getByText('只在成员页展示').waitFor();
  assert.equal(hits.at(-1),'members');assert.deepEqual(errors,[]);
  console.log('PLATFORM_TENANT_BROWSER=PASS SUMMARY_FIRST=1 SAME_PROJECTION_NO_REFETCH=1 MEMBER_ABORT=1 AUDIT_ISOLATION=1 LEGACY_SERVER=1 ACTUAL_REACT=1');
 }
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
