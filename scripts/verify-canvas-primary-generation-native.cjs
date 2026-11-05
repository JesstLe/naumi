'use strict';
// Actual Next Canvas blank-node entry and attachment retry. Existing HTTP fixture
// owns no real account, DB, provider or paid work. Only this child tree is stopped.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn,spawnSync}=require('node:child_process'),{chromium,expect}=require('@playwright/test');
const out=path.resolve(process.argv[2]||'output/canvas-primary-generation-native');
async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const port=await freePort(),nextPort=await freePort(),base='http://127.0.0.1:'+port;
 const app=spawn(process.execPath,['scripts/serve-canvas-placement-fixture.cjs'],{cwd:process.cwd(),env:{...process.env,CANVAS_FIXTURE_PORT:String(port),CANVAS_FIXTURE_NEXT_PORT:String(nextPort),CANVAS_FIXTURE_DIST:'.next-primary-generation-fixture'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 const log=fs.createWriteStream(path.join(out,'runtime.log'));app.stdout.pipe(log);app.stderr.pipe(log);let browser,page;const checks=[],errors=[],external=[];
 const state=async()=>await(await fetch(base+'/__fixture/state')).json();
 try{
  const deadline=Date.now()+180000;let ready=false;
  while(Date.now()<deadline){try{const response=await fetch(base+'/canvas');const text=await response.text();if(response.ok&&text.includes('<html')){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}
  assert.ok(ready,'actual Next Canvas did not become ready');
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname)&&!['data:','blob:'].includes(url.protocol)){external.push(url.origin);return route.abort();}return route.continue();});
  await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});await expect(page.getByTestId('canvas-main-toolbar')).toBeVisible();
  const assistant=page.getByRole('button',{name:'收起助手',exact:true});if(await assistant.isVisible())await assistant.click();
  const before=await state();await page.getByTestId('canvas-main-toolbar').locator('[data-tool="image-node"]').click();
  const dock=page.getByTestId('pending-node-dock');await expect(dock).toBeVisible();await dock.locator('textarea').fill('R7O blank-node original request');await dock.getByTestId('generation-submit-action').click();
  await expect.poll(async()=>(await state()).submissions.length).toBe(1);const original=(await state()).submissions[0];assert.equal(original.prompt,'R7O blank-node original request');assert.equal(original.canvasTarget,undefined);checks.push('BLANK_ENTRY_ORIGINAL_PROMPT_NONREPLACEMENT_REQUEST');
  await fetch(base+'/__fixture/fail-position');await fetch(base+'/__fixture/complete?index=1');await expect(dock.getByTestId('generation-submit-action')).toHaveAttribute('aria-label','重试');
  assert.equal((await state()).submissions.length,1);checks.push('ATTACHMENT_FAILURE_RETAINS_ORIGINAL_PENDING_AND_REQUEST');
  await dock.getByTestId('generation-submit-action').click();await expect(page.locator('.react-flow__node[data-id="placement-result-1"]')).toBeVisible();await expect(page.getByTestId('pending-node-dock')).toHaveCount(0);
  const final=await state();assert.equal(final.submissions.length,1);assert.equal(final.submissions[0].operationId,original.operationId);assert.ok(final.positions.some(p=>p.id==='placement-result-1'));checks.push('ACTUAL_RETRY_RESUMES_ORIGINAL_RESULT_ZERO_GENERATION_POSTS');
  for(const art of before.artworks){const current=final.artworks.find(a=>a.id===art.id);assert.equal(current.image,art.image);assert.equal(current.canvasX,art.canvasX);assert.equal(current.canvasY,art.canvasY);}checks.push('ORIGINAL_ARTWORK_BYTES_AND_POSITIONS_RETAINED');
  const receipts=await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('naumi:imagegen-pending:')));assert.equal(receipts.length,0);assert.equal(final.paidCalls,0);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);checks.push('RECEIPT_CLEARED_AFTER_ATTACHMENT_PAGE_ERRORS_AND_PAID_CALLS_ZERO');
  await page.screenshot({path:path.join(out,'blank-result.png')});fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,original,positions:final.positions,submissions:final.submissions.length,actualNextCanvas:true,api:'EXISTING_LOOPBACK_FIXTURE',pg:false,paidCalls:0,pageErrors:errors,externalRequests:external},null,2));
  console.log(`CANVAS_PRIMARY_NATIVE=PASS CHECKS=${checks.length} ACTUAL_NEXT_CANVAS=1 BLANK_ENTRY=1 ORIGINAL_OPERATION=RETAINED ATTACHMENT_RETRY_POSTS=0 PG=0 SUPPLIER=0 PAGE_ERRORS=0`);
 }catch(error){fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:error.stack,checks,errors,external,state:await state().catch(()=>null),body:await page?.locator('body').innerText().catch(()=>null)},null,2));await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
 finally{await browser?.close();if(app.exitCode===null&&app.signalCode===null){if(process.platform==='win32'){const stop=spawnSync('taskkill',['/pid',String(app.pid),'/t','/f'],{windowsHide:true,encoding:'utf8'});fs.writeFileSync(path.join(out,'fixture-stop.log'),stop.stdout+stop.stderr);}else app.kill('SIGTERM');}log.end();}
})().catch(error=>{console.error(error);process.exitCode=1;});
