// Repository-owned isolated browser workflow. No employee data writes or paid provider calls.
import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),XLSX=require('../design/enterprise-demo/vendor/xlsx-0.20.3.min.js');
const out=resolve(process.argv[2]),port=Number(process.argv[3]||18560),url=`http://127.0.0.1:${port}/preview.html?v=4`;
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true}),checks=[],errors=[];let p,q;
const ok=(v,name)=>{assert(v,name);checks.push(name);};
const start=async()=>{const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url,{waitUntil:'networkidle'});return page;};
const enter=async page=>{await page.locator('.sidebar [data-view="schedule"]').click();await page.locator('[data-import-mode="real"]').click();await page.waitForFunction(()=>sheetGrid.doc&&!sheetGrid.loading);};
const open=async(page,id)=>{await page.evaluate(async id=>{await sgReload();sgExcelCell(id,'files');},id);await page.locator('.ex-table').waitFor();await page.locator('#exToggleEdit').click();};
const change=async(page,cell,value)=>{await page.locator(`[data-ex-cell="${cell}"]`).click();await page.locator('#exCellInput').fill(value);await page.locator('#exCellInput').press('Enter');await page.waitForFunction(()=>!exSession.applying);};
const save=async page=>page.locator('#exSaveCopy').click();
const state=async(page,v)=>page.waitForFunction(v=>exSession?.saveState===v&&!exSession.saving,v);
const clean=async page=>page.waitForFunction(()=>!exSession.saving&&!exSession.dirty&&!exSession.saveAttempt);
const mutate=async(page,id,cells)=>page.evaluate(async({id,cells})=>{await sgReload();await sgCommand({type:'set-cells',row:id,cells});},{id,cells});
const close=async(page,discard=false)=>{await page.locator('#overlay [data-close]').first().click();if(discard)await page.locator('#exDiscard').click();};
try{
 p=await start();if(!await p.evaluate(()=>typeof ExcelSaveRecovery!=='undefined')){console.log('EXCEL_RECOVERY_BASELINE: pinned_command=missing conflict_export=missing');process.exitCode=2;}
 else{
  await enter(p);q=await start();await enter(q);const original=await p.evaluate(()=>JSON.stringify(imported.rows));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['原始标题',1,2],['第二行',3,4]]),'制作需求');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['附表',10]]),'附表');
  const bytes=Buffer.from(XLSX.write(wb,{type:'buffer',bookType:'xlsx'})),hash=createHash('sha256').update(bytes).digest('hex');
  const id=await p.evaluate(async data=>{const f=await sgRequest('worksheet-upload',{source:sheetGrid.source},{name:'合成编辑恢复.xlsx',data});const id=crypto.randomUUID();await sgCommand({type:'add-row',id,parentId:null,cells:{title:'G66 合成恢复验收',files:[{kind:f.kind,id:f.id,name:f.name}]}});return id;},bytes.toString('base64'));await open(p,id);
  // Real commit occurs but browser loses its response.
  await change(p,'A1','响应丢失已保存');const version=await p.evaluate(()=>sheetGrid.version),requests=[];let lose=true;
  const loss=async route=>{if(route.request().method()==='POST'&&route.request().url().includes('action=worksheet-command')){requests.push(route.request().postData());if(lose){lose=false;await route.fetch();return route.abort('connectionreset');}}return route.continue();};
  await p.route('**/api/enterprise/imports?**',loss);await save(p);await state(p,'unknown');
  ok(await p.locator('#exUndo').isDisabled()&&await p.locator('#exToggleEdit').isDisabled(),'unknown Excel save locks editing controls');
  const signature=await p.evaluate(()=>exSignature(exSession.edits.values()));await p.evaluate(async()=>exApplyEdits(exSession,[exCellPatch(exSession,'A1','不能写入的变动')]));
  ok(await p.evaluate(()=>exSignature(exSession.edits.values()))===signature,'programmatic edits cannot mutate pinned retry');
  await p.locator('[data-ex-cell="A2"]').click();ok(await p.locator('#exCellInput').isDisabled(),'newly selected formula input stays locked');
  await p.locator('#exRecoveryRetry').click();await clean(p);await p.unroute('**/api/enterprise/imports?**',loss);
  ok(requests.length===2&&requests[0]===requests[1]&&await p.evaluate(()=>sheetGrid.version)===version+1,'Excel lost response replays exact command once');
  ok(await p.locator('[data-ex-cell="A1"]').textContent()==='响应丢失已保存','retry retains workbook values');

  // Commit acknowledgement and refresh are separate phases.
  await change(p,'A1','保存成功刷新失败');let posted=false,posts=0,gets=0;
  const refresh=async route=>{const a=new URL(route.request().url()).searchParams.get('action');if(a==='worksheet-command'){posted=true;posts++;}if(posted&&a==='worksheet'&&gets++===0)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"READ_UNAVAILABLE"}'});return route.continue();};
  await p.route('**/api/enterprise/imports?**',refresh);await save(p);await state(p,'saved');ok((await p.locator('#exSaveError').innerText()).includes('已保存'),'Excel commit acknowledged separately from refresh');await p.locator('#exRecoveryRetry').click();await clean(p);await p.unroute('**/api/enterprise/imports?**',refresh);ok(posts===1,'Excel failed refresh retries only GET');

  // Failed upload response: immutable bytes are retried, never invent a revision link.
  await change(p,'A1','版本清单上传丢失');const uploads=[];let uploadLost=true;
  const uploadLoss=async route=>{uploads.push(route.request().postData());if(uploadLost){uploadLost=false;await route.fetch();return route.abort('connectionreset');}return route.continue();};
  await p.route('**/api/enterprise/imports?action=worksheet-upload*',uploadLoss);await save(p);await state(p,'unknown');await p.locator('#exRecoveryRetry').click();await clean(p);await p.unroute('**/api/enterprise/imports?action=worksheet-upload*',uploadLoss);ok(uploads.length===2&&uploads[0]===uploads[1],'lost manifest upload retries identical content');

  // Definite rejection frees edits; a changed workbook gets a fresh command.
  await change(p,'A1','首次被拒绝');const commandIds=[];let reject=true;
  const rejection=async route=>{if(route.request().method()==='POST'&&route.request().url().includes('action=worksheet-command')){commandIds.push(JSON.parse(route.request().postData()).commandId);if(reject){reject=false;return route.fulfill({status:400,contentType:'application/json',body:'{"error":"EXCEL_REVISION_INVALID"}'});}}return route.continue();};
  await p.route('**/api/enterprise/imports?**',rejection);await save(p);await state(p,'rejected');await change(p,'A1','修正后重存');await save(p);await clean(p);await p.unroute('**/api/enterprise/imports?**',rejection);ok(commandIds.length===2&&commandIds[0]!==commandIds[1],'definite Excel rejection permits corrected command');

  // Different attachment added: explicit rebase keeps it; a second CAS race still rejects.
  await change(p,'A1','保留同事附件');await q.evaluate(async id=>{await sgReload();const f=await sgRequest('worksheet-upload',{source:sheetGrid.source},{name:'同事新附件.txt',data:btoa('fixture extra attachment')});const refs=sheetGrid.doc.rows.find(r=>r.id===id).cells.files;await sgCommand({type:'set-cells',row:id,cells:{files:[...refs,{kind:f.kind,id:f.id,name:f.name}]}});},id);
  await save(p);await state(p,'conflict');ok(await p.locator('#exRecoveryRebase').count()===1,'unrelated attachment change offers explicit rebase');
  await mutate(q,id,{status:'核对后再次变化'});await p.locator('#exRecoveryRebase').click();await state(p,'conflict');ok(await p.locator('#exRecoveryRebase').count()===1,'second version race re-enters CAS comparison');await p.locator('#exRecoveryRebase').click();await clean(p);
  ok(await p.evaluate(id=>sheetGrid.doc.rows.find(r=>r.id===id).cells.files.some(r=>r.name==='同事新附件.txt'),id),'rebase preserves colleague attachment');
  await change(p,'A1','核对后继续输入');await mutate(q,id,{status:'再次版本更新'});await save(p);await state(p,'conflict');await p.locator('[data-ex-cell="A1"]').click();await p.locator('#exCellInput').fill('未按回车的核对后输入');
  ok(await p.locator('#exRecoveryRebase').count()===0&&await p.locator('#exSaveCopy').isEnabled(),'typing invalidates stale comparison even before Enter');await save(p);await state(p,'conflict');await p.locator('#exRecoveryRebase').click();await clean(p);
  ok(await p.locator('[data-ex-cell="A1"]').textContent()==='未按回车的核对后输入','new save flushes pending input rather than the old comparison');

  // Same workbook changed by colleague: no overwrite, keep input and export both XLSX and manifest.
  await open(q,id);await change(p,'A1','我的冲突修改');await change(q,'A1','同事新版本');await save(q);await clean(q);await save(p);await state(p,'conflict');
  ok(await p.locator('#exRecoveryRebase').count()===0&&(await p.locator('#exSaveError').innerText()).includes('其他窗口'),'changed workbook revision cannot be blindly rebased');
  ok(await p.locator('[data-ex-cell="A1"]').textContent()==='我的冲突修改','conflict keeps actual workbook edits');
  const download=p.waitForEvent('download');await p.locator('#exRecoveryExport').click();const file=await download;await file.saveAs(resolve(out,'CONFLICT_CHANGES.json'));const manifest=JSON.parse(await readFile(resolve(out,'CONFLICT_CHANGES.json'),'utf8'));
  ok(manifest.kind==='excel-cell-revision'&&manifest.patches.some(x=>x.cell==='A1'&&x.value==='我的冲突修改')&&manifest.base.name==='合成编辑恢复.xlsx','conflict manifest contains exact edits and original base');
  const exported=p.waitForEvent('download');await p.locator('#exExport').click();const xlsx=await exported;await xlsx.saveAs(resolve(out,'CONFLICT_EDITED.xlsx'));const parsed=XLSX.read(await readFile(resolve(out,'CONFLICT_EDITED.xlsx')),{type:'buffer'});ok(parsed.Sheets['制作需求'].A1.v==='我的冲突修改','conflict XLSX exports edited bytes');
  await p.waitForFunction(()=>getComputedStyle(document.querySelector('#toast')).opacity==='0');await p.screenshot({path:resolve(out,'conflict.png'),fullPage:true});await p.setViewportSize({width:390,height:844});ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'390px recovery controls stay contained');await p.screenshot({path:resolve(out,'mobile.png'),fullPage:true});await close(p,true);
  await open(p,id);ok(await p.locator('[data-ex-cell="A1"]').textContent()==='同事新版本','reopen keeps colleague persisted revision');await change(p,'A1','删除关联后保留输入');await q.evaluate(async id=>{await sgReload();await sgCommand({type:'set-cells',row:id,cells:{files:[]}});},id);await save(p);await state(p,'conflict');ok(await p.locator('#exRecoveryRebase').count()===0,'deleted attachment is not resurrected');await close(p,true);
  const originalBytes=await p.evaluate(async id=>{const r=await fetch('/api/enterprise/imports?'+new URLSearchParams({action:'worksheet-file',source:sheetGrid.source,id}));return [...new Uint8Array(await r.arrayBuffer())];},hash);ok(createHash('sha256').update(Buffer.from(originalBytes)).digest('hex')===hash,'original workbook bytes unchanged');
  // Legacy XLS still has a lossless sparse-change escape hatch without rewriting OLE images.
  const legacy=Buffer.from(XLSX.write(wb,{type:'buffer',bookType:'biff8'}));const legacyId=await p.evaluate(async data=>{await sgReload();const f=await sgRequest('worksheet-upload',{source:sheetGrid.source},{name:'合成旧版恢复.xls',data}),id=crypto.randomUUID();await sgCommand({type:'add-row',id,parentId:null,cells:{title:'旧版清单验收',files:[{kind:f.kind,id:f.id,name:f.name}]}});return id;},legacy.toString('base64'));
  await p.setViewportSize({width:1440,height:1000});await open(p,legacyId);await change(p,'A1','旧XLS待核对修改');await mutate(q,legacyId,{status:'旧版其他位置变化'});await save(p);await state(p,'conflict');ok(await p.locator('#exExport').isDisabled(),'legacy workbook binary export remains disabled');
  const legacyDownload=p.waitForEvent('download');await p.locator('#exRecoveryExport').click();const legacyFile=await legacyDownload;await legacyFile.saveAs(resolve(out,'LEGACY_CHANGES.json'));const legacyManifest=JSON.parse(await readFile(resolve(out,'LEGACY_CHANGES.json'),'utf8'));ok(legacyManifest.base.name.endsWith('.xls')&&legacyManifest.patches.some(x=>x.value==='旧XLS待核对修改'),'legacy conflict changes exported without rewriting XLS');await close(p,true);
  ok(await p.evaluate(()=>JSON.stringify(imported.rows))===original,'original imported rows unchanged');ok(errors.length===0,'page errors zero');await writeFile(resolve(out,'ACCEPTANCE.json'),JSON.stringify({checks:checks.length,names:checks,errors,originalWorkbookSha256:hash,isolated:true},null,2));console.log(`EXCEL_RECOVERY_BROWSER_PASS: checks=${checks.length} pinned_replay=1 read_retry_only=1 explicit_rebase=1 conflict_exports=1 original_unchanged=1 page_errors=0`);
 }
}catch(e){if(p)await p.screenshot({path:resolve(out,'FAILED.png'),fullPage:true}).catch(()=>{});await writeFile(resolve(out,'FAILED.txt'),e.stack||e.message);console.error(e);process.exitCode=1;}finally{await browser.close();}
