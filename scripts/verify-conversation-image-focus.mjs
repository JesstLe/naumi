import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import sharp from 'sharp';
import {createServer} from 'node:http';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const baseline=process.argv.includes('--baseline'),rollback=process.argv.includes('--rollback');
const out=resolve('output/conversation-image-focus'),mode=rollback?'rollback':baseline?'baseline':'modified',dist=join(out,mode),root=process.cwd().replaceAll('\\','/');
const base='286b29e7cca0f4d08a2883423f40b9e3e1d3f801';await mkdir(dist,{recursive:true});
const entry=`import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';
import{CreationMessage}from'@/components/home/creation-message';import*as images from'@/lib/browser-image-cache';import styles from'@/components/home/creation-workbench.module.css';import'katex/dist/katex.min.css';
function Fixture(){const[tick,setTick]=useState(0),[content,setContent]=useState('换色已完成 ✅\\n\\n![换色结果](/media/result.png)\\n\\n**任务总结**：保留商品细节。'),[label,setLabel]=useState('初始');
useEffect(()=>{const redraw=()=>setTick(n=>n+1);for(const name of ['blur','focus','visibilitychange'])window.addEventListener(name,redraw);return()=>{for(const name of ['blur','focus','visibilitychange'])window.removeEventListener(name,redraw)}},[]);
const port={busy:false,unavailable:false,stage:(...args)=>window.actions.push({type:'stage',args,label}),resolveArtwork:async()=>label,regenerate:()=>{}};
window.fixture={images,refresh:()=>setTick(n=>n+1),setContent,setLabel};
return <div className={styles.root}><main style={{width:'min(700px,100%)',padding:'30px',boxSizing:'border-box'}}><CreationMessage message={{role:'assistant',content}} previous={{role:'user',content:'换成红色'}} port={port} onPreview={url=>window.actions.push({type:'preview',url,label})}/><output id="tick">{tick}</output></main></div>}
window.actions=[];window.revoked=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{window.revoked.push(url);revoke(url)};
images.activateBrowserImages('focus@example.test');createRoot(document.getElementById('root')).render(<Fixture/>);`;
const mocks={
 '@/lib/auth-context':`export const useAuth=()=>({user:{email:'focus@example.test'}})`,
 '@/lib/feature-access/client':`export const useFeatureAccess=()=>({canPage:()=>true})`,
 '@/lib/desktop/navigation':`export const useWorkspaceRouter=()=>({push:()=>{}})`,
 '@/lib/download':`export async function downloadImage(){}`,
};
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},outfile:join(dist,'bundle.js'),bundle:true,jsx:'automatic',platform:'browser',format:'iife',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-ports',setup(b){
 b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);
 b.onResolve({filter:/(^|\/)supabase$/},a=>({path:a.path,namespace:'auth'}));
 b.onLoad({filter:/.*/,namespace:'auth'},()=>({contents:'export async function authHeader(){return {}};',loader:'js'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'tsx'}));
 if(baseline||rollback)b.onLoad({filter:/(creation-message\.tsx|creation-workbench\.module\.css)$/},async a=>{const relative=a.path.replaceAll('\\','/').slice(root.length+1);return{contents:rollback?await readFile(join(out,'rollback-test',relative),'utf8'):execFileSync('git',['show',base+':'+relative],{encoding:'utf8'}),loader:a.path.endsWith('.css')?'local-css':'tsx',resolveDir:resolve(a.path,'..')}});
}}]});
const png=await sharp({create:{width:600,height:600,channels:3,background:'#b91c35'}}).composite([{input:Buffer.from('<svg width="600" height="600"><rect x="145" y="75" width="310" height="460" rx="40" fill="#eee6d8"/><rect x="145" y="75" width="310" height="85" rx="30" fill="#9f1830"/><rect x="160" y="240" width="280" height="150" rx="10" fill="#fff"/><text x="300" y="320" text-anchor="middle" font-family="Arial" font-size="32" fill="#243d73">PRODUCT</text></svg>')}]).png().toBuffer();
const version=createHash('sha256').update(png).digest('hex');let config={manifest:200,media:200,deny:false},calls={manifest:0,media:0,supplier:0};
const requests=[];
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://fixture');requests.push({method:req.method,path:url.pathname});if(req.method!=='GET'&&url.pathname!=='/api/media/image-cache')calls.supplier++;if(url.pathname==='/api/media/image-cache'){calls.manifest++;let body='';for await(const c of req)body+=c;if(config.manifest!==200){res.writeHead(config.manifest,{'content-type':'application/json'});return res.end('{}')}const {sources}=JSON.parse(body);res.setHeader('content-type','application/json');return res.end(JSON.stringify({account:'focus@example.test',results:Object.fromEntries(sources.map(source=>[source,config.deny?null:{account:'focus@example.test',source,version,fetchUrl:source,bytes:png.length,contentType:'image/png'}]))}));}
 if(url.pathname.startsWith('/media/')){calls.media++;res.writeHead(config.media,{'content-type':config.media===200?'image/png':'text/plain','cache-control':'no-store'});return res.end(config.media===200?png:'outage');}
 if(url.pathname==='/'){res.setHeader('content-type','text/html; charset=utf-8');return res.end('<!doctype html><html lang="zh"><meta charset="utf-8"><link rel="stylesheet" href="/bundle.css"><style>body{margin:0;font-family:Arial,"Microsoft YaHei",sans-serif}#tick{display:none}</style><div id="root"></div><script src="/bundle.js"></script></html>')}
 const name=url.pathname.slice(1);if(name.includes('..'))throw Error('path');res.setHeader('content-type',({'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'})[extname(name)]||'application/octet-stream');res.end(await readFile(join(dist,name)));
}catch(error){res.writeHead(500);res.end(String(error))}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),errors=[],checks=[];const check=(condition,name)=>{assert.ok(condition,name);checks.push(name)};const context=await browser.newContext({viewport:{width:1100,height:950}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
const ready=()=>page.waitForFunction(()=>{const img=document.querySelector('button[aria-label="放大查看图片"] img');return img?.naturalWidth>0&&img.getAttribute('data-browser-image-cache')==='local'});
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await ready();check(calls.media===1,'cold image downloads once');
 await page.evaluate(()=>{window.original=document.querySelector('button[aria-label="放大查看图片"] img');window.originalURL=window.original.src});
 await page.getByRole('button',{name:'更多图片操作',exact:true}).click();await page.getByRole('button',{name:'用作参考',exact:true}).waitFor();
 const before=calls.manifest;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>Number(document.getElementById('tick').textContent)>0);
 // Await the real manifest response; do not use a timeout as reproduction evidence.

 await ready();const healthy=await page.evaluate(()=>({same:window.original===document.querySelector('button[aria-label="放大查看图片"] img'),sameURL:window.originalURL===document.querySelector('button[aria-label="放大查看图片"] img').src,revoked:window.revoked.includes(window.originalURL)}));
 if(baseline||rollback){check(!healthy.same&&healthy.revoked,'baseline focus remounts image and revokes displayed URL');}
 else{check(healthy.same&&healthy.sameURL&&!healthy.revoked,'focus preserves DOM, URL and display lease');check(await page.getByRole('button',{name:'用作参考',exact:true}).count()===1,'open image menu survives focus refresh');}
 config.manifest=503;config.media=503;
 const bytesBefore=calls.media;const tick=await page.locator('#tick').textContent();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForFunction(old=>document.getElementById('tick').textContent!==old,tick);
 if(baseline||rollback){await page.waitForFunction(()=>document.querySelector('button[aria-label="放大查看图片"] img')?.getAttribute('data-browser-image-denied')==='true');check(await page.locator('button[aria-label="放大查看图片"] img').evaluate(el=>el.naturalWidth===0),'baseline outage collapses decoded result after blur');}
 else{
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForResponse(r=>r.url().includes('/api/media/image-cache')&&r.status()===503);
  const kept=await page.locator('button[aria-label="放大查看图片"] img').evaluate(el=>({width:el.naturalWidth,height:el.getBoundingClientRect().height,same:window.original===el}));check(kept.width===600&&kept.height>400&&kept.same,'blur/refocus during 503 retains decoded pixels and geometry');check(calls.media===bytesBefore,'focus metadata outage transfers zero image bytes');
 }
 await page.screenshot({path:join(out,mode+'-focus.png'),fullPage:true});
 if(!baseline&&!rollback){
  const tab=await context.newPage();await tab.goto('about:blank');await tab.bringToFront();await page.bringToFront();await tab.close();check(await page.evaluate(()=>window.original===document.querySelector('button[aria-label="放大查看图片"] img')&&window.original.naturalWidth===600),'real tab roundtrip retains result image');
  await page.evaluate(()=>{window.dispatchEvent(new Event('visibilitychange'));window.fixture.refresh();});check(await page.evaluate(()=>window.original===document.querySelector('button[aria-label="放大查看图片"] img')),'visibility and directory refresh retain result image');
  config.manifest=200;config.media=200;await page.evaluate(()=>window.fixture.setLabel('updated callback'));await page.getByRole('button',{name:'放大查看图片',exact:true}).click();check(await page.evaluate(()=>window.actions.at(-1)?.label==='updated callback'),'stable renderer uses newest preview callback');
  await page.getByRole('button',{name:'用作参考',exact:true}).click();check(await page.evaluate(()=>window.actions.at(-1)?.label==='updated callback'),'stable renderer uses newest reference action');
  await page.evaluate(()=>window.fixture.setContent('已更新说明。\n\n![换色结果](/media/result.png)\n\n更多说明。'));await ready();check(await page.evaluate(()=>window.original===document.querySelector('button[aria-label="放大查看图片"] img')),'streamed text preserves same result node');
  await page.evaluate(()=>window.fixture.setContent('![新结果](/media/new.png)'));await page.waitForFunction(()=>{const image=document.querySelector('button[aria-label="放大查看图片"] img');return image&&image.src!==window.originalURL&&image.naturalWidth>0});await ready();check(await page.locator('button[aria-label="放大查看图片"] img').evaluate(el=>el.src!==window.originalURL),'changed result replaces pixels');
  const bytes=calls.media;await page.reload();await ready();check(calls.media===bytes,'reload uses persisted verified bytes');
  config.manifest=503;config.media=503;await page.evaluate(()=>window.fixture.setContent('![暂时失败](/media/cold-failure.png)'));await page.getByRole('button',{name:'重新加载',exact:true}).waitFor();
  check(await page.locator('button[aria-label="放大查看图片"]').evaluate(el=>el.getBoundingClientRect().height>=220),'cold failure reserves result geometry');
  check(await page.locator('button[aria-label="放大查看图片"] img').evaluate(el=>getComputedStyle(el).visibility==='hidden'),'cold failure hides broken icon');await page.screenshot({path:join(out,'failed-placeholder.png'),fullPage:true});
  const beforeRetry=calls.media,checksBeforeRetry=calls.manifest;config.manifest=200;config.media=200;await page.getByRole('button',{name:'重新加载',exact:true}).click();await ready();check(calls.media<=beforeRetry+1&&calls.manifest>checksBeforeRetry,'manual retry reauthorizes and loads cached or single-transfer image without regeneration');await page.screenshot({path:join(out,'retry-restored.png'),fullPage:true});
  const responses=page.waitForResponse(r=>r.url().includes('/api/media/image-cache')&&r.status()===200);config.deny=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await responses;await page.waitForFunction(()=>!document.querySelector('button[aria-label="放大查看图片"] img')?.getAttribute('src'));check(await page.locator('button[aria-label="放大查看图片"] img').evaluate(el=>el.naturalWidth===0),'confirmed per-resource denial revokes pixels');
  config.deny=false;await page.reload();await ready();config.manifest=401;const denied=page.waitForResponse(r=>r.url().includes('/api/media/image-cache')&&r.status()===401);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await denied;await page.waitForFunction(()=>window.fixture.images.imageCacheAccount()==='');check(await page.locator('button[aria-label="放大查看图片"] img').evaluate(el=>!el.getAttribute('src')),'confirmed session loss clears private image');
  config.manifest=200;await page.reload();await ready();await page.evaluate(()=>window.fixture.images.activateBrowserImages('other@example.test'));await page.waitForFunction(()=>!document.querySelector('button[aria-label="放大查看图片"] img')?.getAttribute('src'));check(true,'account switch clears old private frame');
 }
 check(errors.length===0,'page errors zero');check(calls.supplier===0,'supplier calls zero');
 const report={mode,base,checks,healthy,calls,requests,pageErrors:errors,tier:'Actual CreationMessage, CachedImage, browser-image-cache, IndexedDB, Blob decode and Chromium. HTTP/auth/feature/action ports are fixtures; not production.'};await writeFile(join(out,mode+'-report.json'),JSON.stringify(report,null,2));console.log(`${rollback?'ROLLBACK_RESTORED':baseline?'BASELINE_REPRODUCED':'CONVERSATION_IMAGE_FOCUS_PASS'} checks=${checks.length} ${baseline||rollback?'focusRemount=1 revoked=1 blurOutageBroken=1':'focusRemount=0 retainedDuring503=1 focusImageBytes=0'} supplierCalls=0`);
}finally{await browser.close();await new Promise(r=>server.close(r))}
