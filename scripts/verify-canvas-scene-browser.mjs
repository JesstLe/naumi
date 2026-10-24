// Actual Next + React Flow controls; local HTTP fixture, no paid providers.
import {chromium,expect as rawExpect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.CANVAS_FIXTURE_URL||'http://127.0.0.1:14354',out=path.resolve(process.env.SCENE_BROWSER_EVIDENCE||'output/refactor-r3c1-20261024/browser');assert.equal(new URL(base).hostname,'127.0.0.1');await mkdir(out,{recursive:true});
const expect=rawExpect.configure({timeout:30000}),checks=[],errors=[],browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const state=async()=>await(await fetch(base+'/__fixture/state')).json(),node=id=>page.locator(`.react-flow__node[data-id="${id}"]`),point=id=>node(id).evaluate(el=>{const m=new DOMMatrix(el.style.transform);return {x:m.e,y:m.f}}),pass=s=>{checks.push(s);console.log('PASS '+s);};
try{
 await fetch(base+'/__fixture/reset');const initial=await state();await fetch(base+'/api/canvas/text-nodes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...initial.texts[0],sourceIds:['placement-root']})});await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});await expect(node('placement-root')).toBeVisible();await expect(node('text-history')).toBeVisible();
 const assistant=page.getByRole('button',{name:'收起助手',exact:true});if(await assistant.isVisible())await assistant.click();
 const root=node('placement-root'),text=node('text-history'),dock=page.getByTestId('image-node-dock'),undo=page.getByTestId('canvas-main-toolbar').locator('[data-tool="undo"]');
 await root.click({position:{x:80,y:120}});await page.getByRole('button',{name:'重命名节点',exact:true}).click();const rename=page.locator('input[maxlength="60"]');await expect(rename).toBeVisible();await rename.fill('引用标题已更新');await rename.press('Enter');
 await expect(text.getByTitle('@引用标题已更新')).toBeVisible();await expect(root.locator('.art-title')).toContainText('引用标题已更新');pass('actual rename updates artwork label and dependent text reference chip');
 await dock.getByRole('button',{name:'关闭创作栏',exact:true}).click();await undo.click();await expect(text.getByTitle('@主图')).toBeVisible();pass('undo projects original label across both renderers');
 await root.click({position:{x:80,y:120}});const beforeSize=await root.boundingBox(),handle=root.locator('.react-flow__resize-control.handle.bottom.right');await expect(handle).toBeVisible();const box=await handle.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+60,box.y+box.height/2+50,{steps:10});await page.mouse.up();
 await expect.poll(async()=>(await root.boundingBox()).width).toBeGreaterThan(beforeSize.width+30);pass('extracted artwork renderer preserves actual aspect-locked resize');
 await dock.locator('textarea').fill('R3C 独立场景投影');await dock.getByTestId('generation-submit-action').click();await expect.poll(async()=>(await state()).submissions.length).toBe(1);
 const task=page.locator('.react-flow__node[data-id^="task-"]');await expect(task).toHaveCount(1);const id=await task.getAttribute('data-id'),before=await point(id),taskBox=await task.boundingBox();
 await page.mouse.move(taskBox.x+taskBox.width*.3,taskBox.y+Math.min(80,taskBox.height*.3));await page.mouse.down();await page.mouse.move(taskBox.x+taskBox.width*.3+71,taskBox.y+Math.min(80,taskBox.height*.3)+93,{steps:12});
 await page.waitForTimeout(2800);const during=await point(id);assert.notDeepEqual(during,before);await page.mouse.up();const after=await point(id);await page.waitForTimeout(2700);assert.deepEqual(await point(id),after);pass('live drag remains exact during task-stage scene updates');
 await fetch(base+'/__fixture/complete?index=1');await expect(node('placement-result-1')).toHaveCount(1);const result=await point('placement-result-1');assert.ok(Math.abs(result.x-after.x)<=1&&Math.abs(result.y-after.y)<=1);pass('shared task attachment lands at dragged scene position');
 await dock.getByRole('button',{name:'关闭创作栏',exact:true}).click();await page.getByTestId('canvas-main-toolbar').locator('[data-tool="image-node"]').click();await expect(page.getByTestId('pending-node-dock')).toBeVisible();await expect(page.locator('.react-flow__node[data-id^="pend-"]').getByRole('button',{name:'上传图片',exact:true})).toBeVisible();pass('registry retains pending renderer and current upload command');
 assert.deepEqual(errors,[]);assert.equal((await state()).paidCalls,0);await page.screenshot({path:path.join(out,'scene-verified.png')});await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,errors,actualCanvas:true,api:'local-fixture',supplier:0},null,2));
 console.log(`CANVAS_SCENE_BROWSER=PASS checks=${checks.length} ACTUAL_NEXT=1 REFERENCES=LIVE RESIZE=PASS DRAG_REFRESH=EXACT PENDING=PASS SUPPLIER=0`);
}catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),checks,errors,body:await page.locator('body').innerText(),state:await state()},null,2));throw error;}
finally{await browser.close();}
