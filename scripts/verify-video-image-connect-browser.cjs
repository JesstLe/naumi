// Full actual Next/CanvasClient/ReactFlow, with project-aware HTTP responses.
// The A/B response shapes match the read-only mainland production evidence:
// default-space list omits personal-image projects; project-bound list includes
// them. Every mutation is intercepted locally; no production/supplier writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect:rawExpect}=require('@playwright/test');
const phase=process.argv[2]||'MODIFIED',base=process.env.VIDEO_CONNECT_FIXTURE_URL||'http://127.0.0.1:15480',out=path.resolve(process.env.VIDEO_CONNECT_EVIDENCE||'output/video-image-connect',phase+'-browser');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const original=await(await fetch(base+'/__fixture/state')).json(),project='tree:placement-root',defaultProject='tree:default-space';
 const image={...original.artworks[0],canvasX:100,canvasY:120,canvasWidth:320,canvasHeight:260};
 const defaultNode={...original.videos[0],id:'default-space-video',projectKey:defaultProject};
 const videos=[defaultNode],reads=[],writes=[],history=[],paid=[],errors=[],checks=[];let createdId,failHistory=false;
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),expect=rawExpect.configure({timeout:12000});page.setDefaultTimeout(20000);
 page.on('pageerror',e=>errors.push(e.stack||e.message));
 const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(!['localhost','127.0.0.1'].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol))return route.abort();
  if(u.pathname==='/api/account'){const r=await route.fetch(),data=await r.json();return json(route,{...data,artworks:[image]});}
  if(u.pathname==='/api/canvas/text-nodes')return json(route,{persisted:true,nodes:[]});
  if(u.pathname==='/api/canvas/workflow-import'&&req.method()==='GET')return json(route,{manifests:[]});
  if(u.pathname==='/api/canvas/video-nodes'){
   if(req.method()==='GET'){
    const bound=req.headers()['x-naumi-project-context'];reads.push({project:bound||null});
    return json(route,{ok:true,nodes:videos.filter(n=>n.projectKey===(bound||defaultProject))});
   }
   const body=req.postDataJSON();assert.equal(body.expectedRevision,0);assert.equal(body.projectKey,project);
   const node={...body,revision:1,lastTaskId:null,lastResultId:null,displayResultId:null,deletedAt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};videos.push(node);writes.push(body);createdId=node.id;return json(route,{ok:true,node},201);
  }
  if(u.pathname.startsWith('/api/canvas/video-nodes/')&&req.method()==='PATCH'){
   const body=req.postDataJSON(),node=videos.find(n=>n.id===body.id);if(!node)return json(route,{error:'missing'},404);
   if(body.expectedRevision!==node.revision)return json(route,{error:'revision conflict',code:'VIDEO_NODE_REVISION_CONFLICT'},409);
   Object.assign(node,body,{revision:node.revision+1,updatedAt:new Date().toISOString()});writes.push(body);return json(route,{ok:true,node});
  }
  if(u.pathname==='/api/canvas/history'){
   const body=req.postDataJSON();history.push(body);if(failHistory){failHistory=false;return json(route,{error:'fixture save rejected'},409);}
   const updated=[];for(const op of body.operations){const node=videos.find(n=>n.id===op.id);if(node&&op.type==='video-patch'){if(op.expectedRevision!==node.revision)return json(route,{error:'revision conflict'},409);Object.assign(node,op.fields,{revision:node.revision+1,updatedAt:new Date().toISOString()});updated.push(node);}}
   return json(route,{ok:true,persisted:true,nativeNodes:{videoNodes:updated,directorNodes:[],characterNodes:[],sceneNodes:[],audioNodes:[],timelineNodes:[]},artworkNodes:[],artworkIds:[],textNodes:[]});
  }
  if(['/api/video/generate','/api/imagegen','/api/generate-image'].includes(u.pathname)||u.pathname.endsWith('/generate')){paid.push(u.pathname);return json(route,{error:'NO_GENERATION_IN_CONNECTION_TEST'},500);}
  return route.continue();
 });
 const pass=name=>{checks.push(name);console.log('PASS '+name)},node=id=>page.locator(`.react-flow__node[data-id="${id}"]`);
 async function connect(){
  await node(image.id).hover();
  const a=await node(image.id).locator('.react-flow__handle-right').boundingBox(),b=await node(createdId).locator('.react-flow__handle-left').boundingBox();assert.ok(a&&b);
  const hits=await page.evaluate(({a,b})=>[a,b].map(r=>document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.className),{a,b});
  assert.ok(hits.every(hit=>typeof hit==='string'&&hit.includes('react-flow__handle')),'Connection endpoints must be real unobscured handles: '+JSON.stringify(hits));
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:18});await page.mouse.up();
 }
 try{
  await page.goto(base+'/canvas',{waitUntil:'domcontentloaded',timeout:120000});await node(image.id).waitFor({timeout:90000});
  const collapse=page.getByRole('button',{name:'收起助手',exact:true});if(await collapse.isVisible())await collapse.click();
  await page.mouse.click(980,480,{button:'right'});await page.getByTestId('canvas-context-menu').getByRole('menuitem',{name:'添加节点',exact:true}).click();
  await page.getByTestId('canvas-node-type-menu').locator('[data-action="video-node"]').click();
  await expect.poll(()=>createdId).toBeTruthy();await node(createdId).waitFor();pass('new_video_is_created_in_uploaded_image_project');
  await page.keyboard.press('Escape');
  // A periodic refresh is the production failure trigger. Observe a real next
  // GET rather than a fixed sleep or synthetic removal from ReactFlow.
  const before=reads.length;await expect.poll(()=>reads.length,{timeout:15000}).toBeGreaterThan(before);
  await expect(node(createdId)).toHaveCount(1);pass('periodic_refresh_keeps_new_video_visible');
  failHistory=true;await connect();await page.getByText('fixture save rejected',{exact:true}).waitFor();
  assert.equal(videos.find(n=>n.id===createdId).inputs.length,0);assert.equal(videos.find(n=>n.id===createdId).config.mode,'text');await expect(node(createdId)).toHaveCount(1);pass('rejected_connection_keeps_video_without_half_saved_inputs_or_mode');
  await connect();await expect.poll(()=>videos.find(n=>n.id===createdId)?.inputs.length).toBe(1);pass('actual_wire_is_saved_once_and_original_identity_is_retained');
  const linkedRead=reads.length;await expect.poll(()=>reads.length,{timeout:15000}).toBeGreaterThan(linkedRead);
  await expect(node(createdId)).toHaveCount(1);pass('periodic_refresh_keeps_connected_video_visible');
  const current=videos.find(n=>n.id===createdId);assert.equal(current.config.mode,'single_image');assert.equal(current.inputs[0].role,'first_frame');pass('wire_atomically_persists_image_mode_without_open_composer');
  await page.reload({waitUntil:'domcontentloaded'});await expect(node(createdId)).toHaveCount(1);pass('reload_immediately_restores_original_connected_video');
  await node(createdId).click({position:{x:80,y:12}});const dock=page.getByTestId('video-node-dock');await expect(dock).toBeVisible();
  await expect(dock).toContainText('图生视频');await expect(dock.getByText('文生视频不能带媒体参考',{exact:true})).toHaveCount(0);pass('restored_editor_contains_image_and_compatible_mode');
  const field=dock.getByLabel('视频描述',{exact:true});await field.fill('保留参考主体，镜头缓慢推进。');await dock.getByRole('button',{name:'保存设置',exact:true}).click();
  await expect.poll(()=>videos.find(n=>n.id===createdId).config.prompt).toBe('保留参考主体，镜头缓慢推进。');pass('editing_after_recovery_uses_real_revision_and_preserves_input');
  await page.reload({waitUntil:'domcontentloaded'});await expect(node(createdId)).toHaveCount(1);await node(createdId).click({position:{x:80,y:12}});await expect(dock.getByLabel('视频描述',{exact:true})).toHaveText('保留参考主体，镜头缓慢推进。');assert.equal(videos.find(n=>n.id===createdId).inputs[0].nodeId,image.id);pass('second_reload_restores_saved_edit_and_original_image_input');
  await page.screenshot({path:path.join(out,'connected-video.png')});await page.setViewportSize({width:390,height:844});await expect(node(createdId)).toBeAttached();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));pass('mobile_canvas_and_editor_remain_available');
  assert.deepEqual(errors,[]);assert.equal(paid.length,0);assert.ok(reads.some(read=>read.project===project));
  const literal=`VIDEO_IMAGE_CONNECT_BROWSER=PASS CHECKS=${checks.length} PHASE=${phase} FULL_NEXT_REACTFLOW=1 PAID_POSTS=0`;
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({literal,checks,reads,writes,history,errors,paid},null,2));console.log(literal);
 }catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:error.stack,checks,reads,writes,history,errors,paid,visibleNodes:await page.locator('.react-flow__node').evaluateAll(ns=>ns.map(n=>n.dataset.id))},null,2));console.error(`VIDEO_IMAGE_CONNECT_BROWSER=FAIL CHECKS=${checks.length} PHASE=${phase} FULL_NEXT_REACTFLOW=1 PAID_POSTS=${paid.length}`);throw error;}
 finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
