import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,expect as rawExpect} from '@playwright/test';

const out=path.resolve(process.env.CANVAS_CONCURRENCY_EVIDENCE_DIR||'output/canvas-generation-concurrency-20261012/browser');
const original=await readFile('tsconfig.json');
const clientFile='src/components/canvas/canvas-client.tsx',originalClient=await readFile(clientFile);
const baselineRun=process.argv.includes('--baseline');
await mkdir(out,{recursive:true});
const expect=rawExpect.configure({timeout:45000}),checks=[],errors=[],logs=[],submissions=[],positions=[];
const pass=label=>{checks.push(label);console.log('PASS '+label);};
let app,browser,page,polls=0;const persistedTexts=[];
const dist='.next-concurrency-acceptance';
try {
 if(baselineRun)await writeFile(clientFile,await readFile('output/canvas-generation-concurrency-20261012/BASELINE_FILE.tsx'));
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base=`http://127.0.0.1:${port}`;
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port)],{env:{...process.env,DATABASE_URL:'',NAUMI_MULTI_USER:'0',SETTINGS_SECRET:randomUUID(),VIDEO_WORKER_SECRET:randomUUID(),NAUMI_VIDEO_WORKER:'0',OPENAI_API_KEY:'fixture',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:dist},stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',c=>logs.push(c.toString()));app.stderr.on('data',c=>logs.push(c.toString()));
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 const now=new Date().toISOString(),email='canvas-feedback@example.test',image=base+'/demos/suite-demo/suppl-src.png';
 const user={name:'交互验收',email,plan:'starter',creditsTotal:99999,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[],canHigh:true};
 const art={id:'feedback-root',title:'参考图',category:'main',prompt:'保留主体',createdAt:now,status:'completed',image,gradient:'',origin:'canvas',source:'canvas-add',groupId:'feedback-root',width:1024,height:1024,canvasWidth:320,canvasHeight:320,canvasX:100,canvasY:100,ratio:'1:1',resolution:'1K'};
 const texts=[{id:'text-feedback',projectKey:'tree:feedback-root',title:'商品文案',content:'清新自然，品质生活。',prompt:'商品文案',status:'completed',canvasX:600,canvasY:550,width:380,height:260,sourceIds:[],targetIds:['prior-result'],productIds:[art.id],createdAt:now,updatedAt:now}];
 let settings={},results=[];const jobs=new Map();
 const model={id:'gpt-image-2',label:'GPT Image 2',modality:'image',supportsEdit:true,qualities:['low','medium','high'],qualitySupported:true,nativeResolutions:['1K','2K'],generationParameters:{ratios:['1:1','3:4','4:3','16:9','9:16'],resolutions:['1K','2K']}};
 const features=Object.fromEntries(['image.generate','canvas.image','canvas.expand','canvas.text-generate','canvas.assistant','tool.cutout'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{low:{'1K':2},medium:{'1K':4},high:{'1K':8}}}]));
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
 await context.addInitScript(({user})=>{localStorage.setItem('theme','light');localStorage.setItem('naumi:last-email',user.email);localStorage.setItem('naumi:user:'+user.email,JSON.stringify(user));localStorage.setItem('nv:canvas:last','tree:feedback-root');localStorage.setItem('nv:canvas:bg','light');},{user});
 page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR '+e.message);});
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;
  if(p==='/api/config')return route.fulfill({json:{db:true,authMode:'mock',multiUser:true,commerceVisible:false,imageQualityCapable:true,creditsMetered:true,imageModels:[model],defaultImageModel:model.id}});
  if(p==='/api/auth/session')return route.fulfill({json:{user}});
  if(p==='/api/account')return route.fulfill({json:{persisted:true,user,artworks:[art,{...art,id:'feedback-second',title:'第二节点',parentId:art.id,canvasX:550,canvasY:100},...results]}});
  if(p==='/api/projects')return route.fulfill({json:{names:{'tree:feedback-root':'体验验收'}}});
  if(p==='/api/canvas/text-nodes'){if(req.method()==='POST')persistedTexts.push(req.postDataJSON());return route.fulfill({json:req.method()==='POST'?{persisted:true,node:req.postDataJSON()}:{persisted:true,nodes:texts}});}
  if(p==='/api/canvas/node-settings')return route.fulfill({json:{persisted:true,settings}});
  if(p==='/api/models')return route.fulfill({json:{managed:false,supported:true,feature:url.searchParams.get('feature'),version:1,models:[model],defaultModelId:model.id}});
  if(p==='/api/text-models')return route.fulfill({json:{models:['gpt-4o'],defaultModel:'gpt-4o'}});
  if(p==='/api/billing/catalog')return route.fulfill({json:{version:1,features,products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}}});
  if(p==='/api/billing/quote')return route.fulfill({json:{...req.postDataJSON(),credits:4,reserveCredits:4,version:1}});
  if(p==='/api/download')return route.fulfill({contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')});
  if(p==='/api/generate-image') {
   if(req.method()==='POST') {
    submissions.push({body:req.postDataBuffer()?.toString('utf8').split('filename=')[0],headers:req.headers()});
    
    const id='feedback-job-'+submissions.length;jobs.set(id,{status:'pending',images:[]});return route.fulfill({json:{jobId:id}});
   }
   polls++;
   return route.fulfill({json:{...jobs.get(url.searchParams.get('job')),user}});
  }
  if(p==='/api/artworks/position'){positions.push(req.postDataJSON());return route.fulfill({json:{ok:true}});}
  if(p==='/api/artworks/get') {return route.fulfill({json:{artworks:results.map(a=>({...a,canvasX:positions.find(v=>v.id===a.id)?.x,canvasY:positions.find(v=>v.id===a.id)?.y}))}});}
  return route.fulfill({json:{items:[],tasks:[],names:{},nodes:[],settings:{},records:[],artworks:[],ok:true,persisted:true}});
 });
 await page.route('**/_next/static/chunks/**',async route=>{const file=path.resolve(dist,new URL(route.request().url()).pathname.replace('/_next/',''));assert.ok(file.startsWith(path.resolve(dist)+path.sep));await route.fulfill({contentType:'application/javascript',body:await readFile(file)});});
 await page.route('**/demos/suite-demo/suppl-src.png',async route=>route.fulfill({contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')}));
 await page.goto(base+'/canvas');
 const root=page.locator('.react-flow__node[data-id="feedback-root"]');
 const second=page.locator('.react-flow__node[data-id="feedback-second"]');
 await expect(root).toBeVisible();await page.getByRole('button',{name:'收起助手',exact:true}).click();await page.waitForTimeout(400);await root.click();
 const dock=page.getByTestId('image-node-dock'),send=dock.locator('button[title="生成新版本"]');
 await dock.locator('textarea').fill('任务 A 原始提示词');await send.click();
 await expect.poll(()=>submissions.length).toBe(1);
 await expect(send).toBeDisabled();
 await expect(dock.locator('textarea')).toBeVisible();
 await dock.locator('textarea').fill('下一次修改，不改变已提交 A');
 await expect(dock.getByRole('button',{name:'关闭',exact:true})).toBeVisible();
 assert.ok(submissions[0].body.includes('任务 A 原始提示词'));assert.ok(!submissions[0].body.includes('下一次修改'));
 pass('A in flight retains editable prompt and visible close; submitted snapshot unchanged');
 await dock.getByRole('button',{name:'关闭',exact:true}).click();await second.click({position:{x:40,y:150}});await dock.locator('textarea').fill('任务 B 原始提示词');await expect(send).toBeEnabled();await send.click();
 await expect.poll(()=>submissions.length).toBe(2);await expect(page.getByTestId('generation-placeholder')).toHaveCount(2);
 pass('B submits before A completes with two independent previews');
 await dock.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByTestId('canvas-main-toolbar').locator('[data-tool="text"]').click();
 const createdText=page.locator('.react-flow__node-text').filter({hasNot:page.locator('[aria-label="编辑生成文本"]')});
 await expect(createdText).toHaveCount(1);
 const titleBox=await createdText.getByTestId('text-node-title').boundingBox();
 await page.mouse.move(titleBox.x+30,titleBox.y+15);await page.mouse.down();await page.mouse.move(1190,830,{steps:10});await page.mouse.up();
 const text=page.locator('.react-flow__node[data-id="text-feedback"]');await text.click();await text.locator('textarea').fill('用户继续编辑的文字');
 await root.dispatchEvent('contextmenu',{clientX:180,clientY:180,bubbles:true});await expect(page.getByTestId('canvas-context-menu')).toBeVisible();await page.keyboard.press('Escape');
 const before=await page.locator('.react-flow__viewport').getAttribute('style');await page.getByTestId('canvas-main-toolbar').locator('[data-tool="hand"]').click();
 await page.mouse.move(850,700);await page.mouse.down();await page.mouse.move(950,740,{steps:5});await page.mouse.up();
 assert.notEqual(await page.locator('.react-flow__viewport').getAttribute('style'),before);
 await page.getByTestId('canvas-main-toolbar').locator('[data-tool="move"]').click();await second.click({position:{x:40,y:150}});await dock.locator('textarea').fill('B 尚在运行的下一次草稿');
 const finish=(index,parentId)=>{const id='result-'+index;const result={...art,id,title:'结果 '+index,parentId,canvasX:950,canvasY:100};results.push(result);jobs.set('feedback-job-'+index,{status:'done',images:[{id,url:image,width:1024,height:1024}]});};
 finish(1,art.id);await expect(page.locator('.react-flow__node[data-id="result-1"]')).toBeVisible();
 await expect(dock.locator('textarea')).toHaveValue('B 尚在运行的下一次草稿');await expect(send).toBeDisabled();
 pass('A completion neither steals B selection nor clears B draft; pan/create/context menu usable');
 finish(2,'feedback-second');await expect(page.locator('.react-flow__node[data-id="result-2"]')).toBeVisible();await expect(page.getByTestId('generation-placeholder')).toHaveCount(0);
 await expect(dock.locator('textarea')).toHaveValue('B 尚在运行的下一次草稿');await expect(send).toBeEnabled();
 // Pending/text-to-image completion must not run the global project deep-link selector.
 await page.getByTestId('canvas-main-toolbar').locator('[data-tool="image-node"]').click();
 const pdock=page.getByTestId('pending-node-dock');await expect(pdock).toBeVisible();await pdock.locator('textarea').fill('空白节点 C');await pdock.locator('button[title="生成新版本"]').click();
 await expect.poll(()=>submissions.length).toBe(3);await expect(pdock.locator('textarea')).toBeVisible();
 await second.click({position:{x:40,y:150}});await dock.locator('textarea').fill('C 完成时保留的 B 草稿');finish(3,art.id);
 await expect(page.locator('.react-flow__node[data-id="result-3"]')).toBeVisible();await expect(dock.locator('textarea')).toHaveValue('C 完成时保留的 B 草稿');
 pass('pending node completion does not navigate or select away from B');
 await send.click();await expect.poll(()=>submissions.length).toBe(4);await root.click();await dock.locator('textarea').fill('A 新草稿');
 jobs.set('feedback-job-4',{status:'error',error:'B 独立失败'});await expect(page.getByTestId('generation-placeholder')).toHaveCount(0);
 await expect(dock.locator('textarea')).toHaveValue('A 新草稿');assert.ok(!(await dock.innerText()).includes('B 独立失败'));await expect(send).toBeEnabled();
 // Text-origin generation must merge links into the content edited during the wait.
 await dock.getByRole('button',{name:'关闭',exact:true}).click();await text.locator('textarea').click({button:'right'});
 await page.getByTestId('canvas-context-menu').getByRole('menuitem',{name:'按文配图',exact:true}).click();
 await page.getByTestId('gen-image-menu').getByRole('button',{name:'仅产品图',exact:false}).click();
 await expect.poll(()=>submissions.length).toBe(5);await text.locator('textarea').fill('生图期间修改的文案，必须保留');await expect(text.locator('textarea')).toHaveValue('生图期间修改的文案，必须保留');await text.locator('textarea').blur();
 finish(5,art.id);await expect(page.locator('.react-flow__node[data-id="result-5"]')).toBeVisible();
 await expect(text.locator('textarea')).toHaveValue('生图期间修改的文案，必须保留');
 await expect.poll(()=>persistedTexts.some(body=>{const n=body.node||body;return n.id==='text-feedback'&&n.content==='生图期间修改的文案，必须保留'&&n.targetIds?.includes('result-5')&&n.targetIds?.includes('prior-result');})).toBe(true);
 pass('text-origin result preserves live edited content and prior target links in persisted request');
 assert.equal(submissions.length,5);assert.deepEqual(errors,[]);

 await page.screenshot({path:path.join(out,'concurrent-results.png')});
 await writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors,submissions,positions,persistedTexts,polls,providerCalls:0},null,2));
 console.log('CONCURRENCY_BROWSER=PASS JOBS=5 TEXT_LIVE_LINKS=PASS SNAPSHOT=PASS NODE_SWITCH=PASS EDIT_PAN_CREATE_CONTEXT=PASS FOCUS_DRAFT=PASS FAILURE_ISOLATED=PASS PROVIDER_CALLS=0');
}catch(error){await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'failure-details.json'),JSON.stringify({checks,errors,submissions,persistedTexts,viewport:await page?.locator('.react-flow__viewport').getAttribute('style').catch(()=>null),nodeStyles:await page?.locator('.react-flow__node').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.id,style:n.getAttribute('style')}))).catch(()=>null),body:await page?.locator('body').innerText().catch(()=>null)},null,2));throw error;}
finally{await browser?.close();if(app?.pid){if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'});}catch{}}else app.kill('SIGTERM');}await writeFile('tsconfig.json',original);if(baselineRun)await writeFile(clientFile,originalClient);await writeFile(path.join(out,'next.log'),logs.join(''));}
