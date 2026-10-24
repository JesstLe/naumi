// Actual Next Canvas + existing local placement fixture. No real accounts/suppliers.
import {chromium,expect as rawExpect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.CANVAS_FIXTURE_URL||'http://127.0.0.1:14345';
assert.equal(new URL(base).hostname,'127.0.0.1');
const artworkDocument=process.env.CANVAS_VERIFY_ARTWORK_DOCUMENT==='1';
const out=path.resolve(process.env.CANVAS_IMAGE_EVIDENCE||'output/refactor-r3a-20261024/browser');await mkdir(out,{recursive:true});
const expect=rawExpect.configure({timeout:30000}),checks=[],errors=[];
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const state=async()=>await(await fetch(base+'/__fixture/state')).json();
const pass=name=>{checks.push(name);console.log('PASS '+name);};
try{
 await fetch(base+'/__fixture/reset');if(artworkDocument)await fetch(base+'/__fixture/artwork-failure?account=1');await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});
 const root=page.locator('.react-flow__node[data-id="placement-root"]'),second=page.locator('.react-flow__node[data-id="placement-second"]');
 if(artworkDocument){await expect(page.getByTestId('canvas-artwork-unavailable')).toBeVisible();await expect(page.getByTestId('canvas-artwork-load-error')).toBeVisible();await expect(page.getByTestId('canvas-project-browser')).toHaveCount(0);await fetch(base+'/__fixture/artwork-failure');await page.getByRole('button',{name:'重试同步作品',exact:true}).click();pass('initial artwork read failure is explicit; retry loads the original document');}
 await expect(root).toBeVisible();const assistant=page.getByRole('button',{name:'收起助手',exact:true});if(await assistant.isVisible())await assistant.click();
 await root.click({position:{x:80,y:120}});
 const dock=page.getByTestId('image-node-dock'),send=dock.getByTestId('generation-submit-action');
 await expect(dock).toBeVisible();await dock.locator('textarea').fill('R3 原节点生成');await send.click();
 await expect.poll(async()=>(await state()).submissions.length).toBe(1);
 await expect(send).toBeDisabled();await dock.locator('textarea').fill('A 执行期间保留的新草稿');
 await dock.getByRole('button',{name:'关闭创作栏',exact:true}).click();await second.click({position:{x:80,y:120}});await dock.locator('textarea').fill('R3 独立任务 B');await send.click();
 await expect.poll(async()=>(await state()).submissions.length).toBe(2);pass('two nodes submit independently without waiting for A');
 await dock.locator('textarea').fill('B 正在编辑的下一次草稿');await fetch(base+'/__fixture/complete?index=1');
 await expect(page.locator('.react-flow__node[data-id="placement-result-1"]')).toHaveCount(1);await expect(dock.locator('textarea')).toHaveValue('B 正在编辑的下一次草稿');pass('A completion retains B selection and editable draft');
 await fetch(base+'/__fixture/fail-position');await fetch(base+'/__fixture/complete?index=2');
 await expect(send).toBeEnabled();await expect(send).toHaveAttribute('aria-label','重试');
 // Retry from the real dock as well as retaining the placeholder callback.
 await send.click();
 await expect(page.locator('.react-flow__node[data-id="placement-result-2"]')).toHaveCount(1);await expect(page.getByTestId('generation-placeholder')).toHaveCount(0);
 const after=await state();assert.equal(after.submissions.length,2);assert.ok(after.positions.some(p=>p.id==='placement-result-2'));pass('failed position resumes attachment and adds zero generation POSTs');
 await dock.getByRole('button',{name:'关闭创作栏',exact:true}).click();await page.getByTestId('canvas-main-toolbar').locator('[data-tool="image-node"]').click();
 const pending=page.getByTestId('pending-node-dock');await expect(pending).toBeVisible();await pending.locator('textarea').fill('R3 空白节点生成');await pending.getByTestId('generation-submit-action').click();
 await expect.poll(async()=>(await state()).submissions.length).toBe(3);await fetch(base+'/__fixture/complete?index=3');
 await expect(page.locator('.react-flow__node[data-id="placement-result-3"]')).toHaveCount(1);pass('blank node uses same task controller and displays its result');
 if(artworkDocument){
  await root.click({position:{x:80,y:120}});await expect(dock).toBeVisible();await dock.locator('textarea').fill('R3B3 同步原结果');await send.click();await expect.poll(async()=>(await state()).submissions.length).toBe(4);
  await fetch(base+'/__fixture/artwork-failure?ids=1');await fetch(base+'/__fixture/complete?index=4');await expect(send).toHaveAttribute('aria-label','重试');await expect(page.getByTestId('canvas-artwork-load-error')).toBeVisible();await expect(second).toBeVisible();pass('result synchronization failure preserves existing artwork and original task retry');
  await fetch(base+'/__fixture/artwork-failure');await page.getByRole('button',{name:'重试同步作品',exact:true}).click();await expect(page.locator('.react-flow__node[data-id="placement-result-4"]')).toHaveCount(1);await send.click();await expect(page.getByTestId('generation-placeholder')).toHaveCount(0);assert.equal((await state()).submissions.length,4);pass('read retry and task attachment recovery add zero generation POSTs');
 }
 const receiptKeys=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('naumi:imagegen-pending:')));assert.equal(receiptKeys.length,0);pass('actual receipt storage clears only after attached results');
 assert.equal((await state()).paidCalls,0);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'canvas-results.png'),fullPage:false});
 const report={status:'PASS',checks,submissions:(await state()).submissions.length,positions:(await state()).positions.length,errors,actualCanvas:true,actualController:true,api:'local-fixture',database:false,supplier:0};await writeFile(path.join(out,'RESULT.json'),JSON.stringify(report,null,2));
 console.log('CANVAS_IMAGE_TASK_BROWSER=PASS CHECKS='+checks.length+' ACTUAL_NEXT_CANVAS=1 TWO_ENTRIES=1 CONCURRENT=2 RETRY_POSTS=0 RECEIPTS_LEFT=0 SUPPLIER=0'+(artworkDocument?' ARTWORK_LOAD=EXPLICIT_ERROR SYNC_RECOVERY=PASS':''));
}catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),checks,errors,body:await page.locator('body').innerText().catch(()=>''),state:await state()},null,2));throw error;}
finally{await browser.close();}
