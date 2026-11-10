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
 await pool.query(`INSERT INTO app_agent_sessions(id,email,title,messages,created_at,updated_at)
 VALUES('admin-detail-audit','fixture-01@example.test','Detail retry fixture',$1::jsonb,now(),now()) ON CONFLICT DO NOTHING`,[JSON.stringify([{role:'user',content:'Actual conversation retry evidence'}])]);
 const metadata={family:'Fixture',brand:'Fixture',modality:'image',capabilityState:'unknown',capabilitySource:'fixture',capabilityUrl:'',checkedAt:'',prices:[],notes:'fixture metadata preserved',parameterMetadata:{fixtureEvidence:'FULL_EXPORT'},capabilities:{generate:null,edit:null,mask:null,vision:null,streaming:null,qualities:null,resolutions:['1K'],ratios:null,maxReferences:null,contextTokens:null}};
 await pool.query(`INSERT INTO app_supplier_model_metadata(id,provider_id,provider_name,model_id,label,family,brand,modality,capability_state,metadata,updated_by)
 VALUES('11111111-1111-4111-8111-111111111111','fixture-audit','Fixture audit provider','fixture-audit','Fixture metadata audit','Fixture','Fixture','image','unknown',$1::jsonb,'fixture') ON CONFLICT DO NOTHING`,[JSON.stringify(metadata)]);
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
 // These routes own filters on the client; changing them must compose against
 // the live URL without a redundant server-component navigation.
 const filtersPage=await context.newPage(),rsc=[];filtersPage.on('pageerror',error=>errors.push(error.message));
 filtersPage.on('request',request=>{const url=new URL(request.url());if(['/admin/tenants','/admin/creations'].includes(url.pathname)&&url.searchParams.has('_rsc'))rsc.push(url.pathname)});
 await filtersPage.goto(origin+'/admin/tenants?keep=1#section');await filtersPage.getByLabel('搜索企业名称或负责人').waitFor();rsc.length=0;
 const tenantSearch=filtersPage.waitForResponse(response=>response.url().includes('/api/admin/tenants?')&&new URL(response.url()).searchParams.get('q')==='north');
 await filtersPage.getByLabel('搜索企业名称或负责人').fill('north');assert.ok((await tenantSearch).ok());
 const tenantStatus=filtersPage.waitForResponse(response=>response.url().includes('/api/admin/tenants?')&&new URL(response.url()).searchParams.get('status')==='active');
 await filtersPage.getByLabel('租户状态').selectOption('active');assert.ok((await tenantStatus).ok());
 let filtered=new URL(filtersPage.url());assert.equal(filtered.searchParams.get('q'),'north');assert.equal(filtered.searchParams.get('status'),'active');assert.equal(filtered.hash,'#section');assert.equal(rsc.length,0);
 await filtersPage.reload();assert.equal(await filtersPage.getByLabel('搜索企业名称或负责人').inputValue(),'north');checks.push('Actual Next History: tenant filters compose, survive reload, zero filter RSC navigations');
 await filtersPage.goto(origin+'/admin/creations?creationId=missing&assetPage=2&keep=1#section');await filtersPage.getByLabel('搜索创作记录').waitFor();rsc.length=0;
 const creationSearch=filtersPage.waitForResponse(response=>response.url().includes('/api/admin/creations?')&&new URL(response.url()).searchParams.get('q')==='scene');
 await filtersPage.getByLabel('搜索创作记录').fill('scene');assert.ok((await creationSearch).ok());
 await filtersPage.locator('summary').filter({hasText:'筛选'}).click();
 const memberSearch=filtersPage.waitForResponse(response=>response.url().includes('/api/admin/creations?')&&new URL(response.url()).searchParams.get('user')==='fixture-01@example.test');
 await filtersPage.getByLabel('成员账号').fill('fixture-01@example.test');assert.ok((await memberSearch).ok());
 filtered=new URL(filtersPage.url());assert.equal(filtered.searchParams.get('q'),'scene');assert.equal(filtered.searchParams.get('user'),'fixture-01@example.test');assert.equal(filtered.searchParams.get('keep'),'1');assert.equal(filtered.hash,'#section');assert.equal(filtered.searchParams.has('creationId'),false);assert.equal(filtered.searchParams.has('assetPage'),false);assert.equal(rsc.length,0);
 await filtersPage.screenshot({path:path.join(out,'creation-filters.png'),fullPage:true});await filtersPage.close();checks.push('Actual Next History: creation/member filters compose and clear prior detail without RSC');
 const detailsPage=await context.newPage();detailsPage.on('pageerror',error=>errors.push(error.message));
 await detailsPage.goto(origin+'/admin/center?section=conversations&period=all');
 await detailsPage.route('**/api/admin/bi/conversation?**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"fixture failure"}'}));
 await detailsPage.getByRole('button',{name:'查看',exact:true}).first().click();await detailsPage.getByText('无法读取对话内容',{exact:true}).waitFor();
 await detailsPage.unroute('**/api/admin/bi/conversation?**');await detailsPage.getByRole('button',{name:'重试',exact:true}).click();await detailsPage.getByText('Actual conversation retry evidence',{exact:true}).waitFor();
 await detailsPage.screenshot({path:path.join(out,'conversation-retry.png'),fullPage:true});checks.push('Conversation 503 retry recovers actual authorized database messages');
 await detailsPage.goto(origin+'/admin/model-management/library');await detailsPage.getByText('Fixture metadata audit',{exact:true}).waitFor();
 await detailsPage.route('**/api/admin/model-management/library?**',route=>route.fulfill({status:403,contentType:'text/html',body:'<h1>Denied</h1>'}));
 await detailsPage.getByRole('button',{name:'刷新元数据库'}).click();await detailsPage.getByRole('alert').filter({hasText:'读取失败'}).waitFor();assert.equal(await detailsPage.getByText('Fixture metadata audit',{exact:true}).count(),0);assert.equal(await detailsPage.getByRole('button',{name:'导出当前页'}).isDisabled(),true);
 await detailsPage.screenshot({path:path.join(out,'library-denied.png'),fullPage:true});await detailsPage.unroute('**/api/admin/model-management/library?**');await detailsPage.getByRole('button',{name:'刷新元数据库'}).click();await detailsPage.getByText('Fixture metadata audit',{exact:true}).waitFor();
 const downloadPromise=detailsPage.waitForEvent('download');await detailsPage.getByRole('button',{name:'导出当前页'}).click();const download=await downloadPromise;
 const exported=JSON.parse(await fs.readFile(await download.path(),'utf8')),record=exported.models.find(row=>row.modelId==='fixture-audit');assert.equal(record.notes,metadata.notes);assert.equal(record.parameterMetadata.fixtureEvidence,'FULL_EXPORT');
 await detailsPage.close();checks.push('Library non-JSON 403 clears rows; recovery and full export preserve metadata');
 // Deliberately fail a different page; its label must not borrow page 2 rows.
 await page.route('**/api/admin/usage?**',route=>new URL(route.request().url()).searchParams.get('page')==='3'
   ?route.fulfill({status:503,contentType:'application/json',body:'{"error":"fixture transient failure"}'}) :route.continue());
 await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByRole('alert').filter({hasText:'读取用量失败'}).waitFor();assert.equal(await page.locator('tbody tr').count(),0);
 await page.screenshot({path:path.join(out,'failed-page.png'),fullPage:true});await page.unroute('**/api/admin/usage?**');
 const recovered=page.waitForResponse(response=>response.url().includes('/api/admin/usage?')&&new URL(response.url()).searchParams.get('page')==='3'&&response.ok());
 await page.getByRole('button',{name:'刷新',exact:true}).click();await recovered;await page.getByRole('button',{name:'查看明细',exact:true}).first().waitFor();
 assert.ok(await page.locator('tbody tr').count()>0);checks.push('Different-page 503 clears stale rows; retry recovers actual page 3');
 await context.request.delete(origin+'/api/admin/login');await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByRole('alert').filter({hasText:'读取用量失败'}).waitFor();
 assert.equal(await page.locator('tbody tr').count(),0);checks.push('Expired admin session clears retained same-page results');
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify({checks,errors,requests,realNext:true,realPostgres:true,productionWrites:0,supplierCalls:0},null,2));console.log('ADMIN_QUERY_RUNTIME=PASS '+JSON.stringify(checks));
}catch(error){if(page){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({errors,requests,url:page.url(),text:await page.locator('body').innerText()},null,2));}throw error;}
finally{await browser?.close();server.kill();await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve)});await pool.end();await fs.writeFile(path.join(out,'server.log'),logs);}
