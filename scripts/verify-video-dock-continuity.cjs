const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const base=arg('--base','http://127.0.0.1:15472'),out=path.resolve(arg('--out','output/video-continuity'));
assert.equal(new URL(base).hostname,'127.0.0.1');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});let page;let stage="SETUP";const errors=[];
 try{
 await fetch(base+'/__fixture/reset');await fetch(base+'/__fixture/all-docks/reset',{method:'POST'});
 const initial=(await(await fetch(base+'/__fixture/state')).json()).videos[0];
 await fetch(base+'/api/canvas/video-nodes/video-dock-one',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:initial.revision,config:{...initial.config,mode:'single_image'},inputs:[{id:'reference-one',nodeId:'placement-root',kind:'image',role:'first_frame',value:base+'/demos/suite-demo/suppl-src.png'}]})});
 const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN'});await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol))return route.abort();return route.continue();});
 const state=async()=>await(await fetch(base+'/__fixture/state')).json();
 async function load(id){await page.goto(base+'/canvas?node='+id,{waitUntil:'domcontentloaded',timeout:120000});const node=page.locator(`.react-flow__node[data-id="${id}"]`);await node.waitFor({timeout:120000});const hide=page.getByRole('button',{name:'收起助手',exact:true});if(await hide.isVisible())await hide.click();if(!await page.getByTestId('video-node-dock').isVisible())await node.click({position:{x:40,y:15}});}
 const dock=page.getByTestId('video-node-dock'),prompt=dock.getByRole('textbox',{name:'视频描述',exact:true});
 await load('video-dock-one');await dock.waitFor();
 const original=(await state()).videos[0];const text='晨光掠过城市，镜头平稳推进。';
 await prompt.fill(text);await dock.getByRole('button',{name:'保存设置',exact:true}).click();await expect.poll(async()=>(await state()).videos[0].config.prompt).toBe(text);
 await page.screenshot({path:path.join(out,'01-before.png')});
 await dock.getByRole('button',{name:'生成视频',exact:true}).click();await expect(dock.getByRole('button',{name:'停止',exact:true})).toBeVisible();
 assert.equal((await state()).generations.length,1);
 const complete=await(await fetch(base+'/__fixture/video-complete?count=4')).json();assert.equal(complete.ok,true);
 await expect(dock.getByRole('button',{name:'生成视频',exact:true})).toBeVisible({timeout:15000});
 await expect(prompt).toHaveText(text);assert.equal(await page.getByTestId('video-result-dock').count(),0);
 await page.screenshot({path:path.join(out,'02-completed-native.png')});
 stage="RESULT_COMPOSER";
 for(const id of complete.ids){await load(id);await dock.waitFor({timeout:10000});await expect(prompt).toHaveText(text);assert.equal(await page.getByTestId('video-result-dock').count(),0);await expect(dock.getByRole('button',{name:'视频生成参数',exact:true})).toBeVisible();await page.waitForTimeout(500);
 const box=await dock.boundingBox();fs.writeFileSync(path.join(out,'GEOMETRY.json'),JSON.stringify(await dock.evaluate(el=>({box:el.getBoundingClientRect().toJSON(),style:el.getAttribute('style'),scroll:el.dataset.composerScroll,body:el.querySelector('[data-composer-body]').getBoundingClientRect().toJSON(),parent:el.parentElement.getBoundingClientRect().toJSON(),footer:el.querySelector('footer').getBoundingClientRect().toJSON(),wrapper:el.querySelector('[data-testid="video-compact-composer"]').getBoundingClientRect().toJSON()})),null,2));assert.ok(box.y>=0&&box.y+box.height<=900,'reference composer within viewport');
 const generate=dock.getByRole('button',{name:'生成视频',exact:true});await expect(generate).toBeInViewport();
 }
 await page.screenshot({path:path.join(out,'03-completed-result.png')});
 for(const [width,height] of [[390,844],[1000,300]]){
  await page.setViewportSize({width,height});await load(complete.ids[0]);await dock.waitFor();await page.waitForTimeout(500);
  const box=await dock.boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1&&box.y>=-1&&box.y+box.height<=height+1,'reference dock bounded '+width);
  const action=dock.getByRole('button',{name:'生成视频',exact:true});await action.scrollIntoViewIfNeeded();assert.equal(await action.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
  await page.screenshot({path:path.join(out,`result-${width}x${height}.png`)});
 }
 await page.setViewportSize({width:1440,height:900});await load(complete.ids[0]);await dock.waitFor();
 await prompt.fill(text+' 再次编辑。');await dock.getByRole('button',{name:'保存设置',exact:true}).click();await expect.poll(async()=>(await state()).videos[0].config.prompt).toBe(text+' 再次编辑。');
 await load(complete.ids[0]);await expect(prompt).toHaveText(text+' 再次编辑。');
 const final=await state();for(const key of ['modelId','providerId','durationSeconds','resolution','aspectRatio','mode'])assert.equal(final.videos[0].config[key],original.config[key],key);
 assert.deepEqual(final.videos[0].inputs,original.inputs);
 await fetch(base+'/__fixture/lock?value=1');await load(complete.ids[0]);await expect(dock.getByRole('button',{name:'保存设置',exact:true})).toBeDisabled();await expect(dock.getByRole('button',{name:'生成视频',exact:true})).toBeDisabled();assert.equal(await prompt.getAttribute('contenteditable'),'false');
 await fetch(base+'/__fixture/lock?value=0');await load('audit-video-result');await page.getByTestId('video-result-dock').waitFor();assert.equal(await dock.count(),0);assert.equal(final.generations.length,1);assert.equal(final.paidCalls,0);assert.deepEqual(errors,[]);
 if(fs.existsSync(path.join(out,'FAILURE.txt')))fs.unlinkSync(path.join(out,'FAILURE.txt'));
 console.log('VIDEO_DOCK_CONTINUITY=PASS SAVED=1 SUBMITTED=1 RESULTS=4 RELOAD=PASS PARAMETERS=PASS REFERENCES=PASS LOCKED=PASS IMPORTED=PASS PAID_CALLS=0');
 fs.writeFileSync(path.join(out,'REPORT.json'),JSON.stringify({status:'PASS',errors,final},null,2));
 }catch(e){if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});console.error(`VIDEO_DOCK_CONTINUITY=FAIL STAGE=${stage}`);fs.writeFileSync(path.join(out,"FAILURE.txt"),String(e.stack));process.exitCode=1;}finally{await browser.close();}
})();
