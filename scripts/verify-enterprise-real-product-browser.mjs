/** Product-mode browser acceptance. Writes require an explicit isolated-fixture environment. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=createRequire(process.env.ENTERPRISE_BROWSER_PACKAGE||new URL('../package.json',import.meta.url))('playwright');
const url=new URL(process.env.REAL_PRODUCT_TEST_URL||'http://127.0.0.1:18482/preview.html?v=4');
assert.equal(url.hostname,'127.0.0.1');
const writes=process.env.REAL_PRODUCT_TEST_WRITES==='isolated';
if(writes)assert(!['18482','18561'].includes(url.port),'WRITE_FIXTURE_PORT_REQUIRED');
const out=resolve(process.env.REAL_PRODUCT_EVIDENCE||'output/enterprise-real-product-browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});let checks=0;
const ok=v=>{assert(v);checks++;};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],writeRequests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writeRequests.push(new URL(r.url()).pathname);});
 const oldDemo={schema:1,nextId:50,requirements:[{id:'legacy-only',title:'STALE_DEMO_MUST_NOT_APPEAR'}],tasks:[],facts:[],activity:[],filters:{}};
 await page.addInitScript(value=>localStorage.setItem('naumi-enterprise-demo-v1',JSON.stringify(value)),oldDemo);
 await page.goto(url.href,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.EnterpriseRealProduct?.loaded&&!globalThis.EnterpriseRealProduct?.loading,null,{timeout:20000});
 ok(await page.evaluate(()=>REAL_PRODUCT&&state.requirements.length===0&&state.tasks.length===0&&state.facts.length===0));
 ok(await page.evaluate(()=>EnterpriseRealProduct.counts().records===364&&EnterpriseRealProduct.counts().named===333));
 ok(await page.locator('.rp-stats').textContent().then(t=>t.includes('364')&&t.includes('102')&&t.includes('223')));
 ok(await page.locator('#roleSelect').isDisabled());
 const noDemo=async()=>{ok((await page.locator('[data-intake-mode="demo"],[data-import-mode="demo"],[data-people-mode="demo"],[data-action="reset"],[data-role]').count())===0);ok(!(await page.locator('body').innerText()).includes('STALE_DEMO_MUST_NOT_APPEAR'));};await noDemo();
 await page.screenshot({path:resolve(out,'REAL_DASHBOARD.png')});
 const nav=async target=>{await page.locator(`.sidebar [data-view="${target}"]`).click();await noDemo();};
 await nav('requirements');ok(await page.locator('.rp-records tbody tr').count()===30);ok(await page.locator('.source-pager').textContent().then(t=>t.includes('364')));
 await page.waitForFunction(()=>[...document.querySelectorAll('.rp-image img')].filter(img=>img.getBoundingClientRect().top<innerHeight).every(img=>img.complete&&img.naturalWidth>0),null,{timeout:15000});await page.screenshot({path:resolve(out,'REAL_REQUIREMENTS.png')});
 await page.locator('[data-rp-status="1"]').click();ok(await page.locator('.rp-records tbody tr').count()===5);ok(await page.locator('.rp-records tbody').textContent().then(t=>t.includes('进行中')));
 await page.locator('[data-rp-status="0"]').click();await page.locator('#rpNext').click();ok(await page.locator('.source-pager').textContent().then(t=>t.includes('2 / 13')));await page.locator('#rpPrevious').click();
 const record=await page.evaluate(()=>{const row=sheetGrid.doc.rows.find(r=>!r.archived&&String(r.cells.title||'').trim());return {id:row.id,title:row.cells.title};});
 await page.locator('#rpSearch [name="query"]').fill(record.title);await page.locator('#rpSearch button').first().click();ok(await page.locator('.rp-records tbody').textContent().then(t=>t.includes(record.title)));
 await page.locator(`[data-rp-row="${record.id}"]`).first().click();await page.locator('#sgEditRow').waitFor();ok(await page.locator('#sgDeleteRow').isVisible());await page.locator('#sgEditRow').click();ok(await page.locator('#sgRowForm [name="title"]').inputValue()===record.title);await page.locator('.overlay [data-close]').first().click();
 await nav('tasks');ok(await page.locator('.rp-records tbody tr').count()===30);await page.screenshot({path:resolve(out,'REAL_TASKS.png')});
 await page.locator('#rpMode').click();ok(await page.locator('.rp-card').count()===30);await page.locator('#rpMode').click();
 await nav('schedule');await page.locator('.sg-page').waitFor();ok(await page.locator('[data-sg-row]').count()>=40);ok(await page.locator('#sgCreate').isVisible());ok(await page.locator('[data-sg-header="title"]').isVisible());await page.screenshot({path:resolve(out,'REAL_SCHEDULE.png')});
 await nav('team');ok(await page.locator('#peopleProfiles').textContent().then(t=>t.includes('58')));await noDemo();
 await nav('performance');ok(await page.locator('.content').textContent().then(t=>t.includes('没有经过独立验收')));ok(await page.locator('.content [data-task]').count()===0);
 await nav('rules');ok(await page.locator('[data-action="route-test"]').count()===0);
 await nav('assets');await page.waitForFunction(()=>sourceState.data?.rows.length===25&&!sourceState.loading);await page.waitForFunction(()=>document.querySelectorAll('[data-source-image]:not(:disabled) img').length===25,null,{timeout:30000});ok(await page.locator('[data-source-tab="local"]').count()===0);ok(!(await page.locator('.footer-caption').textContent()).includes('演示数据'));
 await nav('requirements');
 const restoreSource=await page.evaluate(()=>peopleMapping.source.sourceHash);
 await page.evaluate(()=>{peopleMapping.source={...peopleMapping.source,sourceHash:'foreign-source'};peopleMapping.profiles=peopleMapping.profiles.map(p=>({...p,nickname:'CROSS_SOURCE_NAME_MUST_NOT_APPEAR'}));shell();});
 ok(!(await page.locator('.rp-records tbody').textContent()).includes('CROSS_SOURCE_NAME_MUST_NOT_APPEAR'));
 await page.evaluate(value=>{peopleMapping.source.sourceHash=value;},restoreSource);
 // Keep an editing form alive while only the optional people request fails.
 let releasePeople;const peopleGate=new Promise(resolve=>{releasePeople=resolve;});
 const failPeople=async route=>{if(new URL(route.request().url()).searchParams.get('action')!=='people')return route.continue();await peopleGate;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'TEST_PEOPLE_UNAVAILABLE'})});};
 await page.route('**/api/enterprise/imports?*',failPeople);await nav('schedule');await page.locator('#importRefresh').click();await page.waitForFunction(()=>!!sheetGrid.doc&&EnterpriseRealProduct.loading);await page.locator('[data-sg-edit][data-sg-col="title"]').first().click();await page.locator('#sgCellForm [name="value"]').fill('UNSAVED_INPUT_PRESERVED_ON_PEOPLE_FAILURE');releasePeople();await page.waitForFunction(()=>!EnterpriseRealProduct.loading);ok(await page.evaluate(()=>EnterpriseRealProduct.loaded&&!!sheetGrid.doc&&sgEditCurrent(sgEditSession)));ok(await page.locator('#sgCellForm [name="value"]').inputValue()==='UNSAVED_INPUT_PRESERVED_ON_PEOPLE_FAILURE');
 let prompted=false;page.once('dialog',async dialog=>{prompted=true;await dialog.dismiss();});await page.locator('.overlay [data-close]').first().click();ok(prompted&&await page.locator('#sgCellForm').isVisible());page.once('dialog',dialog=>dialog.accept());await page.locator('.overlay [data-close]').first().click();await page.unroute('**/api/enterprise/imports?*',failPeople);await nav('requirements');await page.locator('[data-rp-refresh]').first().click();await page.waitForFunction(()=>EnterpriseRealProduct.loaded&&!EnterpriseRealProduct.loading);
 const failWorksheet=route=>{const query=new URL(route.request().url()).searchParams;if(query.get('action')==='worksheet')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'TEST_SOURCE_UNAVAILABLE'})});return route.continue();};
 await page.route('**/api/enterprise/imports?*',failWorksheet);await page.locator('[data-rp-refresh]').first().click();await page.waitForFunction(()=>!EnterpriseRealProduct.loading&&!!EnterpriseRealProduct.error);ok(await page.locator('[data-rp-row]').count()===0);await noDemo();await page.unroute('**/api/enterprise/imports?*',failWorksheet);await page.locator('[data-rp-refresh]').first().click();await page.waitForFunction(()=>EnterpriseRealProduct.loaded&&!EnterpriseRealProduct.loading);ok(await page.evaluate(()=>EnterpriseRealProduct.counts().records===364));
 if(writes){
  await nav('requirements');if(await page.locator('#rpClear').count())await page.locator('#rpClear').click();await page.locator('[data-rp-create]').click();const title='G73_ISOLATED_CRUD_'+Date.now();await page.locator('#sgRowForm [name="title"]').fill(title);await page.locator('[form="sgRowForm"]').click();await page.waitForFunction(()=>EnterpriseRealProduct.counts().records===365);checks++;
  await page.locator('#rpSearch [name="query"]').fill(title);await page.locator('#rpSearch button').first().click();await page.locator('[data-rp-row]').first().click();await page.locator('#sgEditRow').click();await page.locator('#sgRowForm [name="status"]').fill('进行中');await page.locator('[form="sgRowForm"]').click();await page.waitForFunction(title=>sheetGrid.doc.rows.some(r=>r.cells.title===title&&r.cells.status==='进行中'),title);checks++;
  await nav('tasks');await page.locator('#rpSearch [name="query"]').fill(title);await page.locator('#rpSearch button').first().click();ok(await page.locator('.rp-records tbody').textContent().then(t=>t.includes(title)&&t.includes('进行中')));
  await page.reload();await page.waitForFunction(()=>EnterpriseRealProduct.loaded&&!EnterpriseRealProduct.loading);ok(await page.evaluate(title=>sheetGrid.doc.rows.some(r=>r.cells.title===title&&r.cells.status==='进行中'),title));
  await nav('requirements');await page.locator('#rpSearch [name="query"]').fill(title);await page.locator('#rpSearch button').first().click();await page.locator('[data-rp-row]').first().click();await page.locator('#sgDeleteRow').click();await page.locator('[form="sgDeleteForm"]').click();await page.waitForFunction(()=>EnterpriseRealProduct.counts().records===364);checks++;
 }
 await nav('requirements');if(await page.locator('#rpClear').count())await page.locator('#rpClear').click();await page.locator('[data-rp-status="0"]').click();
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(out,'REAL_REQUIREMENTS_MOBILE.png')});
 ok(await page.evaluate(value=>localStorage.getItem('naumi-enterprise-demo-v1')===JSON.stringify(value),oldDemo));ok(errors.length===0);if(!writes)ok(writeRequests.length===0);
 await writeFile(resolve(out,'BROWSER.json'),JSON.stringify({checks,errors,writeRequests:writeRequests.length,writesIsolated:writes,realRows:364,legacyDemoIgnored:true},null,2));
 console.log(`REAL_WORKSPACE_BROWSER_PASS: checks=${checks} real_rows=364 named=333 demo_records=0 stale_storage_ignored=1 source_status_preserved=1 shared_worksheet=1 crud=${writes?'isolated':'not-run'} mobile=390 errors=0 business_writes=${writes?'isolated-only':'0'}`);
}finally{await browser.close();}
