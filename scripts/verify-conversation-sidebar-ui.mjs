import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";

const rollback=process.argv.includes("--rollback"),baseline=process.argv.includes("--baseline")||rollback,out=resolve("output/conversation-sidebar"),mode=rollback?"rollback":baseline?"baseline":"modified";await mkdir(out,{recursive:true});
const child=spawn(process.execPath,["scripts/serve-conversation-sidebar-fixture.mjs",...(rollback?["--source-override="+resolve(out,"rollback-test")]:baseline?["--baseline"]:[])],{stdio:["ignore","pipe","pipe"]});
let logs="";child.stderr.on("data",data=>logs+=data);
const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("fixture startup timeout "+logs)),30000);child.once("exit",code=>{clearTimeout(timer);reject(Error("fixture exited "+code+logs));});child.stdout.on("data",data=>{logs+=data;const m=logs.match(/CONVERSATION_FIXTURE=(\{[^\n]+\})/);if(m){clearTimeout(timer);resolve(JSON.parse(m[1]).origin);}});});
const browser=await chromium.launch({headless:true});let checks=0;const errors=[];
try{
 const context=await browser.newContext({viewport:{width:1280,height:1000},permissions:["clipboard-read","clipboard-write"]});const page=await context.newPage();page.on("pageerror",error=>errors.push(String(error)));
 await page.goto(origin);await page.locator('[data-session-id="s1"]').waitFor();await page.evaluate(()=>document.fonts.ready);
 const textarea=page.getByRole("textbox",{name:"创作描述"});await textarea.click();
 const focus=await textarea.evaluate(el=>({outlineStyle:getComputedStyle(el).outlineStyle,outlineWidth:getComputedStyle(el).outlineWidth,caret:getComputedStyle(el).caretColor,border:getComputedStyle(el.closest('[data-testid="chat-composer"]')).borderTopColor}));
 const math=await page.locator(".katex").count(),tables=await page.locator("table").count();
 await textarea.screenshot({path:resolve(out,mode+"-input.png")});
 const composer=page.getByTestId("chat-composer");await composer.screenshot({path:resolve(out,mode+"-dock.png")});
 if(baseline){assert.notEqual(focus.outlineStyle,"none");assert.equal(math,0);assert.equal(tables,0);checks=3;console.log(`${rollback?"ROLLBACK_RESTORED":"BASELINE_REPRODUCED"} outline=${focus.outlineStyle}/${focus.outlineWidth} math=${math} tables=${tables}`);}
 else{
  assert.equal(focus.outlineStyle,"none");assert.equal(focus.outlineWidth,"0px");assert.notEqual(focus.border,"rgb(22, 142, 179)");checks+=3;
  assert.ok(math>=5);assert.equal(tables,1);assert.ok(await page.locator(".hljs-keyword").count()>0);assert.ok(await page.locator('link[href="/fixture.css"]').count());checks+=4;
  assert.ok(await page.evaluate(()=>document.fonts.check("16px KaTeX_Main")));checks++;
  await page.getByRole("button",{name:"管理对话 商品主图方案",exact:true}).click();
  await page.keyboard.press("End");assert.equal(await page.getByRole("menuitem",{name:"删除",exact:true}).evaluate(el=>el===document.activeElement),true);checks++;
  await page.keyboard.press("Home");assert.equal(await page.getByRole("menuitem",{name:"重命名",exact:true}).evaluate(el=>el===document.activeElement),true);checks++;
  await page.keyboard.press("Escape");assert.equal(await page.getByRole("button",{name:"管理对话 商品主图方案",exact:true}).evaluate(el=>el===document.activeElement),true);checks++;
  await page.getByRole("button",{name:"复制代码",exact:true}).click();assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).replaceAll("\r\n","\n"),"const ratio = 16 / 9;\nconsole.log(ratio);");checks++;
  await page.getByRole("button",{name:"管理对话 美妆包装探索",exact:true}).click();await page.getByRole("menuitem",{name:"置顶",exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-session-id]')?.getAttribute('data-session-id')==='s2');checks++;
  await page.reload();await page.locator('[data-session-id="s2"]').waitFor();assert.equal(await page.locator('[data-session-id]').first().getAttribute('data-session-id'),"s2");checks++;
  await page.getByRole("button",{name:"管理对话 美妆包装探索",exact:true}).click();await page.getByRole("menuitem",{name:"重命名",exact:true}).click();await page.getByRole("textbox",{name:"会话名称",exact:true}).fill("护肤礼盒新提案");await page.getByRole("textbox",{name:"会话名称",exact:true}).press("Enter");await page.getByRole("button",{name:"管理对话 护肤礼盒新提案",exact:true}).waitFor();checks++;
  await page.reload();await page.getByRole("button",{name:"管理对话 护肤礼盒新提案",exact:true}).waitFor();checks++;
  await page.getByRole("button",{name:"管理对话 护肤礼盒新提案",exact:true}).click();await page.getByRole("menuitem",{name:"取消置顶",exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-session-id]')?.getAttribute('data-session-id')==='s1');checks++;
  await page.evaluate(()=>window.__fixture.updateImage());await page.waitForFunction(()=>document.querySelector('[data-session-id="s1"] img')?.getAttribute('src')==='/media/new.png');checks++;
  await page.evaluate(()=>window.__fixture.generating());await page.locator('[data-session-id="s1"] [data-image-status="generating"]').waitFor();checks++;
  await page.evaluate(()=>window.__fixture.failed());await page.locator('[data-session-id="s1"] [data-image-status="failed"]').waitFor();checks++;
  await page.reload();await page.getByRole("button",{name:"管理对话 秋日场景图",exact:true}).click();await page.getByRole("menuitem",{name:"删除",exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-session-id="s3"]'));checks++;
  await page.reload();await page.locator('[data-session-id="s1"]').waitFor();assert.equal(await page.locator('[data-session-id="s3"]').count(),0);checks++;
  await page.getByRole("button",{name:"管理对话 商品主图方案",exact:true}).click();await page.screenshot({path:resolve(out,"conversation-richtext-sidebar.png"),fullPage:true});await page.keyboard.press("Escape");
  await page.evaluate(()=>window.__fixture.setMessages([{role:'assistant',content:'<script>window.__unsafe=true</script>\n\n[bad](javascript:alert(1))\n\n$\\href{javascript:alert(1)}{x}$\n\n![blocked](https://evil.example/tracker.png)\n\n不完整公式 $\\frac{a}{'}]));await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.__unsafe),undefined);assert.equal(await page.locator('a[href^="javascript:"]').count(),0);assert.equal(await page.locator('img[src^="https://evil.example"]').count(),0);checks+=3;
  await page.getByRole("button",{name:"管理对话 商品主图方案",exact:true}).click();await page.getByRole("menuitem",{name:"删除",exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-session-id="s1"]'));await page.getByTestId("dashboard-composer").waitFor();checks++;
  assert.deepEqual(errors,[]);checks++;
  const events=await(await page.request.get(origin+"/events")).json();assert.equal(events.filter(x=>!['GET','PATCH','DELETE'].includes(x.method)).length,0);checks++;
  console.log(`CONVERSATION_SIDEBAR_UI_PASS checks=${checks} realReact=1 realChromium=1 authHistory=fixture supplierCalls=0`);
 }
 await writeFile(resolve(out,mode+"-browser-report.json"),JSON.stringify({mode,checks,focus,math,tables,pageErrors:errors,evidenceTier:"Actual React components/CSS and Chromium; HTTP session storage/auth/model controls are fixture. Actual PG/Route test is a separate tier."},null,2));
}finally{await browser.close();child.kill();}
