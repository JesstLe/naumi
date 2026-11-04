/** Real Next UI/API admission HOLD, with independent fixture PG/connector.
 * Positive 7/42/49 retained-row integration is a separate verifier. This runner
 * never seeds business rows, intercepts API replies, or enables public admission. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium,expect} from '@playwright/test';
import {Pool} from 'pg';

const config=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const origin=new URL(config.origin);
assert.ok(origin.protocol==='http:'&&origin.hostname==='127.0.0.1'&&origin.port&&origin.pathname==='/');
const fixture=JSON.parse(await fs.readFile(config.fixtureFile,'utf8'));
assert.equal(new URL(fixture.source).pathname,'/fleet_source_47_20261104');
assert.equal(new URL(fixture.source).hostname,'127.0.0.1');
assert.equal(new URL(fixture.central).pathname,'/fleet_central_103_20261104');
assert.equal(new URL(fixture.central).hostname,'127.0.0.1');
assert.equal(new URL(fixture.central).port,'65298');assert.equal(new URL(fixture.source).port,'65298');
assert.equal(fixture.env.NAUMI_VERIFY_ISOLATED_DB,'1');
const output=path.resolve(config.outputDir);await fs.mkdir(output,{recursive:true});
const HOLD='跨站业务查询仍处于兼容准备阶段',DAYS=90;
const central=new Pool({connectionString:fixture.central,max:1});
const commandIds=async()=>(await central.query("SELECT id FROM app_fleet_commands WHERE operation->>'type'='business.query' ORDER BY id")).rows.map(r=>r.id);
const record={layer:'isolated-real-Next-UI-API-admission-HOLD-central-PG-connector',publicBusinessAdmission:'HOLD',positiveRemoteData:'not supplied or seeded by this runner',sourceDatabaseQueried:false,result:'RUNNING',checks:[],pageErrors:[],screenshots:[],ticks:0,businessWrites:0,paidCalls:0};
async function tick(){
  const child=spawn(process.execPath,['--import','tsx','--conditions','react-server','scripts/verify-fleet-business-worker.ts'],{cwd:process.cwd(),env:{...process.env,...fixture.env,DATABASE_URL:fixture.source},stdio:['pipe','pipe','pipe']});
  let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
  child.stdin.end(JSON.stringify({mode:'tick',options:{central:origin.origin,instanceId:fixture.instance.id,token:fixture.instance.token,status:{source:'a'.repeat(40),version:'fixture',storage:'s3',nas:'unknown',connector:1,business:1}}}));
  const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});assert.equal(exit,0,err||out);record.ticks++;return JSON.parse(out.trim());
}
const browser=await chromium.launch({headless:true,channel:config.channel||'msedge'});
try{
  assert.equal((await central.query('SELECT current_database() AS name')).rows[0].name,'fleet_central_103_20261104');
  const beforeCommands=await commandIds();
  assert.equal((await central.query("SELECT count(*)::int n FROM app_fleet_commands WHERE instance_id=$1 AND operation->>'type'='business.query' AND (operation->>'days')::int=$2",[fixture.instance.id,DAYS])).rows[0].n,0,'HOLD browser window must have no preexisting retained rows to mask admission');
  await tick();
  const context=await browser.newContext({viewport:{width:1440,height:1080},reducedMotion:'reduce'});
  const cookie=(await fs.readFile(fixture.cookieFile,'utf8')).trim();
  await context.addCookies(cookie.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const at=v.indexOf('=');return{name:v.slice(0,at),value:v.slice(at+1),url:origin.origin,httpOnly:true,sameSite:'Lax'}}));
  const page=await context.newPage();page.on('pageerror',error=>record.pageErrors.push(error.message));
  const responses=[];page.on('response',async response=>{if(response.url().includes('/api/admin/business')){const body=await response.json().catch(()=>null);responses.push({status:response.status(),body});}});
  async function held(view,selection='all'){
    await expect.poll(async()=>{
      const latest=responses.filter(r=>r.body?.query?.view===view).at(-1);
      if(latest?.status!==200||latest.body.complete!==false)return false;
      const remote=latest.body.sources.find(s=>s.id===fixture.instance.id),local=latest.body.sources.find(s=>s.id==='local');
      return remote?.status==='unknown'&&remote.error===HOLD&&!Object.hasOwn(remote,'data')
        &&(selection==='all'?local?.status==='succeeded'&&local.data?.totals.credits===7:latest.body.sources.length===1&&!local);
    },{timeout:30000,intervals:[250,500,1000]}).toBe(true);
    const metric=view==='users'?'账户数量':view==='creations'?'当前作品':'消费积分';
    await expect(page.locator(`[data-metric="${metric}"]`)).toHaveText('—');
    await expect(page.getByRole('status').filter({hasText:HOLD}).first()).toBeVisible();
    await expect(page.locator(`tbody[data-source-id="${fixture.instance.id}"] [data-account-identity]`)).toHaveCount(0);
  }
  await page.goto(origin.origin+'/admin/usage?days='+DAYS,{waitUntil:'domcontentloaded'});
  await held('usage');
  await expect(page.locator('[data-metric="退回积分"]')).toHaveText('—');
  await expect(page.locator('[data-metric="当前余额"]')).toHaveText('—');
  await expect(page.locator('tbody[data-source-id="local"]')).toContainText('same@fixture.test');
  record.checks.push('actual_public_remote_unknown_preparation_hold_without_data','incomplete_global_metrics_not_49_zero_or_merged_wallet','actual_local_source_credits7_preserved_with_native_root_auth');
  await page.screenshot({path:path.join(output,'actual-next-admission-hold-desktop.png'),fullPage:true});
  record.screenshots.push(path.join(output,'actual-next-admission-hold-desktop.png'));
  responses.length=0;await page.getByRole('combobox',{name:'数据站点'}).selectOption('local');
  await expect.poll(()=>responses.at(-1)?.body?.complete===true&&responses.at(-1)?.body?.sources.length===1&&responses.at(-1)?.body?.sources[0].id==='local',{timeout:30000}).toBe(true);
  await expect(page.locator('[data-metric="消费积分"]')).toHaveText('7');
  record.checks.push('actual_local_only_query_remains_complete_and_credits7');
  responses.length=0;await page.getByRole('combobox',{name:'数据站点'}).selectOption(fixture.instance.id);
  await held('usage',fixture.instance.id);
  record.checks.push('actual_remote_only_query_is_hold_without_42_or_zero');
  for(const [label,view]of [['用户','users'],['订单','orders'],['账务','ledger'],['作品','creations']]){
    responses.length=0;await page.getByRole('button',{name:label,exact:true}).click();await held(view,fixture.instance.id);
    await expect(page.getByRole('region',{name:label+'明细',exact:true})).toBeVisible();
  }
  record.checks.push('all_five_actual_remote_views_preserve_public_admission_hold');
  responses.length=0;await page.goto(origin.origin+'/admin/center?section=ledger&days='+DAYS,{waitUntil:'domcontentloaded'});
  await held('ledger');await expect(page.getByRole('heading',{name:'积分流水',exact:true})).toBeVisible();
  await page.screenshot({path:path.join(output,'actual-next-ledger-hold-desktop.png'),fullPage:true});record.screenshots.push(path.join(output,'actual-next-ledger-hold-desktop.png'));
  record.checks.push('existing_ledger_entry_preserves_local7_and_remote_hold');
  const afterCommands=await commandIds();assert.deepEqual(afterCommands,beforeCommands,'real UI/API must create zero new business rows');
  record.newBusinessRows=0;record.localCredits=7;record.remoteDataPresent=false;
  record.checks.push('actual_central_business_command_identity_set_unchanged');
  assert.deepEqual(record.pageErrors,[]);record.result='PASS';
  console.log('FLEET_BUSINESS_NEXT_BROWSER=PASS checks='+record.checks.length+' REAL_PG=1 REAL_NEXT=1 SOURCE_CONNECTOR=1 API_FIXTURES=0 NEW_BUSINESS_ADMISSION=HOLD LOCAL=7 REMOTE_DATA=ABSENT NEW_BUSINESS_ROWS=0 BUSINESS_WRITES=0 PAID_CALLS=0');
}catch(error){record.result='FAIL';record.error=String(error?.stack||error);throw error;}
finally{try{await fs.writeFile(path.join(output,'RESULT.json'),JSON.stringify(record,null,2)+'\n');}finally{await Promise.all([browser.close(),central.end()]);}}
