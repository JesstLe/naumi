/** Full packaged controls -> shared history HTTP -> original PostgreSQL rows.
 * No route mocks, injected application state, new writer or paid operation. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function verifyCanvasNodePreferencesBrowser({page,expect,out,snapshot,preferences,stats,open,requests}){
 await mkdir(out,{recursive:true});const checks=[],pass=name=>{checks.push(name);console.log('PASS '+name);};
 const initial=await snapshot(),supplier=await stats(),before=await preferences(),id='text-r6c';
 await open(page);const node=page.locator(`.react-flow__node[data-id="${id}"]`),field=node.getByRole('textbox',{name:'编辑生成文本',exact:true}),toolbar=page.getByTestId('canvas-main-toolbar');
 const settings=async()=>(await preferences()).settings[id],panel=page.getByTestId('node-properties-panel'),bar=page.getByTestId('text-node-toolbar');
 const postStart=requests.length,historyPosts=()=>requests.slice(postStart).filter(r=>r.path==='/api/canvas/history'&&r.method==='POST');
 await page.keyboard.press('Escape');await toolbar.locator('[data-tool="move"]').click();await node.getByTestId('text-node-title').click();await expect(bar).toBeVisible();
 await bar.getByRole('button',{name:'文字样式',exact:true}).click();await expect(panel).toBeVisible();
 await panel.getByRole('combobox',{name:'字号',exact:true}).selectOption('24');await panel.getByRole('combobox',{name:'字重',exact:true}).selectOption('700');await panel.getByRole('button',{name:'居中',exact:true}).click();
 assert.equal((await preferences()).historyOperations,before.historyOperations);await panel.getByRole('button',{name:'应用样式',exact:true}).click();
 await expect.poll(async()=>(await settings())?.text.fontSize).toBe(24);await expect(field).toHaveCSS('font-size','24px');await expect(field).toHaveCSS('font-weight','700');await expect(field).toHaveCSS('text-align','center');
 assert.equal(historyPosts().length,1);pass('real staged style controls commit one original history action and render canonical PG text style');
 await panel.getByRole('button',{name:'收起属性',exact:true}).click();
 await toolbar.locator('[data-tool="undo"]').click();await expect.poll(async()=>(await settings())?.text.fontSize).toBe(12);await expect(field).toHaveCSS('font-size','12px');
 await toolbar.locator('[data-tool="redo"]').click();await expect.poll(async()=>(await settings())?.text.fontSize).toBe(24);await expect(field).toHaveCSS('font-size','24px');pass('style undo and redo use the existing shared stack and original PG history endpoint');
 const command=async action=>{await bar.getByRole('button',{name:'更多节点操作',exact:true}).click();const menu=page.getByTestId('canvas-node-action-menu');await expect(menu).toBeVisible();await menu.locator(`[data-action="${action}"]`).click();};
 await command('lock-node');await expect.poll(async()=>(await settings())?.locked).toBe(true);await expect(field).toHaveAttribute('readonly','');await expect(node).not.toHaveClass(/draggable/);pass('real lock command freezes text editing and Flow movement without discarding style');
 const count=historyPosts().length;await bar.getByRole('button',{name:'文字样式',exact:true}).click();await expect(panel.getByRole('combobox',{name:'字号',exact:true})).toBeDisabled();await expect(panel.getByRole('button',{name:'应用样式',exact:true})).toBeDisabled();assert.equal(historyPosts().length,count);await panel.getByRole('button',{name:'收起属性',exact:true}).click();
 await command('lock-node');await expect.poll(async()=>(await settings())?.locked).toBe(false);await expect(field).not.toHaveAttribute('readonly','');await expect(node).toHaveClass(/draggable/);assert.equal((await settings()).text.fontSize,24);pass('locked properties do not save and actual unlock restores editing with acknowledged style intact');
 const max=Math.max(0,...Object.values((await preferences()).settings).map(s=>s.order));await command('front-node');await expect.poll(async()=>(await settings())?.order).toBe(Math.min(100000,max+1));await expect(node).toHaveCSS('z-index',String(Math.min(100000,max+1)));
 const min=Math.min(0,...Object.values((await preferences()).settings).map(s=>s.order));await command('back-node');await expect.poll(async()=>(await settings())?.order).toBe(Math.max(-100000,min-1));await expect(node).toHaveCSS('z-index',String(Math.max(-100000,min-1)));pass('front and back controls persist original bounded ordering and actual Flow z-index');
 await toolbar.locator('[data-tool="undo"]').click();await expect.poll(async()=>(await settings())?.order).toBe(Math.min(100000,max+1));await toolbar.locator('[data-tool="redo"]').click();await expect.poll(async()=>(await settings())?.order).toBe(Math.max(-100000,min-1));pass('layer changes share the same one-action undo and redo rather than a parallel save queue');
 const saved=await settings();await page.reload({waitUntil:'domcontentloaded'});await expect(field).toHaveCSS('font-size','24px');await expect(field).toHaveCSS('text-align','center');await expect(node).toHaveCSS('z-index',String(saved.order));assert.deepEqual(await settings(),saved);pass('full product refresh reloads persisted style, unlocked state and exact layer from the original settings GET');
 const final=await snapshot(),after=await preferences(),posts=historyPosts();assert.equal(posts.length,9);assert.equal(after.historyOperations-before.historyOperations,9);
 const bodies=posts.map(r=>JSON.parse(r.body));assert.equal(new Set(bodies.map(b=>b.operationId)).size,9);for(const b of bodies){assert.equal(b.operations.length,1);assert.equal(b.operations[0].type,'node-settings');assert.equal(b.operations[0].id,id);assert.equal(b.operations[0].text,true);}
 assert.deepEqual(final.ledger,initial.ledger);assert.deepEqual(final.jobs,initial.jobs);assert.deepEqual(final.artworks,initial.artworks);assert.deepEqual(final.texts,initial.texts);assert.deepEqual(await stats(),supplier);assert.ok(!requests.slice(postStart).some(r=>/node-settings/.test(r.path)&&r.method!=='GET'));
 pass('all nine attribute writes use original history only; original pixels,text,task receipts and seven42-credit debits remain exact');
 await page.screenshot({path:path.join(out,'node-preferences-full-product.png')});await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,actualFullProduct:true,realPG:true,routeMocks:0,historyOperations:9,bodies,settings:saved,supplierAdded:0,consumeAdded:0,originalStateExact:true},null,2)+'\n');
 console.log('CANVAS_NODE_PREFERENCES_BROWSER=PASS CHECKS='+checks.length+' REAL_PG=1 ORIGINAL_HTTP=1 HISTORY_WRITES=9 PARALLEL_WRITERS=0 SUPPLIER_ADDED=0 CONSUME_ADDED=0');return checks;
}
