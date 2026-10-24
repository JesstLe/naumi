// Actual Next Canvas; only HTTP data and supplier execution are local fixtures.
import {chromium,expect as rawExpect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.CANVAS_FIXTURE_URL||'http://127.0.0.1:14352',out=path.resolve(process.env.TASK_BROWSER_EVIDENCE||'output/refactor-r3b4-20261024/browser');
assert.equal(new URL(base).hostname,'127.0.0.1');await mkdir(out,{recursive:true});
const expect=rawExpect.configure({timeout:30000}),checks=[],errors=[],browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const state=async()=>await(await fetch(base+'/__fixture/state')).json(),pass=label=>{checks.push(label);console.log('PASS '+label);};
try{
 await fetch(base+'/__fixture/reset');await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});
 const root=page.locator('.react-flow__node[data-id="placement-root"]'),second=page.locator('.react-flow__node[data-id="placement-second"]'),dock=page.getByTestId('image-node-dock');
 await expect(root).toBeVisible();const assistant=page.getByRole('button',{name:'收起助手',exact:true});if(await assistant.isVisible())await assistant.click();
 await root.click({position:{x:80,y:120}});await expect(dock).toBeVisible();
 await page.getByRole('button',{name:'扩展画面',exact:true}).click();await page.getByRole('button',{name:'3:4',exact:true}).click();await fetch(base+'/__fixture/fail-position');await page.getByRole('button',{name:'开始扩图',exact:true}).click();
 await expect(page.getByTestId('generation-failure')).toHaveCount(1);assert.equal((await state()).edits.length,1);pass('real expand control reaches edit task and exposes failed placement');
 await page.getByTestId('generation-failure').getByRole('button',{name:'重试',exact:true}).click();
 await expect(page.locator('.react-flow__node[data-id="edit-result-1"]')).toHaveCount(1);await expect(page.getByTestId('generation-failure')).toHaveCount(0);assert.equal((await state()).edits.length,1);pass('edit retry attaches original result with zero new paid POSTs');
 await dock.getByRole('button',{name:'普通',exact:true}).click();await page.getByRole('button',{name:'详情图组（按顺序生成）',exact:true}).click();
 await dock.locator('textarea').fill('R3B4 原详情任务');await fetch(base+'/__fixture/detail-failure');await dock.getByTestId('generation-submit-action').click();
 await expect.poll(async()=>(await state()).details.length).toBe(1);await expect(page.getByTestId('generation-failure')).toHaveCount(1);pass('real detail entry retains accepted job after polling failure');
 await fetch(base+'/__fixture/detail-complete?index=1');await page.getByTestId('generation-failure').getByRole('button',{name:'重试',exact:true}).click();
 await dock.getByRole('button',{name:'关闭创作栏',exact:true}).click();await second.click({position:{x:80,y:120}});await dock.locator('textarea').fill('详情任务结束也保留的新草稿');
 await expect(page.locator('.react-flow__node[data-id="detail-result-1"]')).toHaveCount(1);await expect(dock.locator('textarea')).toHaveValue('详情任务结束也保留的新草稿');assert.equal((await state()).details.length,1);pass('detail recovery queries original job and preserves current selection and draft');
 await dock.getByRole('button',{name:'关闭创作栏',exact:true}).click();await page.keyboard.press('Control+z');
 await expect(page.locator('.react-flow__node[data-id="detail-result-1"]')).toHaveCount(0);await expect(page.locator('.react-flow__node[data-id="edit-result-1"]')).toHaveCount(1);pass('detail attachment registers one real undo action');
 assert.deepEqual(errors,[]);assert.equal((await state()).paidCalls,0);await page.screenshot({path:path.join(out,'canvas-task-results.png')});
 await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,errors,actualNext:true,api:'fixture',pg:false,state:await state()},null,2));
 console.log(`CANVAS_TASK_BOUNDARIES_BROWSER=PASS checks=${checks.length} ACTUAL_NEXT_CANVAS=1 EXPAND=1 DETAIL=1 KNOWN_RETRY_POST=0 SELECTION_DRAFT=RETAINED UNDO=PASS SUPPLIER=0`);
}catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),checks,errors,body:await page.locator('body').innerText().catch(()=>''),state:await state()},null,2));throw error;}
finally{await browser.close();}
