'use strict';
const assert=require('node:assert/strict');
const {expect}=require('@playwright/test');

module.exports=async({page,rootId,node,dock,body,cardBody,tab,instruction,load,saved,check,screenshot,generated})=>{
  const content=Array.from({length:90},(_,i)=>`第 ${i+1} 段：在画布上记录灵感，长文字应完整展开。A line of mixed English and 中文。`).join('\n');
  const metrics=()=>node(rootId).evaluate(el=>{
    const card=el.querySelector('[data-testid="text-node-card"]'),field=el.querySelector('textarea');
    return {height:el.offsetHeight,card:card.clientHeight,field:field.clientHeight,scroll:field.scrollHeight,
      cardScroll:card.scrollHeight,top:field.offsetTop,bottom:field.offsetTop+field.offsetHeight};
  });
  const noClipping=async()=>{
    try{await expect.poll(async()=>{const m=await metrics();return m.field>=m.scroll-1&&m.card>=m.cardScroll-1;}).toBe(true);}
    catch(error){console.log('CLIPPING_METRICS',await metrics());throw error;}
  };
  const singleDockScroll=async()=>{
    const result=await dock().evaluate(el=>{
      const body=el.querySelector('[data-composer-body]'),field=el.querySelector('textarea');
      const scrolls=n=>!!n&&['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+1;
      return {count:[el,body,field].filter(scrolls).length,field:field.clientHeight,mode:el.dataset.composerScroll};
    });
    assert.ok(result.count<=1,JSON.stringify(result));assert.ok(result.field>=112,JSON.stringify(result));
  };
  const initial=await metrics();assert.ok(initial.height>=220&&initial.height<=260);check('EMPTY_NODE_RESERVED_FRAME');
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.evaluate(text=>navigator.clipboard.writeText(text),content);
  await body().focus();await body().press('Control+v');await expect.poll(()=>saved(rootId).content).toBe(content);await noClipping();
  assert.ok((await metrics()).height>1200);await singleDockScroll();check('PASTED_TEXT_GROWS_BEYOND_OLD_CAP_AND_NO_NESTED_SCROLL');
  await screenshot('long-text-desktop');
  await load(rootId);await expect(cardBody(rootId)).toHaveValue(content);await noClipping();check('RELOAD_RECOMPUTES_CONTENT_HEIGHT');
  // Deleting and entering gradually exercises the same controlled-render path
  // used whenever content arrives; no provider streaming is claimed here.
  await body().fill('');await expect.poll(()=>saved(rootId).content).toBe('');await noClipping();
  let previous=0;
  for(const length of [4,18,70]){
    await body().fill(content.split('\n').slice(0,length).join('\n'));await noClipping();
    const next=(await metrics()).height;assert.ok(next>=previous);previous=next;
  }
  check('INCREMENTAL_CONTENT_UPDATES_GROW_WITHOUT_CLIPPING');
  const sample=content.split('\n').slice(0,8).join('\n');
  await body().fill(sample);await expect.poll(()=>saved(rootId).content).toBe(sample);await load(rootId);
  const widthBefore=saved(rootId).width;
  const handle=node(rootId).locator('.react-flow__resize-control.handle.top.right');
  await page.waitForTimeout(400); // finish the existing deep-link viewport animation before dragging
  const grip=await handle.boundingBox();assert.ok(grip);
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
  await page.mouse.move(grip.x+grip.width/2-50,grip.y+grip.height/2,{steps:8});await page.mouse.up();
  await expect.poll(()=>saved(rootId).width).toBeLessThan(widthBefore);await noClipping();
  await dock().getByRole('button',{name:'关闭创作栏',exact:true}).click();await screenshot('text-node-auto-height');
  await node(rootId).getByTestId('text-node-title').click();await expect(dock()).toBeVisible();
  check('MANUAL_WIDTH_CHANGE_REWRAPS_AND_REMEASURES');
  await body().fill('');await expect.poll(()=>saved(rootId).content).toBe('');
  generated(content);await tab('AI 写作').click();await instruction().fill('生成一份较长的文字');await instruction().press('Control+Enter');
  await expect(cardBody(rootId)).toHaveValue(content,{timeout:20000});await noClipping();check('ACTUAL_GENERATE_RESULT_EXPANDS_INITIAL_FRAME');
  await page.getByRole('button',{name:'展开文字编辑窗口',exact:true}).click();await singleDockScroll();await screenshot('text-dock-expanded');
  await page.getByRole('button',{name:'收起文字编辑窗口',exact:true}).click();await singleDockScroll();check('EXPAND_COLLAPSE_SINGLE_SCROLL_SURFACE');
  // Font settings use the real history endpoint and reload path.
  await page.evaluate(async({id})=>{
    await fetch('/api/canvas/history',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operations:[{type:'node-settings',id,settings:{locked:false,order:0,text:{fontSize:30,fontWeight:'600',color:null,align:'left',lineHeight:2}}}]})});
  },{id:rootId});
  const oldHeight=(await metrics()).height;await load(rootId);await noClipping();assert.ok((await metrics()).height>oldHeight);check('FONT_AND_LINE_HEIGHT_REMEASURE');
  for(const size of [{width:390,height:844},{width:1000,height:500},{width:1000,height:300}]){
    await page.setViewportSize(size);await load(rootId);await singleDockScroll();await noClipping();
    const before=await dock().boundingBox();await page.waitForTimeout(350);const after=await dock().boundingBox();
    assert.ok(Math.abs(before.height-after.height)<2,'Dock geometry must settle');
    const action=dock().locator('[data-text-primary]');await action.scrollIntoViewIfNeeded();
    assert.ok(await action.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'Submit remains reachable');
    await screenshot(`text-dock-${size.width}x${size.height}`);check(`SINGLE_SCROLL_STABLE_${size.width}x${size.height}`);
  }
};
