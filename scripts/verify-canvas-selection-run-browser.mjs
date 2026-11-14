import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect as rawExpect} from '@playwright/test';
const expect=rawExpect.configure({timeout:45000});
const base=process.env.CANVAS_SELECTION_BASE||'http://127.0.0.1:4797';
assert.equal(new URL(base).hostname,'127.0.0.1','Isolated local fixture only');
const out=process.env.CANVAS_SELECTION_EVIDENCE;if(!out)throw Error('Evidence directory required');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),checks=[],errors=[],networkErrors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>networkErrors.push({url:r.url(),error:r.failure()?.errorText}));
const fixtureTexts=[{id:'text-selection-1',projectKey:'tree:selection-root',title:'文字一',content:'第一个节点的文字要求',prompt:'第一个节点的文字要求',status:'completed',canvasX:1030,canvasY:70,width:300,height:160,sourceIds:[],targetIds:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:'text-selection-2',projectKey:'tree:selection-root',title:'文字二',content:'第二个节点的文字要求',prompt:'第二个节点的文字要求',status:'completed',canvasX:1030,canvasY:360,width:300,height:160,sourceIds:[],targetIds:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}];
const control=body=>fetch(base+'/__fixture/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,...(body.reset&&!body.texts?{texts:fixtureTexts}:{})})});
const state=()=>fetch(base+'/__fixture/state').then(r=>r.json());
const pass=s=>{checks.push(s);console.log('PASS '+s);};
const node=id=>page.locator(`.react-flow__node[data-id="${id}"]`);
// Server reset discards fixture jobs; discard only this isolated page's old receipts too.
async function load(){if(page.url().startsWith(base))await page.evaluate(()=>sessionStorage.clear());await page.goto(base+'/canvas');await expect(node('selection-root')).toBeVisible();await expect(page.locator('.react-flow__node')).toHaveCount(7);await page.waitForTimeout(500);}
async function boxSelect(ids){
 const boxes=await Promise.all(ids.map(id=>node(id).boundingBox()));assert.ok(boxes.every(Boolean));
 const pane=await page.locator('.react-flow__pane').boundingBox();
 const from={x:Math.min(...boxes.map(b=>b.x))-12,y:Math.min(...boxes.map(b=>b.y))-16},to={x:Math.max(...boxes.map(b=>b.x+b.width))+12,y:Math.max(...boxes.map(b=>b.y+b.height))+12};
 assert.ok(from.x>pane.x&&from.y>pane.y&&to.x<pane.x+pane.width&&to.y<pane.y+pane.height,JSON.stringify({pane,from,to}));
 await page.keyboard.down('Shift');await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:18});await page.mouse.up();await page.keyboard.up('Shift');
 await expect.poll(()=>page.locator('.react-flow__node.selected').evaluateAll(els=>els.map(e=>e.dataset.id).sort())).toEqual([...ids].sort());
}
const ids=['selection-1','selection-2','selection-3','selection-4'];
try{
 await control({reset:true,hold:true,settings:{},failSource:''});await load();await boxSelect(ids);
 const run=page.getByTestId('canvas-selection-run');await expect(run).toBeVisible();assert.equal(await run.evaluate(el=>el.closest('[data-batch-scroll]')===null),true);
 await page.screenshot({path:path.join(out,'selection-desktop.png')});
 // Two synchronous native clicks simulate the event gap before state rerender.
 await run.evaluate(el=>{el.click();el.click();});
 await expect.poll(async()=>(await state()).requests.filter(r=>r.kind==='image').length).toBe(4);await expect(run).toBeDisabled();await page.waitForTimeout(500);
 assert.equal((await state()).requests.filter(r=>r.kind==='image').length,4);await expect(page.locator('[data-testid="generation-placeholder"][data-stage="queued"]')).toHaveCount(4);assert.equal(await page.getByRole('progressbar').count(),0);pass('real Shift marquee + pinned action + double-click guard + all four slots queued without percentages');
 await page.screenshot({path:path.join(out,'selection-running.png')});
 await control({hold:false});await expect.poll(async()=>(await state()).requests.filter(r=>r.kind==='image').length).toBe(4);await expect(run).toBeEnabled();
 let snapshot=await state(),calls=snapshot.requests.filter(r=>r.kind==='image');assert.deepEqual(calls.map(c=>c.body.sourceNodeId).sort(),ids);
 for(const c of calls){const i=Number(c.body.sourceNodeId.split('-').at(-1))-1;assert.ok(c.body.prompt.startsWith('node-prompt-'+(i+1)));assert.equal(c.body.parameters.ratio,i%2?'3:4':'1:1');assert.equal(c.body.parameters.resolution,i%2?'2K':'1K');assert.equal(c.body.variants,1);}
 assert.equal(snapshot.peak,4);await expect(page.locator('.react-flow__node.selected')).toHaveCount(4);pass('four selected nodes only + individual prompt/ratio/resolution + no root run + selection preserved');
 await control({reset:true,hold:false,failSource:'selection-2',settings:{'selection-3':{locked:true,order:0,text:{fontSize:12,fontWeight:'400',color:null,align:'left',lineHeight:1.65}}}});await load();await boxSelect(ids);await run.click();
 await expect.poll(async()=>(await state()).requests.filter(r=>r.kind==='image').length).toBe(3);await expect(run).toBeEnabled();
 snapshot=await state();assert.deepEqual(snapshot.requests.filter(r=>r.kind==='image').map(c=>c.body.sourceNodeId).sort(),['selection-1','selection-2','selection-4']);assert.equal(snapshot.images.filter(a=>a.id.startsWith('result-')).length,2);pass('locked node skipped + one failure does not abort remaining nodes');
 await control({reset:true,hold:false,settings:{},failSource:'',texts:[{id:'text-selection-1',projectKey:'tree:selection-root',title:'文字一',content:'第一个节点的文字要求',prompt:'第一个节点的文字要求',status:'completed',canvasX:1030,canvasY:70,width:300,height:160,sourceIds:[],targetIds:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:'text-selection-2',projectKey:'tree:selection-root',title:'文字二',content:'第二个节点的文字要求',prompt:'第二个节点的文字要求',status:'completed',canvasX:1030,canvasY:360,width:300,height:160,sourceIds:[],targetIds:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]});await load();await boxSelect(['text-selection-1','text-selection-2']);await run.click();
 await expect.poll(async()=>(await state()).requests.filter(r=>r.kind==='text').length).toBe(2);await expect(run).toBeEnabled();snapshot=await state();assert.deepEqual(snapshot.requests.filter(r=>r.kind==='text').map(c=>c.body.prompt).sort(),['第一个节点的文字要求','第二个节点的文字要求'].sort());pass('text selection uses native text requests per node');
 await control({reset:true,hold:false,settings:{},failSource:''});await load();await boxSelect(['selection-1','selection-2']);await node('text-selection-1').click({position:{x:40,y:60},modifiers:['Control']});await expect(page.locator('.react-flow__node.selected')).toHaveCount(3);
 await expect(page.getByTestId('mixed-node-batch-bar')).toBeVisible();await run.click();await expect.poll(async()=>(await state()).requests.length).toBe(3);await expect(run).toBeEnabled();
 snapshot=await state();assert.deepEqual(snapshot.requests.map(r=>r.kind).sort(),['image','image','text']);pass('mixed image/text selection runs each native node type once');
 await control({reset:true,hold:false,settings:{},failSource:''});await load();await boxSelect(['selection-1','selection-2']);
 await page.getByRole('button',{name:'合并生成节点',exact:true}).click();const pending=page.locator('.react-flow__node[data-id^="pend-"]');await expect(pending).toHaveCount(1);const pendId=await pending.getAttribute('data-id');
 await node('selection-1').click({position:{x:50,y:50},modifiers:['Control']});await pending.click({position:{x:15,y:30},modifiers:['Control']});
 await expect.poll(()=>page.locator('.react-flow__node.selected').count()).toBe(2);await run.click();
 await expect.poll(async()=>(await state()).requests.filter(r=>r.kind==='image').length).toBe(2);await expect(pending).toHaveCount(0);snapshot=await state();
 assert.equal(snapshot.requests.filter(r=>r.kind==='image'&&r.body.sourceNodeId==='selection-1').length,2);assert.ok(pendId.startsWith('pend-'));pass('selected pending node reuses linked inputs without running unselected ancestors');
 await control({reset:true,hold:true,settings:{},failSource:''});await load();await boxSelect(ids);
 await page.setViewportSize({width:390,height:844});await expect(run).toBeVisible();
 const bar=page.getByTestId('image-batch-bar'),rect=await bar.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390.5,JSON.stringify(rect));
 const before=await run.boundingBox();await bar.locator('[data-batch-scroll]').evaluate(el=>el.scrollLeft=el.scrollWidth);const after=await run.boundingBox();assert.deepEqual(after,before);await page.screenshot({path:path.join(out,'selection-mobile.png')});pass('390px action remains visible while other actions scroll');
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'browser-result.json'),JSON.stringify({result:'PASS',checks,errors,providerCalls:0},null,2));console.log('BROWSER=PASS MARQUEE=REAL IMAGE_TEXT_MIXED_PENDING_RUN=PASS MOBILE=390px PROVIDER_CALLS=0');
}catch(e){await page.screenshot({path:path.join(out,'browser-failure.png')}).catch(()=>{});await writeFile(path.join(out,'browser-failure.json'),JSON.stringify({checks,errors,networkErrors,body:await page.locator('body').innerText().catch(()=>''),state:await state()},null,2));throw e;}
finally{await browser.close();}
