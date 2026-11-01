/** Full packaged Web/Worker, original Canvas controls and original failed receipts.
 * Provider controls only synthesize responses; no product status is written. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function verifyCanvasSupplierOutcomesBrowser({page,expect,out,open,snapshot,helper,mode='modified'}){
 await mkdir(out,{recursive:true});const checks=[],cases=[],requests=[],pass=name=>{checks.push(name);console.log('PASS '+name);};
 const observe=req=>{if(new URL(req.url()).pathname==='/api/imagegen'&&req.method()==='POST')requests.push(JSON.parse(req.postData()));};page.on('request',observe);
 try{
  await helper('release');
  for(const kind of ['403-no-proof','403-not-charged','accepted-socket-loss']){
   await open(page);await page.keyboard.press('Escape');const close=page.getByRole('button',{name:'关闭创作栏',exact:true});if(await close.isVisible())await close.click();
   const before=await snapshot(),stats=await helper('stats'),posts=requests.length,token=randomUUID().replaceAll('-','');await helper('outcome','--mode',kind);
   await page.getByTestId('canvas-main-toolbar').locator('[data-tool="image-node"]').click();const dock=page.getByTestId('pending-node-dock');await expect(dock).toBeVisible();
   await dock.getByRole('spinbutton',{name:'生成图片数量',exact:true}).fill('1');await dock.getByRole('button',{name:/ · [124]K$/}).click();await page.getByRole('button',{name:'1K',exact:true}).click();await page.getByRole('button',{name:'1:1',exact:true}).click();await page.keyboard.press('Escape');await dock.locator('textarea').fill('R10B-FULL:'+kind+':'+token);await expect(dock).toContainText('6 积分');
   let operation;const visibleReceipt=page.waitForResponse(async res=>{const url=new URL(res.url());return res.request().method()==='GET'&&url.pathname==='/api/generate-image'&&url.searchParams.get('job')==='imagegen-'+operation&&(await res.json()).status==='error';});
   const accepted=page.waitForResponse(res=>new URL(res.url()).pathname==='/api/imagegen'&&res.request().method()==='POST');await dock.getByTestId('generation-submit-action').click();const acceptedResponse=await accepted;assert.equal(acceptedResponse.status(),200);operation=requests.at(-1).operationId;const first=await acceptedResponse.json();assert.equal(first.jobId,'imagegen-'+operation);
   const terminal=await visibleReceipt;assert.equal(terminal.status(),200);const visible=await terminal.json();assert.equal(visible.status,'error');assert.deepEqual(visible.images,[]);
   const failure=page.getByTestId('generation-failure').last();await expect(failure).toBeVisible({timeout:90000});const text=await failure.innerText();assert.ok(!/0\.008416|核对积分|确认积分/.test(text));
   if(kind.startsWith('403'))await expect(failure).toContainText('生成通道访问被拒绝');else await expect(failure).toContainText('释放预占积分');
   const trace=await helper('paid-trace','--operation-id',operation),supplier=await helper('stats'),receipt=trace.parent.receipt;assert.equal(receipt.operationId,operation);assert.equal(receipt.chargedCredits,0);assert.equal(receipt.billingStatus,'confirmed');assert.equal(visible.error,receipt.error.message);assert.equal(trace.billing.length,1);assert.equal(trace.billing[0].charged_credits,0);assert.equal(trace.billing[0].reserved_credits,0);assert.equal(trace.ledger.length,0);assert.equal(trace.artworks.length,0);assert.equal(trace.reservations.length,0);assert.equal(supplier.calls,stats.calls+1);assert.equal(requests.length,posts+1);
   const provider=supplier.outcomeTrace.filter(row=>row.token===token);assert.equal(provider.length,1);assert.equal(provider[0].mode,kind);
   const expected=kind==='403-not-charged'||mode==='baseline'&&kind==='403-no-proof'?'NOT_ACCEPTED':'EXECUTION_FAILED';assert.equal(receipt.error.code,expected);
   if(kind==='403-not-charged'){assert.ok(trace.stages.every(row=>row.state==='rejected-not-charged'));if(mode==='modified')assert.ok(trace.stages.every(row=>Object.values(trace.paidStates).some(root=>Object.hasOwn(root.children,row.image_operation_id))));}
   if(kind==='403-no-proof')assert.ok(trace.stages.some(row=>row.state==='failed-response'));
   if(kind==='accepted-socket-loss'){assert.equal(provider[0].accepted,true);assert.ok(trace.stages.some(row=>row.state==='unknown'));assert.ok(Object.values(trace.paidStates).every(root=>root.state==='started'));assert.ok(trace.reconciliations.some(row=>row.supplier_outcome==='unknown'&&row.supplier_cost==='pending'));}
   pass('full Canvas '+kind+' retains exact original failed receipt, actual stage and zero customer debit without pricing confirmation');
   await open(page);const restored=await helper('paid-trace','--operation-id',operation),final=await snapshot();assert.deepEqual(restored,trace);assert.equal((await helper('stats')).calls,stats.calls+1);assert.equal(requests.length,posts+1);assert.deepEqual(final.ledger,before.ledger);assert.deepEqual(final.artworks,before.artworks);
   pass('reload after '+kind+' preserves original task and customer ledger with no automatic paid re-POST');
   cases.push({kind,operationId:operation,token,receipt,visibleReceipt:visible,visibleText:text,trace,provider:provider[0],supplierPostsAdded:1,customerConsumeAdded:0});await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'RUNNING',mode,cases,checks},null,2)+'\n');
  }
  const report={status:'PASS',mode,cases,checks,actualFullProduct:true,realPG:true,routeMocks:0,seedDone:0,customerConsumesAdded:0,supplierPostsAdded:3};await writeFile(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log('CANVAS_SUPPLIER_OUTCOMES=PASS MODE='+mode.toUpperCase()+' CASES=3 CHECKS=6 FULL_WEB_WORKER=1 REAL_PG=1 ACTUAL_UI=1 CUSTOMER_CONSUME_ADDED=0 SUPPLIER_POSTS_ADDED=3 RELOAD_POSTS=0 SEED_DONE=0');return report;
 }catch(error){await writeFile(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),stack:error.stack,cases,checks,requests,body:await page.locator('body').innerText().catch(()=>''),snapshot:await snapshot().catch(()=>null)},null,2)+'\n');throw error;}
 finally{await helper('outcome','--mode','healthy');page.off('request',observe);}
}
