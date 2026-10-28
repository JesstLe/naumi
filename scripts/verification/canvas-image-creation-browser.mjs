/** Real packaged Canvas -> original public HTTP -> Worker -> PG/artifacts/
 * ledger. No browser route mocks, DOM fixture, direct generation API call or
 * synthetic callback replaces the actual creative-mode application. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function verifyCanvasImageCreationBrowser({page,expect,out,snapshot,stats,open}){
 await mkdir(out,{recursive:true});const checks=[],stages=[];
 const pass=name=>{checks.push(name);console.log('PASS '+name);};
 const dock=page.getByTestId('image-node-dock');
 async function select(){
  await open(page);
  const root=page.locator('.react-flow__node[data-id="r6c-root"]');await root.click({position:{x:90,y:100}});
  await expect(dock).toBeVisible();return dock;
 }
 async function mode(label){await dock.getByRole('button',{name:/^(普通|详情图|三视图合成|三视图节点)$/}).click();await page.getByRole('button',{name:label,exact:true}).click();}
 const fresh=(state,before)=>state.artworks.filter(row=>!before.artworks.some(old=>old.id===row.id)&&!row.deleted_at);
 async function done(before,count){
  await expect.poll(async()=>fresh(await snapshot(),before).length,{timeout:90000}).toBe(count);
  await expect(page.getByTestId('generation-placeholder')).toHaveCount(0,{timeout:90000});
  await expect(page.getByRole('status').filter({hasText:'重新生成中'})).toHaveCount(0,{timeout:90000});
  await expect.poll(()=>page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('naumi:imagegen-pending:v1:')).length),{timeout:90000}).toBe(0);
  await expect.poll(async()=>(await snapshot()).ledger.n).toBe(before.ledger.n+count);
  const state=await snapshot();assert.deepEqual(state.ledger,{n:before.ledger.n+count,amount:before.ledger.amount+count*6});return state;
 }
 const original=await snapshot(),originalStats=await stats();
 await select();await mode('正 / 侧 / 背子节点');await dock.getByRole('textbox',{name:'节点提示词',exact:true}).fill('R6P 三个视图保持原产品外观');
 const splitBefore=await snapshot(),splitStats=await stats();await dock.getByTestId('generation-submit-action').click();const split=await done(splitBefore,3);
 await expect.poll(async()=>fresh(await snapshot(),splitBefore).map(row=>row.title).sort()).toEqual(['侧面视图','正面视图','背面视图'].sort());
 const views=fresh(await snapshot(),splitBefore),anchor=views.find(row=>row.title==='正面视图');
 assert.ok(anchor);for(const row of views){assert.equal(row.parent_id,'r6c-root');if(row.id!==anchor.id)assert.ok(row.parent_ids.includes(anchor.id),'side/back retain delivered front anchor lineage');}
 assert.equal((await stats()).edits-splitStats.edits,3);assert.equal((await stats()).calls,splitStats.calls);
 stages.push({kind:'split',artworks:views.map(({id,title,parent_id,parent_ids})=>({id,title,parent_id,parent_ids})),ledger:split.ledger});
 pass('three-view mode creates real front/side/back artifacts with original source and delivered anchor lineage');
 pass('three-view stages charge exactly three six-credit operations through the original Worker');

 await select();await mode('普通生成');await dock.getByRole('textbox',{name:'节点提示词',exact:true}).fill('R6W 橙色小熊站在窗台，柔和光照');
 const retryBefore=await snapshot(),retryStats=await stats(),originalNode=retryBefore.artworks.find(row=>row.id==='r6c-root');
 await expect(dock.getByTestId('generation-submit-action')).toContainText('重新生成');await dock.getByTestId('generation-submit-action').click();
 const retried=await done(retryBefore,1),version=fresh(retried,retryBefore)[0],current=retried.artworks.find(row=>row.id==='r6c-root');
 assert.equal(version.source_url,'canvas-node-version');assert.equal(current.canvas_image_version.id,version.id);assert.equal(current.image_url,originalNode.image_url);assert.equal(current.canvas_x,originalNode.canvas_x);assert.equal(current.canvas_y,originalNode.canvas_y);assert.equal((await stats()).calls-retryStats.calls,1);assert.equal((await stats()).edits,retryStats.edits);
 stages.push({kind:'regenerate',artwork:version,ledger:retried.ledger});
 pass('ordinary primary action keeps original node/media/geometry and saves one hidden output version at the original price');
 const versionStats=await stats(),versionLedger=(await snapshot()).ledger;
 await dock.getByTestId('image-version-control').click();await page.locator('[data-version-id="initial"]').click();await expect.poll(async()=>(await snapshot()).artworks.find(row=>row.id==='r6c-root').canvas_image_version.id).toBe('initial');
 const close=page.getByRole('button',{name:'关闭创作栏',exact:true});if(await close.isVisible())await close.click();const toolbar=page.getByTestId('canvas-main-toolbar');
 await toolbar.locator('[data-tool="undo"]').click();await expect.poll(async()=>(await snapshot()).artworks.find(row=>row.id==='r6c-root').canvas_image_version.id).toBe(version.id);
 await toolbar.locator('[data-tool="redo"]').click();await expect.poll(async()=>(await snapshot()).artworks.find(row=>row.id==='r6c-root').canvas_image_version.id).toBe('initial');
 assert.deepEqual(await stats(),versionStats);assert.deepEqual((await snapshot()).ledger,versionLedger);pass('real version selector and shared undo/redo change only original display with no new generation or debit');

 await select();await mode('三视图合成图');await dock.getByRole('textbox',{name:'节点提示词',exact:true}).fill('R6P 三个视角放在一张图中');
 const sheetBefore=await snapshot(),sheetStats=await stats();await dock.getByTestId('generation-submit-action').click();const sheet=await done(sheetBefore,1);
 await expect.poll(async()=>fresh(await snapshot(),sheetBefore)[0]?.title).toBe('正侧背三视图');assert.equal((await stats()).edits-sheetStats.edits,1);
 stages.push({kind:'triptych',artwork:fresh(await snapshot(),sheetBefore)[0],ledger:sheet.ledger});
 pass('three-view sheet remains one generated artifact and one original-price debit');

 const beforeReload=await snapshot(),statsBeforeReload=await stats();await page.reload({waitUntil:'domcontentloaded'});await page.locator('.react-flow__node[data-id="r6c-root"]').waitFor();
 const after=await snapshot();assert.deepEqual(after.ledger,beforeReload.ledger);
 const finalStats=await stats();assert.deepEqual(finalStats,statsBeforeReload);assert.equal(finalStats.edits-originalStats.edits,4);assert.equal(finalStats.calls-originalStats.calls,1);
 assert.equal(fresh(after,original).length,5);assert.equal(after.ledger.n-original.ledger.n,5);assert.equal(after.ledger.amount-original.ledger.amount,30);
 await page.screenshot({path:path.join(out,'creative-modes-product.png')});
 pass('reload retains all five creative-mode outputs with no additional supplier call or debit');
 await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,stages,actualProduct:true,realPG:true,routeMocks:0,addedArtworks:5,addedConsumes:5,addedCredits:30,addedGenerationPosts:1,addedEditPosts:4},null,2)+'\n');
 console.log('CANVAS_CREATION_PRODUCT=PASS CHECKS=6 THREE_VIEWS=3 SAME_NODE_VERSION=1 VERSION_UNDO_REDO=1 SHEET=1 REAL_PG=1 ORIGINAL_TASKS=1 ADDED_ARTWORKS=5 ADDED_CONSUMES=5 ADDED_CREDITS=30 ROUTE_MOCKS=0');
 return checks;
}
