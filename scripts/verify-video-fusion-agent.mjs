import assert from "node:assert/strict";
import {access} from "node:fs/promises";
import {chromium,expect} from "@playwright/test";
import {openVideoSettings} from "./verify-video-fusion-settings.mjs";

export async function runVideoAgentBrowser(h,{anchorId,projectKey,evidence,getChain,releaseReply}){
  let executablePath;for(const candidate of [process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].filter(Boolean)){try{await access(candidate);executablePath=candidate;break;}catch{}}
  assert.ok(executablePath,"Set CHROME_PATH to an installed Chrome");
  const browser=await chromium.launch({headless:true,executablePath}),context=await browser.newContext({viewport:{width:1440,height:960}});
  await context.addCookies([{name:"nv_user",value:h.cookies.a.slice("nv_user=".length),url:h.baseUrl,httpOnly:true,sameSite:"Lax"},{name:"naumi_locale",value:"zh",url:h.baseUrl,sameSite:"Lax"}]);
  let page=await context.newPage();const errors=[];page.on("pageerror",error=>errors.push(error.message));page.setDefaultTimeout(25000);
  const request="请制作两个视频分镜并执行连续制作链，完整保留每句对白，先按实际模型能力保存镜头。";
  try{
    // Prewarm the internal route before live SSE so Next dev's initial compilation
    // cannot replace the in-memory Agent session while it waits for confirmation.
    assert.equal((await h.request("a","GET",`/api/canvas/video-nodes?projectKey=${encodeURIComponent(projectKey)}`)).status,200);
    await page.goto(`${h.baseUrl}/canvas?node=${anchorId}`,{waitUntil:"domcontentloaded",timeout:150000});
    await page.locator(`[data-id="${anchorId}"]`).getByTestId("canvas-video-node").waitFor({timeout:120000});
    let panel=page.getByTestId("canvas-assistant-panel");if(!await panel.isVisible())await page.getByTestId("canvas-agent-toggle").click();await panel.waitFor();
    await expect(panel.getByTestId("canvas-assistant-model")).toContainText("Fixture Agent");
    await panel.getByTestId("canvas-assistant-input").fill(request);await panel.getByRole("button",{name:"发送消息",exact:true}).click();
    await panel.getByTestId("canvas-assistant-attention").waitFor({timeout:180000});
    assert.ok(getChain()?.operation_id);const chain=getChain();
    assert.equal(await h.dbCount("app_video_tasks"),0);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,0);
    await expect(page.getByTestId("canvas-video-node")).toHaveCount(3);
    await expect(panel.getByTestId("canvas-assistant-progress")).toContainText(/制作|分镜|视频/);
    await page.screenshot({path:`${evidence}/agent-quote.png`,fullPage:false});
    await panel.getByTestId("canvas-assistant-input").fill("确认");await panel.getByRole("button",{name:"发送消息",exact:true}).click();
    await expect.poll(()=>h.dbCount("app_video_tasks"),{timeout:180000}).toBe(1);
    // Closing the actual Chrome page aborts the live SSE after durable acceptance.
    await page.close();releaseReply();await h.restartApp();
    const until=Date.now()+180000;let run;
    while(Date.now()<until){const current=await h.request("a","GET",`/api/video/workflows/${chain.operation_id}`);assert.equal(current.status,200,JSON.stringify(current.body));run=current.body.run;for(const node of run.nodes)if(node.taskId)await h.forceVideoPollDue(node.taskId);await h.tick();run=(await h.request("a","GET",`/api/video/workflows/${chain.operation_id}`)).body.run;if(run.nodes.every(node=>node.status==="completed"))break;assert.ok(!run.nodes.some(node=>["blocked","needs_confirmation","needs_attention","cancelled"].includes(node.status)),JSON.stringify(run.nodes));await new Promise(resolve=>setTimeout(resolve,250));}
    assert.ok(run.nodes.every(node=>node.status==="completed"),JSON.stringify(run.nodes));assert.equal(await h.dbCount("app_video_tasks"),2);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,2);
    page=await context.newPage();page.setDefaultTimeout(25000);page.on("pageerror",error=>errors.push(error.message));await page.goto(`${h.baseUrl}/canvas?node=${anchorId}`,{waitUntil:"domcontentloaded",timeout:150000});
    await page.locator(`[data-id="${anchorId}"]`).getByTestId("canvas-video-node").waitFor({timeout:120000});
    panel=page.getByTestId("canvas-assistant-panel");if(!await panel.isVisible())await page.getByTestId("canvas-agent-toggle").click();await panel.waitFor();
    await panel.getByRole("button",{name:"项目对话记录",exact:true}).click();await panel.getByTestId("canvas-assistant-history-item").first().click();await expect(panel).toContainText(request);
    await expect(page.getByTestId("canvas-video-node")).toHaveCount(3);
    for(const node of run.nodes){
      const index=chain.nodes.findIndex(planned=>planned.id===node.id);assert.ok(index>=0);
      const saved=await h.request("a","GET",`/api/canvas/video-nodes/${node.id}`);assert.equal(saved.body.node.lastTaskId,node.taskId);assert.ok(saved.body.node.lastResultId);
      const video=page.locator(`[data-id="${node.id}"] video`);await video.waitFor({state:"attached",timeout:60000});
      await page.waitForFunction(id=>{const video=document.querySelector(`[data-id="${id}"] video`);return video&&video.readyState>=1&&video.videoWidth>0;},node.id,{timeout:60000});
      // Navigate through the real node deep link to inspect each full editable prompt.
      await page.goto(`${h.baseUrl}/canvas?node=${node.id}`,{waitUntil:"domcontentloaded"});const dialog=await openVideoSettings(page,node.id);assert.equal(await dialog.getByLabel("视频描述",{exact:true}).inputValue(),index===0?"甲：浏览器第一镜头完整对白。":"乙：浏览器第二镜头完整对白。");await page.keyboard.press("Escape");
    }
    assert.equal((await h.request("a","POST","/api/canvas/video-workflows",{id:chain.operation_id,projectKey,nodes:chain.nodes})).status,202);assert.equal(await h.dbCount("app_video_tasks"),2);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,2);
    await page.screenshot({path:`${evidence}/agent-restored.png`,fullPage:false});assert.deepEqual(errors,[]);
    return {actualChromeAgentComposer:true,actualPiStreamingAndToolActivity:true,editableStoryboardMountedInOriginalProject:true,modelSelfConfirmationBlockedBeforeHumanClick:true,humanConfirmedThroughComposer:true,pageClosedAfterDurableAcceptance:true,actualAppRestart:true,workerCompletedDependentStages:true,restoredBrowserConversationAndOriginalNodeVideos:true,fullEditableDialoguePreserved:true,replayNoDuplicateTasksOrVideoCreates:true,browserErrors:errors};
  }catch(error){if(!page.isClosed())await page.screenshot({path:`${evidence}/failure.png`,fullPage:false}).catch(()=>{});throw error;}
  finally{releaseReply();await context.close();await browser.close();}
}
