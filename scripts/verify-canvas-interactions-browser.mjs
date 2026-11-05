// Real Next and React Flow, local fixture API. Not production or paid-provider acceptance.
import {chromium,expect as rawExpect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.CANVAS_FIXTURE_URL||'http://127.0.0.1:14356',out=path.resolve(process.env.INTERACTION_BROWSER_EVIDENCE||'output/refactor-r3c2-20261024/browser');assert.equal(new URL(base).hostname,'127.0.0.1');await mkdir(out,{recursive:true});
const expect=rawExpect.configure({timeout:30000}),checks=[],errors=[],browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const state=async()=>await(await fetch(base+'/__fixture/state')).json(),node=id=>page.locator(`.react-flow__node[data-id="${id}"]`),point=id=>node(id).evaluate(el=>{const m=new DOMMatrix(el.style.transform);return {x:m.e,y:m.f}}),pass=s=>{checks.push(s);console.log('PASS '+s);};
const toolbar=page.getByTestId('canvas-main-toolbar'),undo=toolbar.locator('[data-tool="undo"]'),redo=toolbar.locator('[data-tool="redo"]');
async function closeDocks(){for(const testId of ['image-node-dock','text-node-dock','pending-node-dock']){const button=page.getByTestId(testId).getByRole('button',{name:'关闭创作栏',exact:true});if(await button.isVisible())await button.click();}}
async function open(){await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});await expect(node('placement-root')).toBeVisible();await expect(node('text-history')).toBeVisible();const assistant=page.getByRole('button',{name:'收起助手',exact:true});if(await assistant.isVisible())await assistant.click();}
async function drag(id,dx,dy){const box=await node(id).boundingBox(),x=box.x+Math.min(90,box.width*.25),y=box.y+(id.startsWith('text-')?15:Math.min(95,box.height*.4));await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:12});await page.mouse.up();}
async function link(source,target){await closeDocks();await node(source).hover();const from=node(source).locator('.react-flow__handle.source'),to=node(target).locator('.react-flow__handle.target');const a=await from.boundingBox(),b=await to.boundingBox();assert.ok(a&&b);await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:16});await page.mouse.up();}
try{
 await fetch(base+'/__fixture/reset');await open();await expect(undo).toBeDisabled();
 const root='placement-root',second='placement-second',text='text-history';
 const before=await point(root);await fetch(base+'/__fixture/fail-history');await drag(root,60,35);
 await expect.poll(async()=>(await state()).history.length).toBe(1);await expect.poll(()=>point(root)).toEqual(before);await expect(undo).toBeDisabled();assert.equal((await state()).artworks[0].canvasX,100);pass('single image rejection rolls back view and creates no undo');
 await drag(root,60,35);await expect.poll(async()=>(await state()).historyApplied.length).toBe(1);await expect(undo).toBeEnabled();const moved=await point(root);assert.notDeepEqual(moved,before);assert.equal((await state()).positions.length,0);pass('single image motion uses only atomic history');
 await closeDocks();await undo.click();await expect.poll(()=>point(root)).toEqual(before);await redo.click();await expect.poll(()=>point(root)).toEqual(moved);pass('actual drag undo and redo preserve positions');
 // Multi-selection initiated on an already-selected node goes through NodeDragStop's third argument.
 await closeDocks();await node(root).click({position:{x:90,y:95}});await node(second).click({position:{x:90,y:95},modifiers:['Control']});await expect(node(root)).toHaveClass(/selected/);await expect(node(second)).toHaveClass(/selected/);
 const multiBefore=(await state()).historyApplied.length;await drag(root,45,25);await expect.poll(async()=>(await state()).historyApplied.length).toBe(multiBefore+1);assert.equal((await state()).historyApplied.at(-1).operations.filter(op=>op.type==='position').length,2);pass('Ctrl multi-selection drag commits one two-node history step');
 for(const modifier of ['Meta','Shift']){
  await page.reload({waitUntil:'domcontentloaded'});await expect(node(root)).toBeVisible();await node(root).click({position:{x:90,y:95}});await node(second).click({position:{x:90,y:95},modifiers:[modifier]});await expect(node(root)).toHaveClass(/selected/);await expect(node(second)).toHaveClass(/selected/);
 }pass('Meta and Shift preserve multi-selection semantics');
 // Fresh view after group assignment retains group-click selection and movement.
 await fetch(base+'/__fixture/group?enabled=1');await page.reload({waitUntil:'domcontentloaded'});await expect(node(root)).toBeVisible();await node(root).click({position:{x:90,y:95}});await expect(node(second)).toHaveClass(/selected/);await closeDocks();
 const groupBefore=(await state()).historyApplied.length;await drag(root,32,20);await expect.poll(async()=>(await state()).historyApplied.length).toBe(groupBefore+1);assert.equal((await state()).historyApplied.at(-1).operations.length,2);pass('named group selects and moves both nodes with one commit');
 await fetch(base+'/__fixture/group?enabled=0');await page.reload({waitUntil:'domcontentloaded'});await expect(node(root)).toBeVisible();
 const linkBefore=(await state()).historyApplied.length;await link(root,second);await expect.poll(async()=>(await state()).historyApplied.length).toBe(linkBefore+1);await expect.poll(async()=>(await state()).artworks[1].parentIds).toEqual([root]);
 await closeDocks();await undo.click();await expect.poll(async()=>(await state()).artworks[1].parentIds).toEqual([]);assert.equal((await state()).artworks[1].parentId,root);await redo.click();await expect.poll(async()=>(await state()).artworks[1].parentIds).toEqual([root]);pass('actual image link undo/redo keeps hidden project membership');
 await link(root,text);await expect.poll(async()=>(await state()).texts[0].sourceIds).toEqual([root]);await expect(node(text).getByTitle('@主图')).toBeVisible();pass('actual image-to-text handle link updates the saved and visible reference');
 // Select the SVG path, then delete just that edge. Text remains intact.
 const edgePaths=page.locator('.react-flow__edge');let picked=false;
 for(let i=0;i<await edgePaths.count();i++){const el=edgePaths.nth(i),id=await el.getAttribute('data-id');if(id?.includes(root)&&id?.includes(text)){await el.locator('.react-flow__edge-interaction').click({force:true});picked=true;break;}}
 assert.ok(picked,'rendered image/text edge found');await page.keyboard.press('Delete');await expect.poll(async()=>(await state()).texts[0].sourceIds).toEqual([]);await expect(node(text)).toBeVisible();pass('Delete cuts only selected reference without deleting text node');
 await closeDocks();const beforeText=await point(text),beforeHistory=(await state()).historyApplied.length;await drag(text,40,-25);await expect.poll(async()=>(await state()).historyApplied.length).toBe(beforeHistory+1);assert.notDeepEqual(await point(text),beforeText);assert.equal((await state()).historyApplied.at(-1).operations[0].text,true);pass('text drag uses same history writer');
 const copy={...(await state()).texts[0],id:'text-second',title:'批量文字',canvasX:620,canvasY:650};await fetch(base+'/api/canvas/text-nodes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(copy)});
 await page.reload({waitUntil:'domcontentloaded'});await expect(node('text-second')).toBeVisible();await node(text).click({position:{x:90,y:15}});await node('text-second').click({position:{x:90,y:15},modifiers:['Control']});
 await expect(node(text)).toHaveClass(/selected/);await expect(node('text-second')).toHaveClass(/selected/);const productBefore=(await state()).historyApplied.length;
 await link(root,text);await expect.poll(async()=>(await state()).historyApplied.length).toBe(productBefore+1);assert.equal((await state()).historyApplied.at(-1).operations.length,2);assert.deepEqual((await state()).texts.map(t=>t.productIds),[[root],[root]]);
 await closeDocks();await undo.click();await expect.poll(async()=>(await state()).texts.map(t=>t.productIds)).toEqual([[],[]]);pass('two text product bindings commit and undo atomically');
 // A lost response is recovered using its receipt before the next requested movement.
 await page.reload({waitUntil:'domcontentloaded'});await expect(node(root)).toBeVisible();const count=(await state()).history.length;await fetch(base+'/__fixture/lose-history-response');await drag(root,25,15);await expect.poll(async()=>(await state()).history.length).toBe(count+1);
 await page.waitForTimeout(150);await drag(root,55,30);await expect.poll(async()=>(await state()).history.length).toBe(count+3);const requests=(await state()).history;assert.deepEqual(requests[count],requests[count+1]);assert.notEqual(requests[count+2].operationId,requests[count].operationId);pass('unknown response recovers original operation before the next gesture');
 assert.equal((await state()).submissions.length,0);assert.equal((await state()).paidCalls,0);assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(out,'interactions-verified.png')});await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,errors,state:await state(),actualNext:true,api:'local-fixture',supplier:0},null,2));
 console.log(`CANVAS_INTERACTIONS_BROWSER=PASS checks=${checks.length} ACTUAL_NEXT=1 SELECTION=PASS DRAG=PASS LINKS=PASS UNDO_REDO=PASS UNKNOWN=ORIGINAL_OPERATION SUPPLIER=0`);
}catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),checks,errors,body:await page.locator('body').innerText(),state:await state()},null,2));throw error;}
finally{await browser.close();}
