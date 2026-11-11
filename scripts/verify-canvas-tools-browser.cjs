const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium,expect}=require('@playwright/test');
const out=path.resolve(process.env.EVIDENCE_OUT||'output/canvas-tools-browser'),base='http://127.0.0.1:31874';fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1600,height:1100},locale:'zh-CN',reducedMotion:'reduce'}),page=await context.newPage();
 const errors=[],checks=[],routes=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:31875/session',{waitUntil:'domcontentloaded'});
  await page.getByTitle('多选与保存验证',{exact:true}).first().click({timeout:30000});
  const node=id=>page.locator(`.react-flow__node[data-id="${id}"]`);
  await node('fixture-root').waitFor({timeout:30000});const assistant=page.getByRole('button',{name:'收起助手',exact:true});if(await assistant.isVisible())await assistant.click();
  const a=await node('fixture-root').boundingBox(),b=await node('fixture-child').boundingBox();
  await page.getByRole('button',{name:'框选节点 (M)',exact:true}).click();
  await page.mouse.move(a.x-25,a.y-25);await page.mouse.down();await page.mouse.move(b.x+b.width+25,b.y+b.height+25,{steps:12});await page.mouse.up();
  const selection=page.locator('.react-flow__nodesselection-rect');await expect(selection).toBeVisible();
  await selection.click({button:'right',position:{x:300,y:120}});
  await expect(page.getByTestId('canvas-batch-context-count')).toContainText('2');
  await expect(page.getByRole('menuitem',{name:'打包下载',exact:true})).toBeVisible();
  assert.equal(await page.locator('.react-flow__node.selected').count(),2);checks.push('multi-select overlay right-click preserves selection and opens batch menu');
  await page.screenshot({path:path.join(out,'multi-select-menu.png')});await page.keyboard.press('Escape');
  // Commit on the real server, lose the reply once, then reload the same actor.
  let lost=false;await page.route('**/api/canvas/text-nodes',async route=>{if(route.request().method()==='POST'&&!lost){lost=true;const response=await route.fetch();assert.equal(response.status(),200);return route.abort('connectionreset');}return route.continue();});
  const field=node('text-fixture').getByLabel('文字内容',{exact:true});await field.fill('保存成功但响应丢失，刷新后应恢复');
  await expect.poll(()=>lost,{timeout:20000}).toBe(true);
  await expect.poll(async()=>{const state=await(await fetch('http://127.0.0.1:31875/state')).json();return state.texts[0].content;}).toBe('保存成功但响应丢失，刷新后应恢复');
  await page.reload({waitUntil:'domcontentloaded'});await node('text-fixture').waitFor({timeout:30000});
  await expect(field).toHaveValue('保存成功但响应丢失，刷新后应恢复');
  await expect.poll(async()=>page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.startsWith('naumi:canvas-text:v2:')).map(([,v])=>JSON.parse(v)).reduce((n,v)=>n+(v.pendingWrites?.length||0)+(v.drafts?.length||0),0))).toBe(0);
  checks.push('real PG lost ACK reload reconciles original draft and pending journal');
  await field.fill('Ctrl+S 主动保存');await field.press('Control+s');
  await expect.poll(async()=>{const state=await(await fetch('http://127.0.0.1:31875/state')).json();return state.texts[0].content;}).toBe('Ctrl+S 主动保存');
  await expect(page.getByTestId('canvas-save-button')).toBeEnabled();checks.push('Ctrl+S while typing saves to PG');
  await field.fill('点击保存按钮');await page.getByTestId('canvas-save-button').click();
  await expect.poll(async()=>{const state=await(await fetch('http://127.0.0.1:31875/state')).json();return state.texts[0].content;}).toBe('点击保存按钮');
  checks.push('toolbar save uses same document owner');await page.screenshot({path:path.join(out,'save-recovered.png')});
  // UI catalogue transport is a fixture; backend model/wallet behavior is covered
  // separately by real routes + PG. No generation button is clicked here.
  await context.route('**/api/models?*',route=>{const feature=new URL(route.request().url()).searchParams.get('feature'),text=/text|assistant|ipcheck|ocr/.test(feature);return route.fulfill({json:{managed:true,supported:true,available:true,feature,selectionMode:'user',version:1,defaultModelId:text?'text-a':'image-a',models:['a','b'].map(id=>({id:(text?'text-':'image-')+id,label:id==='a'?'模型 A':'模型 B',modality:text?'text':'image',supportsEdit:!text,supportsVision:true,qualities:['medium','high'],nativeResolutions:['1K','2K'],generationParameters:{ratios:['1:1','3:4','16:9'],resolutions:['1K','2K']}}))}});});
  const tools=JSON.parse(fs.readFileSync('E:/Workspace/naumi-task-evidence/canvas-tools-20261111/TOOLS.json'));
  for(const tool of tools){const before=errors.length;const response=await page.goto(base+tool.href,{waitUntil:'domcontentloaded',timeout:45000});await page.locator('body').waitFor();routes.push({name:tool.key,path:tool.href,status:response.status(),errors:errors.slice(before)});assert.equal(response.status(),200,tool.href);}
  for(const slug of ['cutout','upscale','printfile']){await page.goto(base+'/'+slug,{waitUntil:'domcontentloaded'});const model=page.getByRole('combobox',{name:'执行模型',exact:true});await model.waitFor({timeout:30000});await model.click();await page.getByRole('option',{name:'模型 B',exact:true}).click();await expect(model).toContainText('模型 B');await expect(page.getByRole('combobox',{name:'输出分辨率',exact:true})).toBeVisible();await page.screenshot({path:path.join(out,slug+'-model-options.png')});checks.push(slug+' model and resolution controls');}
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,routes,errors,realApp:true,realPgSave:true,catalog:'fixture',paidExternal:0},null,2));console.log(`CANVAS_TOOLS_BROWSER=PASS CHECKS=${checks.length} PAGES=${routes.length} PAGEERRORS=0 REAL_PG_SAVE=1`);
 }catch(error){await page.screenshot({path:path.join(out,'failure.png')});fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),checks,routes,errors,body:await page.locator('body').innerText()},null,2));throw error;}
 finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
