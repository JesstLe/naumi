const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {build}=require('esbuild'),{chromium}=require('playwright'),postcss=require('postcss'),tailwind=require('tailwindcss'),sharp=require('sharp');
const root=process.cwd(),out=path.resolve(process.env.TEMPLATE_COVER_EVIDENCE||'output/template-cover'),baseline=process.argv.includes('--baseline');
let browser,server;const checks=[],errors=[],pending=[];
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const bytes=fs.readFileSync('public/demos/workbench-v2/retouch-before.webp'),meta=await sharp(bytes).metadata();
 const rows=Array.from({length:8},(_,i)=>({id:'cover-'+i,title:['已知尺寸','未知尺寸','已换图片','暂时失效'][i%4]+' '+i,category:'案例',industry:'',description:'',prompt:'商品摄影',tags:[],gradient:'from-slate-100 to-slate-200',image:'/fixtures/cover-'+i+'.webp',...(i%4===0?{cover:{source:'/fixtures/cover-'+i+'.webp',width:meta.width,height:meta.height}}:i%4===2?{cover:{source:'/fixtures/old.webp',width:100,height:10}}:{})}));
 const stubs={
  'next/navigation':'export function useRouter(){return {push(){}}}',
  'next/link':'import React from "react";export default function Link(p){return React.createElement("a",p)}',
  '@/lib/auth-context':'export function useAuth(){return {user:null,ready:true}}',
  '@/lib/auth-modal-context':'export function useAuthModal(){return {openAuth(){}}}',
  '@/lib/i18n/locale-context':'export function useI18n(){return {t:k=>({"tpl.searchPlaceholder":"搜索模板","tpl.hoverUse":"使用模板"}[k]||k),te:k=>k,locale:"zh"}}',
  '@/lib/supabase':'export function browserSupabase(){return null}',
 };
 const entry=path.join(out,'entry.tsx');fs.writeFileSync(entry,`import React from'react';import{createRoot}from'react-dom/client';import{TemplatesClient}from'@/components/templates/templates-client';createRoot(document.getElementById('app')).render(<TemplatesClient variant="creation" gridClass="columns-2 lg:columns-4"/>);`);
 await build({absWorkingDir:root,nodePaths:[path.join(root,'node_modules')],entryPoints:[entry],bundle:true,jsx:'automatic',platform:'browser',format:'iife',outfile:path.join(out,'app.js'),tsconfig:path.join(root,'tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'},banner:{js:'var process={env:{},browser:true};'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',resolveDir:root,contents:stubs[a.path]}));if(baseline)b.onLoad({filter:/templates-client\.tsx$/},()=>({loader:'tsx',resolveDir:path.join(root,'src/components/templates'),contents:fs.readFileSync(process.env.TEMPLATE_BASELINE_FILE,'utf8')}));}}],logLevel:'silent'});
 const config=require(path.join(root,'tailwind.config.ts')).default;
 const css=await postcss([tailwind({...config,content:[...config.content,entry]})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:'src/app/globals.css'});fs.writeFileSync(path.join(out,'style.css'),css.css);
 let released=false;
 server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/templates')){res.setHeader('content-type','application/json');return res.end(JSON.stringify(req.url.includes('/categories')?{categories:[]}:{templates:rows,total:rows.length}));}
  if(req.url==='/release'){released=true;pending.splice(0).forEach(fn=>fn());return res.end('OK');}
  if(req.url.startsWith('/fixtures/cover-')){const send=()=>{if(/-(3|7)\.webp/.test(req.url)){res.writeHead(503);res.end();}else{res.setHeader('content-type','image/webp');res.end(bytes);}};released?send():pending.push(send);return;}
  if(req.url==='/app.js'||req.url==='/style.css'){res.setHeader('content-type',req.url.endsWith('js')?'text/javascript':'text/css');return res.end(fs.readFileSync(path.join(out,req.url.slice(1))));}
  res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>body{padding:28px;background:#fff;font-family:Arial,"Microsoft YaHei"}</style><div id="app"></div><script src="/app.js"></script>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.locator('img[alt="已知尺寸 0"]').waitFor({state:'attached'});
 const boxes=()=>page.locator('img[loading="lazy"]').evaluateAll(imgs=>imgs.map(img=>{const r=img.parentElement.getBoundingClientRect();return {alt:img.alt,x:r.x,y:r.y,width:r.width,height:r.height}}));
 const before=await boxes();await page.screenshot({path:path.join(out,'loading.png')});released=true;pending.splice(0).forEach(fn=>fn());await page.waitForFunction(()=>{const im=document.querySelector('img[alt="已知尺寸 0"]');return im?.complete&&im.naturalWidth>0});await page.waitForTimeout(200);const after=await boxes();
 if(baseline){assert.ok(before.some(r=>r.height<60));assert.ok(after.some((r,i)=>Math.abs(r.height-before[i].height)>100));console.log('TEMPLATE_COVER_BASELINE=CONFIRMED collapsed_before_load=true layout_shift=true');}
 else{
  assert.ok(before.every(r=>r.height>100));checks.push('known-unknown-and-failed-sources-reserve-slot');
  assert.deepEqual(before,after);checks.push('slow-load-does-not-shift-cards');
  assert.equal(await page.locator('[data-template-cover="error"]').count(),2);checks.push('actual-http-errors-show-explicit-state');
  const stale=before.find(r=>r.alt==='已换图片 2');assert.ok(Math.abs(stale.width/stale.height-.8)<.005);checks.push('changed-source-rejects-stale-dimensions');
  assert.ok(await page.locator('[data-template-cover="ready"] img').evaluateAll(imgs=>imgs.every(img=>getComputedStyle(img).objectFit==='contain')));checks.push('whole-image-remains-visible');
  await page.screenshot({path:path.join(out,'loaded.png')});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push('mobile-no-horizontal-overflow');await page.screenshot({path:path.join(out,'mobile.png')});
  console.log('TEMPLATE_COVER_UI=PASS checks='+checks.length+' layout_shift=0 supplier_calls=0');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({baseline,before,after,checks,errors,tier:'actual TemplatesClient + TemplateCover + CachedImage; fixture list, auth boundary and slow HTTP images',supplierCalls:0},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{pending.splice(0).forEach(fn=>fn());await browser?.close();await new Promise(r=>server?server.close(r):r());});
