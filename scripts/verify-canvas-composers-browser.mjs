// Actual Next controls over the existing loopback Canvas fixture. No supplier calls.
import {chromium,expect as rawExpect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.CANVAS_FIXTURE_URL||'http://127.0.0.1:14362',out=path.resolve(process.env.COMPOSER_BROWSER_EVIDENCE||'output/refactor-r3e-20261024/browser');
assert.equal(new URL(base).hostname,'127.0.0.1');await mkdir(out,{recursive:true});
const expect=rawExpect.configure({timeout:30000}),checks=[],errors=[],quotes=[];
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
await page.route(base+'/api/billing/quote',route=>{const input=route.request().postDataJSON();return route.fulfill({json:{...input,credits:13*(input.quantity||1),reserveCredits:13*(input.quantity||1),version:1}});});
page.on('request',req=>{if(req.url().endsWith('/api/billing/quote'))quotes.push(req.postDataJSON());});
const realText=process.env.CANVAS_FIXTURE_REAL_TEXT==='1';
const state=async()=>{const state=await fetch(base+'/__fixture/state').then(r=>r.json());if(realText)state.texts=(await fetch(base+'/__fixture/pg-state').then(r=>r.json())).nodes;return state},node=id=>page.locator(`.react-flow__node[data-id="${id}"]`),pass=name=>{checks.push(name);console.log('PASS '+name)};
const image=page.getByTestId('image-node-dock'),text=page.getByTestId('text-node-dock');
async function close(){const button=page.getByRole('button',{name:'关闭创作栏',exact:true});if(await button.isVisible())await button.click();}
async function open(){await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});await expect(node('placement-root')).toBeVisible();const assistant=page.getByRole('button',{name:'收起助手',exact:true});if(await assistant.isVisible())await assistant.click();}
try{
 await fetch(base+'/__fixture/reset');if(realText)await fetch(base+'/__fixture/reset-text');await open();await node('placement-root').click({position:{x:90,y:110}});await expect(image).toBeVisible();
 await image.locator('textarea').fill('R3E image draft');await image.getByRole('spinbutton',{name:'生成图片数量'}).fill('3');
 await image.getByRole('button',{name:/· 1K/}).click();const parameters=page.getByTestId('canvas-generation-parameters');await expect(parameters).toBeVisible();await parameters.getByRole('button',{name:'3:4',exact:true}).click();await page.keyboard.press('Escape');await expect(parameters).toHaveCount(0);
 await expect.poll(()=>quotes.some(q=>q.feature==='canvas.image'&&q.modelId==='gpt-image-2'&&q.quantity===3&&q.ratio==='3:4'&&q.resolution==='1K')).toBe(true);
 await expect(image).toContainText('39 积分');await expect(image).not.toContainText('— 积分');
 await page.screenshot({path:path.join(out,'image-composer-verified.png')});
 pass('shared controls feed exact selected model/ratio/resolution/count to actual pricing');
 await close();await node('placement-second').click({position:{x:90,y:110}});await expect(image.locator('textarea')).not.toHaveValue('R3E image draft');await image.locator('textarea').fill('R3E second draft');await close();await node('placement-root').click({position:{x:90,y:110}});await expect(image.locator('textarea')).toHaveValue('R3E image draft');pass('node-scoped image draft survives composer unmount without leaking to second node');
 const mode=image.locator('button[aria-haspopup="true"]').first();await mode.click();await expect(page.getByTestId('canvas-select-options').locator('button')).toHaveCount(4);await page.getByTestId('canvas-select-options').locator('button').nth(3).click();await expect(image.getByRole('spinbutton',{name:'生成图片数量'})).toHaveCount(0);await expect.poll(()=>quotes.some(q=>q.quantity===3&&q.feature==='canvas.image')).toBe(true);await mode.click();await page.getByTestId('canvas-select-options').locator('button').first().click();await expect(image.getByRole('spinbutton',{name:'生成图片数量'})).toBeVisible();pass('existing image modes retain fixed split count and restore standard count control');
 await image.getByRole('button',{name:'更多图片参数',exact:true}).click();await expect(page.getByRole('button',{name:'关闭设置',exact:true})).toBeVisible();await page.getByRole('button',{name:'关闭设置',exact:true}).click();await expect(image.getByTestId('generation-submit-action')).toBeEnabled();pass('image-only options remain a separate anchored view');
 await close();await page.getByTestId('canvas-main-toolbar').locator('[data-tool="image-node"]').click();const pending=page.getByTestId('pending-node-dock');await expect(pending).toBeVisible();await pending.locator('button[aria-haspopup="true"]').first().click();await expect(page.getByTestId('canvas-select-options').locator('button')).toHaveCount(2);await page.getByTestId('canvas-select-options').locator('button').first().click();await expect(pending.getByRole('button',{name:'更多图片参数',exact:true})).toHaveCount(0);pass('blank node shares controls but retains its two modes and no artwork-only actions');
 await close();await node('text-history').click({position:{x:90,y:15}});await expect(text).toBeVisible();await expect(text.locator('textarea')).toHaveValue('原始文字');
 await text.locator('[data-composer-body] button[aria-expanded]').click();await text.locator('button[data-artwork-id="placement-root"]').click();await expect.poll(async()=>(await state()).texts.find(n=>n.id==='text-history').sourceIds).toContain('placement-root');await text.locator('[data-composer-body] button[aria-expanded]').click();pass('text reference control writes through original history/document command');
 await text.locator('textarea').fill('describe @邻');await expect(page.getByTestId('mention-picker')).toBeVisible();await page.getByTestId('mention-picker').getByRole('button',{name:'@邻近图片',exact:true}).click();await expect(text.locator('textarea')).toHaveValue('describe @邻近图片 ');await expect.poll(async()=>(await state()).texts.find(n=>n.id==='text-history').sourceIds).toContain('placement-second');pass('local mention picker inserts original token and persists the original reference command');
 await text.getByRole('button',{name:'展开文字编辑窗口',exact:true}).click();await expect(text).toHaveAttribute('data-composer-expanded','true');await text.getByRole('button',{name:'收起文字编辑窗口',exact:true}).click();await expect(text).toHaveAttribute('data-composer-expanded','false');assert.ok(await text.locator('textarea').evaluate(el=>el.getBoundingClientRect().height)>=112);pass('expanded and collapsed text editor preserve measured usable input height');
 await text.locator('textarea').fill('R3E keyboard generation');await text.locator('textarea').press('Control+Enter');await expect.poll(async()=>(await state()).textGenerations).toBe(1);await expect.poll(async()=>(await state()).texts.find(n=>n.id==='text-history').content).toBe('生成文字 1');pass('text keyboard action calls original retained task and document persistence');
 await text.locator('textarea').fill('@');await expect(page.getByTestId('mention-picker')).toBeVisible();await close();await node('placement-root').click({position:{x:90,y:110}});await expect(image).toBeVisible();await expect(page.getByTestId('mention-picker')).toHaveCount(0);await close();
 // A stale child-menu flag would block the canvas keyboard layer even after
 // the editor unmounts. Verify the actual hand/move shortcuts, not just the DOM.
 await page.getByTestId('canvas-drop-zone').click({position:{x:1200,y:400}});await page.keyboard.press('h');
 await expect(page.getByTestId('canvas-main-toolbar').locator('[data-tool="hand"]')).toHaveAttribute('aria-pressed','true');await page.keyboard.press('v');
 await expect(page.getByTestId('canvas-main-toolbar').locator('[data-tool="move"]')).toHaveAttribute('aria-pressed','true');pass('switching away disposes text-only menus and releases real canvas keyboard commands');
 await close();await node('placement-root').click({position:{x:90,y:110}});await image.getByRole('button',{name:/· 1K/}).click();await expect(parameters).toBeVisible();await page.keyboard.press('Escape');await expect(parameters).toHaveCount(0);await close();pass('ratio portal is dismissed and no detached parameter overlay remains');
 await node('text-history').click({position:{x:90,y:15}});await expect(text).toBeVisible();
 const layouts=[];
 for(const viewport of [{width:1440,height:1000},{width:1093,height:614},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(600);
  const read=()=>page.evaluate(()=>{const box=id=>{const el=document.querySelector(`[data-testid="${id}"]`);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return {dock:box('text-node-dock'),toolbar:box('text-node-toolbar'),view:{width:innerWidth,height:innerHeight}}});
  await expect.poll(async()=>{const v=await read();return !!v.dock&&v.dock.x>=-1&&v.dock.right<=v.view.width+1&&v.dock.y>=-1&&v.dock.bottom<=v.view.height+1;}).toBe(true);
  const measured=await read();assert.ok(measured.dock.height>=218);if(measured.toolbar)assert.ok(measured.dock.bottom<=measured.toolbar.y+1||measured.toolbar.bottom<=measured.dock.y+1);
  layouts.push(measured);await page.screenshot({path:path.join(out,`text-${viewport.width}x${viewport.height}.png`)});pass(`actual text composer bounds and toolbar separation ${viewport.width}x${viewport.height}`);
 }
 await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(350);await text.evaluate(el=>{el.style.height='320px';});
 await expect.poll(()=>text.locator('textarea').evaluate(el=>parseFloat(el.style.height))).toBeGreaterThanOrEqual(112);
 await text.getByRole('button',{name:'展开文字编辑窗口',exact:true}).click();await text.getByRole('button',{name:'收起文字编辑窗口',exact:true}).click();
 assert.equal(await text.evaluate(el=>el.style.height),'');pass('browser-restored native resize height is measured and cleared on expand-collapse');
 assert.deepEqual(errors,[]);assert.equal((await state()).paidCalls,0);await page.screenshot({path:path.join(out,'composers-verified.png')});
 await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,errors,quotes,layouts,actualNext:true,api:'local-fixture',state:await state()},null,2));
 console.log(`CANVAS_COMPOSERS_BROWSER=PASS checks=${checks.length} ACTUAL_NEXT=1 IMAGE_PENDING_TEXT=PASS PRICING_INPUTS=PASS DRAFTS=ISOLATED REFERENCES=ORIGINAL_COMMAND SUPPLIER=0`);
}catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),checks,errors,body:await page.locator('body').innerText(),state:await state()},null,2));throw error;}finally{await browser.close();}
