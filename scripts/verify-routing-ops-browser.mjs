import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.env.ROUTING_EVIDENCE_DIR||'output/routing-browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
 const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.exposeFunction('roCapture',async name=>{assert(['RULES.png','ROUTED.png','FOLLOWUP.png'].includes(name));await p.screenshot({path:resolve(out,name),animations:'disabled'});});
 await p.goto('http://127.0.0.1:18508/preview.html?v=4');let result;try{result=await p.evaluate(await readFile('design/enterprise-demo/routing-ops-browser-check.js','utf8'));}catch(e){await writeFile(resolve(out,'FAILED_BROWSER_STATE.txt'),await p.locator('body').innerText());throw e;}
 assert.equal(result.passed,23);await p.reload();
 await p.evaluate(async r=>{const m=await(await fetch('/fixture/meta')).json();await fetch('/fixture/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({account:'employee'})});await workspaceDiscover();await workspaceChooseEnterprise(m.source.root);await workspaceChooseTeam(r.sourceTeam);view='requirements';await intakeLoad();await intakeDetail(r.orderId);},result);
 assert((await p.locator('#operationsSection').innerText()).includes('已提出后续修改'));await p.locator('#roFollowupLink').click();await p.waitForFunction(id=>document.querySelector('#overlay .drawer')?.dataset.orderId===id&&document.querySelector('[data-ro-original]'),result.followupId);assert((await p.locator('#overlay').innerText()).includes('查看原需求'));
 await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:resolve(out,'MOBILE.png'),animations:'disabled'});
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'BROWSER_ROUTING.json'),JSON.stringify({...result,reload:true,mobile390:true,errors},null,2));console.log('ROUTING_OPS_BROWSER_PASS: checks=23 consent=1 independent_publish=1 auto_route=1 return_edit_resubmit=1 cross_team_readonly=1 real_file_bytes=1 followup=1 provenance=1 manual_queue=1 facts_unchanged=1 reload=1 mobile390=1 errors0=1');
}finally{await browser.close();}
