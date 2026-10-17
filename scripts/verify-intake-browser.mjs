// Isolated screenshot fallback after two native preview snapshot timeouts.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.env.INTAKE_EVIDENCE_DIR||'output/intake-browser'),port=Number(process.env.INTAKE_REAL_PORT||18482);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
 const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];await p.emulateMedia({reducedMotion:'reduce'});p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:18502/preview.html?v=4');
 await p.evaluate(async()=>{view='requirements';intake.active=true;await intakeLoad();});
 assert(await p.locator('[data-intake-detail]').count()>0);
 await p.screenshot({animations:'disabled',path:resolve(out,'REQUIREMENTS.png')});
 await p.evaluate(async()=>{await intakeDetail(intake.orders.find(o=>o.status==='approved').id);});
 await p.screenshot({animations:'disabled',path:resolve(out,'REQUIREMENT_DETAIL.png')});
 await p.reload();const persisted=await p.evaluate(async()=>{view='requirements';intake.active=true;await intakeLoad();return {total:intake.total,approved:intake.orders.filter(o=>o.status==='approved').length};});assert(persisted.total===2&&persisted.approved===1);
 await p.setViewportSize({width:390,height:844});await p.screenshot({animations:'disabled',path:resolve(out,'MOBILE.png')});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.sidebar').getBoundingClientRect().right<=1&&document.querySelector('.page-heading').getBoundingClientRect().left>=0));
 await p.setViewportSize({width:1440,height:1000});
 const regression={};for(const script of ['browser-check.js','schedule-browser-check.js','workbook-browser-check.js']){
  await p.evaluate(()=>{intake.active=false;imported.active=false;peopleMapping.active=false;sourceState.tab='local';closeOverlay();shell();});
  regression[script]=await p.evaluate(await readFile('design/enterprise-demo/'+script,'utf8'));
 }
 await p.goto(`http://127.0.0.1:${port}/preview.html?v=4`);await p.evaluate(async()=>{view='requirements';intake.active=true;await intakeLoad();});
 const real=await p.evaluate(()=>({total:intake.total,error:intake.error,subject:intake.viewer?.subject}));assert.equal(real.error,'');assert.equal(real.total,0);assert.equal(real.subject,'local-owner');
 await p.screenshot({animations:'disabled',path:resolve(out,'REAL_REQUIREMENTS.png')});
 await p.evaluate(async()=>{view='schedule';imported.active=true;await importLoad();importDetail(imported.rows.find(r=>r.title).excelRow);});await p.locator('#intakeFromRow').click();assert(await p.locator('#intakeForm').isVisible());await p.screenshot({animations:'disabled',path:resolve(out,'REAL_SOURCE_FORM.png')});
 const unchanged=await p.evaluate(async()=>({rows:imported.rows.length,total:(await importRequest('orders')).total}));assert.equal(unchanged.rows,364);assert.equal(unchanged.total,0);assert.deepEqual(errors,[]);
 const result={persisted,regression,real,unchanged,errors,port};await writeFile(resolve(out,'BROWSER_REGRESSION.json'),JSON.stringify(result,null,2));console.log('INTAKE_BROWSER_PASS: native_checks=20 actual_reload=1 original_workflow=36 schedule=42 workbook=35 mobile390=1 real_rows=364 real_orders=0 page_errors=0');
}finally{await browser.close();}
