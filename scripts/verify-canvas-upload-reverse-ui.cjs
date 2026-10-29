// Full Next CanvasClient with loopback API fixtures, no DB/supplier side effects.
const {chromium}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp'),crypto=require('node:crypto');
const base=process.env.CANVAS_UPLOAD_REVERSE_URL||'http://127.0.0.1:18071',out=path.resolve(process.env.CANVAS_UPLOAD_REVERSE_OUT||'output/canvas-upload-reverse-ui');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1600,height:1100}}),page=await context.newPage();
 const checks=[],errors=[],external=[],requests=[],posts=[],pending=[],original='placement-root',now=new Date().toISOString(),allArts=new Map();let hold=true,arts,texts=[],deleteRequests=0;
 const image=await sharp({create:{width:320,height:220,channels:3,background:'#92bdc8'}}).png().toBuffer();const fixture=path.join(out,'input.png');fs.writeFileSync(fixture,image);
 const version=crypto.createHash('sha256').update(image).digest('hex');page.on('pageerror',e=>errors.push(e.message));
 const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());
   if(!['127.0.0.1','localhost'].includes(u.hostname)&&!['blob:','data:'].includes(u.protocol)){external.push(u.origin);return route.abort();}
   if(u.pathname==='/api/media/image-cache'){const sources=req.postDataJSON().sources,account='placement-fixture@example.test';return json(route,{account,results:Object.fromEntries(sources.map(source=>[source,{source,account,version,fetchUrl:source,bytes:image.length,contentType:'image/png'}]))});}
   if(u.pathname.startsWith('/media/reverse-'))return route.fulfill({contentType:'image/png',body:image});
   if(u.pathname==='/api/account'){
     const response=await route.fetch(),data=await response.json();if(!arts)arts=Array.from({length:5},(_,i)=>({...data.artworks[0],id:i?'image-'+i:original,title:'素材 '+(i+1),parentId:i?original:null,image:'/media/reverse-'+i+'.png',width:320,height:220,canvasWidth:240,canvasHeight:165,canvasX:100+(i%3)*420,canvasY:100+Math.floor(i/3)*330}));return json(route,{...data,artworks:arts});
   }
   if(u.pathname==='/api/canvas/text-nodes'){
     if(req.method()==='POST'){const node=req.postDataJSON();posts.push(node);texts=texts.filter(n=>n.id!==node.id);texts.push({...node,updatedAt:new Date().toISOString()});return json(route,{persisted:true,node:texts.at(-1)});}
     return json(route,{persisted:true,nodes:texts});
   }
   if(['/api/canvas/video-nodes','/api/canvas/director-nodes','/api/canvas/character-nodes','/api/canvas/scene-nodes','/api/canvas/audio-nodes','/api/canvas/timeline-nodes'].includes(u.pathname))return json(route,{persisted:true,nodes:[]});
   if(u.pathname==='/api/canvas/text-generate'){
     const input=req.postDataJSON();requests.push(input);
     if(hold)await new Promise(r=>pending.push(r));
     const id=input.sourceIds[0],index=id===original?0:Number(id.split('-')[1]);
     if(index===2)return json(route,{error:'测试模型暂不可用'},503);
     return json(route,{text:index===3?'   ':`素材${index+1}的真实反推结果：保持主体与构图。`,model:'fixture-text'});
   }
   if(u.pathname==='/api/media/uploads')return json(route,{enabled:false});
   if(u.pathname==='/api/artworks/add'&&req.method()==='POST'){
     const form=await new Request('http://fixture/upload',{method:'POST',headers:{'content-type':req.headers()['content-type']},body:req.postDataBuffer()}).formData();
     const id='upload-'+arts.filter(a=>a.id.startsWith('upload-')).length,root=form.get('parentId')||null;
     const artwork={...arts[0],id,title:String(form.get('title')||'新上传'),parentId:root,groupId:root||id,image:'/media/reverse-upload.png',canvasX:Number(form.get('x')),canvasY:Number(form.get('y')),createdAt:new Date().toISOString()};arts.push(artwork);allArts.set(id,artwork);return json(route,{id,ok:true});
   }
   if(u.pathname==='/api/canvas/nodes/delete'){deleteRequests++;const body=req.postDataJSON();arts=arts.filter(a=>!body.artworkIds.includes(a.id));texts=texts.filter(n=>!body.textIds.includes(n.id));return json(route,{ok:true,persisted:true});}
   if(u.pathname==='/api/canvas/history'){for(const op of req.postDataJSON().operations||[]){if(op.type==='visibility'){arts=arts.filter(a=>a.id!==op.id);if(op.visible)arts.push(allArts.get(op.id));}}return json(route,{ok:true,persisted:true});}
   if(u.pathname==='/api/artworks/get')return json(route,{artworks:arts.filter(a=>(u.searchParams.get('ids')||'').split(',').includes(a.id))});
   return route.continue();
 });
 try{
   await page.goto(base+'/canvas',{waitUntil:'domcontentloaded',timeout:180000});await page.locator('.react-flow__node[data-id="placement-root"]').waitFor({timeout:120000});
   await page.locator('.react-flow__pane').click({position:{x:10,y:200}});
   await page.keyboard.down('Shift');
   for(const id of ['placement-root','image-1','image-2','image-3','image-4'])await page.locator(`.react-flow__node[data-id="${id}"]`).click({position:{x:30,y:45}});
   await page.keyboard.up('Shift');
   const reverse=page.getByRole('button',{name:'反推提示词',exact:true}).filter({visible:true});await reverse.last().click();
   await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node-text').length===5);assert.equal(requests.length,2);
   checks.push('REAL_MULTISELECT_CREATES_ALL_FIVE_ORDERED_PLACEHOLDERS_BEFORE_TWO_REQUESTS_COMPLETE');
   await page.locator('.react-flow__pane').click({position:{x:10,y:200}});await page.locator('.react-flow__node-text').nth(2).click({position:{x:20,y:20}});await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Delete');
   assert.equal(await page.locator('.react-flow__node-text').count(),5);assert.equal(deleteRequests,0);assert.equal(requests.length,2);checks.push('QUEUED_REVERSE_SLOT_DELETE_DOES_NOT_CANCEL_OR_RECREATE_AN_ACCEPTED_BATCH');
   hold=false;pending.splice(0).forEach(r=>r());
   await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node-text [role=alert]').length===2);
   for(let i=0;i<100&&posts.length<5;i++)await new Promise(r=>setTimeout(r,30));assert.equal(posts.length,5);assert.equal(texts.filter(n=>n.status==='completed').length,3);assert.equal(texts.filter(n=>n.status==='failed').length,2);assert.ok(texts.filter(n=>n.status==='failed').every(n=>n.error&&n.content===''&&n.prompt===''));
   assert.equal(new Set(texts.map(n=>n.sourceIds[0])).size,5);assert.equal(requests.length,5);checks.push('THREE_SUCCESSES_TWO_READABLE_FAILURES_NO_BLANK_SUCCESS_OR_DUPLICATE_CALL');
   await page.screenshot({path:path.join(out,'reverse-results.png')});
   await page.reload({waitUntil:'domcontentloaded'});await page.locator('.react-flow__node-text [role=alert]').first().waitFor({timeout:60000});assert.equal(await page.locator('.react-flow__node-text [role=alert]').count(),2);assert.equal(await page.getByText('测试模型暂不可用',{exact:true}).count(),1);checks.push('RELOAD_PRESERVES_FAILED_STATUS_AND_EXACT_REASON');
   await page.getByTestId('canvas-project-chrome').locator('button').first().click();await page.getByRole('button',{name:'创建新项目',exact:true}).first().click();
   await page.getByTestId('canvas-image-input').setInputFiles(fixture);await page.locator('.react-flow__node[data-id="upload-0"]').waitFor({timeout:60000});
   assert.equal(arts.find(a=>a.id==='upload-0').parentId,null);assert.equal(await page.locator('.react-flow__node[data-id="placement-root"]').count(),0);
   await page.waitForFunction(()=>{const i=document.querySelector('.react-flow__node[data-id="upload-0"] img');return i?.complete&&i.naturalWidth>0});
   checks.push('NEW_EMPTY_PROJECT_UPLOAD_IS_VISIBLE_WITHOUT_RELOAD');await page.screenshot({path:path.join(out,'new-project-upload.png')});
   await page.locator('[data-tool="image-node"]').click();const slot=page.locator('.react-flow__node[data-id^="pend-"]');await slot.waitFor();
   const choosing=page.waitForEvent('filechooser');await slot.getByRole('button',{name:'上传图片',exact:true}).click();await (await choosing).setFiles(fixture);
   await page.locator('.react-flow__node[data-id="upload-1"]').waitFor({timeout:60000});assert.equal(await slot.count(),0);await page.evaluate(()=>document.activeElement?.blur());
   await page.keyboard.press('Control+z');await page.locator('.react-flow__node[data-id="upload-1"]').waitFor({state:'detached'});await page.keyboard.press('Control+z');await page.locator('.react-flow__node[data-id="upload-0"]').waitFor({state:'detached'});
   await page.keyboard.press('Control+y');await page.locator('.react-flow__node[data-id="upload-0"]').waitFor();await page.keyboard.press('Control+y');await page.locator('.react-flow__node[data-id="upload-1"]').waitFor();assert.equal(await slot.count(),0);checks.push('EMPTY_SLOT_UPLOAD_UNDO_TWICE_REDO_TWICE_HAS_NO_GHOST_SLOT');
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);checks.push('NO_PAGEERROR_OR_EXTERNAL_SUPPLIER_REQUEST');
   fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({result:'PASS',checks,errors,external,requests,posts,supplierCalls:0},null,2));console.log(`CANVAS_UPLOAD_REVERSE_UI=PASS CHECKS=${checks.length} FULL_NEXT=1 SUPPLIER_CALLS=0`);
 }catch(e){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({error:e.stack,checks,errors,requests,posts,body:await page.locator('body').innerText()},null,2));throw e;}
 finally{pending.splice(0).forEach(r=>r());await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
