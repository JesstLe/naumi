import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,access} from "node:fs/promises";
import path from "node:path";
import {chromium,expect} from "@playwright/test";
import {createVideoFixture} from "./video-fusion/harness";
import {openVideoSettings,chooseAsset} from "./verify-video-fusion-settings.mjs";
import {compileVideoPrompt} from "../src/lib/video/prompt";

async function main(){
 const h=await createVideoFixture({startWorker:false}),evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-d",`reference-order-${randomUUID()}`);await mkdir(evidence,{recursive:true});let browser:any,page:any;
 try{
  const id=`vnode-${randomUUID()}`,created=await h.request<any>("a","POST","/api/canvas/video-nodes",{id,projectKey:`tree:${id}`,expectedRevision:0,operationId:randomUUID(),title:"Reference order",x:10,y:10,config:{modelId:"video-a",providerId:"managed-video",mode:"reference",prompt:"待填写",durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},inputs:[]});assert.equal(created.status,201);
  let executablePath;for(const candidate of [process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].filter(Boolean) as string[]){try{await access(candidate);executablePath=candidate;break;}catch{}}assert.ok(executablePath);
  browser=await chromium.launch({headless:true,executablePath});const context=await browser.newContext({viewport:{width:1366,height:768}});await context.addCookies([{name:"nv_user",value:h.cookies.a.slice(8),url:h.baseUrl,httpOnly:true,sameSite:"Lax"},{name:"naumi_locale",value:"zh",url:h.baseUrl}]);page=await context.newPage();page.setDefaultTimeout(25000);const errors:string[]=[];page.on("pageerror",(error:Error)=>errors.push(error.message));
  await page.goto(`${h.baseUrl}/canvas?node=${id}`,{waitUntil:"domcontentloaded",timeout:150000});let dialog=await openVideoSettings(page,id);
  async function finish(){let task:any;const until=Date.now()+180000;while(Date.now()<until){const node=(await h.request<any>("a","GET",`/api/canvas/video-nodes/${id}`)).body.node;if(node.lastTaskId){await h.forceVideoPollDue(node.lastTaskId);await h.tick();task=(await h.request<any>("a","GET",`/api/video/tasks?id=${node.lastTaskId}`)).body.task;if(task.status==="completed")return task;assert.ok(!["failed","cancelled","needs_attention"].includes(task.status),JSON.stringify(task));}await new Promise(resolve=>setTimeout(resolve,250));}throw new Error("Reference task did not complete");}
  const frameRules:any[]=[];
  for(const [mode,source,role] of [["first_optional",h.refs.lastImage,"last_frame"],["last_optional",h.refs.image,"first_frame"],["frames_required",h.refs.image,"first_frame"]] as const){
   while(await dialog.getByTestId("video-reference-row").count())await dialog.getByTestId("video-reference-row").first().getByRole("button",{name:/^移除引用/}).click();
   await dialog.getByLabel("视频生成模式",{exact:true}).selectOption(mode);await dialog.getByLabel("视频描述",{exact:true}).fill(`模式 ${mode}，原首尾身份必须保留。`);await chooseAsset(dialog.getByLabel("添加视频引用",{exact:true}),source.id);await expect(dialog.getByTestId("video-reference-role").first()).toHaveValue(role);
   if(mode==="frames_required"){const before=await h.creditState("a");await expect(dialog.getByRole("button",{name:/^生成视频/})).toBeDisabled();assert.equal(await h.dbCount("app_video_tasks"),2);assert.deepEqual(await h.creditState("a"),before);await chooseAsset(dialog.getByLabel("添加视频引用",{exact:true}),h.refs.lastImage.id);await dialog.getByRole("button",{name:"交换首尾帧",exact:true}).click();}
   await expect(dialog.getByRole("button",{name:/^生成视频/})).toBeEnabled();await dialog.getByRole("button",{name:/^生成视频/}).click();await expect(dialog).toBeHidden();const task=await finish(),frozen=await h.taskPersistence("a",task.id),native=h.supplierCalls().filter(call=>call.phase==="create").at(-1)!;
   const expectedRoles=mode==="frames_required"?["first_frame","last_frame"]:[role],expectedIds=mode==="frames_required"?[h.refs.lastImage.id,h.refs.image.id]:[source.id];assert.deepEqual(frozen.video_references.map((ref:any)=>ref.role),expectedRoles);assert.deepEqual(frozen.video_references.map((ref:any)=>ref.artworkId),expectedIds);assert.deepEqual((native.body as any).content.slice(1).map((ref:any)=>ref.role),expectedRoles);frameRules.push({mode,completed:true,roles:expectedRoles,ownedIds:expectedIds});
   await writeFile(path.join(evidence,"frame-rules-progress.json"),JSON.stringify(frameRules,null,2));
   // The worker was advanced by the harness; refresh the actual page before opening the next draft.
   await page.reload({waitUntil:"domcontentloaded"});dialog=await openVideoSettings(page,id);
  }
  while(await dialog.getByTestId("video-reference-row").count())await dialog.getByTestId("video-reference-row").first().getByRole("button",{name:/^移除引用/}).click();await dialog.getByLabel("视频生成模式",{exact:true}).selectOption("reference");
  const select=dialog.getByLabel("添加视频引用",{exact:true});for(const source of [h.refs.image,h.refs.lastImage,h.refs.video,h.refs.audio])await chooseAsset(select,source.id);
  await dialog.getByRole("button",{name:"添加参考文字",exact:true}).click();const text="甲：参考文字第一句。\n乙：末句也必须保留。";await dialog.getByLabel("视频参考文字",{exact:true}).fill(text);
  const prompt="先看 {{ref 1}} 与 {{ref 2}}，再看 {{ref 3}}、{{ref 4}} 和 {{ref 5}}。\n甲：完整对白不会截断。";await dialog.getByLabel("视频描述",{exact:true}).fill(prompt);
  await page.waitForFunction(()=>{const imgs=document.querySelectorAll('[data-testid="video-reference-row"] img');return imgs.length===2&&[...imgs].every(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0);},undefined,{timeout:30000});
  await expect(dialog.getByRole("button",{name:"上移引用1",exact:true})).toBeDisabled();await expect(dialog.getByRole("button",{name:"下移引用5",exact:true})).toBeDisabled();
  // I1,I2,V,A,T -> I1,A,I2,V,T -> A,I1,T,I2,V.
  await dialog.getByRole("button",{name:"上移引用4",exact:true}).click();await dialog.getByRole("button",{name:"上移引用3",exact:true}).click();await dialog.getByRole("button",{name:"下移引用1",exact:true}).click();await dialog.getByRole("button",{name:"上移引用5",exact:true}).click();await dialog.getByRole("button",{name:"上移引用4",exact:true}).click();
  const stablePrompt="先看 {{ref 2}} 与 {{ref 4}}，再看 {{ref 5}}、{{ref 1}} 和 {{ref 3}}。\n甲：完整对白不会截断。";
  const expectedCompiled="先看 图片1 与 图片2，再看 视频1、音频1 和 参考文字1。\n甲：完整对白不会截断。\n\n参考文字1：\n"+text;
  await expect(dialog.getByTestId("video-compiled-prompt")).toHaveText(expectedCompiled);
  await dialog.getByRole("button",{name:"保存设置",exact:true}).click();await expect(dialog).toBeHidden();let saved=(await h.request<any>("a","GET",`/api/canvas/video-nodes/${id}`)).body.node;
  assert.deepEqual(saved.inputs.map((input:any)=>input.kind),["audio","image","text","image","video"]);assert.deepEqual(saved.inputs.filter((input:any)=>input.kind!=="text").map((input:any)=>input.nodeId),[h.refs.audio.id,h.refs.image.id,h.refs.lastImage.id,h.refs.video.id]);const order=saved.inputs.map((input:any)=>input.id);assert.equal(compileVideoPrompt(saved.config.prompt,saved.inputs).prompt,expectedCompiled);
  assert.equal(saved.config.prompt,stablePrompt);
  await page.reload({waitUntil:"domcontentloaded"});dialog=await openVideoSettings(page,id);await expect(dialog.getByTestId("video-compiled-prompt")).toHaveText(expectedCompiled);assert.ok(!(await dialog.getByLabel("视频描述",{exact:true}).inputValue()).includes("{{ref"));
  const before=await h.creditState("a");await dialog.getByRole("button",{name:"移除引用5",exact:true}).click();await expect(dialog.getByTestId("video-reference-row")).toHaveCount(4);await expect(dialog.getByRole("button",{name:/^生成视频/})).toBeDisabled();await expect(dialog.getByTestId("video-compiled-prompt")).toContainText("引用素材已移除，请重新选择");assert.equal(await h.dbCount("app_video_tasks"),3);assert.deepEqual(await h.creditState("a"),before);
  await chooseAsset(dialog.getByLabel("添加视频引用",{exact:true}),h.refs.video.id);
  // A new source never silently repairs an invalid reference. The user explicitly selects the intended source again.
  await expect(dialog.getByRole("button",{name:/^生成视频/})).toBeDisabled();await dialog.getByLabel("视频描述",{exact:true}).fill(stablePrompt);await expect(dialog.getByTestId("video-compiled-prompt")).toHaveText(expectedCompiled);await page.screenshot({path:path.join(evidence,"reordered-preview.png")});await dialog.getByRole("button",{name:/^生成视频/}).click();await expect(dialog).toBeHidden();
  const task=await finish();
  const frozen=await h.taskPersistence("a",task.id);assert.equal(frozen.parameters.request.prompt,expectedCompiled);assert.deepEqual(frozen.parameters.request.orderedInputs.map((input:any)=>input.kind),["audio","image","text","image","video"]);assert.deepEqual(frozen.parameters.request.orderedInputs.slice(0,4).map((input:any)=>input.id),order.slice(0,4));assert.deepEqual(frozen.video_references.map((ref:any)=>ref.kind),["audio","image","image","video"]);
  const creates=h.supplierCalls().filter(call=>call.phase==="create"),native=creates.at(-1)!;assert.equal(creates.length,4);assert.equal((native.body as any).content.length,5);assert.equal((native.body as any).content[0].text,expectedCompiled);assert.deepEqual((native.body as any).content.slice(1).map((input:any)=>input.type),["audio_url","image_url","image_url","video_url"]);assert.deepEqual(errors,[]);
  await writeFile(path.join(evidence,"result.json"),JSON.stringify({schemaVersion:1,ok:true,actualAppChromeDbRouterWorker:true,frameRules,allThreeFrameRulesCompleted:true,requiredFrameMissingBlocksWithoutCharge:true,actualOwnedThumbnailsDecode:true,uiMoveBothDirectionsAndBoundaryDisable:true,mixedIdentityAndNumberingPreserved:true,textAndMediaPlaceholderCompilation:true,saveReloadPreservesOrderAndFullPrompt:true,removedReferenceBlocksWithoutCharge:true,reinsertedReferenceCompletes:true,nativePromptAndMediaOrderMatchFrozen:true,completedTaskId:task.id,supplierCreates:4,paidVideoApiCalls:0},null,2));process.stdout.write(`VIDEO_REFERENCE_ORDER=PASS ${evidence}\n`);
 }catch(error){if(page){await page.screenshot({path:path.join(evidence,"failure.png")}).catch(()=>{});await writeFile(path.join(evidence,"failure.txt"),await page.locator("body").innerText().catch(()=>""));}throw error;}finally{if(browser)await browser.close();await h.stop();}
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
