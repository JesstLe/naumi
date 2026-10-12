import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium, webkit, expect as rawExpect} from '@playwright/test';

const baseline = process.argv.includes('--baseline');
const engine = process.env.DESKTOP_ENGINE || 'edge';
const dist = process.env.DESKTOP_DIST || '.next-desktop-input-build';
const out = path.resolve(process.env.DESKTOP_EVIDENCE || `output/canvas-desktop-input-20261012/${baseline?'baseline-browser':engine}`);
await mkdir(out, {recursive:true});
const expect = rawExpect.configure({timeout:25000}), logs=[], checks=[], errors=[];
const pass = label => {checks.push(label); console.log('PASS '+label);};
let app, browser, page;
try {
  const socket=createServer(); await new Promise(r=>socket.listen(0,'127.0.0.1',r));
  const port=socket.address().port; await new Promise(r=>socket.close(r));
  const base=`http://127.0.0.1:${port}`;
  app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{env:{...process.env,NEXT_DIST_DIR:dist,DATABASE_URL:'',NEXT_TELEMETRY_DISABLED:'1',SETTINGS_SECRET:randomUUID(),VIDEO_WORKER_SECRET:randomUUID()},stdio:['ignore','pipe','pipe']});
  app.stdout.on('data',c=>logs.push(c.toString()));app.stderr.on('data',c=>logs.push(c.toString()));
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'Next server starts');
  browser=await (engine==='webkit'?webkit:chromium).launch({...(engine==='edge'?{channel:'msedge'}:{}),headless:true});
  for(const platform of baseline?['windows']:['windows','mac']) {
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',userAgent:platform==='mac'?'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'});
    await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
    await context.addInitScript(({platform})=>{Object.defineProperty(navigator,'platform',{get:()=>platform==='mac'?'MacIntel':'Win32'});Object.defineProperty(navigator,'userAgentData',{get:()=>undefined});localStorage.setItem('theme','light');localStorage.setItem('nv:canvas:bg','light');localStorage.setItem('nv:canvas:last','tree:edge-root');},{platform});
    const now=new Date().toISOString(), email=`edge-${platform}@example.test`;
    const user={name:'桌面验收',email,plan:'starter',creditsTotal:99999,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[],canHigh:true};
    const root={id:'edge-root',title:'源图片',category:'main',prompt:'fixture',createdAt:now,status:'completed',image:base+'/demos/suite-demo/suppl-src.png',gradient:'',origin:'canvas',source:'canvas-add',groupId:'edge-root',width:1024,height:1024,canvasWidth:260,canvasHeight:260,canvasX:100,canvasY:120,ratio:'1:1',resolution:'1K'};
    let arts=[root,{...root,id:'edge-child',title:'目标图片',source:'generate',parentId:root.id,canvasX:730}];
    let texts=[{id:'text-edge',projectKey:'tree:edge-root',title:'产品文字',content:'测试文字',prompt:'',status:'completed',canvasX:730,canvasY:650,width:300,height:240,sourceIds:[],targetIds:[],productIds:[root.id],createdAt:now,updatedAt:now}];
    const mutations=[], providerCalls=[];let failCut=false,failHistory=false,delayCut=0;
    const model={id:'gpt-image-2',label:'GPT Image 2',modality:'image',supportsEdit:true,nativeResolutions:['1K','2K']};
    page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await context.route('**/api/**',async route=>{
      const req=route.request(),url=new URL(req.url()),p=url.pathname,m=req.method();
      if(m!=='GET')mutations.push({path:p,method:m,body:req.postDataJSON()});
      if(p==='/api/config')return route.fulfill({json:{db:true,multiUser:true,authMode:'mock',commerceVisible:false,imageModels:[model],defaultImageModel:model.id}});
      if(p==='/api/auth/session')return route.fulfill({json:{user}});
      if(p==='/api/account')return route.fulfill({json:{persisted:true,user,artworks:arts}});
      if(p==='/api/artworks/get')return route.fulfill({json:{artworks:arts.filter(a=>url.searchParams.get('ids')?.split(',').includes(a.id))}});
      if(p==='/api/projects')return route.fulfill({json:{names:{'tree:edge-root':'连线验收'}}});
      if(p==='/api/models')return route.fulfill({json:{managed:false,supported:true,version:1,models:[model],defaultModelId:model.id}});
      if(p==='/api/text-models')return route.fulfill({json:{models:['gpt-4o'],defaultModel:'gpt-4o'}});
      if(p==='/api/billing/catalog')return route.fulfill({json:{version:1,features:Object.fromEntries(['image.generate','canvas.image','canvas.expand','canvas.text-generate','canvas.assistant','tool.cutout'].map(f=>[f,{enabled:true,prices:{low:{'1K':2},medium:{'1K':4},high:{'1K':8}}}])),products:[],effective:{commerce:false,metering:true,recharge:false}}});
      if(p==='/api/canvas/text-nodes'){
        if(m==='POST'){const n=req.postDataJSON();texts=texts.map(t=>t.id===n.id?n:t);return route.fulfill({json:{persisted:true,node:n}});}
        return route.fulfill({json:{persisted:true,nodes:texts}});
      }
      if(p==='/api/artworks/parents'&&m==='DELETE'){
        if(delayCut)await new Promise(r=>setTimeout(r,delayCut));
        if(failCut)return route.fulfill({status:500,json:{error:'删除失败'}});
        const b=req.postDataJSON();arts=arts.map(a=>a.id===b.id?{...a,parentId:a.parentId===b.parentId?null:a.parentId,parentIds:(a.parentIds||[]).filter(id=>id!==b.parentId)}:a);
      }
      if(p==='/api/canvas/history') {
        if(failHistory)return route.fulfill({status:500,json:{error:'保存失败'}});
        for(const op of req.postDataJSON().operations){
        if(op.type==='parent')arts=arts.map(a=>a.id===op.id?{...a,parentId:op.add?op.parentId:null}:a);
        if(op.type==='text-patch')texts=texts.map(n=>n.id===op.id?{...n,...op.fields}:n);
        }
      }
      if(p==='/api/artworks/add') {const b=req.postDataJSON(),id='edge-copy-'+mutations.filter(m=>m.path===p).length;arts.push({...root,...b.src,id,parentId:b.parentId,canvasX:b.x,canvasY:b.y,source:'canvas-add'});return route.fulfill({json:{ok:true,id}});}
      if(p==='/api/canvas/nodes/delete'){const b=req.postDataJSON();arts=arts.filter(a=>!b.artworkIds.includes(a.id));texts=texts.filter(n=>!b.textIds.includes(n.id));}
      if(p==='/api/generate-image'||p.startsWith('/api/agent'))providerCalls.push(p);
      return route.fulfill({json:{ok:true,persisted:true,nodes:[],items:[],tasks:[],favs:[],settings:{},names:{},records:[],sessions:[],artworks:[]}});
    });
    await context.route('**/demos/suite-demo/suppl-src.png',async route=>route.fulfill({contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')}));
    await page.goto(base+'/canvas');await expect(page.getByTestId('canvas-main-toolbar')).toBeVisible();
    await page.getByRole('button',{name:'收起助手',exact:true}).click();
    // RF puts data-id on the edge group in v12. Read the stable identity from its attributes.
    async function edgeGroup(target,source) {
      const group=source?page.locator(`.react-flow__edge[aria-label="Edge from ${source} to ${target}"]`).first():page.locator(`.react-flow__edge[data-id$="${target}"]`).first();
      await expect(group).toBeAttached();return group;
    }
    async function clickEdge(target,source){
      const g=await edgeGroup(target,source);const p=g.locator('path.cw-base');await expect(p).toBeAttached();
      for(let attempt=0;attempt<4;attempt++) {
      await page.waitForTimeout(250);
      const point=await p.evaluate(p=>{const m=p.getScreenCTM();for(const t of [0.52,0.3,0.7,0.15,0.85,0.4,0.6,0.08,0.92]){const v=p.getPointAtLength(p.getTotalLength()*t),x=m.a*v.x+m.c*v.y+m.e,y=m.b*v.x+m.d*v.y+m.f;if(document.elementFromPoint(x,y)?.closest('.react-flow__edge')===p.closest('.react-flow__edge'))return {x,y};}throw new Error('Edge has no exposed hit area: '+p.closest('.react-flow__edge')?.getAttribute('data-id'));});
      await page.mouse.click(point.x,point.y);await page.mouse.move(40,500);await page.waitForTimeout(180);
      if((await g.getAttribute('class'))?.split(' ').includes('selected'))break;
      }
      await expect(g).toHaveClass(/\bselected\b/);
      return g;
    }
    const mod=platform==='mac'?'Meta':'Control',del=platform==='mac'?'Backspace':'Delete';
    async function historyKey(key){await expect(page.locator('.fixed.inset-0.cursor-wait')).toHaveCount(0);await page.waitForTimeout(120);await page.keyboard.press(key);await page.waitForTimeout(120);await expect(page.locator('.fixed.inset-0.cursor-wait')).toHaveCount(0);}
    await expect(page.locator('.react-flow__node[data-id="edge-child"]')).toBeVisible();
    await page.locator('.react-flow__node[data-id="edge-child"] img').click();
    await clickEdge('edge-child');
    await page.screenshot({path:path.join(out,`${platform}-selected-edge.png`)});
    if(baseline)console.log('BASELINE_FOCUS '+JSON.stringify(await page.evaluate(()=>({active:document.activeElement?.outerHTML,blocked:[...document.querySelectorAll('[data-canvas-hotkeys-blocked="true"]:not(button), .fixed.inset-0')].map(e=>e.outerHTML.slice(0,400))}))));
    await page.keyboard.press(del);await page.waitForTimeout(700);
    const nodeDeletes=mutations.filter(m=>m.path==='/api/canvas/nodes/delete').length, cuts=mutations.filter(m=>m.path==='/api/artworks/parents'&&m.method==='DELETE').length;
    if(baseline){assert.ok(nodeDeletes>0||cuts===0,'baseline reproduces wrong deletion/no cut');console.log(`BASELINE_EDGE_DELETE=BUG nodeDeletes=${nodeDeletes} edgeCuts=${cuts}`);await writeFile(path.join(out,'baseline-observation.json'),JSON.stringify({nodeDeletes,cuts,mutations,errors},null,2));break;}
    assert.equal(nodeDeletes,0,'selecting an edge must never delete the previously selected node');assert.equal(cuts,1);await expect(page.locator('.react-flow__node[data-id="edge-child"]')).toBeVisible();
    pass(`${platform}: clicked edge deletes only the edge with ${del}`);
    await historyKey(`${mod}+z`);await expect.poll(()=>arts[1].parentId).toBe(root.id);await clickEdge('edge-child');
    await historyKey(`${mod}+Shift+z`);await expect.poll(()=>arts[1].parentId).toBe(null);
    await historyKey(`${mod}+z`);await expect.poll(()=>arts[1].parentId).toBe(root.id);
    pass(`${platform}: undo and Shift+modifier+Z redo persist connection changes`);
    failCut=true;await clickEdge('edge-child');await page.keyboard.press(del);await page.waitForTimeout(700);await expect((await edgeGroup('edge-child'))).toBeAttached();assert.equal(arts[1].parentId,root.id);
    failCut=false;await clickEdge('edge-child');delayCut=450;const before=mutations.length;await page.keyboard.press(del);await page.keyboard.press(del);await page.waitForTimeout(900);assert.equal(mutations.slice(before).filter(m=>m.path==='/api/artworks/parents').length,1);delayCut=0;
    pass(`${platform}: failed edge deletion restores line; repeat press does not duplicate request`);
    await historyKey(`${mod}+z`);await expect.poll(()=>arts[1].parentId).toBe(root.id);
    failHistory=true;await clickEdge('text-edge');await page.keyboard.press(del);await page.waitForTimeout(350);assert.deepEqual(texts[0].productIds,[root.id]);await expect((await edgeGroup('text-edge'))).toBeAttached();failHistory=false;
    await clickEdge('text-edge');await page.keyboard.press(del);await expect.poll(()=>texts[0].productIds.length).toBe(0);
    await historyKey(`${mod}+z`);await expect.poll(()=>texts[0].productIds).toEqual([root.id]);
    await historyKey(platform==='mac'?`${mod}+Shift+z`:`${mod}+y`);await expect.poll(()=>texts[0].productIds.length).toBe(0);
    pass(`${platform}: product-bound image/text line removes actual productIds; undo and redo restore fields`);
    await page.reload();await expect(page.getByTestId('canvas-main-toolbar')).toBeVisible();await expect(page.locator('.react-flow__node')).toHaveCount(3);
    assert.equal((await page.locator('.react-flow__edge').evaluateAll(gs=>gs.map(g=>g.getAttribute('data-id')))).filter(id=>id?.endsWith('text-edge')).length,0);
    pass(`${platform}: disconnected text references stay disconnected after reload`);
    await clickEdge('edge-child');
    await page.getByRole('button',{name:'画布 Agent',exact:true}).click();
    const input=page.getByTestId('canvas-assistant-panel').locator('textarea').first();await expect(input).toBeVisible();await input.fill('测试abc');await input.press('Backspace');await expect(input).toHaveValue('测试ab');assert.equal(arts[1].parentId,root.id);
    await page.getByRole('button',{name:'收起助手',exact:true}).click();await clickEdge('edge-child');
    const composing=await page.evaluate(()=>{const e=new KeyboardEvent('keydown',{key:'Delete',code:'Delete',isComposing:true,bubbles:true,cancelable:true});document.activeElement.dispatchEvent(e);return e.defaultPrevented;});assert.equal(composing,false);assert.equal(arts[1].parentId,root.id);
    await page.locator('.react-flow__pane').click({position:{x:30,y:130}});await page.keyboard.press(del);assert.equal(arts[1].parentId,root.id);
    pass(`${platform}: editor Backspace and pane deselection never delete an old selected edge`);
    const viewport=()=>page.locator('.react-flow__viewport').getAttribute('style');const old=await viewport();await page.keyboard.press(`${mod}+=`);await expect.poll(viewport).not.toBe(old);await page.keyboard.press(`${mod}+-`);await page.keyboard.press(`${mod}+0`);
    await page.keyboard.press('h');await expect(page.locator('.canvas-hand-tool')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.canvas-hand-tool')).toHaveCount(0);
    await page.keyboard.press('m');await expect(page.locator('.canvas-box-select')).toBeVisible();await page.keyboard.press('v');await expect(page.locator('.canvas-box-select')).toHaveCount(0);
    pass(`${platform}: modifier zoom/fit and hand/marquee/move switching work`);
    await page.locator('.react-flow__node[data-id="edge-child"] img').click();
    await page.getByTestId('canvas-main-toolbar').locator('[data-tool="more"]').click();await page.getByRole('menuitem',{name:'快捷键与帮助',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'快捷键与帮助'});await expect(dialog).toBeVisible();await expect(dialog.locator('[data-shortcut="delete"]')).toContainText(platform==='mac'?'⌫':'Del');
    const n=mutations.length;await dialog.getByRole('button',{name:platform==='mac'?'macOS':'Windows',exact:true}).focus();await page.keyboard.press(del);await historyKey(`${mod}+z`);await page.keyboard.press('Shift+t');assert.equal(mutations.length,n);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
    pass(`${platform}: modal help blocks mutations and exposes correct delete key labels`);
    await page.locator('.react-flow__node[data-id="edge-child"] img').click();await page.keyboard.press(`${mod}+c`);
    await page.evaluate(()=>{const d=new DataTransfer();d.setData('application/x-naumi-canvas-node','edge-child');document.querySelector('.react-flow__pane').dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}));});
    await expect.poll(()=>arts.length).toBe(3);await expect(page.locator('.react-flow__node[data-id="edge-copy-1"]')).toBeVisible();
    pass(`${platform}: modifier copy and clipboard-event paste create a node without orb blocking`);
    await page.locator('.react-flow__pane').click({position:{x:20,y:150}});
    await page.locator('.react-flow__node[data-id="edge-child"] img').click({button:'right'});await expect(page.getByRole('menu')).toBeVisible();await page.keyboard.press('Escape');
    pass(`${platform}: right-click node actions open and dismiss`);
    await page.keyboard.press(`${mod}+0`);await page.waitForTimeout(300);
    await page.locator('.react-flow__pane').click({position:{x:20,y:150}});
    const empty=()=>page.evaluate(()=>{for(let y=110;y<850;y+=120)for(let x=80;x<1200;x+=120)if(document.elementFromPoint(x,y)?.classList.contains('react-flow__pane')&&document.elementFromPoint(x+65,y+40)?.classList.contains('react-flow__pane'))return {x,y};throw new Error('No clear pane point');});
    let point=await empty();const transform=await viewport();await page.mouse.move(point.x,point.y);await page.mouse.wheel(100,130);await expect.poll(viewport).not.toBe(transform);
    point=await empty();const beforeDrag=await viewport();await page.locator('.react-flow__pane').click({position:{x:10,y:110}});await page.keyboard.down('Space');await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+65,point.y+40,{steps:5});await page.mouse.up();await page.keyboard.up('Space');await expect.poll(viewport).not.toBe(beforeDrag);
    pass(`${platform}: two-axis wheel pan and Space+drag pan change viewport`);
    texts=[{...texts[0],sourceIds:[root.id],productIds:[root.id],targetIds:['edge-child']},{...texts[0],id:'text-second',title:'下游文字',sourceIds:['text-edge'],productIds:[],targetIds:[],canvasX:1100,canvasY:650}];
    await page.reload();await expect(page.getByTestId('canvas-main-toolbar')).toBeVisible();await page.keyboard.press(`${mod}+0`);await page.waitForTimeout(400);
    await clickEdge('text-edge',root.id);await page.keyboard.press(del);await expect.poll(()=>texts[0].sourceIds).toEqual([]);assert.deepEqual(texts[0].productIds,[]);
    await clickEdge('text-second','text-edge');await page.keyboard.press(del);await expect.poll(()=>texts[1].sourceIds).toEqual([]);
    await clickEdge('edge-child','text-edge');await page.keyboard.press(del);await expect.poll(()=>texts[0].targetIds).toEqual([]);
    assert.equal(arts.length,3);assert.equal(texts.length,2);pass(`${platform}: image/text dual references, text/text and text/image cuts preserve all nodes`);
    await page.locator('.react-flow__node[data-id="edge-root"] img').click();
    await page.waitForTimeout(400);
    const handle=page.locator('.react-flow__node[data-id="edge-root"] .react-flow__handle[data-handleid="out"]');
    const box=await handle.boundingBox();assert.ok(box);const drop=await page.evaluate(()=>{for(let x=1200;x>=1080;x-=40)for(let y=430;y>=110;y-=80)if(document.elementFromPoint(x,y)?.classList.contains('react-flow__pane'))return {x,y};throw new Error('No clear right-side drop point');});await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(drop.x,drop.y,{steps:10});await page.mouse.up();
    await page.getByRole('button',{name:/图形生成/}).click();
    const pending=page.locator('.react-flow__node[data-id^="pend-"]').first();await expect(pending).toBeVisible();const pendingId=await pending.getAttribute('data-id');
    await page.locator('.react-flow__pane').click({position:{x:20,y:150}});await page.keyboard.press(`${mod}+0`);await page.waitForTimeout(350);
    await clickEdge(pendingId,root.id);const priorMutations=mutations.length;await page.keyboard.press(del);await expect(page.locator(`.react-flow__edge[data-id$="${pendingId}"]`)).toHaveCount(0);await expect(pending).toBeVisible();
    assert.equal(mutations.length,priorMutations,'pending inputs must not send DELETE to a nonexistent artwork');
    await historyKey(`${mod}+z`);await expect((await edgeGroup(pendingId,root.id))).toBeAttached();await historyKey(`${mod}+Shift+z`);await expect(page.locator(`.react-flow__edge[data-id$="${pendingId}"]`)).toHaveCount(0);
    pass(`${platform}: pending input disconnection and undo/redo stay local without deleting placeholder`);
    assert.equal(providerCalls.length,0);await page.screenshot({path:path.join(out,`${platform}-result.png`)});await context.close();
  }
  assert.deepEqual(errors,[]);await writeFile(path.join(out,'result.json'),JSON.stringify({baseline,engine,checks,errors,providerCalls:0,nativeMac:false},null,2));
  if(!baseline)console.log(`DESKTOP_EDGE_BROWSER=PASS engine=${engine} platforms=windows,mac-simulated checks=${checks.length} PROVIDER_CALLS=0 NATIVE_MAC=NOT_RUN`);
}catch(error){await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'failure-details.json'),JSON.stringify({checks,errors,body:await page?.locator('body').innerText().catch(()=>null)},null,2));throw error;}
finally{await browser?.close();if(app?.pid){if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'});}catch{}}else app.kill('SIGTERM');}await writeFile(path.join(out,'next.log'),logs.join(''));}
