import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium,expect} from "@playwright/test";
async function main(){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1")throw Error("Isolated fixture only");
 const f=JSON.parse(await readFile("output/model-management-fixture/fixture.json","utf8")),origin="http://127.0.0.1:54989";
 const browser=await chromium.launch({channel:"msedge",headless:true}),context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(45000);expect.configure({timeout:45000});const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  assert.equal((await context.request.post(origin+"/api/admin/login",{data:{password:"MvpFixture2026!"}})).status(),200);await context.addCookies([{name:"nv_user",value:f.memberCookie,domain:"127.0.0.1",path:"/"}]);
  const before=await(await context.request.get(origin+"/api/admin/bi/model-config")).json();
  await page.goto(origin+"/admin/model-management");await page.getByRole("link",{name:"元数据与成本库",exact:true}).click();
  await expect(page.getByRole("heading",{name:"模型规格与成本，有据可查。",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"导入现有配置与缓存",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("人工维护的能力和成本保留");
  await page.getByTestId("metadata-edit-gpt-image-2").click();const dialog=page.getByRole("dialog",{name:"维护供应商模型元数据",exact:true});
  await dialog.getByLabel("模型家族",{exact:true}).fill("验收图片家族");await dialog.getByLabel("品牌",{exact:true}).fill("验收品牌");
  await dialog.getByLabel("能力信息状态",{exact:true}).selectOption("documented");await dialog.getByLabel("能力信息来源",{exact:true}).fill("Isolated fixture specification only");
  await dialog.getByLabel("能力文档URL",{exact:true}).fill("https://fixture.example/spec");await dialog.getByLabel("能力核对日期",{exact:true}).fill("2026-10-09");
  await dialog.getByLabel("参数元信息JSON",{exact:true}).fill('{"seed":{"type":"integer","minimum":0,"default":42}}');
  await dialog.getByRole("button",{name:"新增采购报价",exact:true}).click();const price=dialog.getByRole("region",{name:"采购报价 1",exact:true});
  await price.getByLabel("计费方式",{exact:true}).selectOption("token");await price.getByLabel("输入 / 百万token",{exact:true}).fill("1.25");await price.getByLabel("输出 / 百万token",{exact:true}).fill("3.75");await price.getByLabel("缓存输入 / 百万token",{exact:true}).fill("0.125");
  await price.getByLabel("报价依据",{exact:true}).selectOption("documented");await price.getByLabel("报价来源",{exact:true}).fill("Isolated fixture pricing only");
  await price.getByLabel("报价文档URL",{exact:true}).fill("https://fixture.example/prices");await price.getByLabel("报价核对日期",{exact:true}).fill("2026-10-09");
  await page.screenshot({path:"output/model-management-fixture/metadata-dialog.png",fullPage:true});
  await dialog.getByRole("button",{name:"保存元数据",exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByLabel("品牌",{exact:true}).selectOption("验收品牌");await page.getByLabel("模型家族",{exact:true}).selectOption("验收图片家族");await page.getByLabel("供应商",{exact:true}).selectOption("p1");
  await page.getByLabel("计费方式",{exact:true}).selectOption("token");await page.getByLabel("能力信息状态",{exact:true}).selectOption("documented");
  await expect(page.getByText("1 条模型元数据",{exact:true})).toBeVisible();await expect(page.getByText(/输入 \$1.25.*输出 \$3.75/)).toBeVisible();await page.screenshot({path:"output/model-management-fixture/metadata-filtered.png",fullPage:true});
  const saved=await(await context.request.get(origin+"/api/admin/model-management/library?brand="+encodeURIComponent("验收品牌"))).json();const model=saved.models[0];
  assert.equal(model.prices[0].inputMicrosPerMillion,"1250000");assert.equal(model.prices[0].cachedInputMicrosPerMillion,"125000");assert.equal(model.capabilityState,"documented");assert.equal(model.parameterMetadata.seed.default,42);
  const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"导出当前页",exact:true}).click();const file=await downloading,exported=JSON.parse(await readFile((await file.path())!,"utf8"));assert.equal(exported.schemaVersion,1);assert.equal(exported.models.length,1);assert.ok(!JSON.stringify(exported).includes("credentialRef"));
  await page.getByRole("button",{name:"发现目录并同步",exact:true}).click();await expect(page.getByRole("status")).toContainText("人工维护的能力和成本保留");
  const preserved=await(await context.request.get(origin+"/api/admin/model-management/library?id="+model.id)).json();assert.equal(preserved.model.brand,"验收品牌");assert.deepEqual(preserved.model.prices,model.prices);
  await page.getByTestId("metadata-edit-gpt-image-2").click();await dialog.getByRole("button",{name:"查看修订记录",exact:true}).click();await expect(dialog.getByText(/v2 ·/)).toBeVisible();await dialog.getByRole("button",{name:"取消",exact:true}).click();
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByTestId("metadata-edit-gpt-image-2").click();
  await dialog.getByLabel("参数元信息JSON",{exact:true}).scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:"output/model-management-fixture/metadata-mobile.png",fullPage:true});await dialog.getByRole("button",{name:"取消",exact:true}).click();
  const after=await(await context.request.get(origin+"/api/admin/bi/model-config")).json();assert.deepEqual(after.snapshot,before.snapshot);assert.deepEqual(after.draft,before.draft);assert.deepEqual(after.billingSnapshot,before.billingSnapshot);
  const member=await browser.newContext();await member.addCookies([{name:"nv_user",value:f.memberCookie,domain:"127.0.0.1",path:"/"}]);assert.equal((await member.request.get(origin+"/api/admin/model-management/library")).status(),404);await member.close();
  const stats=await(await fetch(f.control+"/stats")).json();assert.equal(stats.paid,0);assert.equal(errors.length,0,errors.join("\n"));
  console.log("SUPPLIER_METADATA_BROWSER=PASS IMPORT_DISCOVERY=PASS FAMILY_BRAND_PROVIDER_BASIS_STATE_FILTER=PASS PARAMETERS=PASS INPUT_OUTPUT_CACHE_DECIMAL=PASS SAVE_REOPEN_HISTORY=PASS EXPORT_NO_CREDENTIAL=PASS CURATION_PRESERVED=PASS MOBILE=PASS CONFIG_PRICE_UNCHANGED=PASS MEMBER404=PASS PAID_GENERATION=0");
 }finally{await context.close();await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
