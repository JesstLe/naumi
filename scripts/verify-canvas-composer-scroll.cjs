'use strict';
// Actual Next/CanvasClient/video composer, using serve-canvas-unified-dock-fixture
// as its loopback API boundary. No generation or production persistence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const base=process.env.CANVAS_COMPOSER_SCROLL_URL||'http://127.0.0.1:15364';
assert.equal(new URL(base).hostname,'127.0.0.1');
const out=path.resolve(process.env.CANVAS_COMPOSER_SCROLL_OUT||'output/text-layout/video');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),checks=[],errors=[];
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/canvas/workflow-import'&&route.request().method()==='GET')return route.fulfill({json:{manifests:[]}});
  return ['127.0.0.1','localhost'].includes(url.hostname)||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();
 });
 const dock=page.getByTestId('video-node-dock');
 const inspect=()=>dock.evaluate(el=>{
  const body=el.querySelector('[data-composer-body]'),editor=el.querySelector('[role="textbox"]');
  const scrollers=[el,...el.querySelectorAll('*')].filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+1);
  return {count:scrollers.length,mode:el.dataset.composerScroll,editor:editor.offsetHeight,body:body.clientHeight,height:el.offsetHeight,scrolls:scrollers.map(n=>n===el?'shell':n===body?'body':n.tagName)};
 });
 try{
  for(const size of [{width:1440,height:900},{width:390,height:844},{width:1000,height:300}]){
   await page.setViewportSize(size);await page.goto(base+'/canvas?node=video-dock-one',{waitUntil:'domcontentloaded',timeout:120000});
   await page.locator('[data-id="video-dock-one"]').waitFor({timeout:120000});
   const collapse=page.getByRole('button',{name:'收起助手',exact:true});if(await collapse.isVisible())await collapse.click();
   if(!await dock.isVisible())await page.locator('[data-id="video-dock-one"]').click({position:{x:60,y:15}});
   const editor=dock.getByRole('textbox',{name:'视频描述',exact:true});await editor.fill('镜头缓慢推进，晨光掠过街道。');
   await expect.poll(async()=>(await inspect()).editor).toBeGreaterThanOrEqual(112);
   await editor.fill(Array.from({length:70},(_,i)=>`镜头 ${i+1}：晨光掠过街道，人物缓缓向前走。`).join('\n'));
   await expect.poll(async()=>(await inspect()).count).toBe(1);
   const before=await inspect();await page.waitForTimeout(350);assert.deepEqual(await inspect(),before,'layout must settle');
   const save=dock.getByRole('button',{name:'保存设置',exact:true});await save.scrollIntoViewIfNeeded();
   assert.ok(await save.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
   checks.push({size,...await inspect()});await page.screenshot({path:path.join(out,`${size.width}x${size.height}.png`)});
  }
  assert.deepEqual(errors,[]);const state=await(await fetch(base+'/__fixture/state')).json();assert.equal(state.generations.length,0);
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,errors,realSupplierCalls:0},null,2));console.log('COMPOSER_SCROLL=PASS '+JSON.stringify(checks));
 }catch(error){await page.screenshot({path:path.join(out,'failure.png')});fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({error:error.stack,checks,errors,metrics:await inspect().catch(()=>null)},null,2));throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
