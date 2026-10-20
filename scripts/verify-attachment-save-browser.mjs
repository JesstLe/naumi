// Isolated multi-session attachment acceptance; same browser workflow as G58/G64.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.argv[2]),port=Number(process.argv[3]||18560),base=`http://127.0.0.1:${port}`;
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true}),checks=[],errors=[];
const ok=(v,name)=>{assert(v,name);checks.push(name);};
const start=async()=>{const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/preview.html?v=4',{waitUntil:'networkidle'});return p;};
const enter=async p=>{await p.locator('.sidebar [data-view="schedule"]').click();await p.locator('[data-import-mode="real"]').click();await p.waitForFunction(()=>sheetGrid.doc&&!sheetGrid.loading);};
const sync=async p=>p.evaluate(async()=>{await sgReload();shell();});
const edit=async(p,id)=>p.evaluate(id=>sgAttachments(sheetGrid.doc.rows.find(r=>r.id===id),sgCols().find(c=>c.id==='files')),id);
const save=async p=>p.locator('[form="sgAttachmentsForm"]').click();
const state=async(p,v)=>p.waitForFunction(v=>sgEditSession?.state===v,v);
const done=async p=>p.waitForFunction(()=>!sgEditSession&&!document.querySelector('#sgAttachmentsForm'));
const upload=async(p,name,text=name)=>{await p.locator('#sgUpload').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(text)});await p.waitForFunction(name=>document.querySelector('.sg-attachment-list')?.textContent.includes(name)&&!document.querySelector('#sgAttachmentsForm').sgBusy,name);};
let p,q;
try{
 p=await start();if(!await p.evaluate(()=>typeof SheetAttachmentModel!=='undefined')){console.log('ATTACHMENT_SAVE_BASELINE: collection_merge=missing recoverable_attachment_save=missing');process.exitCode=2;}
 else{
  await enter(p);q=await start();await enter(q);const original=await p.evaluate(()=>JSON.stringify(imported.rows));
  const id=await p.evaluate(async()=>{const id=crypto.randomUUID();await sgCommand({type:'add-row',id,parentId:null,cells:{title:'G65 合成附件验收',files:[]}});shell();return id;});
  await edit(p,id);await upload(p,'基础附件.txt');await save(p);await done(p);ok(true,'upload and attach uses recoverable save');
  await sync(q);await edit(p,id);await edit(q,id);await upload(p,'甲新增.txt');await upload(q,'乙新增.txt');await save(q);await done(q);await save(p);await state(p,'conflict');
  ok(await p.locator('.sg-conflict-table').count()===0,'different additions merge without fabricated conflict');await p.locator('#sgMergeSave').click();await done(p);
  ok(await p.evaluate(id=>sheetGrid.doc.rows.find(r=>r.id===id).cells.files.length===3,id),'both sessions additions retained');
  // Local removal must not remove a different new file from the other session.
  await edit(p,id);await p.locator('[data-sg-unlink]').first().click();await sync(q);await edit(q,id);await upload(q,'同事后来新增.txt');await save(q);await done(q);await save(p);await state(p,'conflict');await p.locator('#sgMergeSave').click();await done(p);
  ok(await p.evaluate(id=>{const n=sheetGrid.doc.rows.find(r=>r.id===id).cells.files.map(r=>r.name);return !n.includes('基础附件.txt')&&n.includes('同事后来新增.txt')&&n.length===3;},id),'local removal preserves colleague new file');
  // Commit reaches server; response is lost. Freeze the list and replay the same request.
  await edit(p,id);await upload(p,'响应丢失.txt');const before=await p.evaluate(()=>sheetGrid.version),requests=[];let drop=true;
  const loss=async route=>{if(route.request().method()==='POST'&&route.request().url().includes('action=worksheet-command')){requests.push(route.request().postData());if(drop){drop=false;await route.fetch();return route.abort('connectionreset');}}return route.continue();};
  await p.route('**/api/enterprise/imports?**',loss);await save(p);await state(p,'unknown');
  ok(await p.locator('[data-sg-unlink]').first().isDisabled()&&await p.locator('#sgUpload').isDisabled(),'unknown association result locks dynamic attachment controls');
  await p.locator('[data-sg-save-retry]').click();await done(p);await p.unroute('**/api/enterprise/imports?**',loss);
  ok(requests.length===2&&requests[0]===requests[1]&&await p.evaluate(()=>sheetGrid.version)===before+1,'attachment response loss replays one immutable command');
  // Saved association + failed list read retries GET only.
  await edit(p,id);await upload(p,'刷新失败.txt');let posted=false,gets=0,posts=0;
  const readFail=async route=>{const a=new URL(route.request().url()).searchParams.get('action');if(a==='worksheet-command'){posted=true;posts++;}if(posted&&a==='worksheet'&&gets++===0)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"READ_UNAVAILABLE"}'});return route.continue();};
  await p.route('**/api/enterprise/imports?**',readFail);await save(p);await state(p,'saved');await p.locator('[data-sg-save-retry]').click();await done(p);await p.unroute('**/api/enterprise/imports?**',readFail);ok(posts===1,'saved attachment refresh never repeats the mutation');
  // Definite rejection followed by a changed list is editable without closing the dialog.
  await edit(p,id);await upload(p,'首次拒绝.txt');const ids=[];let rejectOnce=true;
  const rejection=async route=>{if(route.request().method()==='POST'&&route.request().url().includes('action=worksheet-command')){ids.push(JSON.parse(route.request().postData()).commandId);if(rejectOnce){rejectOnce=false;return route.fulfill({status:400,contentType:'application/json',body:'{"error":"ASSET_NOT_FOUND"}'});}}return route.continue();};
  await p.route('**/api/enterprise/imports?**',rejection);await save(p);await state(p,'rejected');await p.locator('[data-sg-unlink]').last().click();await upload(p,'修正后附件.txt');await save(p);await done(p);await p.unroute('**/api/enterprise/imports?**',rejection);ok(ids.length===2&&ids[0]!==ids[1],'definite rejection allows correction with fresh command');
  // A lost upload response does not fabricate an attachment; choosing the same bytes again is deduplicated.
  await edit(p,id);let uploadLost=true;const uploadLoss=async route=>{if(uploadLost){uploadLost=false;await route.fetch();return route.abort('connectionreset');}return route.continue();};await p.route('**/api/enterprise/imports?action=worksheet-upload*',uploadLoss);
  await p.locator('#sgUpload').setInputFiles({name:'上传响应丢失.txt',mimeType:'text/plain',buffer:Buffer.from('unique upload loss fixture')});await p.waitForFunction(()=>!document.querySelector('#sgAttachmentsForm').sgBusy&&!document.querySelector('#sgFileError').hidden);
  ok((await p.locator('#sgFileError').innerText()).includes('待确认')&&!(await p.locator('.sg-attachment-list').innerText()).includes('上传响应丢失.txt'),'lost upload response stays unassociated with an actionable error');
  await upload(p,'上传响应丢失.txt','unique upload loss fixture');await p.unroute('**/api/enterprise/imports?action=worksheet-upload*',uploadLoss);await save(p);await done(p);ok(await p.evaluate(id=>sheetGrid.doc.rows.find(r=>r.id===id).cells.files.filter(r=>r.name==='上传响应丢失.txt').length===1,id),'same-byte upload retry creates one association');
  // Source picker stays inside the editor; switching it must not lose uploads or trigger a discard dialog.
  await edit(p,id);await upload(p,'未保存上传.txt');await p.locator('#sgChooseSource').click();await p.locator('#sgSourcePicker').waitFor({state:'visible'});ok((await p.locator('.sg-attachment-list').innerText()).includes('未保存上传.txt'),'source picker preserves unsaved uploads');
  const excel=await p.evaluate(()=>imported.assets.filter(a=>/\.xlsx$/i.test(a.name)).sort((a,b)=>a.bytes-b.bytes)[0]);
  await p.locator('#sgSourceSearch').fill(excel.name);await p.locator(`[data-sg-source-id="${excel.id}"]`).check();
  ok(await p.locator('[data-ex-attachment]').count()>=1,'source Excel selected in-place');await p.locator('[data-ex-attachment]').first().click();
  ok(await p.locator('#sgAttachmentsForm').count()===1&&await p.locator('#exWorkbook').count()===0,'dirty attachment changes block entering Excel before association is saved');
  p.once('dialog',d=>d.dismiss());await p.locator('#overlay [data-close]').first().click();ok(await p.locator('#sgAttachmentsForm').count()===1,'discard cancellation preserves attachment draft');
  await save(p);await done(p);await edit(p,id);await p.locator('[data-ex-attachment]').first().click();await p.locator('.ex-table').waitFor({state:'attached'});ok(true,'saved Excel attachment still opens embedded preview');await p.locator('#overlay [data-close]').first().click();
  // Removing an Excel whose saved revision changed must require an explicit per-file decision.
  const revision=async marker=>{await sync(q);return q.evaluate(async({id,excel,marker})=>{const refs=sheetGrid.doc.rows.find(r=>r.id===id).cells.files,ref=refs.find(r=>r.id===excel.id&&r.kind==='source'),manifest={schema:1,kind:'excel-cell-revision',base:{kind:ref.kind,id:ref.id,name:ref.name},parentRevision:ref.excelRevision||null,createdAt:new Date().toISOString(),patches:[]};const uploaded=await sgRequest('worksheet-upload',{source:sheetGrid.source},{name:'合成版本-'+marker+'.json',data:btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(manifest))))});await sgCommand({type:'set-cells',row:id,cells:{files:refs.map(r=>r.id===ref.id&&r.kind===ref.kind?{...r,excelRevision:uploaded.id}:r)}});return uploaded.id;},{id,excel,marker});};
  await revision('first');await sync(p);await edit(p,id);await p.locator(`[data-sg-unlink-key="source:${excel.id}"]`).click();const latestRevision=await revision('second');await save(p);await state(p,'conflict');
  ok(await p.locator('.sg-conflict-table').count()===1&&await p.locator('#sgMergeSave').isDisabled(),'removing concurrently revised Excel requires explicit choice');
  await p.screenshot({path:resolve(out,'conflict.png'),fullPage:true});await p.locator('[data-sg-conflict]').selectOption('latest');await p.locator('#sgMergeSave').click();await done(p);
  ok(await p.evaluate(({id,excel,latestRevision})=>sheetGrid.doc.rows.find(r=>r.id===id).cells.files.find(r=>r.id===excel.id)?.excelRevision===latestRevision,{id,excel,latestRevision}),'choosing latest preserves colleague Excel revision');
  // Close is guarded even before an in-flight upload has returned its first file.
  await edit(p,id);let release;const gate=new Promise(r=>release=r);const slow=async route=>{await gate;return route.continue();};await p.route('**/api/enterprise/imports?action=worksheet-upload*',slow);
  await p.locator('#sgUpload').setInputFiles({name:'延迟上传.txt',mimeType:'text/plain',buffer:Buffer.from('delayed fixture')});await p.waitForFunction(()=>document.querySelector('#sgAttachmentsForm').sgBusy);await p.locator('#overlay [data-close]').first().click();
  ok(await p.locator('#sgAttachmentsForm').count()===1&&await p.locator('#sgUpload').isDisabled(),'in-flight upload blocks premature close');release();await p.waitForFunction(()=>!document.querySelector('#sgAttachmentsForm').sgBusy);await p.unroute('**/api/enterprise/imports?action=worksheet-upload*',slow);p.once('dialog',d=>d.accept());await p.locator('#overlay [data-close]').first().click();
  await sync(p);await p.setViewportSize({width:390,height:844});await edit(p,id);await p.locator('#sgChooseSource').click();
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'390px attachment picker stays inside viewport');await p.waitForFunction(()=>getComputedStyle(document.querySelector('#toast')).opacity==='0');await p.screenshot({path:resolve(out,'mobile.png'),fullPage:true});await p.locator('#overlay [data-close]').first().click();
  ok(await p.evaluate(()=>JSON.stringify(imported.rows))===original,'original source records unchanged');ok(errors.length===0,'page errors zero');
  await writeFile(resolve(out,'ACCEPTANCE.json'),JSON.stringify({checks:checks.length,names:checks,errors,isolated:true},null,2));console.log(`ATTACHMENT_SAVE_BROWSER_PASS: checks=${checks.length} collection_merge=1 unknown_replay=1 dirty_guard=1 excel_entry=1 source_unchanged=1 page_errors=0`);
 }
}catch(e){if(p)await p.screenshot({path:resolve(out,'FAILED.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(out,'FAILED.txt'),e.stack||e.message);console.error(e);process.exitCode=1;}finally{await browser.close();}
