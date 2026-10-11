import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
const out=path.resolve(process.env.COMPETITOR_STYLE_EVIDENCE||'output/competitor-workbench-style'),dist='.next-competitor-style-acceptance';
await mkdir(out+'/browser',{recursive:true});
const original=await readFile('tsconfig.json'),logs=[],errors=[],mutations=[],checks=[];
const originalImage='/__fixture__/original.svg',versionImage='/__fixture__/version.svg';
const region={id:'region-fixture',label:'产品',kind:'product',x:.12,y:.2,width:.3,height:.45,instruction:'保留主体',color:'#6366f1',enabled:true};
const first={id:randomUUID(),batchId:'fixture',path:'参考合集/01-保温杯.png',image:originalImage,width:800,height:600,prompt:'保温杯，居中构图，柔和布光',regions:[region],versions:[{id:'version-fixture',image:versionImage,kind:'edit',parent:'',prompt:'保温杯，暖色背景',regions:[region],createdAt:'2026-10-10T00:00:00Z'}],activeVersion:'',revision:1,busy:false,createdAt:'2026-10-10T00:00:00Z'};
const second={...structuredClone(first),id:randomUUID(),path:'另一组/这是用于检查超长素材名称省略与列表宽度的商品参考图片.png',versions:[],regions:[]};
let fixtures=[],app,browser,page;
try{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const base=`http://127.0.0.1:${port}`;
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port)],{env:{...process.env,DATABASE_URL:'',NAUMI_MULTI_USER:'0',OPENAI_API_KEY:'fixture-local-never-call',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',SETTINGS_SECRET:randomUUID(),VIDEO_WORKER_SECRET:randomUUID(),NAUMI_VIDEO_WORKER:'0',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:dist},stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',b=>logs.push(b.toString()));app.stderr.on('data',b=>logs.push(b.toString()));
 let ready=false;for(let i=0;i<180;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
 const user={name:'竞品样式验收',email:'competitor-style@example.test',plan:'starter',creditsTotal:99999,creditsUsed:0,joinedAt:new Date().toISOString(),renewsAt:new Date().toISOString(),invoices:[],canHigh:true};
 await context.addInitScript(user=>{localStorage.setItem('theme','dark');localStorage.setItem('naumi:last-email',user.email);localStorage.setItem('naumi:user:'+user.email,JSON.stringify(user));},user);
 page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
 const features=Object.fromEntries(['competitor.action','tool.upscale','image.generate','canvas.text-generate'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{low:{'1K':2},medium:{'1K':4},high:{'1K':8}}}]));
 await page.route('**/__fixture__/**',route=>route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${route.request().url().includes('version')?'#efe6da':'#e7efe8'}"/><rect x="280" y="120" width="220" height="360" rx="48" fill="#799e8c"/><rect x="290" y="95" width="200" height="65" rx="25" fill="#d7bd98"/></svg>`}));
 await page.route('**/api/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname;
  if(req.method()!=='GET')mutations.push({path:p,method:req.method(),body:req.postDataJSON()});
  if(p==='/api/billing/quote')return route.fulfill({json:{version:1,credits:4,reserveCredits:4,modelVersion:1,modelId:'fixture-image'}});
  if(p.startsWith('/api/competitors/')&&req.method()==='PATCH'){
   const target=fixtures.find(x=>p.endsWith(x.id));assert.ok(target);Object.assign(target,req.postDataJSON(),{revision:target.revision+1});return route.fulfill({json:{item:target}});
  }
  assert.equal(req.method(),'GET','Unexpected mutation '+p);
  if(p==='/api/competitors')return route.fulfill({json:{items:fixtures}});
  if(p==='/api/auth/session')return route.fulfill({json:{user}});
  if(p==='/api/config')return route.fulfill({json:{db:true,authMode:'mock',multiUser:false,imageQualityCapable:true,creditsMetered:true,commerceVisible:false,imageModels:[{id:'fixture-image',label:'Fixture Image',supportsEdit:true,qualities:['medium','high'],nativeResolutions:['1K']}],defaultImageModel:'fixture-image'}});
  if(p==='/api/models')return route.fulfill({json:{managed:false,supported:true,models:[],defaultModelId:'fixture-image'}});
  if(p==='/api/text-models')return route.fulfill({json:{models:['fixture-text'],defaultModel:'fixture-text'}});
  if(p==='/api/account')return route.fulfill({json:{user,artworks:[]}});
  if(p==='/api/billing/catalog')return route.fulfill({json:{version:1,features,products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}}});
  return route.fulfill({json:{items:[],artworks:[],tasks:[],names:{},nodes:[],settings:{}}});
 });
 // Resolve chunks straight from this isolated dist to avoid unrelated dev-server reload races.
 await page.route('**/_next/static/chunks/**',async route=>{const file=path.resolve(dist,new URL(route.request().url()).pathname.replace('/_next/',''));assert.ok(file.startsWith(path.resolve(dist)+path.sep));await route.fulfill({contentType:'application/javascript',body:await readFile(file)});});
 await page.goto(base+'/competitors',{timeout:120000});await expect(page.getByRole('heading',{name:'导入参考图片',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'添加图片',exact:true})).toBeEnabled();
 await page.screenshot({path:out+'/browser/empty-desktop.png',fullPage:true});
 await expect(page.getByRole('button',{name:'框选元素',exact:true})).toBeDisabled();
 fixtures=[structuredClone(first),structuredClone(second)];await page.getByRole('button',{name:'刷新素材',exact:true}).click();await expect(page.getByAltText('竞品编辑图')).toBeVisible();
 for(const width of [1440,1280,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const visual=await page.locator('.cmp-layout').evaluate(el=>({cards:[...el.children].map(x=>{const b=x.getBoundingClientRect(),s=getComputedStyle(x);return{left:b.left,right:b.right,top:b.top,bottom:b.bottom,radius:s.borderRadius,bg:s.backgroundColor,border:s.borderColor};}),gap:getComputedStyle(el).gap,selectedBackground:getComputedStyle(el.querySelector('.cmp-file.active')).backgroundColor}));
  const channels=visual.selectedBackground.match(/[\d.]+/g).map(Number);const rgb=visual.selectedBackground.startsWith('color(srgb')?channels.map(c=>c*255):channels;assert.ok(rgb.slice(0,3).every(c=>c>200),'Light selected surface must remain legible under stored dark theme');
  assert.equal(visual.gap,'20px');for(const c of visual.cards){assert.equal(c.radius,'16px');assert.equal(c.bg,'rgb(255, 255, 255)');assert.ok(c.left>=0&&c.right<=width+1);}
  for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){const a=visual.cards[i],b=visual.cards[j];assert.ok(a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1,'Cards overlap');}
  const folderBox=await page.getByRole('combobox',{name:'文件夹筛选'}).boundingBox();assert.equal(Math.round(folderBox.height),42);
  const qualityBox=await page.getByTestId('image-quality-select').boundingBox();assert.equal(Math.round(qualityBox.height),42);
  await page.getByRole('combobox',{name:'文件夹筛选'}).click();await expect(page.getByRole('listbox',{name:'文件夹筛选'})).toBeVisible();
  const popup=await page.getByRole('listbox',{name:'文件夹筛选'}).evaluate(x=>({bg:getComputedStyle(x).backgroundColor,left:x.getBoundingClientRect().left,right:x.getBoundingClientRect().right}));assert.equal(popup.bg,'rgb(255, 255, 255)');assert.ok(popup.left>=0&&popup.right<=width+1);await page.keyboard.press('Escape');
  checks.push({width,visual,folderHeight:folderBox.height,qualityHeight:qualityBox.height});
  if([1440,390,320].includes(width))await page.screenshot({path:out+'/browser/populated-'+width+'.png',fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1000});
 const filter=page.getByRole('combobox',{name:'文件夹筛选'});await filter.focus();await page.keyboard.press('Enter');await page.keyboard.press('End');await page.keyboard.press('Enter');await expect(page.locator('.cmp-file')).toHaveCount(1);await filter.focus();await page.keyboard.press('Enter');await page.keyboard.press('Home');await page.keyboard.press('Enter');await expect(page.locator('.cmp-file')).toHaveCount(2);
 await page.getByRole('button',{name:'全选素材',exact:true}).click();await expect(page.getByRole('button',{name:'取消全选',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'批量反推 (2)',exact:true})).toBeEnabled();await page.getByRole('button',{name:'取消全选',exact:true}).click();
 const version=page.getByRole('button',{name:'V1 · 局部修改',exact:true});await version.click();await expect(version).toHaveAttribute('aria-pressed','true');await expect(page.getByAltText('竞品编辑图')).toHaveAttribute('src',versionImage);
 await page.getByRole('button',{name:'原图',exact:true}).click();await expect(page.getByAltText('竞品编辑图')).toHaveAttribute('src',originalImage);
 // Original-version selection clears regions by design; discard that draft before region tests.
 await page.getByRole('button',{name:'撤销未保存',exact:true}).click();
 const surface=page.getByTestId('region-surface');await surface.scrollIntoViewIfNeeded();const before=await surface.boundingBox();await page.getByRole('button',{name:'放大',exact:true}).click();await expect.poll(async()=>Math.round((await surface.boundingBox()).width/before.width*100)).toBe(125);await page.getByRole('button',{name:'125%',exact:true}).click();
 await page.getByRole('button',{name:'选区 1 产品',exact:true}).click();await page.getByLabel('元素名称',{exact:true}).fill('杯身');await page.getByLabel('选区修改要求',{exact:true}).fill('改为米白色');
 const geo=await page.locator('.cmp-region').first().evaluate(el=>{const r=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return{x:(r.left-b.left)/b.width,y:(r.top-b.top)/b.height,width:r.width/b.width,height:r.height/b.height,radius:getComputedStyle(el).borderRadius};});for(const k of ['x','y','width','height'])assert.ok(Math.abs(geo[k]-region[k])<.01);assert.equal(geo.radius,'0px');
 await page.getByRole('checkbox',{name:'查看原图',exact:true}).check();await expect(page.locator('.cmp-region')).toHaveCount(0);await expect(page.getByRole('button',{name:'框选元素',exact:true})).toBeDisabled();await page.getByRole('checkbox',{name:'查看原图',exact:true}).uncheck();
 await page.getByRole('button',{name:'框选元素',exact:true}).click();await surface.scrollIntoViewIfNeeded();const b=await surface.boundingBox();await page.mouse.move(b.x+b.width*.65,b.y+b.height*.15);await page.mouse.down();await page.mouse.move(b.x+b.width*.85,b.y+b.height*.45,{steps:8});await page.mouse.up();await expect(page.locator('.cmp-region')).toHaveCount(2);await expect(page.getByLabel('元素名称',{exact:true})).toHaveValue('选区 2');
 await page.getByRole('button',{name:'保存修改',exact:true}).click();await expect(page.getByText('提示词与选区已保存',{exact:true})).toBeVisible();const patch=mutations.find(x=>x.method==='PATCH');assert.ok(patch);assert.equal(patch.body.regions.length,2);assert.equal(patch.body.regions[0].label,'杯身');assert.equal(patch.body.regions[0].instruction,'改为米白色');assert.ok(Math.abs(patch.body.regions[1].width-.2)<.02);
 await page.screenshot({path:out+'/browser/regions-desktop.png',fullPage:true});
 // Compare actual computed card tokens against a regular tool, not merely CSS strings.
 await page.goto(base+'/upscale',{timeout:120000});const standard=await page.locator('[data-tool-workspace] .tool-layout-grid > :nth-child(2)').evaluate(el=>{const s=getComputedStyle(el);return{bg:s.backgroundColor,radius:s.borderRadius,border:s.borderColor};});assert.equal(standard.bg,checks[0].visual.cards[1].bg);assert.equal(standard.radius,checks[0].visual.cards[1].radius);assert.equal(standard.border,checks[0].visual.cards[1].border);
 assert.deepEqual(errors,[]);assert.ok(mutations.every(x=>x.path==='/api/billing/quote'||x.method==='PATCH'));
 await writeFile(out+'/browser/result.json',JSON.stringify({checks,geometry:geo,standard,errors,mutations,providerCalls:0},null,2));
 console.log('BROWSER=PASS VIEWPORTS=6 SHARED_STYLE=MATCH LIGHT=YES OVERFLOW=0 POPOVERS=42PX FILTER=KEYBOARD SELECT_ALL=PASS VERSIONS=PASS ZOOM=PASS REGIONS=PASS SAVE=PASS CLIENT_ERRORS=0 PROVIDER_CALLS=0');
}catch(e){await page?.screenshot({path:out+'/browser/failure.png',fullPage:true}).catch(()=>{});await writeFile(out+'/browser/failure.json',JSON.stringify({url:page?.url(),checks,errors},null,2));throw e;}
finally{await browser?.close();if(app?.pid){try{if(process.platform==='win32')execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'});else process.kill(app.pid,'SIGTERM');}catch{}}await writeFile('tsconfig.json',original);await writeFile(out+'/browser/next.log',logs.join(''));}
