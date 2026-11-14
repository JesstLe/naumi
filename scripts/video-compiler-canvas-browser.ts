import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
import type {CompiledVideoPlan} from '../src/lib/video/execution-contract';

/** Real Next + ReactFlow + repositories + independent Worker. The parent
 * controls only fixture-supplier completion/Worker lifecycle and observes DB.
 * No HTTP interception, component replacement or browser-side state injection. */
export async function verifyVideoCompilerCanvasBrowser(input:{origin:string;cookie:string;taskId:string;outputDir:string;posts:()=>number;
 observeNode:(id:string)=>Promise<any>;observeTask:(id:string)=>Promise<any>;readPlan:(id:string)=>Promise<CompiledVideoPlan>;
 complete:(id:string)=>Promise<any>;observeLedger:(id:string)=>Promise<{n:number;amount:number}>;observeParent:(id:string)=>Promise<string>}){
 const check=expect.configure({timeout:45000}),browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1600,height:1100},locale:'zh-CN'}),page=await context.newPage();page.setDefaultTimeout(60000);
 const [name,...value]=input.cookie.split('=');await context.addCookies([{name,value:value.join('='),url:input.origin},{name:'naumi_locale',value:'zh',url:input.origin}]);
 const errors:string[]=[],requests:Array<{path:string;status:number}>=[],checks:string[]=[],before=input.posts();let stage='send';
 page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.url().startsWith(input.origin+'/api/'))requests.push({path:new URL(response.url()).pathname,status:response.status()});});
 const pass=(name:string)=>{checks.push(name);console.log('CANVAS_BROWSER_CHECK='+name+' PASS');};
 const node=(id:string)=>page.locator(`.react-flow__node[data-id="${id}"]`),dock=page.getByTestId('video-node-dock'),prompt=dock.getByRole('textbox',{name:'视频描述',exact:true});
 const response=(suffix:string,method='POST')=>page.waitForResponse(r=>new URL(r.url()).pathname.endsWith(suffix)&&r.request().method()===method);
 async function load(project:string,id:string){await page.goto(input.origin+`/canvas?project=${encodeURIComponent(project)}&node=${encodeURIComponent(id)}`,{waitUntil:'domcontentloaded',timeout:180000});await check(node(id)).toBeVisible();const hide=page.getByRole('button',{name:'收起助手',exact:true});if(await hide.isVisible())await hide.click();if(!await dock.isVisible())await node(id).click({position:{x:65,y:16}});await check(dock).toBeVisible();}
 async function save(id:string){await dock.getByRole('button',{name:'保存设置',exact:true}).click();await check.poll(async()=>(await input.observeNode(id)).config.prompt).toBe(await prompt.innerText());}
 async function generate(id:string){await check(dock.getByRole('button',{name:'生成视频',exact:true})).toBeEnabled();const [r]=await Promise.all([response(`/video-nodes/${id}/generate`),dock.getByRole('button',{name:'生成视频',exact:true}).click()]);const payload=await r.json();assert.equal(r.status(),202,JSON.stringify(payload));assert(payload.taskId);return payload.taskId as string;}
 try{
  // Next dev compiles routes lazily. Warm the real handlers serially before
  // measuring UI behavior, rather than letting concurrent first compilation
  // consume the product's ordinary request timeout. No response substitutes.
  for(const route of ['/canvas','/api/account','/api/projects','/api/canvas/text-nodes','/api/canvas/video-nodes','/api/canvas/director-nodes','/api/canvas/comfy-nodes','/api/canvas/character-nodes','/api/canvas/scene-nodes','/api/canvas/audio-nodes','/api/canvas/timeline-nodes','/api/canvas/workflow-import','/api/canvas/image-tasks','/api/video/media-jobs']){
   const warm=await context.request.get(input.origin+route,{timeout:180000});assert.equal(warm.status(),200,route+' warmup '+await warm.text());
  }
  console.log('CANVAS_BROWSER_PRECONDITION=PASS REAL_HANDLER_WARMUP=14 NEXT_MODE=development');
  await page.goto(input.origin+'/video',{waitUntil:'domcontentloaded',timeout:180000});await check(page.getByTestId('video-workbench')).toBeVisible();
  await page.getByRole('button',{name:'完整历史',exact:true}).click();const history=page.getByTestId('video-history-picker');await check(history).toBeVisible();await history.locator(`[data-task-id="${input.taskId}"]`).click();
  const [sentResponse]=await Promise.all([response(`/video/tasks/${input.taskId}/send-to-canvas`),history.getByRole('button',{name:'发送到画布',exact:true}).click()]);const attached=await sentResponse.json();assert.equal(sentResponse.status(),200,JSON.stringify(attached));assert(attached.nodeId&&attached.projectKey);
  const project=attached.projectKey,source=attached.nodeId;await load(project,source);const original=await input.observeNode(source);
  assert.equal(original.config.parameters.resolution,'4K');assert.equal(original.inputs[0].role,'reference');await check(prompt).toHaveText(original.config.prompt);pass('real-history-send-restores-native-node-requested-parameters-and-reference');
  stage='switch-save-reload';const text='真实画布：保留输入身份，镜头平稳推进。';await prompt.fill(text);
  await dock.getByRole('combobox',{name:'视频模型',exact:true}).click();await page.getByRole('option',{name:'视频验收备选',exact:true}).click();await save(source);
  const switched=await input.observeNode(source);assert.equal(switched.config.modelId,'video-process-alias');assert.deepEqual(switched.config.parameters,original.config.parameters);assert.deepEqual(switched.inputs,original.inputs);
  await load(project,source);await check(prompt).toHaveText(text);await check(dock.getByRole('combobox',{name:'视频模型',exact:true})).toContainText('视频验收备选');
  await dock.getByRole('combobox',{name:'视频模型',exact:true}).click();await page.getByRole('option',{name:'视频验收模型',exact:true}).click();await save(source);pass('model-switch-save-and-real-reload-preserve-prompt-parameters-roles-and-order');
  stage='source-generate';const newerTask=await generate(source);
  const pending=await context.request.post(input.origin+'/api/video/compile-preview',{headers:{origin:input.origin},data:{modelId:'video-process',projectKey:project,draftRevision:1,draft:{prompt:'Pending dependency check',parameters:{durationSeconds:1,resolution:'4K'},inputs:[{id:'pending-source',nodeId:source,kind:'video',role:'source_video'}]}}});
  const pendingBody=await pending.json();assert.equal(pending.status(),422,JSON.stringify(pendingBody));assert.equal(pendingBody.diagnostics[0].code,'DEPENDENCY_PENDING');assert.equal(input.posts(),before);pass('actual-next-preview-rejects-implicit-old-result-while-current-task-queued');
  const newer=await input.complete(newerTask);assert.notEqual(newer.artwork_id,attached.artworkId);
  await check(dock.getByRole('button',{name:'生成视频',exact:true})).toBeEnabled();await check(prompt).toHaveText(text);assert.equal(await page.getByTestId('video-result-dock').count(),0);assert.deepEqual((await input.observeNode(source)).config.parameters,original.config.parameters);
  await page.screenshot({path:path.join(input.outputDir,'CANVAS-generated.png')});pass('real-dock-survives-worker-completion-without-parameter-or-composer-replacement');
  stage='history-select';await page.getByTestId('video-node-toolbar').getByRole('button',{name:'历史',exact:true}).click();await check(history).toBeVisible();await history.getByLabel('当前项目',{exact:true}).uncheck();await history.locator(`[data-task-id="${input.taskId}"]`).click();await history.getByRole('button',{name:'使用视频结果',exact:true}).click();
  const older=(await input.observeTask(input.taskId)).artwork_id;await check.poll(async()=>(await input.observeNode(source)).display_result_id).toBe(older);await history.getByRole('button',{name:'关闭',exact:true}).click();pass('real-history-selection-overrides-newer-last-result-by-stable-asset-identity');
  stage='create-and-connect';await dock.getByRole('button',{name:'关闭创作栏',exact:true}).click();
  // Pick an actual empty part of the pane, not a node/overlay/context substitute.
  const blank=await page.locator('.react-flow__pane').evaluate(el=>{const r=el.getBoundingClientRect();for(let y=r.y+100;y<r.bottom-170;y+=90)for(let x=r.right-140;x>r.x+300;x-=110)if(document.elementFromPoint(x,y)===el)return {x,y};throw Error('No unobscured Canvas pane');});
  await page.mouse.click(blank.x,blank.y,{button:'right'});await page.getByTestId('canvas-context-menu').getByRole('menuitem',{name:'添加节点',exact:true}).click();const [createdResponse]=await Promise.all([response('/canvas/video-nodes'),page.getByTestId('canvas-node-type-menu').locator('[data-action="video-node"]').click()]);const createdBody=await createdResponse.json();assert.equal(createdResponse.status(),201,JSON.stringify(createdBody));const target=createdBody.node.id;assert.equal(createdBody.node.projectKey,project);await page.keyboard.press('Escape');
  if(await dock.isVisible())await dock.getByRole('button',{name:'关闭创作栏',exact:true}).click();await page.getByRole('button',{name:'适应视图',exact:true}).click();await node(source).hover();
  const a=await node(source).locator('.react-flow__handle-right').boundingBox(),b=await node(target).locator('.react-flow__handle-left').boundingBox();assert(a&&b);
  const hits=await page.evaluate(({a,b})=>[a,b].map(r=>document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.className),{a,b});assert(hits.every(hit=>typeof hit==='string'&&hit.includes('react-flow__handle')),JSON.stringify(hits));
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:24});await page.mouse.up();await check.poll(async()=>(await input.observeNode(target)).inputs.length).toBe(1);
  const linked=await input.observeNode(target);assert.equal(linked.inputs[0].nodeId,source);assert.equal(linked.inputs[0].role,'source_video');assert.deepEqual(linked.config,createdBody.node.config);pass('real-reactflow-port-drag-persists-reference-without-rewriting-config');
  stage='downstream-generate';await load(project,target);const nextPrompt='真实画布：继续所选历史结果。';await prompt.fill(nextPrompt);await save(target);const downstreamTask=await generate(target),plan=await input.readPlan(downstreamTask);assert.equal(plan.intent,'reference');assert.equal(plan.inputManifest.length,1);const selected=plan.inputManifest[0];assert(selected.kind==='video');assert.equal(selected.asset.artworkId,older);assert.notEqual(selected.asset.artworkId,newer.artwork_id);
  const downstream=await input.complete(downstreamTask);assert.equal(await input.observeParent(downstream.artwork_id),older);assert.deepEqual(await input.observeLedger(downstreamTask),{n:1,amount:17});assert.deepEqual(await input.observeLedger(newerTask),{n:1,amount:17});
  await check(prompt).toHaveText(nextPrompt);await check(dock.getByRole('button',{name:'生成视频',exact:true})).toBeEnabled();assert.equal(await page.getByTestId('video-result-dock').count(),0);pass('selected-history-to-downstream-worker-asset-parent-and-single-ledger');
  stage='lock';await page.getByTestId('video-node-toolbar').getByRole('button',{name:'更多节点操作',exact:true}).click();await page.getByRole('menuitem',{name:'锁定节点',exact:true}).click();await check(dock.getByRole('button',{name:'保存设置',exact:true})).toBeDisabled();await check(dock.getByRole('button',{name:'生成视频',exact:true})).toBeDisabled();await check(prompt).toHaveAttribute('contenteditable','false');
  await page.getByTestId('video-node-toolbar').getByRole('button',{name:'更多节点操作',exact:true}).click();await page.getByRole('menuitem',{name:'解锁节点',exact:true}).click();await check(dock.getByRole('button',{name:'生成视频',exact:true})).toBeEnabled();
  await load(project,target);await check(prompt).toHaveText(nextPrompt);assert.deepEqual((await input.observeNode(target)).inputs,linked.inputs);pass('real-lock-unlock-and-reload-preserve-connected-draft');
  stage='multi-select';const sourceSaved=await input.observeNode(source),targetSaved=await input.observeNode(target);await dock.getByRole('button',{name:'关闭创作栏',exact:true}).click();await page.getByRole('button',{name:'适应视图',exact:true}).click();await node(source).locator('.art-title').click({position:{x:65,y:10}});await node(target).locator('.art-title').click({position:{x:65,y:10},modifiers:['Control']});
  await check(page.locator('.react-flow__node.selected')).toHaveCount(2);await check(dock).not.toBeVisible();await node(target).locator('.art-title').click({position:{x:65,y:10},button:'right'});await check(page.getByTestId('canvas-context-menu')).toBeVisible();await page.keyboard.press('Escape');
  for(const [id,saved]of [[source,sourceSaved],[target,targetSaved]] as const){const current=await input.observeNode(id);assert.deepEqual(current.config,saved.config);assert.deepEqual(current.inputs,saved.inputs);}
  await load(project,target);await check(prompt).toHaveText(nextPrompt);pass('real-multi-select-keeps-both-node-configurations-and-input-order');
  await page.setViewportSize({width:390,height:844});await check(prompt).toHaveText(nextPrompt);await check(dock.getByRole('button',{name:'生成视频',exact:true})).toBeInViewport();await page.screenshot({path:path.join(input.outputDir,'CANVAS-mobile.png')});pass('real-mobile-canvas-retains-dock-and-generation-action');
  assert.equal(input.posts()-before,2);assert.deepEqual(errors,[]);await writeFile(path.join(input.outputDir,'CANVAS_BROWSER_RESULT.json'),JSON.stringify({ok:true,checks,stage,actualNext:true,actualReactFlow:true,httpMocks:0,errors,requests,source,target,older,newerTask,downstreamTask,planDigest:plan.digest,supplierPostsAdded:input.posts()-before,ledgerAdded:34},null,2));
  console.log(`VIDEO_COMPILER_CANVAS_BROWSER=PASS CHECKS=${checks.length} REAL_NEXT=1 REAL_REACTFLOW=1 HTTP_MOCKS=0 PAGE_ERRORS=0 SUPPLIER_POSTS_ADDED=2 LEDGER_ADDED=34 PAID_CALLS=0`);
 }catch(error){await page.screenshot({path:path.join(input.outputDir,'CANVAS-failure.png')}).catch(()=>{});await writeFile(path.join(input.outputDir,'CANVAS_BROWSER_FAILURE.json'),JSON.stringify({stage,error:String(error),errors,requests,url:page.url(),body:await page.locator('body').innerText()},null,2));throw error;}
 finally{await context.close();await browser.close();console.log('CANVAS_BROWSER_CLEANUP=PASS CONTEXT_CLOSED=1 BROWSER_CLOSED=1');}
}
