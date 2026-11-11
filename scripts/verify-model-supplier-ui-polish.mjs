/** Actual UI geometry/focus/interaction; all persistence, auth and HTTP boundaries are local fixtures. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {startWorkspaceFixture} from './model-supplier-workspace-fixture.mjs';
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const root=path.resolve(arg('--source-root','.')),out=path.resolve(arg('--out','output/model-supplier-ui-polish'));
let fixture,browser;const result={checks:[],errors:[],external:[],supplierCalls:0,tier:'actual UI/CSS/React; auth and HTTP fixtures'};
const check=async(name,fn)=>{await fn();result.checks.push(name);};
try{
 fixture=await startWorkspaceFixture({root,out});browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>result.errors.push(String(e)));
 await context.route('**/*',async route=>{if(!route.request().url().startsWith(fixture.origin)){result.external.push(route.request().url());await route.abort();}else await route.continue();});
 await page.goto(fixture.origin+'/admin/model-management');await page.getByTestId('managed-model-gpt-image').waitFor();
 await check('provider before technical ID',async()=>{const row=page.getByTestId('managed-model-gpt-image');assert.ok((await row.textContent()).indexOf('Geeknow')<(await row.textContent()).indexOf('gpt-image-2'));});
 await check('model title keyboard action',async()=>{const button=page.getByRole('button',{name:'打开 GPT-Image-2.5 详情',exact:true});await button.focus();assert.equal(await button.evaluate(el=>document.activeElement===el),true);await page.keyboard.press('Enter');await page.getByRole('heading',{name:'GPT-Image-2.5',exact:true}).waitFor();await page.getByRole('button',{name:'← 模型列表',exact:true}).click();});
 await check('count decorations do not rename tabs',async()=>{for(const name of ['模型','供应商','定价','运行'])assert.equal(await page.getByRole('tab',{name,exact:true}).count(),1);});
 for(const width of [1440,1024,820,390,320]){
  await page.setViewportSize({width,height:1000});await page.goto(fixture.origin+'/admin/model-management');await page.getByTestId('managed-model-gpt-image').waitFor();
  await check('model layout '+width,async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true));
  const before=fixture.requests.filter(r=>r.body&&r.body.action!=='discover').length;
  await page.getByTestId('managed-model-gpt-image').getByRole('button',{name:'管理',exact:true}).hover();
  await check('hover does not publish '+width,async()=>assert.equal(fixture.requests.filter(r=>r.body&&r.body.action!=='discover').length,before));
  await page.mouse.move(1,1);
  await page.screenshot({path:path.join(out,`models-${width}.png`),fullPage:true,animations:'disabled'});
 }
 await page.setViewportSize({width:1440,height:1000});await page.goto(fixture.origin+'/admin/model-management?view=suppliers');await page.getByRole('button',{name:'管理供应商 现行主生图通道',exact:true}).waitFor();
 await check('supplier details reachable',async()=>{await page.getByRole('button',{name:'管理供应商 现行主生图通道',exact:true}).click();await page.getByRole('button',{name:'连接与密钥',exact:true}).click();await page.getByRole('link',{name:'编辑连接与轮换密钥 →',exact:true}).waitFor();});
 await page.getByRole('button',{name:'← 供应商列表',exact:true}).click();await page.screenshot({path:path.join(out,'suppliers-1440.png'),fullPage:true,animations:'disabled'});
 await page.getByRole('tab',{name:'定价',exact:true}).click();await page.getByRole('table',{name:'生效积分价格表'}).waitFor();
 await check('unavailable cells keep visual identity',async()=>{const cells=page.locator('[data-available=false]');assert.ok(await cells.count()>0);assert.ok(await cells.filter({hasText:'未开放'}).count()>0);});
 await page.screenshot({path:path.join(out,'pricing-1440.png'),fullPage:true,animations:'disabled'});
 await check('no fixture API failures',async()=>assert.deepEqual(fixture.failures,[]));assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);
 result.status='PASS';await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(result,null,2));console.log(`MODEL_SUPPLIER_UI_POLISH=PASS CASES=${result.checks.length} WIDTHS=1440,1024,820,390,320 EXTERNAL=0 SUPPLIER_CALLS=0 EXIT=0`);await context.close();
}catch(error){result.status='FAIL';result.error=error.stack;await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(result,null,2));throw error;}
finally{await browser?.close();await fixture?.close();}
