// Real production components, local catalog only. No Next/API/supplier acceptance.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const url=process.env.VIDEO_CAPABILITY_FIXTURE_URL||'http://127.0.0.1:14339';
const output=path.resolve('output/video-node-capabilities-20261023');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage();
 const errors=[],external=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol)){external.push(u.origin);return route.abort();}return route.continue();});
 const state=()=>page.evaluate(()=>window.fixtureState),pass=name=>{checks.push(name);console.log('UI_CHECK='+name);};
 const pick=async(label,option)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click();};
 const aside=page.locator('aside');
 try{
  await page.goto(url,{waitUntil:'networkidle'});await page.getByTestId('video-compact-composer').waitFor();
  await page.getByRole('combobox',{name:'视频时长',exact:true}).click();
  assert.equal(await page.getByRole('listbox',{name:'视频时长',exact:true}).getByRole('option').count(),12);await page.getByRole('option',{name:'12 秒',exact:true}).click();
  assert.equal((await state()).config.durationSeconds,12);pass('independent_duration_4_to_15');
  await aside.getByRole('button',{name:'4K',exact:true}).click();await aside.getByRole('button',{name:'21:9',exact:true}).click();
  assert.equal((await state()).config.resolution,'4k');assert.equal((await state()).config.aspectRatio,'21:9');pass('model_specific_4K_and_six_ratios');
  await page.screenshot({path:path.join(output,'video-node-controls-desktop.png'),fullPage:true});
  await pick('视频生成模式','首尾帧');assert.equal((await state()).config.aspectRatio,'adaptive');assert.equal((await state()).config.durationSeconds,12);pass('mode_reconciles_ratio');
  await pick('视频模型','kling-v2-6');assert.equal((await state()).config.mode,'frames_required');assert.equal((await state()).config.resolution,'1080p');assert.equal((await state()).config.durationSeconds,5);
  await page.getByRole('combobox',{name:'视频时长',exact:true}).click();assert.deepEqual(await page.getByRole('listbox',{name:'视频时长',exact:true}).getByRole('option').allTextContents(),['5 秒','10 秒']);await page.getByRole('option',{name:'10 秒',exact:true}).click();
  assert.equal(await aside.getByRole('button',{name:'720P',exact:true}).count(),0);pass('sparse_duration_and_frame_1080_guard');
  await pick('视频模型','wan2.5-preview');await pick('视频生成模式','文生视频');await aside.getByRole('button',{name:'720P',exact:true}).click();await aside.getByRole('button',{name:'4:3',exact:true}).click();
  await aside.getByRole('button',{name:'480P',exact:true}).click();assert.equal((await state()).config.aspectRatio,'16:9');assert.equal(await aside.getByRole('button',{name:'4:3',exact:true}).count(),0);pass('resolution_reconciles_ratio');
  await pick('视频模型','MiniMax-H3 · Geek');await pick('视频生成模式','首帧可选');
  for(const n of [1,2]){await page.getByRole('button',{name:'添加引用',exact:true}).click();await page.getByRole('button',{name:'本地参考图 '+n,exact:true}).click();}
  assert.deepEqual((await state()).inputs.map(x=>x.role),['first_frame','last_frame']);
  await page.getByRole('button',{name:'移除引用2',exact:true}).click();assert.deepEqual((await state()).inputs.map(x=>x.role),['last_frame']);pass('first_optional_remove_reassigns_last_frame');
  await page.getByRole('checkbox',{name:'锁定节点'}).check();assert.equal(await page.getByRole('combobox',{name:'视频时长',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'添加引用',exact:true}).isDisabled(),true);pass('locked_controls_disabled');
  await page.getByRole('checkbox',{name:'锁定节点'}).uncheck();await page.getByRole('button',{name:'移除引用1',exact:true}).click();await pick('视频模型','seedance-2.0');await pick('视频生成模式','文生视频');
  await page.setViewportSize({width:390,height:844});await page.getByRole('combobox',{name:'视频时长',exact:true}).click();await page.getByRole('option',{name:'15 秒',exact:true}).click();
  assert.equal((await state()).config.durationSeconds,15);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));pass('390px_duration_interaction_no_horizontal_overflow');
  await page.screenshot({path:path.join(output,'video-node-controls-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal((await state()).supplierCalls,0);
  fs.writeFileSync(path.join(output,'ui-results.json'),JSON.stringify({status:'PASS',checks,errors,external,supplierCalls:0,actualComponents:true,fixtureCatalog:true,apiSubmissions:0},null,2));
  console.log('VIDEO_CAPABILITY_UI=PASS checks='+checks.length+' actual_react_controls=true desktop=1366 mobile=390 API_SUBMISSIONS=0 SUPPLIER_CALLS=0');
 }catch(error){await page.screenshot({path:path.join(output,'ui-failure.png'),fullPage:true});throw error;}finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
