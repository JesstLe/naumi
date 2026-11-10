/** Built application smoke, native session, real isolated database. No mocks. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {mkdir,writeFile} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import {spawn} from "node:child_process";
import {setTimeout as wait} from "node:timers/promises";
import {build} from "esbuild";
import path from "node:path";
import {chromium} from "@playwright/test";
import {createModelFixture} from "./model-config-fixture";
const i=process.argv.indexOf("--out"),out=path.resolve(i<0?"output/comfy-canvas-app":process.argv[i+1]);
async function main(){
 await mkdir(out,{recursive:true});const f=await createModelFixture();Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_APPLICATION_TASK_EXECUTION:"worker",NEXT_TELEMETRY_DISABLED:"1",VIDEO_WORKER_SECRET:"comfy-isolated-fixture-worker-secret-20261110",OPENAI_API_KEY:"comfy-local-fixture-not-a-provider-key",OPENAI_BASE_URL:f.origin});
 let child:ReturnType<typeof spawn>|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,api:any,pool:any;
 const errors:string[]=[],requests:{url:string;status:number}[]=[];let checks=0;
 try{
  const outfile=path.join(out,"seed.cjs");await build({stdin:{contents:'export * as db from "./src/lib/db";export * as auth from "./src/lib/native-auth";export * as nodes from "./src/lib/canvas/comfy-node-service";export * as doc from "./src/lib/comfyui/document";',resolveDir:process.cwd(),loader:"ts"},outfile,bundle:true,platform:"node",format:"cjs",external:["pg","sharp"],alias:{"server-only":path.resolve("scripts/fleet-server-only.cjs")}});
  api=createRequire(import.meta.url)(outfile);await api.db.ensureSchema();pool=api.db.getPool();const actor=`app-${randomUUID()}@fixture.test`;await api.db.getOrCreateUser(actor);
  const id=`comfy-${randomUUID()}`,raw={"1":{class_type:"CLIPTextEncode",inputs:{text:"Actual application"},_meta:{title:"Prompt"}},"2":{class_type:"SaveImage",inputs:{images:["1",0],filename_prefix:"output"},_meta:{title:"Output"}}};
  await api.nodes.saveComfyNode(actor,{id,operationId:randomUUID(),projectKey:`tree:${id}`,expectedRevision:0,title:"Canvas Comfy E2E",workflow:api.doc.parseComfyDocument(raw)});
  const origin="http://127.0.0.1:31871",log=createWriteStream(path.join(out,"SERVER.log"));child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","31871"],{env:{...process.env},windowsHide:true,stdio:["ignore","pipe","pipe"]});child.stdout!.pipe(log);child.stderr!.pipe(log);
  let ready=false;for(let n=0;n<90;n++){if(child.exitCode!==null)throw Error("Application exited before readiness");try{const r=await fetch(origin+"/api/version");if(r.ok){ready=true;break;}}catch{}await wait(500);}assert.ok(ready,"application ready");checks++;
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:"nv_user",value:api.auth.signUserSession(actor,Date.now()),url:origin,httpOnly:true,sameSite:"Lax"}]);
  const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));page.on("response",r=>{if(r.url().includes("/api/"))requests.push({url:new URL(r.url()).pathname,status:r.status()});});
  await page.goto(origin+"/canvas",{waitUntil:"domcontentloaded",timeout:60000});await page.getByTitle("Canvas Comfy E2E",{exact:true}).first().click({timeout:45000});
  await page.getByTestId("comfy-workflow-group").waitFor({timeout:30000});assert.equal(await page.getByTestId("comfy-graph-node").count(),2);checks++;
  const input=page.getByLabel("text",{exact:true});await input.fill("Saved by the real CanvasClient");await input.press("Tab");
  await page.waitForResponse(r=>r.url().includes("/api/canvas/history")&&r.ok(),{timeout:20000});
  const saved=(await pool.query("SELECT workflow FROM app_canvas_comfy_nodes WHERE email=$1 AND id=$2",[actor,id])).rows[0];assert.equal(saved.workflow.raw["1"].inputs.text,"Saved by the real CanvasClient");checks++;
  await page.screenshot({path:path.join(out,"real-canvas.png")});
  await page.reload({waitUntil:"domcontentloaded"});await page.getByTestId("comfy-workflow-group").waitFor({timeout:30000});assert.equal(await page.getByLabel("text",{exact:true}).inputValue(),"Saved by the real CanvasClient");checks++;
  await page.getByTestId("canvas-add-node-button").click();await page.getByRole("menuitem",{name:/ComfyUI/}).click();await page.getByRole("dialog",{name:"ComfyUI 工作流"}).waitFor();assert.equal(await page.getByText('先在「端点」页连接你的 ComfyUI').count(),0);checks++;
  await page.getByRole("button",{name:"关闭工作流面板"}).click();await page.getByTestId("comfy-workflow-group").getByRole("button",{name:"运行",exact:true}).click();await page.getByText("添加端点",{exact:true}).waitFor();checks++;
  assert.deepEqual(errors,[]);assert.equal(requests.some(r=>r.url==="/api/comfyui/run"),false);checks++;
  await writeFile(path.join(out,"RESULT.json"),JSON.stringify({status:"PASS",checks,errors,requests,realNextApp:true,realPostgres:true,nativeAuth:true,supplierCalls:0},null,2));console.log(`COMFY_CANVAS_APP=PASS CHECKS=${checks} BUILT_NEXT=1 REAL_PG=1 NATIVE_AUTH=1 EDIT_RELOAD=1 EMPTY_SOURCE_MENU=1 PAGEERRORS=0 SUPPLIER_CALLS=0`);
 }catch(error){if(browser){const page=browser.contexts()[0]?.pages()[0];if(page){await page.screenshot({path:path.join(out,"failure.png")});await writeFile(path.join(out,"PAGE.txt"),await page.locator("body").innerText());}}await writeFile(path.join(out,"ERRORS.json"),JSON.stringify({errors,requests,error:String(error)},null,2));throw error;
 }finally{await browser?.close();if(child&&child.exitCode===null){child.kill();await new Promise(resolve=>child!.once("exit",resolve));}await pool?.end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
