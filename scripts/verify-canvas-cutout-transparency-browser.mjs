import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.FIXTURE_BASE||'http://127.0.0.1:14957',out=path.resolve(process.env.CUTOUT_EVIDENCE||'output/cutout-transparent/browser'),baseline=process.argv.includes('--baseline');
assert.equal(new URL(base).hostname,'127.0.0.1');await mkdir(out,{recursive:true});
const checks=[],errors=[],check=(value,label)=>{assert.ok(value,label);checks.push(label)};
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
const control=mode=>fetch(base+'/__cutout/control?mode='+mode),state=async()=> (await fetch(base+'/__fixture/state')).json();
try{
 for(const width of [1440,390]){
  await fetch(base+'/__cutout/reset');await control('hidden');const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});await page.getByTestId('canvas-agent-toggle').waitFor();
  const panel=page.locator('#canvas-agent-panel');if(await panel.isVisible())await panel.getByRole('button',{name:'收起助手',exact:true}).click();
  const original=page.locator('.react-flow__node[data-id="attachment-root"]');await original.click();
  const quick=page.getByTestId('canvas-image-quick-cutout'),dock=page.getByRole('button',{name:'抠图',exact:true});await quick.waitFor();await dock.waitFor();
  // Wait for the actual feature catalogue response rather than asserting SSR loading state.
  await page.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>e.name.includes('/api/models?feature=tool.cutout')));
  await page.waitForTimeout(500);
  await page.screenshot({path:path.join(out,`${baseline?'baseline':'modified'}-${width}.png`),fullPage:true});
  if(baseline){check(await quick.isDisabled()&&await dock.isDisabled(),width+':hidden-default-reproduces-both-disabled');await context.close();continue;}
  check(await quick.isEnabled()&&await dock.isEnabled(),width+':hidden-default-enables-both-entries');
  const before=await state(),reply=page.waitForResponse(r=>r.url().endsWith('/api/cutout')&&r.request().method()==='POST');await dock.click();
  const receipt=await (await reply).json();await page.locator('.react-flow__node[data-id="'+receipt.id+'"]').waitFor();
  const after=await state(),sent=after.cutouts.at(-1),result=after.artworks.find(a=>a.id===receipt.id);
  check(after.cutouts.length===(before.cutouts||[]).length+1,width+':one-submit');check(sent.quality==='medium'&&sent.headerQuality==='medium',width+':quality-contract');check(sent.parentId==='attachment-root'&&result.parentId==='attachment-root',width+':original-parent');
  check(!after.quotes.at(-1)?.modelId,width+':hidden-id-not-promoted-to-explicit-request');
  await page.reload();await page.locator('.react-flow__node[data-id="'+result.id+'"]').waitFor();check(true,width+':result-survives-reload');
  await original.click();await page.getByTestId('canvas-image-quick-cutout').click();await page.waitForFunction(n=>fetch('/__fixture/state').then(r=>r.json()).then(s=>s.cutouts.length===n),(after.cutouts.length+1));check(true,width+':quick-entry-submits');
  await control('disabled');await page.reload();await original.click();await page.getByTestId('canvas-image-quick-cutout').waitFor();await page.waitForTimeout(500);check(await page.getByTestId('canvas-image-quick-cutout').isDisabled()&&await page.getByRole('button',{name:'抠图',exact:true}).isDisabled(),width+':explicit-disabled-stays-disabled');
  await control('legacy');await page.reload();await original.click();await page.getByTestId('canvas-image-quick-cutout').waitFor();await page.waitForTimeout(500);check(await page.getByTestId('canvas-image-quick-cutout').isEnabled()&&await page.getByRole('button',{name:'抠图',exact:true}).isEnabled(),width+':legacy-processor-ready-without-model-selection');
  await control('invalid');await page.reload();await original.click();await page.getByTestId('canvas-image-quick-cutout').waitFor();await page.waitForTimeout(500);const badBefore=await state();await page.getByRole('button',{name:'抠图',exact:true}).click();await page.getByText('抠图结果没有有效透明背景，原图已保留。',{exact:false}).first().waitFor();
  const badAfter=await state();check(badAfter.artworks.length===badBefore.artworks.length,width+':invalid-result-not-adopted');check(await original.isVisible(),width+':original-retained-on-failure');await page.waitForTimeout(600);check((await state()).cutouts.length===badAfter.cutouts.length,width+':no-auto-resubmit');
  const dismiss=page.getByRole('button',{name:'关闭创作栏',exact:true});if(await dismiss.isVisible())await dismiss.click();
  const error=page.getByText('抠图结果没有有效透明背景，原图已保留。',{exact:false}).first();await error.scrollIntoViewIfNeeded();
  check(await error.isVisible(),width+':local-error-visible-after-dismissing-composer');
  await page.screenshot({path:path.join(out,`invalid-local-${width}.png`),fullPage:true});const toast=page.locator('.pointer-events-auto').filter({hasText:'抠图结果没有有效透明背景，原图已保留。'}).last();if(await toast.isVisible())await toast.screenshot({path:path.join(out,`invalid-error-${width}.png`)});await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'RESULT.json'),JSON.stringify({checks,errors,baseline,actualCanvas:true,api:'isolated-fixture',supplierCalls:0},null,2));
 console.log(`CANVAS_CUTOUT_BROWSER=${baseline?'BASELINE_REPRODUCED':'PASS'} checks=${checks.length} widths=1440,390 actual_canvas=true supplier_calls=0`);
}finally{await browser.close()}
