import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,expect as rawExpect} from '@playwright/test';

const out=path.resolve(process.env.CANVAS_BATCH_EVIDENCE_DIR||'output/canvas-batch-toolbar/browser');
const original=await readFile('tsconfig.json');
await mkdir(out,{recursive:true});
const expect=rawExpect.configure({timeout:45000}),checks=[],errors=[],logs=[],submissions=[],positions=[];
const pass=label=>{checks.push(label);console.log('PASS '+label);};
let app,browser,page,releaseStart,releaseResults,holdStart=false,holdResults=false,outcome='pending',polls=0;
const dist='.next-batch-acceptance';
const baseline=process.env.CANVAS_BATCH_BASELINE==='1',metrics=[],mutations=[];
try {
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base=`http://127.0.0.1:${port}`;
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port)],{env:{...process.env,DATABASE_URL:'',NAUMI_MULTI_USER:'0',SETTINGS_SECRET:randomUUID(),VIDEO_WORKER_SECRET:randomUUID(),NAUMI_VIDEO_WORKER:'0',OPENAI_API_KEY:'fixture',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:dist},stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',c=>logs.push(c.toString()));app.stderr.on('data',c=>logs.push(c.toString()));
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 const now=new Date().toISOString(),email='canvas-feedback@example.test',image=base+'/demos/suite-demo/suppl-src.png';
 const user={name:'交互验收',email,plan:'starter',creditsTotal:99999,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[],canHigh:true};
 const art={id:'feedback-root',title:'参考图',category:'main',prompt:'保留主体',createdAt:now,status:'completed',image,gradient:'',origin:'canvas',source:'canvas-add',groupId:'feedback-root',width:1024,height:1024,canvasWidth:320,canvasHeight:320,canvasX:100,canvasY:100,ratio:'1:1',resolution:'1K'};
 const texts=[{id:'text-feedback',projectKey:'tree:feedback-root',title:'商品文案',content:'清新自然，品质生活。',prompt:'商品文案',status:'completed',canvasX:600,canvasY:100,width:380,height:260,sourceIds:[],targetIds:[],createdAt:now,updatedAt:now}];
 const images=[art,{...art,id:'batch-image-2',title:'参考图二',canvasX:460},{...art,id:'batch-image-3',title:'参考图三',canvasX:820}];
texts[0].canvasX=100;texts[0].canvasY=520;
texts.push({...texts[0],id:'text-batch-2',title:'文案二',canvasX:540});
let settings={},results=[];
 const model={id:'gpt-image-2',label:'GPT Image 2',modality:'image',supportsEdit:true,qualities:['low','medium','high'],qualitySupported:true,nativeResolutions:['1K','2K'],generationParameters:{ratios:['1:1','3:4','4:3','16:9','9:16'],resolutions:['1K','2K']}};
 const features=Object.fromEntries(['image.generate','canvas.image','canvas.text-generate','canvas.assistant','tool.cutout'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{low:{'1K':2},medium:{'1K':4},high:{'1K':8}}}]));
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
 await context.addInitScript(({user})=>{localStorage.setItem('theme','light');localStorage.setItem('naumi:last-email',user.email);localStorage.setItem('naumi:user:'+user.email,JSON.stringify(user));localStorage.setItem('nv:canvas:last','tree:feedback-root');localStorage.setItem('nv:canvas:bg','light');},{user});
 page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR '+e.message);});
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;
  if(p==='/api/config')return route.fulfill({json:{db:true,authMode:'mock',multiUser:true,commerceVisible:false,imageQualityCapable:true,creditsMetered:true,imageModels:[model],defaultImageModel:model.id}});
  if(p==='/api/auth/session')return route.fulfill({json:{user}});
  if(p==='/api/account')return route.fulfill({json:{persisted:true,user,artworks:images}});
  if(p==='/api/projects')return route.fulfill({json:{names:{'tree:feedback-root':'体验验收'}}});
  if(p==='/api/canvas/text-nodes')return route.fulfill({json:req.method()==='POST'?{persisted:true,node:req.postDataJSON()}:{persisted:true,nodes:texts}});
  if(p==='/api/canvas/groups'){const body=req.postDataJSON();mutations.push({path:p,body});const assignments=body.assignments||body.ids.map(id=>({id,canvasGroupId:'batch-fixture-group'}));for(const a of assignments){const image=images.find(i=>i.id===a.id);if(image)image.canvasGroupId=a.canvasGroupId;}return route.fulfill({json:{ok:true,assignments}});}
  if(p==='/api/artworks/mark'){const body=req.postDataJSON();mutations.push({path:p,body});return route.fulfill({json:{ok:true}});}
  if(p==='/api/canvas/node-settings')return route.fulfill({json:{persisted:true,settings}});
  if(p==='/api/models')return route.fulfill({json:{managed:false,supported:true,feature:url.searchParams.get('feature'),version:1,models:[model],defaultModelId:model.id}});
  if(p==='/api/text-models')return route.fulfill({json:{models:['gpt-4o'],defaultModel:'gpt-4o'}});
  if(p==='/api/billing/catalog')return route.fulfill({json:{version:1,features,products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}}});
  if(p==='/api/billing/quote')return route.fulfill({json:{...req.postDataJSON(),credits:4,reserveCredits:4,version:1}});
  if(p==='/api/download')return route.fulfill({contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')});
  if(p==='/api/generate-image') {
   if(req.method()==='POST') {
    submissions.push({body:req.postDataBuffer()?.toString('utf8').split('filename=')[0],headers:req.headers()});
    if(holdStart)await new Promise(r=>releaseStart=r);
    return route.fulfill({json:{jobId:'feedback-job-'+submissions.length}});
   }
   polls++;
   if(outcome==='error')return route.fulfill({json:{status:'error',error:'模拟生成失败，请重试'}});
   return route.fulfill({json:outcome==='done'?{status:'done',images:results.map(a=>({id:a.id,url:a.image,width:a.width,height:a.height})),user}:{status:'pending'}});
  }
  if(p==='/api/artworks/position'){positions.push(req.postDataJSON());return route.fulfill({json:{ok:true}});}
  if(p==='/api/artworks/get') {if(holdResults)await new Promise(r=>releaseResults=r);return route.fulfill({json:{artworks:results.map(a=>({...a,canvasX:positions.find(v=>v.id===a.id)?.x,canvasY:positions.find(v=>v.id===a.id)?.y}))}});}
  return route.fulfill({json:{items:[],tasks:[],names:{},nodes:[],settings:{},records:[],artworks:[],ok:true,persisted:true}});
 });
 await page.route('**/_next/static/chunks/**',async route=>{const file=path.resolve(dist,new URL(route.request().url()).pathname.replace('/_next/',''));assert.ok(file.startsWith(path.resolve(dist)+path.sep));await route.fulfill({contentType:'application/javascript',body:await readFile(file)});});
 await page.route('**/demos/suite-demo/suppl-src.png',async route=>route.fulfill({contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')}));

 const imageIds=images.map(a=>a.id),textIds=texts.map(t=>t.id);
 const imageBar=page.locator('[aria-label="批量操作"]'),textBar=page.getByTestId('text-batch-bar');
 async function shiftSelect(ids){
  const boxes=await Promise.all(ids.map(id=>page.locator('.react-flow__node[data-id="'+id+'"]').boundingBox()));assert.ok(boxes.every(Boolean));
  const minX=Math.min(...boxes.map(b=>b.x)),minY=Math.min(...boxes.map(b=>b.y)),maxX=Math.max(...boxes.map(b=>b.x+b.width)),maxY=Math.max(...boxes.map(b=>b.y+b.height));
  const pane=await page.locator('.react-flow__pane').boundingBox();
  const start={x:Math.max(pane.x+3,minX-12),y:Math.max(pane.y+65,minY-20)},end={x:Math.min(pane.x+pane.width-3,maxX+12),y:Math.min(pane.y+pane.height-90,maxY+12)};
  await page.keyboard.down('Shift');await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:16});await page.mouse.up();await page.keyboard.up('Shift');
  await expect.poll(()=>page.locator('.react-flow__node.selected').evaluateAll(els=>els.map(e=>e.dataset.id).sort())).toEqual([...ids].sort());
 }
 async function measure(bar,label){
  await expect(bar).toBeVisible();
  const info=await bar.evaluate(el=>{
   const r=el.getBoundingClientRect();const buttons=[...el.querySelectorAll('button')].map(b=>{const box=b.getBoundingClientRect(),style=getComputedStyle(b),icon=b.querySelector('svg')?.getBoundingClientRect();const tops=[];const walker=document.createTreeWalker(b,NodeFilter.SHOW_TEXT);while(walker.nextNode()){if(!walker.currentNode.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(walker.currentNode);for(const rect of range.getClientRects())if(rect.width)tops.push(Math.round(rect.top));}return {label:b.textContent.trim()||b.getAttribute('aria-label'),width:box.width,height:box.height,nowrap:style.whiteSpace,lines:new Set(tops).size,iconWidth:icon?.width};});
   const scroller=el.querySelector('[data-batch-scroll]')||el;return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},buttons,scroll:{client:scroller.clientWidth,total:scroller.scrollWidth}};
  });metrics.push({label,...info});
  if(!baseline){assert.ok(info.buttons.every(b=>b.lines<=1&&b.height===36&&b.iconWidth===16),JSON.stringify(info));assert.ok(info.rect.x>=0&&info.rect.x+info.rect.width<=page.viewportSize().width);assert.ok(info.rect.height<=60);const main=await page.getByTestId('canvas-main-toolbar').boundingBox();assert.ok(info.rect.y+info.rect.height<=main.y,'batch bar overlaps main dock');}
  await page.screenshot({path:path.join(out,label+'.png')});return info;
 }
 for(const size of [{width:1440,height:1000},{width:1024,height:768},{width:800,height:600},{width:640,height:480},{width:390,height:760},{width:320,height:760}]){
  await page.setViewportSize(size);await page.goto(base+'/canvas');await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await shiftSelect(imageIds);await expect(imageBar).toContainText('已选 3 个');const info=await measure(imageBar,'images-'+size.width);
  if(!baseline){
   const count=imageBar.getByTestId('batch-selection-count'),close=imageBar.getByRole('button',{name:'清除选择'}),scroll=imageBar.locator('[data-batch-scroll]');const c=await count.boundingBox(),x=await close.boundingBox();
   if(info.scroll.total>info.scroll.client){await scroll.evaluate(el=>el.scrollLeft=el.scrollWidth);await expect(imageBar.getByRole('button',{name:'删除',exact:true})).toBeInViewport();assert.deepEqual(await count.boundingBox(),c);assert.deepEqual(await close.boundingBox(),x);await scroll.evaluate(el=>el.scrollLeft=0);const last=imageBar.getByRole('button',{name:'删除',exact:true});await last.focus();await expect(last).toBeInViewport();await scroll.evaluate(el=>el.scrollLeft=0);}
   await close.click();await expect(imageBar).toHaveCount(0);await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);pass('real Shift image selection + single-line uniform controls + fixed count/close + no dock overlap '+size.width);
   await shiftSelect(textIds);await measure(textBar,'texts-'+size.width);await textBar.getByRole('button',{name:'清除选择'}).click();await expect(textBar).toHaveCount(0);pass('real Shift text selection and clear '+size.width);
  }
 }
 if(baseline){assert.ok(metrics.some(m=>m.buttons.some(b=>b.lines>1||b.iconWidth<15)),'baseline did not reproduce');console.log('BASELINE=REPRODUCED SHIFT_SELECTION=PASS WRAPPING_OR_ICON_SHRINK=YES');}
 else{
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/canvas');await expect(page.locator('.react-flow__node')).toHaveCount(5);await shiftSelect(imageIds);
  await imageBar.getByRole('button',{name:'成组',exact:true}).click();await expect(imageBar.getByRole('button',{name:'解组',exact:true})).toBeVisible();assert.deepEqual(mutations[0].body.ids.sort(),[...imageIds].sort());
  await imageBar.getByRole('button',{name:'解组',exact:true}).click();await expect(imageBar.getByRole('button',{name:'成组',exact:true})).toBeVisible();assert.ok(mutations[1].body.assignments.every(a=>a.canvasGroupId===null));pass('group/ungroup preserves selected IDs and original API');
  await imageBar.getByRole('button',{name:'批量标记',exact:true}).click();await expect(imageBar.getByRole('button',{name:'取消标记',exact:true})).toBeVisible();assert.equal(mutations.filter(m=>m.path==='/api/artworks/mark').length,3);pass('batch mark remains actionable');
  await page.locator('.react-flow__node[data-id="feedback-root"]').dispatchEvent('contextmenu',{clientX:200,clientY:160,bubbles:true});await expect(page.getByTestId('canvas-context-menu')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByTestId('canvas-context-menu')).toHaveCount(0);pass('selected-node context handler still opens and dismisses');
  await imageBar.getByRole('button',{name:'合并生成节点',exact:true}).click();await expect(imageBar).toHaveCount(0);await expect(page.locator('.react-flow__node[data-id^="pend-"]')).toHaveCount(1);pass('merge creates existing pending generation node without model call');
  assert.equal(submissions.length,0);console.log('MODIFIED=PASS SHIFT_SELECTION=IMAGE_TEXT VIEWPORTS=6 GROUP_MARK_MERGE=PASS PROVIDER_CALLS=0');
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors,metrics,mutations,providerCalls:0},null,2));
}catch(error){await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'failure-details.json'),JSON.stringify({checks,errors,metrics,mutations,body:await page?.locator('body').innerText().catch(()=>null)},null,2));throw error;}
finally{await browser?.close();if(app?.pid){if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'});}catch{}}else app.kill('SIGTERM');}await writeFile('tsconfig.json',original);await writeFile(path.join(out,'next.log'),logs.join(''));}
