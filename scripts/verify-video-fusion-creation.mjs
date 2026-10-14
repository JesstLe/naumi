import assert from 'node:assert/strict';
import {access,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {openVideoSettings} from './verify-video-fusion-settings.mjs';

export async function runVideoCreationBrowser(h,evidence,{controlsOnly=false}={}){
  let executablePath;
  for(const candidate of [process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean)){try{await access(candidate);executablePath=candidate;break;}catch{}}
  assert.ok(executablePath,'Set CHROME_PATH to an installed Chrome');
  const browser=await chromium.launch({headless:true,executablePath}),contexts=[],nodeResponses=[];
  const context=async(width,height)=>{
    const value=await browser.newContext({viewport:{width,height}});contexts.push(value);
    await value.addCookies([{name:'nv_user',value:h.cookies.a.slice('nv_user='.length),url:h.baseUrl,httpOnly:true,sameSite:'Lax'},{name:'naumi_locale',value:'zh',url:h.baseUrl,sameSite:'Lax'}]);return value;
  };
  async function finish(nodeId){
    const until=Date.now()+180000;let taskId,task;
    while(Date.now()<until){
      const node=(await h.request('a','GET',`/api/canvas/video-nodes/${nodeId}`)).body.node;taskId=node.lastTaskId;
      if(taskId){await h.forceVideoPollDue(taskId);await h.tick();task=(await h.request('a','GET',`/api/video/tasks?id=${taskId}`)).body.task;if(task.status==='completed')break;assert.ok(!['failed','cancelled','needs_attention'].includes(task.status),JSON.stringify(task));}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    assert.equal(task?.status,'completed');return {taskId,task,node:(await h.request('a','GET',`/api/canvas/video-nodes/${nodeId}`)).body.node};
  }
  try{
    const desktop=await context(1366,768),page=await desktop.newPage(),errors=[];page.setDefaultTimeout(25000);page.on('pageerror',error=>errors.push(error.message));
    page.on('response',async response=>{if(new URL(response.url()).pathname==='/api/canvas/video-nodes'&&response.request().method()==='POST')nodeResponses.push({status:response.status(),body:await response.json().catch(()=>null)});});
    if(controlsOnly){
      const events=[];await page.exposeFunction('recordMenuProbeEvent',event=>events.push(event));
      await page.goto(`${h.baseUrl}/canvas?node=${h.refs.image.id}`,{waitUntil:'domcontentloaded',timeout:150000});
      await page.locator(`[data-id="${h.refs.image.id}"]`).click();
      await page.evaluate(()=>{for(const type of ['scroll','resize'])window.addEventListener(type,event=>void window.recordMenuProbeEvent({type,target:event.target instanceof Element?event.target.tagName+'.'+event.target.className:String(event.target),time:performance.now()}),true);});
      const more=page.getByRole('button',{name:'更多处理',exact:true}),element=await more.elementHandle();await more.click();
      const mouse={expanded:await more.getAttribute('aria-expanded'),sameElementConnected:await element.evaluate(node=>node.isConnected),menuCount:await page.getByRole('menu',{name:'更多处理',exact:true}).count()};
      await page.screenshot({path:`${evidence}/menu-probe-mouse.png`});
      if(mouse.expanded==='false')await more.press('ArrowDown');
      const keyboard={expanded:await more.getAttribute('aria-expanded'),menuCount:await page.getByRole('menu',{name:'更多处理',exact:true}).count()};
      await page.screenshot({path:`${evidence}/menu-probe-keyboard.png`});return {probeOnly:true,mouse,keyboard,events};
    }
    let transport='blocked',releaseCatalog,videoGets=0,imageGets=0;
    page.on('request',request=>{if(new URL(request.url()).pathname==='/api/imagegen/catalog')imageGets++;});
    // Interrupt transport only. Successful catalog data always comes from the actual App.
    await page.route('**/api/video/catalog',async route=>{videoGets++;if(transport==='blocked')return route.abort('failed');if(transport==='delayed')await new Promise(resolve=>{releaseCatalog=resolve;});await route.continue();});
    await page.goto(`${h.baseUrl}/canvas`,{waitUntil:'domcontentloaded',timeout:150000});
    await page.getByTestId('canvas-drop-zone').getByRole('button',{name:'创建新项目',exact:true}).click();
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
    await page.getByTestId('canvas-add-node-button').click();
    const [creation]=await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==='/api/canvas/video-nodes'&&response.request().method()==='POST'),page.getByTestId('canvas-create-menu').getByRole('menuitem',{name:'新增视频节点',exact:true}).click()]);
    assert.equal(creation.status(),201,await creation.text());const blank=(await creation.json()).node;
    assert.equal(blank.inputs.length,0);assert.equal(blank.config.prompt,'');assert.equal(blank.projectKey,`tree:${blank.id}`);
    let dialog=page.getByRole('dialog',{name:'视频节点设置',exact:true});await expect(dialog).toBeVisible();
    const prompt='空白文生镜头。\n甲：第一句完整保留。\n乙：末尾对白也完整保留。';
    await dialog.getByLabel('视频描述',{exact:true}).fill(prompt);
    await expect(dialog.getByText('视频模型加载失败',{exact:true})).toBeVisible();
    await expect(dialog.getByRole('button',{name:/^生成视频/})).toBeDisabled();
    const beforeRetryImageGets=imageGets;transport='delayed';
    await dialog.getByRole('button',{name:'重试视频模型',exact:true}).click();
    await expect(dialog.getByText('视频模型加载中…',{exact:true})).toBeVisible();
    await expect(dialog.getByLabel('视频描述',{exact:true})).toHaveValue(prompt);
    await expect.poll(()=>typeof releaseCatalog).toBe('function');transport='healthy';releaseCatalog();
    await expect(dialog.getByText('视频模型加载失败',{exact:true})).toHaveCount(0);
    await expect(dialog.getByLabel('视频模型',{exact:true}).locator('option[value="managed-video/video-a"]')).toHaveCount(1);
    assert.equal(imageGets,beforeRetryImageGets,'Video retry must not reload the image catalog');
    await dialog.getByLabel('视频模型',{exact:true}).selectOption('managed-video/video-a');
    await expect(dialog.getByLabel('视频描述',{exact:true})).toHaveValue(prompt);
    await expect(dialog.getByRole('button',{name:/^生成视频/})).toBeEnabled();
    await page.screenshot({path:`${evidence}/blank-node-recovered-1366.png`});
    await dialog.getByRole('button',{name:/^生成视频/}).click();await expect(dialog).toBeHidden();
    const text=await finish(blank.id);assert.equal(text.node.config.prompt,prompt);assert.equal(text.node.config.mode,'text');
    const frozenText=await h.taskPersistence('a',text.taskId);assert.equal(frozenText.parameters.request.prompt,prompt);assert.equal(frozenText.video_references.length,0);
    await writeFile(`${evidence}/blank-completed.json`,JSON.stringify({taskId:text.taskId,nodeId:blank.id,catalogRetryActualApp:true,fullPrompt:prompt},null,2));
    await page.reload({waitUntil:'domcontentloaded'});dialog=await openVideoSettings(page,blank.id);await expect(dialog.getByLabel('视频描述',{exact:true})).toHaveValue(prompt);await page.keyboard.press('Escape');
    await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==='/api/video/catalog'&&response.status()===200),page.goto(`${h.baseUrl}/canvas?node=${h.refs.image.id}`,{waitUntil:'domcontentloaded',timeout:150000})]);
    const image=page.locator(`[data-id="${h.refs.image.id}"]`);await expect(image).toBeVisible();await image.click();
    await page.getByRole('button',{name:'更多处理',exact:true}).click();
    await writeFile(`${evidence}/more-menu-state.json`,JSON.stringify(await page.evaluate(()=>({buttons:[...document.querySelectorAll('button[aria-label="更多处理"]')].map(e=>({expanded:e.getAttribute('aria-expanded'),controls:e.getAttribute('aria-controls'),rect:e.getBoundingClientRect().toJSON()})),menus:[...document.querySelectorAll('[role="menu"]')].map(e=>({label:e.getAttribute('aria-label'),style:e.getAttribute('style'),rect:e.getBoundingClientRect().toJSON(),text:e.textContent}))})),null,2));
    await expect(page.getByRole('menuitem',{name:/^生成视频/})).toBeEnabled();
    await page.screenshot({path:`${evidence}/image-video-create-menu.png`});await writeFile(`${evidence}/image-video-create-menu.txt`,await page.locator('body').innerText());
    const [imageCreation]=await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==='/api/canvas/video-nodes'&&response.request().method()==='POST'),page.getByRole('menuitem',{name:/^生成视频/}).click()]);
    assert.equal(imageCreation.status(),201,await imageCreation.text());const fromImage=(await imageCreation.json()).node;
    assert.equal(fromImage.config.mode,'single_image');assert.equal(fromImage.inputs.length,1);assert.equal(fromImage.inputs[0].nodeId,h.refs.image.id);assert.equal(fromImage.inputs[0].role,'first_frame');
    dialog=page.getByRole('dialog',{name:'视频节点设置',exact:true});await expect(dialog).toBeVisible();
    const imagePrompt='原图生成视频。\n甲：完整图生对白。';await dialog.getByLabel('视频描述',{exact:true}).fill(imagePrompt);
    await expect(dialog.getByRole('button',{name:/^生成视频/})).toBeEnabled();await dialog.getByRole('button',{name:/^生成视频/}).click();await expect(dialog).toBeHidden();
    const generatedImage=await finish(fromImage.id),frozenImage=await h.taskPersistence('a',generatedImage.taskId);
    assert.equal(frozenImage.parameters.request.mode,'single_image');assert.equal(frozenImage.video_references.length,1);assert.equal(frozenImage.video_references[0].artworkId,h.refs.image.id);assert.equal(frozenImage.video_references[0].role,'first_frame');
    const viewports=[];
    for(const [width,height] of [[1366,768],[1600,1000],[390,844]]){
      const target=width===1366?page:await (await context(width,height)).newPage();target.setDefaultTimeout(25000);
      await target.goto(`${h.baseUrl}/canvas?node=${fromImage.id}`,{waitUntil:'domcontentloaded',timeout:150000});const current=await openVideoSettings(target,fromImage.id);
      await expect(current.getByLabel('视频描述',{exact:true})).toHaveValue(imagePrompt);
      const box=await current.locator('div.relative').first().boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+.5&&box.y+box.height<=height+.5);
      await target.screenshot({path:`${evidence}/creation-settings-${width}x${height}.png`});viewports.push({width,height,dialogWithinViewport:true,fullPromptPreserved:true});await target.keyboard.press('Escape');
    }
    assert.deepEqual(errors,[]);assert.equal(h.supplierCalls().filter(call=>call.phase==='image-create').length,0);
    return {actualAppAndChrome:true,blankCanvasCreatedViaUi:true,textGenerationCompleted:true,singleImageCreatedViaUi:true,imageGenerationCompleted:true,failedCatalogTransportVisible:true,catalogRetryActualApp:true,catalogLoadingVisible:true,retryPreservesFullDraft:true,retryDoesNotReloadImageCatalog:true,refreshPreservesNodeAndPrompt:true,videoCatalogRequests:videoGets,textTaskId:text.taskId,imageTaskId:generatedImage.taskId,viewports,stableImageGenerationStillRequiresFinalRegression:true};
  }catch(error){await writeFile(`${evidence}/node-responses.json`,JSON.stringify(nodeResponses,null,2));for(let index=0;index<contexts.length;index++){const page=contexts[index].pages()[0];if(page){await page.screenshot({path:`${evidence}/creation-failure-${index}.png`}).catch(()=>{});await writeFile(`${evidence}/creation-failure-${index}.txt`,await page.locator('body').innerText().catch(()=>''));}}throw error;}
  finally{await Promise.all(contexts.map(value=>value.close()));await browser.close();}
}
