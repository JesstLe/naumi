import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';

/** Actual Next pages and React, fixture PG, no generation button click. */
export async function verifySpecialAccountBrowser({root,out,cookies,emails}){
 await mkdir(out,{recursive:true});
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const origin=`http://127.0.0.1:${port}`,logs=[],errors=[],requests=[];
 const app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env:{...process.env,NODE_OPTIONS:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:'.next-special-account',NAUMI_VIDEO_WORKER:'0',VIDEO_WORKER_SECRET:'local-browser-worker-secret-20261124-fixture',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',OPENAI_API_KEY:'local-browser-fixture-unused-key',OPENAI_BASE_URL:process.env.MODEL_CONFIG_TRUSTED_ORIGINS+'/v1',SOURCE_COMMIT:process.env.SPECIAL_ACCOUNT_SOURCE_SHA||''},stdio:['ignore','pipe','pipe'],windowsHide:true});
 app.stdout.on('data',c=>logs.push(c.toString()));app.stderr.on('data',c=>logs.push(c.toString()));
 let browser;
 try{
  let ready=false;for(let i=0;i<180;i++){if(app.exitCode!==null)throw Error(`NEXT_EXIT_${app.exitCode}`);try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'Next ready');
  browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&/generate|imagegen/.test(new URL(r.url()).pathname))requests.push(r.url());});
  async function login(value){await context.clearCookies();await context.addCookies([{name:'nv_user',value,url:origin},{name:'naumi_locale',value:'zh',url:origin}]);}
  await login(cookies.private);
  await page.goto(origin+'/generate',{waitUntil:'domcontentloaded',timeout:120000});
  await expect(page.getByRole('button',{name:/我的账户/}).first()).toBeVisible({timeout:90000});
  await expect(page.getByRole('combobox').filter({hasText:'GPT 生图'}).first()).toBeVisible({timeout:90000});
  await page.getByRole('combobox').filter({hasText:'GPT 生图'}).first().click();
  await expect(page.getByRole('option',{name:/GPT 生图/})).toBeVisible();
  await expect(page.getByRole('option',{name:/测试生图/})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByAltText('A plain product photo').first()).toBeVisible({timeout:45000});
  await page.screenshot({path:path.join(out,'private-generate-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no mobile horizontal overflow');
  await page.screenshot({path:path.join(out,'private-generate-mobile.png'),fullPage:true});
  const privateConfig=await page.request.get(origin+'/api/config');const config=await privateConfig.json();assert.equal(config.defaultImageModel,'private-image');assert.equal(config.imageModels.length,1);
  await page.setViewportSize({width:1440,height:1000});await login(cookies.normal);await page.goto(origin+'/generate',{waitUntil:'domcontentloaded',timeout:120000});
  await expect(page.getByRole('button',{name:/我的账户/}).first()).toBeVisible({timeout:90000});
  await expect(page.getByRole('combobox').filter({hasText:'测试生图'}).first()).toBeVisible({timeout:90000});
  assert.ok(!(await (await page.request.get(origin+'/api/config')).json()).imageModels.some(m=>m.id==='private-image'));
  await page.screenshot({path:path.join(out,'normal-generate-desktop.png'),fullPage:true});
  await login(cookies.admin);await page.goto(origin+'/admin/usage?email='+encodeURIComponent(emails.private),{waitUntil:'domcontentloaded',timeout:120000});
  await expect(page.getByText('没有匹配的用户记录')).toBeVisible({timeout:90000});
  await page.screenshot({path:path.join(out,'admin-private-usage.png'),fullPage:true});
  const hidden=await page.request.get(origin+'/api/admin/users?email='+encodeURIComponent(emails.private));assert.equal(hidden.status(),404);
  const visible=await page.request.get(origin+'/api/admin/users?email='+encodeURIComponent(emails.normal));assert.equal(visible.status(),200);
  assert.equal(requests.length,0,'browser never generates');assert.deepEqual(errors,[]);
  const result={status:'PASS',tier:'REAL_NEXT_CHROMIUM_ISOLATED_PG',checks:10,source:process.env.SPECIAL_ACCOUNT_SOURCE_SHA||'uncommitted',generationPosts:requests.length,pageErrors:errors,screenshots:['private-generate-desktop.png','private-generate-mobile.png','normal-generate-desktop.png','admin-private-usage.png']};
  await writeFile(path.join(out,'BROWSER.json'),JSON.stringify(result,null,2));console.log('SPECIAL_ACCOUNT_BROWSER=PASS checks=10 REAL_NEXT=1 REAL_PG=1 GENERATION_POSTS=0 PAGE_ERRORS=0');return result;
 }finally{
  if(browser)await browser.close();
  app.kill();await new Promise(r=>{if(app.exitCode!==null)return r();app.once('exit',r);setTimeout(r,15000).unref();});
  await writeFile(path.join(out,'next.log'),logs.join(''));
 }
}
