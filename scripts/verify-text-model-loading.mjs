import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {chromium,expect as baseExpect} from '@playwright/test';
const expect=baseExpect.configure({timeout:45000});

// Test only the changed loading/name contract, with all application API writes
// intercepted. A production URL may be supplied for fixed-build UI acceptance.
const out=path.resolve(process.env.TEXT_MODEL_EVIDENCE_DIR||'output/text-model-loading');
await mkdir(out,{recursive:true});
let app,browser,page;const logs=[],results=[];
const textModel={id:'gpt6Astra',label:'GPT-6 Astra',modality:'text',supportsEdit:false};
const imageModel={id:'gpt-image-2',label:'GPT-Image-2.5',modality:'image',supportsEdit:true,qualities:['medium'],nativeResolutions:['1K']};
const features=Object.fromEntries(['image.generate','canvas.image','canvas.expand','canvas.text-edit','canvas.annotate','canvas.text-generate','canvas.assistant','canvas.ocr'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{medium:{'1K':0}}}]));
const user={name:'名称加载验收',email:'model-loading@example.test',plan:'starter',creditsTotal:100,creditsUsed:0,joinedAt:new Date().toISOString(),renewsAt:new Date().toISOString(),invoices:[],canHigh:true};
try{
 let base=process.env.TEXT_MODEL_BASE_URL;
 if(!base){
  const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));base=`http://127.0.0.1:${port}`;
  app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port)],{env:{...process.env,DATABASE_URL:'',NAUMI_MULTI_USER:'0',OPENAI_API_KEY:'local-model-name-fixture',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',SETTINGS_SECRET:randomUUID(),VIDEO_WORKER_SECRET:randomUUID(),NAUMI_VIDEO_WORKER:'0',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:'.next-text-model-loading'},stdio:['ignore','pipe','pipe']});
  app.stdout.on('data',c=>logs.push(c.toString()));app.stderr.on('data',c=>logs.push(c.toString()));
  let ready=false;for(let i=0;i<120;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'local fixture ready');
 }
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
 for(const scenario of ['cold','saved-id','failure-retry','unmanaged'].filter(s=>!only||only.includes(s))){
  const context=await browser.newContext({viewport:{width:scenario==='saved-id'?390:1440,height:1000}});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
  await context.addInitScript(({user,saved})=>{localStorage.setItem('naumi:last-email',user.email);localStorage.setItem('naumi:user:'+user.email,JSON.stringify(user));localStorage.setItem('nv:canvas:last','tree:loading-root');if(saved)localStorage.setItem('naumi:text-model','gpt6Astra');},{user,saved:scenario==='saved-id'});
  page=await context.newPage();page.setDefaultTimeout(45000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let release;const gate=new Promise(r=>release=r);let fail=scenario==='failure-retry';const calls=[];
  const artwork={id:'loading-root',title:'名称加载验收',category:'main',createdAt:new Date().toISOString(),status:'completed',image:base+'/demos/suite-demo/suppl-src.png',origin:'canvas',source:'canvas-add',groupId:'loading-root',width:1024,height:1024,canvasWidth:320,canvasHeight:320,canvasX:120,canvasY:120,ratio:'1:1',resolution:'1K'};
  await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),p=url.pathname;calls.push({method:req.method(),path:p,feature:url.searchParams.get('feature')});
   if(p==='/api/models'){
    await gate;if(fail)return route.fulfill({status:503,json:{error:'fixture catalog unavailable'}});
    const feature=url.searchParams.get('feature'),item=['canvas.assistant','canvas.text-generate','canvas.ocr'].includes(feature)?textModel:imageModel;
    return route.fulfill({json:scenario==='unmanaged'?{managed:false,feature,models:[]}:{managed:true,supported:true,feature,version:109,defaultModelId:item.id,models:[item]}});
   }
   if(p==='/api/config')return route.fulfill({json:{db:true,authMode:'mock',multiUser:true,modelVersion:109,openai:true,defaultImageModel:imageModel.id,imageModels:[imageModel],imageQualityCapable:true}});
   if(p==='/api/auth/session')return route.fulfill({json:{user}});
   if(p==='/api/account')return route.fulfill({json:{persisted:true,user,artworks:[artwork]}});
   if(p==='/api/projects')return route.fulfill({json:{names:{'tree:loading-root':'名称加载验收'}}});
   if(p==='/api/text-models')return route.fulfill({json:{defaultModel:textModel.id,models:[textModel.id]}});
   if(p==='/api/billing/catalog')return route.fulfill({json:{version:8,features,products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}}});
   if(p==='/api/version')return route.fulfill({json:{version:'loading-fixture'}});
   return route.fulfill({json:{ok:true,items:[],tasks:[],sessions:[],workflows:[],names:{},nodes:[],settings:{},records:[],artworks:[],persisted:true}});
  });
  await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});
  const toggle=page.getByTestId('canvas-agent-toggle');await expect(toggle).toBeVisible();if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
  const control=page.getByTestId('canvas-assistant-model');await expect(control).toHaveText('模型加载中');
  assert.equal(await control.getByRole('combobox').count(),0);assert.ok(!(await control.innerText()).includes(textModel.id));
  await page.screenshot({path:path.join(out,scenario+'-loading.png')});release();
  if(scenario==='failure-retry'){
   await expect(control.getByRole('alert')).toHaveText('模型加载失败');assert.ok(!(await control.innerText()).includes(textModel.id));
   await page.screenshot({path:path.join(out,scenario+'-failed.png')});
   const before=calls.filter(c=>c.path==='/api/models').length;fail=false;await control.getByRole('button',{name:'重新加载文字模型'}).click();
   await expect(control.getByRole('combobox',{name:'文字模型'})).toHaveText(textModel.label);
   const retries=calls.filter(c=>c.path==='/api/models').slice(before);assert.ok(retries.length>0);assert.ok(retries.every(c=>c.feature==='canvas.assistant'),'retry only this feature');
  }else if(scenario==='unmanaged'){
   const select=control.getByRole('combobox',{name:'文字模型'});await expect(select).toHaveText(textModel.id);await select.click();await expect(page.getByRole('option',{name:'自定义模型 ID'})).toBeVisible();await page.keyboard.press('Escape');
  }else{
   const select=control.getByRole('combobox',{name:'文字模型'});await expect(select).toHaveText(textModel.label);await expect(control.locator('[title]').first()).toHaveAttribute('title',textModel.label);
   await select.click();await expect(page.getByRole('option',{name:textModel.label,exact:true})).toBeVisible();assert.equal(await page.getByRole('option',{name:'自定义模型 ID'}).count(),0);await page.keyboard.press('Escape');
   await page.getByTestId('canvas-assistant-panel').getByRole('button',{name:'收起助手',exact:true}).click();await toggle.click();await expect(page.getByTestId('canvas-assistant-model')).toHaveText(textModel.label);
   if(scenario==='cold'){
    await page.waitForTimeout(100);fail=true;await page.evaluate(()=>window.dispatchEvent(new Event('naumi:model-catalog-refresh')));
    await expect(control.getByRole('alert')).toHaveText('模型加载失败');assert.ok(!(await control.innerText()).includes(textModel.id));
    fail=false;await control.getByRole('button',{name:'重新加载文字模型'}).click();await expect(control.getByRole('combobox',{name:'文字模型'})).toHaveText(textModel.label);
   }
  }
  await page.screenshot({path:path.join(out,scenario+'-ready.png')});assert.deepEqual(errors,[]);
  results.push({scenario,result:'PASS',model:textModel.label,errors,catalogReads:calls.filter(c=>c.path==='/api/models').length});await context.close();
 }
 await writeFile(path.join(out,'result.json'),JSON.stringify({results,realSupplierCalls:0,realDatabaseWrites:0},null,2));console.log(JSON.stringify(results));
}catch(e){await writeFile(path.join(out,'failure.json'),JSON.stringify({error:e.stack,results,url:page?.url(),body:await page?.locator('body').innerText().catch(()=>null)},null,2));throw e;}
finally{await browser?.close();if(app)app.kill();await writeFile(path.join(out,'server.log'),logs.join(''));}
