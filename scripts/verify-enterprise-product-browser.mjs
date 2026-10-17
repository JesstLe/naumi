// Isolated browser fallback when collaborative screenshot automation times out.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const out=resolve(process.env.NAUMI_INTEGRATION_EVIDENCE_DIR||'output/enterprise-product-browser');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:18482/preview.html?v=4',{waitUntil:'networkidle'});
 await page.locator('.sidebar').waitFor();
 await page.screenshot({path:resolve(out,'PRODUCT_DASHBOARD.png'),fullPage:true});
 await page.locator('.sidebar [data-view="schedule"]').click();
 await page.locator('#scDesign').waitFor();
 await page.screenshot({path:resolve(out,'PRODUCT_SCHEDULE.png'),fullPage:true});
 const before=await page.evaluate(()=>JSON.stringify({...localStorage}));
 await page.locator('.sidebar [data-view="assets"]').click();
 await page.locator('[data-source-tab="naumi"]').click();
 await page.locator('.source-table tbody tr').first().waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-source-image] img')].length===2&&[...document.querySelectorAll('[data-source-image] img')].every(i=>i.complete&&i.naturalWidth>0));
 await page.screenshot({path:resolve(out,'PRODUCT_NAUMI.png'),fullPage:true});
 await page.locator('[data-source-kind="generations"]').click();
 await page.waitForFunction(()=>sourceState.data?.kind==='generations');
 const desktop=await page.evaluate(()=>({url:location.href,viewer:sourceState.context.viewer.email,rows:sourceState.data.rows.length,charged:sourceState.data.rows.find(r=>r.account.email==='staff@fixture.invalid').credits.charged,unknown:sourceState.data.rows.find(r=>r.account.email==='manager@fixture.invalid').credits.charged,adminEntry:document.body.innerHTML.includes('/admin/enterprise-workbench'),overflow:document.documentElement.scrollWidth>innerWidth}));
 await page.screenshot({path:resolve(out,'PRODUCT_GENERATIONS.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);
 const mobile=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,source:!!document.querySelector('.source-table'),sidebarRight:document.querySelector('.sidebar').getBoundingClientRect().right}));
 await page.screenshot({path:resolve(out,'PRODUCT_MOBILE.png'),fullPage:true});
 const unchanged=before===await page.evaluate(()=>JSON.stringify({...localStorage}));
 if(errors.length||desktop.overflow||desktop.adminEntry||desktop.rows!==2||desktop.charged!==6||desktop.unknown!==null||mobile.scroll>390||!unchanged)throw Error(JSON.stringify({errors,desktop,mobile,unchanged}));
 await writeFile(resolve(out,'PRODUCT_BROWSER.json'),JSON.stringify({desktop,mobile,storageUnchanged:unchanged,errors},null,2)+'\n');
 console.log('PRODUCT_BROWSER_PASS: original_url=18482 original_shell=1 schedule=1 source_rows=2 charged=6 missing=null mobile=390 storage_unchanged=1 errors=0');
}finally{await browser.close();}
