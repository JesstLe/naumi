import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import esbuild from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import ts from 'typescript';
import { chromium, webkit, expect as rawExpect } from '@playwright/test';

// This imports unchanged current components. Auth is a fixture boundary, not a live account.
const root = process.cwd(), out = path.resolve(process.env.CANVAS_EXTENDED_EVIDENCE || 'output/canvas-win-mac-audit-20261013/browser');
await mkdir(out,{recursive:true});
const built = await esbuild.build({ entryPoints:['scripts/fixtures/canvas-extended-harness.tsx'], bundle:true, write:false,
  outdir:'fixture-assets', platform:'browser', format:'iife', jsx:'automatic', define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'fixture-auth',setup(build){build.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'fixture-auth',namespace:'fixture-auth'}));
    build.onLoad({filter:/.*/,namespace:'fixture-auth'},()=>({contents:'export async function authHeader(){return {}};',loader:'js'}));}}] });
const configText = ts.transpileModule(await readFile('tailwind.config.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const configModule={exports:{}};new Function('module','exports',configText)(configModule,configModule.exports);
const styles = await postcss([tailwind(configModule.exports.default),autoprefixer]).process(await readFile('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')});
const js = built.outputFiles.find(f=>f.path.endsWith('.js')).contents;
const css = styles.css+'\n'+(built.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'');
await writeFile(path.join(out,'fixture.js'),js); await writeFile(path.join(out,'fixture.css'),css);
const png = await readFile('public/demos/suite-demo/suppl-src.png');
let apiCalls=0;
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname.startsWith('/api/')){apiCalls++;res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"Unrouted fixture API"}');return;}
  if(url.pathname==='/fixture.js'){res.writeHead(200,{'content-type':'application/javascript'});res.end(js);return;}
  if(url.pathname==='/fixture.css'){res.writeHead(200,{'content-type':'text/css'});res.end(css);return;}
  if(url.pathname==='/fixture.png'){res.writeHead(200,{'content-type':'image/png'});res.end(png);return;}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const profiles=[{id:'win-chrome',engine:chromium,channel:'chrome',mac:false,dpr:1},{id:'win-edge-125',engine:chromium,channel:'msedge',mac:false,dpr:1.25},
  {id:'mac-chrome-sim',engine:chromium,channel:'chrome',mac:true,dpr:2},{id:'mac-webkit-sim',engine:webkit,mac:true,dpr:2}]
  .filter(p=>!process.env.CANVAS_EXTENDED_PROFILES||process.env.CANVAS_EXTENDED_PROFILES.split(',').includes(p.id));
const results=[],errors=[],expect=rawExpect.configure({timeout:5000});
const sources=['src/components/canvas/image-crop-dialog.tsx','src/components/canvas/parameter-popover.tsx','src/components/canvas/node-properties-panel.tsx',
  'src/components/canvas/canvas-assistant-panel.tsx','src/components/image-skills/skill-book.tsx','src/components/canvas/canvas-client.tsx'];
const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
let browser;
try{
 for(const p of profiles){
  browser=await p.engine.launch({...(p.channel?{channel:p.channel}:{}),headless:true});
  const context=await browser.newContext({viewport:{width:1093,height:768},deviceScaleFactor:p.dpr,reducedMotion:'reduce'});
  await context.addInitScript(mac=>Object.defineProperty(navigator,'platform',{get:()=>mac?'MacIntel':'Win32'}),p.mac);
  const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push({profile:p.id,message:e.message}));
  await context.route('**/api/image-skills',async route=>route.fulfill({json:{skills:await page.evaluate(()=>window.auditFixture.officialSkills)}}));
  const event = (locator,key,composing=true,legacy=false) => locator.dispatchEvent('keydown',{key,code:key,keyCode:legacy?229:key==='Escape'?27:13,isComposing:composing,bubbles:true,cancelable:true});
  async function open(mode,width=1093,keyboard=false){await page.setViewportSize({width,height:768});await page.goto(base+'/?mode='+mode);await page.waitForFunction(()=>!!window.auditFixture);
    const trigger=mode==='skills'?page.getByTestId('image-skills-entry').getByRole('button',{name:'Skills',exact:true}):page.getByRole('button',{name:'打开测试组件',exact:true});
    await trigger.focus();if(keyboard)await trigger.press('Enter');else await trigger.click();}
  async function check(id,test){if(process.env.CANVAS_EXTENDED_CHECKS&&!process.env.CANVAS_EXTENDED_CHECKS.split(',').includes(id))return;
    if(id==='properties-readonly-fields-filter'&&!process.env.CANVAS_EXTENDED_CHECKS)return;
    try{const detail=await test();results.push({profile:p.id,id,status:'PASS',detail:detail??null});console.log(`PASS ${p.id} ${id}`);}
    catch(e){results.push({profile:p.id,id,status:'FAIL',message:e.message});console.log(`FAIL ${p.id} ${id}: ${e.message.split('\n')[0]}`);await page.screenshot({path:path.join(out,p.id+'-'+id+'.png')}).catch(()=>{});}}
  await check('crop-ime-escape',async()=>{await open('crop');const d=page.getByTestId('image-crop-dialog');await expect(d).toBeVisible();await d.getByRole('spinbutton',{name:'左 %'}).focus();await event(d.getByRole('spinbutton',{name:'左 %'}),'Escape');await expect(d).toHaveCount(1);});
  await check('crop-normal-escape-and-focus-restore',async()=>{await open('crop',1093,true);const focusBefore=await page.evaluate(()=>({tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.slice(0,40)}));await page.getByRole('button',{name:'关闭裁剪'}).press('Escape');await expect(page.getByTestId('image-crop-dialog')).toHaveCount(0);await page.waitForTimeout(100);const after=await page.evaluate(()=>({tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.slice(0,40),isTrigger:document.activeElement?.textContent==='打开测试组件'}));await writeFile(path.join(out,p.id+'-crop-focus-detail.json'),JSON.stringify({focusBefore,after},null,2));assert.equal(after.isTrigger,true,JSON.stringify({focusBefore,after}));});
  await check('crop-idle-focus-trap',async()=>{await open('crop');await page.getByRole('button',{name:'关闭裁剪'}).focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)),true);});
  await check('crop-busy-focus-retained',async()=>{await open('crop');await page.getByRole('button',{name:'保存裁剪版本'}).click();await page.keyboard.press('Tab');assert.equal(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)),true);});
  await check('crop-fieldset-disabled-focus-filter',async()=>{await open('crop');await page.evaluate(()=>{document.querySelector('fieldset').disabled=true;});await page.getByRole('button',{name:'关闭裁剪'}).focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)),true);});
  await check('parameters-ime-escape',async()=>{await open('parameters');const d=page.getByTestId('canvas-generation-parameters');await d.getByRole('button',{name:'1K',exact:true}).focus();await event(d.getByRole('button',{name:'1K',exact:true}),'Escape');await expect(d).toHaveCount(1);});
  await check('parameters-initial-focus',async()=>{await open('parameters');assert.equal(await page.getByTestId('canvas-generation-parameters').evaluate(e=>e.contains(document.activeElement)),true);});
  await check('parameters-tab-focus-isolation',async()=>{await open('parameters');await page.getByRole('button',{name:'确认参数'}).focus();await page.keyboard.press('Tab');assert.equal(await page.getByTestId('canvas-generation-parameters').evaluate(e=>e.contains(document.activeElement)),true);});
  await check('parameters-normal-escape-and-focus-restore',async()=>{await open('parameters');await page.getByRole('button',{name:'1:1',exact:true}).press('Escape');await expect(page.getByTestId('canvas-generation-parameters')).toHaveCount(0);assert.equal(await page.getByRole('button',{name:'打开测试组件'}).evaluate(e=>e===document.activeElement),true);});
  await check('properties-ime-escape-guard',async()=>{await open('properties',390);await event(page.getByRole('button',{name:'收起属性'}),'Escape');await expect(page.getByTestId('node-properties-panel')).toHaveCount(1);});
  await check('properties-overlay-tab-ring',async()=>{await open('properties',390);await page.getByRole('button',{name:'收起属性'}).focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.getByTestId('node-properties-panel').evaluate(e=>e.contains(document.activeElement)),true);});
  await check('properties-normal-escape',async()=>{await open('properties',390);await page.getByRole('button',{name:'收起属性'}).press('Escape');await expect(page.getByTestId('node-properties-panel')).toHaveCount(0);});
  await check('properties-readonly-fields-filter',async()=>{await open('properties',390);await page.evaluate(()=>window.auditFixture.setReadOnly(true));await expect(page.getByRole('combobox',{name:'字号'})).toBeDisabled();await page.getByRole('button',{name:'收起属性'}).focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('button',{name:'收起属性'}).evaluate(e=>e===document.activeElement),true);return {disabledFieldsSkipped:true};});
  await check('assistant-ime-enter-guard',async()=>{await open('assistant');await event(page.getByTestId('canvas-assistant-input'),'Enter');assert.equal(await page.evaluate(()=>window.auditFixture.metrics.sends),0);});
  await check('assistant-normal-enter-single-submit',async()=>{await open('assistant');await page.getByTestId('canvas-assistant-input').press('Enter');assert.equal(await page.evaluate(()=>window.auditFixture.metrics.sends),1);});
  await check('assistant-legacy-229-enter',async()=>{await open('assistant');await event(page.getByTestId('canvas-assistant-input'),'Enter',false,true);assert.equal(await page.evaluate(()=>window.auditFixture.metrics.sends),0);});
  await check('assistant-history-ime-escape',async()=>{await open('assistant');await page.getByRole('button',{name:'历史对话',exact:true}).click();await page.getByRole('button',{name:'改名',exact:true}).click();const field=page.getByRole('textbox',{name:'会话名称'});await expect(field).toBeVisible();await field.fill('未确认名称');await event(field,'Escape');await expect(field).toHaveCount(1);});
  await check('assistant-history-keyboard-focus-ring',async()=>{await open('assistant',390);await page.getByRole('button',{name:'历史对话',exact:true}).click();await page.getByRole('button',{name:'改名',exact:true}).click();const field=page.getByRole('textbox',{name:'会话名称'});await field.focus();await page.keyboard.press('Tab');const inside=await page.getByTestId('canvas-assistant-panel').evaluate(e=>e.contains(document.activeElement));assert.equal(inside,true);});
  await check('skills-ime-escape-preserves-draft',async()=>{await open('skills');await page.getByRole('button',{name:'创建',exact:true}).click();const field=page.getByLabel('创作流程');await field.fill('中文候选尚未确认的完整创作流程');await event(field,'Escape');await expect(page.getByTestId('skill-book-dialog')).toHaveCount(1);});
  await check('skills-detail-first-tab-boundary',async()=>{await open('skills');await page.locator('[data-testid^="skill-card-"]').first().click();await page.getByRole('button',{name:'返回技能库'}).focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('button',{name:'使用 Skill'}).evaluate(e=>e===document.activeElement),true);});
  await check('skills-draft-first-tab-boundary',async()=>{await open('skills');await page.getByRole('button',{name:'创建',exact:true}).click();await page.getByRole('button',{name:'返回技能库'}).focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('button',{name:'保存 Skill'}).evaluate(e=>e===document.activeElement),true);});
  await check('skills-normal-escape-cleanup',async()=>{await open('skills');await page.getByRole('button',{name:'关闭技能库'}).press('Escape');await expect(page.getByTestId('skill-book-dialog')).toHaveCount(0);assert.equal(await page.evaluate(()=>document.querySelector('#root').hasAttribute('inert')),false);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');});
  await check('skills-390-dialog-contained',async()=>{await open('skills',390);const b=await page.getByTestId('skill-book-dialog').boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=390&&b.y+b.height<=768,JSON.stringify(b));return b;});
  await check('no-page-errors',async()=>assert.deepEqual(errors.filter(x=>x.profile===p.id),[]));
  await context.close();await browser.close();browser=null;
 }
}finally{
 await browser?.close();await new Promise(r=>server.close(r));
 const result={baseline:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHashes,nativeMac:false,productionDatabase:false,providerCalls:0,unroutedApiCalls:apiCalls,results,errors,
  fixture:'Current unchanged React components bundled using esbuild + current global/Tailwind/module CSS; in-memory props/API; synthetic composition events.'};
 await writeFile(path.join(out,'results.json'),JSON.stringify(result,null,2)+'\n');
 console.log(`CANVAS_EXTENDED_AUDIT_COMPLETE CHECKS=${results.length} PASS=${results.filter(x=>x.status==='PASS').length} FAIL=${results.filter(x=>x.status==='FAIL').length} PROVIDER_CALLS=0 NATIVE_MAC=NOT_RUN`);
}
