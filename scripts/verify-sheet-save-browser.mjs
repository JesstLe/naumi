// Extends the repository's isolated sheet-browser workflow. No user browser, production or paid calls.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.argv[2]),port=Number(process.argv[3]||18560),base=`http://127.0.0.1:${port}`;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),checks=[],errors=[];
const ok=(v,name)=>{assert(v,name);checks.push(name);};
const pages=[];
const start=async()=>{const context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/preview.html?v=4',{waitUntil:'networkidle'});return p;};
const wait=async(p)=>{await p.waitForFunction(()=>!!sheetGrid.doc&&!sheetGrid.loading);};
const show=async(p)=>{await p.locator('.sidebar [data-view="schedule"]').click();await p.locator('[data-import-mode="real"]').click();await wait(p);};
const state=async(p,s)=>p.waitForFunction(s=>sgEditSession?.state===s,s);
const close=async(p)=>{await p.locator('#overlay [data-close]').first().click();await p.waitForFunction(()=>!document.querySelector('#overlay').children.length);};
const sync=async(p)=>{await p.evaluate(async()=>{await sgReload();shell();});};
const edit=async(p,id,col,value)=>{await p.evaluate(({id,col})=>sgEditor(id,col),{id,col});await p.locator('#sgCellForm [name="value"]').fill(value);};
const save=async(p)=>{await p.locator('[form="sgCellForm"]').click();};
const saved=async(p)=>{await p.waitForFunction(()=>!sgEditSession&&!document.querySelector('#sgCellForm'));};
const mutate=async(p,id,cells)=>{await sync(p);await p.evaluate(async({id,cells})=>{await sgCommand({type:'set-cells',row:id,cells});shell();},{id,cells});};
let p,q;
try{
 p=await start();
 if(!await p.evaluate(()=>typeof globalThis.SheetSaveModel!=='undefined')){console.log('SHEET_SAVE_BROWSER_BASELINE: recoverable_save=missing');process.exitCode=2;}
 else{
  await show(p);q=await start();await show(q);
  const source=await p.evaluate(()=>JSON.stringify(imported.rows));
  await p.locator('#sgCreate').click();await p.locator('#sgRowForm [name="title"]').fill('G64 合成保存验收');await p.locator('[form="sgRowForm"]').click();await saved(p);
  const id=await p.evaluate(()=>sheetGrid.doc.rows.find(r=>r.cells.title==='G64 合成保存验收').id);ok(!!id,'new row uses recoverable save');
  await edit(p,id,'status','我的状态');await mutate(q,id,{status:'同事状态'});await save(p);await state(p,'conflict');
  ok(await p.locator('#sgMergeSave').isDisabled(),'same-cell conflict requires explicit choice');
  ok((await p.locator('.sg-conflict-table').innerText()).includes('同事状态')&&(await p.locator('.sg-conflict-table').innerText()).includes('我的状态'),'three-way comparison contains current and draft');
  ok(await p.locator('#sgCellForm [name="value"]').inputValue()==='我的状态','conflict retains input');
  await p.locator('[data-sg-conflict="status"]').selectOption('latest');await p.locator('#sgMergeSave').click();await saved(p);
  ok(await p.evaluate(id=>sheetGrid.doc.rows.find(r=>r.id===id).cells.status==='同事状态',id),'choose current never silently overwrites colleague');
  await edit(p,id,'status','新的本地状态');await mutate(q,id,{title:'同事只改名称'});await save(p);await state(p,'conflict');
  ok(await p.locator('.sg-conflict-table').count()===0,'unrelated change has no fabricated field conflict');
  await p.locator('#sgMergeSave').click();await saved(p);
  ok(await p.evaluate(id=>{const r=sheetGrid.doc.rows.find(r=>r.id===id);return r.cells.status==='新的本地状态'&&r.cells.title==='同事只改名称';},id),'explicit safe rebase preserves both edits');
  await p.evaluate(id=>sgRowForm(sheetGrid.doc.rows.find(r=>r.id===id)),id);
  await p.locator('#sgRowForm [name="title"]').fill('保留我的名称');await p.locator('#sgRowForm [name="status"]').fill('丢弃的本地状态');
  await mutate(q,id,{title:'同事再次改名称',status:'保留同事状态'});await p.locator('[form="sgRowForm"]').click();await state(p,'conflict');
  await p.locator('[data-sg-conflict="title"]').selectOption('mine');ok(await p.locator('#sgMergeSave').isDisabled(),'all conflicting fields must be chosen');
  await p.locator('[data-sg-conflict="status"]').selectOption('latest');await p.locator('#sgMergeSave').click();await saved(p);
  ok(await p.evaluate(id=>{const r=sheetGrid.doc.rows.find(r=>r.id===id);return r.cells.title==='保留我的名称'&&r.cells.status==='保留同事状态';},id),'mixed field choices applied atomically');

  // Lose the response after the real server commits. The second POST must be the exact same command.
  await edit(p,id,'status','已提交但响应丢失');const beforeReplayVersion=await p.evaluate(()=>sheetGrid.version),requests=[];let lose=true;
  const drop=async route=>{if(route.request().method()==='POST'&&route.request().url().includes('action=worksheet-command')){requests.push(route.request().postData());if(lose){lose=false;await route.fetch();return route.abort('connectionreset');}}return route.continue();};
  await p.route('**/api/enterprise/imports?**',drop);await save(p);await state(p,'unknown');
  ok(await p.locator('#sgCellForm [name="value"]').isDisabled(),'unknown result pins and locks original input');
  await p.locator('[data-sg-save-retry]').click();await saved(p);await p.unroute('**/api/enterprise/imports?**',drop);
  ok(requests.length===2&&requests[0]===requests[1],'unknown response retries identical command and version');
  const audit=await p.evaluate(async()=>sgRequest('worksheet-audit',{source:sheetGrid.source}));
  ok(audit.events.filter(e=>e.detail.row===id&&e.detail.after.cells?.status==='已提交但响应丢失').length===1&&await p.evaluate(()=>sheetGrid.version)===beforeReplayVersion+1,'response-loss replay creates exactly one audit mutation');

  // A definite rejection can be corrected without reopening; command IDs rotate.
  await edit(p,id,'status','首次被拒绝');const rejected=[];let rejectOnce=true;
  const reject=async route=>{if(route.request().method()==='POST'&&route.request().url().includes('action=worksheet-command')){rejected.push(JSON.parse(route.request().postData()));if(rejectOnce){rejectOnce=false;return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'NUMBER_INVALID'})});}}return route.continue();};
  await p.route('**/api/enterprise/imports?**',reject);await save(p);await state(p,'rejected');await p.locator('#sgCellForm [name="value"]').fill('修正后保存');await save(p);await saved(p);await p.unroute('**/api/enterprise/imports?**',reject);
  ok(rejected.length===2&&rejected[0].commandId!==rejected[1].commandId,'definitively rejected input can be corrected with a fresh ID');

  // Successful write followed by failed refresh must retry GET only.
  await edit(p,id,'status','已保存待刷新');let posted=false,gets=0,posts=0;
  const refresh=async route=>{const u=new URL(route.request().url());if(u.searchParams.get('action')==='worksheet-command'){posted=true;posts++;return route.continue();}if(posted&&u.searchParams.get('action')==='worksheet'&&gets++===0)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"TEMPORARY_READ_FAILURE"}'});return route.continue();};
  await p.route('**/api/enterprise/imports?**',refresh);await save(p);await state(p,'saved');
  ok((await p.locator('.sg-save-recovery').innerText()).includes('内容已保存'),'committed write distinct from refresh failure');
  await p.locator('[data-sg-save-retry]').click();await saved(p);await p.unroute('**/api/enterprise/imports?**',refresh);ok(posts===1&&gets>=2,'list refresh retry never resubmits the write');

  // A second competitor wins after comparison: rerun CAS and preserve user input again.
  await edit(p,id,'status','再次冲突本地');await mutate(q,id,{title:'引发版本变化'});await save(p);await state(p,'conflict');await mutate(q,id,{status:'抢先保存'});await p.locator('#sgMergeSave').click();await state(p,'conflict');
  ok(await p.locator('[data-sg-conflict="status"]').count()===1,'second race is rejected by server CAS');
  await p.locator('[data-sg-conflict="status"]').selectOption('mine');await p.locator('#sgMergeSave').click();await saved(p);
  ok(await p.evaluate(id=>sheetGrid.doc.rows.find(r=>r.id===id).cells.status==='再次冲突本地',id),'second race can be explicitly resolved');

  await edit(p,id,'status','放弃测试');p.once('dialog',d=>d.dismiss());await p.locator('#overlay [data-close]').first().click();ok(await p.locator('#sgCellForm').count()===1,'cancel leave retains draft');
  p.once('dialog',d=>d.accept());await close(p);await edit(p,id,'status','');
  // unchanged form exits without a prompt, then deletion conflict blocks resurrection.
  await p.locator('#sgCellForm [name="value"]').fill(await p.evaluate(id=>sheetGrid.doc.rows.find(r=>r.id===id).cells.status,id));await close(p);ok(true,'unchanged form closes directly');
  await edit(p,id,'status','删除后不能覆盖');await sync(q);await q.evaluate(async id=>sgCommand({type:'delete-row',row:id}),id);await save(p);await state(p,'conflict');
  ok((await p.locator('.sg-save-recovery').innerText()).includes('已删除')&&await p.locator('#sgMergeSave').count()===0,'deleted record cannot be revived by stale save');
  p.once('dialog',d=>d.accept());await close(p);
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>shell());
  await p.evaluate(()=>sgEditor(sheetGrid.doc.rows.find(r=>!r.archived).id,'status'));await p.locator('#sgCellForm [name="value"]').fill('移动验收');
  await p.screenshot({path:resolve(out,'mobile.png'),fullPage:true});
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'390px editor does not overflow page');
  p.once('dialog',d=>d.accept());await close(p);
  // Return to a real same-field conflict for a visual review of the completed module.
  await p.setViewportSize({width:1440,height:1000});await sync(p);await sync(q);const visual=await p.evaluate(()=>sheetGrid.doc.rows.find(r=>!r.archived).id);
  await edit(p,visual,'status','当前窗口的计划');await mutate(q,visual,{status:'另一位同事的计划'});await save(p);await state(p,'conflict');await p.screenshot({path:resolve(out,'conflict.png'),fullPage:true});
  ok(await p.evaluate(()=>JSON.stringify(imported.rows))===source,'original imported records unchanged');
  ok(errors.length===0,'page errors zero');
  await writeFile(resolve(out,'BROWSER_CHECKS.json'),JSON.stringify({checks:checks.length,names:checks,pageErrors:errors,isolatedDatabase:true},null,2));
  console.log(`SHEET_SAVE_BROWSER_PASS: checks=${checks.length} two_sessions=1 unknown_replay=1 refresh_get_only=1 source_unchanged=1 page_errors=0`);
 }
}catch(e){await writeFile(resolve(out,'FAILED.txt'),e.stack||e.message);if(p)await p.screenshot({path:resolve(out,'failed.png'),fullPage:true}).catch(()=>{});console.error(e);process.exitCode=1;}
finally{await browser.close();}
