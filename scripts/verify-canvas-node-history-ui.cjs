// Full Next CanvasClient + existing local HTTP fixture, isolated API records.
const {chromium}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const base=process.env.CANVAS_HISTORY_FIXTURE_URL||'http://127.0.0.1:17871',out=path.resolve(process.env.CANVAS_HISTORY_EVIDENCE||'output/canvas-node-history-ui');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const checks=[],requests=[],errors=[],external=[];let arts,texts,failHistory=false,failQuote=false;const allArts=new Map();
 const bytes=await sharp({create:{width:320,height:260,channels:3,background:'#8eb2c2'}}).png().toBuffer();
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1600,height:1100}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());if(!['127.0.0.1','localhost'].includes(u.hostname)&&!['blob:','data:'].includes(u.protocol)){external.push(u.origin);return route.abort();}
  if(u.pathname==='/api/media/image-cache'){const sources=r.postDataJSON().sources,account='placement-fixture@example.test';return json(route,{account,results:Object.fromEntries(sources.map(source=>[source,{source,account,version:crypto.createHash('sha256').update(bytes).digest('hex'),fetchUrl:'/media/node-history.png',bytes:bytes.length,contentType:'image/png'}]))});}
  if(u.pathname==='/media/node-history.png')return route.fulfill({contentType:'image/png',body:bytes});
  if(u.pathname==='/api/account'){const res=await route.fetch(),data=await res.json();arts??=data.artworks.map((a,i)=>({...a,image:'/media/node-history.png',canvasX:100+i*500,canvasY:100}));for(const a of arts)allArts.set(a.id,a);return json(route,{...data,artworks:arts});}
  if(u.pathname==='/api/artworks/get')return json(route,{artworks:arts.filter(a=>(u.searchParams.get('ids')||'').split(',').includes(a.id))});
  if(u.pathname==='/api/canvas/video-nodes')return json(route,{nodes:[],persisted:true});
  if(u.pathname==='/api/canvas/text-nodes'){
   if(!texts){const res=await route.fetch(),data=await res.json();texts=data.nodes.map(n=>({...n,content:'',prompt:'',canvasX:300,canvasY:500}));}
   if(r.method()==='POST')for(const n of r.postDataJSON().nodes||[]){const at=texts.findIndex(x=>x.id===n.id);if(at>=0)texts[at]=n;else texts.push(n);}
   return json(route,{nodes:texts,persisted:true});
  }
  if(u.pathname==='/api/canvas/nodes/delete'){
   const body=r.postDataJSON();requests.push({path:u.pathname,body});arts=arts.filter(a=>!body.artworkIds.includes(a.id));texts=texts.filter(n=>!body.textIds.includes(n.id));return json(route,{ok:true,persisted:true});
  }
  if(u.pathname==='/api/canvas/history'){
   const body=r.postDataJSON();requests.push({path:u.pathname,body});if(failHistory){failHistory=false;return json(route,{error:'signal timed out'},503);}
   for(const op of body.operations){if(op.type==='text-restore'){texts=texts.filter(n=>n.id!==op.node.id);texts.push(op.node)}if(op.type==='text-delete')texts=texts.filter(n=>n.id!==op.id);if(op.type==='visibility'){arts=arts.filter(a=>a.id!==op.id);if(op.visible)arts.push(allArts.get(op.id));}}
   return json(route,{ok:true,persisted:true});
  }
  if(u.pathname==='/api/billing/quote'&&failQuote)return json(route,{error:'本次报价凭据与账号或工作空间不符'},409);
  if(u.pathname==='/api/download'){return route.fulfill({contentType:'image/png',body:bytes});}
  return route.continue();
 });
 const textFixtureId=process.env.CANVAS_HISTORY_TEXT_ID||'text-dock-fixture';
 const pend=()=>page.locator('.react-flow__node[data-id^="pend-"]'),node=id=>page.locator(`.react-flow__node[data-id="${id}"]`);
 const blur=()=>page.evaluate(()=>document.activeElement?.blur());
 const waitCount=(selector,n)=>page.waitForFunction(({selector,n})=>document.querySelectorAll(selector).length===n,{selector,n});
 try{
  await page.goto(base+'/canvas',{waitUntil:'domcontentloaded',timeout:180000});await node('placement-root').waitFor({timeout:120000});await node(textFixtureId).waitFor();
  await page.locator('[data-tool="image-node"]').click();await waitCount('.react-flow__node[data-id^="pend-"]',1);await blur();await page.keyboard.press('Control+z');await waitCount('.react-flow__node[data-id^="pend-"]',0);await page.keyboard.press('Control+Shift+z');await waitCount('.react-flow__node[data-id^="pend-"]',1);checks.push('REAL_ADD_EMPTY_CTRL_Z_REDO');
  await pend().first().click({position:{x:40,y:40}});await blur();await page.keyboard.press('Backspace');await waitCount('.react-flow__node[data-id^="pend-"]',0);await page.keyboard.press('Control+z');await waitCount('.react-flow__node[data-id^="pend-"]',1);assert.equal(requests.length,0);checks.push('REAL_SINGLE_EMPTY_BACKSPACE_UNDO_NO_API');
  // Move the first blank out of the center before creating another, so actual
  // shift-click selection can reach both nodes without DOM hooks.
  const b=await pend().first().boundingBox();await page.mouse.move(b.x+20,b.y+20);await page.mouse.down();await page.mouse.move(b.x-260,b.y-210,{steps:10});await page.mouse.up();
  await page.locator('[data-tool="image-node"]').click();await waitCount('.react-flow__node[data-id^="pend-"]',2);
  const ids=await pend().evaluateAll(ns=>ns.map(n=>n.dataset.id));
  await node(ids[0]).click({position:{x:20,y:30}});await node(ids[1]).click({position:{x:20,y:30},modifiers:['Shift']});await node(textFixtureId).click({position:{x:20,y:30},modifiers:['Shift']});
  await page.getByTestId('mixed-node-batch-bar').waitFor();assert.match(await page.getByTestId('mixed-node-batch-bar').innerText(),/3/);
  await page.getByTestId('mixed-node-batch-bar').getByRole('button',{name:'删除',exact:true}).click();
  await page.getByText('删除选中的 3 个节点?',{exact:true}).waitFor();await page.getByRole('button',{name:'确定删除',exact:true}).click();
  await waitCount('.react-flow__node[data-id^="pend-"]',0);await node(textFixtureId).waitFor({state:'detached'});assert.equal(requests.filter(r=>r.path.endsWith('/delete')).length,1);checks.push('REAL_MIXED_TWO_EMPTY_ONE_TEXT_COUNTS_AND_DELETES_THREE');
  await blur();await page.keyboard.press('Control+z');await waitCount('.react-flow__node[data-id^="pend-"]',2);await node(textFixtureId).waitFor();checks.push('REAL_MIXED_DELETE_SINGLE_UNDO_RESTORES_ALL');
  // A failed history response leaves local state and the original operation ID.
  failHistory=true;await page.keyboard.press('Control+y');await page.getByText('保存响应超时，修改仍保留；请重试原操作',{exact:true}).waitFor();assert.equal(await pend().count(),2);
  const firstAttempt=requests.at(-1).body;await page.keyboard.press('Control+y');await waitCount('.react-flow__node[data-id^="pend-"]',0);assert.equal(requests.at(-1).body.operationId,firstAttempt.operationId);assert.deepEqual(requests.at(-1).body,firstAttempt);checks.push('REAL_HISTORY_TIMEOUT_NO_LOCAL_LOSS_SAME_OPERATION_RETRY');
  failQuote=true;await node('placement-root').click({position:{x:45,y:40}});await page.getByRole('button',{name:'重构比例',exact:true}).click();
  await page.getByRole('button',{name:'宽屏 16:9',exact:true}).click();
  const failed=page.locator('.react-flow__node[data-id^="task-"]').filter({has:page.getByTestId('generation-failure')});await failed.waitFor({timeout:30000});
  const failedId=await failed.getAttribute('data-id');const edge=page.locator(`.react-flow__edge[data-testid="rf__edge-e-${failedId}"]`);
  await page.locator('.react-flow__edge path.cw-base').first().waitFor();const taskEdge=page.locator(`[data-testid="rf__edge-e-${failedId}"] path.cw-base`);assert.equal(await taskEdge.count(),1);
  const stroke=await taskEdge.evaluate(p=>getComputedStyle(p).stroke);assert.notEqual(stroke,'rgba(255, 255, 255, 0.28)');checks.push('REAL_RATIO_FAILURE_EDGE_VISIBLE_ON_LIGHT_CANVAS');
  await failed.click({position:{x:35,y:35}});await blur();await page.keyboard.press('Delete');await failed.waitFor({state:'detached'});await page.keyboard.press('Control+z');await page.locator(`.react-flow__node[data-id="${failedId}"]`).waitFor();checks.push('REAL_FAILED_TASK_DELETE_AND_UNDO');
  await page.locator('[data-tool="image-node"]').click();await waitCount('.react-flow__node[data-id^="pend-"]',1);const blankId=await pend().first().getAttribute('data-id');
  const blankBox=await pend().first().boundingBox();await page.mouse.move(blankBox.x+20,blankBox.y+20);await page.mouse.down();await page.mouse.move(blankBox.x-320,blankBox.y-160,{steps:10});await page.mouse.up();
  await node('placement-second').click({position:{x:40,y:35}});await blur();await page.waitForTimeout(400);
  await page.waitForFunction(()=>document.querySelector('.react-flow__node[data-id="placement-second"]')?.classList.contains('selected'));
  await page.keyboard.down('Shift');await page.waitForTimeout(100);await node(failedId).click({position:{x:35,y:35}});await page.waitForTimeout(400);
  await page.waitForFunction(id=>document.querySelector(`.react-flow__node[data-id="${id}"]`)?.classList.contains('selected'),failedId);
  await node(blankId).click({position:{x:30,y:25}});await page.keyboard.up('Shift');
  await page.getByTestId('image-batch-bar').waitFor();await page.getByTestId('image-batch-bar').getByRole('button',{name:'删除',exact:true}).click();await page.getByText('删除选中的 3 个节点?',{exact:true}).waitFor();await page.getByRole('button',{name:'确定删除',exact:true}).click();
  for(const id of ['placement-second',failedId,blankId])await node(id).waitFor({state:'detached'});await blur();await page.keyboard.press('Control+z');for(const id of ['placement-second',failedId,blankId])await node(id).waitFor();checks.push('REAL_EMPTY_FAILED_AND_NORMAL_MIXED_DELETE_ONE_UNDO_RESTORES_THREE');
  await page.waitForFunction(()=>{const i=document.querySelector('.react-flow__node[data-id="placement-second"] img');return i?.complete&&i.naturalWidth>0});
  await page.screenshot({path:path.join(out,'node-history.png')});assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({checks,requests,errors,external,supplierCalls:0,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync('src/components/canvas/canvas-client.tsx')).digest('hex')},null,2));console.log(`CANVAS_NODE_HISTORY_UI=PASS CHECKS=${checks.length} PAGEERRORS=0 SUPPLIER_CALLS=0`);
 }catch(e){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({error:e.stack,checks,requests,errors,external,body:await page.locator('body').innerText().catch(()=>''),nodes:await page.locator('.react-flow__node').evaluateAll(ns=>ns.map(n=>({id:n.dataset.id,selected:n.classList.contains('selected')}))).catch(()=>[])},null,2));throw e}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
