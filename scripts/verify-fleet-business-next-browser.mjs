/** Real Next UI/API and independent PG connector. Reuses the explicitly named
 * central integration fixtures, never resets or connects to a production host. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium,expect} from '@playwright/test';

const config=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const origin=new URL(config.origin);
assert.ok(origin.protocol==='http:'&&origin.hostname==='127.0.0.1'&&origin.port&&origin.pathname==='/');
const fixture=JSON.parse(await fs.readFile(config.fixtureFile,'utf8'));
assert.equal(new URL(fixture.source).pathname,'/fleet_source_47_20261104');
assert.equal(new URL(fixture.source).hostname,'127.0.0.1');
assert.equal(new URL(fixture.central).pathname,'/fleet_central_103_20261104');
const output=path.resolve(config.outputDir);await fs.mkdir(output,{recursive:true});
const record={layer:'isolated-real-Next-UI-API-dual-PG-HTTP-connector',result:'RUNNING',checks:[],pageErrors:[],screenshots:[],ticks:0,businessWrites:0,paidCalls:0};
async function tick(){
  const child=spawn(process.execPath,['--import','tsx','--conditions','react-server','scripts/verify-fleet-business-worker.ts'],{cwd:process.cwd(),env:{...process.env,...fixture.env,DATABASE_URL:fixture.source},stdio:['pipe','pipe','pipe']});
  let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
  child.stdin.end(JSON.stringify({mode:'tick',options:{central:origin.origin,instanceId:fixture.instance.id,token:fixture.instance.token,status:{source:'a'.repeat(40),version:'fixture',storage:'s3',nas:'unknown',connector:1,business:1}}}));
  const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});assert.equal(exit,0,err||out);record.ticks++;return JSON.parse(out.trim());
}
const browser=await chromium.launch({headless:true,channel:config.channel||'msedge'});
try{
  await tick();
  const context=await browser.newContext({viewport:{width:1440,height:1080},reducedMotion:'reduce'});
  const cookie=(await fs.readFile(fixture.cookieFile,'utf8')).trim();
  await context.addCookies(cookie.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const at=v.indexOf('=');return{name:v.slice(0,at),value:v.slice(at+1),url:origin.origin,httpOnly:true,sameSite:'Lax'}}));
  const page=await context.newPage();page.on('pageerror',error=>record.pageErrors.push(error.message));
  const responses=[];page.on('response',async response=>{if(response.url().includes('/api/admin/business')){const body=await response.json().catch(()=>null);responses.push({status:response.status(),body});}});
  async function settled(view,expected){
    await expect.poll(async()=>{
      const latest=responses.filter(r=>r.body?.query?.view===view).at(-1);
      if(latest?.status===200&&latest.body.complete)return latest.body.sources.reduce((n,s)=>n+s.data.totals.credits,0);
      await tick();return null;
    },{timeout:90000,intervals:[500,1000,2000]}).toBe(expected);
  }
  await page.goto(origin.origin+'/admin/usage',{waitUntil:'domcontentloaded'});
  await settled('usage',49);
  await expect(page.locator('[data-metric="消费积分"]')).toHaveText('49');
  await expect(page.locator('[data-metric="退回积分"]')).toHaveText('5');
  await expect(page.locator('[data-metric="当前余额"]')).toHaveText('288');
  record.checks.push('actual_next_49_equals_7_plus_42','actual_refund_5_separate','actual_wallet_93_plus_195_not_merged');
  await expect(page.locator('[data-account-identity]')).toHaveCount(5);
  await expect(page.locator(`tbody[data-source-id="${fixture.instance.id}"]`)).toContainText('same@fixture.test');
  record.checks.push('same_email_separate_source_rows_native_root_auth');
  await page.screenshot({path:path.join(output,'actual-next-dual-pg-desktop.png'),fullPage:true});
  record.screenshots.push(path.join(output,'actual-next-dual-pg-desktop.png'));
  responses.length=0;await page.getByRole('combobox',{name:'数据站点'}).selectOption(fixture.instance.id);
  await settled('usage',42);
  await expect(page.locator('[data-metric="消费积分"]')).toHaveText('42');
  record.checks.push('actual_47_site_filter_42');
  for(const [label,view]of [['用户','users'],['订单','orders'],['账务','ledger'],['作品','creations']]){
    responses.length=0;await page.getByRole('button',{name:label,exact:true}).click();await settled(view,42);
    await expect(page.getByRole('region',{name:label+'明细',exact:true})).toBeVisible();
  }
  record.checks.push('all_five_actual_next_views_receive_independent_pg_ack');
  responses.length=0;await page.goto(origin.origin+'/admin/center?section=ledger',{waitUntil:'domcontentloaded'});
  await settled('ledger',49);await expect(page.getByRole('heading',{name:'积分流水',exact:true})).toBeVisible();
  await page.screenshot({path:path.join(output,'actual-next-ledger-desktop.png'),fullPage:true});record.screenshots.push(path.join(output,'actual-next-ledger-desktop.png'));
  record.checks.push('existing_ledger_entry_uses_actual_cross_site_receipts');
  assert.deepEqual(record.pageErrors,[]);record.result='PASS';
  console.log('FLEET_BUSINESS_NEXT_BROWSER=PASS checks='+record.checks.length+' REAL_PG=2 REAL_NEXT=1 API_FIXTURES=0 BUSINESS_WRITES=0 PAID_CALLS=0');
}catch(error){record.result='FAIL';record.error=String(error?.stack||error);throw error;}
finally{await fs.writeFile(path.join(output,'RESULT.json'),JSON.stringify(record,null,2)+'\n');await browser.close();}
