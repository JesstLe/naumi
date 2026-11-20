import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const base=process.env.FIXTURE_BASE||'http://127.0.0.1:15095',out=path.resolve(process.env.UNIFIED_IMAGE_EVIDENCE||'output/unified-image-edit/browser');await fs.mkdir(out,{recursive:true});assert.equal(new URL(base).hostname,'127.0.0.1');
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});const checks=[],errors=[],check=(v,s)=>{assert.ok(v,s);checks.push(s);console.log('CHECK='+s)};
const state=async()=> (await fetch(base+'/__fixture/state',{signal:AbortSignal.timeout(10000)})).json();
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});await page.getByTestId('canvas-agent-toggle').waitFor();const panel=page.locator('#canvas-agent-panel');if(await panel.isVisible())await panel.getByRole('button',{name:'收起助手',exact:true}).click();
  const source=page.locator('.react-flow__node[data-id="attachment-root"]');await source.click();await page.getByRole('textbox',{name:'节点提示词',exact:true}).fill('图片高清一些，去除下方的文字，背景变成红色，干净些，方便我抠图');
  console.log('STEP=prompt-ready');let before=await state();await page.getByTestId('generation-submit-action').click();
  await expect.poll(async()=>((await state()).generations||[]).length,{timeout:45000}).toBeGreaterThan((before.generations||[]).length);
  console.log('STEP=submitted');let after=await state(),sent=after.generations.at(-1),plan=after.plans.at(-1);await expect.poll(async()=>{const s=await state();return s.artworks.some(a=>plan.canvasTarget?a.id===plan.canvasTarget.nodeId&&a.canvasImageVersionId==='unified-'+sent.operationId:a.id==='unified-'+sent.operationId)},{timeout:45000}).toBe(true);
  check(plan.intent.operation==='edit'&&plan.intent.background==='opaque',width+':Qingyun-red-background-not-cutout');check(plan.modelId==='image-a'&&plan.steps.length===1&&plan.steps[0].modelId==='image-a',width+':selected-model-one-step');check(plan.ratio!=='auto',width+':auto-resolved-before-submit');check(plan.prompt.includes('背景变成红色')&&plan.prompt.includes('方便我抠图'),width+':full-user-prompt-retained');
  console.log('STEP=quick-start');await source.click();before=await state();await source.getByTestId('canvas-image-quick-cutout').click();
  await expect.poll(async()=>((await state()).generations||[]).length,{timeout:45000}).toBeGreaterThan((before.generations||[]).length);
  after=await state();sent=after.generations.at(-1);plan=after.plans.at(-1);await expect.poll(async()=>{const s=await state();return s.artworks.some(a=>plan.canvasTarget?a.id===plan.canvasTarget.nodeId&&a.canvasImageVersionId==='unified-'+sent.operationId:a.id==='unified-'+sent.operationId)},{timeout:45000}).toBe(true);
  check(plan.intent.operation==='edit'&&plan.intent.background==='transparent',width+':quick-action-native-transparent-edit');check(after.generations.length===before.generations.length+1,width+':quick-action-one-task');check(!after.legacyCutoutPosts,width+':no-cutout-http-path');check(plan.steps.length===1&&plan.steps[0].modelId==='image-a',width+':quick-action-no-hidden-model');
  await page.screenshot({path:path.join(out,'canvas-native-'+width+'.png')});
  await source.click();before=await state();await page.getByRole('button',{name:'抠图',exact:true}).click();await expect.poll(async()=>((await state()).generations||[]).length,{timeout:45000}).toBeGreaterThan(before.generations.length);check((await state()).generations.length===before.generations.length+1,width+':dock-action-same-imagegen-path');
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
 const accountLoaded=page.waitForResponse(r=>r.url().includes('/api/account?'));await page.goto(base+'/cutout',{waitUntil:'domcontentloaded'});await accountLoaded;const action=page.getByRole('button',{name:'开始抠图',exact:true});await action.waitFor();await page.getByTestId('tool-upload-input').setInputFiles(path.resolve('public/demos/suite-demo/suppl-src.png'));await page.getByRole('button',{name:'移除图片',exact:true}).waitFor();
 const before=await state();await action.click();await page.getByRole('img',{name:'效果',exact:true}).waitFor();const after=await state(),plan=after.plans.at(-1);
 check(after.generations.length===before.generations.length+1,'tool:one-native-task');check(plan.entry==='workbench'&&plan.intent.operation==='edit'&&plan.intent.background==='transparent','tool:ordinary-workbench-image-edit');check(plan.steps.length===1&&plan.steps[0].modelId==='image-a'&&!after.legacyCutoutPosts,'tool:no-legacy-model-or-path');
 await page.screenshot({path:path.join(out,'tool-native.png')});
 await page.getByRole('button',{name:'移除图片',exact:true}).click();
 await page.getByTestId('tool-upload-input').setInputFiles(path.resolve('public/demos/suite-demo/suppl-src.png'));await page.getByRole('button',{name:'移除图片',exact:true}).waitFor();
 await fetch(base+'/__unified/control?invalid=1');let failedBefore=await state();await action.click();await page.getByRole('alert').filter({hasText:'模型未返回有效透明主体'}).waitFor();
 await expect(page.getByRole('img',{name:'效果',exact:true})).toHaveCount(0);await page.waitForTimeout(2000);
 check((await state()).generations.length===failedBefore.generations.length+1,'tool:opaque-output-rejected-no-auto-repost');
 check(await page.getByRole('button',{name:'重新抠图',exact:true}).isEnabled(),'tool:confirmed-failure-explicit-retry');
 await fetch(base+'/__unified/control?invalid=0');const retryBefore=await state();await page.getByRole('button',{name:'重新抠图',exact:true}).click();await page.getByRole('img',{name:'效果',exact:true}).waitFor();
 check((await state()).generations.length===retryBefore.generations.length+1,'tool:explicit-retry-one-new-identity');await page.screenshot({path:path.join(out,'tool-recovered.png')});await context.close();
 check(errors.length===0,'no-browser-pageerror');await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify({checks,errors,actualNextUI:true,actualPlanner:true,httpPorts:'loopback fixture',supplierCalls:0},null,2));console.log('UNIFIED_IMAGE_BROWSER=PASS checks='+checks.length+' widths=1440,390 canvas_and_tool=true supplier_calls=0');
}catch(e){console.error(e);throw e;}finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,3000))]);}
