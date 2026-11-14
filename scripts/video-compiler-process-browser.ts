import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';

/** Actual Next page, cookies, React, middleware, APIs, DB and frozen history.
 * No page-route mocks or substituted components. Runtime/build provenance is
 * supplied by its caller; this is never a real supplier quality test. */
export async function verifyVideoProcessBrowser(input:{origin:string;cookie:string;taskId:string;outputDir:string;posts:()=>number}){
 const check=expect.configure({timeout:30000});
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 const errorDetails:Array<{message:string;stack?:string}>=[];const errors:string[]=[],consoleErrors:string[]=[],requestFailures:Array<{url:string;failure:unknown}>=[],requests:Array<{path:string;status:number}>=[],resources:Array<{url:string;status:number}>=[];let checks=0;
 page.on('response',response=>resources.push({url:response.url(),status:response.status()}));await page.addInitScript('window.__videoProcessScriptRan=true');
 page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});page.on('requestfailed',request=>requestFailures.push({url:request.url(),failure:request.failure()}));
 page.on('pageerror',error=>{errors.push(error.message);errorDetails.push({message:error.message,stack:error.stack});});page.on('response',response=>{if(response.url().startsWith(input.origin+'/api/'))requests.push({path:new URL(response.url()).pathname,status:response.status()});});
 page.setDefaultTimeout(90000);const [name,...value]=input.cookie.split('=');await context.addCookies([{name,value:value.join('='),url:input.origin}]);
 const pass=(name:string)=>{checks++;console.log('PROCESS_BROWSER_CHECK='+name+' PASS');};const before=input.posts();
 const revealHistoryTask=async(surface:import('@playwright/test').Page|import('@playwright/test').Locator)=>{
  const target=surface.locator(`[data-task-id="${input.taskId}"]`);
  // Combined fixtures have more than the real 30-row page size. Use the actual
  // history pagination controls, rather than assuming the oldest task is page1.
  const more=surface.getByRole('button',{name:/^加载更多(?:任务)?$/});
  await check.poll(async()=>await target.isVisible()||await more.isVisible()).toBe(true);
  for(let pageNumber=0;!await target.isVisible();pageNumber++){
   assert(pageNumber<10,'Historical fixture task absent after ten pages');
   await check(more).toBeVisible();const before=await surface.locator('[data-task-id]').count();
   const [response]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/video/tasks'&&new URL(r.url()).searchParams.has('cursor')),more.click()]);
   assert.equal(response.status(),200);
   await check.poll(()=>surface.locator('[data-task-id]').count()).toBeGreaterThan(before);
  }
  await check(target).toBeVisible();return target;
 };
 try{
  await page.goto(input.origin+'/video',{waitUntil:'domcontentloaded',timeout:180000});await check(page.getByTestId('video-workbench')).toBeVisible();
  await revealHistoryTask(page);pass('actual-next-video-workbench-hydrates-with-real-session-and-history');
  await page.getByRole('button',{name:'完整历史',exact:true}).click();const dialog=page.getByTestId('video-history-picker');await check(dialog).toBeVisible();
  await(await revealHistoryTask(dialog)).click();const parameters=dialog.getByTestId('video-history-parameters');await check(parameters).toContainText('4K');
  const frozen=JSON.parse((await parameters.textContent())!);assert.equal(frozen.config.parameters.resolution,'4K');assert.equal(frozen.config.parameters.durationSeconds,1);assert.equal(frozen.inputs[0].role,'reference');pass('actual-react-history-displays-requested-not-wire-parameters');
  await dialog.getByRole('button',{name:'复用原参数',exact:true}).click();await check(dialog).not.toBeVisible();
  const fields=page.getByTestId('video-contract-fields');await check(fields.getByLabel('视频分辨率',{exact:true})).toHaveValue('0');
  await check(page.getByTestId('video-reference-role')).toHaveValue('reference');await check(page.getByRole('button',{name:/生成视频 · 每个 17 积分/})).toBeEnabled();
  pass('reuse-historical-reference-preserves-role-and-current-quote-without-generation');
  await page.setViewportSize({width:390,height:844});await check(page.getByTestId('video-reference-role')).toHaveValue('reference');
  await check(page.getByRole('button',{name:/生成视频 · 每个 17 积分/})).toBeEnabled();pass('mobile-retains-real-draft-and-quote');
  assert.equal(input.posts(),before);assert.deepEqual(errors,[]);assert(!requests.some(r=>r.path==='/api/video/generate'));assert(requests.some(r=>r.path==='/api/video/compile-preview'&&r.status===200));
  await writeFile(path.join(input.outputDir,'BROWSER_RESULT.json'),JSON.stringify({ok:true,checks,actualNext:true,actualReact:true,actualEdge:true,pageErrors:errors,requests,supplierPostsAdded:input.posts()-before,history:frozen},null,2));
  console.log(`VIDEO_COMPILER_PROCESS_BROWSER=PASS CHECKS=${checks} REAL_NEXT=1 REAL_REACT=1 REAL_EDGE=1 HTTP_MOCKS=0 PAGE_ERRORS=0 SUPPLIER_POSTS_ADDED=0`);
 }catch(error){await writeFile(path.join(input.outputDir,'BROWSER_FAILURE.json'),JSON.stringify({errors,errorDetails,consoleErrors,requestFailures,requests,resources,url:page.url(),body:await page.locator('body').innerText(),runtime:await page.evaluate(()=>({ran:(window as any).__videoProcessScriptRan,ready:document.readyState,scripts:[...document.scripts].map(s=>({src:s.src,type:s.type,async:s.async,text:s.text.slice(0,200)})),performance:performance.getEntriesByType('resource').map(r=>({name:r.name,duration:r.duration}))}))},null,2));throw error;}
 finally{await context.close();await browser.close();console.log('BROWSER_CLEANUP=PASS CONTEXT_CLOSED=1 BROWSER_CLOSED=1');}
}
