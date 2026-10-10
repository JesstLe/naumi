import {readFile} from 'node:fs/promises';
import path from 'node:path';

// Run through the same isolated HTTP/API harness; never submits to a supplier.
export async function runRound2({page,context,base,expect,assert,fixture,requests,errors,interactions,baseline,output}) {
 const png=await readFile('public/demos/suite-demo/suppl-src.png');
 const upload={name:'round2.png',mimeType:'image/png',buffer:png};
 const input=()=>page.locator('main input[type=file]').first();
 const cta=()=>page.locator('.tool-layout-grid > :first-child button[class*="shadow-btn"], .tool-layout-grid > :first-child button.h-12').last();
 const go=async route=>{try{await page.goto(base+route);}catch(e){if(!String(e).includes('ERR_ABORTED'))throw e;await page.goto(base+route);}await expect(page.locator('main h1').first()).toBeVisible();await expect(page.getByRole('button',{name:'UI',exact:true}).or(page.getByRole('button',{name:'U',exact:true})).first()).toBeVisible();};
 const note=test=>{interactions.push({round:2,test});console.log('ROUND2 '+test);};
 const shot=name=>page.screenshot({path:path.join(output,'round2-'+name+'.png'),fullPage:true});
 await context.addInitScript(()=>{
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  window.__urls={created:[],revoked:[]};
  URL.createObjectURL=(v)=>{const u=create(v);window.__urls.created.push(u);return u;};
  URL.revokeObjectURL=u=>{window.__urls.revoked.push(u);return revoke(u);};
 });

 await go('/titles');await input().setInputFiles(upload);await cta().click();
 await expect(page.getByText('第二轮验收商品标题',{exact:true})).toBeVisible();
 await input().setInputFiles({...upload,name:'replacement.png'});
 if(baseline)await expect(page.getByText('第二轮验收商品标题',{exact:true})).toBeVisible();
 else await expect(page.getByText('第二轮验收商品标题',{exact:true})).toHaveCount(0);
 note('titles source replacement clears stale output');await shot('titles');
 if(!baseline){
  await cta().click();await expect(page.getByText('第二轮验收商品标题',{exact:true})).toBeVisible();
  await page.locator('main textarea').first().fill('第二件商品描述');await expect(page.getByText('第二轮验收商品标题',{exact:true})).toHaveCount(0);
  fixture.malformed=true;await cta().click();await expect(page.getByText('生成结果异常，请重试',{exact:true})).toBeVisible();fixture.malformed=false;
  note('titles description clears result and malformed output recovers');
 }


 await go('/packaging3d');await input().setInputFiles(upload);fixture.missingJob=true;
 const requestStart=requests.length;await cta().click();
 if(baseline)await expect.poll(()=>requests.slice(requestStart).some(r=>r[1]==='/api/packaging3d'&&r[2].includes('job=undefined'))).toBe(true);
 else {await expect(page.getByText('任务创建失败，请重试',{exact:true})).toBeVisible();assert.ok(!requests.slice(requestStart).some(r=>r[1]==='/api/packaging3d'&&r[0]==='GET'));await expect(cta()).toBeEnabled();}
 note('packaging missing job fails fast without undefined polling');fixture.missingJob=false;
 if(!baseline){await cta().click();await expect(page.getByAltText('3D packaging',{exact:true})).toBeVisible();await expect(cta()).toBeEnabled();note('packaging async result displays after missing job retry');}


 for(const route of ['/fuse','/variations']){
  await go(route);await input().setInputFiles(route==='/fuse'?[upload,{...upload,name:'second.png'}]:upload);fixture.malformed=true;
  const before=errors.length;await cta().click();
  if(baseline){await expect.poll(()=>errors.length>before).toBe(true);await page.waitForTimeout(700);}
  else {await expect(page.getByText('生成结果异常，请重试',{exact:true})).toBeVisible();await expect(cta()).toBeEnabled();assert.equal(errors.length,before);}
  note(route.slice(1)+' malformed done stays recoverable');fixture.malformed=false;
  if(!baseline){await cta().click();await expect(page.getByAltText(route==='/fuse'?'fused':'variation',{exact:true})).toBeVisible();await expect(cta()).toBeEnabled();await shot(route.slice(1)+'-success');note(route.slice(1)+' asynchronous success displays result');}
 }

 await go('/generate?gen='+encodeURIComponent(base+'/demos/suite-demo/suppl-src.png')+'&from=gen-round2');
 const reuse=page.getByRole('button',{name:'以此图再生成',exact:true}).first();await expect(reuse).toBeVisible();
 fixture.download='fail';await reuse.click();
 if(baseline){await page.waitForTimeout(400);assert.equal(await page.getByText('底图载入失败，请重试',{exact:true}).count(),0);}
 else {await expect(page.getByText('底图载入失败，请重试',{exact:true})).toBeVisible();fixture.download='html';await reuse.click();await expect(page.getByText('底图载入失败，请重试',{exact:true})).toBeVisible();await expect(page.locator('main img[src^="blob:"]')).toHaveCount(0);fixture.download='image';await reuse.click();await expect(page.locator('main img[src^="blob:"]').first()).toBeVisible();note('generate rejects nonimage then retries with validated image');}
 note('generate reuse reports download failure');
 if(!baseline){
  await page.getByRole('button',{name:'移除图片',exact:true}).first().click();
  fixture.delay=900;await reuse.click();await input().setInputFiles({...upload,name:'manual-latest.png'});
  const latest=await page.locator('main img[src^="blob:"]').first().getAttribute('src');await page.waitForTimeout(1200);
  assert.equal(await page.locator('main img[src^="blob:"]').first().getAttribute('src'),latest);fixture.delay=0;
  note('manual input wins over delayed base download');
 }

 // SPA navigation keeps the URL instrumentation alive across component unmounts.
 await go('/fuse');await input().setInputFiles([upload,{...upload,name:'second.png'}]);
 const owned=await page.evaluate(()=>window.__urls.created.slice());assert.ok(owned.length>=2);
 await page.locator('a[href="/dashboard"]').first().click();await expect(page.locator('main h1').first()).toBeVisible();
 await expect(page.locator('main img[alt="ref-1"]')).toHaveCount(0);
 if(baseline){assert.ok(await page.evaluate(urls=>urls.some(u=>!window.__urls.revoked.includes(u)),owned));}
 else await expect.poll(()=>page.evaluate(urls=>urls.every(u=>window.__urls.revoked.includes(u)),owned)).toBe(true);
 note('fuse releases live preview URLs on SPA unmount');

 if(!baseline){
  for(const route of ['/variations','/inpaint','/ipcheck','/printfile','/tryon']){
   await go(route);await input().setInputFiles(upload);await expect(page.locator('main img[src^="blob:"]').first()).toBeVisible();
   const urls=await page.evaluate(()=>window.__urls.created.slice());
   await page.locator('a[href="/dashboard"]').first().click();await expect(page.locator('main h1').first()).toBeVisible();
   await expect.poll(()=>page.evaluate(urls=>urls.every(u=>window.__urls.revoked.includes(u)),urls)).toBe(true);note(route.slice(1)+' releases previews on unmount');
  }
  fixture.video=true;await go('/video');
  await expect.poll(()=>requests.filter(r=>r[1]==='/api/video/tasks'&&r[2].includes('id=round2-video')).length).toBeGreaterThan(0);
  const polls=requests.filter(r=>r[1]==='/api/video/tasks'&&r[2].includes('id=round2-video')).length;
  await page.waitForTimeout(5400);assert.equal(requests.filter(r=>r[1]==='/api/video/tasks'&&r[2].includes('id=round2-video')).length,polls);fixture.video=false;
  note('video terminal result stops central polling');
  await go('/titles');await page.getByRole('combobox',{name:'文字模型',exact:true}).first().click();await page.getByRole('option',{name:'自定义模型 ID'}).click();
  const dialog=page.getByRole('dialog',{name:'使用其他文本模型'});await expect(dialog).toBeVisible();
  const custom=dialog.locator('input');await expect(custom).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'关闭自定义模型'})).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'使用此模型'})).toBeFocused();
  await custom.fill('  gpt-4o  ');await custom.press('Enter');await expect(dialog).toHaveCount(0);await expect(page.getByRole('combobox',{name:'文字模型',exact:true}).first()).toBeFocused();assert.equal(await page.evaluate(()=>localStorage.getItem('naumi:text-model')),'gpt-4o');note('custom text model focus trap return and trim');
 }
}
