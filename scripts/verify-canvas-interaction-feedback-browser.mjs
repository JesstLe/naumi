import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,expect as rawExpect} from '@playwright/test';

const out=path.resolve(process.env.CANVAS_FEEDBACK_EVIDENCE_DIR||'output/canvas-interaction-feedback/browser');
const original=await readFile('tsconfig.json');
await mkdir(out,{recursive:true});
const expect=rawExpect.configure({timeout:45000}),checks=[],errors=[],logs=[],submissions=[],positions=[];
const pass=label=>{checks.push(label);console.log('PASS '+label);};
let app,browser,page,releaseStart,releaseResults,holdStart=false,holdResults=false,outcome='pending',polls=0;
const dist='.next-feedback-acceptance';
try {
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base=`http://127.0.0.1:${port}`;
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port)],{env:{...process.env,DATABASE_URL:'',NAUMI_MULTI_USER:'0',SETTINGS_SECRET:randomUUID(),VIDEO_WORKER_SECRET:randomUUID(),NAUMI_VIDEO_WORKER:'0',OPENAI_API_KEY:'fixture',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:dist},stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',c=>logs.push(c.toString()));app.stderr.on('data',c=>logs.push(c.toString()));
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 const now=new Date().toISOString(),email='canvas-feedback@example.test',image=base+'/demos/suite-demo/suppl-src.png';
 const user={name:'交互验收',email,plan:'starter',creditsTotal:99999,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[],canHigh:true};
 const art={id:'feedback-root',title:'参考图',category:'main',prompt:'保留主体',createdAt:now,status:'completed',image,gradient:'',origin:'canvas',source:'canvas-add',groupId:'feedback-root',width:1024,height:1024,canvasWidth:320,canvasHeight:320,canvasX:100,canvasY:100,ratio:'1:1',resolution:'1K'};
 const texts=[{id:'text-feedback',projectKey:'tree:feedback-root',title:'商品文案',content:'清新自然，品质生活。',prompt:'商品文案',status:'completed',canvasX:600,canvasY:100,width:380,height:260,sourceIds:[],targetIds:[],createdAt:now,updatedAt:now}];
 let settings={},results=[];
 const model={id:'gpt-image-2',label:'GPT Image 2',modality:'image',supportsEdit:true,qualities:['low','medium','high'],qualitySupported:true,nativeResolutions:['1K','2K'],generationParameters:{ratios:['1:1','3:4','4:3','16:9','9:16'],resolutions:['1K','2K']}};
 const features=Object.fromEntries(['image.generate','canvas.image','canvas.text-generate','canvas.assistant','tool.cutout'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{low:{'1K':2},medium:{'1K':4},high:{'1K':8}}}]));
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
 await context.addInitScript(({user})=>{localStorage.setItem('theme','light');localStorage.setItem('naumi:last-email',user.email);localStorage.setItem('naumi:user:'+user.email,JSON.stringify(user));localStorage.setItem('nv:canvas:last','tree:feedback-root');localStorage.setItem('nv:canvas:bg','light');},{user});
 page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR '+e.message);});
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;
  if(p==='/api/config')return route.fulfill({json:{db:true,authMode:'mock',multiUser:true,commerceVisible:false,imageQualityCapable:true,creditsMetered:true,imageModels:[model],defaultImageModel:model.id}});
  if(p==='/api/auth/session')return route.fulfill({json:{user}});
  if(p==='/api/account')return route.fulfill({json:{persisted:true,user,artworks:[art,...results]}});
  if(p==='/api/projects')return route.fulfill({json:{names:{'tree:feedback-root':'体验验收'}}});
  if(p==='/api/canvas/text-nodes')return route.fulfill({json:req.method()==='POST'?{persisted:true,node:req.postDataJSON()}:{persisted:true,nodes:texts}});
  if(p==='/api/canvas/node-settings')return route.fulfill({json:{persisted:true,settings}});
  if(p==='/api/models')return route.fulfill({json:{managed:false,supported:true,feature:url.searchParams.get('feature'),version:1,models:[model],defaultModelId:model.id}});
  if(p==='/api/text-models')return route.fulfill({json:{models:['gpt-4o'],defaultModel:'gpt-4o'}});
  if(p==='/api/billing/catalog')return route.fulfill({json:{version:1,features,products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}}});
  if(p==='/api/billing/quote')return route.fulfill({json:{...req.postDataJSON(),credits:4,reserveCredits:4,version:1}});
  if(p==='/api/download')return route.fulfill({contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')});
  if(p==='/api/generate-image') {
   if(req.method()==='POST') {
    submissions.push({body:req.postDataBuffer()?.toString('utf8').split('filename=')[0],headers:req.headers()});
    if(holdStart)await new Promise(r=>releaseStart=r);
    return route.fulfill({json:{jobId:'feedback-job-'+submissions.length}});
   }
   polls++;
   if(outcome==='error')return route.fulfill({json:{status:'error',error:'模拟生成失败，请重试'}});
   return route.fulfill({json:outcome==='done'?{status:'done',images:results.map(a=>({id:a.id,url:a.image,width:a.width,height:a.height})),user}:{status:'pending'}});
  }
  if(p==='/api/artworks/position'){positions.push(req.postDataJSON());return route.fulfill({json:{ok:true}});}
  if(p==='/api/artworks/get') {if(holdResults)await new Promise(r=>releaseResults=r);return route.fulfill({json:{artworks:results.map(a=>({...a,canvasX:positions.find(v=>v.id===a.id)?.x,canvasY:positions.find(v=>v.id===a.id)?.y}))}});}
  return route.fulfill({json:{items:[],tasks:[],names:{},nodes:[],settings:{},records:[],artworks:[],ok:true,persisted:true}});
 });
 await page.route('**/_next/static/chunks/**',async route=>{const file=path.resolve(dist,new URL(route.request().url()).pathname.replace('/_next/',''));assert.ok(file.startsWith(path.resolve(dist)+path.sep));await route.fulfill({contentType:'application/javascript',body:await readFile(file)});});
 await page.route('**/demos/suite-demo/suppl-src.png',async route=>route.fulfill({contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')}));
 await page.goto(base+'/canvas');await expect(page.locator('.react-flow__node')).toHaveCount(2);
 const root=page.locator('.react-flow__node[data-id="feedback-root"]'),text=page.locator('.react-flow__node[data-id="text-feedback"]'),menu=page.getByTestId('canvas-context-menu');
 await root.click({button:'right'});await expect(menu).toBeVisible();await expect(menu.getByRole('menuitem',{name:'重命名节点',exact:true})).toBeVisible();await expect(menu.getByRole('menuitem',{name:'属性设置',exact:true})).toBeVisible();
 await page.keyboard.press('End');await expect(menu.getByRole('menuitem').last()).toBeFocused();await page.keyboard.press('Home');await expect(menu.getByRole('menuitem').first()).toBeFocused();await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);pass('image right-click opens existing actions; Home/End/Escape work');
 await text.locator('textarea').click({button:'right'});await expect(menu).toBeVisible();await expect(menu.getByRole('menuitem',{name:'文字样式',exact:true})).toBeVisible();await expect(menu.getByRole('menuitem',{name:'按文配图',exact:true})).toBeVisible();
 await page.screenshot({path:path.join(out,'text-context.png')});await menu.getByRole('menuitem',{name:'重命名节点',exact:true}).click();await expect(page.locator('input:visible').last()).toBeVisible();await page.keyboard.press('Escape');pass('text textarea right-click opens text actions and rename dialog');
 // Physical menu position near the viewport edge; measured menu stays reachable.
 await root.dispatchEvent('contextmenu',{clientX:1438,clientY:998,bubbles:true});await expect(menu).toBeVisible();const rect=await menu.boundingBox();assert.ok(rect.x>=8&&rect.y>=8&&rect.x+rect.width<=1432&&rect.y+rect.height<=992);
 await page.getByTestId('canvas-context-menu-backdrop').click({position:{x:4,y:4}});await expect(menu).toHaveCount(0);pass('right/bottom edge clamping and outside dismissal');
 // Lock state is read from the existing settings API, not invented locally.
 settings={'text-feedback':{locked:true,order:0,text:{fontSize:12,lineHeight:1.65,align:'left',fontWeight:'400',color:null}}};
 await page.reload();await expect(text).toBeVisible();await text.locator('textarea').click({button:'right'});await expect(menu.getByRole('menuitem',{name:'重命名节点',exact:true})).toBeDisabled();await expect(menu.getByRole('menuitem',{name:'按文配图',exact:true})).toBeDisabled();await expect(menu.getByRole('menuitem',{name:'解锁节点',exact:true})).toBeEnabled();await page.keyboard.press('Escape');pass('locked text preserves copy/unlock and disables mutation');
 settings={};await page.reload();await expect(root).toBeVisible();await root.click();
 const dock=page.getByTestId('image-node-dock');await expect(dock).toBeVisible();await dock.locator('textarea').fill('保留主体，清新背景');
 holdStart=true;
 const send=dock.locator('button[title="生成新版本"]');await expect(send).toBeEnabled();await send.click();
 const placeholder=page.getByTestId('generation-placeholder');await expect(placeholder).toHaveAttribute('data-stage','preparing');
 await expect.poll(()=>submissions.length).toBe(1);await expect(send).toBeDisabled();
 const pending=page.locator('.react-flow__node[data-id^="task-"]');const dims=await pending.evaluate(el=>({w:parseFloat(el.style.width),h:parseFloat(el.style.height)}));assert.deepEqual(dims,{w:384,h:384});
 assert.ok(await placeholder.locator('[aria-hidden="true"]').first().evaluate(el=>getComputedStyle(el).animationName==='none'));
 await page.screenshot({path:path.join(out,'preparing.png')});pass('immediate 384x384 proportional preview during held submission; double-submit disabled; reduced motion');
 holdStart=false;releaseStart();await expect(placeholder).toHaveAttribute('data-stage','generating');await expect(placeholder).toContainText('请求已提交');
 await page.clock.install();await page.clock.runFor(35000);await expect(placeholder).toContainText('复杂画面需要更多时间');assert.doesNotMatch(await placeholder.innerText(),/%|马上|即将/);assert.equal(submissions.length,1);pass('long pending job changes waiting copy and elapsed time without fabricated percentage/re-submission');
 // A dragged placeholder retains its drop coordinates on completion.
 const box=await pending.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+55,box.y+box.height/2+65,{steps:10});await page.mouse.up();
 const dragged=await pending.evaluate(el=>el.style.transform);
 results=[{...art,id:'feedback-result',title:'生成结果',source:'generate',parentId:art.id,createdAt:new Date().toISOString()}];holdResults=true;outcome='done';await page.clock.runFor(3000);await expect(placeholder).toHaveAttribute('data-stage','saving');
 await page.screenshot({path:path.join(out,'saving.png')});holdResults=false;releaseResults?.();await expect(placeholder).toHaveCount(0);await expect(page.locator('.react-flow__node[data-id="feedback-result"]')).toBeVisible();const coords=dragged.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);assert.ok(coords);assert.equal(positions.at(-1).x,Math.round(Number(coords[1])));assert.equal(positions.at(-1).y,Math.round(Number(coords[2])));pass('save stage replaces preview with result at dragged position');
 assert.match(submissions[0].body,/name="ratio"\r\n\r\n1:1/);assert.match(submissions[0].body,/name="quality"/);assert.match(submissions[0].body,/name="parentId"\r\n\r\nfeedback-root/);assert.ok(submissions[0].headers['x-naumi-billing-operation-id']);pass('request ratio/quality/lineage and billing operation preserved');
 await root.click();await expect(dock).toBeVisible();outcome='error';await dock.locator('textarea').fill('测试失败');await send.click();await page.clock.runFor(3000);await expect(placeholder).toHaveCount(0);await expect(page.getByText('模拟生成失败，请重试',{exact:true})).toBeVisible();await expect(send).toBeEnabled();pass('failure removes running placeholder and restores retry control');
 outcome='pending';await dock.getByRole('spinbutton',{name:'生成图片数量'}).fill('2');await send.click();await expect(placeholder).toContainText('2 张图片');await expect.poll(()=>submissions.length).toBe(3);
 results=[{...art,id:'feedback-multi-1',title:'多图一',source:'generate',parentId:art.id,createdAt:now},{...art,id:'feedback-multi-2',title:'多图二',source:'generate',parentId:art.id,createdAt:now}];outcome='done';await page.clock.runFor(3000);await expect(placeholder).toHaveCount(0);await expect(page.locator('.react-flow__node[data-id^="feedback-multi-"]')).toHaveCount(2);assert.match(submissions[2].body,/name="count"\r\n\r\n2/);pass('retry and multi-image submission keeps requested count and inserts both results');
 // Prompt-only path enlarges the existing blank node immediately and preserves its retry prompt.
 await page.getByTestId('canvas-main-toolbar').locator('[data-tool="image-node"]').click();const pendDock=page.getByTestId('pending-node-dock');await expect(pendDock).toBeVisible();await pendDock.locator('textarea').fill('纯文字生成产品图');
 await pendDock.getByRole('spinbutton',{name:'生成图片数量'}).fill('1');outcome='pending';await pendDock.locator('button[title="生成新版本"]').click();await expect(placeholder).toHaveAttribute('data-stage','generating');const pendBox=await page.locator('.react-flow__node[data-id^="pend-"]').boundingBox();assert.ok(pendBox.width>200&&pendBox.height>200);await expect(placeholder).toContainText('图片生成中');
 await page.screenshot({path:path.join(out,'prompt-only.png')});outcome='error';await page.clock.runFor(3000);await expect(placeholder).toHaveCount(0);await expect(pendDock.locator('textarea')).toHaveValue('纯文字生成产品图');pass('prompt-only generation uses large feedback card and retains prompt after failure');
 // Existing empty image nodes now have actions too, and read-only/locked cases stay disabled.
 await page.locator('.react-flow__node[data-id^="pend-"]').click({button:'right'});await expect(menu).toBeVisible();await expect(menu.getByRole('menuitem',{name:'上传图片',exact:true})).toBeEnabled();await page.keyboard.press('Tab');await expect(menu).toHaveCount(0);pass('blank image context actions and Tab dismissal');
 // Read-only viewer must not gain writable actions through context menus.
 await page.goto(base+'/canvas?email=viewer%40example.test&node=feedback-root');await expect(root).toBeVisible();await text.locator('textarea').click({button:'right'});await expect(menu).toBeVisible();await expect(menu.getByRole('menuitem',{name:'重命名节点',exact:true})).toBeDisabled();await expect(menu.getByRole('menuitem',{name:'按文配图',exact:true})).toBeDisabled();await page.keyboard.press('Escape');pass('read-only context menu respects existing editing boundary');
 await page.setViewportSize({width:320,height:760});await root.dispatchEvent('contextmenu',{clientX:319,clientY:759,bubbles:true});await expect(menu).toBeVisible();const mobile=await menu.boundingBox();assert.ok(mobile.x>=8&&mobile.y>=8&&mobile.x+mobile.width<=312&&mobile.y+mobile.height<=752);await page.screenshot({path:path.join(out,'mobile-context.png')});pass('320px viewport menu remains fully reachable');
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors,submissions,positions,polls,providerCalls:0},null,2));
 console.log('BROWSER=PASS CONTEXT=IMAGE_TEXT LOCKED_READONLY=PASS PLACEHOLDER=384px WAIT_SAVE_ERROR=PASS DRAG=PASS PROVIDER_CALLS=0');
}catch(error){await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'failure-details.json'),JSON.stringify({checks,errors,submissions,positions,body:await page?.locator('body').innerText().catch(()=>null)},null,2));throw error;}
finally{releaseStart?.();releaseResults?.();await browser?.close();if(app?.pid){if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'});}catch{}}else app.kill('SIGTERM');}await writeFile('tsconfig.json',original);await writeFile(path.join(out,'next.log'),logs.join(''));}
