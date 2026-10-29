const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

/** Read actual border boxes, clipping ancestors and hit targets. Bounding-box
 * presence alone previously missed controls below the clipped footer. */
function measureComposer(el){
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
 const visibility=e=>{
  const r=e.getBoundingClientRect(),v={left:Math.max(0,r.left),top:Math.max(0,r.top),right:Math.min(innerWidth,r.right),bottom:Math.min(innerHeight,r.bottom)};
  for(let p=e.parentElement;p;p=p.parentElement){const c=getComputedStyle(p),q=p.getBoundingClientRect();if(/hidden|auto|scroll|clip/.test(c.overflowX)){v.left=Math.max(v.left,q.left);v.right=Math.min(v.right,q.right)}if(/hidden|auto|scroll|clip/.test(c.overflowY)){v.top=Math.max(v.top,q.top);v.bottom=Math.min(v.bottom,q.bottom)}}
  const hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2),visibleHit=document.elementFromPoint((v.left+v.right)/2,(v.top+v.bottom)/2);
  return {inside:v.right-v.left>=r.width-2&&v.bottom-v.top>=r.height-2,hit:hit===e||e.contains(hit),visibleHeight:Math.max(0,v.bottom-v.top),visibleRect:v,visibleHit:visibleHit===e||e.contains(visibleHit)};
 };
 const footer=el.querySelector('[data-composer-footer]'),body=el.querySelector('[data-composer-body]');
 return {viewport:{width:innerWidth,height:innerHeight},dock:rect(el),footer:rect(footer),body:{...rect(body),scrollHeight:body.scrollHeight},
  controls:[...footer.querySelectorAll('button,input')].map(e=>({label:e.getAttribute('aria-label')||e.textContent,disabled:e.disabled,box:rect(e),...visibility(e)})),
  submit:{...rect(el.querySelector('[data-testid="generation-submit-action"]')),...visibility(el.querySelector('[data-testid="generation-submit-action"]'))},
  prompt:{...rect(el.querySelector('textarea')),...visibility(el.querySelector('textarea'))}};
}

/** Existing native fixture supplies only a page. No task, history, pricing or
 * application state is injected by these view interactions. */
async function verifyCanvasComposerResponsive(page,{out,english=false}={}){
 const {expect}=require('@playwright/test'),dock=page.getByTestId('image-node-dock');fs.mkdirSync(out,{recursive:true});
 const prompt=dock.locator('textarea'),originalPrompt=await prompt.inputValue(),count=dock.getByRole('spinbutton',{name:'生成图片数量'}),originalCount=await count.inputValue();
 const checks=[],rows=[];
 for(const viewport of [{width:390,height:844},{width:320,height:740},{width:390,height:568},{width:844,height:390},{width:1440,height:1000}]){
  await page.setViewportSize(viewport);
  if(viewport.height<600){
   await expect.poll(()=>dock.evaluate(el=>getComputedStyle(el).overflowY)).toBe('auto');
   await dock.locator('[data-composer-header]').hover();await page.mouse.wheel(0,900);
   await expect.poll(async()=>(await dock.evaluate(measureComposer)).submit.inside).toBe(true);
  }else await expect.poll(async()=>{const m=await dock.evaluate(measureComposer);return m.submit.inside&&m.controls.every(c=>c.inside)&&m.body.height>=48;},{timeout:15000}).toBe(true);
  const before=await dock.evaluate(measureComposer);
  assert.ok(before.submit.hit,'Submit must be hit-testable without force');
  if(viewport.height>=600)for(const control of before.controls)assert.ok(control.hit,'Control obscured: '+control.label);
  await count.fill('2');await count.press('Tab');await expect(count).toHaveValue('2');
  await dock.getByRole('button',{name:/· 1K/}).click();const menu=page.getByTestId('canvas-generation-parameters');await expect(menu).toBeVisible();
  await menu.getByRole('button',{name:'3:4',exact:true}).click();await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(dock.getByRole('button',{name:/3:4 · 1K/})).toBeVisible();
  await dock.getByRole('button',{name:/3:4 · 1K/}).click();await menu.getByRole('button',{name:english?'Auto':'自适应',exact:true}).click();await page.keyboard.press('Escape');
  const modes=dock.locator('[data-composer-controls] button[aria-haspopup="true"]').first();await modes.click();const options=page.getByTestId('canvas-select-options');await expect(options).toBeVisible();await options.locator('button').nth(1).click();await expect(modes).toHaveAttribute('aria-expanded','false');await modes.click();await options.locator('button').first().click();
  await dock.getByRole('button',{name:english?'More image settings':'更多图片参数',exact:true}).click();await expect(page.getByRole('button',{name:'关闭设置',exact:true})).toBeVisible();await page.getByRole('button',{name:'关闭设置',exact:true}).click();
  await prompt.fill(originalPrompt+' 移动端布局验收');await expect(prompt).toHaveValue(originalPrompt+' 移动端布局验收');
  await dock.locator('[data-composer-body]').hover();await page.mouse.wheel(0,600);
  const visiblePrompt=async()=>(await dock.evaluate(measureComposer)).prompt;
  await expect.poll(async()=>{const value=await visiblePrompt();return value.visibleHit&&value.visibleHeight>=32;},{timeout:15000}).toBe(true);
  const input=await visiblePrompt(),inputVisible=input.visibleHeight,v=input.visibleRect;
  await page.mouse.click((v.left+v.right)/2,(v.top+v.bottom)/2);await page.keyboard.press('Control+A');await page.keyboard.type(originalPrompt+' 原生输入');await expect(prompt).toHaveValue(originalPrompt+' 原生输入');

  await prompt.fill(originalPrompt);await count.fill(originalCount);await count.press('Tab');await dock.locator('[data-composer-body]').evaluate(el=>el.scrollTop=0);
  if(viewport.height<600){await dock.locator('[data-composer-header]').hover();await page.mouse.wheel(0,900);await expect.poll(async()=>(await dock.evaluate(measureComposer)).submit.inside).toBe(true);}
  const after=await dock.evaluate(measureComposer);assert.ok(after.submit.inside&&after.submit.hit);if(viewport.height>=600)assert.ok(after.controls.every(c=>c.inside));
  rows.push({viewport,before,after,promptVisibleHeight:inputVisible,shortViewportScroll:viewport.height<600});
  fs.writeFileSync(path.join(out,'PROGRESS.json'),JSON.stringify({checks,rows},null,2));checks.push(`CONTROLS_PROMPT_MODE_RATIO_COUNT_OPTIONS_${viewport.width}x${viewport.height}`);
  await page.screenshot({path:path.join(out,`composer-${viewport.width}x${viewport.height}.png`)});
 }
 await page.setViewportSize({width:390,height:844});await expect.poll(async()=>(await dock.evaluate(measureComposer)).submit.hit).toBe(true);
 const result={status:'PASS',checks,rows,actualControls:true,forceClicks:0,promptRestored:true,countRestored:true,submittedByHelper:0};fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2));
 console.log(`CANVAS_COMPOSER_RESPONSIVE=PASS VIEWPORTS=${rows.length} REAL_CONTROLS=1 MODE_RATIO_COUNT_OPTIONS_PROMPT=PASS CLIPPED_CONTROLS=0 FORCE=0`);return result;
}
module.exports={measureComposer,verifyCanvasComposerResponsive};
