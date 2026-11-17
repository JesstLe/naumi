import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const baseline=process.argv.includes('--baseline'),a={id:'sample-a',name:'企业 A',owner_email:'owner@example.test',owner:true,authorized_until:null},
 b={...a,id:'sample-b',name:'企业 B'};
const members=(count,prefix)=>Array.from({length:count},(_,i)=>({email:`${prefix}-${i+1}@example.test`,name:`${prefix} ${i+1}`,
 supervisor_email:i===0?`${prefix}-${count}@example.test`:a.owner_email,position:i>=count-3?'包装设计':'电商设计-美工',
 role_id:null,role_name:'成员',level:999,employment:'permanent',version:1,management_version:1,banned:false,
 membership_status:'active',membership_expires_at:null,available:18,consumed:4,artworks:2,legacy_metrics_state:'recorded',account_role:'user',canManage:true}));
const data=new Map([[a.id,{enterprise:a,members:members(1801,'甲')}],[b.id,{enterprise:b,members:members(4,'乙')}]]);
const snapshots=id=>({...data.get(id),roles:[],actor:{owner:true,manageMembers:true,viewRecords:true,level:0,scopeLabel:'本企业'},
 ownerAvailable:null,entitlement:{name:null,seatLimit:null,featurePolicy:{}}});
const asset=await build({stdin:{contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {EnterpriseConsole} from '@/components/enterprise/enterprise-console';
 createRoot(document.getElementById('root')).render(<EnterpriseConsole initialQuery={{view:'members'}}/>);
 `,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',platform:'browser',format:'iife',
 define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},
 outfile:'output/enterprise-directory-browser/app.js',plugins:[{name:'isolated-enterprise-fixture',setup(plugin){
  plugin.onResolve({filter:/^(?:@\/lib\/(?:site-control\/client|auth-context|supabase)|@\/components\/(?:admin\/bi\/user-usage|saas\/(?:tenant-usage-panel|creation-browser))|\.\/(?:enterprise-health|enterprise-artworks|enterprise-history-usage|enterprise-saas-overview))$/},
   args=>({path:args.path,namespace:'fixture'}));
  plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.endsWith('/client')?`
   export function useSiteProfile(){return new URLSearchParams(location.search).has('dedicated')?{mode:'enterprise',policy:{brand:'测试'}}:{mode:'shared'}}
   `:args.path.endsWith('/auth-context')?`export function useAuth(){return {ready:true,user:{email:'owner@example.test',name:'Fixture'}}}`:
   args.path.endsWith('/supabase')?`export async function authHeader(){return {}}`:`
   export const UserUsage=()=>null,TenantUsagePanel=()=>null,CreationBrowser=()=>null,EnterpriseHealthPanel=()=>null,
    EnterpriseArtworks=()=>null,EnterpriseHistoryUsage=()=>null,EnterpriseSaasOverview=()=>null,EnterpriseEntitlement=()=>null;`}));
 }}]});
const reads=[],tags=new Map([[a.id,'"fixture-alpha"'],[b.id,'"fixture-beta"']]);
let hold=false,held,aborts=0,denied=false,plain=baseline,zeroBodies=0;
const send=(res,value,status=200,headers={})=>{if(!res.destroyed)res.writeHead(status,{'content-type':'application/json','cache-control':'private, no-store',...headers}).end(value===null?'':JSON.stringify(value));};
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture'),id=url.searchParams.get('enterpriseId');
 if(url.pathname==='/api/enterprise'){
  if(!id)return send(res,{enterprises:[a,b]});
  const tag=req.headers['if-none-match']||null;reads.push({id,tag});
  if(id===a.id&&hold){held=res;res.once('close',()=>{if(!res.writableFinished)aborts++;});return;}
  if(id===b.id&&denied)return send(res,{error:'企业权限已撤销'},403);
  const current=tags.get(id);
  if(!plain&&tag===current){zeroBodies++;return send(res,null,304,{etag:current});}
  return send(res,snapshots(id),200,plain?{}:{etag:'W/'+current});
 }
 if(url.pathname==='/api/enterprise/saas-overview')return send(res,{activities:[]});
 const file=asset.outputFiles.find(f=>f.path.replaceAll('\\','/').endsWith(url.pathname)&&url.pathname!=='/');
 if(file){res.writeHead(200,{'content-type':url.pathname.endsWith('.css')?'text/css':'text/javascript'}).end(file.contents);return;}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
});
async function until(check,message){const end=Date.now()+6000;while(!await check()){assert.ok(Date.now()<end,message);await delay(25);}}
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(10000);
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const rows=page.locator('table tbody tr'),refresh=page.getByRole('button',{name:'刷新数据'});
 await page.goto(origin+'/enterprise');
 try{await rows.first().waitFor();}catch(error){
  console.error(JSON.stringify({files:asset.outputFiles.map(f=>f.path),reads,errors,body:(await page.locator('body').innerText()).slice(0,400)}));
  throw error;
 }
 const refreshResponse=()=>{
  const received=page.waitForResponse(r=>new URL(r.url()).searchParams.has('enterpriseId'));
  return Promise.all([received,refresh.click()]).then(([r])=>r);
 };
 assert.equal(await rows.count(),baseline?1801:50);
 if(baseline){
  assert.equal((await refreshResponse()).status(),200);assert.equal(reads.at(-1).tag,null);
  console.log('ENTERPRISE_DIRECTORY_BROWSER_BASELINE=PASS RENDERED_ROWS=1801 DUPLICATE_RESPONSE=200');
 }else{
  assert.match(await rows.first().innerText(),/甲 1801/);
  await page.getByLabel('搜索成员').fill('甲 1801');assert.equal(await rows.count(),1);
  assert.match(await rows.first().innerText(),/甲 1801/);await page.getByLabel('搜索成员').fill('');assert.equal(await rows.count(),50);
  await page.getByRole('button',{name:'下一页'}).click();assert.match(await rows.first().innerText(),/甲 51/);
  assert.equal((await refreshResponse()).status(),304);assert.equal(zeroBodies,1);assert.equal(reads.at(-1).tag,tags.get(a.id));
  assert.match(await rows.first().innerText(),/甲 51/);
  hold=true;const clicking=refresh.click();await until(()=>held,'held tenant request did not start');await clicking;
  await page.getByLabel('当前企业').selectOption(b.id);await until(()=>aborts===1,'tenant switch did not cancel previous request');
  await page.getByRole('button',{name:'组织与成员'}).click();await rows.first().waitFor();
  assert.match(await rows.first().innerText(),/乙 1/);assert.equal(reads.find(r=>r.id===b.id).tag,null);
  denied=true;assert.equal((await refreshResponse()).status(),403);
  await page.getByRole('alert').filter({hasText:'企业权限已撤销'}).waitFor();assert.equal(await rows.count(),0);
  denied=false;const retry=page.waitForResponse(r=>new URL(r.url()).searchParams.has('enterpriseId'));
  await page.getByRole('button',{name:'重试',exact:true}).click();assert.equal((await retry).status(),200);
  assert.equal(reads.at(-1).tag,null);await rows.first().waitFor();
  // An old server can still return full untagged snapshots. Dedicated filters
  // operate on all members and restart paging rather than filtering one page.
  hold=false;plain=true;await page.goto(origin+'/enterprise?dedicated=1');await rows.first().waitFor();
  await page.getByRole('button',{name:'下一页'}).click();await page.getByLabel('岗位筛选').selectOption('包装设计');
  assert.equal(await rows.count(),3);assert.match(await rows.first().innerText(),/甲 1799/);
  await rows.first().getByRole('button',{name:'账号与积分'}).click();
  await page.getByLabel('成员账号操作').selectOption('adjust');
  assert.equal(await page.getByLabel('积分增减').getAttribute('min'),'-18');
  assert.equal((await refreshResponse()).status(),200);assert.equal(reads.at(-1).tag,null);
  assert.deepEqual(errors,[]);
  console.log('ENTERPRISE_DIRECTORY_BROWSER=PASS RENDERED_ROWS=50 NOT_MODIFIED=1 TENANT_ABORT=1 REVOKED_CLEARS=1 FILTER_SCOPE=1 LEGACY_SERVER=1 ACTUAL_REACT=1');
 }
}finally{
 await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
