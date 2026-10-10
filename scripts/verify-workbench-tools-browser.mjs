import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {chromium,expect as baseExpect} from '@playwright/test';

const baseline=process.argv.includes('--baseline');
const managedFixture=process.argv.includes('--managed-fixture');
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
const output=path.resolve(process.env.TOOLS_EVIDENCE_DIR||'output/workbench-tools-ui/browser');
await mkdir(output,{recursive:true});
const originalConfig=await readFile('tsconfig.json');
const tools=JSON.parse(execFileSync(process.execPath,['node_modules/tsx/dist/cli.mjs','-e','import {TOOLS} from "./src/lib/tool-meta";console.log(JSON.stringify(TOOLS.map(({slug,href,key})=>({slug,href,key}))))'],{encoding:'utf8'}));
const expect=baseExpect.configure({timeout:45000}),results=[],errors=[],logs=[],requests=[];
let app,browser,page,writes=0,success=false,historyFailure=false,videoFixture=false,videoCatalogFailure=false,downloadFixture=false;
const interactions=[],submissions=[];
const dist='.next-workbench-acceptance';
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
 const model={id:'gpt-image-2',label:'GPT Image 2',modality:'image',supportsEdit:true,qualities:['low','medium','high'],qualitySupported:true,nativeResolutions:['1K','2K'],generationParameters:{ratios:['1:1','3:4','4:3','16:9','9:16'],resolutions:['1K','2K']}};
 const categories=['main','cutout','avatar','upscale','garment','dress3d','style','dewrinkle','dewatermark','print','tryon','retouch','generate'];
 const artworks=categories.map(category=>({id:category+'-history',title:'验收历史图片',image,source:image,category,status:'completed',createdAt:new Date().toISOString(),prompt:'验收记录',gradient:''}));
 artworks.push({id:'suite-history',title:'验收套图',image,category:'suite',batchId:'suite-fixture',status:'completed',createdAt:new Date().toISOString()});
 const features=Object.fromEntries(['image.generate','image.suite','image.aplus','tool.cutout','tool.avatar','tool.upscale','tool.garment','tool.garment3d','tool.style','tool.dewrinkle','tool.dewatermark','tool.extract','tool.printfile','tool.ipcheck','tool.tryon','tool.retouch','tool.recolor','tool.replicate','tool.inpaint','tool.packaging3d','text.titles','video.generate'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{low:{'1K':2,'2K':4},medium:{'1K':4,'2K':8},high:{'1K':8,'2K':16},xhigh:{'1K':16,'2K':32},max:{'1K':32,'2K':64}}}]));
 page=await context.newPage();page.on('pageerror',e=>errors.push({url:page.url(),message:e.stack||e.message}));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;requests.push([req.method(),p]);
  if(p==='/api/download')return route.fulfill(downloadFixture?{contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')}:{status:503,json:{error:'fixture download failed'}});
  if(p==='/api/billing/quote'){const body=req.postDataJSON();return route.fulfill({json:{...body,credits:4*(body.quantity||1),reserveCredits:4*(body.quantity||1),version:1}});}
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
  if(p==='/api/config')return route.fulfill({json:{db:true,authMode:'mock',multiUser:true,openai:true,defaultImageModel:model.id,imageModels:[model],imageQualityCapable:true}});
  if(p==='/api/auth/session')return route.fulfill({json:{user}});
  if(p==='/api/account')return route.fulfill({json:{persisted:true,user,artworks,suiteGroups:[{id:'suite-history',name:'验收套图',images:[{url:image,role:'主图'}],createdAt:new Date().toISOString()}]}});
  if(p==='/api/models'){
   const feature=url.searchParams.get('feature'),text=feature==='text.titles'||feature?.includes('text')||feature==='agent.plan'||feature==='tool.ipcheck';
   const item=text?{...model,id:'gpt-4o',label:'GPT-4o',modality:'text'}:model;
   return route.fulfill({json:{managed:managedFixture,supported:true,feature,version:1,models:[item],defaultModelId:item.id}});
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
 for(const tool of [...tools,{slug:'tools',href:'/tools',key:'工具中心'}].filter(t=>!only||only.includes(t.slug))){
  await page.setViewportSize({width:1440,height:900});
  await page.goto(base+tool.href);await expect(page.locator('main h1').first()).toBeVisible();
  // Wait for actual auth hydration and initial query state, not only SSR markup.
  await expect(page.getByRole('button',{name:'UI',exact:true}).or(page.getByRole('button',{name:'U',exact:true})).first()).toBeVisible().catch(()=>{});
  for(const width of [1440,1024,390]){
   await page.setViewportSize({width,height:width===390?844:900});
   if(!baseline)await page.evaluate(()=>document.documentElement.classList.add('dark'));
   const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,overflows:[...document.querySelectorAll('main input:not([type=file]),main textarea,main select,main section,main aside')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1);}).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width}))}));
   if(!baseline){
    await expect(page.locator('main')).toHaveClass(/tool-page/);
    await expect(page.locator('main').locator('..').locator('..')).toHaveClass(/tool-page/);
    assert.equal(await page.locator('footer').evaluate(el=>getComputedStyle(el).getPropertyValue('--c-card').trim()),'#fff');
    assert.equal(await page.locator('main').evaluate(el=>getComputedStyle(el).getPropertyValue('--c-card').trim()),'#fff');
    if(await page.locator('.tool-history').count())await expect(page.locator('.tool-history').first()).toBeVisible();
   }
   results.push({tool:tool.slug,width,...geometry});
   await page.screenshot({path:path.join(output,tool.slug+'-'+width+'.png'),fullPage:true});
   console.log(`SCAN tool=${tool.slug} width=${width} overflow=${geometry.overflow} clipped=${geometry.overflows.length}`);
  }
  if(!baseline&&tool.slug!=='tools'){
   await page.setViewportSize({width:1440,height:900});
   const fileInput=page.locator('main input[type=file]').first();
   console.log('INTERACT tool='+tool.slug);
   if(tool.slug!=='competitors'&&await fileInput.count()){
    await fileInput.setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')});
    assert.equal(await fileInput.evaluate(el=>el.files.length),0,tool.slug+' invalid upload');
    await fileInput.setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:await readFile('public/demos/suite-demo/suppl-src.png')});
    interactions.push({tool:tool.slug,test:'invalid rejected and valid picker accepted'});
   }
   if(await page.locator('[data-tool-workspace="tool-workspace"]').count()){
    const choices=page.locator('fieldset button[aria-pressed]');const chipIndex=await choices.evaluateAll(els=>els.findIndex(el=>el.getAttribute('aria-pressed')==='false'));
    if(chipIndex>=0){const chip=choices.nth(chipIndex);await chip.click();await expect(chip).toHaveAttribute('aria-pressed','true');}
    if(tool.slug==='avatar')await page.getByRole('button',{name:'黑',exact:true}).click();
    if(tool.slug==='garment')await page.getByRole('button',{name:'精细',exact:true}).click();
    if(tool.slug==='dewrinkle')await page.getByRole('button',{name:'强',exact:true}).click();
    if(tool.slug==='garment3d')await page.getByRole('button',{name:'背面',exact:true}).click();
    const cta=page.locator('.tool-layout-grid > div').first().locator('button[class*="shadow-btn"]').last();
    await expect(cta).toBeEnabled();const before=writes;
    await cta.click();await expect(cta).toBeDisabled();
    await expect(page.locator('fieldset')).toHaveAttribute('disabled','');
    await expect(page.getByRole('alert').filter({hasText:'验收模拟服务失败'})).toBeVisible();
    await expect(cta).toBeEnabled();assert.equal(writes-before,1);
    const last=submissions.at(-1);
    if(tool.slug==='avatar')assert.match(last.body,/name="bg"\r\n\r\nblack/);
    if(tool.slug==='garment')assert.match(last.body,/Preserve fine fabric texture/);
    if(tool.slug==='dewrinkle')assert.match(last.body,/Thoroughly remove deep garment wrinkles/);
    if(tool.slug==='garment3d')assert.match(last.body,/show the garment from the back/);
    if(tool.slug==='printextract')assert.equal(last.headers['x-naumi-feature-model'],model.id);
    success=true;await cta.click();await expect(cta).toBeEnabled();await expect(page.getByAltText('效果',{exact:true})).toBeVisible();success=false;
    const history=page.getByRole('button',{name:'查看历史图片',exact:true}).first();
    if(await history.count()){await history.focus();await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'记录详情'})).toBeVisible();const regen=page.getByRole('button',{name:/以此图/}).last();if(await regen.count()){const before=writes;await regen.click();await expect(page.getByRole('alert').filter({hasText:'载入失败'})).toBeVisible();downloadFixture=true;await regen.click();await expect(page.getByRole('button',{name:'← 返回当前',exact:true})).toHaveCount(0);assert.equal(writes,before);downloadFixture=false;interactions.push({tool:tool.slug,test:'regeneration source error recovery without submit'});}else await page.getByRole('button',{name:'← 返回当前',exact:true}).click();const checkbox=page.getByRole('checkbox',{name:'选择历史图片'}).first();await checkbox.focus();await page.keyboard.press('Space');await expect(checkbox).toHaveAttribute('aria-checked','true');}
    await page.getByRole('button',{name:'移除图片',exact:true}).click();await expect(cta).toBeDisabled();
    interactions.push({tool:tool.slug,test:'chips/busy/single-submit/error/retry/success/history keyboard/remove'});
   }
   if(!await page.locator('[data-tool-workspace="tool-workspace"]').count()&&!['agent','competitors','video'].includes(tool.slug)){
    if(tool.slug==='fuse')await fileInput.setInputFiles([{name:'first.png',mimeType:'image/png',buffer:await readFile('public/demos/suite-demo/suppl-src.png')},{name:'second.png',mimeType:'image/png',buffer:await readFile('public/demos/suite-demo/suppl-src.png')}]);
    if(tool.slug==='replicate')await page.locator('main input[type=file]').nth(1).setInputFiles({name:'reference.png',mimeType:'image/png',buffer:await readFile('public/demos/suite-demo/suppl-src.png')});
    if(tool.slug==='generate')await page.locator('main textarea').first().fill('商品棚拍UI验收');
    if(tool.slug==='inpaint'){
     await page.locator('main textarea').first().fill('把选区改为蓝色');const mask=page.locator('main canvas');await expect(mask).toBeVisible();await mask.scrollIntoViewIfNeeded();const box=await mask.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+10,box.y+box.height/2);await page.mouse.up();
    }
    const grid=page.locator('.tool-layout-grid').first();
    const cta=grid.locator(':scope > :first-child button[class*="shadow-btn"], :scope > :first-child button.h-12').last();
    if(await cta.count()){
     await expect(cta).toBeEnabled();const before=writes;await cta.click();await expect(cta).toBeDisabled();await expect(page.getByText('验收模拟服务失败',{exact:true}).first()).toBeVisible();
     if(tool.slug==='printfile'){await page.getByRole('button',{name:'重试',exact:true}).first().click();}
     else await expect(cta).toBeEnabled();
     assert.ok(writes>before);interactions.push({tool:tool.slug,test:'submission fixture failure and busy recovery'});
    }
   }
   const select=page.getByTestId('select-menu').first();
   if(await select.count()&&await select.isEnabled()){
    await select.scrollIntoViewIfNeeded();await select.focus();await page.keyboard.press('ArrowDown');await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('End');await page.keyboard.press('Home');await page.keyboard.press('Enter');await expect(page.getByRole('listbox')).toHaveCount(0);
    await select.click();const box=await page.getByRole('listbox').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=1440&&box.y>=0&&box.y+box.height<=900);
    await page.getByRole('option').filter({hasNot:page.locator('[aria-disabled=true]')}).first().click();await expect(page.getByRole('listbox')).toHaveCount(0);
    await select.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape');await expect(page.getByRole('listbox')).toHaveCount(0);
    interactions.push({tool:tool.slug,test:'dropdown keyboard/mouse/viewport/Escape'});
   }
   const quality=page.getByTestId('image-quality-select').first();
   if(await quality.count()&&await quality.isEnabled()){
    await quality.scrollIntoViewIfNeeded();await quality.press('ArrowDown');await expect(page.getByTestId('image-quality-menu')).toBeVisible();
    await quality.press('End');await quality.press('Enter');await expect(page.getByRole('listbox')).toHaveCount(0);
    await quality.click();await page.keyboard.press('Tab');await expect(page.getByRole('listbox')).toHaveCount(0);interactions.push({tool:tool.slug,test:'quality keyboard and Tab close'});
   }
   if(tool.slug==='ipcheck')await expect(page.getByRole('combobox',{name:'执行模型'})).toHaveCount(0);
   if(tool.slug==='video'){
    const videoCta=page.locator('main fieldset button.shadow-btn');
    await expect(page.getByText('视频服务未配置',{exact:false})).toBeVisible();await expect(videoCta).toBeDisabled();
    videoCatalogFailure=true;await page.reload();await expect(page.getByRole('alert').filter({hasText:'视频模型加载失败'})).toBeVisible();
    videoCatalogFailure=false;videoFixture=true;await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.getByText('验收视频模型',{exact:true})).toBeVisible();
    await page.locator('main textarea').first().fill('验收视频参数');await expect(videoCta).toBeEnabled();const before=writes;await videoCta.click();await expect(page.locator('main fieldset')).toHaveAttribute('disabled','');await expect(page.getByText('验收模拟服务失败',{exact:true})).toBeVisible();await expect(videoCta).toBeEnabled();assert.equal(writes-before,1);
    assert.equal(JSON.parse(submissions.at(-1).body).modelId,'fixture-video-1');videoFixture=false;interactions.push({tool:tool.slug,test:'unconfigured disabled/catalog failure retry/configured fixture submit busy recovery'});
   }
   if(tool.slug==='competitors'){
    await page.getByRole('button',{name:'框选元素',exact:true}).click();const surface=page.getByTestId('region-surface');await surface.scrollIntoViewIfNeeded();const r=await surface.boundingBox();await page.mouse.move(r.x+r.width*.2,r.y+r.height*.2);await page.mouse.down();await page.mouse.move(r.x+r.width*.6,r.y+r.height*.6,{steps:5});await page.mouse.up();await expect(page.getByRole('textbox',{name:'元素名称'})).toHaveValue('选区 1');await page.getByRole('button',{name:'移除选区',exact:true}).click();await expect(page.getByRole('textbox',{name:'元素名称'})).toHaveCount(0);interactions.push({tool:tool.slug,test:'region draw and remove'});
   }
   if(tool.slug==='agent'){
    await page.getByRole('button',{name:'移除参考图',exact:true}).first().click();
    await page.locator('main textarea').first().fill('测试工作台UI');await page.getByRole('button',{name:/发送/}).last().click();await expect(page.getByText('验收模拟服务失败',{exact:true}).first()).toBeVisible();await expect(page.getByRole('button',{name:'发送',exact:true})).toBeVisible();interactions.push({tool:tool.slug,test:'upload/agent fixture failure recovery'});
   }
   if(tool.slug==='recolor'){
    const hex=page.getByRole('textbox',{name:'HEX颜色'});await hex.fill('12');await expect(hex).toHaveValue('12');await hex.fill('123ABC');await hex.blur();await expect(hex).toHaveValue('123ABC');interactions.push({tool:tool.slug,test:'HEX partial and complete edit'});
   }
   if(tool.slug==='suite'){
    await page.getByRole('button',{name:/自定义配置/}).click();await expect(page.getByTestId('custom-shot-1')).toBeVisible();const n=await page.locator('[data-testid^=custom-shot-]').count();await page.getByRole('button',{name:'删除',exact:true}).first().click();assert.equal(await page.locator('[data-testid^=custom-shot-]').count(),n-1);interactions.push({tool:tool.slug,test:'custom shots delete'});
   }
  }
 }
 if(!baseline){
  historyFailure=true;await page.goto(base+'/avatar');await expect(page.getByRole('alert').filter({hasText:'记录加载失败'})).toBeVisible();historyFailure=false;await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.getByRole('button',{name:'查看历史图片'})).toBeVisible();interactions.push({tool:'avatar',test:'failed history retry'});
 }
 await writeFile(path.join(output,'result.json'),JSON.stringify({baseline,managedFixture,tools:tools.length,results,errors,writes,requests,interactions,submissions},null,2));
 if(!baseline){assert.deepEqual(errors,[]);assert.ok(results.every(r=>r.overflow<=1),JSON.stringify(results.filter(r=>r.overflow>1)));}
 console.log(`${baseline?'BASELINE':'MODIFIED'}_BROWSER=${errors.length?'ERRORS':'PASS'} TOOLS=${new Set(results.filter(r=>r.tool!=='tools').map(r=>r.tool)).size} VIEWPORTS=3 OVERFLOW_CASES=${results.filter(r=>r.overflow>1).length} CLIENT_ERRORS=${errors.length} FIXTURE_POSTS=${writes} INTERACTIONS=${interactions.length} REAL_UPSTREAM=0${managedFixture?' MODEL_MODE=MANAGED':''}`);
}catch(error){await page?.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(output,'failure.json'),JSON.stringify({results,errors,requests,interactions,submissions},null,2));throw error;}
finally{await browser?.close();if(app?.pid){if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'});}catch{}}else app.kill('SIGTERM');}await writeFile('tsconfig.json',originalConfig);await writeFile(path.join(output,'next.log'),logs.join(''));}
