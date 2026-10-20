// Screenshot fallback after two T3 preview snapshot timeouts. Isolated headless Edge only.
import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
const out='output/image-resolution-fallback-20261020';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1000,height:700}}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{await page.goto('http://127.0.0.1:14883');const result=await page.evaluate(()=>window.verifyResolutionBrowser());if(errors.length)throw Error(errors.join('\n'));await page.screenshot({path:out+'/resolution-price-unchanged.png',fullPage:true});await page.setViewportSize({width:390,height:800});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('390 overflow');await page.screenshot({path:out+'/resolution-price-390.png',fullPage:true});const row={...result,pageerrors:errors,viewports:[1000,390],overflow:false};await writeFile(out+'/browser-results.json',JSON.stringify(row,null,2)+'\n');console.log(JSON.stringify(row));}finally{await context.close();await browser.close();}
