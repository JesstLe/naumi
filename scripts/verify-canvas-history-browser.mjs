// Actual Next/Canvas with the shared placement fixture in HISTORY mode.
import {chromium,expect as rawExpect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.CANVAS_FIXTURE_URL||'http://127.0.0.1:14345';assert.equal(new URL(base).hostname,'127.0.0.1');
const textDocument=process.env.CANVAS_VERIFY_TEXT_DOCUMENT==='1';
const out=path.resolve(process.env.CANVAS_HISTORY_EVIDENCE||'output/refactor-r3b-20261024/browser');await mkdir(out,{recursive:true});
const expect=rawExpect.configure({timeout:30000}),checks=[],errors=[];
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const state=()=>fetch(base+'/__fixture/state').then(r=>r.json());
const node=id=>page.locator(`.react-flow__node[data-id="${id}"]`);
const points=async()=>{const s=await state();return Object.fromEntries([...s.artworks,...s.texts].map(n=>[n.id,{x:n.canvasX,y:n.canvasY}]))};
const pass=name=>{checks.push(name);console.log('PASS '+name)};
try {
 await fetch(base+'/__fixture/reset');await page.goto(base+'/canvas',{waitUntil:'domcontentloaded',timeout:60000});
 await expect(node('placement-root')).toBeVisible();await expect(node('text-history')).toBeVisible();
 const assistant=page.getByRole('button',{name:'收起助手',exact:true});if(await assistant.isVisible())await assistant.click();
 const toolbar=page.getByTestId('canvas-main-toolbar'),undo=toolbar.locator('[data-tool="undo"]'),redo=toolbar.locator('[data-tool="redo"]');
 await expect(undo).toBeDisabled();const before=await points();
 await page.getByTestId('canvas-view-toolbar').getByRole('button',{name:'整理画布',exact:true}).click();
 await expect.poll(async()=>(await state()).historyApplied.length).toBe(1);await expect(undo).toBeEnabled();
 const arranged=await points();assert.notDeepEqual(arranged,before);assert.ok((await state()).history[0].operations.some(op=>op.text));pass('mixed image/text tidy is one committed history step');
 await fetch(base+'/__fixture/fail-history');await undo.click();
 await expect.poll(async()=>(await state()).history.length).toBe(2);await expect(undo).toBeEnabled();await expect(redo).toBeDisabled();assert.deepEqual(await points(),arranged);pass('rejected undo retains document and undo entry');
 await undo.click();await expect.poll(async()=>(await state()).historyApplied.length).toBe(2);await expect(redo).toBeEnabled();assert.deepEqual(await points(),before);
 const attempts=(await state()).history;assert.deepEqual(attempts[1],attempts[2]);pass('explicit retry uses original operation and restores all node positions');
 await redo.click();await expect.poll(async()=>(await state()).historyApplied.length).toBe(3);assert.deepEqual(await points(),arranged);pass('redo persists the forward step and restores arranged positions');
 await node('text-history').click({position:{x:100,y:25}});const editor=node('text-history').getByRole('textbox',{name:'编辑生成文本'});await expect(editor).toBeVisible();
 await editor.fill('R3B 真实控件改写后的文案');await editor.press('Tab');
 await expect.poll(async()=>(await state()).textSaves.length).toBeGreaterThan(0);await expect(undo).toBeEnabled();
 await undo.click();await expect.poll(async()=>(await state()).texts[0].content).toBe('原始文字');await expect(editor).toHaveValue('原始文字');pass('actual blur saves text and undo restores focus-time content');
 await redo.click();await expect.poll(async()=>(await state()).texts[0].content).toBe('R3B 真实控件改写后的文案');await expect(editor).toHaveValue('R3B 真实控件改写后的文案');pass('text redo updates persisted and visible document together');
 await page.reload({waitUntil:'domcontentloaded'});await expect(node('text-history')).toBeVisible();await expect(node('text-history').getByRole('textbox',{name:'编辑生成文本'})).toHaveValue('R3B 真实控件改写后的文案');pass('saved text reloads through normal document loading');
 if(textDocument){
  const edit=node('text-history').getByRole('textbox',{name:'编辑生成文本'});
  await fetch(base+'/__fixture/text-failure?save=1');await edit.fill('保存失败后仍要保留的草稿');await edit.press('Tab');
  await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();assert.equal((await state()).texts[0].content,'R3B 真实控件改写后的文案');pass('failed text save retains visible draft and exposes original retry');
  await page.reload({waitUntil:'domcontentloaded'});await expect(edit).toHaveValue('保存失败后仍要保留的草稿');await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();pass('reload restores dirty draft over older persisted text');
  await fetch(base+'/__fixture/text-failure');await page.getByRole('button',{name:'重试保存',exact:true}).click();await expect.poll(async()=>(await state()).texts[0].content).toBe('保存失败后仍要保留的草稿');await expect(page.getByRole('button',{name:'重试保存',exact:true})).toHaveCount(0);pass('retry writes latest recovered draft then clears unsaved state');
  await fetch(base+'/__fixture/text-failure?read=1');await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByTestId('canvas-text-load-error')).toBeVisible();await expect(edit).toHaveValue('保存失败后仍要保留的草稿');pass('read failure keeps cached text visible and shows explicit load error');
  await fetch(base+'/__fixture/text-failure');await page.getByRole('button',{name:'重新加载文字',exact:true}).click();await expect(page.getByTestId('canvas-text-load-error')).toHaveCount(0);await expect(edit).toHaveValue('保存失败后仍要保留的草稿');pass('read retry restores ready state without erasing document');
 }
 assert.equal((await state()).submissions.length,0);assert.equal((await state()).paidCalls,0);assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(out,'history-verified.png')});
 await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,errors,state:await state(),actualCanvas:true,actualController:true,api:'local-fixture',database:false,supplier:0},null,2));
 console.log(`CANVAS_HISTORY_BROWSER=PASS CHECKS=${checks.length} ACTUAL_NEXT_CANVAS=1 MIXED_UNDO=PASS REJECTED_SAVE=RETAINED TEXT_EDIT=PASS GENERATION_POSTS=0 SUPPLIER=0${textDocument?' TEXT_DRAFT_RECOVERY=PASS READ_FAILURE=RETAINED':''}`);
} catch(error) {await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),checks,errors,body:await page.locator('body').innerText(),state:await state()},null,2));throw error;}
finally{await browser.close();}
