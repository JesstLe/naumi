// Full Next CanvasClient clicks; local API/media fixture only, no supplier calls.
const {chromium}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const base=process.env.CANVAS_ISSUES_UI_URL||'http://127.0.0.1:18071',out=path.resolve(process.env.CANVAS_ISSUES_EVIDENCE||'output/reported-tools-ui');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const bytes=await sharp({create:{width:768,height:1024,channels:3,background:'#c8d7c1'}}).composite([{input:Buffer.from('<svg width="768" height="1024"><rect x="270" y="350" width="228" height="370" rx="45" fill="#fcf8ec"/><circle cx="384" cy="490" r="69" fill="#5c8c76"/><text x="384" y="510" font-size="58" text-anchor="middle" fill="white">N</text></svg>')}]).png().toBuffer(),version=crypto.createHash('sha256').update(bytes).digest('hex');
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1600,height:1100}}),page=await context.newPage();
 const checks=[],errors=[],external=[],quotes=new Map(),calls=[],jobs=new Map(),imageTasks=[],textPlans=[];let arts,user,sequence=0;
 let texts=[{id:'text-tool-source',projectKey:'tree:placement-root',title:'纯文本生图',prompt:'一只蝴蝶停在蓝色花朵上',content:'一只蝴蝶停在蓝色花朵上',status:'completed',sourceIds:[],targetIds:[],productIds:[],canvasX:0,canvasY:300,width:300,height:200,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}];
 const json=(route,value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
 const model={id:'gpt-image-2',label:'图片模型',modality:'image',supportsEdit:true,qualities:['medium'],nativeResolutions:['1K'],generationParameters:{ratios:['auto','1:1','3:4','16:9'],resolutions:['1K']},qualitySupported:true};
 const result=(label)=>{const id='fixture-result-'+(++sequence),a={...arts[0],id,title:label,image:'/media/tools-result-'+sequence+'.png',parentId:'placement-root',parentIds:['placement-root'],source:'generate',canvasX:undefined,canvasY:undefined,createdAt:new Date().toISOString()};arts.push(a);return a};
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url()),p=u.pathname;
  if(!['127.0.0.1','localhost'].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol)){external.push(u.origin);return route.abort();}
  if(p==='/api/account'){const response=await route.fetch(),data=await response.json();user=data.user;arts??=[{...data.artworks[0],title:'工具链路验证',prompt:'保留产品主体',image:'/media/tools-original.png',width:768,height:1024,canvasWidth:270,canvasHeight:360,canvasX:400,canvasY:300}];return json(route,{...data,artworks:arts});}
  if(p==='/api/canvas/video-nodes')return json(route,{nodes:[],persisted:true});
  if(p==='/api/canvas/text-nodes'){if(request.method()==='POST'){const b=request.postDataJSON();texts=texts.map(n=>n.id===b.id?{...n,...b}:n)}return json(route,{nodes:texts,node:texts[0],persisted:true});}
  if(p==='/api/models'){const feature=u.searchParams.get('feature'),text=['canvas.ocr','canvas.text-generate','canvas.assistant'].includes(feature);return json(route,{managed:true,supported:true,available:true,feature,version:152,models:[text?{id:'gpt6Astra',label:'文字识别模型',modality:'text',supportsVision:true}:model],defaultModelId:text?'gpt6Astra':model.id});}
  if(p==='/api/billing/catalog'){const response=await route.fetch(),b=await response.json();for(const feature of ['canvas.ocr','canvas.text-edit','canvas.annotate'])b.features[feature]={label:feature,enabled:true,unit:'image',prices:{medium:{'1K':0}}};return json(route,b);}
  if(p==='/api/billing/quote'){const body=request.postDataJSON(),id='q-'+quotes.size;quotes.set(id,{workspace:request.headers()['x-naumi-workspace'],project:request.headers()['x-naumi-project-context'],feature:body.feature});return json(route,{...body,modelId:body.modelId||(body.feature==='canvas.ocr'?'gpt6Astra':model.id),credits:0,reserveCredits:0,version:1,modelVersion:152,quote:{id}});}
  if(p==='/api/media/image-cache'){const sources=request.postDataJSON().sources,account='placement-fixture@example.test';return json(route,{account,results:Object.fromEntries(sources.map(source=>[source,{source,account,version,fetchUrl:source,bytes:bytes.length,contentType:'image/png'}]))});}
  if(p.startsWith('/media/tools-'))return route.fulfill({contentType:'image/png',body:bytes});
  if(p==='/api/artworks/get')return json(route,{artworks:arts.filter(a=>(u.searchParams.get('ids')||'').split(',').includes(a.id))});
  if(p==='/api/artworks/position'){const body=request.postDataJSON(),a=arts.find(a=>a.id===body.id);if(a){a.canvasX=body.x;a.canvasY=body.y}return json(route,{ok:true});}
  if(['/api/cutout','/api/canvas/expand','/api/canvas/annotate','/api/canvas/ocr','/api/canvas/image-tasks','/api/generate-image'].includes(p)&&request.method()==='POST'){
   const headers=request.headers(),quote=quotes.get(headers['x-naumi-image-quote']);calls.push({path:p,quote,workspace:headers['x-naumi-workspace'],project:headers['x-naumi-project-context'],model:headers['x-naumi-feature-model']});
   if(!quote||quote.project!==headers['x-naumi-project-context']||quote.workspace!==headers['x-naumi-workspace'])return json(route,{error:'本次报价凭据与账号或工作空间不符',accepted:false},400);
   if(p==='/api/canvas/ocr')return json(route,{engine:'fixture-vision',image:{width:768,height:1024},segments:[{id:'text-1',text:'N',confidence:.99,box:{x:350,y:450,width:68,height:72}}]});
   const art=result(p.split('/').pop());if(p==='/api/generate-image'){const jobId='fixture-job-'+sequence;jobs.set(jobId,art);return json(route,{jobId});}
   if(p==='/api/canvas/image-tasks'){const body=request.postDataJSON(),task={id:'image-edit-'+sequence,kind:'text-edit',sourceArtworkId:'placement-root',status:'completed',progress:100,resultArtworkId:art.id,parameters:body};imageTasks.push(task);return json(route,{taskId:task.id,task},202);}
   return json(route,{id:art.id,image:art.image,user});
  }
  if(p==='/api/canvas/image-tasks')return json(route,{tasks:imageTasks});
  if(p==='/api/imagegen/plan'){const body=request.postDataJSON();textPlans.push(body);assert.equal(body.inputs.length,0);assert.equal(body.parameters.ratio,'1:1');return json(route,{request:body,intent:{operation:'generate',requirements:[],conflicts:[]},steps:[{key:'generate',operation:'generate',credits:0}],warnings:[],totalCredits:0,billingVersion:1,modelVersion:152});}
  if(p==='/api/imagegen'&&request.method()==='POST'){const body=request.postDataJSON(),art=result('纯文本结果'),jobId='imagegen-'+body.operationId;jobs.set(jobId,art);return json(route,{operationId:body.operationId,jobId,status:'pending',artifacts:[],chargedCredits:0});}
  if(p==='/api/generate-image'&&request.method()==='GET'&&jobs.has(u.searchParams.get('job'))){const a=jobs.get(u.searchParams.get('job'));return json(route,{status:'done',images:[{id:a.id,url:a.image,width:a.width,height:a.height}],user});}
  return route.continue();
 });
 const root=()=>page.locator('.react-flow__node[data-id="placement-root"]');
 const select=async()=>{await root().click({position:{x:100,y:100}});await page.getByTestId('generation-submit-action').waitFor();};
 const waitResult=async n=>{await page.locator(`.react-flow__node[data-id="fixture-result-${n}"]`).waitFor({timeout:30000});await page.waitForFunction(id=>{const i=document.querySelector(`.react-flow__node[data-id="${id}"] img`);return i?.complete&&i.naturalWidth>0},'fixture-result-'+n);};
 try{
  await page.goto(base+'/canvas',{waitUntil:'domcontentloaded',timeout:180000});await root().waitFor({timeout:120000});await select();
  await page.getByRole('button',{name:'抠图',exact:true}).click();await waitResult(1);checks.push('CUTOUT_CLICK_QUOTE_SUBMIT_AND_RESULT_VISIBLE');
  await select();await page.getByRole('button',{name:'扩展画面',exact:true}).click();const panel=page.getByTestId('canvas-node-action-panel');await panel.getByRole('button',{name:'16:9',exact:true}).click();await panel.getByRole('button',{name:'开始扩图',exact:true}).click();await waitResult(2);checks.push('EXPAND_CLICK_QUOTE_SUBMIT_AND_RESULT_VISIBLE');
  await select();await page.getByRole('button',{name:'重构比例',exact:true}).click();await page.getByRole('button',{name:/16:9/}).last().click();await waitResult(3);checks.push('RATIO_CLICK_POLL_AND_RESULT_VISIBLE');
  await select();await page.getByRole('button',{name:'编辑图中文字',exact:true}).click();await page.waitForFunction(()=>document.body.innerText.includes('fixture-vision')||[...document.querySelectorAll('textarea,input')].some(i=>i.value==='N'));assert.equal(calls.find(c=>c.path==='/api/canvas/ocr').model,'gpt6Astra');checks.push('OCR_SELECTED_MODEL_AND_PROJECT_QUOTE_REACH_EDITOR');
  await page.waitForFunction(()=>{const i=document.querySelector('img[alt="OCR 整图预览"]');return i?.complete&&i.naturalWidth>0});
  await page.screenshot({path:path.join(out,'ocr-editor.png')});
  await page.getByRole('textbox',{name:'修改文字 1',exact:true}).fill('NEW');await page.getByRole('button',{name:'应用文字 1',exact:true}).click();await waitResult(4);checks.push('OCR_EDIT_APPLY_ASYNC_RECEIPT_AND_RESULT_VISIBLE');
  // Selecting the annotation tool closes any previous auxiliary panel.
  await select();await page.getByRole('button',{name:'标注改图',exact:true}).click();const editor=page.locator('[data-testid="canvas-annotate-editor"]');
  const canvas=page.locator('canvas').last();await canvas.waitFor();const box=await canvas.boundingBox();assert.ok(box&&box.width>0);await page.mouse.move(box.x+box.width*.3,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.6,{steps:5});await page.mouse.up();
  await page.getByPlaceholder('例如：把这个包换成米色').fill('保持主体，调整标记区域颜色');await page.getByRole('button',{name:/生成修改结果/}).click();await waitResult(5);checks.push('ANNOTATION_DRAW_INSTRUCTIONS_SUBMIT_AND_RESULT_VISIBLE');
  assert.equal(calls.length,6);assert.ok(calls.every(c=>c.project==='tree:placement-root'&&c.quote.project===c.project&&c.quote.workspace===c.workspace));checks.push('ALL_TOOL_QUOTES_KEEP_EXACT_SUBMISSION_SCOPE');
  await page.locator('.react-flow__node[data-id="text-tool-source"]').click({position:{x:20,y:20}});await page.getByRole('button',{name:'生成图片',exact:true}).first().click();await page.getByTestId('text-image-generation-dialog').getByRole('button',{name:'生成图片',exact:true}).click();await waitResult(6);assert.equal(textPlans.length,1);checks.push('TEXT_ONLY_REAL_MENU_AUTO_RESOLVES_SQUARE_AND_RESULT_VISIBLE');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.screenshot({path:path.join(out,'tool-results.png')});
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({checks,calls,textPlans,errors,external,resultIds:arts.map(a=>a.id),supplierCalls:0,productionWrites:0},null,2));console.log(`CANVAS_REPORTED_TOOLS_UI=PASS CHECKS=${checks.length} RESULTS=6 OCR=1 SUPPLIER_CALLS=0 PAGEERRORS=0`);
 }catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({error:error.stack,calls,checks,errors,external,text:await page.locator('body').innerText().catch(()=>'' )},null,2));throw error;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
