const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {build}=require('esbuild');
const {chromium}=require('@playwright/test');
const sharp=require('sharp');
const {setTimeout:delay}=require('node:timers/promises');

async function until(test,reason){const end=Date.now()+3500;while(!test()){assert.ok(Date.now()<end,reason);await delay(15);}}

async function main(){
 const baseline=process.argv.includes('--baseline');
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ArtworkMedia} from './src/components/admin/bi/artwork-media';
 const row=id=>({id,has_image:true,generation_mode:'文生图'});
 function Fixture(){const [id,set]=React.useState('slow');return <><button id="replace" onClick={()=>set('current')}>Switch</button>
   <section id="visible"><ArtworkMedia row={row(id)} detail/></section>
   <section id="offscreen" style={{marginTop:8000}}><ArtworkMedia row={row('far-away')}/></section></>;}
 createRoot(document.getElementById('app')).render(<Fixture/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',jsx:'automatic',outdir:'fixture',write:false});
 const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).contents,css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).contents;
 const png=await sharp({create:{width:60,height:60,channels:3,background:'#8799a5'}}).png().toBuffer();
 const seen=new Set(),aborted=new Set();
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture.invalid');
  if(url.pathname==='/')return res.writeHead(200,{'content-type':'text/html'}).end('<!doctype html><link rel="stylesheet" href="/fixture.css"><div id="app"></div><script defer src="/fixture.js"></script>');
  if(url.pathname==='/fixture.js')return res.writeHead(200,{'content-type':'text/javascript'}).end(js);
  if(url.pathname==='/fixture.css')return res.writeHead(200,{'content-type':'text/css'}).end(css);
  if(url.pathname!=='/api/admin/bi/media')return res.writeHead(404).end();
  const key=url.searchParams.get('id');seen.add(key);
  res.once('close',()=>{if(!res.writableFinished)aborted.add(key);});
  res.writeHead(200,{'content-type':'image/png','content-length':png.length,'cache-control':'private, no-store'});
  if(key==='slow')res.write(png.subarray(0,1));else res.end(png);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1000,height:750}});
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded',timeout:4000});
  await until(()=>seen.has('slow'),'initial preview missing');if(!baseline)assert.equal(seen.has('far-away'),false);
  await page.locator('#replace').click();
  await until(()=>seen.has('current'),'replacement preview missing');
  if(baseline){await delay(250);assert.equal(aborted.has('slow'),false);console.log('BI_PREVIEW_BROWSER_BASELINE=PASS OLD_BODY_RETAINED=1');return;}
  await until(()=>aborted.has('slow'),'replacing the component did not close the old response body');
  await page.waitForFunction(()=>document.querySelector('#visible img')?.naturalWidth===60);
  assert.equal(await page.locator('#visible a').getAttribute('href'),'/api/admin/bi/media?id=current&full=1');
  assert.equal(seen.has('far-away'),false);
  await page.locator('#offscreen').scrollIntoViewIfNeeded();await until(()=>seen.has('far-away'),'scrolling did not request the lazy preview');
  await page.waitForFunction(()=>document.querySelector('#offscreen img')?.naturalWidth===60);
  console.log('BI_PREVIEW_BROWSER=PASS ACTUAL_REACT=1 SWITCH_CLOSES_BODY=1 LAZY_SCROLL=1 FULL_LINK=1');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
