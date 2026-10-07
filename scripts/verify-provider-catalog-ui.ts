import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium,expect } from '@playwright/test';
async function main(){
  if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1')throw Error('isolated fixture required');
  const f=JSON.parse(await readFile('output/provider-catalog-ui.json','utf8')),origin='http://127.0.0.1:54981';
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  const admin=await browser.newContext({viewport:{width:1440,height:1000}}),member=await browser.newContext();
  try{
    assert.equal((await admin.request.post(origin+'/api/admin/login',{data:{password:'CatalogFixture2026!'}})).status(),200);
    const page=await admin.newPage();page.setDefaultTimeout(45000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/admin/bi/models');await page.getByRole('button',{name:'供应商',exact:true}).click();
    await page.getByText('灵动 2.5 目录验收',{exact:false}).waitFor();await page.getByText('catalog-image-v2',{exact:false}).first().waitFor();
    assert.ok((await page.locator('body').innerText()).includes('目录验收供应商'));
    const cachedBefore=await admin.request.get(origin+'/api/admin/bi/model-config/catalog');assert.equal(cachedBefore.status(),200);assert.ok((await cachedBefore.json()).providers[0].lastSuccessAt);
    await page.getByRole('button',{name:'刷新供应商模型目录',exact:true}).click();
    await expect(page.getByRole('button',{name:'刷新供应商模型目录',exact:true})).toBeEnabled();
    await page.screenshot({path:'output/provider-catalog-20261007/catalog-desktop.png',fullPage:true});
    await page.reload();await page.getByRole('button',{name:'供应商',exact:true}).click();await page.getByText('灵动 2.5 目录验收',{exact:false}).waitFor();
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:'output/provider-catalog-20261007/catalog-mobile.png',fullPage:true});
    await member.addCookies([{name:'nv_user',value:f.userCookie,domain:'127.0.0.1',path:'/'}]);
    assert.equal((await member.request.get(origin+'/api/admin/bi/model-config/catalog')).status(),404);
    assert.equal((await member.request.post(origin+'/api/admin/bi/model-config/catalog',{data:{providerId:'p1'}})).status(),404);
    const stats=await(await fetch(f.control+'/stats')).json();assert.equal(stats.queries,1);assert.equal(stats.paid,0);assert.equal(errors.length,0,errors.join('\n'));
    console.log('CATALOG_BROWSER=PASS AUTO_DISCOVERY=PASS PROVIDER_NAME=PASS MODEL_NAME_ID=PASS CACHE_RELOAD=PASS READS=1 MOBILE=PASS NON_ADMIN=404 PAID_POSTS=0');
  }finally{await admin.close();await member.close();await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
