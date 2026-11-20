import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.FIXTURE_BASE||'http://127.0.0.1:15085',out=path.resolve(process.env.CANVAS_TRANSPARENT_EVIDENCE||'output/canvas-transparent-blend'),baseline=process.argv.includes('--baseline');
assert.equal(new URL(base).hostname,'127.0.0.1');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
const checks=[],errors=[],observations=[];const check=(value,label)=>{assert.ok(value,label);checks.push(label)};
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});await page.getByTestId('canvas-agent-toggle').waitFor();
  const panel=page.locator('#canvas-agent-panel');if(await panel.isVisible())await panel.getByRole('button',{name:'收起助手',exact:true}).click();
  const root=page.locator('.react-flow__node[data-id="attachment-root"]'),card=root.locator('.canvas-ui-node-card'),img=root.locator('img');
  await img.waitFor();await page.waitForFunction(()=>{const i=document.querySelector('.react-flow__node[data-id="attachment-root"] img');return i?.naturalWidth>0;});
  const styles=await card.evaluate(el=>{const s=getComputedStyle(el);return{background:s.backgroundColor,border:s.borderColor,shadow:s.boxShadow,rect:el.getBoundingClientRect().toJSON()};});observations.push({width,unselected:styles});
  if(baseline){check(styles.background==='rgb(255, 255, 255)',width+':baseline-white-card-reproduced');await page.screenshot({path:path.join(out,`baseline-${width}.png`)});await context.close();continue;}
  check(styles.background==='rgba(0, 0, 0, 0)',width+':image-card-transparent');check(styles.border==='rgba(0, 0, 0, 0)',width+':unselected-border-transparent');check(styles.shadow==='none',width+':unselected-no-card-shadow');
  const source=await img.getAttribute('src');check(!!source,width+':decoded-image-visible');
  await page.screenshot({path:path.join(out,`modified-${width}.png`)});
  await root.click();await page.waitForFunction(()=>document.querySelector('.react-flow__node[data-id="attachment-root"] .canvas-ui-selected'));
  // The card deliberately animates selection chrome; sample its settled state.
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.react-flow__node[data-id="attachment-root"] .canvas-ui-node-card')).borderColor==='rgb(49, 95, 200)');
  const selected=await card.evaluate(el=>{const s=getComputedStyle(el);return{background:s.backgroundColor,border:s.borderColor};});check(selected.background==='rgba(0, 0, 0, 0)',width+':selected-keeps-transparent-background');check(selected.border==='rgb(49, 95, 200)',width+':selected-blue-outline-preserved');
  check(await root.locator('.react-flow__resize-control.handle').count()>=4,width+':resize-handles-preserved');
  const handles=await root.locator('.react-flow__handle').count();check(handles>=2,width+':connection-ports-preserved');
  check(await page.getByTestId('canvas-image-quick-cutout').isVisible(),width+':image-action-still-visible');
  await page.screenshot({path:path.join(out,`selected-${width}.png`)});
  if(width===1440){
   const before=await root.boundingBox();
   await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();await page.mouse.move(before.x+before.width/2+40,before.y+before.height/2+30,{steps:8});await page.mouse.up();
   await page.waitForFunction(x=>document.querySelector('.react-flow__node[data-id="attachment-root"]').getBoundingClientRect().x>x+20,before.x);
   const dragged=await root.boundingBox();check(dragged.x>before.x+20&&dragged.y>before.y+10,'1440:real-pointer-drag-preserved');
   const handle=await root.locator('.react-flow__resize-control.handle.bottom.right').boundingBox();
   await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+30,handle.y+handle.height/2+50,{steps:8});await page.mouse.up();
   await page.waitForFunction(w=>document.querySelector('.react-flow__node[data-id="attachment-root"]').getBoundingClientRect().width>w+10,dragged.width);
   const resized=await root.boundingBox();check(resized.width>dragged.width+10&&resized.height>dragged.height+10,'1440:real-pointer-resize-preserved');
   check(Math.abs(resized.width/resized.height-dragged.width/dragged.height)<0.02,'1440:resize-aspect-ratio-preserved');
  }
  await page.reload();await page.waitForFunction(()=>document.querySelector('.react-flow__node[data-id="attachment-root"] img')?.naturalWidth>0);
  const refreshed=await root.locator('.canvas-ui-node-card').evaluate(el=>getComputedStyle(el).backgroundColor);check(refreshed==='rgba(0, 0, 0, 0)',width+':transparent-after-reload');
  await context.close();
 }
 check(errors.length===0,'no-browser-pageerror');
 const result={baseline,checks,errors,observations,actualCanvas:true,api:'isolated-loopback-fixture',supplierCalls:0};await writeFile(path.join(out,baseline?'BASELINE.json':'RESULT.json'),JSON.stringify(result,null,2));
 console.log(`CANVAS_TRANSPARENT_SURFACE=${baseline?'BASELINE_REPRODUCED':'PASS'} checks=${checks.length} widths=1440,390 actual_canvas=true supplier_calls=0`);
}finally{await browser.close();}
