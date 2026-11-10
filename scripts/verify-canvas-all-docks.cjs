'use strict';
// Real Next + CanvasClient + React Flow. Run the opt-in all-docks loopback
// fixture first. This audit never submits paid generation or media processing.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const base=arg('--base','http://127.0.0.1:15372'),out=path.resolve(arg('--out','output/all-docks/baseline'));
assert.equal(new URL(base).hostname,'127.0.0.1');fs.mkdirSync(out,{recursive:true});
const cases=[
 {kind:'image',id:'placement-root',panel:'image-node-dock'},
 {kind:'pending',id:'placement-root',panel:'pending-node-dock'},
 {kind:'text',id:'text-dock-fixture',panel:'text-node-dock'},
 {kind:'video',id:'video-dock-one',panel:'video-node-dock'},
 {kind:'video-result',id:'audit-video-result',panel:'video-result-dock'},
 {kind:'audio-result',id:'audit-audio-source',panel:'video-result-dock'},
 ...Object.entries({character:'编辑角色',scene:'编辑场景',director:'打开3D导演台',audio:'编辑音频',timeline:'编辑多轨'}).map(([kind,open])=>({kind,id:'audit-'+kind,panel:kind+'-editor',open})),
];
const sizes=arg('--viewport','')?[arg('--viewport').split('x').map(Number)]:[[1440,900],[390,844],[1000,300]];
const long=Array.from({length:45},(_,i)=>`第 ${i+1} 段：晨光掠过街道，保留主体与自然光线，记录清晰完整的创作要求。`).join('\n');
async function geometry(panel){return panel.evaluate(el=>{
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
 const scrolls=[el,...el.querySelectorAll('*')].filter(e=>visible(e)&&['auto','scroll'].includes(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+2);
 const control=e=>({label:e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent.trim().slice(0,45),tag:e.tagName,box:rect(e),disabled:!!e.disabled});
 const controls=[...el.querySelectorAll('button,input,select,textarea,[role=textbox]')].filter(visible).map(control);
 return {box:rect(el),size:[innerWidth,innerHeight],mode:el.dataset.composerScroll,scrolls:scrolls.map(e=>({tag:e.tagName,body:e.hasAttribute('data-composer-body'),nested:scrolls.some(other=>other!==e&&other.contains(e)),box:rect(e)})),
  fields:[...el.querySelectorAll('textarea,[contenteditable=true]')].filter(visible).map(e=>({...control(e),height:e.clientHeight,scroll:e.scrollHeight})),
  controls,unnamed:controls.filter(e=>!e.label),horizontal:el.scrollWidth>el.clientWidth+2,
  outside:controls.filter(c=>c.box.x< -1||c.box.right>innerWidth+1),alerts:[...el.querySelectorAll('[role=alert]')].map(e=>e.textContent)};
 });}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),results=[],errors=[],external=[];
 try{
  for(const [width,height] of sizes)for(const item of cases){
   if(arg('--kind','')&&arg('--kind')!==item.kind)continue;
   await fetch(base+'/__fixture/all-docks/reset'+(args.includes('--populated')||item.kind==='audio-result'?'?mode=populated'+(args.includes('--new-audio-editor')?'&unbound=1':''):''),{method:'POST'});
   const name=`${item.kind}-${width}x${height}`,dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});
   const context=await browser.newContext({viewport:{width,height},locale:'zh-CN',serviceWorkers:'block'});
   await context.addCookies([{name:'naumi_locale',value:'zh',url:base}]);
   const page=await context.newPage();page.setDefaultTimeout(15000);
   page.on('pageerror',error=>errors.push({name,error:error.message}));
   await page.route('**/*',route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol)){external.push({name,url:u.origin});return route.abort();}return route.continue();});
   const result={name,kind:item.kind,samples:[],checks:[]};results.push(result);
   const panel=page.getByTestId(item.panel);
   const capture=async phase=>{const sample={phase,...await geometry(panel)};result.samples.push(sample);await page.screenshot({path:path.join(dir,phase+'.png')});return sample;};
   try{
    await page.goto(base+'/canvas?node='+item.id,{waitUntil:'domcontentloaded',timeout:120000});
    const node=page.locator(`.react-flow__node[data-id="${item.id}"]`);await node.waitFor({timeout:120000});
    const hide=page.getByRole('button',{name:'收起助手',exact:true});if(await hide.isVisible())await hide.click();
    if(item.kind==='pending'){
     await page.getByTestId('canvas-add-node-button').click();await page.getByTestId('canvas-create-menu').locator('[data-action="image-node"]').click();
    }else if(item.open)await node.getByRole('button',{name:item.open,exact:true}).first().click();
    else if(!await panel.isVisible())await node.click({position:{x:40,y:15}});
    await panel.waitFor({timeout:60000});await page.waitForTimeout(400);
    await capture('01-open');result.checks.push('OPEN');
    if(item.kind==='timeline'){
     result.initialActions=await panel.locator('footer button').evaluateAll(items=>items.map(e=>{const r=e.getBoundingClientRect();return {label:e.textContent.trim(),reachable:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
     await panel.getByRole('button',{name:'画面轨道 +',exact:true}).click();
     await panel.getByRole('button',{name:'撤销时间线编辑',exact:true}).click();
     await panel.getByRole('button',{name:'重做时间线编辑',exact:true}).click();result.checks.push('TRACK_UNDO_REDO');
     if(args.includes('--populated')){
      await panel.getByRole('button',{name:'主图',exact:true}).click();
      await panel.getByLabel('片段时长',{exact:true}).fill('2');
      await panel.getByRole('button',{name:'保存',exact:true}).click();
      await capture('06-selected-clip');result.checks.push('CLIP_INSPECT_EDIT_SAVE');
     }
    }
    if(item.kind==='audio'&&args.includes('--populated')){
     const start=panel.getByLabel('音频开始秒数',{exact:true});await expect(start).toBeEnabled();
     await start.fill('0.25');await panel.getByRole('button',{name:'保存',exact:true}).click();
     await capture('06-audio-edit');result.checks.push('DECODE_EDIT_SAVE');
    }
    const field=panel.locator('textarea:visible,[contenteditable=true]:visible').first();
    if(await field.count()&&await field.isEditable()){
     await field.fill(long);await page.waitForTimeout(400);await capture('02-long-text');result.checks.push('LONG_INPUT');
    }
    const expand=panel.getByRole('button',{name:/^展开(输入区|文字编辑窗口)$/});
    if(await expand.count()){
     await expand.click();await page.waitForTimeout(250);await capture('03-expanded');
     await panel.getByRole('button',{name:/^收起(输入区|文字编辑窗口)$/}).click();await page.waitForTimeout(250);await capture('04-collapsed');result.checks.push('EXPAND_COLLAPSE');
    }
    for(const label of item.kind==='image'||item.kind==='pending'?['更多图片参数']:item.kind==='video'?['视频生成参数','更多视频参数']:[]){
     await panel.getByRole('button',{name:label,exact:true}).click();
     const popup=page.getByTestId('canvas-node-action-panel');await popup.waitFor();
     const box=await popup.boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1,label+' viewport bounds');
     await page.screenshot({path:path.join(dir,'menu-'+label+'.png')});
     await page.keyboard.press('Escape');await expect(popup).toHaveCount(0);result.checks.push(label+'_ESCAPE');
    }
    // Inspect every bottom action's actual hit target after native scroll.
    const actions=panel.locator(item.kind.endsWith('-result')?'button':'footer button,[data-composer-actions] button').filter({visible:true});
    result.actions=[];
    for(let i=0;i<await actions.count();i++){
     const action=actions.nth(i);await action.scrollIntoViewIfNeeded();
     result.actions.push(await action.evaluate(e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')||e.textContent.trim(),reachable:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),disabled:e.disabled};}));
    }
    await capture('05-actions');
    if(item.kind==='audio-result'&&args.includes('--assert')){
     await expect(panel.getByRole('button',{name:/提取画面|裁剪视频|提取音频/})).toHaveCount(0);
     const before=(await(await fetch(base+'/__fixture/all-docks')).json()).nodes.audio.length;
     await page.getByTestId('video-node-toolbar').getByRole('button',{name:'下载音频',exact:true}).waitFor();
     await panel.getByRole('button',{name:'编辑音频',exact:true}).click();
     const editor=page.getByTestId('audio-editor');await editor.waitFor();
     await expect(editor.getByLabel('音频素材',{exact:true})).toHaveValue('audit-audio-source');
     await expect(editor.getByRole('button',{name:'播放',exact:true})).toBeEnabled();
     await page.screenshot({path:path.join(dir,'06-audio-editor.png')});
     const after=(await(await fetch(base+'/__fixture/all-docks')).json()).nodes.audio;
     assert.equal(after.length,before+(args.includes('--new-audio-editor')?1:0));
     assert.ok(after.some(n=>n.audio.sourceArtworkId==='audit-audio-source'));
     await page.keyboard.press('Escape');await expect(editor).toHaveCount(0);result.checks.push('AUDIO_RESULT_CORRECT_EDITOR_AND_SOURCE');
    }
    if(item.open){await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);result.checks.push('ESCAPE_CLOSE');}
   }catch(error){result.error=error.message;await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});}
   finally{await context.close();fs.writeFileSync(path.join(out,'REPORT.json'),JSON.stringify({results,errors,external,productionWrites:0,realSupplierCalls:0},null,2));}
   console.log(name+': '+(result.error?'ERROR '+result.error.split('\n')[0]:'captured '+result.samples.length+' states'));
  }
 }finally{await browser.close();}
 const problems=results.flatMap(r=>r.error?[r.name+': '+r.error.split('\n')[0]]:[
  ...(r.initialActions?.some(a=>!a.reachable)?[`${r.name}: footer initially clipped`]:[]),
  ...(r.actions?.some(a=>!a.reachable)?[`${r.name}: action unreachable`]:[]),
  ...r.samples.flatMap(s=>[
  ...(s.outside.length?[`${r.name}/${s.phase}: ${s.outside.length} controls outside viewport`]:[]),
  ...(s.scrolls.some(e=>e.nested)?[`${r.name}/${s.phase}: nested vertical scrolling`]:[]),
  ...(['image','pending'].includes(r.kind)&&s.box.height<Math.min(80,s.size[1]-220)?[`${r.name}/${s.phase}: unusable dock height`]:[]),
 ])]);
 fs.writeFileSync(path.join(out,'SUMMARY.json'),JSON.stringify({cases:results.length,problems,errors,external},null,2));console.log(JSON.stringify({cases:results.length,problems,errors}));
 if(args.includes('--assert')){assert.deepEqual(problems,[]);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);}
})();
