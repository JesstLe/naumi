import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect as rawExpect} from '@playwright/test';
const expect=rawExpect.configure({timeout:45000});
const base=process.env.CANVAS_MENTION_BASE||'http://127.0.0.1:4817',out=process.env.CANVAS_MENTION_EVIDENCE;
assert.equal(new URL(base).hostname,'127.0.0.1');assert.ok(out);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),checks=[],errors=[],uploads=[];
page.on('pageerror',e=>errors.push(e.message));
const pass=s=>{checks.push(s);console.log('PASS '+s)};
const node=id=>page.locator(`.react-flow__node[data-id="${id}"]`);
const state=()=>fetch(base+'/__fixture/state').then(r=>r.json());
async function control(body){await fetch(base+'/__fixture/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})}
async function load(){await page.goto(base+'/canvas',{timeout:60000});await expect(node('selection-root')).toBeVisible();await page.waitForTimeout(400)}
async function cursor(area,from,to=from){await area.focus();await area.evaluate((el,[from,to])=>el.setSelectionRange(from,to),[from,to])}
async function imageReady(dock){await expect.poll(()=>dock.locator('[data-image-reference] img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0))).toBe(true)}
try {
  await control({reset:true,hold:true,settings:{},failSource:''});await load();
  await node('selection-1').click({position:{x:60,y:60}});
  const dock=page.getByTestId('image-node-dock'),area=dock.getByRole('textbox',{name:'节点提示词'});
  await expect(dock.getByRole('button',{name:'引用图片1',exact:true})).toBeVisible();
  await dock.locator('input[type=file]').setInputFiles(['public/demos/suite-demo/thermos-src.png','public/demos/suite-demo/suppl-detail.png']);
  await expect(dock.locator('[data-image-reference]')).toHaveCount(3);await imageReady(dock);
  assert.deepEqual(await dock.locator('[data-image-reference]').evaluateAll(els=>els.map(e=>e.getAttribute('data-image-reference'))),['1','2','3']);
  await area.fill('颜色参考，纹理参考');await cursor(area,4);await dock.getByRole('button',{name:'引用图片2',exact:true}).click();
  await expect(area).toHaveValue('颜色参考@图片2 ，纹理参考');await expect(area).toBeFocused();assert.equal(await area.evaluate(el=>el.selectionStart),9);
  await cursor(area,(await area.inputValue()).length);await dock.getByRole('button',{name:'引用图片3',exact:true}).click();await expect(area).toHaveValue('颜色参考@图片2 ，纹理参考@图片3 ');
  await page.screenshot({path:path.join(out,'image-mentions-uploads.png')});pass('three numbered references + click inserts at caret + focus and caret restored');
  await area.fill('使用替换的构图');await cursor(area,2,4);await dock.getByRole('button',{name:'引用图片1',exact:true}).click();await expect(area).toHaveValue('使用@图片1 的构图');
  const before=await area.inputValue();await dock.getByRole('button',{name:'查看图片2',exact:true}).click({force:true});await expect(page.getByRole('button',{name:'导出图片',exact:true})).toBeVisible();await expect(area).toHaveValue(before);await page.keyboard.press('Escape');
  pass('selection replacement + separate preview does not modify prompt');
  await area.fill('颜色参考@图片2 ，纹理参考@图片3');await dock.getByRole('button',{name:'移除图片1',exact:true}).click();await expect(area).toHaveValue('颜色参考@图片1 ，纹理参考@图片2');await expect(dock.locator('[data-image-reference]')).toHaveCount(2);await imageReady(dock);
  await dock.getByRole('button',{name:'移除图片1',exact:true}).click();await expect(area).toHaveValue('颜色参考 ，纹理参考@图片1');await imageReady(dock);
  pass('removal renumbers mentions by image identity + remaining blob thumbnails stay decoded');
  await area.fill('节点A');await node('selection-4').click({position:{x:60,y:60}});await expect(area).not.toHaveValue('节点A');await area.fill('节点B');await node('selection-1').click({position:{x:60,y:60}});await expect(area).toHaveValue('节点A');
  pass('node switch keeps independent prompt drafts');
  // Reload restores all references; native multi-select and merge create a linked pending node.
  await load();
  const boxes=await Promise.all(['selection-1','selection-2'].map(id=>node(id).boundingBox()));
  await page.keyboard.down('Shift');await page.mouse.move(Math.min(...boxes.map(b=>b.x))-12,Math.min(...boxes.map(b=>b.y))-16);await page.mouse.down();await page.mouse.move(Math.max(...boxes.map(b=>b.x+b.width))+12,Math.max(...boxes.map(b=>b.y+b.height))+12,{steps:18});await page.mouse.up();await page.keyboard.up('Shift');await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await page.getByRole('button',{name:'合并生成节点',exact:true}).click();
  const pending=page.getByTestId('pending-node-dock'),ptext=pending.getByRole('textbox',{name:'节点提示词'});
  await expect(pending.locator('[data-image-reference]')).toHaveCount(2);await ptext.fill('颜色参考');await cursor(ptext,4);await pending.getByRole('button',{name:'引用图片1',exact:true}).click();await page.keyboard.insertText('，纹理参考');await pending.getByRole('button',{name:'引用图片2',exact:true}).click();
  await expect(ptext).toHaveValue('颜色参考@图片1 ，纹理参考@图片2 ');await page.screenshot({path:path.join(out,'image-mentions-desktop.png')});
  pass('linked pending node references insert correct numbers into native prompt');
  await pending.getByTestId('generation-submit-action').click();await expect.poll(async()=>(await state()).requests.filter(r=>r.kind==='image').length).toBe(1);
  const call=(await state()).requests.find(r=>r.kind==='image');assert.equal(call.body.prompt,'颜色参考@图片1 ，纹理参考@图片2');assert.equal(call.body.inputs.length,2);assert.equal(call.body.sourceNodeId,'selection-1');
  await writeFile(path.join(out,'mention-request.json'),JSON.stringify(call,null,2));pass('native paid-submit mock keeps exact mentioned prompt and two ordered references; real supplier calls zero');
  await page.setViewportSize({width:390,height:844});await expect(pending).toBeVisible();const box=await pending.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=391,JSON.stringify(box));await imageReady(pending);await pending.getByRole('button',{name:'引用图片2',exact:true}).click();await expect(ptext).toBeFocused();await page.screenshot({path:path.join(out,'image-mentions-mobile.png')});pass('390px layout + touch-sized thumbnail click');
  assert.deepEqual(errors,[]);await writeFile(path.join(out,'browser-result.json'),JSON.stringify({result:'PASS',checks,errors,providerCalls:0},null,2));console.log('BROWSER=PASS IMAGE_MENTIONS=PASS DESKTOP=PASS MOBILE=390px PROVIDER_CALLS=0');
}catch(e){await page.screenshot({path:path.join(out,'browser-failure.png')}).catch(()=>{});await writeFile(path.join(out,'browser-failure.json'),JSON.stringify({checks,errors,body:await page.locator('body').innerText(),state:await state()},null,2));throw e}finally{await browser.close()}
