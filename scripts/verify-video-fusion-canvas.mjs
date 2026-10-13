import assert from "node:assert/strict";
import {access,mkdir} from "node:fs/promises";
import {chromium} from "@playwright/test";
import {runVideoSettingsBrowser,openVideoSettings} from "./verify-video-fusion-settings.mjs";
import {runCanvasVideoJobs} from "./verify-video-fusion-canvas-jobs.mjs";

export async function runCanvasVideoBrowser(h,{nodeId,targetNodeId,evidence}){
  await mkdir(evidence,{recursive:true});
  let executablePath;for(const candidate of [process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].filter(Boolean)){try{await access(candidate);executablePath=candidate;break;}catch{}}
  assert.ok(executablePath,"Set CHROME_PATH to an installed Chrome");
  const browser=await chromium.launch({headless:true,executablePath}),contexts=[];
  const context=async(locale="zh",width=1440)=>{const value=await browser.newContext({viewport:{width,height:width===390?844:960}});contexts.push(value);const cookie=h.cookies.a.slice("nv_user=".length);await value.addCookies([{name:"nv_user",value:cookie,url:h.baseUrl,httpOnly:true,sameSite:"Lax"},{name:"naumi_locale",value:locale,url:h.baseUrl,sameSite:"Lax"}]);return value;};
  try{
    const desktop=await context(),page=await desktop.newPage();page.setDefaultTimeout(20000);
    const errors=[];page.on("pageerror",error=>errors.push(error.message));
    const settings=await runVideoSettingsBrowser(page,h,nodeId,evidence);
    await page.reload({waitUntil:"domcontentloaded"});const dialog=await openVideoSettings(page,nodeId);assert.equal(await dialog.getByLabel("视频描述",{exact:true}).inputValue(),settings.prompt);assert.equal(await dialog.getByLabel("角色朝向",{exact:true}).inputValue(),"1");await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});
    const mobile=await context("zh",390),mobilePage=await mobile.newPage();mobilePage.setDefaultTimeout(20000);await mobilePage.goto(`${h.baseUrl}/canvas?node=${nodeId}`,{waitUntil:"domcontentloaded",timeout:150000});const mobileDialog=await openVideoSettings(mobilePage,nodeId);const bounds=await mobileDialog.locator("div.relative").first().boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390.5);await mobilePage.screenshot({path:`evidence/settings-390.png`.replace("evidence",evidence),fullPage:false});await mobilePage.keyboard.press("Escape");
    const english=await context("en"),englishPage=await english.newPage();englishPage.setDefaultTimeout(20000);await englishPage.goto(`${h.baseUrl}/canvas?node=${nodeId}`,{waitUntil:"domcontentloaded",timeout:150000});const englishDialog=await openVideoSettings(englishPage,nodeId,true);assert.equal(await englishDialog.getByLabel("Video prompt",{exact:true}).inputValue(),settings.prompt);await englishDialog.getByRole("button",{name:"Save settings",exact:true}).waitFor();await englishDialog.getByLabel("Video model",{exact:true}).waitFor();await englishPage.screenshot({path:`${evidence}/settings-en.png`,fullPage:false});await englishPage.keyboard.press("Escape");
    const target=await context(),targetPage=await target.newPage();targetPage.setDefaultTimeout(20000);const mutations=[];targetPage.on("request",request=>{const pathname=new URL(request.url()).pathname;if(request.method()!=="GET"&&/\/api\/(?:canvas|video|comfyui)/.test(pathname))mutations.push({method:request.method(),pathname});});
    await targetPage.goto(`${h.baseUrl}/canvas?node=${targetNodeId}&email=${encodeURIComponent(h.accounts.b)}`,{waitUntil:"domcontentloaded",timeout:150000});const targetDialog=await openVideoSettings(targetPage,targetNodeId);assert.equal(await targetDialog.getByLabel("视频描述",{exact:true}).inputValue(),"Target account original prompt");assert.equal(await targetDialog.getByLabel("视频描述",{exact:true}).isDisabled(),true);assert.equal(await targetDialog.getByRole("button",{name:"保存设置",exact:true}).isDisabled(),true);assert.equal(await targetDialog.getByRole("button",{name:/^生成视频/}).isDisabled(),true);await targetPage.keyboard.press("Delete");await targetPage.screenshot({path:`${evidence}/settings-admin-readonly.png`,fullPage:false});await targetPage.keyboard.press("Escape");assert.deepEqual(mutations,[]);
    assert.equal((await h.request("a","GET",`/api/canvas/video-nodes/${targetNodeId}?email=${encodeURIComponent(h.accounts.b)}`)).body.node.config.prompt,"Target account original prompt");
    const jobs=await runCanvasVideoJobs(page,h,nodeId,evidence);
    assert.deepEqual(errors,[]);return {...jobs,actualChromeAndAuthenticatedApp:true,actualOwnedReferenceImageDecode:true,editableFramesAndFullPrompt:true,manualRoleEditNotSilentlyOverwritten:true,swappedFramesSaved:true,cameraPresetsAndDisableCompile:true,advancedMixedInputsShotsElements:true,declaredMotionOrientation:true,modelSwitchReconcilesUnsupportedSettings:true,actualReloadRestoresNode:true,englishUiPreservesUserText:true,mobile390DialogWithinViewport:true,adminTargetReadonlyControlsAndNoWrites:true};
  }catch(error){for(let index=0;index<contexts.length;index++){const page=contexts[index].pages()[0];if(page)await page.screenshot({path:`${evidence}/failure-${index}.png`,fullPage:false}).catch(()=>{});}throw error;
  }finally{await Promise.all(contexts.map(context=>context.close()));await browser.close();}
}
