/** One actual paid operation across browser offline, Worker completion, reload
 * and a second reload. No route interception, seed done or browser-side refund. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function verifyCanvasPaidDisconnectBrowser({page,expect,out,open,snapshot,helper}){
 await mkdir(out,{recursive:true});
 const checks=[],requests=[],failures=[],dialogs=[],pass=name=>{checks.push(name);console.log('PASS '+name);};
 const observe=request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/imagegen'))requests.push({path:url.pathname,query:url.search,method:request.method(),body:request.postData()});};
 const failed=request=>failures.push({url:request.url(),error:request.failure()?.errorText});
 const dialog=async value=>{dialogs.push(value.message());await value.dismiss();};
 const posts=()=>requests.filter(row=>row.path==='/api/imagegen'&&row.method==='POST');
 const context=page.context();let offline=false;
 page.on('request',observe);page.on('requestfailed',failed);page.on('dialog',dialog);
 try{
  await open(page);await page.keyboard.press('Escape');
  const close=page.getByRole('button',{name:'关闭创作栏',exact:true});if(await close.isVisible())await close.click();
  const before=await snapshot(),supplierBefore=await helper('stats');assert.equal(supplierBefore.waiting,0);
  await helper('hold');
  await page.getByTestId('canvas-main-toolbar').locator('[data-tool="image-node"]').click();
  const dock=page.getByTestId('pending-node-dock');await expect(dock).toBeVisible();
  await dock.getByRole('spinbutton',{name:'生成图片数量',exact:true}).fill('1');
  await dock.getByRole('button',{name:/ · [124]K$/}).click();
  await page.getByRole('button',{name:'1K',exact:true}).click();
  await page.getByRole('button',{name:'1:1',exact:true}).click();await page.keyboard.press('Escape');
  await dock.locator('textarea').fill('R9Z same paid operation survives client offline');
  await expect(dock).toContainText('6 积分');
  const acceptedPromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/imagegen'&&response.request().method()==='POST');
  await dock.getByTestId('generation-submit-action').click();
  const acceptedResponse=await acceptedPromise;assert.equal(acceptedResponse.status(),200);const accepted=await acceptedResponse.json();
  await expect.poll(async()=>(await helper('stats')).waiting,{timeout:90000}).toBe(1);
  assert.equal(posts().length,1);const body=JSON.parse(posts()[0].body),operation=body.operationId;
  assert.match(operation,/^[a-f0-9-]{36}$/);assert.equal(accepted.jobId,'imagegen-'+operation);
  const pending=await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('naumi:imagegen-pending:v1:')).map(key=>({key,value:JSON.parse(sessionStorage.getItem(key))})));
  assert.equal(pending.filter(row=>row.value.operationId===operation).length,1);
  const held=await helper('paid-trace','--operation-id',operation);
  assert.equal(held.parent.id,accepted.jobId);assert.equal(held.child.status,'pending');assert.equal(held.ledger.length,0);assert.equal(held.billing[0].reserved_credits,6);
  pass('real Canvas click persists one scoped original intent and Worker reaches one held supplier POST');

  await context.setOffline(true);offline=true;
  const connection=await page.evaluate(async()=>{try{await fetch('/api/health',{cache:'no-store'});return 'unexpected-response';}catch{return 'offline-network-failed';}});
  assert.equal(connection,'offline-network-failed');assert.equal(await page.evaluate(()=>navigator.onLine),false);
  await helper('release');
  await expect.poll(async()=>(await helper('paid-trace','--operation-id',operation)).parent.status,{timeout:90000}).toBe('done');
  const deliveredOffline=await helper('paid-trace','--operation-id',operation);
  assert.equal(deliveredOffline.child.id,held.child.id);assert.equal(deliveredOffline.child.status,'done');assert.equal(deliveredOffline.child.leased,false);
  assert.equal(deliveredOffline.artworks.length,1);assert.equal(deliveredOffline.ledger.length,1);assert.equal(deliveredOffline.ledger[0].id,'led-image-'+held.child.id);assert.equal(deliveredOffline.ledger[0].delta,-6);
  assert.equal(deliveredOffline.billing[0].state,'settled');assert.equal(deliveredOffline.billing[0].charged_credits,6);assert.equal(deliveredOffline.billing[0].reserved_credits,0);
  assert.equal(deliveredOffline.parent.quotedCredits,6);assert.equal(deliveredOffline.supplier.length,1);assert.equal(deliveredOffline.supplier[0].operation_id,held.child.id);
  assert.equal((await helper('stats')).calls,supplierBefore.calls+1);assert.equal((await helper('stats')).edits,supplierBefore.edits);
  pass('same fixed Worker finishes original bytes/artwork and one original six-credit debit while browser network is offline');

  await context.setOffline(false);offline=false;await open(page);
  const artifact=deliveredOffline.artworks[0],node=page.locator(`.react-flow__node[data-id="${artifact.id}"]`);
  await expect(node).toBeVisible({timeout:90000});await expect(page.getByTestId('generation-placeholder')).toHaveCount(0,{timeout:90000});
  // Reload intentionally offers an explicit read-only recovery action. Do not
  // invent an automatic replay/acknowledgement contract in the verifier.
  const recovery=page.getByRole('complementary',{name:'图像任务恢复',exact:true});
  await expect(recovery).toBeVisible();await recovery.getByRole('button',{name:/^待恢复任务 /}).click();
  const recoveryResponsePromise=page.waitForResponse(response=>{const url=new URL(response.url());return response.request().method()==='GET'&&url.pathname==='/api/imagegen'&&url.searchParams.get('operationId')===operation;});
  await recovery.getByRole('button',{name:'检查原任务 '+operation,exact:true}).click();
  const receipt=await recoveryResponsePromise;assert.equal(receipt.status(),200);const result=await receipt.json();
  await expect.poll(()=>page.evaluate(id=>Object.keys(sessionStorage).filter(key=>key.startsWith('naumi:imagegen-pending:v1:')).map(key=>JSON.parse(sessionStorage.getItem(key))).filter(row=>row.operationId===id).length,operation),{timeout:90000}).toBe(0);
  assert.ok(requests.some(row=>row.method==='GET'&&row.path==='/api/imagegen'&&row.query.includes(operation)),'reload observes the original operation');
  assert.equal(posts().length,1);const downloaded=await page.request.get(new URL(artifact.image_url,page.url()).href);assert.equal(downloaded.status(),200);
  const byteHash=createHash('sha256').update(await downloaded.body()).digest('hex');assert.deepEqual(deliveredOffline.child.originalHashes,[byteHash]);
  assert.equal(result.status,'succeeded');assert.equal(result.operationId,operation);assert.equal(result.artifacts[0].artworkId,artifact.id);assert.equal(result.chargedCredits,6);
  pass('reconnected real project explicitly checks original task and restores node/receipt/bytes while retiring only its original pending key');

  await open(page);await expect(node).toBeVisible({timeout:90000});
  const repeated=await helper('paid-trace','--operation-id',operation),final=await snapshot(),supplier=await helper('stats');
  assert.deepEqual(repeated,deliveredOffline);assert.equal(posts().length,1);assert.equal(supplier.calls,supplierBefore.calls+1);assert.equal(supplier.edits,supplierBefore.edits);
  assert.deepEqual(final.ledger,{n:before.ledger.n+1,amount:before.ledger.amount+6});assert.equal(final.artworks.length,before.artworks.length+1);assert.equal(dialogs.length,0);
  pass('second actual reload retains one artifact, one supplier POST and one debit without another confirmation or purchase');
  const report={status:'PASS',checks,operationId:operation,parent:accepted.jobId,child:held.child.id,originalPending:pending.filter(row=>row.value.operationId===operation).map(row=>row.key),offlineProbe:connection,byteHash,trace:deliveredOffline,requests,networkFailures:failures,dialogs,routeMocks:0,seedDone:0,supplierPostsAdded:1,consumeAdded:1,creditsAdded:6,artworksAdded:1,actualFullProduct:true,realPG:true,browserOfflineEmulation:true,physicalHostDisconnectClaim:false};
  await page.screenshot({path:path.join(out,'paid-disconnect-restored.png')});await writeFile(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
  console.log('CANVAS_PAID_DISCONNECT=PASS SAME_OPERATION=1 FULL_WEB_WORKER_IMAGE=1 BROWSER_OFFLINE=1 ORIGINAL_BYTES=EXACT SUPPLIER_POSTS_ADDED=1 CONSUME_ADDED=1 CREDITS_ADDED=6 ARTWORKS_ADDED=1 RELOAD_POSTS=0 ROUTE_MOCKS=0 SEED_DONE=0');
  return report;
 }catch(error){await writeFile(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),stack:error.stack,checks,requests,failures,dialogs,body:await page.locator('body').innerText().catch(()=>''),snapshot:await snapshot().catch(e=>String(e))},null,2)+'\n');throw error;}
 finally{if(offline)await context.setOffline(false);await helper('release');page.off('request',observe);page.off('requestfailed',failed);page.off('dialog',dialog);}
}
