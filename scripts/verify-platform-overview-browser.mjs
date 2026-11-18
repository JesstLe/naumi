import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const baseline=process.argv.includes('--baseline');
const bundle=await build({stdin:{contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {PlatformConsole} from '@/components/saas/platform-console';
 const replace=history.replaceState.bind(history);
 history.replaceState=(...args)=>{replace(...args);dispatchEvent(new PopStateEvent('popstate'));};
 const root=createRoot(document.getElementById('root'));root.render(<PlatformConsole/>);
 window.addEventListener('fixture-unmount',()=>root.unmount(),{once:true});
`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',platform:'browser',format:'iife',
 outfile:'output/platform-overview-browser/app.js',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},
 plugins:[{name:'platform-overview-fixture',setup(plugin){
  plugin.onResolve({filter:/^(next\/(?:link|navigation)|@\/lib\/supabase|@\/components\/admin\/center-shell|\.\/(?:creation-browser|tenant-usage-panel|trend-chart))$/},a=>({path:a.path,namespace:'fixture'}));
  plugin.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path==='next/navigation'?`
    import {useMemo,useSyncExternalStore} from 'react';
    const watch=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);};
    export function useSearchParams(){const s=useSyncExternalStore(watch,()=>location.search);return useMemo(()=>new URLSearchParams(s),[s]);}
    export function usePathname(){return location.pathname;} export function useRouter(){return {};}
   `:a.path==='next/link'?'export default function Link(){return null;}':a.path==='@/lib/supabase'?'export async function authHeader(){return {}}':
    `import React from 'react';
     export const AdminCenterShell=({children})=>children,CreationBrowser=()=>null,TenantUsagePanel=()=>null,
      TrendChart=({items})=>React.createElement('output',{'aria-label':'已加载趋势'},items[0]?.date);`}));
 }}]});

const requests=[],aborted=[];
let heldDate='',listError=0,metricsError=0,legacy=false;
const submitted=[],receipts=[];let holdReceipt=false,receiptAborted=false;
const send=(res,body,status=200)=>res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(body));
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(['/api/admin/tenants','/api/admin/saas-overview'].includes(url.pathname)){
  const p=url.searchParams,kind=url.pathname.endsWith('tenants')?'list':'metrics';
  if(kind==='list'&&req.method==='POST'){
   let text='';req.setEncoding('utf8');req.on('data',chunk=>text+=chunk);
   req.on('end',()=>{submitted.push(JSON.parse(text).commandId);send(res,{error:'结果待核对',uncertain:true},503);});
   return;
  }
  if(kind==='list'&&p.has('ownerEmail'))return send(res,{email:p.get('ownerEmail'),team:null,activeTenant:null});
  if(kind==='list'&&p.has('commandId')){
   receipts.push(p.get('commandId'));
   if(!holdReceipt)return send(res,{error:'未找到操作'},404);
   res.once('close',()=>{if(!res.writableFinished)receiptAborted=true;});return;
  }
  const hit={kind,query:Object.fromEntries(p)};requests.push(hit);
  if(!baseline&&heldDate&&p.get('to')===heldDate){res.once('close',()=>{if(!res.writableFinished)aborted.push(kind);});return;}
  if(kind==='list'&&listError)return send(res,{error:listError===403?'平台权限已撤销':'租户服务暂不可用'},listError);
  if(kind==='metrics'&&metricsError)return send(res,{error:'趋势服务暂不可用'},metricsError);
  const tenant={tenantId:'tenant',name:'企业 '+(p.get('page')||'1')+(p.get('q')?' '+p.get('q'):''),owner:{name:'负责人',email:'owner@example.test'},
   activeMembers:2,creationCount:1,lastActivityAt:null,status:'active'};
  const tenants={items:[tenant],total:21,page:Number(p.get('page')||1),size:10};
  if(kind==='list')return send(res,tenants);
  const metrics={metrics:{tenants:21,activeTenants:7,creations:71,needsReview:2,failed:0,expiring:0},
   trend:[{date:p.get('to')||'2026-11-07',count:71}]};
  return send(res,legacy||p.get('projection')!=='metrics'?{...metrics,tenants}:metrics);
 }
 const file=bundle.outputFiles.find(f=>url.pathname!=='/'&&f.path.replaceAll('\\','/').endsWith(url.pathname));
 if(file){res.writeHead(200,{'content-type':url.pathname.endsWith('.css')?'text/css':'text/javascript'}).end(file.contents);return;}
 res.end('<!doctype html><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
});
async function until(predicate,label){const end=Date.now()+5000;while(!predicate()){assert.ok(Date.now()<end,label);await delay(15);}}
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(7000);
 const trend=()=>page.locator('output[aria-label="已加载趋势"]'),metricHits=()=>requests.filter(r=>r.kind==='metrics');
 const changeDate=value=>page.getByLabel('结束日期',{exact:true}).fill(value);
 await page.goto(origin+'/admin/center?to=2026-11-07');await trend().waitFor();await page.getByText('企业 1').waitFor();
 await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByText('企业 2').waitFor();
 await page.getByRole('combobox',{name:'租户状态'}).selectOption('active');await page.getByText('企业 1').waitFor();
 await page.getByRole('textbox',{name:'搜索企业名称或负责人'}).fill('北区');await page.getByText('企业 1 北区').waitFor();
 if(baseline){
  assert.equal(metricHits().length,4);
  assert.deepEqual(metricHits().map(hit=>hit.query.page||'1'),['1','2','1','1']);
  console.log('PLATFORM_OVERVIEW_BROWSER_BASELINE=PASS GLOBAL_REQUESTS=4 DATE_CHANGES=0');
 }else{
  assert.deepEqual(metricHits().map(hit=>hit.query),[{projection:'metrics',to:'2026-11-07'}]);
  assert.equal(requests.filter(hit=>hit.kind==='list'&&hit.query.size==='10').length,4);
  assert.equal(await trend().textContent(),'2026-11-07');

  listError=503;await page.getByRole('button',{name:'刷新租户列表'}).click();await page.getByText('租户服务暂不可用').waitFor();
  assert.equal(await trend().textContent(),'2026-11-07');assert.equal(metricHits().length,1);
  listError=0;await page.getByRole('button',{name:'重试租户列表'}).click();await page.getByText('企业 1 北区').waitFor();

  heldDate='2026-11-08';await changeDate(heldDate);
  await until(()=>requests.filter(h=>h.query.to===heldDate).length===2,'date did not start both requests');
  assert.equal(await trend().count(),0);
  await changeDate('2026-11-09');await trend().waitFor();await page.getByText('企业 1 北区').waitFor();
  await until(()=>aborted.length===2,'obsolete date requests stayed open');
  assert.deepEqual(aborted.sort(),['list','metrics']);assert.equal(await trend().textContent(),'2026-11-09');

  metricsError=503;await changeDate('2026-11-10');await page.getByText('趋势服务暂不可用').waitFor();
  await page.getByText('企业 1 北区').waitFor();
  const beforeRetry=requests.length;metricsError=0;await page.getByRole('button',{name:'重试平台指标'}).click();await trend().waitFor();
  assert.deepEqual(requests.slice(beforeRetry).map(hit=>hit.kind),['metrics']);

  listError=403;await page.getByRole('button',{name:'刷新租户列表'}).click();await page.getByText('平台权限已撤销').waitFor();
  assert.equal(await trend().count(),0);assert.equal(await page.getByText('企业 1 北区').count(),0);

  listError=0;legacy=true;await page.goto(origin+'/admin/center?to=2026-11-11');await trend().waitFor();await page.getByText('企业 1').waitFor();
  assert.equal(await trend().textContent(),'2026-11-11');
  await page.getByRole('button',{name:'新建租户',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'新建租户'});
  await editor.getByRole('textbox',{name:'企业名称'}).fill('核对测试租户');
  await editor.getByRole('textbox',{name:/已有负责人账号/}).fill('owner@example.test');
  await editor.getByRole('button',{name:'核对已有团队'}).click();
  await editor.getByText('未发现既有团队，将建立新企业锚点').waitFor();
  await editor.getByRole('button',{name:'预览修改'}).click();
  await editor.getByRole('button',{name:'确认保存'}).click();
  const verify=editor.getByRole('button',{name:'再次核对创建结果'});
  await verify.click();await editor.getByText(/尚未找到已提交结果/).waitFor();
  assert.equal(submitted.length,1);assert.deepEqual(receipts,[submitted[0]]);
  holdReceipt=true;await verify.click();await until(()=>receipts.length===2,'second check missing');
  await page.evaluate(()=>dispatchEvent(new Event('fixture-unmount')));
  await until(()=>receiptAborted,'leaving editor did not cancel the receipt read');
  assert.deepEqual(receipts,[submitted[0],submitted[0]]);assert.equal(submitted.length,1);
  assert.deepEqual(errors,[]);
  console.log('PLATFORM_OVERVIEW_BROWSER=PASS FILTER_PAGE_ONLY=1 DATE_ABORT=2 FAILURE_ISOLATION=1 AUTH_CLEAR=1 OLD_SERVER=1 RECEIPT_ABORT=1 NO_EXTRA_POST=1 ACTUAL_REACT=1');
 }
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
