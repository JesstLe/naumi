// Actual Next Canvas and native browser codecs; upload/read endpoints are scoped fixtures.
import {chromium,expect as rawExpect} from '@playwright/test';
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';import {createHash} from 'node:crypto';
const baseline=process.argv.includes('--baseline'),base=process.env.CANVAS_FIXTURE_URL||'http://127.0.0.1:14492',out=path.resolve(process.env.IMAGE_UX_EVIDENCE||'output/canvas-image-ux-20261120/browser');
assert.equal(new URL(base).hostname,'127.0.0.1');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true}),context=await browser.newContext({viewport:{width:1600,height:1100},reducedMotion:'reduce',acceptDownloads:true});
await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);const page=await context.newPage(),errors=[],checks=[],uploads=[],records=[],bytes=new Map();page.on('pageerror',e=>errors.push(e.message));
const expect=rawExpect.configure({timeout:30000}),hash=b=>createHash('sha256').update(b).digest('hex'),pass=name=>{checks.push(name);console.log('PASS '+name);};
let failRename=false,lockRoot=false;
const raw=Buffer.alloc(640*480*4);for(let i=0;i<640*480;i++){raw[i*4]=(i*17)%256;raw[i*4+1]=(i*29+Math.floor(i/640)*7)%256;raw[i*4+2]=(i*43)%256;raw[i*4+3]=i%640<40?0:255;}
const original=await sharp(raw,{raw:{width:640,height:480,channels:4}}).png({compressionLevel:0}).toBuffer();
const state=()=>fetch(base+'/__fixture/state').then(r=>r.json()),node=id=>page.locator(`.react-flow__node[data-id="${id}"]`);
await page.route('**/*',async route=>{
 const request=route.request(),u=new URL(request.url());if(u.origin!==base)return route.abort();
 if(u.pathname==='/demos/suite-demo/suppl-src.png')return route.fulfill({contentType:'image/png',body:original});
 if(u.pathname.startsWith('/__ux/'))return route.fulfill({contentType:'image/png',body:bytes.get(u.pathname)||original});
 if(u.pathname==='/api/download')return route.fulfill({contentType:'image/png',body:original});
 if(u.pathname==='/api/media/uploads')return route.fulfill({json:{enabled:false}});
 if(u.pathname==='/api/canvas/workflow-import')return route.fulfill({json:{manifests:[],persisted:true}});
 if(u.pathname==='/api/canvas/node-settings'&&lockRoot)return route.fulfill({json:{persisted:true,settings:{'placement-root':{locked:true}}}});
 if(u.pathname==='/api/canvas/history'&&request.method()==='POST'&&failRename)return route.fulfill({status:503,json:{error:'标题保存暂时失败，请重试'}});
 if(u.pathname==='/api/artworks/add'){
  const form=await new Request(request.url(),{method:'POST',headers:request.headers(),body:request.postDataBuffer()}).formData(),image=form.get('image'),buffer=Buffer.from(await image.arrayBuffer()),meta=await sharp(buffer).metadata(),id='ux-import-'+(uploads.length+1),url='/__ux/'+id+'.png';
  uploads.push({id,name:image.name,hash:hash(buffer),x:Number(form.get('x')),y:Number(form.get('y')),group:form.get('canvasGroupId')});bytes.set(url,buffer);
  records.push({id,title:String(form.get('title')||image.name),image:base+url,category:'main',status:'completed',origin:'canvas',source:'canvas-add',createdAt:new Date().toISOString(),parentId:form.get('parentId'),canvasGroupId:form.get('canvasGroupId'),width:meta.width,height:meta.height,canvasX:Number(form.get('x')),canvasY:Number(form.get('y'))});
  return route.fulfill({json:{id}});
 }
 if(u.pathname==='/api/artworks/get'&&records.length){const response=await route.fetch(),data=await response.json(),ids=(u.searchParams.get('ids')||'').split(',');return route.fulfill({json:{...data,artworks:[...(data.artworks||[]),...records.filter(a=>ids.includes(a.id))]}});}
 return route.continue();
});
try{
 await fetch(base+'/__fixture/reset');await page.goto(base+'/canvas',{waitUntil:'domcontentloaded',timeout:120000});await expect(node('placement-root')).toBeVisible({timeout:120000});
 const agent=page.getByRole('button',{name:'收起助手',exact:true});if(await agent.isVisible())await agent.click();
 await page.screenshot({path:path.join(out,'INITIAL.png')});
 const empty=await page.locator('.react-flow__pane').evaluate(el=>{const r=el.getBoundingClientRect();for(let y=.55;y<.9;y+=.1)for(let x=.55;x<.95;x+=.1){const p={x:r.left+r.width*x,y:r.top+r.height*y};if(document.elementFromPoint(p.x,p.y)===el)return p;}throw Error('no empty canvas point');});
 const beforeCount=await page.locator('.react-flow__node[data-id^="pend-"]').count();
 if(baseline){await page.mouse.dblclick(empty.x,empty.y);assert.equal(await page.locator('.react-flow__node[data-id^="pend-"]').count(),beforeCount);pass('BASELINE empty double click does not create node');}
 else{
  const menu=page.getByTestId('canvas-context-menu'),types=page.getByTestId('canvas-node-type-menu');
  const items=locator=>locator.getByRole('menuitem').evaluateAll(els=>els.map(el=>({label:el.textContent.trim(),disabled:el.disabled})));
  await page.mouse.click(empty.x,empty.y,{button:'right'});await expect(menu).toBeVisible();const rightItems=await items(menu),rightBox=await menu.boundingBox();
  await menu.getByRole('menuitem',{name:'添加节点',exact:true}).hover();await expect(types).toBeVisible();const rightTypes=await items(types);
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);
  await page.mouse.dblclick(empty.x,empty.y);assert.equal(await page.locator('.react-flow__node[data-id^="pend-"]').count(),beforeCount,'opening the double-click menu must not create a node');await expect(menu).toBeVisible();assert.deepEqual(await items(menu),rightItems,'double click and right click share ordered actions/disabled states');
  const doubleBox=await menu.boundingBox();assert.ok(Math.abs(doubleBox.x-rightBox.x)<=1&&Math.abs(doubleBox.y-rightBox.y)<=1,'same screen anchor');
  await menu.getByRole('menuitem',{name:'添加节点',exact:true}).hover();await expect(types).toBeVisible();assert.deepEqual(await items(types),rightTypes,'identical node choices and availability');await page.screenshot({path:path.join(out,'DOUBLE_CLICK_MENU.png')});
  await types.getByRole('menuitem',{name:'图片',exact:true}).click();await expect(menu).toHaveCount(0);await expect(page.locator('.react-flow__node[data-id^="pend-"]')).toHaveCount(beforeCount+1);
  await page.getByTestId('canvas-main-toolbar').locator('[data-tool=undo]').click();await expect(page.locator('.react-flow__node[data-id^="pend-"]')).toHaveCount(beforeCount);pass('double click equals right-click menu/actions/anchor; only a menu choice creates a node, undo retained');
 }
 if(!baseline){
  await page.getByTestId('canvas-main-toolbar').locator('[data-tool=hand]').click();
  const point=await page.locator('.react-flow__pane').evaluate(el=>{const r=el.getBoundingClientRect();for(let y=.55;y<.9;y+=.1)for(let x=.55;x<.95;x+=.1){const p={x:r.left+r.width*x,y:r.top+r.height*y};if(document.elementFromPoint(p.x,p.y)===el)return p;}throw Error('no blank point');});
  const transform=await page.locator('.react-flow__viewport').getAttribute('style');await page.mouse.dblclick(point.x,point.y);await expect.poll(()=>page.locator('.react-flow__viewport').getAttribute('style')).not.toBe(transform);assert.equal(await page.locator('.react-flow__node[data-id^="pend-"]').count(),beforeCount);await page.getByTestId('canvas-main-toolbar').locator('[data-tool=move]').click();pass('hand-tool double click keeps navigation zoom and creates no node');
 }
 // Reload resets the baseline double-click zoom, leaving identical initial views.
 await page.reload({waitUntil:'domcontentloaded'});await expect(node('placement-root')).toBeVisible();
 const title=node('placement-root').locator('.art-title').getByTestId('image-node-title');
 if(baseline){await node('placement-root').locator('.art-title span.nodrag').dblclick();assert.equal(await page.getByTestId('image-title-input').count(),0);await page.keyboard.press('Escape');pass('BASELINE title uses outside floating editor, not node-local input');}
 else{
  await title.dblclick();const input=node('placement-root').getByTestId('image-title-input');await expect(input).toBeFocused();await input.fill('主图 · 已改名');await input.dblclick();await expect(input).toHaveValue('主图 · 已改名');await page.screenshot({path:path.join(out,'TITLE_EDIT.png')});await input.press('Enter');await expect(title).toHaveText('主图 · 已改名');
  await title.dblclick();await input.fill('不应保存');await input.press('Escape');await expect(title).toHaveText('主图 · 已改名');
  assert.equal(await page.locator('[data-testid=lightbox]').count(),0);pass('title double click edits in place; Enter saves, Escape cancels without opening image');
  await page.getByTestId('canvas-main-toolbar').locator('[data-tool=undo]').click();await expect(title).toHaveText('主图');pass('title rename retains existing undo history');
 }
 await node('placement-root').click({position:{x:80,y:100}});const compress=page.getByTestId('image-node-toolbar').locator('[data-action=compress]');
 let compression;
 if(baseline){assert.equal(await compress.count(),0);pass('BASELINE no explicit compressed-copy action');}
 else{
  const before=(await state()).artworks.find(a=>a.id==='placement-root'),downloadPromise=page.waitForEvent('download');await compress.click();const download=await downloadPromise,file=path.join(out,download.suggestedFilename());await download.saveAs(file);
  const buffer=await fs.readFile(file),meta=await sharp(buffer).metadata(),pixel=await sharp(buffer).ensureAlpha().raw().toBuffer();assert.ok(buffer.length<original.length*.92);assert.equal(meta.format,'webp');assert.equal(meta.width,640);assert.equal(meta.height,480);assert.equal(pixel[3],0);assert.deepEqual((await state()).artworks.find(a=>a.id==='placement-root'),before);
  compression={originalBytes:original.length,compressedBytes:buffer.length,sourceHash:hash(original),downloadHash:hash(buffer),width:meta.width,height:meta.height,alphaRetained:true};pass('real downloaded WebP is smaller, same pixels dimensions/alpha; original artwork unchanged');
  await page.screenshot({path:path.join(out,'NODE_TOOLS.png')});
 }
 const close=page.getByRole('button',{name:'关闭创作栏',exact:true});if(await close.isVisible())await close.click();
 const dimensions=[[640,320],[240,720],[420,420],[200,640],[900,300]],files=[];
 for(let i=0;i<dimensions.length;i++){const [width,height]=dimensions[i];files.push({name:`图片-${i+1}.png`,mimeType:'image/png',buffer:await sharp({create:{width,height,channels:4,background:['#b8d9e5','#d3b8e5','#b8e5ca','#e5d4b8','#b8c8e5'][i]}}).png().toBuffer()});}
 await page.getByTestId('canvas-image-input').setInputFiles(files);await expect.poll(()=>uploads.length).toBe(5);for(const row of records)await expect(node(row.id)).toHaveCount(1);
 assert.deepEqual(uploads.map(u=>u.hash),files.map(f=>hash(f.buffer)));const aligned=uploads[1].x===uploads[4].x;
 assert.equal(aligned,!baseline,'column anchors shared across rows');assert.equal(uploads[0].x,uploads[3].x);assert.equal(uploads[0].y,uploads[2].y);assert.equal(uploads[3].y,uploads[4].y);assert.equal(new Set(uploads.map(u=>u.group)).size,1);pass(baseline?'BASELINE mixed-aspect imports have misaligned columns':'five mixed-aspect originals import in an aligned grid with original bytes and grouping');
 await page.getByTestId('canvas-import-locate').last().click();await page.getByTestId('canvas-view-toolbar').locator('button').nth(3).click();await page.waitForTimeout(600);for(const row of records)await expect(node(row.id)).toBeVisible();await page.screenshot({path:path.join(out,'IMPORTED_GRID.png')});
 if(!baseline){
  lockRoot=true;await page.reload({waitUntil:'domcontentloaded'});await expect(node('placement-root').getByLabel('节点已锁定')).toBeVisible();await node('placement-root').getByTestId('image-node-title').dblclick();assert.equal(await page.getByTestId('image-title-input').count(),0);pass('locked title cannot enter edit mode');
  lockRoot=false;await page.reload({waitUntil:'domcontentloaded'});await expect(node('placement-root')).toBeVisible();
  failRename=true;await node('placement-root').getByTestId('image-node-title').dblclick();const draft=node('placement-root').getByTestId('image-title-input');await draft.fill('失败后保留的名称');await draft.press('Enter');await expect(draft).toHaveAttribute('aria-invalid','true');await expect(draft).toHaveValue('失败后保留的名称');await expect(node('placement-root').getByRole('alert')).toBeVisible();await page.screenshot({path:path.join(out,'RENAME_FAILURE.png')});pass('rename failure keeps draft and displays unclipped local error');
 }
 assert.deepEqual(errors,[]);assert.equal((await state()).paidCalls,0);
 await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',mode:baseline?'BASELINE':'MODIFIED',checks,uploads,compression,errors,actualNext:true,api:'local fixtures',productionCalls:0},null,2));
 console.log(`CANVAS_IMAGE_UX_BROWSER=${baseline?'BASELINE_REPRODUCED':'PASS'} CHECKS=${checks.length} ACTUAL_NEXT=1 ORIGINALS=UNCHANGED SUPPLIER=0`);
}catch(error){await page.screenshot({path:path.join(out,'FAILURE.png')}).catch(()=>{});await fs.writeFile(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),checks,errors,uploads,body:await page.locator('body').innerText().catch(()=>'' )},null,2));throw error;}
finally{await browser.close();}
