'use strict';
/** Real Next UI clicks and complete React adapter. API replies are the existing
 * isolated loopback placement fixture, not real PG/provider/account acceptance.
 * Scope isolation is exercised without reload or injected business functions. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn,spawnSync}=require('node:child_process'),{chromium,expect}=require('@playwright/test');
const out=path.resolve(process.argv[2]||'output/canvas-text-image-native');
async function port(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const n=server.address().port;await new Promise(r=>server.close(r));return n;}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const httpPort=await port(),nextPort=await port(),base='http://127.0.0.1:'+httpPort;
 const child=spawn(process.execPath,['scripts/serve-canvas-placement-fixture.cjs'],{env:{...process.env,CANVAS_FIXTURE_PORT:String(httpPort),CANVAS_FIXTURE_NEXT_PORT:String(nextPort),CANVAS_FIXTURE_HISTORY:'1',CANVAS_FIXTURE_TEXT_IMAGES:'1',CANVAS_FIXTURE_DIST:'.next-text-image-fixture'},windowsHide:true,stdio:['ignore','pipe','pipe']}),log=fs.createWriteStream(path.join(out,'runtime.log'));child.stdout.pipe(log);child.stderr.pipe(log);
 let browser,page;const checks=[],errors=[],external=[],state=async()=>await(await fetch(base+'/__fixture/state')).json();
 const pass=name=>{checks.push(name);console.log('PASS '+name);};
 try{
  const deadline=Date.now()+180000;let ready=false;while(Date.now()<deadline){try{const r=await fetch(base+'/canvas');if(r.ok&&(await r.text()).includes('<html')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert.ok(ready,'actual Next not ready');
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1680,height:1100}});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname)&&!['data:','blob:'].includes(url.protocol)){external.push(url.origin);return route.abort();}return route.continue();});
  await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});await expect(page.getByTestId('canvas-main-toolbar')).toBeVisible();const assistant=page.getByRole('button',{name:'收起助手',exact:true});if(await assistant.isVisible())await assistant.click();
  const text=id=>page.locator('.react-flow__node[data-id="'+id+'"]'),dialog=page.getByTestId('text-image-generation-dialog');
  async function select(ids){
   // Reset the real Flow selection before Ctrl-add. A preceding result keeps
   // its old multi-selection; Ctrl-clicking that set would toggle an item off.
   const blank=await page.evaluate(()=>{for(let y=120;y<innerHeight-100;y+=60)for(let x=25;x<innerWidth-25;x+=55)if(document.elementFromPoint(x,y)?.classList.contains('react-flow__pane'))return {x,y};return null;});
   assert.ok(blank,'visible empty pane point');await page.mouse.click(blank.x,blank.y);
   await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
   await text(ids[0]).getByTestId('text-node-title').click();await expect(text(ids[0])).toHaveClass(/selected/);
   for(const id of ids.slice(1)){await text(id).getByTestId('text-node-title').click({modifiers:['Control']});await expect(text(id)).toHaveClass(/selected/);}
  }
  async function open(ids){await select(ids);const toolbar=ids.length>1?page.getByTestId('text-batch-bar'):page.getByTestId('text-node-toolbar');await expect(toolbar).toBeVisible();await toolbar.getByRole('button',{name:'生成图片',exact:true}).click();await expect(dialog).toBeVisible();}
  const a=['text-history','text-history-2'];await open([a[0]]);await expect(dialog).toContainText('1 段文字');await dialog.getByRole('button',{name:'取消',exact:true}).click();await expect(dialog).toHaveCount(0);assert.equal((await state()).submissions.length,0);pass('ACTUAL_MENU_CANCEL_ZERO_SUBMISSIONS');
  await open(a);await expect(dialog).toContainText('2 段文字');await expect(dialog.getByRole('button',{name:'合并创作',exact:true})).toHaveAttribute('aria-pressed','true');await page.screenshot({path:path.join(out,'combined-menu.png')});await dialog.getByRole('button',{name:'生成图片',exact:true}).click();
  await expect.poll(async()=>(await state()).submissions.length).toBe(1);const combined=(await state()).submissions[0];assert.equal(combined.prompt,'原始文字\n\n第二段文字');assert.deepEqual(combined.inputs,[]);assert.equal(combined.sourceNodeId,'text-history');pass('COMBINE_ONE_REQUEST_ORIGINAL_TEXT_AND_PARENT');
  await fetch(base+'/__fixture/complete?index=1');await expect(page.locator('.react-flow__node[data-id="placement-result-1"]')).toBeVisible();await expect.poll(async()=>(await state()).texts.filter(t=>a.includes(t.id)&&t.targetIds.includes('placement-result-1')).length).toBe(2);pass('COMBINED_RESULT_ATTACHED_TO_BOTH_ORIGINAL_TEXTS');
  await open(a);await dialog.getByRole('button',{name:'逐条创作',exact:true}).click();await dialog.getByRole('button',{name:'生成图片',exact:true}).click();await expect.poll(async()=>(await state()).submissions.length).toBe(2);assert.equal((await state()).submissions[1].prompt,'原始文字');
  await fetch(base+'/__fixture/complete?index=2');await expect.poll(async()=>(await state()).submissions.length).toBe(3);assert.equal((await state()).submissions[2].prompt,'第二段文字');await fetch(base+'/__fixture/complete?index=3');await expect(page.locator('.react-flow__node[data-id="placement-result-3"]')).toBeVisible();pass('SEPARATE_ORIGINAL_ORDER_ONE_AT_A_TIME');
  await open([a[0]]);await dialog.getByRole('button',{name:'生成图片',exact:true}).click();await expect.poll(async()=>(await state()).submissions.length).toBe(4);
  await page.getByRole('button',{name:'Naumi',exact:true}).click();await page.getByRole('button',{name:'全部项目',exact:true}).click();await page.getByTitle('文字项目B',{exact:true}).click();await open(['text-project-b']);await expect(dialog).toContainText('1 段文字');assert.equal((await state()).submissions.length,4);pass('PROJECT_B_MENU_AVAILABLE_DURING_A_INFLIGHT_WITHOUT_RELOAD');
  await fetch(base+'/__fixture/complete?index=4');await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'生成图片',exact:true})).toBeEnabled();await page.screenshot({path:path.join(out,'project-b-menu.png')});pass('A_COMPLETION_DOES_NOT_CLOSE_B_MENU_OR_REPLAY');
  await dialog.getByRole('button',{name:'生成图片',exact:true}).click();await expect.poll(async()=>(await state()).submissions.length).toBe(5);const final=await state();assert.equal(final.submissions[4].prompt,'B项目的提示词');assert.equal(final.submissions[4].sourceNodeId,'text-project-b');assert.equal(new Set(final.submissions.map(s=>s.operationId)).size,5);pass('B_SUBMISSION_USES_ITS_ORIGINAL_TEXT_SCOPE');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(final.paidCalls,0);pass('PAGE_ERRORS_EXTERNAL_PROVIDER_CALLS_ZERO');
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,actualNext:true,realHook:true,api:'LOOPBACK_FIXTURE',pg:false,paidCalls:0,submissions:final.submissions,positions:final.positions,texts:final.texts,history:final.history,pageErrors:errors,externalRequests:external,finalPending:'A original receipt retained; B still pending in disposable fixture; no real business task'},null,2)+'\n');
  console.log(`CANVAS_TEXT_IMAGE_NATIVE=PASS CHECKS=${checks.length} ACTUAL_NEXT=1 REACT_HOOK=1 COMBINE=1 SEPARATE=1 PROJECT_SWITCH=1 PG=0 SUPPLIER=0 PAGE_ERRORS=0`);
 }catch(error){fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:error.stack,checks,errors,external,state:await state().catch(()=>null),body:await page?.locator('body').innerText().catch(()=>null)},null,2));await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
 finally{await browser?.close();if(child.exitCode===null&&child.signalCode===null){const stop=spawnSync('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,encoding:'utf8'});fs.writeFileSync(path.join(out,'fixture-stop.log'),stop.stdout+stop.stderr);}log.end();}
})().catch(error=>{console.error(error);process.exitCode=1;});
