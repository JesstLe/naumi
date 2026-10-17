// Existing isolated Chromium fallback; native preview navigation/host failed.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.env.DELIVERY_EVIDENCE_DIR||'output/delivery-browser');await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:18508/preview.html?v=4');
 let result;try{result=await p.evaluate(await readFile('design/enterprise-demo/delivery-browser-check.js','utf8'));}catch(e){await writeFile(resolve(out,'FAILED_BROWSER_STATE.txt'),await p.locator('body').innerText());throw e;}await writeFile(resolve(out,'BROWSER_DELIVERY.json'),JSON.stringify(result,null,2));await p.waitForTimeout(3200);await p.screenshot({path:resolve(out,'DELIVERY_DETAIL.png'),animations:'disabled'});
 const downloadPromise=p.waitForEvent('download');await p.locator('[data-delivery-download]').first().click();const download=await downloadPromise;const downloaded=resolve(out,'DOWNLOADED_FIXTURE.txt');await download.saveAs(downloaded);assert((await readFile(downloaded,'utf8')).includes('第二版设计稿'));
 await p.evaluate(async()=>{closeOverlay();view='performance';await deliveryFactsLoad();});await p.screenshot({path:resolve(out,'CONTRIBUTION_FACTS.png'),animations:'disabled'});await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:resolve(out,'MOBILE.png'),animations:'disabled'});
 await p.reload();await p.evaluate(async()=>{await workspaceDiscover();const m=await(await fetch('/fixture/meta')).json();await workspaceChooseEnterprise(m.source.root);await workspaceChooseTeam(m.teamId);view='performance';await deliveryFactsLoad();});assert.equal(await p.evaluate(()=>deliveryState.total),1);assert.deepEqual(errors,[]);console.log(`DELIVERY_BROWSER_PASS: checks=${result.passed} upload_real_bytes=1 two_versions=1 rework_accept=1 protected_download_file=1 facts_once=1 reload=1 mobile390=1 errors0=1`);
}finally{await browser.close();}
