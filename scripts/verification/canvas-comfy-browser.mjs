/** Actual packaged Canvas controls -> original HTTP -> loopback Comfy -> PG and
 * saved media. No route interception, auth replacement or DOM fixture. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function verifyCanvasComfyBrowser({page,expect,out,snapshot,stats,open,requests}){
 await mkdir(out,{recursive:true});const checks=[],pass=name=>{checks.push(name);console.log('PASS '+name);};
 const original=await snapshot(),originalStats=await stats(),postStart=requests.length;
 await open(page);await page.locator('.react-flow__node[data-id="r6c-root"]').click({position:{x:90,y:100}});
 await page.getByRole('button',{name:'更多处理',exact:true}).click();await page.getByRole('menuitem',{name:/ComfyUI 工作流/}).click();
 const dialog=page.getByRole('dialog',{name:'ComfyUI 工作流',exact:true});await expect(dialog).toBeVisible();
 await expect(dialog.getByText('R6Q original workflow',{exact:true})).toBeVisible();
 await dialog.getByRole('textbox').fill('R6Q original workflow input from real Canvas');
 await dialog.getByRole('button',{name:'运行工作流',exact:true}).click();
 await expect(dialog).toContainText('2 张图片已生成在原图右侧',{timeout:90000});
 const state=await snapshot(),added=state.artworks.filter(row=>!original.artworks.some(old=>old.id===row.id));assert.equal(added.length,2);
 assert.deepEqual(state.ledger,original.ledger);assert.equal((await stats()).comfyPrompts,originalStats.comfyPrompts+1);
 pass('actual workflow control delivers two saved images with no customer debit or confirmation');
 const calls=requests.slice(postStart).filter(row=>row.path==='/api/comfyui/run');assert.equal(calls.length,1);
 const body=JSON.parse(calls[0].body);assert.match(body.idempotencyKey,/^comfy-/);assert.equal(body.source,'canvas');assert.equal(body.artworkId,'r6c-root');assert.equal(body.projectKey,'tree:r6c');
 assert.equal((await stats()).comfyWires.at(-1).prompt['2'].inputs.text,'R6Q original workflow input from real Canvas');
 for(const row of added)assert.equal(row.parent_id,'r6c-root');
 const position=added.map(row=>({x:row.canvas_x,y:row.canvas_y})).sort((a,b)=>a.x-b.x);assert.equal(position[1].x-position[0].x,40);assert.equal(position[1].y-position[0].y,40);
 pass('workflow application retains parameter wire, source lineage, project and original diagonal placement');
 const beforeRead=await stats(),receipt=await page.request.get(new URL('/api/comfyui/run?operationId='+encodeURIComponent(body.idempotencyKey),page.url()).href,{headers:{'x-naumi-workspace':'personal','x-naumi-project-context':'tree:r6c'}});assert.equal(receipt.status(),200);
 const record=await receipt.json();assert.equal(record.state,'completed');assert.deepEqual(record.images.map(image=>image.id).sort(),added.map(row=>row.id).sort());assert.deepEqual(await stats(),beforeRead);
 pass('actual original receipt returns the same saved results without another Comfy submission');
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();const beforeReload=await stats();await page.reload({waitUntil:'domcontentloaded'});await page.locator('.react-flow__node[data-id="r6c-root"]').waitFor();
 const after=await snapshot();assert.deepEqual(after.ledger,original.ledger);for(const row of added)assert.ok(after.artworks.some(saved=>saved.id===row.id&&!saved.deleted_at));assert.deepEqual(await stats(),beforeReload);
 const pending=await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('naumi.comfy-run.v1:')));assert.deepEqual(pending,[]);
 await page.screenshot({path:path.join(out,'native-workflow-product.png')});
 pass('full product reload retains workflow outputs and clears only the finished browser receipt');
 await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,actualProduct:true,realPG:true,routeMocks:0,addedArtworks:2,customerDebits:0,supplierFixture:'LOOPBACK_COMFY_PROTOCOL',operationId:body.idempotencyKey},null,2)+'\n');
 console.log('CANVAS_COMFY_PRODUCT=PASS CHECKS=4 REAL_PG=1 ACTUAL_CONTROLS=1 ARTWORKS=2 CUSTOMER_DEBITS=0 ROUTE_MOCKS=0');return checks;
}
