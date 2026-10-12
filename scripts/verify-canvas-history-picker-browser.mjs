import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,expect as rawExpect} from '@playwright/test';

const out=path.resolve(process.env.CANVAS_HISTORY_EVIDENCE_DIR||'output/canvas-history-picker-20261012/browser');
const original=await readFile('tsconfig.json');
const clientFile='src/components/canvas/canvas-client.tsx',originalClient=await readFile(clientFile);
const baselineRun=process.argv.includes('--baseline');
await mkdir(out,{recursive:true});
const expect=rawExpect.configure({timeout:45000}),checks=[],errors=[],logs=[],submissions=[],positions=[];
const pass=label=>{checks.push(label);console.log('PASS '+label);};
let app,browser,page,polls=0;const persistedTexts=[];
const dist='.next-history-acceptance';
try {
 if(baselineRun)await writeFile(clientFile,await readFile('output/canvas-history-picker-20261012/BASELINE_FILE.tsx'));
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base=`http://127.0.0.1:${port}`;
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port)],{env:{...process.env,DATABASE_URL:'',NAUMI_MULTI_USER:'0',SETTINGS_SECRET:randomUUID(),VIDEO_WORKER_SECRET:randomUUID(),NAUMI_VIDEO_WORKER:'0',OPENAI_API_KEY:'fixture',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:dist},stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',c=>logs.push(c.toString()));app.stderr.on('data',c=>logs.push(c.toString()));
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 const now=new Date().toISOString(),email='canvas-feedback@example.test',image=base+'/demos/suite-demo/suppl-src.png';
 const user={name:'交互验收',email,plan:'starter',creditsTotal:99999,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[],canHigh:true};
 const art={id:'feedback-root',title:'参考图',category:'main',prompt:'保留主体',createdAt:now,status:'completed',image,gradient:'',origin:'canvas',source:'canvas-add',groupId:'feedback-root',width:1024,height:1024,canvasWidth:320,canvasHeight:320,canvasX:100,canvasY:100,ratio:'1:1',resolution:'1K'};
 const texts=[{id:'text-feedback',projectKey:'tree:feedback-root',title:'商品文案',content:'清新自然，品质生活。',prompt:'商品文案',status:'completed',canvasX:600,canvasY:550,width:380,height:260,sourceIds:[],targetIds:['prior-result'],productIds:[art.id],createdAt:now,updatedAt:now}];
 const historyLocal={...art,id:'history-local',title:'本地历史作品',image:'/media/fixture-local.png',groupId:'history-local',canvasX:2000};
 const historyHttp={...art,id:'history-http',title:'远程历史作品',groupId:'history-http',canvasX:2400};
 const historyPending={...historyLocal,id:'history-pending',status:'pending'},historyPlaceholder={...historyLocal,id:'history-placeholder',source:'workflow-placeholder'};
 const gallery={...historyLocal,id:'gallery-local',origin:'workbench',source:'generate',groupId:'gallery-local',batchId:null};
 const suite=[{...gallery,id:'suite-local-1',category:'suite',batchId:'suite-fixture'},{...gallery,id:'suite-local-2',category:'suite',batchId:'suite-fixture'}];
 let settings={},results=[],copyFails=true,releaseCopy;const copies=[],favoriteRequests=[];let favoritesFail=true;
 const older=Array.from({length:62},(_,i)=>({...historyLocal,id:'older-'+i,title:'旧作品 '+i,groupId:'older-'+i}));
 const jobs=new Map();
 const model={id:'gpt-image-2',label:'GPT Image 2',modality:'image',supportsEdit:true,qualities:['low','medium','high'],qualitySupported:true,nativeResolutions:['1K','2K'],generationParameters:{ratios:['1:1','3:4','4:3','16:9','9:16'],resolutions:['1K','2K']}};
 const features=Object.fromEntries(['image.generate','canvas.image','canvas.expand','canvas.text-generate','canvas.assistant','tool.cutout'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{low:{'1K':2},medium:{'1K':4},high:{'1K':8}}}]));
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
 await context.addInitScript(({user})=>{localStorage.setItem('theme','light');localStorage.setItem('naumi:last-email',user.email);localStorage.setItem('naumi:user:'+user.email,JSON.stringify(user));localStorage.setItem('nv:canvas:last','tree:feedback-root');localStorage.setItem('nv:canvas:bg','light');},{user});
 page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR '+e.message);});
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;
  if(p==='/api/config')return route.fulfill({json:{db:true,authMode:'mock',multiUser:true,commerceVisible:false,imageQualityCapable:true,creditsMetered:true,imageModels:[model],defaultImageModel:model.id}});
  if(p==='/api/auth/session')return route.fulfill({json:{user}});
  if(p==='/api/account')return route.fulfill({json:{persisted:true,user,artworks:page.url().includes('/works')?[gallery,...suite]:[art,historyLocal,historyHttp,historyPending,historyPlaceholder,...older,...results]}});
  if(p==='/api/favorites'){
   if(req.method()==='GET')return route.fulfill({json:{favs:[]}});
   favoriteRequests.push(req.postDataJSON()?.templateId || url.searchParams.get('templateId'));
   return route.fulfill({status:favoritesFail?500:200,json:{ok:!favoritesFail}});
  }
  if(p==='/api/templates')return route.fulfill({json:{templates:[{id:'local-template',title:'本地模板',image:'/media/fixture-local.png',sourceImage:'/media/fixture-local.png',prompt:'模板参考图验收',category:'主图'}]}});
  if(p==='/api/projects')return route.fulfill({json:{names:{'tree:feedback-root':'体验验收'}}});
  if(p==='/api/canvas/text-nodes'){if(req.method()==='POST')persistedTexts.push(req.postDataJSON());return route.fulfill({json:req.method()==='POST'?{persisted:true,node:req.postDataJSON()}:{persisted:true,nodes:texts}});}
  if(p==='/api/canvas/node-settings')return route.fulfill({json:{persisted:true,settings}});
  if(p==='/api/models')return route.fulfill({json:{managed:false,supported:true,feature:url.searchParams.get('feature'),version:1,models:[model],defaultModelId:model.id}});
  if(p==='/api/text-models')return route.fulfill({json:{models:['gpt-4o'],defaultModel:'gpt-4o'}});
  if(p==='/api/billing/catalog')return route.fulfill({json:{version:1,features,products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}}});
  if(p==='/api/billing/quote')return route.fulfill({json:{...req.postDataJSON(),credits:4,reserveCredits:4,version:1}});
  if(p==='/api/download')return route.fulfill({contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')});
  if(p==='/api/generate-image') {
   if(req.method()==='POST') {
    submissions.push({body:req.postDataBuffer()?.toString('utf8').split('filename=')[0],headers:req.headers()});
    
    const id='feedback-job-'+submissions.length;jobs.set(id,{status:'pending',images:[]});return route.fulfill({json:{jobId:id}});
   }
   polls++;
   return route.fulfill({json:{...jobs.get(url.searchParams.get('job')),user}});
  }
  if(p==='/api/artworks/add'){
   const body=req.postDataJSON();copies.push(body);
   if(copyFails)return route.fulfill({status:409,json:{error:'fixture internal detail'}});
   await new Promise(resolve=>{releaseCopy=resolve;});
   const id='history-copy-'+copies.length;
   const result={...art,...body.src,id,source:'canvas-add',groupId:body.parentId||id,parentId:body.parentId,canvasX:body.x,canvasY:body.y};results.push(result);
   return route.fulfill({json:{ok:true,id:result.id}});
  }
  if(p==='/api/artworks/position'){positions.push(req.postDataJSON());return route.fulfill({json:{ok:true}});}
  if(p==='/api/artworks/get') {return route.fulfill({json:{artworks:results}});}
  return route.fulfill({json:{items:[],tasks:[],names:{},nodes:[],settings:{},records:[],artworks:[],ok:true,persisted:true}});
 });
 await page.route('**/_next/static/chunks/**',async route=>{const file=path.resolve(dist,new URL(route.request().url()).pathname.replace('/_next/',''));assert.ok(file.startsWith(path.resolve(dist)+path.sep));await route.fulfill({contentType:'application/javascript',body:await readFile(file)});});
 await page.route('**/demos/suite-demo/suppl-src.png',async route=>route.fulfill({contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')}));
 await page.route('**/media/fixture-local.png',async route=>route.fulfill({contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')}));
 await page.goto(base+'/canvas');
 const toolbar=page.getByTestId('canvas-main-toolbar');
 await expect(toolbar).toBeVisible();
 await page.getByRole('button',{name:'收起助手',exact:true}).click();await page.waitForTimeout(400);
 await toolbar.locator('[data-tool="history"]').click();
 const dialog=page.getByRole('dialog',{name:'从生成历史选择',exact:false});
 const picker=page.locator('.fixed.inset-0').filter({has:page.getByText('从生成历史选择',{exact:true})});
 const history=baselineRun?picker:dialog;
 await expect(history).toBeVisible();
 if(baselineRun){
  await expect(history.locator('img[alt="本地历史作品"]')).toHaveCount(0);
  await expect(history.locator('img[alt="远程历史作品"]')).toHaveCount(1);
  console.log('BASELINE_HISTORY=CONFIRMED LOCAL_MEDIA=FILTERED_OUT HTTP_HISTORY=VISIBLE');
 }else{
  await expect(history.locator('img[alt="本地历史作品"]')).toBeVisible();
  await expect(history.locator('img[alt="远程历史作品"]')).toBeVisible();
  await expect(history.locator('[data-history-artwork-id="history-pending"]')).toHaveCount(0);
  await expect(history.locator('[data-history-artwork-id="history-placeholder"]')).toHaveCount(0);
  await expect(history.locator('[data-history-artwork-id="older-61"]')).toHaveCount(0);
  await history.getByRole('button',{name:'加载更多',exact:true}).click();
  await expect(history.locator('[data-history-artwork-id="older-61"]')).toBeAttached();
  pass('older history after the initial 60 remains accessible without rendering everything at once');
  pass('dock opens light history dialog with both local /media and hosted HTTP artwork');
  await history.locator('[data-history-artwork-id="history-local"]').click();
  await expect(history.getByRole('alert')).toHaveText('添加失败，请重试');
  await expect(history).toBeVisible();await expect(history.locator('[data-history-artwork-id="history-local"]')).toBeEnabled();
  pass('failed copy remains visible and retryable rather than silently closing');
  copyFails=false;
  await history.locator('[data-history-artwork-id="history-local"]').click();
  await expect(history.locator('[data-history-artwork-id="history-http"]')).toBeDisabled();
  await expect.poll(()=>copies.length).toBe(2);releaseCopy();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.react-flow__node[data-id="history-copy-2"]')).toBeVisible();
  assert.equal(copies[1].src.id,'history-local');assert.equal(copies[1].src.image,'/media/fixture-local.png');assert.equal(copies[1].parentId,art.id);assert.ok(Number.isFinite(copies[1].x)&&Number.isFinite(copies[1].y));
  pass('single successful copy lands in current project at captured position without generation');
  await toolbar.locator('[data-tool="history"]').click();await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await toolbar.locator('[data-tool="history"]').click();await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'关闭',exact:true}).click();await expect(dialog).toHaveCount(0);
  pass('Escape and labeled close button dismiss the dialog without canvas actions');
  await page.screenshot({path:path.join(out,'history-result.png')});
  await page.evaluate(()=>localStorage.removeItem('nv:canvas:last'));await page.reload();
  await page.getByRole('button',{name:'新建项目',exact:true}).filter({visible:true}).first().click();
  await expect(toolbar).toBeVisible();await toolbar.locator('[data-tool="history"]').click();await expect(dialog).toBeVisible();
  await dialog.locator('[data-history-artwork-id="history-local"]').click();await expect.poll(()=>copies.length).toBe(3);releaseCopy();
  await expect(page.locator('.react-flow__node[data-id="history-copy-3"]')).toBeVisible();assert.equal(copies[2].parentId,null);
  pass('blank canvas opens the newly created project and selects the copied history node');
  await page.screenshot({path:path.join(out,'blank-history.png')});
  await page.goto(base+'/works');
  await page.getByRole('button',{name:'收藏',exact:true}).first().click();await expect(page.getByText('收藏更新失败，请重试',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'已收藏',exact:true}).click();await expect(page.getByText('还没有作品,去创作第一张吧',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'全部',exact:true}).click();await page.getByRole('button',{name:'多选',exact:true}).click();await page.getByRole('button',{name:'本地历史作品',exact:false}).first().click();
  await page.getByRole('button',{name:'全选',exact:true}).click();await page.getByRole('button',{name:'收藏',exact:true}).click();await expect(page.getByText('部分收藏失败，请重试',{exact:true})).toBeVisible();
  favoritesFail=false;await page.getByRole('button',{name:'收藏',exact:true}).click();await expect(page.getByText('已收藏 3 张',{exact:true})).toBeVisible();
  pass('real works page rolls back failed single favorites and never reports failed batch favorites as success');
  await page.screenshot({path:path.join(out,'works-favorites.png')});
  await page.goto(base+'/generate?tpl=local-template');await expect(page.locator('img[src^="blob:"]')).toBeVisible();
  pass('local template source image actually loads into the generation reference slot');
  assert.deepEqual(errors,[]);assert.equal(submissions.length,0);assert.equal(copies.length,3);
  console.log('HISTORY_BROWSER=PASS LOCAL_AND_REMOTE=VISIBLE COPY=LANDED FAILURE=RETRYABLE DUPLICATE=BLOCKED CLOSE=PASS PROVIDER_CALLS=0');
 }
 await page.screenshot({path:path.join(out,baselineRun?'history-result.png':'final-page.png')});
 await writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors,copies,submissions,providerCalls:0},null,2));
}catch(error){await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'failure-details.json'),JSON.stringify({checks,errors,body:await page?.locator('body').innerText().catch(()=>null)},null,2));throw error;}
finally{await browser?.close();if(app?.pid){if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'});}catch{}}else app.kill('SIGTERM');}await writeFile('tsconfig.json',original);if(baselineRun)await writeFile(clientFile,originalClient);await writeFile(path.join(out,'next.log'),logs.join(''));}
