'use strict';
/** Actual Next Canvas controls, crop/replace, scope navigation and undo/redo.
 * Existing loopback API fixture plus explicit local-edit reply adapter; real
 * pixels/PG/route validation is covered by the separate PG entrypoint. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),net=require('node:net'),{spawn,spawnSync}=require('node:child_process'),{chromium,expect:rawExpect}=require('@playwright/test');
const expect=rawExpect.configure({timeout:45000}),out=path.resolve(process.argv[2]||'output/canvas-local-image-edits-native');
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const p=await port(),next=await port(),base='http://127.0.0.1:'+p;
 const child=spawn(process.execPath,['scripts/serve-canvas-placement-fixture.cjs'],{env:{...process.env,CANVAS_FIXTURE_PORT:String(p),CANVAS_FIXTURE_NEXT_PORT:String(next),CANVAS_FIXTURE_HISTORY:'1',CANVAS_FIXTURE_TEXT_IMAGES:'1',CANVAS_FIXTURE_DIST:'.next-local-image-edits-fixture'},windowsHide:true,stdio:['ignore','pipe','pipe']}),log=fs.createWriteStream(path.join(out,'runtime.log'));child.stdout.pipe(log);child.stderr.pipe(log);
 let browser,page,arts,hold=false,release;const calls=[],checks=[],errors=[],outside=[];let failRead=false;
 const pass=s=>{checks.push(s);console.log('PASS '+s);};
 try{
  const deadline=Date.now()+180000;let ready=false;while(Date.now()<deadline){try{const r=await fetch(base+'/canvas');if(r.ok&&(await r.text()).includes('<html')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert.ok(ready);
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  await context.route('**/*',async route=>{
   const request=route.request(),u=new URL(request.url());if(!['127.0.0.1','localhost'].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol)){outside.push(u.origin);return route.abort();}
   if(u.pathname==='/api/canvas/workflow-import'&&request.method()==='GET')return json(route,{manifests:[],persisted:true});
   if(u.pathname==='/api/account'){const response=await route.fetch(),data=await response.json();arts||=data.artworks;return json(route,{...data,artworks:arts});}
   if(u.pathname==='/api/canvas/local-image-edit'){
    let body;if(request.headers()['content-type']?.includes('multipart/form-data')){const form=await new Request('http://fixture/upload',{method:'POST',headers:request.headers(),body:request.postDataBuffer()}).formData(),file=form.get('image');body={mode:'replace',id:form.get('id'),operationId:form.get('operationId'),file:{name:file.name,size:file.size,type:file.type}};}else body=request.postDataJSON();
    calls.push(body);if(hold)await new Promise(r=>{release=r;});const source=arts.find(a=>a.id===body.id),id='art-local-'+body.operationId;arts.push({...source,id,title:body.mode==='crop'?'裁剪结果':'替换结果',parentId:source.id,source:'canvas-local-edit',canvasX:source.canvasX+40,canvasY:source.canvasY+source.canvasHeight+48});return json(route,{ok:true,id});
   }
   if(u.pathname==='/api/artworks/get'){if(failRead)return json(route,{error:'fixture result read failed'},503);return json(route,{persisted:true,artworks:arts.filter(a=>!a.deletedAt&&(u.searchParams.get('ids')||'').split(',').includes(a.id))});}
   if(u.pathname==='/api/canvas/history'){const body=request.postDataJSON();for(const op of body.operations||[])if(op.type==='visibility'){const a=arts.find(a=>a.id===op.id);if(a)a.deletedAt=op.visible?null:new Date().toISOString();}return route.continue();}
   return route.continue();
  });
  await page.goto(base+'/canvas',{waitUntil:'domcontentloaded'});await expect(page.getByTestId('canvas-main-toolbar')).toBeVisible();const assistant=page.getByRole('button',{name:'收起助手',exact:true});if(await assistant.isVisible())await assistant.click();
  const node=id=>page.locator('.react-flow__node[data-id="'+id+'"]'),crop=page.getByRole('dialog',{name:'裁剪图片',exact:true});
  async function selectOriginal(){const close=page.getByRole('button',{name:'关闭创作栏',exact:true});if(await close.isVisible())await close.click();await node('placement-root').click({position:{x:100,y:110}});}
  async function openCrop(){await selectOriginal();await page.getByRole('button',{name:'裁剪图片',exact:true}).click();await expect(crop).toBeVisible();await crop.getByLabel('宽 %',{exact:true}).fill('50');await crop.getByLabel('高 %',{exact:true}).fill('80');}
  await openCrop();await page.screenshot({path:path.join(out,'crop-dialog.png')});failRead=true;await crop.getByRole('button',{name:'保存裁剪版本',exact:true}).click();await expect.poll(()=>calls.length).toBe(1);await expect(crop.getByRole('button',{name:'保存裁剪版本',exact:true})).toBeEnabled();await expect(page.getByTestId('canvas-artwork-load-error')).toContainText('作品同步失败');pass('KNOWN_RESULT_READ_FAILURE_RETAINS_ORIGINAL_CROP');
  failRead=false;await crop.getByRole('button',{name:'保存裁剪版本',exact:true}).click();const first='art-local-'+calls[0].operationId;await expect(crop).toHaveCount(0);await expect(node(first)).toBeVisible();assert.equal(calls.length,1);pass('ACTUAL_RETRY_READS_KNOWN_RESULT_ZERO_POSTS');
  await page.getByTestId('canvas-main-toolbar').locator('[data-tool="undo"]').click();await expect(node(first)).toHaveCount(0);await page.getByTestId('canvas-main-toolbar').locator('[data-tool="redo"]').click();await expect(node(first)).toBeVisible();await expect(node('placement-root')).toBeVisible();pass('ORIGINAL_HISTORY_UNDO_REDO_AND_ORIGINAL_IMAGE_RETAINED');
  await selectOriginal();const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'替换图片',exact:true}).click();await(await chooser).setFiles({name:'replacement.png',mimeType:'image/png',buffer:Buffer.from('fixture file; real pixels tested in PG')});await expect.poll(()=>calls.length).toBe(2);await expect(node('art-local-'+calls[1].operationId)).toBeVisible();assert.equal(calls[1].id,'placement-root');assert.equal(calls[1].mode,'replace');pass('NATIVE_FILE_CHOOSER_TARGET_AND_REQUEST_RETAINED');
  hold=true;await openCrop();await crop.getByLabel('宽 %',{exact:true}).fill('60');await crop.getByRole('button',{name:'保存裁剪版本',exact:true}).click();await expect.poll(()=>calls.length).toBe(3);
  // The crop modal is busy, so navigate using the browser's actual Back action
  // rather than invoking component callbacks or injecting application state.
  await page.goBack({waitUntil:'domcontentloaded'});await page.getByTitle('文字项目B',{exact:true}).click();await expect(node('text-project-b')).toBeVisible();release();hold=false;
  await expect.poll(()=>arts.some(a=>a.id==='art-local-'+calls[2].operationId)).toBe(true);await expect(page.getByRole('button',{name:'文字项目B',exact:true})).toBeVisible();await expect(node('text-project-b')).toBeVisible();await expect(crop).toHaveCount(0);assert.equal(calls.length,3);pass('LATE_A_RESULT_PRESERVES_B_PROJECT_VIEW');
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);await page.screenshot({path:path.join(out,'project-b-after-late-crop.png')});pass('PAGE_ERRORS_AND_EXTERNAL_REQUESTS_ZERO');
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,actualNext:true,reactHook:true,api:'LOOPBACK_FIXTURE_ADAPTER',pg:false,realSupplier:0,localEditPosts:calls,originalArtworksRetained:true,pageErrors:errors,externalRequests:outside},null,2)+'\n');console.log(`CANVAS_LOCAL_IMAGE_EDITS_NATIVE=PASS CHECKS=${checks.length} ACTUAL_NEXT=1 REACT_HOOK=1 CROP=1 REPLACE=1 KNOWN_RESULT_RETRY_POSTS=0 LATE_A_B_VIEW=RETAINED UNDO_REDO=1 PG=0 SUPPLIER=0 PAGE_ERRORS=0`);
 }catch(error){fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:error.stack,checks,errors,calls,body:await page?.locator('body').innerText().catch(()=>null)},null,2));await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
 finally{release?.();await browser?.close();if(child.exitCode===null&&child.signalCode===null){const q=spawnSync('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,encoding:'utf8'});fs.writeFileSync(path.join(out,'fixture-stop.log'),q.stdout+q.stderr);}log.end();}
})().catch(error=>{console.error(error);process.exitCode=1;});
