import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {chromium,expect as baseExpect} from '@playwright/test';

const baseline=process.argv.includes('--baseline');
const round2=process.argv.includes('--round2');
const round2Fixture={};
const managedFixture=true;
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
const output=path.resolve(process.env.MODEL_LABEL_EVIDENCE_DIR||'output/model-selector-clean-labels/browser');
await mkdir(output,{recursive:true});
const originalConfig=await readFile('tsconfig.json');
const tools=JSON.parse(execFileSync(process.execPath,['node_modules/tsx/dist/cli.mjs','-e','import {TOOLS} from "./src/lib/tool-meta";console.log(JSON.stringify(TOOLS.map(({slug,href,key})=>({slug,href,key}))))'],{encoding:'utf8'}));
const expect=baseExpect.configure({timeout:45000}),results=[],errors=[],logs=[],requests=[];
let app,browser,page,writes=0,success=false,historyFailure=false,videoFixture=false,videoCatalogFailure=false,downloadFixture=false;
const interactions=[],submissions=[];
const dist='.next-model-label-acceptance';
try {
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base=`http://127.0.0.1:${port}`;
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port)],{env:{...process.env,DATABASE_URL:'',NAUMI_MULTI_USER:'0',OPENAI_API_KEY:'local-ui-fixture',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',SETTINGS_SECRET:randomUUID(),VIDEO_WORKER_SECRET:randomUUID(),NAUMI_VIDEO_WORKER:'0',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:dist},stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',c=>logs.push(c.toString()));app.stderr.on('data',c=>logs.push(c.toString()));
 let ready=false;for(let i=0;i<160;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
 const user={name:'UI验收',email:'tools-fixture@example.test',plan:'starter',creditsTotal:99999,creditsUsed:0,joinedAt:new Date().toISOString(),renewsAt:new Date().toISOString(),invoices:[],canHigh:true};
 await context.addInitScript(({user})=>{localStorage.setItem('theme','light');localStorage.setItem('naumi:last-email',user.email);localStorage.setItem('naumi:user:'+user.email,JSON.stringify(user));},{user});
 const image=base+'/demos/suite-demo/suppl-src.png';
 const model={id:'gpt-image-2',label:'GPT Image 2',creditHint:'参考标准1K 4 积分/张',modality:'image',supportsEdit:true,qualities:['low','medium','high'],qualitySupported:true,nativeResolutions:['1K','2K'],generationParameters:{ratios:['1:1','3:4','4:3','16:9','9:16'],resolutions:['1K','2K']}};
 const categories=['main','cutout','avatar','upscale','garment','dress3d','style','dewrinkle','dewatermark','print','tryon','retouch','generate'];
 const artworks=categories.map(category=>({id:category+'-history',title:'验收历史图片',image,source:image,category,status:'completed',createdAt:new Date().toISOString(),prompt:'验收记录',gradient:''}));
 artworks.push({id:'suite-history',title:'验收套图',image,category:'suite',batchId:'suite-fixture',status:'completed',createdAt:new Date().toISOString()});
 const features=Object.fromEntries(['image.generate','image.suite','image.aplus','tool.cutout','tool.avatar','tool.upscale','tool.garment','tool.garment3d','tool.style','tool.dewrinkle','tool.dewatermark','tool.extract','tool.printfile','tool.ipcheck','tool.tryon','tool.retouch','tool.recolor','tool.replicate','tool.inpaint','tool.packaging3d','text.titles','video.generate'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{low:{'1K':2,'2K':4},medium:{'1K':4,'2K':8},high:{'1K':8,'2K':16},xhigh:{'1K':16,'2K':32},max:{'1K':32,'2K':64}}}]));
 page=await context.newPage();page.on('console',m=>{if(m.type()==='error')logs.push('BROWSER_CONSOLE '+m.text());});page.on('requestfailed',r=>console.log('REQUEST_FAILED '+r.url()+' '+r.failure()?.errorText));page.on('pageerror',e=>errors.push({url:page.url(),message:e.stack||e.message}));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;requests.push([req.method(),p, url.search]);
  if(round2&&p==='/api/download'){if(round2Fixture.delay)await new Promise(r=>setTimeout(r,round2Fixture.delay));return route.fulfill(round2Fixture.download==='image'?{contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')}:{status:round2Fixture.download==='html'?200:503,contentType:'text/html',body:'download fixture unavailable'});}
  if(p==='/api/download')return route.fulfill(downloadFixture?{contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')}:{status:503,json:{error:'fixture download failed'}});
  if(round2&&p==='/api/video/tasks'&&round2Fixture.video){
   const task={id:'round2-video',prompt:'第二轮视频轮询验收',status:'completed',progress:100,cost:4,model:'fixture-video-1',seconds:'4',videoUrl:'',artworkId:'',error:'',createdAt:new Date().toISOString()};
   return route.fulfill({json:url.searchParams.has('id')?{task}:{tasks:[task]}});
  }
  if(p==='/api/billing/quote'){const body=req.postDataJSON();return route.fulfill({json:{...body,credits:(body.modelId==='gemini-3-pro-image'?8:4)*(body.resolution==='2K'?2:1)*(body.quantity||1),reserveCredits:(body.modelId==='gemini-3-pro-image'?8:4)*(body.resolution==='2K'?2:1)*(body.quantity||1),version:1}});}
  if(round2&&['/api/title-gen','/api/generate-image','/api/packaging3d'].includes(p)){
   if(req.method()!=='GET'){writes++;submissions.push({path:p,body:req.postDataBuffer()?.toString('utf8')||'',headers:req.headers()});if(p==='/api/title-gen')return route.fulfill({json:round2Fixture.malformed?{titles:'invalid',sellingPoints:{}}:{titles:['第二轮验收商品标题'],sellingPoints:['第二轮卖点']}});return route.fulfill({json:round2Fixture.missingJob?{}:{jobId:'round2-job'}});}
   return route.fulfill({json:round2Fixture.malformed?{status:'done',user}:{status:'done',images:[{id:'gen-round2',url:image,prompt:'第二轮',ratio:'1:1',gradient:'',createdAt:new Date().toISOString()}],url:image,user}});
  }
  if(req.method()!=='GET'){
   writes++;submissions.push({path:p,body:req.postDataBuffer()?.toString('utf8')||'',headers:req.headers()});
   await new Promise(r=>setTimeout(r,600));
   if(!success)return route.fulfill({status:503,json:{error:'验收模拟服务失败'}});
   if(['/api/garment3d','/api/packaging3d'].includes(p))return route.fulfill({json:{jobId:'ui-fixture-job'}});
   return route.fulfill({json:{ok:true,url:image,user,creditsUsed:0}});
  }
  if(url.searchParams.has('job'))return route.fulfill({json:{status:'done',url:image,user,creditsUsed:0}});
  if(p==='/api/account'&&historyFailure)return route.fulfill({status:503,json:{error:'验收历史失败'}});
  if(p==='/api/competitors')return route.fulfill({json:{items:[{id:'00000000-0000-4000-8000-000000000001',batchId:'fixture-folder',path:'folder/fixture.png',image,width:600,height:600,prompt:'商品图',regions:[],versions:[],activeVersion:'',revision:1,busy:false,createdAt:new Date().toISOString()}]}});
  if(p==='/api/config')return route.fulfill({json:{db:true,authMode:'mock',multiUser:true,openai:true,defaultImageModel:model.id,imageModels:[model,{...model,id:'gemini-3-pro-image',label:'Nano Banana Pro',creditHint:'参考标准1K 8 积分/张'}],imageQualityCapable:true}});
  if(p==='/api/auth/session')return route.fulfill({json:{user}});
  if(p==='/api/account')return route.fulfill({json:{persisted:true,user,artworks,suiteGroups:[{id:'suite-history',name:'验收套图',images:[{url:image,role:'主图'}],createdAt:new Date().toISOString()}]}});
  if(p==='/api/models'){
   const feature=url.searchParams.get('feature'),text=feature==='text.titles'||feature?.includes('text')||feature==='agent.plan'||feature==='tool.ipcheck';
   const item=text?{...model,id:'gpt-4o',label:'GPT-4o',modality:'text'}:model;
   item.creditHint='参考标准1K 4 积分/张';
   const second=text?{...item,id:'gemini-2.5-flash',label:'Gemini 2.5 Flash',creditHint:'预估 8 积分/次'}:{...item,id:'gemini-3-pro-image',label:'Nano Banana Pro',creditHint:'参考标准1K 8 积分/张'};
   return route.fulfill({json:{managed:managedFixture,supported:true,feature,version:1,models:[item,second],defaultModelId:item.id}});
  }
  if(p==='/api/text-models')return route.fulfill({json:{models:['gpt-4o'],defaultModel:'gpt-4o'}});
  if(p==='/api/billing/catalog')return route.fulfill({json:{version:1,features,products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}}});
  if(p==='/api/video/catalog'){
   if(videoCatalogFailure)return route.fulfill({status:503,json:{error:'catalog fixture failed'}});
   const capability={providerId:'fixture-video',modelId:'fixture-video-1',label:'验收视频模型',modes:['text','image'],durations:[4,8],aspectRatios:['16:9','9:16'],resolutions:['1280x720','720x1280'],maxReferenceImages:1,isDefault:true};
   return route.fulfill({json:videoFixture?{configured:true,models:[capability],providers:[{id:'fixture-video',label:'验收供应商',defaultModel:capability.modelId,protocol:'fixture',models:[capability]}]}:{configured:false,models:[],providers:[]}});
  }
  if(p==='/api/admin/settings')return route.fulfill({json:{}});
  if(p==='/api/version')return route.fulfill({json:{version:'fixture',sourceCommit:'fixture'}});
  return route.fulfill({json:{items:[],tasks:[],sessions:[],templates:[],names:{},nodes:[],settings:{},records:[],projects:[],artworks:[]}});
 });
 // Serve full compiler bytes; local Windows dev streaming previously truncated JS at 256KiB.
 await page.route('**/_next/static/chunks/**',async route=>{const relative=new URL(route.request().url()).pathname.replace('/_next/','');const file=path.resolve(dist,relative);assert.ok(file.startsWith(path.resolve(dist)+path.sep));await route.fulfill({contentType:'application/javascript',body:await readFile(file)});});
 await page.route('**/demos/**',async route=>{const relative=decodeURIComponent(new URL(route.request().url()).pathname);const file=path.resolve('public','.'+relative);assert.ok(file.startsWith(path.resolve('public')+path.sep));try{await route.fulfill({contentType:'image/png',body:await readFile(file)});}catch{await route.abort();}});

 const bad=/参考标准|预估.*积分|价格需核对|积分\/[张项次]/;
 let inspected=0,unwanted=0;
 for(const tool of tools){
  await page.goto(base+tool.href);await expect(page.locator('main h1').first()).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('/api/config')))).toBe(true);
  const combos=page.locator('main').getByRole('combobox').filter({hasText:/GPT Image 2|GPT-4o|Nano Banana Pro|Gemini 2.5 Flash/});
  // Controlled catalog hydration can arrive after the account UI.
  await page.waitForTimeout(250);
  for(const width of [1440,1024,390]){
   await page.setViewportSize({width,height:900});
   const count=await combos.count();
   for(let i=0;i<count;i++){
    const combo=combos.nth(i);await combo.scrollIntoViewIfNeeded();
    const trigger=await combo.innerText();if(bad.test(trigger))unwanted++;
    await combo.click();const list=page.getByRole('listbox');await expect(list).toBeVisible();const content=await list.innerText();if(bad.test(content))unwanted++;
    if(!baseline){assert.doesNotMatch(trigger,bad);assert.doesNotMatch(content,bad);assert.ok(await list.locator('svg').count()>0,'brand icon disappeared');}
    const options=list.getByRole('option');await expect(options).toHaveCount(2);
    if(!baseline){await options.nth(1).click();await expect(combo).toContainText(/Nano Banana Pro|Gemini 2.5 Flash/);await combo.click();await list.getByRole('option').first().click();}
    else await page.keyboard.press('Escape');
    inspected++;
   }
   results.push({tool:tool.slug,width,modelControls:count});
  }
  if(await combos.count())await page.screenshot({path:path.join(output,tool.slug+'-390.png'),fullPage:true});
  console.log('SCAN '+tool.slug+' MODEL_CONTROLS='+(await combos.count()));
 }
 if(baseline){assert.ok(unwanted>0);console.log('BASELINE=REPRODUCED MODEL_PRICE_HINTS=VISIBLE TOOLS='+tools.length+' INSPECTED='+inspected);}
 else{
  await page.setViewportSize({width:1440,height:900});await page.goto(base+'/generate');
  const combo=page.locator('main').getByRole('combobox').filter({hasText:'GPT Image 2'}).first();await expect(combo).toBeVisible();await combo.click();await page.getByRole('option',{name:'Nano Banana Pro',exact:true}).click();
  await expect(page.getByTestId('billing-estimate')).toContainText('8');
  await page.getByRole('tab',{name:'2K',exact:true}).click();await expect(page.getByTestId('billing-estimate')).toContainText('16');
  const quoteRequests=requests.filter(r=>r[1]==='/api/billing/quote');assert.ok(quoteRequests.length>0);
  await page.screenshot({path:path.join(output,'generate-clean-model-current-quote.png'),fullPage:true});
  assert.ok(inspected>=60);assert.equal(writes,0);assert.deepEqual(errors,[]);
  console.log('MODIFIED=PASS TOOLS='+tools.length+' VIEWPORTS=3 MODEL_LABELS=ICON_NAME_ONLY CURRENT_QUOTE=8_TO_16 PROVIDER_CALLS=0');
 }
 await writeFile(path.join(output,'result.json'),JSON.stringify({baseline,tools:tools.length,inspected,unwanted,results,errors,requests,providerCalls:0},null,2));
}catch(error){await page?.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(output,'failure.json'),JSON.stringify({results,errors,requests,body:await page?.locator('body').innerText().catch(()=>null)},null,2));throw error;}
finally{await browser?.close();if(app?.pid){if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'});}catch{}}else app.kill('SIGTERM');}await writeFile('tsconfig.json',originalConfig);await writeFile(path.join(output,'next.log'),logs.join(''));}
