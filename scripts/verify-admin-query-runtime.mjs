// Production Next build + actual HTTP/auth/database, on a disposable loopback DB.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {randomBytes,scryptSync} from 'node:crypto';
import {Pool} from 'pg';
import {chromium} from '@playwright/test';

const url=new URL(process.env.DATABASE_URL||'');
assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/admin_query_runtime');
const out=path.resolve('output/admin-query/runtime');await fs.mkdir(out,{recursive:true});
const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const origin=`http://127.0.0.1:${port}`,secret='admin-query-runtime-fixture-only-012345678901234567890123456789';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{windowsHide:true,env:{...process.env,NODE_OPTIONS:'',SETTINGS_SECRET:secret,VIDEO_WORKER_SECRET:randomBytes(32).toString('hex'),NAUMI_APPLICATION_TASK_EXECUTION:'worker',NAUMI_MULTI_USER:'1',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',data=>logs+=data);server.stderr.on('data',data=>logs+=data);
const pool=new Pool({connectionString:process.env.DATABASE_URL});let browser,page;const errors=[],requests=[],checks=[];
try{
 let ready=false;for(let attempt=0;attempt<120;attempt++){
  if(server.exitCode!==null)throw Error('Next stopped during startup: '+logs);
  try{const response=await fetch(origin+'/api/version',{signal:AbortSignal.timeout(1500)});if(response.ok){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
 }assert.ok(ready,'Local production app readiness');
 const salt=randomBytes(16),password='fixture-query-runtime-password';
 const hash=`scrypt$${salt.toString('hex')}$${scryptSync(password,salt,32).toString('hex')}`;
 await pool.query("INSERT INTO app_settings(k,v) VALUES('admin_password_hash',$1) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v",[hash]);
 await pool.query(`INSERT INTO app_users(email,name,plan,credits_total,credits_used,banned,joined_at,renews_at)
 SELECT 'fixture-'||lpad(g::text,2,'0')||'@example.test','Query Fixture '||lpad(g::text,2,'0'),'free',100,0,false,now()-g*interval '1 hour',now()+interval '1 month' FROM generate_series(1,65)g ON CONFLICT(email) DO NOTHING`);
 browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const anon=await context.request.get(origin+'/api/admin/usage?page=1');assert.equal(anon.status(),403);
 const login=await context.request.post(origin+'/api/admin/login',{headers:{origin},data:{password}});assert.equal(login.status(),200);checks.push('Actual admin login and anonymous rejection');
 page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().startsWith(origin+'/api/admin/'))requests.push(new URL(request.url()).pathname+new URL(request.url()).search)});
 await page.goto(origin+'/admin/center?section=users&period=all');await page.getByText('Query Fixture 01',{exact:true}).waitFor();await page.waitForTimeout(250);
 assert.equal(requests.filter(url=>url.startsWith('/api/admin/bi?')).length,1);
 await page.getByLabel('搜索账户',{exact:true}).fill('fixture-01');await page.getByRole('button',{name:'查询',exact:true}).click();await page.waitForResponse(response=>response.url().includes('/api/admin/bi?')&&new URL(response.url()).searchParams.get('q')==='fixture-01');
 await page.waitForTimeout(300);assert.equal(requests.filter(url=>url.startsWith('/api/admin/bi?')).length,2);assert.equal(await page.locator('tbody tr').count(),1);checks.push('BI production hydration and URL filter: one HTTP read each');
 await page.screenshot({path:path.join(out,'bi-production.png'),fullPage:true});
 await page.goto(origin+'/admin?view=settings&tab=usage');await page.getByRole('heading',{name:'用户用量管理',exact:true}).waitFor();await page.getByRole('button',{name:'查看明细',exact:true}).first().waitFor();assert.equal(await page.locator('tbody tr').count(),30);
 const scoped=requests.filter(url=>url.startsWith('/api/admin/users?view=members'));assert.equal(new URL(scoped.at(-1),origin).searchParams.getAll('member').length,30);
 await page.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForResponse(response=>response.url().includes('/api/admin/usage?')&&new URL(response.url()).searchParams.get('page')==='2');
 await page.getByRole('button',{name:'查看明细',exact:true}).first().waitFor();await page.screenshot({path:path.join(out,'usage-production.png'),fullPage:true});checks.push('Legacy usage actual page/SQL/member directory: 30 rows and page 2');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'usage-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify({checks,errors,requests,realNext:true,realPostgres:true,productionWrites:0,supplierCalls:0},null,2));console.log('ADMIN_QUERY_RUNTIME=PASS '+JSON.stringify(checks));
}catch(error){if(page){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({errors,requests,url:page.url(),text:await page.locator('body').innerText()},null,2));}throw error;}
finally{await browser?.close();server.kill();await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve)});await pool.end();await fs.writeFile(path.join(out,'server.log'),logs);}
