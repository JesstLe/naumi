import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const baseline=process.argv.includes('--baseline'),out=resolve(process.argv[process.argv.indexOf('--output')+1]),port=Number(process.env.TASK_LAYOUT_PREVIEW_PORT||18482);
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});
const checks=[],errors=[],ok=(v,name)=>{assert(v,name);checks.push(name);};let page;
try{
 page=await browser.newPage({viewport:{width:1614,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/preview.html?v=4`,{waitUntil:'networkidle'});await page.locator('.sidebar [data-view="tasks"]').click();
 const metrics=await page.evaluate(()=>{const b=document.querySelector('[data-tab="all"]'),panel=b.closest('.panel'),tabs=b.parentElement,rect=b.getBoundingClientRect(),pr=panel.getBoundingClientRect();return {tabHeight:rect.height,topInset:rect.top-pr.top,tabFontSize:getComputedStyle(b).fontSize,tablistRole:tabs.getAttribute('role'),count:filteredTasks().length,workspace:workspace.active};});
 await writeFile(resolve(out,'METRICS.json'),JSON.stringify(metrics,null,2));
 if(baseline){await page.screenshot({path:resolve(out,'BEFORE.png'),fullPage:true,animations:'disabled'});const reproduced=metrics.tabHeight<40||metrics.topInset<10||metrics.tablistRole!=='tablist';assert(reproduced);console.log(`TASK_LAYOUT_BASELINE_REPRODUCED: tab_height=${metrics.tabHeight} top_inset=${metrics.topInset} role=${metrics.tablistRole} source_writes=0`);process.exitCode=2;}
 else{
  ok(metrics.tabHeight>=40&&metrics.topInset>=10,'tabs have full hit area and panel inset');ok(metrics.tablistRole==='tablist','task scope is a semantic tablist');
  const original=await page.evaluate(()=>JSON.stringify({tasks:state.tasks,requirements:state.requirements,facts:state.facts}));
  await page.locator('[data-tab="pool"]').click();ok(await page.evaluate(()=>taskTab==='pool'&&filteredTasks().every(t=>t.status==='open')),'pool tab still filters correct tasks');
  await page.locator('[data-tab="review"]').click();ok(await page.evaluate(()=>taskTab==='review'&&filteredTasks().every(t=>t.status==='review')),'review tab still filters correct tasks');
  await page.locator('[data-tab="all"]').click();await page.locator('#typeFilter').selectOption('artwork');ok(await page.evaluate(()=>filteredTasks().every(t=>t.kind==='artwork')),'type filter works');await page.locator('#typeFilter').selectOption('all');
  await page.locator('#localSearch').fill('TK-301');ok(await page.evaluate(()=>filteredTasks().length===1&&filteredTasks()[0].id==='TK-301'),'search retained');await page.locator('#localSearch').fill('');
  await page.locator('button[data-task="TK-301"]').last().click();ok(await page.locator('#overlay [role="dialog"]').count()===1,'task details open');await page.locator('#overlay [data-close]').first().click();
  await page.locator('[data-action="board"]').click();ok(await page.locator('.task-center-board .column').count()===4,'board is contained and retains four statuses');await page.locator('[data-action="board"]').click();
  const tabs=page.locator('.task-center-tabs [role="tab"]');await tabs.first().focus();await page.keyboard.press('ArrowRight');ok(await page.evaluate(()=>taskTab==='mine'&&document.activeElement?.dataset.tab==='mine'),'keyboard switches and focuses the next tab');await page.keyboard.press('Home');ok(await page.evaluate(()=>taskTab==='all'),'Home returns to first scope');
  ok(await page.evaluate(()=>JSON.stringify({tasks:state.tasks,requirements:state.requirements,facts:state.facts}))===original,'layout interactions do not mutate tasks or facts');
  await page.evaluate(()=>document.activeElement?.blur());const box=await page.locator('.task-center-panel').boundingBox();ok(box.width>0,'task panel rendered');await page.screenshot({path:resolve(out,'TASKS_DESKTOP.png'),fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(out,'TASKS_MOBILE.png'),fullPage:true,animations:'disabled'});
  const narrow=await page.evaluate(()=>{const panel=document.querySelector('.task-center-panel').getBoundingClientRect(),toolbar=document.querySelector('.task-center-toolbar').getBoundingClientRect(),tabs=document.querySelector('.task-center-tabs').getBoundingClientRect();return {viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,panelLeft:panel.left,panelRight:panel.right,toolbarRight:toolbar.right,tabsRight:tabs.right};});
  ok(narrow.pageWidth<=narrow.viewport&&narrow.panelLeft>=0&&narrow.panelRight<=narrow.viewport,'mobile panel stays inside viewport');ok(narrow.toolbarRight<=narrow.viewport&&narrow.tabsRight<=narrow.viewport,'mobile toolbar and scope tabs stay contained');
  const mobileTabs=await page.locator('.task-center-tabs').evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));ok(mobileTabs.scroll<=mobileTabs.width,'all four scopes fit at 390px');
  await page.setViewportSize({width:1614,height:1000});await page.locator('.sidebar [data-view="dashboard"]').first().click();ok(await page.locator('.dashboard-grid .tabs .tab').count()===4,'dashboard keeps existing tab layout');
  // Exercise the actual employee renderer with empty in-memory UI state only; no source/API writes.
  await page.evaluate(()=>{document.querySelector('.content').innerHTML=realTasksPage();bindTaskScopeKeyboard('[data-real-task-scope]','realTaskScope',key=>{realTasks.scope=key;document.querySelector('.content').innerHTML=realTasksPage();bindTaskScopeKeyboard('[data-real-task-scope]','realTaskScope',()=>{});});});
  ok(await page.locator('[data-real-task-scope][role="tab"]').count()===4&&await page.locator('#real-task-results[role="tabpanel"]').count()===1,'employee renderer shares semantic task scopes');
  await page.locator('[data-real-task-scope="all"]').focus();await page.keyboard.press('ArrowRight');ok(await page.evaluate(()=>realTasks.scope==='mine'&&document.activeElement?.dataset.realTaskScope==='mine'),'employee tab keyboard and focus restored after render');
  await page.setViewportSize({width:390,height:844});ok(await page.locator('.task-center-toolbar').evaluate(el=>el.getBoundingClientRect().right<=innerWidth)&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'employee toolbar stays contained on mobile');
  ok(errors.length===0,'page has no JavaScript errors');await writeFile(resolve(out,'ACCEPTANCE.json'),JSON.stringify({passed:checks.length,checks,metrics,mobile:narrow,pageErrors:errors,taskMutations:0,productionConnections:0},null,2));console.log(`TASK_CENTER_LAYOUT_PASS: checks=${checks.length} tabs=1 filters=1 details=1 board=1 keyboard=1 mobile=1 task_mutations=0 page_errors=0`);
 }
}catch(e){if(page)await page.screenshot({path:resolve(out,'FAILURE.png'),fullPage:true,animations:'disabled'}).catch(()=>{});await writeFile(resolve(out,'FAILURE.txt'),String(e.stack)+'\n'+errors.join('\n'));throw e;}finally{await browser.close();}
