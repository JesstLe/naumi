'use strict';
// Complete Next/ReactFlow/Canvas controls. HTTP persistence is a local fixture;
// this is native UI/transaction-order evidence, not PG or supplier acceptance.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('node:child_process'),{chromium,expect}=require('@playwright/test');
const out=path.resolve(process.argv[2]||'output/canvas-arrange-native'),port=Number(process.env.CANVAS_ARRANGE_PORT||15420),base='http://127.0.0.1:'+port;
async function free(p){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(p,'127.0.0.1',()=>s.close(resolve))})}
(async()=>{
 fs.mkdirSync(out,{recursive:true});await free(port);await free(port+1);
 const app=spawn(process.execPath,['scripts/serve-canvas-regeneration-fixture.cjs'],{env:{...process.env,CANVAS_REGEN_PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']}),log=fs.createWriteStream(path.join(out,'runtime.log'));app.stdout.pipe(log);app.stderr.pipe(log);
 let browser,page,arts,release,hold=true,rejectNext=false;const commands=[],receipts=new Map(),checks=[],errors=[],external=[],paid=[];
 const pass=n=>{checks.push(n);console.log('PASS '+n)};
 try{
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(!['127.0.0.1','localhost'].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol)){external.push(u.origin);return route.abort()}
   const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(u.pathname==='/api/account'){const response=await route.fetch(),body=await response.json();arts??=body.artworks;return json({...body,artworks:arts})}
   if(u.pathname==='/api/artworks/get')return json({artworks:arts.filter(a=>(u.searchParams.get('ids')||'').split(',').includes(a.id))});
   if(u.pathname==='/api/canvas/history'){
    const command=req.postDataJSON(),fingerprint=JSON.stringify(command);commands.push(command);if(hold)await new Promise(r=>{release=r});
    if(rejectNext){rejectNext=false;return json({error:'ARRANGE_FIXTURE_REJECTED'},409)}
    if(receipts.has(command.operationId)){const prior=receipts.get(command.operationId);assert.equal(prior.fingerprint,fingerprint);return json(prior.body)}
    const ids=[];for(const op of command.operations){assert.equal(op.type,'position');const art=arts.find(a=>a.id===op.id);assert(art);Object.assign(art,{canvasX:op.x,canvasY:op.y});ids.push(op.id)}
    const body={ok:true,persisted:true,artworkIds:ids,artworkNodes:ids.map(id=>({node:structuredClone(arts.find(a=>a.id===id)),visible:true}))};receipts.set(command.operationId,{fingerprint,body});return json(body);
   }
   if(['/api/imagegen','/api/generate-image','/api/imagegen/plan'].includes(u.pathname)&&req.method()==='POST'){paid.push(u.pathname);return json({error:'UNEXPECTED_PAID_CALL'},500)}
   return route.continue();
  });
  let ready=false;for(const deadline=Date.now()+180000;Date.now()<deadline;){if(app.exitCode!==null)throw Error('Own Next fixture exited '+app.exitCode);ready=await fetch(base+'/canvas',{signal:AbortSignal.timeout(5000)}).then(r=>r.ok).catch(()=>false);if(ready)break;await new Promise(r=>setTimeout(r,300))}assert(ready);
  await page.goto(base+'/canvas',{waitUntil:'domcontentloaded',timeout:180000});await page.locator('.react-flow__node[data-id="reference-neighbor"]').waitFor({timeout:150000});
  const toolbar=page.getByTestId('canvas-view-toolbar'),tidy=toolbar.getByRole('button',{name:'整理画布',exact:true});await expect(tidy).toBeEnabled();
  const positions=()=>page.locator('.react-flow__node').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.dataset.id,n.style.transform])));
  const zoom=()=>page.locator('.react-flow__viewport').evaluate(n=>new DOMMatrixReadOnly(getComputedStyle(n).transform).a);
  const initial=await positions();await tidy.click();await expect.poll(()=>commands.length).toBe(1);assert(commands[0].operations.length>=1&&commands[0].operations.length<=2);assert.deepEqual(await positions(),initial);await expect(tidy).toBeDisabled();pass('REAL_TIDY_SINGLE_ATOMIC_POST_NO_LOCAL_MOVE_BEFORE_RECEIPT');
  await toolbar.locator('button[aria-expanded]').click();await toolbar.getByRole('button',{name:'缩放至50%',exact:true}).click();await expect.poll(zoom).toBeCloseTo(.5,4);hold=false;release();await expect(tidy).toBeEnabled();await expect.poll(async()=>JSON.stringify(await positions())).not.toBe(JSON.stringify(initial));
  await page.waitForTimeout(800);assert(Math.abs((await zoom())-.5)<1e-4);pass('MANUAL_50_PERCENT_DURING_PENDING_SAVE_RETAINS_LATEST_INTENT');
  const arranged=await positions();for(const op of commands[0].operations)assert.equal(arranged[op.id],`translate(${op.x}px,${op.y}px)`);pass('ACTUAL_FLOW_POSITIONS_MATCH_CANONICAL_HISTORY_RECEIPT');
  await page.locator('button[data-tool=undo]').click();await expect.poll(()=>commands.length).toBe(2);await expect.poll(async()=>JSON.stringify(await positions())).toBe(JSON.stringify(initial));pass('ONE_UNDO_RESTORES_BOTH_NODES');
  await page.locator('button[data-tool=redo]').click();await expect.poll(()=>commands.length).toBe(3);await expect.poll(async()=>JSON.stringify(await positions())).toBe(JSON.stringify(arranged));assert.equal(new Set(commands.map(c=>c.operationId)).size,3);pass('ONE_REDO_RESTORES_LAYOUT_SEPARATE_HISTORY_IDENTITIES');
  await tidy.click();await expect(tidy).toBeEnabled();await page.waitForTimeout(700);assert.equal(commands.length,3);pass('REPEATED_ARRANGE_IS_STABLE_NO_EXTRA_POST');
  await page.locator('button[data-tool=undo]').click();await expect.poll(()=>commands.length).toBe(4);await expect.poll(async()=>JSON.stringify(await positions())).toBe(JSON.stringify(initial));rejectNext=true;await tidy.click();await expect.poll(()=>commands.length).toBe(5);await expect(tidy).toBeEnabled();assert.deepEqual(await positions(),initial);pass('HTTP_409_LEAVES_CANVAS_INTACT_AND_UNLOCKS_HISTORY');
  await page.setViewportSize({width:390,height:844});await expect(tidy).toBeVisible();await tidy.click();await expect.poll(()=>commands.length).toBe(6);await expect(tidy).toBeEnabled();await expect.poll(async()=>JSON.stringify(await positions())).toBe(JSON.stringify(arranged));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=390));pass('MOBILE390_REAL_TIDY_NO_DOCUMENT_OVERFLOW');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(paid,[]);pass('ZERO_PAGEERROR_EXTERNAL_OR_PAID_POST');
  const literal=`CANVAS_ARRANGE_NATIVE=PASS CHECKS=${checks.length} FULL_NEXT_REACTFLOW=1 HISTORY_POSTS=${commands.length} MANUAL_ZOOM=PRESERVED PAID_POSTS=0`;
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,commands,initial,arranged,manualZoom:.5,pageErrors:errors,external,paid,ports:[port,port+1],literal,scope:'Actual complete Next/ReactFlow controls and original history owner; loopback HTTP fixtures, no PG or supplier.'},null,2));console.log(literal);
 }catch(e){fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:e.stack,checks,commands,errors,external,paid,body:await page?.locator('body').innerText().catch(()=>null)},null,2));throw e}
 finally{release?.();await browser?.close();if(app.exitCode===null&&app.signalCode===null){if(process.platform==='win32'){const q=spawnSync('taskkill',['/pid',String(app.pid),'/t','/f'],{windowsHide:true,encoding:'utf8'});fs.writeFileSync(path.join(out,'fixture-stop.log'),q.stdout+q.stderr)}else app.kill('SIGTERM')}log.end()}
})().catch(e=>{console.error(e);process.exitCode=1});
