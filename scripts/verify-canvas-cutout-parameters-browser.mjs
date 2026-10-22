import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const base=process.env.FIXTURE_BASE||'http://127.0.0.1:14941',checks=[],errors=[];
const hash=createHash('sha256').update(Buffer.from(await(await fetch(base+'/demos/suite-demo/suppl-src.png')).arrayBuffer())).digest('hex');
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});await page.getByTestId('canvas-agent-toggle').waitFor();await page.waitForTimeout(500);
  const panel=page.locator('#canvas-agent-panel');if(await panel.isVisible())await panel.getByRole('button',{name:'收起助手',exact:true}).click();
  const node=page.locator('.react-flow__node[data-id="attachment-root"]');await node.waitFor();await node.click();
  const button=page.getByTestId('canvas-image-quick-cutout');await button.waitFor();assert.equal(await button.isEnabled(),true);
  const original=await node.locator('img').first().getAttribute('src'),before=await(await fetch(base+'/__fixture/state')).json();await button.click();
  const id='cut-fixture-'+((before.cutouts||[]).length+1);await page.locator('.react-flow__node[data-id="'+id+'"]').waitFor();
  const after=await(await fetch(base+'/__fixture/state')).json(),sent=after.cutouts.at(-1),quote=after.quotes.filter(q=>q.feature==='tool.cutout').at(-1);
  assert.equal(after.cutouts.length,(before.cutouts||[]).length+1);assert.equal(sent.quality,'medium');assert.equal(sent.headerQuality,'medium');assert.equal(sent.parentId,'attachment-root');assert.equal(sent.imageHash,hash);assert.equal(quote.quality,'medium');assert.equal(after.paidCalls,0);
  assert.equal(await node.locator('img').first().getAttribute('src'),original);assert.equal(after.artworks.find(a=>a.id===id).parentId,'attachment-root');
  checks.push(width+':quick-button-medium-body-header-quote-original-bytes-child-visible');
  await page.reload();await page.locator('.react-flow__node[data-id="'+id+'"]').waitFor();checks.push(width+':result-survives-reload');
  await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile('output/canvas-cutout-parameters-20261021/browser-result.json',JSON.stringify({checks,errors,result:'PASS',externalSupplierCalls:0},null,2));console.log('CUTOUT_BROWSER=PASS WIDTHS=1440,390 CHECKS='+checks.length+' QUICK_BUTTON=CLICKED BODY_HEADER_QUOTE=medium ORIGINAL_BYTES=UNCHANGED CHILD=VISIBLE RELOAD=RETAINED PAGEERRORS=0 SUPPLIER_CALLS=0');
}finally{await browser.close();}
