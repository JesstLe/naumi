/** Real Next + native PG-backed Canvas. No intercepted browser route. */
import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {chromium,expect as baseExpect,type Page} from "@playwright/test";
import {verifyCanvasInputControls} from "./verification/canvas-input-controls-browser.mjs";
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");const fixture=JSON.parse(await readFile("output/model-management-fixture/fixture.json","utf8"));
 const origin="http://127.0.0.1:54989",out=path.resolve(process.env.CANVAS_INPUT_UI_EVIDENCE||"output/canvas-input-controls-ui");await mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:process.platform==="win32"?"msedge":undefined,headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),expect=baseExpect.configure({timeout:45000});
 const checks:string[]=[],errors:string[]=[],mutations:unknown[]=[],scriptResponses:unknown[]=[],requestFailures:unknown[]=[],runtimeExceptions:unknown[]=[];let page:Page|undefined;const pass=(name:string)=>{checks.push(name);console.log("PASS "+name);};
 try{
  await context.addCookies([{name:"nv_user",value:fixture.memberCookie,domain:"127.0.0.1",path:"/"},{name:"naumi_locale",value:"zh",url:origin}]);
  const before=await (await context.request.get(origin+"/api/account?email=mvp-member%40example.test")).json();
  await context.addInitScript(user=>{localStorage.setItem("naumi:user:"+user.email,JSON.stringify(user));localStorage.setItem("naumi:last-email",user.email);localStorage.setItem("nv:canvas:last","tree:integration-image");localStorage.setItem("nv:canvas:bg","light");},before.user);
  page=await context.newPage();page.setDefaultTimeout(45000);page.on("pageerror",error=>errors.push(error.stack||error.message));page.on("requestfailed",request=>requestFailures.push({url:request.url(),failure:request.failure()}));page.on("response",response=>{if(response.request().resourceType()==="script")scriptResponses.push({url:response.url(),status:response.status(),headers:response.headers()});});page.on("request",request=>{const url=new URL(request.url());if(url.pathname.startsWith("/api/")&&request.method()==="POST"&&!url.pathname.startsWith("/api/media/"))mutations.push({path:url.pathname,body:request.postDataJSON()});});
  const diagnostics=await context.newCDPSession(page);diagnostics.on("Runtime.exceptionThrown",event=>runtimeExceptions.push(event.exceptionDetails));await diagnostics.send("Runtime.enable");
  await page.goto(origin+"/canvas",{waitUntil:"domcontentloaded"});await expect(page.locator('.react-flow__node[data-id="integration-image"]')).toBeVisible();const assistant=page.getByRole("button",{name:"收起助手",exact:true});if(await assistant.isVisible())await assistant.click();
  checks.push(...await verifyCanvasInputControls({page,expect,out}));
  const after=await (await context.request.get(origin+"/api/account?email=mvp-member%40example.test")).json();assert.deepEqual(after.artworks,before.artworks);assert.deepEqual(mutations,[]);assert.equal((await(await fetch(fixture.control+"/stats")).json() as {paid:number}).paid,0);assert.deepEqual(errors,[]);pass("view-only interactions preserve real artwork metadata, send no business mutation and no supplier call");
  await writeFile(path.join(out,"RESULT.json"),JSON.stringify({status:"PASS",checks,actualNext:true,realPg:true,routeMocks:0,pageErrors:errors,mutations,supplier:0},null,2)+"\n");console.log(`CANVAS_INPUT_CONTROLS_NEXT=PASS CHECKS=${checks.length} ACTUAL_NEXT=1 REAL_PG=1 BROWSER_ROUTES_MOCKED=0 BUSINESS_MUTATIONS=0 SUPPLIER=0`);
 }catch(error){await writeFile(path.join(out,"FAILURE.json"),JSON.stringify({error:String(error),checks,errors,mutations,scriptResponses,requestFailures,runtimeExceptions,url:page?.url(),html:await page?.content().catch(()=>"")},null,2)+"\n");if(page)await page.screenshot({path:path.join(out,"failure.png"),fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();console.log("CANVAS_INPUT_NEXT_CLEANUP=PASS BROWSER_CLOSED=1");}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
