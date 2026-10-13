import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {expect} from "@playwright/test";
import sharp from "sharp";
import {openVideoSettings} from "./verify-video-fusion-settings.mjs";

// The fixture clip contains original colored test bars. Metadata/decoder readiness
// alone does not prove Chrome presented the frame in the actual UI.
async function expectVisibleFixtureFrame(video){
  await expect.poll(async()=>{
    const {data,info}=await sharp(await video.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});
    let colored=0;
    for(let index=0;index<data.length;index+=info.channels){const channels=[data[index],data[index+1],data[index+2]];if(Math.max(...channels)-Math.min(...channels)>50&&Math.max(...channels)>100)colored++;}
    return colored/(info.width*info.height);
  },{message:"Actual Chrome video surface must present the original colored fixture frame",timeout:20000}).toBeGreaterThan(0.02);
}

export async function runCanvasVideoJobs(page,h,nodeId,evidence){
  const source=await h.request("a","GET",h.refs.video.url),sourceHash=createHash("sha256").update(Buffer.from(source.body)).digest("hex");
  let dialog=await openVideoSettings(page,nodeId);
  for(const index of [4,3,1])await dialog.getByTestId("video-reference-row").nth(index).getByRole("button",{name:/^移除引用/}).click();
  assert.deepEqual(await dialog.getByTestId("video-reference-role").evaluateAll(nodes=>nodes.map(node=>node.value)),["reference","source_video"]);
  const generate=dialog.getByRole("button",{name:/^生成视频/});await generate.waitFor();await page.waitForFunction(()=>{const dialog=document.querySelector('[role="dialog"][aria-label="视频节点设置"]');return [...dialog.querySelectorAll('button')].some(button=>button.textContent.startsWith('生成视频')&&!button.disabled);});
  await generate.click();await dialog.waitFor({state:"hidden"});
  const until=Date.now()+180000;let taskId,task;
  while(Date.now()<until){const current=await h.request("a","GET",`/api/canvas/video-nodes/${nodeId}`);taskId=current.body.node.lastTaskId;if(taskId){await h.forceVideoPollDue(taskId);await h.tick();const response=await h.request("a","GET",`/api/video/tasks?id=${taskId}`);assert.equal(response.status,200);task=response.body.task;if(task.status==="completed")break;assert.ok(!["failed","needs_attention","cancelled"].includes(task.status),JSON.stringify(task));}await new Promise(resolve=>setTimeout(resolve,250));}
  assert.equal(task.status,"completed");assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,1);
  const node=page.locator(`[data-id="${nodeId}"]`).getByTestId("canvas-video-node"),video=node.locator("video");await video.waitFor({state:"visible",timeout:30000});
  await page.waitForFunction(id=>{const media=document.querySelector(`[data-id="${id}"] video`);return media&&media.readyState>=1&&media.duration>0;},nodeId,{timeout:30000});
  assert.ok(Math.abs(await video.evaluate(media=>media.duration)-4)<0.2);
  await node.getByTestId("canvas-media-playback").click();await page.waitForFunction(id=>{const media=document.querySelector(`[data-id="${id}"] video`);return media&&!media.paused&&media.currentTime>0;},nodeId);await node.getByTestId("canvas-media-playback").click();assert.equal(await video.evaluate(media=>media.paused),true);
  await node.getByLabel("静音",{exact:true}).click();assert.equal(await video.evaluate(media=>media.muted),true);await node.getByLabel("取消静音",{exact:true}).click();
  await node.getByLabel("视频时间轴",{exact:true}).focus();await page.keyboard.press("End");assert.ok(await video.evaluate(media=>media.currentTime)>3.5);
  const downloadPromise=page.waitForEvent("download");await node.getByRole("link",{name:"下载视频",exact:true}).click();const download=await downloadPromise;assert.equal(await download.failure(),null);
  await node.getByTestId("canvas-media-preview").click();const preview=page.getByRole("dialog",{name:"视频放大预览",exact:true});await preview.waitFor();await page.waitForFunction(()=>{const video=document.querySelector('[role="dialog"][aria-label="视频放大预览"] video');return video&&video.readyState>=2&&video.videoWidth>0;});
  await expectVisibleFixtureFrame(preview.locator("video"));
  await preview.getByTestId("canvas-media-playback").click();await page.waitForFunction(()=>document.querySelector('[role="dialog"][aria-label="视频放大预览"] video')?.currentTime>0.1);await preview.getByTestId("canvas-media-playback").click();await expectVisibleFixtureFrame(preview.locator("video"));
  await page.screenshot({path:`${evidence}/video-preview.png`,fullPage:false});await preview.getByRole("button",{name:"关闭视频预览",exact:true}).click();await preview.waitFor({state:"hidden"});
  await node.getByRole("button",{name:"首帧",exact:true}).click();const media=page.getByTestId("video-media-dialog");await media.waitFor();
  assert.equal(await media.getByLabel("媒体处理方式",{exact:true}).inputValue(),"frame");
  const process=media.getByRole("button",{name:/^(开始处理|确认处理)/});await process.click();
  const mediaUntil=Date.now()+120000;let job;
  while(Date.now()<mediaUntil){const response=await h.request("a","GET",`/api/video/media-jobs?projectKey=${encodeURIComponent(task.projectKey)}`);assert.equal(response.status,200);job=response.body.jobs.find(item=>item.action==="frame");if(job?.status==="completed")break;assert.ok(!job||!["failed","cancelled"].includes(job.status),JSON.stringify(job));await new Promise(resolve=>setTimeout(resolve,250));}
  assert.equal(job?.status,"completed");assert.equal(job.outputs[0].mimeType,"image/png");await media.getByRole("button",{name:"关闭",exact:true}).click();
  await page.reload({waitUntil:"domcontentloaded"});await page.locator(`[data-id="${nodeId}"] video`).waitFor({state:"visible",timeout:60000});assert.equal((await h.request("a","GET",`/api/canvas/video-nodes/${nodeId}`)).body.node.lastTaskId,taskId);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,1);
  const after=await h.request("a","GET",h.refs.video.url);assert.equal(createHash("sha256").update(Buffer.from(after.body)).digest("hex"),sourceHash);
  return {actualBrowserGeneration:true,realSupplierAndWorkerCompletion:true,decodedPlaybackPauseMuteSeek:true,actualVideoDownload:true,expandedPreview:true,expandedPreviewActualColoredPixelsBeforeAndAfterPlayback:true,browserFirstFrameViaRealMediaWorker:true,reloadRestoresSameTaskAndVideo:true,noDuplicateVideoCreation:true,originalVideoSha256:sourceHash};
}
