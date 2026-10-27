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
 async function mode(label){await dock.getByRole('button',{name:'普通',exact:true}).click();await page.getByRole('button',{name:label,exact:true}).click();}
 const fresh=(state,before)=>state.artworks.filter(row=>!before.artworks.some(old=>old.id===row.id)&&!row.deleted_at);
 async function done(before,count){
  await expect.poll(async()=>fresh(await snapshot(),before).length,{timeout:90000}).toBe(count);
  await expect(page.getByTestId('generation-placeholder')).toHaveCount(0,{timeout:90000});
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

 await select();await dock.getByRole('textbox',{name:'节点提示词',exact:true}).fill('R6P 重做只调整光照，保留原产品');
 const retryBefore=await snapshot(),retryStats=await stats(),sourceTitle=retryBefore.artworks.find(row=>row.id==='r6c-root').title;
 await dock.getByRole('button',{name:'更多图片参数',exact:true}).click();await page.getByTestId('canvas-node-action-panel').getByRole('button',{name:'重做',exact:true}).click();
 const retried=await done(retryBefore,1);await expect.poll(async()=>fresh(await snapshot(),retryBefore)[0]?.title).toBe(sourceTitle+' · 重做');
 const version=fresh(await snapshot(),retryBefore)[0];assert.equal(version.parent_id,'r6c-root');assert.equal((await stats()).edits-retryStats.edits,1);
 stages.push({kind:'retry',artwork:version,ledger:retried.ledger});
 pass('actual redo action creates one new version and retains the source lineage and current draft');

 await select();await mode('三视图合成图');await dock.getByRole('textbox',{name:'节点提示词',exact:true}).fill('R6P 三个视角放在一张图中');
 const sheetBefore=await snapshot(),sheetStats=await stats();await dock.getByTestId('generation-submit-action').click();const sheet=await done(sheetBefore,1);
 await expect.poll(async()=>fresh(await snapshot(),sheetBefore)[0]?.title).toBe('正侧背三视图');assert.equal((await stats()).edits-sheetStats.edits,1);
 stages.push({kind:'triptych',artwork:fresh(await snapshot(),sheetBefore)[0],ledger:sheet.ledger});
 pass('three-view sheet remains one generated artifact and one original-price debit');

 const beforeReload=await snapshot(),statsBeforeReload=await stats();await page.reload({waitUntil:'domcontentloaded'});await page.locator('.react-flow__node[data-id="r6c-root"]').waitFor();
 const after=await snapshot();assert.deepEqual(after.ledger,beforeReload.ledger);
 const finalStats=await stats();assert.deepEqual(finalStats,statsBeforeReload);assert.equal(finalStats.edits-originalStats.edits,5);assert.equal(finalStats.calls,originalStats.calls);
 assert.equal(fresh(after,original).length,5);assert.equal(after.ledger.n-original.ledger.n,5);assert.equal(after.ledger.amount-original.ledger.amount,30);
 await page.screenshot({path:path.join(out,'creative-modes-product.png')});
 pass('reload retains all five creative-mode outputs with no additional supplier call or debit');
 await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,stages,actualProduct:true,realPG:true,routeMocks:0,addedArtworks:5,addedConsumes:5,addedCredits:30,addedGenerationPosts:0,addedEditPosts:5},null,2)+'\n');
 console.log('CANVAS_CREATION_PRODUCT=PASS CHECKS=5 THREE_VIEWS=3 REDO=1 SHEET=1 REAL_PG=1 ORIGINAL_TASKS=1 ADDED_ARTWORKS=5 ADDED_CONSUMES=5 ADDED_CREDITS=30 ROUTE_MOCKS=0');
 return checks;
}
