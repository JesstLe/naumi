// Mount the actual preview components. Only auth and response body timing are fixture ports.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import sharp from 'sharp';

const out=path.resolve(process.argv[2]||'output/creation-media-scheduling');await fs.mkdir(out,{recursive:true});
const png=(await sharp({create:{width:50,height:40,channels:3,background:'#dbeafe'}}).png().toBuffer()).toString('base64');
const testApp=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {CreationDetailView,CreationMedia} from './src/components/saas/creation-browser';
const png=Uint8Array.from(atob('${png}'),c=>c.charCodeAt(0));
const data=window.fixture={calls:[],active:0,peak:0,revoked:[],created:[],auth:[]};
window.previewAuth=()=>data.holdAuth?new Promise(resolve=>data.auth.push(resolve)):Promise.resolve({});
const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=create(blob);data.created.push(url);return url;};
URL.revokeObjectURL=url=>{data.revoked.push(url);revoke(url);};
window.fetch=async(url,{signal})=>{
 const call={url:String(url),ended:false,aborted:false};data.calls.push(call);data.peak=Math.max(++data.active,data.peak);
 let resolve,reject;const body=new Promise((yes,no)=>{resolve=yes;reject=no;});
 function finish(failed=false){if(call.ended)return;call.ended=true;--data.active;signal.removeEventListener('abort',stop);
  if(failed){call.aborted=true;reject(signal.reason);}else resolve(new Blob([data.bad===call.url?new Uint8Array([0]):png],{type:'image/png'}));}
 function stop(){finish(true);}call.release=()=>finish();signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
 return {ok:true,blob:()=>body};
};
const asset=(id,extra={})=>({id,direction:'output',role:'result',mediaType:'image',availability:'recorded',position:0,...extra});
const details={id:'cr-detail',title:'Fixture details',actorName:'Fixture',acceptedAt:'2026-11-01',status:'succeeded',assets:[asset('recovered-fixture',{evidenceRecordId:'cr-fixture'})],events:[],children:[],request:{state:'not_recorded'},parameters:{state:'not_recorded'},model:{},billing:{operations:[]}};
function App(){const [group,change]=useState('first');window.change=change;
 if(group==='detail')return <CreationDetailView detail={details} api="/api/enterprise/creations" tenantId="fixture-tenant"/>;
 return <div className="fixture-grid">{group==='off'?null:Array.from({length:group==='single'?1:24},(_,i)=><CreationMedia key={group+':'+i} asset={asset(group+'-'+i)} api={'/fixture/'+group+'/'+i}/>)}</div>;
}createRoot(document.getElementById('root')).render(<App/>);`;
await build({stdin:{contents:testApp,resolveDir:process.cwd(),loader:'tsx'},outfile:path.join(out,'app.js'),bundle:true,jsx:'automatic',platform:'browser',minify:true,define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'ports',setup(b){
 b.onResolve({filter:/^(next\/navigation|@\/lib\/supabase|@\/lib\/auth-context)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='next/navigation'?'export const useSearchParams=()=>new URLSearchParams();':a.path.endsWith('auth-context')?'export const useAuth=()=>({user:{email:"fixture@test"}});':'export const authHeader=()=>window.previewAuth();'}));
}}]});
const server=createServer(async(req,res)=>{
 if(req.url==='/app.js'||req.url==='/app.css'){res.setHeader('content-type',req.url.endsWith('.js')?'application/javascript':'text/css');res.end(await fs.readFile(path.join(out,req.url.slice(1))));return;}
 res.setHeader('content-type','text/html');res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><style>.fixture-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}.fixture-grid img{max-height:80px}</style><main id="root"></main><script src="/app.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const results={};
try{
 browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 const page=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,30)))));
 await page.waitForFunction(()=>fixture.calls.length>=4);await settle();
 results.firstPeak=await page.evaluate(()=>fixture.peak);
 if(process.argv.includes('--expect-defect')){assert.equal(results.firstPeak,24);}
 else{
  assert.equal(results.firstPeak,4);
  // Fulfill only one body after all four headers have arrived. Only then may
  // the fifth request start. Later on, changing record drops the entire queue.
  await page.evaluate(()=>fixture.calls[0].release());await page.waitForFunction(()=>fixture.calls.length>=5);await settle();
  assert.equal(await page.evaluate(()=>fixture.calls.length),5);
  await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth===50);
  await page.evaluate(()=>change('other'));await page.waitForFunction(()=>fixture.calls.filter(c=>c.url.startsWith('/fixture/other/')).length>=4);await settle();
  results.oldStarted=await page.evaluate(()=>fixture.calls.filter(c=>c.url.startsWith('/fixture/first/')).length);
  results.oldAborted=await page.evaluate(()=>fixture.calls.filter(c=>c.url.startsWith('/fixture/first/')&&c.aborted).length);
  assert.equal(results.oldStarted,5);assert.equal(results.oldAborted,4);assert.equal(await page.evaluate(()=>fixture.revoked.length),1);
  for(let released=0;released<24;released+=4){
   await page.waitForFunction(n=>fixture.calls.filter(c=>c.url.startsWith('/fixture/other/')).length>=n,released+4);
   await page.evaluate(()=>fixture.calls.filter(c=>c.url.startsWith('/fixture/other/')&&!c.ended).forEach(c=>c.release()));
  }
  await page.waitForFunction(()=>[...document.querySelectorAll('img')].filter(i=>i.naturalWidth===50).length===24);
  results.completed=await page.evaluate(()=>fixture.calls.filter(c=>c.url.startsWith('/fixture/other/')&&c.ended&&!c.aborted).length);
  results.peakAcrossRecords=await page.evaluate(()=>fixture.peak);assert.equal(results.completed,24);assert.equal(results.peakAcrossRecords,4);
  await page.evaluate(()=>{fixture.holdAuth=true;change('single');});await page.waitForFunction(()=>fixture.auth.length===1);
  await page.evaluate(()=>change('off'));await settle();await page.evaluate(()=>{fixture.holdAuth=false;fixture.auth.shift()({});});await settle();
  assert.equal(await page.evaluate(()=>fixture.calls.some(c=>c.url==='/fixture/single/0')),false);
  await page.evaluate(()=>change('detail'));await page.waitForFunction(()=>fixture.calls.some(c=>c.url.includes('recovered-fixture')));
  results.recoveredUrl=await page.evaluate(()=>fixture.calls.find(c=>c.url.includes('recovered-fixture')).url);
  const url=new URL(results.recoveredUrl,'http://fixture.test');assert.equal(url.searchParams.get('tenantId'),'fixture-tenant');assert.equal(url.searchParams.get('evidenceRecord'),'cr-fixture');
  await page.evaluate(()=>{const call=fixture.calls.at(-1);fixture.bad=call.url;call.release();});
  await page.getByRole('button',{name:'重试读取'}).click();await page.waitForFunction(()=>fixture.calls.filter(c=>c.url.includes('recovered-fixture')).length===2);
  await page.evaluate(()=>{fixture.bad='';fixture.calls.at(-1).release();});await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth===50);
  results.retry=true;
 }
 assert.deepEqual(errors,[]);
}finally{await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
