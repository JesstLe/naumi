// Actual Next/CanvasClient + ReactFlow + video editor. API state is loopback-only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const base=process.env.VIDEO_DOCK_FIXTURE_URL||'http://127.0.0.1:14327',mode=process.argv[2]||'modified';
const out=process.env.VIDEO_DOCK_EVIDENCE||'E:/Workspace/naumi/output/canvas-video-dock-20261016';fs.mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 const errors=[],checks=[],external=[];const pass=name=>{checks.push(name);console.log('CHECK='+name)};page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol)){external.push(u.origin);return route.abort();}return route.continue();});
 const state=async()=>await(await fetch(base+'/__fixture/state')).json();
 const dock=page.getByTestId('video-node-dock'),toolbar=page.getByTestId('video-node-toolbar');
 async function open(id='video-dock-one'){
  const node=page.locator(`[data-id="${id}"]`);await node.waitFor();await node.click({position:{x:60,y:15}});if(mode!=='baseline')await dock.waitFor();return node;
 }
 async function load(url='/canvas'){
  await page.goto(base+url,{waitUntil:'domcontentloaded',timeout:120000});await page.locator('[data-id="video-dock-one"]').waitFor({timeout:120000});
  const collapse=page.getByRole('button',{name:'收起助手',exact:true});if(await collapse.isVisible())await collapse.click();
 }
 try{
  await fetch(base+'/__fixture/reset');
  if(mode!=='baseline')await fetch(base+'/__fixture/result');
  await load();await open();
  if(mode==='baseline'){
   assert.equal(await dock.count(),0);assert.ok(await page.locator('[data-id="video-dock-one"]').getByRole('button',{name:'参数与引用',exact:true}).count());
   console.log('BASELINE=CONFIRMED VIDEO_DOCK=ABSENT INLINE_ACTIONS=PRESENT PROVIDER_CALLS=0');return;
  }
  assert.equal(await toolbar.count(),1);assert.equal(await page.getByRole('dialog').count(),0);assert.equal((await state()).generations.length,0);pass('SINGLE_CLICK_ANCHORED_NO_MODAL_NO_GENERATION');
  assert.equal(await page.locator('[data-id="video-dock-one"]').getByRole('button',{name:'生成视频',exact:true}).count(),0);pass('NO_DUPLICATE_INLINE_ACTIONS');
  const edited='慢镜头推进，保留人物与建筑完整构图。';await dock.getByLabel('视频描述',{exact:true}).fill(edited);
  await toolbar.getByRole('button',{name:'参数与引用',exact:true}).click();await dock.getByLabel('视频模型',{exact:true}).waitFor();assert.equal(await dock.getByLabel('视频描述',{exact:true}).inputValue(),edited);
  await dock.getByLabel('视频画幅',{exact:true}).selectOption('9:16');await toolbar.getByRole('button',{name:'参数与引用',exact:true}).click();assert.equal(await dock.getByLabel('视频描述',{exact:true}).inputValue(),edited);pass('ADVANCED_TOGGLE_PRESERVES_DRAFT');
  await dock.getByRole('button',{name:'保存设置',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid="video-node-dock"]')?.textContent.includes('已保存'));
  let current=await state();assert.equal(current.videoWrites.at(-1).config.prompt,edited);assert.equal(current.videoWrites.at(-1).config.aspectRatio,'9:16');const rev=current.videos[0].revision;
  await dock.getByLabel('视频描述',{exact:true}).fill(edited+' 二次保存。');await dock.getByRole('button',{name:'保存设置',exact:true}).click();await sleep(400);current=await state();assert.equal(current.videoWrites.at(-1).expectedRevision,rev);assert.equal(current.apiErrors.length,0);pass('SAVE_TWICE_CURRENT_REVISION');
  await load();await open();assert.equal(await dock.getByLabel('视频描述',{exact:true}).inputValue(),edited+' 二次保存。');pass('RELOAD_PERSISTED_DRAFT');
  // A position-only revision arriving while typing must not lose the prompt.
  await dock.getByLabel('视频描述',{exact:true}).fill('位置更新期间编辑');await fetch(base+'/__fixture/bump');await sleep(6500);const beforeSave=(await state()).videos[0].revision;
  await dock.getByRole('button',{name:'保存设置',exact:true}).click();await sleep(350);assert.equal((await state()).videoWrites.at(-1).expectedRevision,beforeSave);assert.equal((await state()).videos[0].config.prompt,'位置更新期间编辑');pass('POSITION_REVISION_REBASE_PRESERVES_EDIT');
  await dock.getByLabel('视频描述',{exact:true}).fill('并发本地草稿');await fetch(base+'/__fixture/bump?config=1');await sleep(6500);await dock.getByRole('button',{name:'保存设置',exact:true}).click();await dock.getByRole('alert').waitFor();assert.equal((await state()).videos[0].config.prompt,'external edit');assert.equal(await dock.getByLabel('视频描述',{exact:true}).inputValue(),'并发本地草稿');pass('CONFIG_CONFLICT_NOT_OVERWRITTEN');await load();await open();
  await toolbar.getByRole('button',{name:'重命名',exact:true}).click();const rename=page.locator('input[maxlength="60"]');await rename.fill('城市短片');await rename.press('Enter');await sleep(400);assert.equal((await state()).videos[0].title,'城市短片');pass('RENAME_EXISTING_PATCH_UNDO_PATH');
  // Actual header drag moves the node and the shared dock geometry.
  const node=page.locator('[data-id="video-dock-one"]'),beforeNode=await node.boundingBox(),beforeDock=await dock.boundingBox();
  await page.mouse.move(beforeNode.x+70,beforeNode.y+12);await page.mouse.down();await page.mouse.move(beforeNode.x+160,beforeNode.y+80,{steps:12});await page.mouse.up();await sleep(500);
  const afterNode=await node.boundingBox(),afterDock=await dock.boundingBox();assert.ok(Math.abs(afterNode.x-beforeNode.x)>10||Math.abs(afterNode.y-beforeNode.y)>10);assert.ok(Math.abs(afterDock.x-beforeDock.x)>1||Math.abs(afterDock.y-beforeDock.y)>1);pass('DRAG_FOLLOWS_SHARED_LAYOUT');
  // Existing image and text docks still respond, and video controls disappear.
  await page.mouse.click(650,90);await page.locator('[data-id="placement-root"]').click({position:{x:100,y:80}});await page.getByTestId('image-node-dock').waitFor();assert.equal(await dock.count(),0);
  await page.mouse.click(650,90);await page.locator('[data-id="text-dock-fixture"]').click({position:{x:80,y:25}});await page.getByTestId('text-node-dock').waitFor();assert.equal(await dock.count(),0);pass('IMAGE_TEXT_DOCKS_PRESERVED');
  await load();await open();await dock.getByLabel('视频描述',{exact:true}).fill('镜头缓慢推进，晨光掠过街道，保持自然流畅的运动。');await page.screenshot({path:path.join(out,'video-dock-desktop.png')});
  await toolbar.getByRole('button',{name:'参数与引用',exact:true}).click();await dock.getByLabel('视频模型',{exact:true}).waitFor();await page.screenshot({path:path.join(out,'video-dock-advanced.png')});
  await toolbar.getByRole('button',{name:'参数与引用',exact:true}).click();
  await page.setViewportSize({width:390,height:844});await sleep(600);await open();let bounds=await dock.boundingBox();assert.ok(bounds.x>=-1&&bounds.x+bounds.width<=391);assert.ok(bounds.y>=0&&bounds.y+bounds.height<=844);assert.ok(await dock.getByRole('button',{name:/^生成视频/}).isVisible());await page.screenshot({path:path.join(out,'video-dock-390.png')});pass('MOBILE_390_DOCK_WITHIN_VIEWPORT');
  // More menu is a portal; horizontal toolbar clipping must not hide it.
  await toolbar.getByRole('button',{name:'更多节点操作',exact:true}).click();await page.getByRole('menu',{name:'更多节点操作',exact:true}).waitFor();await page.keyboard.press('Escape');pass('MOBILE_MORE_MENU_PORTAL_ESCAPE');
  await page.setViewportSize({width:1440,height:1000});await load();await open();
  await open('video-dock-two');assert.equal(await dock.getByLabel('视频描述',{exact:true}).inputValue(),(await state()).videos[1].config.prompt);await open();assert.equal(await dock.count(),1);pass('SINGLE_SELECTED_VIDEO_SWITCH');
  await dock.getByLabel('视频描述',{exact:true}).fill('本地生成回调验收');const count=(await state()).generations.length;await dock.getByRole('button',{name:/^生成视频/}).click();await sleep(600);assert.equal((await state()).generations.length,count+1);await dock.getByRole('button',{name:'停止',exact:true}).waitFor();assert.equal(await dock.getByRole('button',{name:/^生成视频/}).count(),0);pass('EXPLICIT_GENERATE_ONCE_RUNNING_NO_RESUBMIT');
  await dock.getByRole('button',{name:'停止',exact:true}).click();await sleep(350);assert.ok((await state()).videoTasks[0].cancellationRequestedAt);pass('STOP_ORIGINAL_TASK_CALLBACK');
  await fetch(base+'/__fixture/task?status=needs_attention');await load();await open();assert.equal(await dock.getByRole('button',{name:/^生成视频/}).count(),0);assert.equal(await dock.getByRole('button',{name:'停止',exact:true}).isDisabled(),true);pass('UNKNOWN_TASK_FAIL_CLOSED');
  await page.locator('[data-id="video-dock-one"]').getByRole('button',{name:'视频节点设置',exact:true}).click();const dialog=page.getByRole('dialog',{name:'视频节点设置',exact:true});await dialog.waitFor();assert.equal(await dialog.getByRole('button',{name:/^生成视频/}).isDisabled(),true);await dialog.getByLabel('视频描述',{exact:true}).fill('模态与Dock共享草稿');await page.keyboard.press('Escape');await dock.waitFor();assert.equal(await dock.getByLabel('视频描述',{exact:true}).inputValue(),'模态与Dock共享草稿');pass('LEGACY_ADVANCED_DIALOG_SHARES_DRAFT');
  await fetch(base+'/__fixture/lock?value=1');await load();await open();assert.equal(await dock.getByRole('button',{name:'保存设置',exact:true}).isDisabled(),true);assert.equal(await toolbar.getByRole('button',{name:'重命名',exact:true}).isDisabled(),true);await fetch(base+'/__fixture/lock?value=0');pass('LOCKED_NODE_EDIT_BLOCKED');
  await fetch(base+'/__fixture/result');await load();await page.getByRole('button',{name:'适应视图',exact:true}).click();const resultNode=page.locator('[data-id="video-result-art"]');await resultNode.waitFor();await resultNode.click({position:{x:30,y:10}});await page.getByTestId('video-result-dock').waitFor();assert.equal(await page.getByTestId('image-node-dock').count(),0);assert.equal(await page.getByTestId('image-node-toolbar').count(),0);assert.equal(await toolbar.getByRole('button',{name:'下载视频',exact:true}).isDisabled(),false);pass('VIDEO_ARTWORK_NO_IMAGE_TOOLS');
  await page.waitForFunction(()=>{const video=document.querySelector('[data-id="video-result-art"] video');return video&&video.readyState>=1&&video.duration>0;});const downloadPromise=page.waitForEvent('download');await toolbar.getByRole('button',{name:'下载视频',exact:true}).click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/\.mp4$/);await download.saveAs(path.join(out,'downloaded-video.mp4'));assert.deepEqual(fs.readFileSync(path.join(out,'downloaded-video.mp4')),Buffer.from(await(await fetch(base+'/media/fixture-result.mp4')).arrayBuffer()));pass('RESULT_VIDEO_DECODE_MP4_DOWNLOAD');
  await load('/canvas?email=readonly%40fixture.test');await open();assert.equal(await dock.getByRole('button',{name:'保存设置',exact:true}).isDisabled(),true);assert.equal(await dock.getByLabel('视频描述',{exact:true}).getAttribute('readonly'),'');pass('READONLY_EDIT_BLOCKED');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  fs.writeFileSync(path.join(out,'browser-verification.json'),JSON.stringify({checks,errors,external,paidCalls:0,next:'15.5.27',react:'19.3.0',actualNextCanvas:true,syntheticApi:true},null,2));
  console.log(`MODIFIED=PASS CHECKS=${checks.length} ACTUAL_CANVAS=true DESKTOP_390=PASS DRAFT_REVISION=PASS SINGLE_SUBMIT=PASS PAGEERRORS=0 PROVIDER_CALLS=0`);
 }catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(error),errors,checks,body:await page.locator('body').innerText()},null,2));throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
