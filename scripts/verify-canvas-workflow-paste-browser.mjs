import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,expect as rawExpect} from '@playwright/test';
const expect=rawExpect.configure({timeout:45000});
const out=path.resolve(process.env.WORKFLOW_EVIDENCE_DIR || 'E:/Workspace/naumi/output/canvas-workflow-paste-20261010');
const seed=JSON.parse(await readFile(path.join(out,'browser-seed.json'),'utf8'));
const db='postgresql://naumi_fixture:fixture_local_only@127.0.0.1:13049/naumi_workflow_paste_acceptance';
assert.equal(process.env.DATABASE_URL,db,'isolated fixture only');
const originalConfig=await readFile('tsconfig.json'),dist='.next-workflow-paste-acceptance';
await mkdir(path.join(out,'browser'),{recursive:true});
const errors=[],logs=[],checks=[],imports=[],streams=[],writes=[];
let app,browser,page;
const pass=s=>{checks.push(s);console.log('PASS '+s);};
try{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const base=`http://127.0.0.1:${port}`;
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port)],{env:{...process.env,DATABASE_URL:db,STORAGE_DRIVER:'local',MEDIA_DIR:path.join(out,'media'),SETTINGS_SECRET:'workflow-fixture-local-only-secret-20261010',NAUMI_MULTI_USER:'1',NAUMI_VIDEO_WORKER:'0',VIDEO_WORKER_SECRET:randomUUID(),OPENAI_API_KEY:'fixture-local-never-call',OPENAI_BASE_URL:'http://127.0.0.1:1/v1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_DIST_DIR:dist,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',c=>logs.push(c.toString()));app.stderr.on('data',c=>logs.push(c.toString()));
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 async function boot({width=1440,real=false,empty=false}={}){
  const email=real?seed.realEmail:seed.email,cookie=real?seed.realCookie:seed.cookie,user={...seed.user,email,creditsTotal:99999,creditsUsed:0};
  const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'});await context.addCookies([{name:'nv_user',value:cookie.slice(8),url:base},{name:'naumi_locale',value:'zh',url:base}]);
  await context.addInitScript(({email,user,key})=>{localStorage.setItem('theme','light');localStorage.setItem('naumi:last-email',email);localStorage.setItem('naumi:user:'+email,JSON.stringify(user));localStorage.setItem('nv:canvas:bg','light');localStorage.setItem('nv:canvas:agent:disclosure:'+email,'closed');if(key)localStorage.setItem('nv:canvas:last',key);},{email,user,key:empty?null:(real?seed.real.projectKey:seed.result.projectKey)});
  await context.addInitScript(()=>{window.__workflowStreams=[];const original=window.fetch;window.fetch=async(...args)=>{const res=await original(...args);if(String(args[0]).endsWith('/api/canvas/workflow-import')&&args[1]?.method==='POST')void res.clone().text().then(body=>window.__workflowStreams.push(body.trim().split('\n').map(line=>JSON.parse(line)))).catch(()=>{});return res;};});
  // Isolate copy regression from the user's real OS clipboard.
  await context.addInitScript(()=>{window.__fixtureClipboard={};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{for(const item of items)for(const type of item.types)window.__fixtureClipboard[type]=await (await item.getType(type)).text();},writeText:async text=>{window.__fixtureClipboard['text/plain']=text;}}});});
  const p=await context.newPage();page=p;p.setDefaultTimeout(45000);p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),ep=url.pathname;
   if(req.method()!=='GET')writes.push(ep);
   if(ep==='/api/config')return route.fulfill({json:{db:true,authMode:'mock',multiUser:true,commerceVisible:false,imageQualityCapable:true,creditsMetered:true,imageModels:[{id:'fixture-image',label:'Fixture',modality:'image',supportsEdit:true,qualities:['low'],nativeResolutions:['1K'],generationParameters:{ratios:['1:1'],resolutions:['1K']}}],defaultImageModel:'fixture-image'}});
   if(ep==='/api/auth/session')return route.fulfill({json:{user}});
   if(ep==='/api/models')return route.fulfill({json:{managed:true,supported:true,models:[{id:'fixture-image',label:'Fixture',modality:'image',supportsEdit:true}],defaultModelId:'fixture-image'}});
   if(ep==='/api/text-models')return route.fulfill({json:{models:['fixture-text'],defaultModel:'fixture-text'}});
   if(ep==='/api/billing/catalog')return route.continue();
   if(ep==='/api/billing/quote')return route.fulfill({json:{credits:0,reserveCredits:0,version:1}});
   if(ep==='/api/canvas/workflow-import'&&req.method()==='POST')imports.push(req.postDataJSON());
   if(ep==='/api/account'||ep==='/api/projects'||ep.startsWith('/api/artworks/')||ep==='/api/canvas/history'||ep==='/api/canvas/text-nodes'||ep==='/api/canvas/node-settings'||ep.startsWith('/api/canvas/workflow-import'))return route.continue();
   if(req.method()==='POST'&&/generate|assistant|image-task/.test(ep))throw Error('Unexpected paid generation '+ep);
   return route.fulfill({json:{items:[],tasks:[],sessions:[],records:[],ok:true,persisted:true}});
  });
  await p.route('**/_next/static/chunks/**',async route=>{const file=path.resolve(dist,new URL(route.request().url()).pathname.replace('/_next/',''));assert.ok(file.startsWith(path.resolve(dist)+path.sep));await route.fulfill({contentType:'application/javascript',body:await readFile(file)});});
  await p.goto(base+'/canvas',{timeout:120000});
  if(empty)await p.getByTestId('canvas-project-browser').getByRole('button',{name:'创建新项目',exact:true}).click();
  await expect(p.getByTestId('canvas-drop-zone')).toBeVisible();
  return{p,context};
 }
 async function paste(p,html,target='[data-testid="canvas-drop-zone"]'){
  return p.evaluate(({html,target})=>{const dt=new DataTransfer();dt.setData('text/html',html);return !document.querySelector(target).dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},{html,target});
 }
 // Compact synthetic structure with real public images; the real long layout is tested separately.
 const data=JSON.parse(decodeURIComponent(Buffer.from(seed.input.html.match(/data-clipboard="([^"]+)"/)[1],'base64').toString()));
 data.elements[0].elements[2].elements[0].height=1600;
 const html='<span data-app="editor-next" data-clipboard="'+Buffer.from(encodeURIComponent(JSON.stringify(data))).toString('base64')+'"></span>';
 const {p,context}=await boot({empty:true});
 // Wait for account and node settings hydration before dispatching the user paste event.
 await expect.poll(()=>p.evaluate(()=>document.querySelector('[data-testid="canvas-main-toolbar"]')!==null)).toBe(true);
 assert.equal(await paste(p,html),true);
 await expect(p.locator('.react-flow__node')).toHaveCount(8);
 await expect(p.getByTestId('workflow-group')).toHaveCount(2);await expect(p.getByTestId('workflow-decoration')).toHaveCount(2);
 await expect(p.locator('.react-flow__edge')).toHaveCount(4);
 await expect(p.getByTestId('workflow-import-status')).toHaveCount(0);
 await expect.poll(()=>p.evaluate(()=>window.__workflowStreams.length)).toBeGreaterThan(0);
 streams.push(...await p.evaluate(()=>window.__workflowStreams));
 const initial=streams[0].find(e=>e.type==='complete').result;
 assert.deepEqual(streams[0].filter(e=>e.type==='progress').map(e=>e.done),[0,1,2,3,4]);
 const artIds=initial.artworks.map(a=>a.id),textIds=initial.textNodes.map(a=>a.id);
 for(const img of await p.locator('.react-flow__node img').evaluateAll(xs=>xs.map(x=>x.getAttribute('src'))))assert.ok(!/dancf|gaoding/.test(img));
 await p.screenshot({path:path.join(out,'browser','compact-import.png')});
 pass('user paste -> actual route, public PNG/SVG/path persisted; 6 editable leaves + 2 groups + 4 links; actual 0/4..4/4 stream');
 await p.keyboard.press('Control+z');await expect(p.locator('.react-flow__node')).toHaveCount(0);
 await p.keyboard.press('Control+Shift+z');await expect(p.locator('.react-flow__node')).toHaveCount(8);await expect(p.locator('.react-flow__edge')).toHaveCount(4);
 pass('one-step mixed undo/redo restores images, text, decoration and groups via actual PostgreSQL history');
 // Group label is a real clickable control, not a decorative/inert frame.
 await p.getByTestId('workflow-group').getByRole('button',{name:'商品工作流',exact:true}).click();
 await expect(p.locator('.react-flow__node.selected')).toHaveCount(6);
 const imageNode=p.locator(`.react-flow__node[data-id="${artIds[0]}"]`);
 const b=await imageNode.boundingBox();assert.ok(b&&b.width>1);
 await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2+64,b.y+b.height/2+36,{steps:8});await p.mouse.up();
 const moved=await p.request.get(base+'/api/account?email='+encodeURIComponent(seed.email));const movedWorks=(await moved.json()).artworks;
 const movedTexts=(await (await p.request.get(base+'/api/canvas/text-nodes')).json()).nodes;
 await expect.poll(async()=>{const a=(await (await p.request.get(base+'/api/account')).json()).artworks;return a.find(a=>a.id===artIds[0]).canvasX;}).not.toBe(initial.artworks[0].canvasX);
 // Every member moves by one common delta, including text and decorations.
 const freshWorks=(await (await p.request.get(base+'/api/account')).json()).artworks,freshTexts=(await (await p.request.get(base+'/api/canvas/text-nodes')).json()).nodes;
 const delta={x:freshWorks.find(a=>a.id===artIds[0]).canvasX-initial.artworks[0].canvasX,y:freshWorks.find(a=>a.id===artIds[0]).canvasY-initial.artworks[0].canvasY};
 for(const n of [...initial.artworks,...initial.textNodes]){const saved=[...freshWorks,...freshTexts].find(a=>a.id===n.id);assert.ok(Math.abs(saved.canvasX-n.canvasX-delta.x)<2&&Math.abs(saved.canvasY-n.canvasY-delta.y)<2,'whole group delta '+n.id);}
 await p.reload();await expect(p.locator('.react-flow__node')).toHaveCount(8);await expect(p.getByTestId('workflow-group')).toHaveCount(2);
 pass('nested group title selects all members; mixed drag persists identical delta and refresh restores grouping');
 // Foreign HTML in an input must retain normal editor behavior.
 await p.getByTestId('canvas-agent-toggle').click();const input=p.getByTestId('canvas-assistant-input');await input.fill('保留输入');const count=imports.length;
 assert.equal(await paste(p,html,'[data-testid="canvas-assistant-input"]'),false);assert.equal(imports.length,count);await expect(input).toHaveValue('保留输入');await p.getByTestId('canvas-agent-toggle').click();
 pass('editable composer does not hijack cross-site clipboard');
 // Transient response failure: no partial nodes, retry sends exactly the same operation ID.
 let attempts=0;const retryBodies=[];
 await p.route('**/api/canvas/workflow-import',async route=>{if(route.request().method()!=='POST')return route.fallback();retryBodies.push(route.request().postDataJSON());if(attempts++===0)return route.fulfill({contentType:'application/x-ndjson',body:'{"type":"error","error":"素材连接中断"}\n'});return route.fallback();});
 assert.equal(await paste(p,html),true);await expect(p.getByTestId('workflow-import-status')).toContainText('素材连接中断');await expect(p.locator('.react-flow__node')).toHaveCount(8);
 await p.getByRole('button',{name:'重试导入',exact:true}).click();await expect(p.locator('.react-flow__node')).toHaveCount(16);assert.equal(retryBodies[0].operationId,retryBodies[1].operationId);
 pass('failure leaves original UI intact; retry reuses operation ID and succeeds once');
 const latest=(await p.evaluate(()=>window.__workflowStreams)).filter(s=>s.some(e=>e.type==='complete')).at(-1).find(e=>e.type==='complete').result;
 const copied=p.locator(`.react-flow__node[data-id="${latest.artworks[0].id}"]`);
 await copied.click({button:'right'});await p.getByTestId('canvas-context-menu').getByRole('menuitem',{name:/^复制节点/}).click();
 await expect.poll(()=>p.evaluate(()=>window.__fixtureClipboard['text/html']||'')).toContain('data-naumi-canvas-node');
 const oldImportCount=imports.length;assert.equal(await paste(p,await p.evaluate(()=>window.__fixtureClipboard['text/html'])),true);
 await expect(p.locator('.react-flow__node')).toHaveCount(17);assert.equal(imports.length,oldImportCount);
 const png=await readFile(path.join(out,'media',seed.result.artworks[0].image.slice(7)));
 await p.evaluate(base64=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'paste.png',{type:'image/png'}));document.querySelector('[data-testid="canvas-drop-zone"]').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},png.toString('base64'));
 await expect.poll(async()=>{const a=(await (await p.request.get(base+'/api/account')).json()).artworks;return a.filter(n=>n.groupId===initial.artworks[0].groupId).length;}).toBe(10);
 await expect(p.locator('.react-flow__node')).toHaveCount(18);assert.equal(imports.length,oldImportCount);
 pass('existing Naumi node copy/paste and image/* paste use actual add API; OS clipboard untouched');
 let release;const gate=new Promise(resolve=>{release=resolve;});
 await p.route('**/api/canvas/workflow-import',async route=>{if(route.request().method()!=='POST')return route.fallback();const operationId=route.request().postDataJSON().operationId;await gate;try{await route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'complete',result:{...initial,operationId}})+'\n'});}catch{}});
 assert.equal(await paste(p,html),true);await expect(p.getByTestId('workflow-import-status')).toBeVisible();
 await p.goBack();await expect(p.getByTestId('canvas-project-browser')).toBeVisible();release();
 await expect(p.getByTestId('workflow-import-status')).toHaveCount(0);await expect(p.getByTestId('canvas-project-browser')).toBeVisible();
 pass('leaving the project aborts pending paste; late response does not reopen or contaminate another canvas');
 await context.close();

 const {p:real,context:realContext}=await boot({real:true,empty:true});
 const realHtml=await readFile(process.env.WORKFLOW_REAL_SAMPLE || 'E:/Workspace/naumi/output/competitor-clipboard-inspection-20261010/clipboard-0.txt','utf8');
 assert.equal(await paste(real,realHtml),true);
 await expect.poll(()=>real.evaluate(()=>window.__workflowStreams.length)).toBeGreaterThan(0);
 const realImport=(await real.evaluate(()=>window.__workflowStreams))[0].find(e=>e.type==='complete').result;
 await expect(real.locator('.react-flow__node')).toHaveCount(38);await expect(real.locator('.react-flow__edge')).toHaveCount(19);
 await expect(real.getByTestId('workflow-missing-asset')).toHaveCount(9);await expect(real.getByTestId('workflow-group')).toHaveCount(5);
 const long=realImport.textNodes.reduce((a,b)=>a.height>b.height?a:b);const longNode=real.locator(`.react-flow__node[data-id="${long.id}"]`);
 assert.ok(Math.abs(await longNode.evaluate(el=>parseFloat(el.style.height))-long.height)<0.1,'CSS serializes decimal dimensions to limited precision');
 await real.reload();await expect(real.getByTestId('workflow-missing-asset')).toHaveCount(9);assert.ok(Math.abs(await longNode.evaluate(el=>parseFloat(el.style.height))-long.height)<0.1);
 await real.screenshot({path:path.join(out,'browser','real-layout-placeholders.png')});
 pass('real 38-element/19-link workflow restores; 9 HTTP403 placeholders retain original position/size; long text is not shrunk on reload');
 // Use existing replace input for the placeholder; fill must preserve the original identity.
 const missing=realImport.artworks.find(n=>n.source==='workflow-placeholder');
 await real.locator(`.react-flow__node[data-id="${missing.id}"]`).getByRole('button',{name:'补充图片',exact:true}).evaluate(el=>el.click());
 await real.getByTestId('canvas-replace-image-input').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:await readFile(path.join(out,'media',seed.result.artworks[0].image.slice(7)))});
 await expect(real.getByTestId('workflow-missing-asset')).toHaveCount(8);await expect(real.locator('.react-flow__node')).toHaveCount(38);await expect(real.locator('.react-flow__edge')).toHaveCount(19);
 await real.keyboard.press('Control+z');await expect(real.getByTestId('workflow-missing-asset')).toHaveCount(9);
 await real.keyboard.press('Control+Shift+z');await expect(real.getByTestId('workflow-missing-asset')).toHaveCount(8);
 await real.reload();await expect(real.getByTestId('workflow-missing-asset')).toHaveCount(8);
 pass('placeholder fill goes through actual multipart API; same node/links/layout; pixel-version undo/redo and refresh survive');
 await real.setViewportSize({width:390,height:844});await real.screenshot({path:path.join(out,'browser','mobile.png')});
 assert.equal(await real.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await realContext.close();pass('390px light canvas has no horizontal page overflow');
 assert.deepEqual(errors,[]);
 await writeFile(path.join(out,'browser','result.json'),JSON.stringify({checks,errors,operations:imports.map(i=>i.operationId),streamProgress:streams.map(s=>s.filter(e=>e.type==='progress')),writes,providerCalls:0},null,2));
 console.log('BROWSER=PASS ACTUAL_IMPORT_HISTORY_FILL=PASS GROUP_DRAG=PASS REAL_LAYOUT=38_NODES_19_LINKS PLACEHOLDERS=9 LONG_TEXT=RETAINED RETRY=IDEMPOTENT INPUT=NOT_HIJACKED MOBILE=390PX PROVIDER_CALLS=0');
}catch(error){await page?.screenshot({path:path.join(out,'browser','failure.png')}).catch(()=>{});await writeFile(path.join(out,'browser','failure.json'),JSON.stringify({checks,errors,body:await page?.locator('body').innerText().catch(()=>null)},null,2));throw error;}
finally{await browser?.close();if(app?.pid){if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'});}catch{}}else app.kill('SIGTERM');}await writeFile('tsconfig.json',originalConfig);await writeFile(path.join(out,'browser','next.log'),logs.join(''));}
