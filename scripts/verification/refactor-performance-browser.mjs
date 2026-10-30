import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {chromium,expect as rawExpect} from '@playwright/test';

const exec=promisify(execFile),distribution=values=>{
 if(!values.length)return{count:0,min:null,p50:null,p95:null,max:null};
 const sorted=[...values].sort((a,b)=>a-b),percentile=p=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];
 return{count:sorted.length,min:sorted[0],p50:percentile(.5),p95:percentile(.95),max:sorted.at(-1)};
};
export async function benchmarkPackagedPerformance(){
 const arg=key=>{const i=process.argv.indexOf(key);return i<0?undefined:process.argv[i+1];},base=arg('--base'),container=arg('--container'),out=path.resolve(arg('--out')),mode=arg('--mode'),repeats=Number(arg('--repeats')||4);
 assert.equal(new URL(base).hostname,'127.0.0.1');assert.match(container,/^refactor-r8d-[a-f0-9]+-web$/);assert.ok(['baseline','modified'].includes(mode));assert.ok(repeats>=2&&repeats<=10);
 await mkdir(out,{recursive:true});const setup=JSON.parse(await readFile(path.join(out,'SETUP.json'),'utf8')),expect=rawExpect.configure({timeout:90000}),browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],httpErrors=[],writes=[],samples=[],api=[];
 const flushServer=async()=>{
  let previous=-1;try{previous=JSON.parse(await readFile(path.join(out,'SERVER.json'),'utf8')).generation;}catch{}
  await exec('docker',['kill','--signal=USR2',container],{windowsHide:true});
  for(let n=0;n<100;n++){
   try{const d=JSON.parse(await readFile(path.join(out,'SERVER.json'),'utf8'));if(d.generation>previous)return d;}catch{}
   await new Promise(resolve=>setTimeout(resolve,20));
  }throw Error('SERVER_OBSERVER_SIGNAL_NOT_ACKNOWLEDGED');
 };
 let context,activePage;
 try{
  context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
  const login=await context.request.post(base+'/api/auth/login',{data:{email:setup.owner,password:setup.password}});assert.equal(login.status(),200,await login.text());
  await context.addInitScript(()=>{
   localStorage.setItem('theme','light');localStorage.setItem('nv:canvas:bg','light');localStorage.setItem('nv:canvas:assistant-open','0');
   // Only view preferences; no identity/document/task fixtures enter the page.
   localStorage.setItem('nv:canvas:last','tree:perf-0');
   window.__r8d={longTasks:[],events:[]};
   new PerformanceObserver(list=>window.__r8d.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
   new PerformanceObserver(list=>window.__r8d.events.push(...list.getEntries().map(e=>({name:e.name,interactionId:e.interactionId,start:e.startTime,duration:e.duration,processingStart:e.processingStart,processingEnd:e.processingEnd})))).observe({type:'event',buffered:true,durationThreshold:16});
  });
  await flushServer();
  for(let repeat=0;repeat<repeats;repeat++){
   const page=await context.newPage();activePage=page;page.on('pageerror',error=>errors.push({repeat,message:error.message,stack:error.stack}));
   page.on('request',request=>{const url=new URL(request.url());if(url.origin!==base)errors.push({externalRequest:request.url()});if(url.pathname.startsWith('/api/')&&!['GET','HEAD'].includes(request.method()))writes.push({path:url.pathname,method:request.method()});});
   page.on('response',response=>{if(response.status()>=400)httpErrors.push({status:response.status(),url:response.url()});});
   page.on('dialog',async dialog=>{errors.push({dialog:dialog.message()});await dialog.dismiss();});
   const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');if(!repeat)await cdp.send('Network.clearBrowserCache');
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:625000,uploadThroughput:125000});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Performance.enable');
   const started=performance.now();await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});
   const root=page.locator('.react-flow__node[data-id="perf-0"]'),card=page.getByTitle('R8D 300-node fixed project',{exact:true});
   await expect.poll(async()=>await root.isVisible()||await card.isVisible()).toBe(true);if(!await root.isVisible())await card.click();
   await expect(root).toBeVisible();await expect(page.getByTestId('canvas-main-toolbar')).toBeVisible();
   await page.waitForFunction(()=>[...document.querySelectorAll('.react-flow__node img')].some(image=>{const box=image.getBoundingClientRect();return box.width>10&&box.height>10&&box.top<innerHeight&&box.bottom>0&&box.left<innerWidth&&box.right>0&&image.complete&&image.naturalWidth>0;}),{},{timeout:45000});
   const visualReadyMs=performance.now()-started,tools=page.getByTestId('canvas-main-toolbar'),view=page.getByTestId('canvas-view-toolbar');
   const close=page.getByRole('button',{name:'收起助手',exact:true});if(await close.isVisible())await close.click();
   // The existing scene virtualizes above300 nodes; do not disable that product
   // behavior to make the measurement look comparable. PG owns the fixed320.
   const renderedNodes=await page.locator('.react-flow__node').count();assert.ok(renderedNodes>0&&renderedNodes<=320);
   const interactionsStarted=await page.evaluate(()=>performance.now());
   for(let n=0;n<8;n++)for(const tool of ['hand','move']){await tools.locator(`[data-tool="${tool}"]`).click();await expect(tools.locator(`[data-tool="${tool}"]`)).toHaveAttribute('aria-pressed','true');}
   for(let n=0;n<4;n++)for(const name of ['小地图','网格吸附']){
    const button=view.getByRole('button',{name,exact:true});await button.click();await expect(button).toHaveAttribute('aria-pressed','true');await button.click();await expect(button).toHaveAttribute('aria-pressed','false');
   }
   await tools.locator('[data-tool="hand"]').click();const beforeTransform=await page.locator('.react-flow__viewport').getAttribute('style'),before=await cdp.send('Performance.getMetrics');
   await page.evaluate(()=>{window.__r8d.frames=[];window.__r8d.pan=true;let last=performance.now();const tick=at=>{window.__r8d.frames.push(at-last);last=at;if(window.__r8d.pan)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
   await page.mouse.move(1080,700);await page.mouse.down();await page.mouse.move(700,700,{steps:60});await page.mouse.up();
   assert.notEqual(await page.locator('.react-flow__viewport').getAttribute('style'),beforeTransform,'actual hand gesture pans instead of dragging a document');
   const after=await cdp.send('Performance.getMetrics');await page.evaluate(()=>{window.__r8d.pan=false;return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
   const data=await page.evaluate(()=>({events:window.__r8d.events,longTasks:window.__r8d.longTasks,frames:window.__r8d.frames,resources:performance.getEntriesByType('resource').map(e=>({path:new URL(e.name).pathname,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize})),heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,navigation:performance.getEntriesByType('navigation')[0].toJSON()}));
   const grouped=new Map();for(const event of data.events)if(event.interactionId&&event.start>=interactionsStarted)grouped.set(event.interactionId,Math.max(grouped.get(event.interactionId)||0,event.duration));
   const durations=[...grouped.values()].sort((a,b)=>b-a),taskValue=metrics=>metrics.metrics.find(item=>item.name==='TaskDuration').value;
   const row={mode,repeat,renderedNodes,cache:repeat?'warm browser+server':'cold browser;new Web process;startup and login already ready',visualReadyMs,labInpMs:durations.length?durations[Math.floor(durations.length/50)]:null,interactionCount:durations.length,interactionDurations:durations,panTaskMs:1000*(taskValue(after)-taskValue(before)),frameMs:distribution(data.frames),longTaskBlockingMs:data.longTasks.reduce((sum,event)=>sum+Math.max(0,event.duration-50),0),jsBytes:data.resources.filter(resource=>resource.path.endsWith('.js')).reduce((sum,resource)=>sum+resource.encodedBodySize,0),...data};
   assert.ok(row.interactionCount>0,'native EventTiming samples actually observed');samples.push(row);await writeFile(path.join(out,`sample-${repeat}.json`),JSON.stringify(row,null,2)+'\n');
   if(repeat===0)await page.screenshot({path:path.join(out,'canvas-performance.png')});
   console.log('PERF_UI mode='+mode+' repeat='+repeat+' cache='+row.cache+' readyMs='+visualReadyMs.toFixed(1)+' labINP='+row.labInpMs+' interactions='+row.interactionCount+' panTaskMs='+row.panTaskMs.toFixed(1));await page.close();
  }
  const headers={'x-naumi-workspace':'personal','x-naumi-project-context':'tree:perf-0'};
  const paths=['/api/account?view=canvas','/api/projects','/api/canvas/text-nodes'];
  for(let i=0;i<60;i++){
   const pathname=paths[i%paths.length],started=performance.now(),response=await context.request.get(base+pathname,{headers});const bytes=await response.body();assert.equal(response.status(),200,bytes.toString().slice(0,300));api.push({kind:'read',path:pathname,ms:performance.now()-started,bytes:bytes.length,status:response.status()});
  }
  for(let i=0;i<30;i++){
   const body={version:1,operationId:randomUUID(),entry:'canvas',mode:'generate',prompt:'Fixed R8D preparation input',modelId:'image-a',parameters:{quality:'medium',resolution:'1K',ratio:'1:1'},output:{format:'png'},variants:1},started=performance.now();
   const response=await context.request.post(base+'/api/imagegen/plan',{headers,data:body}),result=await response.json();assert.equal(response.status(),200,JSON.stringify(result));assert.equal(result.totalCredits,6);api.push({kind:'prepare',path:'/api/imagegen/plan',ms:performance.now()-started,status:response.status(),operationId:body.operationId,credits:result.totalCredits});
  }
  const server=await flushServer();assert.ok(server.queries.length>0,'actual PG queries observed');assert.deepEqual(errors,[]);assert.deepEqual(httpErrors,[]);
  assert.ok(writes.every(write=>['/api/imagegen/plan','/api/billing/quote','/api/media/image-cache','/api/canvas/text-nodes','/api/artworks/canvas-size'].includes(write.path)),'only quote/read-metadata and original automatic dimension saves;no paid or extra UI mutations');
  const report={status:'MEASURED',mode,samples,api,server,errors,httpErrors,writes,routeMocks:0,auth:'actual original login',fixture:setup.counts,conditions:{viewport:[1440,1000],cpuRate:4,downloadMbps:5,latencyMs:80,repeats,serverMemoryMiB:1536,serverCpu:2,labInp:'EventTiming interactionId max duration;98th percentile only when at least50 observed;not field INP or capacity',observer:'same measurement-only preload on both images;20ms RSS+kernel lifetime VmHWM;10ms eventloop histogram'},summary:{visualReadyMs:distribution(samples.map(sample=>sample.visualReadyMs)),labInpMs:distribution(samples.map(sample=>sample.labInpMs)),panTaskMs:distribution(samples.map(sample=>sample.panTaskMs)),prepareMs:distribution(api.filter(row=>row.kind==='prepare').map(row=>row.ms)),readMs:distribution(api.filter(row=>row.kind==='read').map(row=>row.ms)),pgQueryMs:distribution(server.queries)},capacityClaim:false};
  await writeFile(path.join(out,'PERFORMANCE.json'),JSON.stringify(report,null,2)+'\n');console.log('REFACTOR_PERFORMANCE=MEASURED MODE='+mode+' UI='+samples.length+' READS=60 PREPARES=30 REAL_PG=1 REAL_HTTP=1 MOCK_ROUTES=0 PAID_POST=0');
 }catch(error){
  let diagnostic;try{await activePage?.screenshot({path:path.join(out,'performance-failure.png')});diagnostic=await activePage?.evaluate(()=>({body:document.body.innerText.slice(-6000),images:[...document.images].map(image=>({src:image.getAttribute('src'),complete:image.complete,width:image.naturalWidth,rect:image.getBoundingClientRect().toJSON(),visible:image.dataset.mediaVisible,variant:image.dataset.mediaVariant,denied:image.dataset.browserImageDenied})).slice(0,50)}));}catch{}
  await writeFile(path.join(out,'PERFORMANCE_FAILURE.json'),JSON.stringify({error:String(error),stack:error.stack,errors,httpErrors,writes,samples,api,diagnostic},null,2)+'\n');throw error;
 }
 finally{await context?.close();await browser.close();}
}
