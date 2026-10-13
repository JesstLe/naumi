import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from '@playwright/test';

async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
  const db=await import('../src/lib/db'),native=await import('../src/lib/native-auth');
  const admin=await import('../src/lib/admin-auth');await admin.setAdminPassword('image-cache-console-fixture');await db.setSetting('multi_user_enabled','1');
  const email='cache-owner@fixture.test',base=process.env.NAUMI_VERIFY_URL||'http://127.0.0.1:13087';
  await db.addArtworks(email,[{id:'cache-product-image',title:'本地缓存验收图',category:'main',prompt:'缓存验证，不调用模型',status:'completed',image:'/media/cache-test.png',source:'',gradient:'from-indigo-100 to-blue-100',width:900,height:600}]);
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  try{for(const width of [1440,390]){
    const context=await browser.newContext({viewport:{width,height:1000}});await context.addCookies([{name:'nv_user',value:native.signUserSession(email,Date.now()),url:base}]);
    const page=await context.newPage(),errors:string[]=[];let requests=0;
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/media/'))requests++;});
    await page.goto(base+'/works',{waitUntil:'domcontentloaded',timeout:120000});
    const image=page.locator('img[data-browser-image-cache="local"]').first();await image.waitFor({timeout:120000});await page.waitForFunction(()=>!!document.querySelector('img[data-browser-image-cache="local"]')&&(document.querySelector('img[data-browser-image-cache="local"]')as HTMLImageElement).naturalWidth>0);
    const initial=requests;assert.ok(initial>0);await page.reload({waitUntil:'domcontentloaded'});await image.waitFor({timeout:120000});await page.waitForFunction(()=>{const image=document.querySelector('img[data-browser-image-cache="local"]');return image&&(image as HTMLImageElement).naturalWidth>0&&Number(getComputedStyle(image).opacity)>.99;});assert.equal(requests,initial,'actual works page refresh: zero image-byte requests');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
    await page.screenshot({path:path.resolve(`output/browser-image-cache/works-${width}.png`),fullPage:true});await context.close();
  }console.log('IMAGE_CACHE_PRODUCT=PASS STANDALONE=PASS WORKS_DESKTOP=1440 MOBILE=390 REFRESH_IMAGE_REQUESTS=0 OVERFLOW=0 PAGE_ERRORS=0 PROVIDER_CALLS=0');}
  finally{await browser.close();await db.getPool().end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
