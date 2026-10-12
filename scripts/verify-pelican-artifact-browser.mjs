import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const output="output/agent-guardrails-20261012";
await mkdir(output,{recursive:true});
const config=await readFile("tsconfig.json");
const listener=createServer();await new Promise(r=>listener.listen(0,"127.0.0.1",r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const base=`http://127.0.0.1:${port}`,logs=[],errors=[],requests=[];
const app=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","-p",String(port)],{env:{...process.env,NODE_OPTIONS:"",DATABASE_URL:"",NEXT_TELEMETRY_DISABLED:"1",NEXT_DIST_DIR:output+"/.next-browser"},stdio:["ignore","pipe","pipe"]});
app.stdout.on("data",data=>logs.push(data.toString()));app.stderr.on("data",data=>logs.push(data.toString()));
let browser;
try {
  for(let n=0;n<120;n++){try{if((await fetch(base+"/api/health")).ok)break}catch{}if(n===119)throw Error("Not ready");await new Promise(r=>setTimeout(r,500));}
  browser=await chromium.launch({channel:"chrome",headless:true});const page=await browser.newPage({viewport:{width:1200,height:900}});
  page.on("pageerror",error=>errors.push(error.message));page.on("request",request=>requests.push(request.url()));
  const response=await page.goto(base+"/api/agent/artifacts/pelican-cycling");assert.equal(response.status(),200);
  await expect(page.getByRole("heading",{name:"鹈鹕骑行"})).toBeVisible();
  const phase=()=>page.locator("#scene").getAttribute("data-phase");const first=await phase();await expect.poll(phase).not.toBe(first);
  await page.getByRole("button",{name:"暂停动画"}).click();await expect(page.locator("#status")).toHaveText("已暂停");const paused=await phase();await page.waitForTimeout(200);assert.equal(await phase(),paused);
  await page.getByRole("button",{name:"播放动画"}).click();await expect.poll(phase).not.toBe(paused);
  await page.getByRole("slider",{name:"骑行速度"}).fill("1.7");await expect(page.locator("#speed-value")).toHaveText("1.7×");
  await page.getByRole("button",{name:"重新开始动画"}).click();await expect(page.locator("#status")).toHaveText("骑行中");
  await page.screenshot({path:output+"/pelican-desktop.png"});
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+"/pelican-mobile.png"});
  const download=await page.request.get(base+"/api/agent/artifacts/pelican-cycling?download=1");assert.equal(download.status(),200);assert(download.headers()["content-disposition"].startsWith("attachment"));assert.equal(await download.text(),await readFile("public/agent-artifacts/pelican-cycling.html","utf8"));
  await page.emulateMedia({reducedMotion:"reduce"});await page.reload();await expect(page.locator("#status")).toHaveText("已暂停");
  assert.deepEqual(errors,[]);assert(requests.every(url=>url.startsWith(base)));
  console.log("PELICAN_BROWSER=PASS animation=running pause=PASS replay=PASS speed=1.7 mobile=390 reduced_motion=PASS download_bytes=exact page_errors=0 external_requests=0");
}finally{
  await browser?.close();if(app.pid){try{execFileSync("taskkill",["/PID",String(app.pid),"/T","/F"],{stdio:"pipe"})}catch{}}
  await writeFile(output+"/browser-next.log",logs.join(""));await writeFile("tsconfig.json",config);
}
