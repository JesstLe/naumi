// Real React editor, CSS and publication client; isolated HTTP state only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const require=createRequire(import.meta.url),{createState}=require('./model-mapping-clarity-fixture.cjs');
const out=path.resolve(process.env.IDENTITY_UI_EVIDENCE||'output/public-model-identity-ui');
await fs.mkdir(out,{recursive:true});
const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ModelManagement}from'./src/components/admin/model-management/model-management';createRoot(document.getElementById('root')).render(<ModelManagement/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:out,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},plugins:[{name:'isolate',setup(b){
  b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'auth',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?`export async function authHeader(){return {}}`:`import React from'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`,loader:'tsx',resolveDir:process.cwd()}));
}}]});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
const state=createState(),row=state.rows.find(r=>r.id==='gpt-image');row.id='gpt-image-2';row.publicIds=['gpt-image-2'];
const initialRoutes=structuredClone(row.routes),writes=[],errors=[],receipts=new Map();let reject=false;
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://fixture'),json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(url.pathname==='/app.js'){res.setHeader('content-type','application/javascript');res.end(js);return;}
  if(url.pathname==='/app.css'){res.setHeader('content-type','text/css');res.end(`:root{font-family:Arial,"Microsoft YaHei",sans-serif;color:#172033;background:#f8fafc}*{box-sizing:border-box}body{margin:0}button,input{font:inherit}\n`+css);return;}
  if(url.pathname==='/api/admin/model-management'){
    if(req.method==='GET')return json(state);
    let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);writes.push(body);
    if(receipts.has(body.id))return json(receipts.get(body.id));
    if(reject){reject=false;return json({error:'公开 ID 已被使用',code:'PUBLIC_ID_CONFLICT',operationNotStaged:true},409);}
    assert.equal(body.action,'identity');assert.equal(body.rowId,row.id);assert.equal(body.expectedVersion,state.version);
    row.id=body.publicId;row.publicIds=[body.publicId];row.label=body.label;state.version++;
    const receipt={publication:{phase:'applied',version:state.version}};receipts.set(body.id,receipt);return json(receipt);
  }
  if(url.pathname.startsWith('/api/'))return json({error:'NO_EXTERNAL_CALLS'},403);
  res.setHeader('content-type','text/html;charset=utf-8');res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body><div id="root"></div><script src="/app.js"></script></body></html>');
});
let browser;
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin);const card=page.getByTestId('managed-model-gpt-image-2');await card.getByRole('button',{name:'配置',exact:true}).click();
  await card.getByRole('button',{name:'名称与公开 ID',exact:true}).click();const dialog=page.getByRole('dialog',{name:'名称与公开 ID',exact:true});
  assert.equal(await dialog.getByLabel('公开 ID',{exact:true}).inputValue(),'gpt-image-2');
  await dialog.getByLabel('显示名称',{exact:true}).fill('image2.5');
  assert.equal(await dialog.getByLabel('公开 ID',{exact:true}).inputValue(),'gpt-image-2','label-only editing must not automatically change ID');
  await dialog.getByRole('button',{name:'使用显示名称作为 ID',exact:true}).click();
  assert.equal(await dialog.getByLabel('公开 ID',{exact:true}).inputValue(),'image2.5');
  await dialog.getByLabel('公开 ID',{exact:true}).fill('bad id');assert.equal(await dialog.getByRole('button',{name:'保存并生效',exact:true}).isDisabled(),true);
  await dialog.getByRole('button',{name:'使用显示名称作为 ID',exact:true}).click();
  await page.screenshot({path:path.join(out,'identity-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(out,'identity-mobile.png')});
  reject=true;await dialog.getByRole('button',{name:'保存并生效',exact:true}).click();await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByLabel('公开 ID',{exact:true}).inputValue(),'image2.5','rejection preserves draft');
  assert.equal(row.id,'gpt-image-2');assert.equal(writes.length,1);
  await dialog.getByRole('button',{name:'保存并生效',exact:true}).click();await dialog.waitFor({state:'detached'});
  assert.equal(writes.length,2);assert.notEqual(writes[0].id,writes[1].id,'definite rejection starts fresh operation');
  assert.equal(row.id,'image2.5');assert.equal(row.label,'image2.5');assert.deepEqual(row.routes,initialRoutes);
  await page.reload();await page.getByTestId('managed-model-image2.5').getByRole('heading',{name:'image2.5',exact:true}).waitFor();
  assert.equal(await page.getByTestId('managed-model-gpt-image-2').count(),0);assert.equal(errors.length,0,errors.join('\n'));
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(out,'identity-applied.png')});
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify({status:'PASS',realComponent:true,httpFixture:true,checks:['separate-fields','align-id','invalid-id','conflict-preserves-draft','publish-new-id','reload-new-row','wire-model-unchanged','390px-no-overflow'],writes,errors,supplierCalls:0},null,2));
  console.log('PUBLIC_IDENTITY_UI=PASS DESKTOP_MOBILE=PASS CONFLICT_DRAFT=PASS PUBLISH_RELOAD=PASS SUPPLIER_CALLS=0');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
