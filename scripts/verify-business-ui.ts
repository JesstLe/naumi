import {observeAdminBrowser} from "./verification/admin-browser-diagnostics";
/** Browser acceptance against the isolated app + pinned real Go Router. No paid provider calls. */
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { chromium,expect,type Page } from "@playwright/test";

async function enterCanvasTextTool(user: Page) {
  const deadline=performance.now()+30000;
  const remaining=()=>{
    const ms=Math.ceil(deadline-performance.now());
    if(ms<=0)throw new Error("Canvas text tool readiness exceeded the original 30000ms budget");
    return ms;
  };
  const canvas=user.getByTestId("canvas-drop-zone"),textTool=canvas.locator('button[data-tool="text"]');
  const newProject=canvas.getByTestId("canvas-project-browser").getByRole("button",{name:"创建新项目",exact:true});
  // Loading is neither an open editor nor an actionable project browser.
  await textTool.or(newProject).filter({visible:true}).first().waitFor({timeout:remaining()});
  if(await newProject.isVisible())await newProject.click({timeout:remaining()});
  await textTool.waitFor({timeout:remaining()});await textTool.click({timeout:remaining()});
}

async function main() {
  if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1")throw new Error("Isolated fixture required");
  const origin=process.env.NAUMI_MODEL_UI_BASE_URL||"http://127.0.0.1:54980",fixture=JSON.parse(await readFile("output/model-ui-fixture.json","utf8"));
  const browser=await chromium.launch({channel:process.platform==="win32"?"msedge":undefined,headless:true});
  const folder="output/billing-routing-20261007";
  await mkdir(folder,{recursive:true});
  const admin=await browser.newContext({viewport:{width:1440,height:960}}),member=await browser.newContext({viewport:{width:1440,height:960}});
  const diagnose=observeAdminBrowser([admin,member],"output/billing-routing-20261007/failure");
  try {
    await admin.addCookies([{name:"naumi_locale",value:"zh",domain:"127.0.0.1",path:"/"}]);
    const login=await admin.request.post(`${origin}/api/admin/login`,{data:{password:"ModelUiFixture2026!"}});assert.equal(login.status(),200,await login.text());
    const state=await (await admin.request.get(`${origin}/api/admin/bi/model-config`)).json(),clean=structuredClone(state.snapshot.config);
    const price=(Number(state.snapshot.config.business?.["image.generate"]?.options[0]?.pricing?.amountMicros || 740000)+10000)/1000000,credits=Math.ceil(price*100);
    clean.publicModels=clean.publicModels.filter((m:any)=>m.id!=="enterprise-image");delete clean.business?.["image.generate"];delete clean.business?.["tool.garment"];
    assert.equal((await admin.request.put(`${origin}/api/admin/bi/model-config/draft`,{data:{id:state.draft.id,expectedRevision:state.draft.revision,config:clean}})).status(),200);
    const page=await admin.newPage();page.setDefaultTimeout(30000);
    await page.goto(`${origin}/admin/billing`,{waitUntil:"domcontentloaded"});await page.getByRole("button",{name:"功能计费与路由",exact:true}).click();await page.getByTestId("business-routing-editor").waitFor();
    await page.getByLabel("新增公开模型 ID",{exact:true}).fill("enterprise-image");
    await page.getByRole("button",{name:"添加模型选项",exact:true}).click();
    await page.getByLabel("前端展示名称",{exact:true}).fill("灵动企业2.5");
    await page.getByLabel("用户售价（人民币元 / 成功单位）",{exact:true}).fill(String(price));
    assert.ok((await page.getByTestId("business-model-quote").innerText()).includes(`${credits} 积分`));
    await page.getByLabel("选择工具 / 画布操作").selectOption("tool.garment");
    await page.getByLabel("复用公开模型",{exact:true}).selectOption("enterprise-image");
    await page.getByLabel("用户售价（人民币元 / 成功单位）",{exact:true}).fill("0.9");
    await page.getByLabel("选择工具 / 画布操作").selectOption("image.generate");
    await page.getByRole("button",{name:"校验并预览发布差异",exact:true}).click();
    await page.getByRole("dialog").waitFor();
    await page.getByLabel("发布 / 恢复原因",{exact:true}).fill("Browser business acceptance - actual Go Router publication");
    await page.getByRole("button",{name:"确认发布此草稿",exact:true}).click();
    await page.getByRole("dialog").waitFor({state:"hidden"});
    await page.reload({waitUntil:"domcontentloaded"});await page.getByRole("button",{name:"功能计费与路由",exact:true}).click();await page.getByTestId("business-routing-editor").waitFor();
    assert.equal(await page.getByLabel("前端展示名称",{exact:true}).inputValue(),"灵动企业2.5");
    assert.equal(await page.getByLabel("用户售价（人民币元 / 成功单位）",{exact:true}).inputValue(),String(price));
    await page.screenshot({path:`${folder}/business-admin-desktop.png`,fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),"Mobile admin must not overflow");
    await page.screenshot({path:`${folder}/business-admin-mobile.png`,fullPage:true});
    await member.addCookies([{name:"nv_user",value:fixture.userCookie,domain:"127.0.0.1",path:"/"},{name:"naumi_locale",value:"zh",domain:"127.0.0.1",path:"/"}]);
    const user=await member.newPage();user.setDefaultTimeout(30000);
    let releaseSession!:()=>void;const sessionGate=new Promise<void>(resolve=>{releaseSession=resolve;});await user.route("**/api/auth/session",async route=>{await sessionGate;await route.continue();});
    await user.goto(`${origin}/garment`,{waitUntil:"domcontentloaded"});
    const selector=user.getByRole("combobox",{name:"执行模型",exact:true});await selector.waitFor();
    await expect(selector).toBeDisabled();releaseSession();await expect(selector).toBeEnabled({timeout:30000});
    assert.ok((await selector.innerText()).includes("灵动企业2.5"));await selector.click();
    const choices=user.getByRole("listbox",{name:"执行模型",exact:true}).getByRole("option");await expect(choices).toHaveText(["灵动企业2.5"]);await choices.first().click();await expect(selector).toHaveAttribute("aria-expanded","false");
    await user.screenshot({path:`${folder}/business-tool-model.png`,fullPage:true});
    const catalog=await (await member.request.get(`${origin}/api/models?feature=image.generate`)).json();assert.deepEqual(catalog.models.map((m:any)=>m.id),["enterprise-image"]);
    assert.ok(!JSON.stringify(catalog).includes("wire-image"));
    const quoted=await member.request.post(`${origin}/api/billing/quote`,{data:{feature:"image.generate",quantity:1,modelId:"enterprise-image"}});assert.equal(quoted.status(),200);assert.equal((await quoted.json()).credits,credits);
    await user.goto(`${origin}/canvas`,{waitUntil:"domcontentloaded"});
    await enterCanvasTextTool(user);
    // New text nodes open in body-editing mode; the model catalog belongs to AI writing.
    const textDock=user.getByTestId("text-node-dock");await textDock.getByRole("tab",{name:"AI 写作",exact:true}).click();
    const textModel=textDock.getByRole("button",{name:"业务文字",exact:true});await textModel.first().waitFor();await textModel.first().click();
    assert.equal(await user.getByRole("button",{name:"自定义模型 ID",exact:true}).count(),0);
    await user.screenshot({path:`${folder}/business-canvas-text-model.png`,fullPage:true});
    assert.equal((await member.request.post(`${origin}/api/admin/bi/model-config`,{data:{}})).status(),404);
    const metrics=await (await fetch(`${fixture.controlOrigin}/fixture/metrics`)).json();assert.ok(metrics.activations>=1);assert.equal(metrics.generationRequests,0);
    console.log(`BROWSER_ADMIN=PASS APPLY_REAL_GO_ROUTER=PASS RELOAD_PRICE=${credits} TOOL_CATALOG=PASS CANVAS_TEXT_CATALOG=PASS MOBILE=PASS NON_ADMIN=404 SUPPLIER_CALLS=0`);
  }catch(error){await diagnose(error).catch(capture=>console.error("DIAGNOSTIC_CAPTURE_FAILED",capture));throw error;}finally{await admin.close();await member.close();await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
