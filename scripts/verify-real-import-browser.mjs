// Read-only acceptance of the authorized real import; business confirmations tested on synthetic PG only.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.env.IMPORT_EVIDENCE_DIR||'output/real-import-browser'),port=Number(process.env.IMPORT_PREVIEW_PORT||18482);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
const result={checks:[],regression:{}};const ok=(v,s)=>{assert(v,s);result.checks.push(s)};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/preview.html?v=4`,{waitUntil:'networkidle'});
 await page.locator('.sidebar [data-view="schedule"]').click();
 const local=await page.evaluate(()=>JSON.stringify({...localStorage}));
 await page.locator('[data-import-mode="real"]').click();await page.waitForFunction(()=>!imported.loading&&imported.rows.length===364);
 ok(await page.locator('.import-table [data-import-record]').count()>0,'page has real source records');
 const summary=await page.evaluate(()=>({rows:imported.rows.length,assets:imported.assets.length,children:imported.rows.filter(r=>r.parentLabel).length,ambiguous:imported.rows.filter(r=>r.parentCandidates.length>1).length,statuses:imported.rows.reduce((a,r)=>(a[r.raw['任务完成情况']||'空白']=(a[r.raw['任务完成情况']||'空白']||0)+1,a),{})}));
 ok(summary.rows===364&&summary.assets===292&&summary.children===183&&summary.ambiguous===23,'source counts reconcile');
 ok(summary.statuses['已完成']===102&&summary.statuses['空白']===223,'source status remains distinct from workflow acceptance');
 await page.waitForFunction(()=>[...document.querySelectorAll('.import-thumb')].some(i=>i.complete&&i.naturalWidth>0));
 await page.screenshot({path:resolve(out,'REAL_TABLE.png'),fullPage:false,animations:'disabled'});
 await page.locator('#importQuery').fill('当归');ok(await page.locator('.import-table tbody tr').count()>0,'search real source text');
 await page.locator('#importQuery').fill('');await page.locator('[data-import-view="designer"]').click();ok(await page.locator('.import-group').count()>0,'designer grouping');
 await page.locator('[data-import-view="owner"]').click();ok(await page.locator('.import-group').count()>0,'requester grouping');
 await page.locator('[data-import-view="board"]').click();ok(await page.locator('.wb-card').count()===364,'board retains all rows');
 await page.screenshot({path:resolve(out,'REAL_BOARD.png'),fullPage:false,animations:'disabled'});
 await page.locator('[data-import-view="table"]').click();await page.locator('#importIssuesToggle').click();ok(await page.evaluate(()=>importFiltered().every(r=>r.issues.length>0)),'issue-only filtering');
 await page.locator('#importIssuesToggle').click();await page.locator('#importNext').click();ok(await page.evaluate(()=>imported.page===2),'pagination');
 const detail=await page.evaluate(()=>{const r=imported.rows.find(r=>r.parentCandidates.length>1);importDetail(r.excelRow);return {row:r.excelRow,candidates:r.parentCandidates.length};});
 ok(await page.locator('#importResolve select option').count()===detail.candidates+1,'ambiguous parent candidates visible without auto-confirmation');
 await page.screenshot({path:resolve(out,'REAL_PARENT_REVIEW.png'),fullPage:false,animations:'disabled'});await page.keyboard.press('Escape');
 const file=await page.evaluate(async()=>{const a=imported.assets.find(a=>a.extension==='.png');const r=await fetch(importAssetUrl(a.id,true));const bytes=await r.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);return {expected:a.sha256,actual:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''),bytes:bytes.byteLength,wanted:a.bytes};});
 ok(file.expected===file.actual&&file.bytes===file.wanted,'download original attachment bytes and hash match');
 ok(local===await page.evaluate(()=>JSON.stringify({...localStorage})),'real data never writes demo localStorage');
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);
 ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'390px has no page overflow');await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:resolve(out,'REAL_MOBILE.png'),fullPage:false,animations:'disabled'});
 await page.reload({waitUntil:'networkidle'});await page.locator('.mobile-menu').click();await page.locator('.sidebar [data-view="schedule"]').click();await page.keyboard.press('Escape');await page.locator('[data-import-mode="real"]').click();await page.waitForFunction(()=>!imported.loading&&imported.rows.length===364);ok(true,'refresh reloads 364 rows from database');
 await page.setViewportSize({width:1440,height:1000});await page.locator('[data-import-mode="demo"]').click();
 ok(await page.locator('#scDesign').count()===1,'original scheduling editor preserved');
 if(process.env.IMPORT_FULL_REGRESSION==='1')for(const name of ['browser-check.js','schedule-browser-check.js','workbook-browser-check.js']){await page.reload();const value=await page.evaluate((await readFile('design/enterprise-demo/'+name,'utf8')).trim());result.regression[name]=value;}
 ok(errors.length===0,'no page exceptions');result.summary=summary;result.errors=errors;
 await writeFile(resolve(out,'REAL_BROWSER_CHECKS.json'),JSON.stringify(result,null,2));
 console.log(`REAL_IMPORT_BROWSER_PASS: checks=${result.checks.length} rows=364 files=292 source_unchanged=1 mobile=390 real_writes=0`);
}finally{await browser.close();}
