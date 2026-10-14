import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
  Object.assign(process.env,{FLEET_CONTROL_ENABLED:'1',NAUMI_MULTI_USER:'1',NAUMI_VIDEO_WORKER:'0',SETTINGS_SECRET:'fleet-isolated-settings-012345678901234567890',VIDEO_WORKER_SECRET:'fleet-isolated-worker-012345678901234567890'});
  const db=await import('../src/lib/db'),auth=await import('../src/lib/admin-auth');await auth.setAdminPassword('fleet-ui-fixture-password');
  const cwd=path.resolve('output/fleet-control/build-copy'),log=fs.openSync('output/fleet-control/ui-server.log','w');
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','15548'],{cwd,env:process.env,stdio:['ignore',log,log]});
  let browser;
  try {
    const origin='http://127.0.0.1:15548';let ready=false;
    for(let i=0;i<40;i++){try{await fetch(origin+'/api/version');ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
    assert.equal(ready,true);
    browser=await chromium.launch({headless:true,executablePath:process.env.FLEET_CHROMIUM});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
    const login=await context.request.post(origin+'/api/admin/login',{data:{password:'fleet-ui-fixture-password'}});assert.equal(login.status(),200);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/admin/deployments');await page.getByRole('heading',{name:'部署管理',exact:true}).waitFor();
    await page.getByRole('textbox',{name:'实例名称'}).fill('47 企业UI验收');await page.getByRole('button',{name:'注册实例',exact:true}).click();await page.getByRole('heading',{name:'连接凭据 · 仅显示本次'}).waitFor();
    await page.getByRole('button',{name:'已保存，关闭'}).click();await page.getByRole('heading',{name:'47 企业UI验收',exact:true}).waitFor();
    await page.getByRole('button',{name:'查询用户',exact:true}).click();await page.getByText('待执行',{exact:true}).waitFor();
    const wide=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);assert.equal(wide,true);await page.screenshot({path:'output/fleet-control/ui-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:'output/fleet-control/ui-mobile.png',fullPage:true});
    await page.reload();await page.getByRole('heading',{name:'部署管理',exact:true}).waitFor();await page.getByRole('button',{name:/47 企业UI验收/}).click();await page.getByText('待执行',{exact:true}).waitFor();assert.equal(errors.length,0,errors.join('\n'));
    console.log('FLEET_UI=PASS ACTUAL_NEXT=1 REGISTER=1 CREDENTIAL_DISMISS=1 QUEUED_NOT_FAKE_SUCCESS=1 REFRESH_PERSIST=1 DESKTOP1440=1 MOBILE390=1 OVERFLOW=0 PAGEERROR=0');
  } finally {if(browser)await browser.close();child.kill();await new Promise<void>(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',()=>resolve());});fs.closeSync(log);await db.getPool().end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
