import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {chromium,expect as rawExpect} from '@playwright/test';
const out=path.resolve(process.env.THEME_EVIDENCE_DIR||'output/canvas-theme-toggle/browser');
const originalTsconfig=await readFile('tsconfig.json');
await mkdir(out,{recursive:true});
const logs=[],errors=[],checks=[],requests=[],responses=[],consoleMessages=[],failedRequests=[],expect=rawExpect.configure({timeout:45000});
let app,browser,page;
const pass=label=>{checks.push(label);console.log('PASS '+label);};
try{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 const base=`http://127.0.0.1:${port}`;
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port)],{env:{...process.env,DATABASE_URL:'',NAUMI_MULTI_USER:'0',SETTINGS_SECRET:randomUUID(),VIDEO_WORKER_SECRET:randomUUID(),NAUMI_VIDEO_WORKER:'0',OPENAI_API_KEY:'local-theme-fixture',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:'.next-theme-acceptance'},stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',c=>logs.push(c.toString()));app.stderr.on('data',c=>logs.push(c.toString()));
 let ready=false;for(let i=0;i<120;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 const now=new Date().toISOString(),email='theme-fixture@example.test';
 const user={name:'外置颜色验收',email,plan:'starter',creditsTotal:30,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[]};
 const metadata=await sharp('public/demos/suite-demo/suppl-src.png').metadata();
 const art={id:'theme-demo',title:'画布颜色验收',category:'main',prompt:'',createdAt:now,status:'completed',image:base+'/demos/suite-demo/suppl-src.png',gradient:'',origin:'canvas',source:'canvas-add',groupId:'theme-demo',width:metadata.width,height:metadata.height,canvasWidth:320,canvasHeight:Math.round(320*metadata.height/metadata.width),canvasX:100,canvasY:100};
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
 await context.addInitScript(({user,email})=>{if(!localStorage.getItem('naumi:last-email')){localStorage.setItem('naumi:last-email',email);localStorage.setItem('naumi:user:'+email,JSON.stringify(user));localStorage.setItem('nv:canvas:last','tree:theme-demo');localStorage.setItem('nv:canvas:bg','light');}},{user,email});
 page=await context.newPage();page.on('pageerror',e=>{errors.push(e.stack||e.message);console.log('PAGE_ERROR '+(e.stack||e.message));});page.on('request',r=>requests.push(r.url()));page.on('response',r=>responses.push([r.status(),r.url()]));page.on('requestfailed',r=>failedRequests.push([r.url(),r.failure()]));page.on('console',m=>consoleMessages.push([m.type(),m.text()]));let writes=0;
 await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()).pathname;
  if(req.method()!=='GET'){writes++;return route.fulfill({status:409,json:{error:'No writes in theme acceptance'}});}
  if(url==='/api/config')return route.fulfill({json:{db:true,authMode:'mock',multiUser:true,commerceVisible:false}});
  if(url==='/api/auth/session')return route.fulfill({json:{user}});
  if(url==='/api/account')return route.fulfill({json:{persisted:true,user,artworks:[art]}});
  if(url==='/api/projects')return route.fulfill({json:{names:{'tree:theme-demo':'颜色验收'}}});
  if(url==='/api/canvas/text-nodes')return route.fulfill({json:{persisted:true,nodes:[]}});
  if(url==='/api/canvas/node-settings')return route.fulfill({json:{persisted:true,settings:{}}});
  return route.continue();
 });
 // Local Windows acceptance observed a dev chunk truncated at 256KiB.
 // Serve the identical compiler output bytes directly for this isolated browser fixture.
 await page.route('**/_next/static/chunks/**',async route=>{
  const relative=new URL(route.request().url()).pathname.replace('/_next/','');
  const file=path.resolve('.next-theme-acceptance',relative);
  assert.ok(file.startsWith(path.resolve('.next-theme-acceptance')+path.sep));
  await route.fulfill({contentType:'application/javascript',body:await readFile(file)});
 });
 await page.route('**/demos/suite-demo/suppl-src.png',async route=>route.fulfill({contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')}));
 await page.goto(base+'/canvas');const button=page.getByTestId('canvas-theme-toggle'),views=page.getByTestId('canvas-view-toolbar'),stage=page.locator('.canvas-stage');
 if(errors.length)throw new Error(errors.join('\n'));
 await expect(button).toBeVisible();await expect(button).toHaveAccessibleName('切换深色画布');await expect(button).toHaveAttribute('aria-pressed','false');await expect(stage).toHaveClass(/canvas-light/);
 const fit=views.getByRole('button',{name:'适应视图',exact:true}),b=await button.boundingBox(),f=await fit.boundingBox();assert.equal(b.width,f.width);assert.equal(b.height,f.height);assert.equal(b.width,32);
 await page.screenshot({path:path.join(out,'desktop-light.png')});pass('32px external toggle beside fit-view, light canvas and accessible label');
 await button.click();await expect(stage).not.toHaveClass(/canvas-light/);await expect(button).toHaveAccessibleName('切换浅色画布');await expect(button).toHaveAttribute('aria-pressed','true');assert.equal(await page.evaluate(()=>localStorage.getItem('nv:canvas:bg')),'dark');
 await page.screenshot({path:path.join(out,'desktop-dark.png')});await page.reload();await expect(button).toBeVisible();await expect(stage).not.toHaveClass(/canvas-light/);pass('one-click switching and dark preference survives reload');
 await button.focus();await page.keyboard.press('Enter');await expect(stage).toHaveClass(/canvas-light/);
 await page.keyboard.press('Space');await expect(stage).not.toHaveClass(/canvas-light/);
 await page.getByTestId('canvas-main-toolbar').locator('[data-tool="more"]').click();const menu=page.getByTestId('canvas-more-tools-menu');await expect(menu).toBeVisible();assert.equal(await menu.getByRole('menuitem').count(),1);await expect(menu.getByRole('menuitem',{name:/快捷键/})).toBeVisible();await page.keyboard.press('Escape');pass('Enter/Space toggle; more menu keeps shortcuts only, no duplicate theme entry');
 await page.setViewportSize({width:320,height:760});await expect(button).toBeVisible();await button.click();await expect(stage).toHaveClass(/canvas-light/);const box=await views.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=320);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const mainBox=await page.getByTestId('canvas-main-toolbar').boundingBox();assert.ok(mainBox.y+mainBox.height<=box.y,'mobile bars overlap');await page.screenshot({path:path.join(out,'mobile-light.png')});pass('320px viewport keeps toggle visible and toolbars separated');
 // Storage unavailable: the UI toggle must still work even when persistence throws.
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new Error('fixture storage unavailable');};});await button.click();await expect(stage).not.toHaveClass(/canvas-light/);pass('storage error does not prevent immediate theme switching');
 await context.addCookies([{name:'naumi_locale',value:'en',url:base}]);await page.reload();await expect(button).toHaveAccessibleName('Switch to dark canvas');await button.click();await expect(button).toHaveAccessibleName('Switch to light canvas');pass('English action labels follow theme state');
 await page.goto(base+'/canvas?email=readonly-fixture%40example.test&node=theme-demo');await expect(button).toBeVisible();await expect(views.getByRole('button',{name:'Tidy up',exact:true})).toHaveCount(0);await button.click();await expect(button).toHaveAttribute('aria-pressed','false');pass('read-only canvas retains local theme switching without edit controls');
 assert.deepEqual(errors,[]);assert.equal(writes,0);await writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors,writes,size:b.width},null,2));
 console.log('BROWSER=PASS EXTERNAL=VISIBLE THEME_SWITCH=PASS RELOAD=PASS KEYBOARD=PASS MOBILE=320px STORAGE_FAILURE=PASS LANGUAGES=ZH_EN READ_ONLY=PASS API_WRITES=0');
}catch(error){await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'failure-details.json'),JSON.stringify({errors,requests,responses,consoleMessages,failedRequests,local:await page?.evaluate(()=>({...localStorage})).catch(()=>null)},null,2));throw error;}
finally{await browser?.close();if(app?.pid){if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'});}catch{}}else app.kill('SIGTERM');}await writeFile('tsconfig.json',originalTsconfig);await writeFile(path.join(out,'next.log'),logs.join(''));}
