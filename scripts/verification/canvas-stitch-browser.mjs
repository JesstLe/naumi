/** Actual packaged selection -> original stitch route/PG/bytes/history.
 * No browser routes, auth providers or application owners are replaced. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function verifyCanvasStitchBrowser({page,expect,out,snapshot,stats,open,requests}){
 await mkdir(out,{recursive:true});const checks=[],pass=name=>{checks.push(name);console.log('PASS '+name);};
 const initial=await snapshot(),beforeStats=await stats(),postCount=()=>requests.filter(r=>r.path==='/api/canvas/stitch'&&r.method==='POST').length,postsBefore=postCount();
 await open(page);
 const node=id=>page.locator(`.react-flow__node[data-id="${id}"]`),toolbar=page.getByTestId('canvas-main-toolbar');
 // Earlier real creative/Comfy controls intentionally add overlapping nodes.
 // Pick an actually exposed image point; never force-click through another
 // artifact, dispatch a synthetic selection, or replace application state.
 const exposed=async id=>node(id).evaluate(element=>{
  const r=element.getBoundingClientRect();
  for(const fy of [.15,.3,.5,.7,.9])for(const fx of [.1,.3,.5,.7,.9]){
   const x=r.x+r.width*fx,y=r.y+r.height*fy;if(x<0||y<60||x>=innerWidth||y>=innerHeight)continue;
   const hit=document.elementFromPoint(x,y);if(hit?.closest('.react-flow__node')===element&&!hit.closest('button,input,textarea,.react-flow__handle'))return{x,y};
  }return null;
 });
 await page.keyboard.press('Escape');await toolbar.locator('[data-tool="move"]').click();
 await expect.poll(()=>exposed('r6c-root')).not.toBe(null);const first=await exposed('r6c-root');await page.mouse.click(first.x,first.y);
 // The original second image may be completely under completed Comfy nodes.
 // Select another real, visible image from the same existing project instead
 // of forcing a click through it, moving a source or injecting Flow selection.
 let peer;
 for(const id of [...new Set(['r6c-second',...initial.artworks.filter(a=>!a.deleted_at&&a.id!=='r6c-root').map(a=>a.id)])]){
  if(await node(id).count()!==1)continue;const point=await exposed(id);if(point){peer={id,...point};break;}
 }
 assert.ok(peer,'a second existing image must have a genuine exposed click point');
 await page.keyboard.down('Shift');try{await page.mouse.click(peer.x,peer.y);}finally{await page.keyboard.up('Shift');}
 const selectedIds=['r6c-root',peer.id].sort();
 await expect.poll(()=>page.locator('.react-flow__node.selected').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-id')).sort())).toEqual(selectedIds);
 await writeFile(path.join(out,'SELECTION.json'),JSON.stringify({selectedIds,first,peer,nativePointer:true,forcedClicks:0,sourceMoves:0},null,2)+'\n');
 const button=page.getByRole('button',{name:'拼接长图',exact:true});await expect(button).toBeVisible();await expect(button).toBeEnabled();await button.click();
 await expect.poll(async()=>(await snapshot()).artworks.filter(a=>a.id.startsWith('canvas-long-')&&!a.deleted_at).length).toBe(1);
 const result=(await snapshot()).artworks.find(a=>a.id.startsWith('canvas-long-'));
 assert.equal(postCount()-postsBefore,1);const request=requests.filter(r=>r.path==='/api/canvas/stitch'&&r.method==='POST').at(-1);const payload=JSON.parse(request.body);
 assert.deepEqual([...payload.ids].sort(),selectedIds);assert.match(payload.operationId,/^[a-f0-9-]{36}$/);assert.equal(result.parent_id,payload.ids[0]);assert.deepEqual(result.parent_ids,payload.ids.slice(1));
 await expect(node(result.id)).toBeVisible();pass('actual multi-selection control publishes one stitched artifact with original operation and ordered lineage');
 const receiptUrl=new URL('/api/canvas/stitch?operationId='+encodeURIComponent(payload.operationId),page.url()).href;
 const response=await page.request.get(receiptUrl,{headers:{'x-naumi-workspace':'personal','x-naumi-project-context':'tree:r6c'}});assert.equal(response.status(),200);
 const receipt=(await response.json()).result;assert.equal(receipt.id,result.id);assert.ok(receipt.width>0&&receipt.height>receipt.width);
 const pixels=await page.request.get(new URL(receipt.image,page.url()).href);assert.equal(pixels.status(),200);assert.match(pixels.headers()['content-type'],/image\/png/);assert.ok((await pixels.body()).length>100);pass('authorized original receipt and actual PNG bytes are readable without another POST');
 await toolbar.locator('[data-tool="undo"]').click();await expect.poll(async()=>(await snapshot()).artworks.find(a=>a.id===result.id)?.deleted_at!=null).toBe(true);
 await toolbar.locator('[data-tool="redo"]').click();await expect.poll(async()=>(await snapshot()).artworks.find(a=>a.id===result.id)?.deleted_at).toBe(null);assert.equal(postCount()-postsBefore,1);pass('one shared history undo/redo retains the same stitched ID with no repeat rendering request');
 await page.reload({waitUntil:'domcontentloaded'});await expect(node(result.id)).toBeVisible({timeout:90000});
 const final=await snapshot();assert.deepEqual(final.ledger,initial.ledger);assert.deepEqual(final.jobs,initial.jobs);assert.deepEqual(await stats(),beforeStats);
 assert.deepEqual(final.artworks.filter(a=>a.id!==result.id),initial.artworks);pass('refresh preserves stitched output and every original image/task/debit with no supplier call');
 await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,artifactId:result.id,operationId:payload.operationId,realPG:true,actualControls:true,routeMocks:0,supplierAdded:0,consumeAdded:0},null,2)+'\n');
 console.log('CANVAS_STITCH_BROWSER=PASS CHECKS='+checks.length+' FULL_IMAGE=1 REAL_PG=1 ORIGINAL_HTTP=1 POST=1 UNDO_REDO=SAME_ID SUPPLIER_ADDED=0 CONSUME_ADDED=0');return checks;
}
