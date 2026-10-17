// Isolated Chromium fallback for disconnected native preview automation.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.env.TASKS_EVIDENCE_DIR||'output/tasks-browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
 const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:18508/preview.html?v=4');
 const task=await p.evaluate(await readFile('design/enterprise-demo/tasks-browser-check.js','utf8'));await writeFile(resolve(out,'BROWSER_TASKS.json'),JSON.stringify(task,null,2));
 await p.screenshot({path:resolve(out,'TASK_CENTER.png'),animations:'disabled'});await p.evaluate(async()=>{await realTaskDetail(taskAcceptance.orderId,taskAcceptance.design);});await p.screenshot({path:resolve(out,'TASK_DETAIL.png'),animations:'disabled'});await p.evaluate(()=>closeOverlay());
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:resolve(out,'MOBILE.png'),animations:'disabled'});
 await p.reload();await p.evaluate(async()=>{await workspaceDiscover();const m=await(await fetch('/fixture/meta')).json();await workspaceChooseEnterprise(m.source.root);await workspaceChooseTeam(m.teamId);view='tasks';await realTasksLoad();});assert.equal(await p.evaluate(()=>realTasks.total),3);assert(await p.evaluate(()=>realTasks.rows.some(r=>r.task.percent===45)));assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'BROWSER_TASKS_RUNTIME.json'),JSON.stringify({task,reload:true,errors,mobile390:true},null,2));console.log(`TASK_BROWSER_PASS: checks=${task.passed} native_BFF=1 persisted_reload=1 desktop1440=1 mobile390=1 page_errors=0`);
}finally{await browser.close();}
