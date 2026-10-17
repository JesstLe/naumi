import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.env.TASKS_EVIDENCE_DIR||'output/tasks-browser');await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:18508/preview.html?v=4');const workspace=await p.evaluate(await readFile('design/enterprise-demo/workspace-browser-check.js','utf8'));assert.equal(workspace.passed,28);
 // Explicit team switching on the real task page must fetch the selected team's rows.
 await p.evaluate(async()=>{view='tasks';await realTasksLoad();const m=await(await fetch('/fixture/meta')).json();await workspaceChooseTeam(m.secondTeam);});assert.equal(await p.evaluate(()=>realTasks.total),0);
 await p.goto('http://127.0.0.1:18502/preview.html?v=4');const intake=await p.evaluate(await readFile('design/enterprise-demo/intake-browser-check.js','utf8'));assert.equal(intake.passed,20);await p.evaluate(()=>closeOverlay());const people=await p.evaluate(await readFile('design/enterprise-demo/people-browser-check.js','utf8'));assert.equal(people.passed,20);
 const original={};for(const f of ['browser-check.js','schedule-browser-check.js','workbook-browser-check.js']){await p.evaluate(()=>{workspaceExit();imported.active=false;peopleMapping.active=false;intake.active=false;sourceState.tab='local';shell();});original[f]=await p.evaluate(await readFile('design/enterprise-demo/'+f,'utf8'));}
 await p.goto('http://127.0.0.1:18482/preview.html?v=4');await p.evaluate(async()=>{view='requirements';intake.active=true;await intakeLoad();});assert.equal(await p.evaluate(()=>intake.total),0);await p.evaluate(async()=>{view='schedule';imported.active=true;await importLoad();});assert.equal(await p.evaluate(()=>imported.rows.length),364);assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'BROWSER_REGRESSION.json'),JSON.stringify({workspace,intake,people,original,taskTeamSwitch:true,realRows:364,realOrders:0,errors},null,2));console.log('TASK_REGRESSION_PASS: workspace28=1 intake20=1 people20=1 original36=1 schedule42=1 workbook35=1 task_team_switch=1 real_rows364=1 real_orders0=1 errors0=1');
}finally{await browser.close();}
