import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
const out=path.resolve(process.env.WORKBENCH_DEMO_EVIDENCE||'output/workbench-demo-refresh'),dist='.next-demo-refresh-acceptance';
await mkdir(out+'/browser',{recursive:true});
const original=await readFile('tsconfig.json'),logs=[],errors=[],bad=[],checks=[],writes=[];
const routes=['generate','suite','packaging3d','replicate','variations','retouch','cutout','avatar','recolor','upscale','inpaint','style','fuse','dewatermark','tryon','garment','garment3d','dewrinkle','titles','extract','ipcheck','printfile'];
const features=Object.fromEntries(['image.generate','image.suite','image.aplus','tool.cutout','tool.avatar','tool.upscale','tool.garment','tool.garment3d','tool.style','tool.dewrinkle','tool.dewatermark','tool.extract','tool.printfile','tool.ipcheck','tool.tryon','tool.retouch','tool.recolor','tool.replicate','tool.inpaint','tool.packaging3d','text.titles','video.generate'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{low:{'1K':2,'2K':4},medium:{'1K':4,'2K':8},high:{'1K':8,'2K':16}}}]));
let app,browser,page;
try{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const base=`http://127.0.0.1:${port}`;
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port)],{env:{...process.env,DATABASE_URL:'',NAUMI_MULTI_USER:'0',OPENAI_API_KEY:'demo-ui-fixture',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',SETTINGS_SECRET:randomUUID(),VIDEO_WORKER_SECRET:randomUUID(),NAUMI_VIDEO_WORKER:'0',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:dist},stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',b=>logs.push(b.toString()));app.stderr.on('data',b=>logs.push(b.toString()));
 let ready=false;for(let i=0;i<160;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
 const user={name:'样例验收',email:'demo-fixture@example.test',plan:'starter',creditsTotal:99999,creditsUsed:0,joinedAt:new Date().toISOString(),renewsAt:new Date().toISOString(),invoices:[],canHigh:true};
 await context.addInitScript(user=>{localStorage.setItem('theme','light');localStorage.setItem('naumi:last-email',user.email);localStorage.setItem('naumi:user:'+user.email,JSON.stringify(user));},user);
 page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push({url:page.url(),message:e.message}));page.on('response',r=>{if(r.url().includes('/demos/')&&r.status()>=400)bad.push(r.url());});
 await page.route('**/api/**',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname;
  if(req.method()!=='GET')writes.push(p);
  if(p==='/api/billing/quote')return route.fulfill({json:{version:1,credits:4,reserveCredits:4,modelVersion:1,modelId:'fixture-image'}});
  if(req.method()!=='GET')throw Error('Unexpected mutation '+p);
  if(p==='/api/auth/session')return route.fulfill({json:{user}});
  if(p==='/api/config')return route.fulfill({json:{db:true,authMode:'mock',multiUser:false,imageQualityCapable:true,creditsMetered:true,commerceVisible:false,imageModels:[{id:'fixture-image',label:'Fixture',supportsEdit:true,qualities:['medium'],nativeResolutions:['1K']}],defaultImageModel:'fixture-image'}});
  if(p==='/api/models')return route.fulfill({json:{managed:false,supported:true,models:[],defaultModelId:'fixture-image'}});
  if(p==='/api/text-models')return route.fulfill({json:{models:['fixture-text'],defaultModel:'fixture-text'}});
  if(p==='/api/account')return route.fulfill({json:{user,artworks:[]}});
  if(p==='/api/billing/catalog')return route.fulfill({json:{version:1,features,products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}}});
  return route.fulfill({json:{items:[],tasks:[],sessions:[],templates:[],artworks:[],records:[],names:{},nodes:[],settings:{}}});
 });
 await page.route('**/_next/static/chunks/**',async route=>{const file=path.resolve(dist,new URL(route.request().url()).pathname.replace('/_next/',''));assert.ok(file.startsWith(path.resolve(dist)+path.sep));await route.fulfill({contentType:'application/javascript',body:await readFile(file)});});
 for(const slug of routes){
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/'+slug,{timeout:120000});const demo=page.getByTestId(slug==='suite'?'suite-demo':'tool-demo');await expect(demo).toBeVisible();
  for(const width of [1440,1024,390,320]){
   await page.setViewportSize({width,height:1000});
   if(slug==='generate'&&width<1024)await page.getByRole('tab',{name:'结果',exact:true}).click();
   await expect(demo).toBeVisible();await demo.scrollIntoViewIfNeeded();
   await expect.poll(()=>demo.locator('img').evaluateAll(xs=>xs.length>0&&xs.every(x=>x.complete&&x.naturalWidth>0)),{timeout:45000}).toBe(true);
   const geometry=await demo.evaluate(el=>{const box=el.getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth,images:[...el.querySelectorAll('img')].map(x=>{const b=x.getBoundingClientRect();return{url:x.getAttribute('src'),left:b.left,right:b.right,width:b.width,height:b.height,containerLeft:box.left,containerRight:box.right};})};});
   assert.equal(geometry.overflow,false,slug+' page overflow '+width);
   for(const g of geometry.images){assert.ok(g.url.startsWith('/demos/workbench-v2/'),g.url);assert.ok(g.left>=g.containerLeft-1&&g.right<=g.containerRight+1,slug+' image clipped');assert.ok(g.width>0&&g.height>0);}
   if(slug!=='suite'&&slug!=='ipcheck')assert.ok(Math.abs(geometry.images[0].width-geometry.images[1].width)<1&&Math.abs(geometry.images[0].height-geometry.images[1].height)<1,'equal before/after cards');
   checks.push({slug,width,images:geometry.images.length});
   if(width===1440||width===390)await demo.screenshot({path:out+'/browser/'+slug+'-'+width+'.png'});
  }
  if(slug==='suite'){
   const speaker=demo.getByRole('button',{name:'便携音箱',exact:true});await speaker.click();await expect(speaker).toHaveAttribute('aria-pressed','true');await expect.poll(()=>demo.locator('img').evaluateAll(xs=>xs.every(x=>x.complete&&x.naturalWidth>0&&x.src.includes('suite-speaker')))).toBe(true);
   await page.keyboard.press('Tab');await page.waitForTimeout(5500);await expect(speaker).toHaveAttribute('aria-pressed','true');
   await demo.getByRole('button',{name:'咖啡机',exact:true}).click();await expect.poll(()=>demo.locator('img').evaluateAll(xs=>xs.every(x=>x.complete&&x.naturalWidth>0&&x.src.includes('suite-coffee')))).toBe(true);
  }
  console.log('DEMO_PAGE=PASS '+slug+' WIDTHS=1440_1024_390_320');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);assert.ok(writes.every(p=>p==='/api/billing/quote'));
 await writeFile(out+'/browser/result.json',JSON.stringify({checks,errors,bad,mutations:writes,providerCalls:0},null,2));
 console.log('BROWSER=PASS PAGES=22 VIEWPORTS=4 IMAGES=LOADED PAIRS=EQUAL OVERFLOW=0 CLIENT_ERRORS=0 SUITE_SWITCH=PASS REDUCED_MOTION=PASS PROVIDER_CALLS=0');
}catch(e){await page?.screenshot({path:out+'/browser/failure.png',fullPage:true}).catch(()=>{});await writeFile(out+'/browser/failure.json',JSON.stringify({url:page?.url(),checks,errors,bad},null,2));throw e;}
finally{await browser?.close();if(app?.pid){try{execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'});}catch{}}await writeFile('tsconfig.json',original);await writeFile(out+'/browser/next.log',logs.join(''));}
