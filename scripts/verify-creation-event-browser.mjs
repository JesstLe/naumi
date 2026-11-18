import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const baseline=process.argv.includes('--baseline');
const bundle=await build({stdin:{contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {CreationBrowser} from '@/components/saas/creation-browser';
 const replace=history.replaceState.bind(history);
 history.replaceState=(...args)=>{replace(...args);dispatchEvent(new PopStateEvent('popstate'));};
 createRoot(document.getElementById('root')).render(<CreationBrowser/>);
`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',platform:'browser',format:'iife',outfile:'output/creation-event-browser/app.js',
 define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},
 plugins:[{name:'creation-event-browser',setup(plugin){
  plugin.onResolve({filter:/^(next\/navigation|@\/lib\/(?:auth-context|supabase))$/},a=>({path:a.path,namespace:'fixture'}));
  plugin.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path==='next/navigation'?`
    import {useMemo,useSyncExternalStore} from 'react';
    const watch=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);};
    export function useSearchParams(){const s=useSyncExternalStore(watch,()=>location.search);return useMemo(()=>new URLSearchParams(s),[s]);}
  `:a.path.endsWith('/supabase')?'export async function authHeader(){return {}}':`export function useAuth(){return {user:{email:'fixture@example.test'}}}`}));
 }}]});
const set=[['record-a','任务甲'],['record-b','任务乙']];
const date='2026-11-09T00:00:00.000Z';
const summaries=set.map(([id,title])=>({id,title,actorName:'隔离用户',acceptedAt:date,scopeKind:'tenant',status:'succeeded'}));
const hits=[],canceled=[];
let hold='',holdDetail='',failure=0,oldServer=false;
const eventsFor=(id,page)=>[{id:'event-'+id+'-'+page,type:'execution',summary:'事件 '+id+' '+page,occurredAt:date,status:'succeeded'}];
const pagination=(page,total=73)=>({page,total,size:24});
const send=(res,data,status=200)=>res.writeHead(status,{'content-type':'application/json'}).end(JSON.stringify(data));
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture');
 const match=/^\/api\/admin\/creations(?:\/([^/]+)(\/events)?)?$/.exec(url.pathname);
 if(match){
  const id=match[1],kind=match[2]?'event':id?'detail':'list',page=Number(url.searchParams.get('eventPage')||1);
  hits.push({id,kind,page,projection:url.searchParams.get('projection')});
  if(kind==='list')return send(res,{items:summaries,pagination:{page:1,total:2,size:24},appliedFilters:{}});
  if(kind==='event'){
   if(hold===id+':'+page){res.once('close',()=>{if(!res.writableFinished)canceled.push(id+':'+page);});return;}
   if(failure)return send(res,{error:failure===403?'创作查看权限已收回':'事件服务暂不可用'},failure);
   return send(res,{items:eventsFor(id,page),...(oldServer?{}:{pagination:pagination(page,81)})});
  }
  if(holdDetail===id)return;
  return send(res,{...summaries.find(row=>row.id===id),assets:[],children:[],events:eventsFor(id,page),eventPagination:pagination(page),
   assetPagination:{page:1,size:24,total:0},childPagination:{page:1,size:24,total:0},
   request:{state:'recorded',text:'原始要求 '+id},parameters:{state:'not_recorded'},model:{},
   billing:{state:'settled',charged:7,quoted:7,reserved:7,released:0,refunded:0,payerAccountId:'payer@example.test',operations:[]}});
 }
 const file=bundle.outputFiles.find(f=>url.pathname!=='/'&&f.path.replaceAll('\\','/').endsWith(url.pathname));
 if(file){res.writeHead(200,{'content-type':url.pathname.endsWith('.css')?'text/css':'text/javascript'}).end(file.contents);return;}
 res.end('<!doctype html><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
});
async function until(check,message){const end=Date.now()+5000;while(!check()){assert.ok(Date.now()<end,message);await delay(15);}}
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
 const text=value=>page.getByText(value,{exact:true});
 const next=()=>page.getByText(/执行事件共 \d+ 条/).locator('..').getByRole('button',{name:'下一页',exact:true});
 await page.goto(origin+'/admin/creations?creationId=record-a&eventPage=2');
 await text('事件 record-a 2').waitFor();assert.deepEqual(hits.filter(h=>h.kind==='detail').map(h=>h.page),[2]);
 if(!baseline)hold='record-a:3';
 await next().click();
 if(baseline){
  await text('事件 record-a 3').waitFor();assert.deepEqual(hits.filter(h=>h.kind==='detail').map(h=>h.page),[2,3]);
  assert.equal(hits.filter(h=>h.kind==='event').length,0);
  console.log('CREATION_EVENT_BROWSER_BASELINE=PASS DETAIL_RELOADED_ON_EVENT_PAGE=1');
 }else{
  await until(()=>hits.some(h=>h.kind==='event'&&h.page===3),'event page request missing');
  assert.equal(await text('原始要求 record-a').count(),1);assert.equal(await text('事件 record-a 2').count(),0);
  assert.equal(hits.filter(h=>h.kind==='detail').length,1);
  await next().click();await text('事件 record-a 4').waitFor();await until(()=>canceled.includes('record-a:3'),'previous event read not canceled');
  await text('执行事件共 81 条').waitFor();
  assert.equal(hits.find(h=>h.kind==='event'&&h.page===4).projection,'page');

  hold='record-a:2';
  await page.evaluate(()=>{const url=new URL(location.href);url.searchParams.set('eventPage','2');history.replaceState(null,'',url.href);});
  await until(()=>hits.some(h=>h.kind==='event'&&h.id==='record-a'&&h.page===2),'going back to the deep link did not revalidate');
  await page.getByRole('button',{name:/任务乙/}).click();await text('事件 record-b 1').waitFor();
  await until(()=>canceled.includes('record-a:2'),'switching record did not cancel its event projection');
  assert.equal(await text('事件 record-a 4').count(),0);
  failure=503;await next().click();await page.getByRole('alert').filter({hasText:'事件服务暂不可用'}).waitFor();assert.equal(await text('原始要求 record-b').count(),1);
  failure=0;oldServer=true;await page.getByRole('button',{name:'重试执行事件'}).click();await text('事件 record-b 2').waitFor();
  await text('执行事件共 73 条').waitFor();
  failure=403;await next().click();await page.getByRole('alert').filter({hasText:'创作查看权限已收回'}).waitFor();assert.equal(await text('原始要求 record-b').count(),0);
  assert.deepEqual(hits.filter(h=>h.kind==='detail').map(h=>[h.id,h.page]),[['record-a',2],['record-b',1]]);
  failure=0;
  await page.goto(origin+'/admin/creations?creationId=record-a');await text('原始要求 record-a').waitFor();
  holdDetail='record-b';await page.getByRole('button',{name:/任务乙/}).click();
  await until(()=>hits.filter(h=>h.kind==='detail'&&h.id==='record-b').length===2,'second record read did not start');
  holdDetail='record-a';await page.getByRole('button',{name:/任务甲/}).click();
  await until(()=>hits.filter(h=>h.kind==='detail'&&h.id==='record-a').length===3,'returning to first record did not revalidate');
  assert.equal(await text('原始要求 record-a').count(),0);assert.equal(await text('原始要求 record-b').count(),0);
  assert.deepEqual(errors,[]);
  console.log('CREATION_EVENT_BROWSER=PASS DEEP_LINK=1 INDEPENDENT_PAGE=1 ABORT=1 TOTAL=1 OLD_RESPONSE=1 AUTH_CLEAR=1 ACTUAL_REACT=1');
 }
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
