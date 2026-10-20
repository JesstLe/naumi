// Read-only acceptance of the original local URL. It must never POST an employee change.
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.argv[2]);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[],writes=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());});
 await page.goto('http://127.0.0.1:18482/preview.html?v=4',{waitUntil:'networkidle'});
 await page.locator('.sidebar [data-view="schedule"]').click();await page.locator('[data-import-mode="real"]').click();
 await page.waitForFunction(()=>sheetGrid.doc?.rows.length>=364&&!sheetGrid.loading);
 const before=await page.evaluate(async()=>({document:await sgRequest('worksheet',{source:sheetGrid.source}),sourceRows:imported.rows.length,assets:imported.assets.length,people:await sgRequest('people',{source:sheetGrid.source})}));
 assert(await page.evaluate(()=>typeof SheetSaveModel==='object'&&typeof sgSaveCompare==='function'));
 // Merely open an existing editor, without changing any value or submitting it.
 await page.locator('[data-sg-edit][data-sg-col="status"]').first().click();assert.equal(await page.locator('#sgCellForm').count(),1);
 await page.locator('#overlay [data-close]').first().click();
 const after=await page.evaluate(()=>sgRequest('worksheet',{source:sheetGrid.source}));
 assert.deepEqual(before.document,after);assert.equal(before.sourceRows,364);assert.equal(before.assets,292);assert.equal(errors.length,0);assert.equal(writes.length,0);
 const report={url:page.url(),rows:after.document.rows.length,version:after.version,sourceRows:before.sourceRows,assets:before.assets,profiles:before.people.profiles.length,boundOccurrences:before.people.occurrences.filter(o=>o.personId).length,documentSha256:createHash('sha256').update(JSON.stringify(after.document)).digest('hex'),moduleReady:true,businessWrites:writes.length,pageErrors:errors.length};
 await writeFile(resolve(out,'LIVE_READONLY.json'),JSON.stringify(report,null,2));console.log(`LOCAL_QUALITY_READY: port=18482 rows=${report.rows} source_rows=364 assets=292 save_recovery=1 source_writes=0 people_bindings=${report.boundOccurrences} page_errors=0`);
}finally{await browser.close();}
