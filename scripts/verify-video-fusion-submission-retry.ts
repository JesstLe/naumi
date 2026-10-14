import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,access} from "node:fs/promises";
import path from "node:path";
import {chromium,expect} from "@playwright/test";
import {createVideoFixture} from "./video-fusion/harness";
import {openVideoSettings} from "./verify-video-fusion-settings.mjs";

async function main(){
  const h=await createVideoFixture({startWorker:false}),evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-d",`submission-retry-${randomUUID()}`);await mkdir(evidence,{recursive:true});
  let browser:any,page:any;
  try{
    const id=`vnode-${randomUUID()}`,created=await h.request<any>("a","POST","/api/canvas/video-nodes",{id,projectKey:`tree:${id}`,expectedRevision:0,operationId:randomUUID(),title:"Retry source",x:10,y:10,config:{modelId:"video-a",providerId:"managed-video",mode:"text",prompt:"原始设置",durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},inputs:[]});assert.equal(created.status,201);
    let executablePath;for(const candidate of [process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].filter(Boolean) as string[]){try{await access(candidate);executablePath=candidate;break;}catch{}}assert.ok(executablePath);
    browser=await chromium.launch({headless:true,executablePath});const context=await browser.newContext({viewport:{width:1366,height:768}});await context.addCookies([{name:"nv_user",value:h.cookies.a.slice("nv_user=".length),url:h.baseUrl,httpOnly:true,sameSite:"Lax"},{name:"naumi_locale",value:"zh",url:h.baseUrl,sameSite:"Lax"}]);page=await context.newPage();page.setDefaultTimeout(20000);
    const attempts:any[]=[];await page.route(`**/api/canvas/video-nodes/${id}/generate`,async(route:any)=>{attempts.push({billingId:route.request().headers()["x-naumi-billing-operation-id"],body:route.request().postDataJSON()});if(attempts.length===1)return route.abort("failed");await route.continue();});
    await page.goto(`${h.baseUrl}/canvas?node=${id}`,{waitUntil:"domcontentloaded",timeout:150000});const dialog=await openVideoSettings(page,id),prompt="本次修改必须保留。\n甲：重复提交也保留全文。";
    await dialog.getByLabel("视频描述",{exact:true}).fill(prompt);const generate=dialog.getByRole("button",{name:/^生成视频/});await expect(generate).toBeEnabled();const before=await h.creditState("a");
    await generate.click();await expect(dialog.getByRole("alert")).toBeVisible();assert.equal(attempts.length,1);
    const saved=(await h.request<any>("a","GET",`/api/canvas/video-nodes/${id}`)).body.node;assert.ok(saved.revision>created.body.node.revision);assert.equal(saved.config.prompt,prompt);assert.equal(await h.dbCount("app_video_tasks"),0);assert.deepEqual(await h.creditState("a"),before);
    await expect(generate).toBeEnabled();await generate.click();await expect.poll(()=>attempts.length,{timeout:10000,message:"Explicit retry must reuse the saved revision and reach the actual node generation endpoint"}).toBe(2);assert.deepEqual(attempts[1],attempts[0]);await expect(dialog).toBeHidden();
    let task:any;const until=Date.now()+180000;
    while(Date.now()<until){const node=(await h.request<any>("a","GET",`/api/canvas/video-nodes/${id}`)).body.node;if(node.lastTaskId){await h.forceVideoPollDue(node.lastTaskId);await h.tick();task=(await h.request<any>("a","GET",`/api/video/tasks?id=${node.lastTaskId}`)).body.task;if(task.status==="completed")break;assert.ok(!["failed","cancelled","needs_attention"].includes(task.status),JSON.stringify(task));}await new Promise(resolve=>setTimeout(resolve,250));}
    assert.equal(task?.status,"completed");assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,1);const frozen=await h.taskPersistence("a",task.id);assert.equal(frozen.parameters.request.prompt,prompt);
    await page.screenshot({path:path.join(evidence,"retry-completed.png")});await writeFile(path.join(evidence,"result.json"),JSON.stringify({schemaVersion:1,ok:true,actualAppChromeDbRouterWorker:true,firstTransportFailureChargesNothing:true,ownSavedRevisionUsedOnRetry:true,domainAndBillingIdentitiesPreserved:true,fullDraftPreserved:true,supplierCreates:1,completedTaskId:task.id,paidVideoApiCalls:0},null,2));process.stdout.write(`VIDEO_SUBMISSION_RETRY=PASS ${evidence}\n`);
  }catch(error){if(page){await page.screenshot({path:path.join(evidence,"failure.png")}).catch(()=>{});await writeFile(path.join(evidence,"failure.txt"),await page.locator("body").innerText().catch(()=>""));}throw error;}
  finally{if(browser)await browser.close();await h.stop();}
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
