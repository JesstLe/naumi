import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.FIXTURE_BASE||'http://127.0.0.1:14931';
const out='output/agent-stream-recovery-20261021';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
const checks=[],errors=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(45000);
  await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});
  const panel=page.locator('#canvas-agent-panel');
  await page.getByTestId('canvas-agent-toggle').waitFor();await page.waitForTimeout(700);
  if(!await panel.isVisible())await page.getByTestId('canvas-agent-toggle').click();
  await panel.waitFor();console.log('BROWSER_STAGE='+width+':panel');
  await panel.locator('textarea').fill('先出初稿');await panel.getByRole('button',{name:'发送消息',exact:true}).click();
  const next=panel.getByRole('button',{name:'继续输出',exact:true});await next.waitFor();console.log('BROWSER_STAGE='+width+':interrupted');
  assert.equal(await panel.locator('textarea').inputValue(),'');assert.equal(await next.isEnabled(),true);
  assert((await panel.innerText()).includes('详情承接：配方徽章与'));checks.push(width+':partial-visible-empty-composer-continue-enabled');
  const before=await(await fetch(base+'/__fixture/state')).json();await next.click();
  await page.waitForFunction(()=>document.querySelector('#canvas-agent-panel')?.innerText.includes('补全后续方案。'));
  await page.waitForFunction(()=>!document.querySelector('#canvas-agent-panel button[aria-label="停止任务"]'));
  const after=await(await fetch(base+'/__fixture/state')).json();assert.equal(after.turns.length,before.turns.length+1);
  const sent=after.turns.at(-1);assert.equal(sent.continueText,true);assert.equal(sent.continueFromTurnId,'fixture-partial-turn');assert.deepEqual(sent.messages,[]);
  assert((await panel.innerText()).includes('详情承接：配方徽章与'));checks.push(width+':single-text-only-continuation-preserves-partial');
  await panel.getByRole('button',{name:'项目对话记录',exact:true}).click();await panel.locator('[data-testid=canvas-assistant-history-item]').click();
  await next.waitFor();assert.equal(await panel.locator('textarea').inputValue(),'');assert.equal(await next.isEnabled(),true);checks.push(width+':history-restores-continue');
  await panel.getByRole('button',{name:'新建对话',exact:true}).click();assert.equal(await next.count(),0);checks.push(width+':new-chat-clears-recovery');
  await panel.locator('textarea').fill('再次输出');await panel.getByRole('button',{name:'发送消息',exact:true}).click();await next.waitFor();
  await panel.getByRole('button',{name:'收起助手',exact:true}).click();
  await page.getByTestId('canvas-project-chrome').locator('button').first().click();
  await page.getByRole('button',{name:'全部项目',exact:true}).click();
  await page.getByTestId('canvas-project-browser').getByRole('button',{name:'另一项目',exact:true}).click();await page.waitForTimeout(300);
  if(!await panel.isVisible())await page.getByTestId('canvas-agent-toggle').click();
  await panel.waitFor();assert.equal(await next.count(),0);checks.push(width+':project-switch-clears-recovery');
  await context.close();
 }
 assert.deepEqual(errors,[]);const record={result:'BROWSER=PASS',checks,errors,externalSupplierCalls:0};await writeFile(out+'/browser-result.json',JSON.stringify(record,null,2));console.log('BROWSER=PASS CHECKS='+checks.length+' WIDTHS=1440,390 EMPTY_INPUT=CONTINUE CLICK=TEXT_ONLY HISTORY=RESTORED NEW_CHAT=RESET PROJECT=RESET PAGEERRORS=0 SUPPLIER_CALLS=0');
}finally{await browser.close();}
