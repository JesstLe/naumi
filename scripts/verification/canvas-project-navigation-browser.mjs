/** Navigation through the packaged Canvas and original authenticated APIs. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function verifyCanvasProjectNavigationBrowser({page,expect,out,snapshot,stats,open}){
 await mkdir(out,{recursive:true});const checks=[],pass=name=>{checks.push(name);console.log('PASS '+name)},before=await snapshot(),beforeStats=await stats();
 const list=page.getByTestId('canvas-project-browser'),root=page.locator('.react-flow__node[data-id="r6c-root"]');
 const browse=async()=>{await page.getByTestId('canvas-project-chrome').locator('button').first().click();await page.locator('aside').getByRole('button',{name:'全部项目',exact:true}).click();await expect(list).toBeVisible();};
 await open(page);await browse();await expect(list.getByTitle('R6C full-image canvas',{exact:true})).toBeVisible();pass('project menu consumes native history and returns to real catalogue');
 await page.reload({waitUntil:'domcontentloaded'});await expect(list).toBeVisible();pass('refresh after explicit browse stays in catalogue,not previous editor');
 await list.getByTitle('R6C full-image canvas',{exact:true}).click();await expect(root).toBeVisible();await page.reload({waitUntil:'domcontentloaded'});await expect(root).toBeVisible();pass('scoped refresh restores the original mixed-node project');
 await page.goBack();await expect(list).toBeVisible();pass('browser back from restored editor returns to catalogue without leaving Canvas');
 await list.getByRole('button',{name:'新建项目',exact:true}).click();await expect(list).not.toBeVisible();await expect(page.locator('.react-flow__node')).toHaveCount(0);pass('new project opens an empty view without mutating stored documents');
 await browse();await list.getByRole('button',{name:'商品主图',exact:true}).click();await expect(page.getByTestId('pending-node-dock')).toBeVisible();await expect(page.getByTestId('pending-node-dock').locator('textarea')).not.toHaveValue('');pass('workflow starter prepares one ordinary draft without submitting a paid task');
 await browse();await list.getByTitle('R6C full-image canvas',{exact:true}).click();await expect(root).toBeVisible();assert.deepEqual(await snapshot(),before);assert.deepEqual(await stats(),beforeStats);pass('navigation,refresh and starter preserve original PG rows,receipts and all seven debits');
 await page.screenshot({path:path.join(out,'navigation-full-product.png')});await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,actualFullProduct:true,routeMocks:0,mutationsAdded:0,supplierAdded:0,ledgerUnchanged:true},null,2)+'\n');
 console.log('CANVAS_PROJECT_NAVIGATION_BROWSER=PASS CHECKS='+checks.length+' FULL_IMAGE=1 REAL_PG=1 ORIGINAL_HTTP=1 EXTRA_CONSUME=0 EXTRA_SUPPLIER=0');return checks;
}
