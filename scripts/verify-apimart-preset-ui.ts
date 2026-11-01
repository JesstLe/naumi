import {observeAdminBrowser} from "./verification/admin-browser-diagnostics";
import assert from "node:assert/strict";
import { readFile,mkdir } from "node:fs/promises";
import { chromium,expect } from "@playwright/test";
async function main(){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1")throw Error("isolated DB required");
 const origin=process.env.NAUMI_MODEL_UI_BASE_URL||"http://127.0.0.1:54980",f=JSON.parse(await readFile("output/model-ui-fixture.json","utf8"));
 const browser=await chromium.launch({channel:process.platform==="win32"?"msedge":undefined,headless:true});
 const admin=await browser.newContext({viewport:{width:1440,height:1000}}),user=await browser.newContext();
 const diagnose=observeAdminBrowser([admin,user],"output/apimart-preset-20261007/failure");
 try{
  await admin.addCookies([{name:"naumi_locale",value:"zh",domain:"127.0.0.1",path:"/"}]);
  assert.equal((await admin.request.post(origin+"/api/admin/login",{data:{password:"ModelUiFixture2026!"}})).status(),200);
  const read=async()=>(await admin.request.get(origin+"/api/admin/bi/model-config")).json();
  const initial=await read(),config=structuredClone(initial.draft.config),now=new Date().toISOString();
  config.providers[0].protocol="apimart-images";
  Object.assign(config.upstreamModels[0].capabilities,{qualities:["low","medium"],nativeResolutions:["1K","2K","4K"],preserveIdentity:true,textAccuracy:true});
  assert.equal((await admin.request.put(origin+"/api/admin/bi/model-config/draft",{data:{id:initial.draft.id,expectedRevision:initial.draft.revision,config}})).status(),200);
  const page=await admin.newPage(),errors:string[]=[];page.setDefaultTimeout(60000);page.on("pageerror",e=>errors.push(e.message));page.on("response",async r=>{if(r.status()>=400 && r.url().includes("/api/admin/bi/model-config"))console.log("PUBLICATION_ERROR",r.status(),await r.text());});await page.goto(origin+"/admin/billing",{waitUntil:"domcontentloaded"});await page.getByRole("button",{name:"APIMart 默认预设",exact:true}).click();
  await page.getByRole("button",{name:"建立默认预设（倍率 1.5）",exact:true}).click();await page.getByTestId("apimart-default-preset").waitFor();
  await expect(page.getByLabel("售价倍率（1.5 = 加价 50%）")).toHaveValue("1.5");
  await page.getByLabel("实际 APIMart 模型",{exact:true}).selectOption("u1");
  await page.getByLabel("每张用户授权售价上限（人民币）",{exact:true}).fill("1");
  await page.getByLabel("每人民币兑换积分（沿用现有规则；0 表示待核实）",{exact:true}).fill("10");
  await page.getByLabel("上游质量参数",{exact:true}).selectOption("quality");
  await page.getByLabel("核验来源（生产配置与官方能力文档）",{exact:true}).fill("isolated fixture ONLY, not production ID evidence");
  await page.getByLabel("已核实当前默认模型准确 ID 与参数能力",{exact:true}).check();
  await page.getByLabel("原生支持分辨率（1K / 2K / 4K）",{exact:true}).fill(`["1K","2K","4K"]`);await page.getByLabel("原生支持比例",{exact:true}).fill(`["1:1","16:9"]`);await page.getByLabel("分辨率上游格式映射",{exact:true}).fill(`{"1K":"1k","2K":"2k","4K":"4k"}`);await page.getByLabel("比例上游 size 映射",{exact:true}).fill(`{"1:1":"1:1","16:9":"16:9"}`);await page.getByLabel("原生输出像素矩阵（规格:比例）",{exact:true}).fill(`{"1K:1:1":{"width":1024,"height":1024},"1K:16:9":{"width":1024,"height":576},"2K:1:1":{"width":2048,"height":2048},"2K:16:9":{"width":2048,"height":1152},"4K:1:1":{"width":2880,"height":2880},"4K:16:9":{"width":3840,"height":2160}}`);
  await page.getByLabel("有效规格完整 API 成本／用量估算（low、medium × 1K、2K、4K）",{exact:true}).fill(JSON.stringify(["low","medium"].flatMap(quality=>["1K","2K","4K"].map(resolution=>({quality,resolution,procurement:{confirmed:true,currency:"CNY",basis:"image",amountMicros:"500000",source:"isolated complete mock API cost",updatedAt:now}})))));
  await page.getByLabel("启用（应用后新请求生效）",{exact:true}).check();
  const publish=async(reason:string)=>{await page.getByRole("button",{name:"校验并预览发布差异",exact:true}).click();await page.getByRole("dialog").waitFor();await page.getByLabel("发布 / 恢复原因",{exact:true}).fill(reason);await page.getByRole("button",{name:"确认发布此草稿",exact:true}).click();await page.getByRole("dialog").waitFor({state:"hidden"});await expect(page.getByRole("status").filter({hasText:"已确认生效"})).toBeVisible();};
  await publish("isolated APIMart preset apply");const applied=await read();assert.equal(applied.snapshot.config.defaultImagePreset.factorBps,15000);
  await page.reload({waitUntil:"domcontentloaded"});await page.getByRole("button",{name:"APIMart 默认预设",exact:true}).click();await expect(page.getByLabel("售价倍率（1.5 = 加价 50%）")).toHaveValue("1.5");
  await mkdir("output/apimart-preset-20261007",{recursive:true});await page.screenshot({path:"output/apimart-preset-20261007/admin-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:"output/apimart-preset-20261007/admin-mobile.png",fullPage:true});
  await user.addCookies([{name:"nv_user",value:f.userCookie,domain:"127.0.0.1",path:"/"},{name:"naumi_locale",value:"zh",domain:"127.0.0.1",path:"/"}]);
  for(const feature of ["image.generate","tool.garment","canvas.image","canvas.expand"]){const r=await user.request.get(origin+"/api/models?feature="+feature);assert.equal(r.status(),200);const d=await r.json();assert.equal(d.defaultModelId,"gpt-image2.5");assert.equal(d.models[0].label,"灵动2.5");assert.ok(d.models[0].qualities.includes("max"));}
  const quote=async(feature:string)=>{const r=await user.request.post(origin+"/api/billing/quote",{data:{feature,modelId:"gpt-image2.5",quantity:1,quality:"max",resolution:"4K",ratio:"16:9"}});assert.equal(r.status(),200);return r.json();};
  const quoted=await quote("image.generate");assert.equal(quoted.credits,8);assert.equal(quoted.authorizedCredits,10);assert.equal(quoted.effectiveParameters.quality,"medium");assert.equal(quoted.requestedParameters.quality,"max");
  await page.getByLabel("售价倍率（1.5 = 加价 50%）").fill("2");await publish("isolated markup change");assert.equal((await quote("tool.garment")).credits,10);assert.equal((await read()).snapshot.config.defaultImagePreset.factorBps,20000);
  assert.equal((await user.request.put(origin+"/api/admin/bi/model-config/draft",{data:{}})).status(),404);
  assert.equal((await user.request.post(origin+"/api/admin/bi/model-config",{data:{}})).status(),404);
  const metrics=await (await fetch(f.controlOrigin+"/fixture/metrics")).json();assert.equal(metrics.generationRequests,0);assert.equal(errors.length,0,errors.join("\n"));
  console.log("APIMART_PRESET_BROWSER=PASS CREATE_EDIT_APPLY_RELOAD=PASS MARKUP_PRICE=8_TO_10 ESCROW=10 QUALITY_DISPLAY_MAX_EXECUTION_MEDIUM=PASS TOOL_CANVAS_PUBLIC_LIST=PASS MOBILE=PASS NON_ADMIN=404 REAL_GO_ROUTER_PUBLICATION=PASS REAL_PAID_API_CALLS=0");
 }catch(error){await diagnose(error).catch(capture=>console.error("DIAGNOSTIC_CAPTURE_FAILED",capture));throw error;}finally{await admin.close();await user.close();await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
