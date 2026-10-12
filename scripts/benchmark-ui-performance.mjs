import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';

const mode=process.argv[2]||'baseline',dist=process.env.PERF_DIST||`.next-performance-${mode}`;
const out=path.resolve('output/performance-20261012'),media=path.join(out,'media');
await mkdir(media,{recursive:true});
for(let i=0;i<12;i++)await copyFile('public/demos/hero-after.png',path.join(media,`image-${i}.png`));
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const base=`http://127.0.0.1:${port}`,logs=[],samples=[],errors=[];
const now=new Date().toISOString(),email='perf@example.test';
const user={name:'性能验收',email,plan:'starter',creditsTotal:99999,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[]};
const artworks=Array.from({length:300},(_,i)=>({id:'perf-'+i,title:'商品图 '+i,category:'main',prompt:'保留商品细节与真实材质。'.repeat(40),status:'completed',image:`/media/image-${i%12}.png`,gradient:'',createdAt:now,origin:'canvas',source:'canvas-add',groupId:'perf-0',parentId:i?'perf-0':null,width:1024,height:1024,canvasWidth:320,canvasHeight:320,canvasX:(i%20)*440,canvasY:Math.floor(i/20)*440}));
const models=[{id:'gpt-image-2',label:'GPT Image 2',modality:'image',supportsEdit:true,nativeResolutions:['1K','2K']}];
const features=Object.fromEntries(['image.generate','canvas.image','canvas.expand','canvas.text-generate','canvas.assistant','tool.cutout'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{low:{'1K':2},medium:{'1K':4},high:{'1K':8}}}]));
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{env:{...process.env,NEXT_DIST_DIR:dist,DATABASE_URL:'',STORAGE_DRIVER:'local',MEDIA_DIR:media,NAUMI_VIDEO_WORKER:'0',OPENAI_API_KEY:'fixture',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',SETTINGS_SECRET:randomUUID(),VIDEO_WORKER_SECRET:randomUUID(),NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
app.stdout.on('data',c=>logs.push(c.toString()));app.stderr.on('data',c=>logs.push(c.toString()));
let browser;
try{
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'app starts');
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 for(const routeName of (process.env.PERF_ROUTE?[process.env.PERF_ROUTE]:['/','/dashboard','/works','/canvas'])){
  for(let repeat=0;repeat<Number(process.env.PERF_REPEATS||3);repeat++){
   const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
   await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
   await context.addInitScript(({user})=>{
    localStorage.setItem('theme','light');localStorage.setItem('naumi:last-email',user.email);localStorage.setItem('naumi:user:'+user.email,JSON.stringify(user));localStorage.setItem('nv:canvas:last','tree:perf-0');localStorage.setItem('nv:canvas:bg','light');localStorage.setItem('nv:canvas:assistant-open','0');
    window.__perfLongTasks=[];new PerformanceObserver(list=>window.__perfLongTasks.push(...list.getEntries().map(e=>({duration:e.duration,start:e.startTime})))).observe({type:'longtask',buffered:true});
   },{user});
   const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR '+e.stack);});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE_ERROR '+m.text());});page.on('response',r=>{if(r.status()>=400)console.log('HTTP_ERROR '+r.status()+' '+r.url());});
   await page.route('**/api/**',async route=>{
    const p=new URL(route.request().url()).pathname,q=new URL(route.request().url()).searchParams;
    if(p==='/api/download')return route.continue();
    if(p==='/api/config')return route.fulfill({json:{db:true,authMode:'mock',multiUser:true,commerceVisible:false,imageQualityCapable:true,creditsMetered:true}});
    if(p==='/api/auth/session')return route.fulfill({json:{user}});
    if(p==='/api/account')return route.fulfill({json:{persisted:true,user,artworks:q.get('view')==='workbench'?artworks.slice(0,8):artworks,stats:{today:300,total:300}}});
    if(p==='/api/projects')return route.fulfill({json:{names:{'tree:perf-0':'性能测试'}}});
    if(p==='/api/models')return route.fulfill({json:{managed:false,supported:true,models,defaultModelId:models[0].id,version:1}});
    if(p==='/api/text-models')return route.fulfill({json:{models:['gpt-4o'],defaultModel:'gpt-4o'}});
    if(p==='/api/templates')return route.fulfill({json:{templates:[],total:0}});
    if(p==='/api/billing/catalog')return route.fulfill({json:{version:1,features,products:[],effective:{metering:true,commerce:false,recharge:false}}});
    if(!['GET','HEAD'].includes(route.request().method()))assert.ok(['/api/account','/api/artworks/canvas-size'].includes(p),'unexpected provider/mutation '+p);
    return route.fulfill({json:{items:[],artworks:[],favs:[],tasks:[],names:{},settings:{},nodes:[],records:[],ok:true,persisted:true}});
   });
   const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:625000,uploadThroughput:125000});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   const started=performance.now();await page.goto(base+routeName,{waitUntil:'domcontentloaded'});
   if(routeName==='/canvas')await page.getByTestId('canvas-main-toolbar').waitFor({state:'visible',timeout:60000});
   if(routeName==='/works')await page.getByRole('button',{name:'商品图 0',exact:false}).first().waitFor({state:'visible',timeout:60000});
   if(routeName==='/dashboard')await page.getByRole('heading',{name:'最近作品',exact:true}).waitFor({state:'visible',timeout:60000});
   try { await page.waitForFunction((canvas)=>{const min=canvas?10:100;const visible=[...document.images].filter(image=>{const r=image.getBoundingClientRect();return r.width>min&&r.height>min&&r.top<innerHeight&&r.bottom>0&&r.left<innerWidth&&r.right>0;});return visible.length>0&&visible.every(image=>image.complete&&image.naturalWidth>0);},routeName==='/canvas',{timeout:90000}); } catch(error) { await page.screenshot({path:path.join(out,`${mode}-failure.png`)});console.log(JSON.stringify({routeName,url:page.url(),body:(await page.locator('body').innerText()).slice(0,500),images:await page.evaluate(()=>[...document.images].filter(i=>!i.complete||!i.naturalWidth).slice(0,8).map(i=>({src:i.src,complete:i.complete,natural:i.naturalWidth,rect:i.getBoundingClientRect().toJSON()})))}));throw error; }
   const visualReadyMs=Math.round(performance.now()-started);await page.waitForTimeout(300);
   const metrics=await page.evaluate(()=>({resources:performance.getEntriesByType('resource').map(e=>({name:new URL(e.name).pathname,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize})),longTasks:window.__perfLongTasks,images:[...document.images].filter(i=>i.naturalWidth>0).map(i=>({url:i.getAttribute('src'),width:i.naturalWidth,height:i.naturalHeight}))}));
   let pan=null;
   if(routeName==='/canvas'){
    const close=page.getByRole('button',{name:'收起助手',exact:true});if(await close.isVisible())await close.click();
    await page.mouse.click(700,870);
    const transformBefore=await page.locator('.react-flow__viewport').getAttribute('style');
    await cdp.send('Performance.enable');const before=await cdp.send('Performance.getMetrics');
    if(process.env.PERF_PROFILE){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
    await page.evaluate(()=>{window.__panFrames=[];window.__panActive=true;let last=performance.now();const tick=now=>{window.__panFrames.push(now-last);last=now;if(window.__panActive)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
    await page.mouse.move(1000,870);await page.mouse.down();await page.mouse.move(600,870,{steps:60});await page.mouse.up();
    const after=await cdp.send('Performance.getMetrics');pan=await page.evaluate(()=>{window.__panActive=false;return {frames:window.__panFrames,selected:document.querySelectorAll('.react-flow__node.selected').length};});
    assert.notEqual(await page.locator('.react-flow__viewport').getAttribute('style'),transformBefore,'gesture really pans, not node drag');
    if(process.env.PERF_PROFILE)await writeFile(path.join(out,mode+'-pan-profile.json'),JSON.stringify((await cdp.send('Profiler.stop')).profile));
    pan.taskDurationMs=Math.round(1000*(after.metrics.find(m=>m.name==='TaskDuration').value-before.metrics.find(m=>m.name==='TaskDuration').value));
   }
   const sample={route:routeName,repeat,visualReadyMs,bytes:metrics.resources.reduce((n,e)=>n+e.transferSize,0),jsBytes:metrics.resources.filter(e=>e.name.endsWith('.js')).reduce((n,e)=>n+e.encodedBodySize,0),longTaskMs:Math.round(metrics.longTasks.reduce((n,e)=>n+Math.max(0,e.duration-50),0)),pan,resources:metrics.resources,images:metrics.images};samples.push(sample);console.log(JSON.stringify({mode,route:routeName,repeat,visualReadyMs,bytes:sample.bytes,jsBytes:sample.jsBytes,panTaskMs:pan?.taskDurationMs}));
   if(repeat===0)await page.screenshot({path:path.join(out,`${mode}-${routeName.replaceAll('/','')||'home'}.png`)});
   await context.close();
  }
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(out,mode+'.json'),JSON.stringify({mode,fixture:'300 nodes / 12 local 1024px images, controlled API, real production build and optimizer',conditions:{downloadMbps:5,latencyMs:80,cpuRate:4,cache:'browser disabled; server cache state documented separately',repeats:Number(process.env.PERF_REPEATS||3)},samples,errors},null,2));console.log(`PERFORMANCE_${mode.toUpperCase()}=MEASURED PROVIDER_CALLS=0`);
}finally{await browser?.close();if(app?.pid){if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'});}catch{}}else app.kill('SIGTERM');}await writeFile(path.join(out,mode+'-server.log'),logs.join(''));}

