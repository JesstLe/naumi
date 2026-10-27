/** Actual Next Canvas, real isolated PG and original HTTP handlers. No route mock. */
import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {chromium,expect as baseExpect,type Page} from "@playwright/test";

async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");
  const fixture=JSON.parse(await readFile("output/model-management-fixture/fixture.json","utf8"));
  const origin="http://127.0.0.1:54989",out=path.resolve(process.env.PROJECT_UI_EVIDENCE||"output/canvas-project-catalog-ui");await mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:process.platform==="win32"?"msedge":undefined,headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}});
  const expect=baseExpect.configure({timeout:45000}),checks:string[]=[],errors:string[]=[],posts:unknown[]=[];
  let page:Page|undefined;
  const pass=(name:string)=>{checks.push(name);console.log("PASS "+name);};
  try{
    await context.addCookies([{name:"nv_user",value:fixture.memberCookie,domain:"127.0.0.1",path:"/"},{name:"naumi_locale",value:"zh",url:origin}]);
    await context.addInitScript(()=>{localStorage.removeItem("nv:canvas:last");localStorage.setItem("nv:canvas:bg","light");});
    page=await context.newPage();page.setDefaultTimeout(45000);page.on("pageerror",e=>errors.push(e.message));page.on("request",request=>{if(new URL(request.url()).pathname==="/api/projects"&&request.method()==="POST")posts.push(request.postDataJSON());});
    const names=async()=>{const response=await context.request.get(origin+"/api/projects?email=mvp-member%40example.test");assert.equal(response.status(),200);return (await response.json()).names as Record<string,string>;};
    const account=await (await context.request.get(origin+"/api/account?email=mvp-member%40example.test")).json();
    // Seed only the actual authorized PG user, as the existing Canvas UI suites
    // do; native session and all application handlers remain real.
    await context.addInitScript(user=>{localStorage.setItem("naumi:user:"+user.email,JSON.stringify(user));localStorage.setItem("naumi:last-email",user.email);},account.user);
    await page.goto(origin+"/canvas",{waitUntil:"domcontentloaded"});const list=page.getByTestId("canvas-project-browser");await expect(list).toBeVisible();await expect(list.getByTitle("合并验收图片",{exact:true})).toBeVisible();pass("real catalog groups actual image/text rows into the original project card");
    await list.getByTitle("更多",{exact:true}).first().click();await list.getByRole("button",{name:"重命名",exact:true}).click();await list.locator("input").fill("R6L 项目一");await list.locator("input").press("Enter");await expect.poll(async()=>(await names())["tree:integration-image"]).toBe("R6L 项目一");pass("card Enter writes through real authenticated projects handler and persists in PG");
    await list.getByTitle("R6L 项目一",{exact:true}).click();await expect(page.locator('.react-flow__node[data-id="integration-image"]')).toBeVisible();const chrome=page.getByTestId("canvas-project-chrome");await expect(chrome).toContainText("R6L 项目一");pass("opening renamed project retains original native image/text graph");
    await chrome.getByTitle("重命名",{exact:true}).click();await chrome.locator("input").fill("不应保存");const before=posts.length;await chrome.locator("input").press("Escape");await expect(chrome.locator("input")).toHaveCount(0);assert.equal((await names())["tree:integration-image"],"R6L 项目一");assert.equal(posts.length,before);pass("editor title Escape cancels without a project-name POST");
    await chrome.getByTitle("重命名",{exact:true}).click();await chrome.locator("input").fill("R6L 项目二");await chrome.locator("input").press("Enter");await expect.poll(async()=>(await names())["tree:integration-image"]).toBe("R6L 项目二");await expect(chrome).toContainText("R6L 项目二");pass("next title Enter after Escape is not swallowed and persists once");
    await chrome.getByRole("button").first().click();await page.locator("aside").getByRole("button",{name:"全部项目",exact:true}).click();await expect(list).toBeVisible();await expect(list.getByTitle("R6L 项目二",{exact:true})).toBeVisible();pass("real project menu returns through original browser history without losing the name");
    await list.getByRole("button",{name:"通用工作流",exact:true}).click();await expect(list.getByTitle("R6L 项目二",{exact:true})).toHaveCount(0);await list.getByRole("button",{name:"全部项目",exact:true}).click();await expect(list.getByTitle("R6L 项目二",{exact:true})).toBeVisible();pass("catalog and workflow tabs switch through shared owner without touching project data");
    assert.equal(await list.locator("button .leading-5").count(),0);pass("four workflow helper descriptions are removed from actual light-layout controls");
    const final=await (await context.request.get(origin+"/api/account?email=mvp-member%40example.test")).json();assert.deepEqual(final.artworks,account.artworks);assert.equal(posts.length,2);pass("actual artwork bytes/metadata are unchanged and two intentional renames produce exactly two writes");
    await page.screenshot({path:path.join(out,"project-browser-next.png"),fullPage:true});
    await page.reload({waitUntil:"domcontentloaded"});await expect(list.getByTitle("R6L 项目二",{exact:true})).toBeVisible();assert.equal(posts.length,2);pass("full Next refresh restores saved name with no repeated mutation");
    const stats=await (await fetch(fixture.control+"/stats")).json() as {paid:number};assert.equal(stats.paid,0);assert.deepEqual(errors,[]);pass("actual PG/Next flow has no paid supplier call, no browser route replacement and no page exception");
    await writeFile(path.join(out,"RESULT.json"),JSON.stringify({status:"PASS",checks,actualNext:true,realPg:true,routeMocks:0,posts,pageErrors:errors,paidCalls:0},null,2)+"\n");
    console.log(`CANVAS_PROJECT_CATALOG_NEXT=PASS CHECKS=${checks.length} ACTUAL_NEXT=1 REAL_PG=1 BROWSER_ROUTES_MOCKED=0 PROJECT_POSTS=${posts.length} SUPPLIER=0`);
  }catch(error){
    await writeFile(path.join(out,"FAILURE.json"),JSON.stringify({error:String(error),checks,errors,posts,url:page?.url(),html:await page?.content().catch(()=>"")},null,2)+"\n");
    if(page)await page.screenshot({path:path.join(out,"failure.png"),fullPage:true}).catch(()=>{});
    throw error;
  }finally{await browser.close();console.log("PROJECT_CATALOG_NEXT_CLEANUP=PASS BROWSER_CLOSED=1");}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
