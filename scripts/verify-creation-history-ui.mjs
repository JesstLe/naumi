import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
// Standalone headless browser is a bounded screenshot fallback after two T3
// preview snapshot timeouts. Never attach to the user's normal browser/CDP.
const out=resolve(process.argv[2]||'output/creation-history-ui');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:65439/admin/creations');await page.getByText('新品包装图创作').waitFor();
 await page.getByRole('button',{name:'历史生成',exact:true}).click();await page.getByText('旧版商品主图生成').waitFor();
 assert.ok(page.url().includes('period=all'));await page.getByText('全部日期',{exact:true}).waitFor();
 await page.getByRole('button',{name:'下一页',exact:true}).click();assert.ok(page.url().includes('page=2'));assert.ok(page.url().includes('period=all'));
 await page.screenshot({path:resolve(out,'history-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'新创作',exact:true}).click();await page.getByText('新品包装图创作').waitFor();assert.ok(!page.url().includes('period='));
 await page.goto('http://127.0.0.1:65439/admin/creations?source=legacy&from=2001-01-01&to=2001-01-01&creationId=stale&assetPage=3');
 await page.getByRole('button',{name:'全部日期',exact:true}).waitFor();await page.getByRole('button',{name:'全部日期',exact:true}).click();
 assert.ok(!page.url().includes('creationId'));assert.ok(!page.url().includes('assetPage'));assert.ok(!page.url().includes('from='));
 await page.getByText('旧版商品主图生成').waitFor();await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:resolve(out,'history-mobile.png'),fullPage:true});
 await page.goto('http://127.0.0.1:65439/enterprise?fixtureEnterprise=1');await page.getByText('新品包装图创作').waitFor();assert.equal(await page.getByRole('navigation',{name:'创作记录来源'}).count(),0);
 assert.equal(errors.length,0,errors.join('\n'));await writeFile(resolve(out,'BROWSER.json'),JSON.stringify({historyTabs:true,allDates:true,pagination:true,resetStaleDetail:true,currentTabReset:true,enterpriseHistoryHidden:true,mobileOverflow:false,pageErrors:errors,fixtureOnly:true},null,2));
 console.log('CREATION_HISTORY_UI=PASS tabs=1 allDates=1 pagination=1 resetStaleDetail=1 enterpriseScope=1 desktop=1280 mobile=390 pageErrors=0');
}finally{await browser.close();}
