import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const base=process.env.FIXTURE_BASE||'http://127.0.0.1:14951',out='output/canvas-key-frame-long-image-20261021',checks=[],errors=[];
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});await page.getByTestId('canvas-agent-toggle').waitFor();await page.waitForTimeout(500);
  const panel=page.locator('#canvas-agent-panel');if(await panel.isVisible())await panel.getByRole('button',{name:'收起助手',exact:true}).click();
  const node=page.locator('.react-flow__node[data-id="attachment-root"]');await node.waitFor();await node.click();
  const composer=page.locator('[data-canvas-composer="image"]');
  const textarea=page.locator('textarea:visible').first();await textarea.fill('保持这张长图的构图，只优化细节');
  const before=await(await fetch(base+'/__fixture/state')).json();
  const auto=page.getByRole('button',{name:/自适应.*1K/});assert.equal(await auto.count(),1,'new draft stays auto despite stored square label');
  await page.getByTestId('generation-submit-action').click();
  await page.waitForFunction(n=>fetch('/__fixture/state').then(r=>r.json()).then(s=>(s.generations||[]).length>n),(before.generations||[]).length);
  const expected=(before.generations||[]).length+1;await page.locator('.react-flow__node[data-id="adaptive-result-'+expected+'"]').waitFor();
  const after=await(await fetch(base+'/__fixture/state')).json(),plan=after.plans.at(-1),sent=after.generations.at(-1);
  assert.equal(after.generations.length,expected);assert.equal(plan.parameters.ratio,'1:3');assert.equal(sent.parameters.ratio,'1:3');assert.equal(sent.parameters.resolution,'1K');assert.equal(sent.operationId,plan.operationId);assert.equal(sent.framePolicy,'all-inputs');assert.equal(after.paidCalls,0);
  checks.push(width+':actual-canvas-click-auto-source96x288-submits1:3-one-task-result-visible');
  await page.getByTestId('canvas-agent-toggle').click();await panel.locator('textarea').fill('请沿用参考图构图');await panel.getByRole('button',{name:'发送消息',exact:true}).click();
  await page.waitForFunction(n=>fetch('/__fixture/state').then(r=>r.json()).then(s=>(s.turns||[]).length>n),(before.turns||[]).length);
  const state=await(await fetch(base+'/__fixture/state')).json();assert.equal(state.turns.at(-1).ratio,'auto');checks.push(width+':assistant-request-preserves-auto');
  if(await panel.isVisible())await panel.getByRole('button',{name:'收起助手',exact:true}).click();
  await node.click();await auto.click();
  assert.equal(await page.getByRole('button',{name:'1:3',exact:true}).count(),0,'no new long-image selector');
  checks.push(width+':no-new-long-image-preset');await page.keyboard.press('Escape');
  await page.screenshot({path:out+'/canvas-'+width+'.png',fullPage:false});await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/browser-result.json',JSON.stringify({checks,errors,result:'PASS',externalSupplierCalls:0},null,2));
 console.log('ADAPTIVE_BROWSER=PASS WIDTHS=1440,390 CHECKS='+checks.length+' ACTUAL_CANVAS=CLICKED AUTO_ORIGINAL=1:3 REQUEST=1:3 RESULT=VISIBLE AGENT=auto EXTRA_LONG_UI=NONE PAGEERRORS=0 EXTERNAL_SUPPLIER_CALLS=0');
}finally{await browser.close();}
