// Actual management page and review dialog; only auth/API/navigation are fixtures.
// Runs an owned headless browser with intercepted HTML. No listener or live calls.
require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {build}=require('esbuild'),postcss=require('postcss'),tailwind=require('tailwindcss'),{chromium}=require('@playwright/test');
const root=process.cwd(),out=path.resolve(process.env.VIDEO_MIGRATION_UI_OUT||'E:/Workspace/naumi/output/video-compiler-binding-20261114/admin-ui');
const pendingKey='naumi:admin:mvp:pending',origin='http://127.0.0.1:54791/';
fs.mkdirSync(out,{recursive:true});
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {ModelManagement} from '@/components/admin/model-management/model-management';
createRoot(document.getElementById('app')).render(<ModelManagement/>);`;
const fixture=`(()=>{
const row={id:'video-ready',label:'测试视频模型',alias:'测试视频模型',modality:'video',publicIds:['video-ready'],features:[{id:'video.generate',label:'视频生成'}],routes:[{upstreamId:'upstream-video',providerId:'fixture',provider:'测试通道',model:'fixture-video',kind:'固定调用',enabled:true}],preset:false,conditional:false,candidateIds:[],scopeOptions:[],pricing:[{feature:'video.generate',label:'视频生成',unit:'task',credits:20,estimated:false}]};
const state={version:117,billingVersion:4,managed:true,rows:[row],providers:[],candidates:[],catalogs:[]};
const review={version:117,reviewDigest:'a'.repeat(64),publicIds:['video-ready'],rows:[
{publicId:'video-ready',label:'待升级视频',status:'ready',beforeProfiles:['apimart-apib-seedance'],afterProfiles:['native-video'],intents:['text','single_image','frames_required','reference'],fields:['parameterMap.videoExecution']},
{publicId:'video-manual',label:'人工设置视频',status:'mapping_required',beforeProfiles:[],afterProfiles:[],intents:['reference'],fields:[],reason:'请为此通道显式配置执行字段映射'},
{publicId:'video-current',label:'已更新视频',status:'current',beforeProfiles:['native-video'],afterProfiles:['native-video'],intents:['reference'],fields:[]}]};
window.fixture={scenario:'unknown',posts:[],gets:0,reviews:0,refreshes:0,unexpected:[],applied:false};
window.addEventListener('naumi:model-catalog-refresh',()=>window.fixture.refreshes++);
window.fetch=async(url,init={})=>{
 const u=new URL(String(url),location.href),f=window.fixture;
 const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 if(u.pathname!=='/api/admin/model-management'){f.unexpected.push(String(url));throw Error('Unexpected fixture URL '+url)}
 if(!init.method||init.method==='GET'){
  if(u.searchParams.get('view')==='video-execution-migration'){f.reviews++;return response(review)}
  f.gets++;return response({...state,version:f.applied?118:117});
 }
 const body=JSON.parse(init.body);f.posts.push(body);
 if(body.action!=='video-execution-migration'){f.unexpected.push(body.action);throw Error('Unexpected action')}
 if(f.posts.length===1&&f.scenario==='disconnect')throw new TypeError('fixture connection reset');
 if(f.posts.length===1&&f.scenario==='unknown')return response({publication:{id:body.id,phase:'unknown'}},202);
 f.applied=true;return response({publication:{id:body.id,phase:'applied',version:118}});
};})();`;

async function main(){
 const file=path.join(out,'entry.tsx');fs.writeFileSync(file,entry);
 const plugins=[{name:'auth-and-navigation-fixtures',setup(b){
  b.onResolve({filter:/^next\/link$/},()=>({path:'next-link',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'tsx',contents:"import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}"}));
  b.onLoad({filter:/[\\/]lib[\\/]supabase\.ts$/},()=>({loader:'ts',contents:'export async function authHeader(){return {}}'}));
 }}];
 const result=await build({entryPoints:[file],bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:path.join(out,'app.js'),loader:{'.css':'local-css'},tsconfig:path.join(root,'tsconfig.json'),alias:{react:path.dirname(require.resolve('react/package.json')),'react-dom':path.dirname(require.resolve('react-dom/package.json'))},define:{'process.env.NODE_ENV':'"development"'},banner:{js:'var process={env:{},browser:true};'},metafile:true,plugins});
 const css=(await postcss([tailwind({...require(path.join(root,'tailwind.config.ts')).default,content:['./src/**/*.{ts,tsx}',file]})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css+'\n'+fs.readFileSync(path.join(out,'app.css'),'utf8');
 const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><style>body{margin:0;background:#f7f8fb;font-family:Arial,"Microsoft YaHei",sans-serif}</style></head><body><div id="app"></div><script>'+fixture+'</script><script>'+fs.readFileSync(path.join(out,'app.js'),'utf8').replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
 fs.writeFileSync(path.join(out,'index.html'),html);
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const checks=[],scenarios=[],sources=Object.keys(result.metafile.inputs).filter(p=>p.startsWith('src/')).map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}));
 const pass=name=>{checks.push(name);console.log('UPGRADE_UI_CHECK='+name)};
 try{
  for(const scenario of ['unknown','disconnect']){
   const context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage(),errors=[],network=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{if(route.request().url()===origin)return route.fulfill({contentType:'text/html',body:html});network.push(route.request().url());return route.abort()});
   try{
    await page.goto(origin);await page.getByRole('button',{name:'迁移视频执行',exact:true}).waitFor();
    await page.evaluate(s=>{window.fixture.scenario=s},scenario);
    await page.getByRole('button',{name:'迁移视频执行',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'迁移视频执行',exact:true});await dialog.getByText('待升级视频',{exact:true}).waitFor();
    assert.equal(await dialog.getByText('需配置映射',{exact:true}).count(),1);assert.equal(await dialog.getByText('已更新视频',{exact:true}).count(),0);
    assert.equal(await dialog.getByText('1 个模型待更新',{exact:true}).count(),1);assert.equal(await dialog.getByText('→ 文生视频 · 图生视频 · 首尾帧 · 参考生成',{exact:true}).count(),1);
    await dialog.getByText('查看差异',{exact:true}).click();assert.equal(await dialog.locator('details').getAttribute('open'),'');assert.match(await dialog.locator('details').innerText(),/请为此通道显式配置执行字段映射/);
    assert.equal((await page.evaluate(()=>window.fixture.posts)).length,0);pass(scenario+':preview_ready_conflict_and_read_only');
    if(scenario==='unknown')await page.screenshot({path:path.join(out,'video-capability-preview.png'),fullPage:true});
    await dialog.getByRole('button',{name:'发布执行绑定',exact:true}).click();
    const resume=page.getByRole('button',{name:'核对并继续',exact:true});await resume.waitFor();await page.waitForFunction(()=>!document.querySelector('dialog[open]')&&Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='核对并继续'&&!b.disabled));
    assert.equal(await dialog.count(),0);assert.equal(await resume.isEnabled(),true);assert.equal(await page.getByRole('button',{name:'迁移视频执行',exact:true}).isDisabled(),true);
    const first=await page.evaluate(()=>window.fixture.posts[0]),pending=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),pendingKey);
    assert.deepEqual(first,pending);assert.equal(first.action,'video-execution-migration');assert.deepEqual(first.publicIds,['video-ready']);assert.equal(first.expectedVersion,117);assert.equal(first.reviewDigest,'a'.repeat(64));assert.match(first.id,/^[0-9a-f-]{36}$/);
    assert.equal(await page.evaluate(()=>window.fixture.refreshes),0);pass(scenario+':modal_closed_pending_accessible_exact_write_set');
    if(scenario==='disconnect'){
     await page.getByRole('alert').filter({hasText:'fixture connection reset'}).waitFor();
     await page.reload();await resume.waitFor();
     // Retain the fixture transport history across the page reload while the
     // product independently restores the pending operation from sessionStorage.
     await page.evaluate(op=>{window.fixture.posts=[op];window.fixture.scenario='disconnect'},first);
     assert.deepEqual(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),pendingKey),first);assert.equal(await resume.isEnabled(),true);pass('disconnect:reload_restores_original_pending_operation');
    }
    await resume.click();await page.getByRole('status').filter({hasText:'视频执行绑定已发布。'}).waitFor();
    await page.waitForFunction(()=>window.fixture.refreshes===1&&document.body.innerText.includes('模型 v118'));
    const after=await page.evaluate(()=>window.fixture);
    assert.deepEqual(after.posts,[first,first]);assert.equal(await resume.count(),0);assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),pendingKey),null);assert.equal(await page.getByRole('button',{name:'迁移视频执行',exact:true}).isEnabled(),true);assert.equal(await dialog.count(),0);
    assert.deepEqual(after.unexpected,[]);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);pass(scenario+':same_operation_recovery_applied_refreshes_once');
    scenarios.push({scenario,posts:after.posts,refreshes:after.refreshes,errors,network});
   }finally{await context.close()}
  }
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({result:'PASS',checks,scenarios,sources,actualComponents:['ModelManagement','VideoCapabilityUpgrade'],api:'in-memory fixture',realSupplierCalls:0,listeners:0},null,2));
  console.log(`VIDEO_EXECUTION_MIGRATION_UI=PASS CHECKS=${checks.length} SCENARIOS=2 UNKNOWN_MODAL=RECOVERABLE DISCONNECT_RELOAD=SAME_OPERATION CATALOG_REFRESH=ONCE REAL_API_CALLS=0 SUPPLIER_CALLS=0`);
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
