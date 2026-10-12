import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
const baseline=process.argv.includes('--baseline'), dist=baseline?'.next-performance-modified':'.next-browser-cache-build';
const out=path.resolve('output/browser-cache-20261012');await mkdir(out,{recursive:true});
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const base=`http://127.0.0.1:${port}`;
const logs=[],errors=[],counts={full:0,summary:0,session:0,other:0};let title='缓存验收',credits=99999,signedIn=true;
const now=new Date().toISOString(),email='browser-cache@example.test';
const user=()=>({name:'缓存验收账号',email,plan:'starter',creditsTotal:credits,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[]});
const art=()=>({id:'cache-root',title,category:'main',image:base+'/demos/hero-after.png',status:'completed',prompt:'fixture',createdAt:now,origin:'canvas',source:'canvas-add',groupId:'cache-root',canvasWidth:320,canvasHeight:320,canvasX:100,canvasY:100,width:1024,height:1024});
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{env:{...process.env,NEXT_DIST_DIR:dist,DATABASE_URL:'',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});app.stdout.on('data',c=>logs.push(c.toString()));app.stderr.on('data',c=>logs.push(c.toString()));let browser;
try {
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await ctx.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
 await ctx.addInitScript(()=>{localStorage.setItem('nv:canvas:last','tree:cache-root');localStorage.setItem('theme','light');});
 const page=await ctx.newPage();page.on('console',m=>{if(m.type()==='error')console.error('BROWSER_CONSOLE',m.text())});page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message)});
 await ctx.route('**/api/**',route=>{
  const req=route.request();if(req.method()!=='GET')console.log('MUTATION',req.url());const url=new URL(req.url()),p=url.pathname;
  if(p==='/api/config')return route.fulfill({json:{db:true,multiUser:true,authMode:'mock',commerceVisible:false,imageModels:[{id:'gpt-image-2',label:'GPT Image 2',modality:'image',supportsEdit:true,nativeResolutions:['1K','2K']}],defaultImageModel:'gpt-image-2'}});
  if(p==='/api/auth/session'){counts.session++;return route.fulfill({json:{user:signedIn?user():null}});}
  if(p==='/api/auth/logout'){signedIn=false;return route.fulfill({json:{ok:true}});}
  if(p==='/api/auth/login'){signedIn=true;return route.fulfill({json:{ok:true,user:user()}});}
  if(p==='/api/account'){
    if(url.searchParams.get('email')!==email)counts.other++;
    else if(url.searchParams.get('view')==='workbench')counts.summary++;
    else counts.full++;
    return route.fulfill({json:{persisted:true,user:user(),artworks:[art()],stats:{today:1,total:1}}});
  }
  if(p==='/api/models')return route.fulfill({json:{managed:false,supported:true,models:[{id:'gpt-image-2',label:'GPT Image 2',modality:'image',supportsEdit:true,nativeResolutions:['1K','2K']}],defaultModelId:'gpt-image-2',version:1}});
  if(p==='/api/text-models')return route.fulfill({json:{models:['gpt-4o'],defaultModel:'gpt-4o'}});
  if(p==='/api/billing/catalog')return route.fulfill({json:{version:1,features:Object.fromEntries(['image.generate','canvas.image','canvas.expand','canvas.text-generate','canvas.assistant','tool.cutout'].map(f=>[f,{enabled:true,prices:{low:{'1K':2},medium:{'1K':4},high:{'1K':8}}}])),products:[],effective:{commerce:false,metering:true,recharge:false}}});
  return route.fulfill({json:{ok:true,persisted:true,items:[],nodes:[],settings:{},names:{},artworks:[],tasks:[],favs:[],records:[],endpoints:[],workflows:[],sessions:[]}});
 });
 for(let i=0;i<3;i++) {await page.goto(base+'/works');await expect(page.getByRole('img',{name:title,exact:true}).first()).toBeVisible();}
 if(baseline)assert.ok(counts.full>=3);else assert.equal(counts.full,1);const repeat=counts.full;
 for(let i=0;i<3;i++){await page.goto(base+'/dashboard');await expect(page.getByRole('img',{name:title,exact:true}).first()).toBeVisible();}
 if(baseline)assert.ok(counts.summary>=3);else assert.equal(counts.summary,1);const summary=counts.summary;
 if(!baseline) {
   await page.goto(base+'/canvas');await page.getByTestId('canvas-main-toolbar').waitFor();await expect(page.locator('.react-flow__node[data-id="cache-root"]')).toBeVisible();
   assert.equal(counts.full,1,'canvas shares fresh full artwork snapshot');
   await page.evaluate(()=>fetch('/api/artworks/rename',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'cache-root',title:'已更新'})}));title='已更新';credits=888;
   await page.goto(base+'/works');await expect(page.getByRole('img',{name:title,exact:true}).first()).toBeVisible();assert.equal(counts.full,2);
   await page.getByRole('img',{name:title,exact:true}).first().evaluate(img=>img.decode());await page.waitForTimeout(100);await page.screenshot({path:path.join(out,'cache-works-ui.png')});
   await page.goto(base+'/dashboard');await expect(page.getByRole('img',{name:title,exact:true}).first()).toBeVisible();assert.equal(counts.summary,2);
   await page.getByRole('img',{name:title,exact:true}).first().scrollIntoViewIfNeeded();await page.getByRole('img',{name:title,exact:true}).first().evaluate(img=>img.decode());await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(100);await page.screenshot({path:path.join(out,'cache-dashboard-ui.png')});
   for(let i=0;i<2;i++){await page.goto(base+'/canvas?email=other@example.test');await expect(page.locator('.react-flow__node[data-id="cache-root"]')).toBeVisible();}
   assert.equal(counts.other,2,'admin/cross-account view always checks server');
   const data=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('naumi-business-cache-v1');r.onsuccess=()=>{const req=r.result.transaction('snapshots').objectStore('snapshots').getAll();req.onsuccess=()=>resolve(req.result);};}));
   assert.ok(data.every(row=>row.account===email));assert.ok(!JSON.stringify(data).includes('creditsTotal'));assert.ok(counts.session>=10);
   await page.goto(base+'/works');await expect(page.getByRole('img',{name:title,exact:true}).first()).toBeVisible();
   const second=await ctx.newPage();await second.goto(base+'/works');await expect(second.getByRole('img',{name:title,exact:true}).first()).toBeVisible();
   await page.locator('header').getByRole('button').filter({hasText:'缓'}).last().hover();
   await page.getByRole('button',{name:/退出登录/}).click();
   await expect(second.getByRole('img',{name:title,exact:true})).toHaveCount(0);
   await second.close();
   // Native login must explicitly establish a session, unlike late credit/generation responses.
   await page.goto(base+'/works');
   await page.getByTestId('app-account-dock-trigger').first().click();
   await page.getByPlaceholder('用户名或邮箱').fill(email);await page.getByPlaceholder('密码',{exact:true}).fill('fixture-only-password');
   await page.getByRole('button',{name:'登录',exact:true}).last().click();
   await expect(page.getByRole('img',{name:title,exact:true}).first()).toBeVisible();
   console.log('LOGOUT_UI=CROSS_TAB_CLEARED NATIVE_LOGIN=RESTORED');

 }
 if(!baseline)assert.deepEqual(errors,[]);else console.log('BASELINE_TEMPLATE_HYDRATION_ERRORS='+errors.length);await writeFile(path.join(out,baseline?'baseline-ui.json':'modified-ui.json'),JSON.stringify({counts,repeat,summary,errors},null,2));
 console.log(`${baseline?'BASELINE_UI':'MODIFIED_UI'}=PASS WORKS_3_VISITS_GET=${repeat} WORKBENCH_3_VISITS_GET=${summary} AUTH_SESSION=LIVE PROVIDER_CALLS=0`);
} catch(e) { console.error('COUNTS',counts); const p=browser?.contexts()[0]?.pages()[0]; if(p){console.error('DOM',await p.locator('body').innerText());await p.screenshot({path:path.join(out,'ui-failure.png')});console.error('IDB',await p.evaluate(()=>new Promise(r=>{const q=indexedDB.open('naumi-business-cache-v1');q.onsuccess=()=>{const v=q.result.transaction('snapshots').objectStore('snapshots').getAll();v.onsuccess=()=>r(v.result)};})));} throw e; } finally {await browser?.close();if(app.pid){try{execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'});}catch{}}await writeFile(path.join(out,baseline?'baseline-ui-server.log':'modified-ui-server.log'),logs.join(''));}
