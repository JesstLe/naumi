const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {build}=require('esbuild'),{chromium}=require('playwright');

async function main(){
 const out=path.resolve(process.argv[2]||'output/admin-failure-evidence-20261026/ui');fs.mkdirSync(out,{recursive:true});
 const failure={title:'供应调用连接被重置',description:'调用链路发生通信异常；具体断点及供应商是否受理，以原回执为准。',stage:'供应调用',code:'ECONNRESET',evidence:'supplier_receipt',observedAt:'2026-10-26T06:16:52Z',incomplete:false,supplier:{provider:'fixture-provider',model:'fixture-image',state:'unknown',costStatus:'pending',httpStatus:null},customerBilling:{state:'released',charged:0,reserved:0}};
 const detail={id:'fixture-record',title:'图片生成 fixture',actorEmail:'fixture@example.test',actorName:'Fixture',tenantId:null,scopeKind:'personal',sourceKind:'image:imagegen',status:'failed',acceptedAt:'2026-10-26T06:16:24Z',settledCredits:0,thumbnailAssetId:null,completeness:'recorded',failure,evidencePending:false,request:{state:'recorded',text:'本地显示验证'},parameters:{state:'recorded',values:{}},model:{state:'not_recorded',label:null},assets:[],events:[],children:[],assetPagination:{page:1,size:24,total:0},eventPagination:{page:1,size:24,total:0},childPagination:{page:1,size:24,total:0},billing:{payerAccountId:'fixture@example.test',source:'fixture',quoted:6,reserved:0,charged:0,released:6,refunded:0,state:'settled',operations:[]}};
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {CreationBrowser} from './src/components/saas/creation-browser';
 const detail=${JSON.stringify(detail)};const enterprise=new URLSearchParams(location.search).get('enterprise')==='1';
 if(enterprise)delete detail.failure;window.fetch=async input=>{const url=String(input);window.__fixtureRequests=(window.__fixtureRequests||[]).concat(url);if(!url.startsWith('/api/'))throw Error('UNEXPECTED_NETWORK');return new Response(JSON.stringify(url.includes('/fixture-record')?detail:{items:[detail],pagination:{total:1,page:1,size:20},appliedFilters:{},scope:enterprise?'tenant':'platform'}),{status:200,headers:{'content-type':'application/json'}})};
 createRoot(document.getElementById('root')).render(<CreationBrowser enterprise={enterprise}/>);`;
 await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'admin-failure-fixture.tsx',loader:'tsx'},bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'fixture-boundaries',setup(b){b.onResolve({filter:/^(next\/navigation|@\/lib\/(supabase|auth-context))$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='next/navigation'?`export const usePathname=()=>'/admin/creations';export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({replace:()=>{}});`:a.path.endsWith('auth-context')?`export const useAuth=()=>({user:{email:'fixture@example.test'}});`:`export const authHeader=async()=>({});`,loader:'js'}));}}]});
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Failure fixture</title><link rel="stylesheet" href="fixture.css"><style>body{margin:0;padding:16px;background:#f7f9fc;font:14px system-ui}</style><div id="root"></div><script src="fixture.js"></script></html>');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 let checks=0;
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,route=>route.abort());
  for(const [width,height] of [[1440,1000],[390,844]]){
   await page.setViewportSize({width,height});
   await page.goto(pathToFileURL(path.join(out,'index.html')).href+'?creationId=fixture-record');
   const panel=page.getByRole('region',{name:'失败原因'});await panel.waitFor({state:'visible'});
   assert.match(await panel.textContent(),/ECONNRESET/);assert.match(await panel.textContent(),/实扣 0 积分/);assert.match(await panel.textContent(),/预占已释放/);assert.match(await panel.textContent(),/待确认 \/ 待确认/);checks+=4;
   assert.match(await page.locator('[aria-label="创作记录列表"]').textContent(),/供应调用连接被重置（ECONNRESET）/);checks++;
   const bounds=await panel.boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1);checks++;
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);checks++;
   assert.equal(await panel.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 250, 245)');checks++;
   await page.screenshot({path:path.join(out,`failure-${width}.png`),fullPage:true});
  }
  await page.goto(pathToFileURL(path.join(out,'index.html')).href+'?creationId=fixture-record&enterprise=1');
  await page.getByRole('heading',{name:'图片生成 fixture'}).waitFor();assert.equal(await page.getByRole('region',{name:'失败原因'}).count(),0);assert.doesNotMatch(await page.locator('body').textContent(),/ECONNRESET|fixture-provider/);checks+=2;
  assert.equal(errors.length,0,errors.join('\n'));checks++;
  console.log(`ADMIN_FAILURE_UI=PASS CHECKS=${checks} ACTUAL_COMPONENT=1 WIDTHS=1440,390 ENTERPRISE_PRIVATE=1 PAGE_ERRORS=0 SUPPLIER_CALLS=0`);
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
