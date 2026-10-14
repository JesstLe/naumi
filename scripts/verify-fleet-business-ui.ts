import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import {Pool} from 'pg';
import {chromium} from '@playwright/test';
async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
  Object.assign(process.env,{FLEET_CONTROL_ENABLED:'1',FLEET_ISOLATED_TEST:'1',NAUMI_MULTI_USER:'1',NAUMI_VIDEO_WORKER:'0',SETTINGS_SECRET:'fleet-business-settings-012345678901234567890',VIDEO_WORKER_SECRET:'fleet-business-worker-012345678901234567890'});
  const db=await import('../src/lib/db'),auth=await import('../src/lib/admin-auth'),fleet=await import('../src/lib/fleet/server');
  await auth.setAdminPassword('fleet-business-fixture-password');await db.getOrCreateUser('staff@enterprise.test');const centralCredits=(await db.getUser('staff@enterprise.test'))!.creditsTotal;
  const instance=await fleet.createInstance('fixture','47 企业业务验收','enterprise'),cluster=new Pool({connectionString:process.env.DATABASE_URL}),tenant='fleet_business_'+randomUUID().replaceAll('-','');await cluster.query('CREATE DATABASE '+tenant);
  const enterpriseUrl=new URL(process.env.DATABASE_URL!);enterpriseUrl.pathname='/'+tenant;
  const origin='http://127.0.0.1:15549',cwd=path.resolve('output/fleet-control/build-copy'),log=fs.openSync('output/fleet-executor/business-ui-server.log','w');
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','15549'],{cwd,env:process.env,stdio:['ignore',log,log]});
  async function worker(mode='tick'){
    const result=await new Promise<{code:number;output:string}>((resolve,reject)=>{const p=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','--conditions','react-server','scripts/verify-fleet-worker.ts',mode],{cwd,env:{...process.env,DATABASE_URL:enterpriseUrl.toString(),FLEET_CENTRAL_URL:origin,FLEET_INSTANCE_ID:instance.id,FLEET_INSTANCE_TOKEN:instance.token},stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',reject);p.on('close',code=>resolve({code:code??-1,output}));});assert.equal(result.code,0,result.output);return result.output.trim()?JSON.parse(result.output.trim().split('\n').at(-1)!):null;
  }
  let browser;
  try{
    for(let i=0;i<60;i++){try{if((await fetch(origin+'/api/version')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
    await worker('seed');const before=await worker('inspect');
    browser=await chromium.launch({headless:true,executablePath:process.env.FLEET_CHROMIUM});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
    assert.equal((await context.request.post(origin+'/api/admin/login',{data:{password:'fleet-business-fixture-password'}})).status(),200);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>void dialog.accept());
    await page.goto(origin+'/admin/deployments');await page.getByRole('button',{name:/47 企业业务验收/}).click();
    async function runUi(click:()=>Promise<void>){const queued=page.waitForResponse(r=>r.url().endsWith('/api/admin/fleet')&&r.request().postData()?.includes('"action":"command"')===true);await click();assert.equal((await queued).status(),202);assert.equal((await worker()).state,'succeeded');const refreshed=page.waitForResponse(r=>r.url().endsWith('/api/admin/fleet')&&r.request().method()==='GET');await page.getByRole('button',{name:'刷新',exact:true}).click();assert.equal((await refreshed).status(),200);}
    await runUi(()=>page.getByRole('button',{name:'查询用户',exact:true}).click());
    const row=page.getByRole('row').filter({hasText:'staff@enterprise.test'});await row.getByRole('button',{name:'选择',exact:true}).click();
    await page.getByRole('spinbutton',{name:'积分调整',exact:true}).fill('500');await page.getByRole('textbox',{name:'调整原因',exact:true}).fill('隔离浏览器验收');
    await runUi(()=>page.getByRole('button',{name:'提交积分调整',exact:true}).click());let state=await worker('inspect');assert.equal(state.user.creditsTotal,before.user.creditsTotal+500);assert.equal((await db.getUser('staff@enterprise.test'))!.creditsTotal,centralCredits);
    await runUi(()=>row.getByRole('button',{name:'停用',exact:true}).click());assert.equal((await worker('inspect')).user.banned,true);
    await runUi(()=>page.getByRole('button',{name:'读取功能权限',exact:true}).click());await page.getByRole('button',{name:'编辑已读取权限',exact:true}).click();await page.getByRole('checkbox',{name:'使用默认权限',exact:true}).uncheck();await page.getByRole('checkbox',{name:'画布',exact:true}).uncheck();
    await runUi(()=>page.getByRole('button',{name:'保存权限',exact:true}).click());state=await worker('inspect');assert.equal(state.policy.mode,'custom');assert.equal(state.policy.allowed.includes('canvas'),false);assert.equal(state.policy.version,1);
    await runUi(()=>page.getByRole('button',{name:'查询用户',exact:true}).click());await row.getByRole('button',{name:'启用',exact:true}).waitFor();await runUi(()=>row.getByRole('button',{name:'启用',exact:true}).click());assert.equal((await worker('inspect')).user.banned,false);
    assert.equal(errors.length,0,errors.join('\n'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:'output/fleet-executor/business-ui.png',fullPage:true});
    console.log('FLEET_BUSINESS_UI=PASS ACTUAL_NEXT=1 REAL_CONNECTOR=1 TWO_DATABASES=1 USER_LIST=1 CREDIT_DELTA_ONCE=1 CENTRAL_BALANCE_UNCHANGED=1 BAN_UNBAN=1 FEATURE_SAVE_CAS=1 PAGEERROR=0 PRODUCTION_WRITES=0');
  }finally{if(browser)await browser.close();child.kill();await new Promise<void>(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',()=>resolve());});fs.closeSync(log);await cluster.query('DROP DATABASE '+tenant+' WITH (FORCE)');await cluster.end();await db.getPool().end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
