import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
test("billing administration simulates drafts and protects publishing", async ({ page }) => {
    if (!process.env.BILLING_UI_ADMIN_COOKIE)
        throw new Error("Isolated fixture admin cookie required");
    await page.context().addCookies([{ name: "nv_admin", value: process.env.BILLING_UI_ADMIN_COOKIE, domain: "127.0.0.1", path: "/" }]);
    await page.goto("/admin/billing");
    await page.getByLabel("普通生图 · medium 单价").fill("8");
    await page.getByRole("button", { name: "模拟报价", exact: true }).click();
    await expect(page.getByTestId("simulation-charge")).toHaveText("8 积分");
    await page.getByLabel("发布说明").fill("Local acceptance");
    await page.getByRole("button", { name: "查看改动", exact: true }).click();
    await expect(page.getByText("普通生图：价格已修改", { exact: true })).toBeVisible();
    await page.screenshot({ path: "output/billing-20261003/billing-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "output/billing-20261003/billing-mobile.png", fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test("anonymous visitors cannot access configuration", async ({ page }) => { await page.goto("/admin/billing"); await expect(page.getByRole("heading", { name: "计费管理", exact: true })).toHaveCount(0); expect((await page.request.get("/api/admin/billing")).status()).toBe(404); });
test("publish, user stale price, conflict draft and restore", async ({ browser }) => {
    const fixture = JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json", "utf8"));
    const admin = await browser.newContext(), member = await browser.newContext();
    await admin.addCookies([{ name: "nv_admin", value: fixture.adminCookie, domain: "127.0.0.1", path: "/" }]);
    await member.addCookies([{ name: "nv_user", value: fixture.userCookie, domain: "127.0.0.1", path: "/" }]);
    const a = await admin.newPage(), u = await member.newPage();
    try {
        await a.goto("/admin/billing");
        const initial = await (await admin.request.get("/api/admin/billing")).json();
        await u.goto("/generate");
        await u.locator("textarea").first().fill("Retain this local test prompt");
        await expect(u.getByTestId("billing-estimate")).toContainText("6");
        await a.getByLabel("普通生图 · medium 单价").fill("8");
        await a.getByLabel("发布说明").fill("UI acceptance eight credits");
        await a.getByRole("button", { name: "查看改动", exact: true }).click();
        await a.getByRole("button", { name: "发布配置", exact: true }).click();
        await expect(a.getByRole("status")).toContainText("已发布版本");
        const response = u.waitForResponse(r => r.url().includes("/api/generate-image") && r.request().method() === "POST");
        await u.getByTestId("billing-estimate").click();
        expect((await response).status()).toBe(409);
        await expect(u.locator("textarea").first()).toHaveValue("Retain this local test prompt");
        await expect(u.getByTestId("billing-estimate")).toContainText("8");
        // Concurrent publication must preserve this page's local draft.
        await a.getByLabel("普通生图 · medium 单价").fill("9");
        const latest = await (await admin.request.get("/api/admin/billing")).json(), external = structuredClone(latest.snapshot.config);
        external.features["tool.cutout"].pricing = { mode: "fixed", credits: 3 };
        expect((await admin.request.post("/api/admin/billing", { data: { id: randomUUID(), expectedVersion: latest.snapshot.version, config: external, reason: "Concurrent UI fixture" } })).status()).toBe(200);
        await a.getByLabel("发布说明").fill("Conflict acceptance");
        await a.getByRole("button", { name: "查看改动", exact: true }).click();
        await a.getByRole("button", { name: "发布配置", exact: true }).click();
        await expect(a.getByRole("alert").filter({ hasText: "草稿已保留" })).toBeVisible();
        await expect(a.getByLabel("普通生图 · medium 单价")).toHaveValue("9");
        await a.reload();
        await a.getByRole("button", { name: "版本历史", exact: true }).click();
        const row = a.getByRole("row").filter({ hasText: "UI acceptance setup" }).first();
        await row.getByRole("button", { name: "预览恢复" }).click();
        await a.getByRole("button", { name: "发布配置", exact: true }).click();
        await expect(a.getByRole("status")).toContainText("已发布版本");
        const restored = await (await admin.request.get("/api/admin/billing")).json();
        expect(restored.snapshot.version).toBeGreaterThan(initial.snapshot.version);
        expect(restored.snapshot.config.features["image.generate"].pricing.quality.medium).toBe(6);
        expect(JSON.stringify(await (await member.request.get("/api/billing/catalog")).json())).not.toContain("costRates");
    }
    finally {
        await admin.close();
        await member.close();
    }
});
test("configuration failure stays visible and cannot publish", async ({ page }) => {
    const fixture = JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json", "utf8"));
    await page.context().addCookies([{ name: "nv_admin", value: fixture.adminCookie, domain: "127.0.0.1", path: "/" }]);
    await page.route("**/api/admin/billing", async (route) => { await new Promise(resolve => setTimeout(resolve, 500)); await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "配置读取失败，请重试" }) }); });
    await page.goto("/admin/billing");
    await expect(page.getByRole("status")).toContainText("正在读取计费配置");
    await expect(page.getByRole("status")).toContainText("配置读取失败");
    await expect(page.getByRole("button", { name: "发布配置", exact: true })).toHaveCount(0);
});
test("uncertain submissions retain their identifier across explicit retries",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_user",value:fixture.userCookie,domain:"127.0.0.1",path:"/"}]);
 const ids:string[]=[];await page.route("**/api/generate-image",async route=>{ids.push(route.request().headers()["x-naumi-billing-operation-id"]);await route.fulfill({status:ids.length===1?503:409,contentType:"application/json",body:JSON.stringify({code:ids.length===1?"CONFIG_UNAVAILABLE":"OPERATION_PENDING",error:"fixture submission pending"})});});
 await page.goto("/generate");await page.locator("textarea").first().fill("Fixture retained intent");await expect(page.getByTestId("billing-estimate")).toContainText("6");
 await page.getByTestId("billing-estimate").click();await expect(page.getByText("fixture submission pending",{exact:true})).toBeVisible();await page.getByTestId("billing-estimate").click();await expect.poll(()=>ids.length).toBe(2);expect(ids[0]).toBeTruthy();expect(ids[1]).toBe(ids[0]);await expect(page.locator("textarea").first()).toHaveValue("Fixture retained intent");
});
test("administrators can change the customer billing unit",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_admin",value:fixture.adminCookie,domain:"127.0.0.1",path:"/"}]);await page.goto("/admin/billing");
 await page.getByLabel("计费单位",{exact:true}).selectOption("task");await page.getByLabel("模拟数量").fill("13");await page.getByRole("button",{name:"模拟报价",exact:true}).click();await expect(page.getByTestId("simulation-charge")).toHaveText("6 积分");
 await page.getByRole("button",{name:"查看改动",exact:true}).click();await expect(page.getByText(/单位：image → task/)).toBeVisible();
});
test("video retries retain the batch identity and uploaded reference",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_user",value:fixture.userCookie,domain:"127.0.0.1",path:"/"}]);
 const model={providerId:"openai-videos",modelId:"fixture-video",label:"Fixture video",modes:["text","image"],durations:[4],aspectRatios:["16:9"],resolutions:["720p"],maxReferenceImages:1,isDefault:true};
 await page.route("**/api/video/catalog",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({configured:true,models:[model],providers:[{id:model.providerId,label:"Fixture",defaultModel:model.modelId,models:[model]}],defaultProvider:model.providerId})}));
 await page.route("**/api/billing/quote",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({version:1,credits:20,reserveCredits:20,feature:"video.generate",quantity:1})}));
 let uploads=0;await page.route("**/api/video/references",route=>{uploads++;return route.fulfill({contentType:"application/json",body:JSON.stringify({reference:{id:`ref-${uploads}`,url:`/media/ref-${uploads}.png`,kind:"image"}})});});
 const attempts:any[]=[];await page.route("**/api/video/generate",route=>{attempts.push({id:route.request().headers()["x-naumi-billing-operation-id"],body:route.request().postDataJSON()});return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"fixture lost video response",code:"OPERATION_PENDING"})});});
 await page.goto("/video");await page.locator("textarea").first().fill("Retain this video request");await page.locator('input[type="file"]').first().setInputFiles({name:"ref.png",mimeType:"image/png",buffer:Buffer.from("local upload fixture")});
 const button=page.getByRole("button",{name:/生成 1 条视频/});await button.click();await expect(page.getByText("fixture lost video response",{exact:true})).toBeVisible();await button.click();await expect.poll(()=>attempts.length).toBe(2);expect(attempts[1]).toEqual(attempts[0]);expect(uploads).toBe(1);
});
test("canvas video retries preserve the domain and billing identities",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_user",value:fixture.userCookie,domain:"127.0.0.1",path:"/"}]);
 await page.route("**/media/billing-ui-fixture.png",route=>route.fulfill({contentType:"image/png",body:Buffer.from(fixture.imageBase64,"base64")}));
 const version=(await (await page.request.get("/api/admin/billing",{headers:{cookie:`nv_admin=${fixture.adminCookie}`}})).json()).snapshot.version;
 const model={providerId:"openai-videos",modelId:"fixture-video",label:"Fixture video",modes:["text","image"],durations:[4],aspectRatios:["16:9"],resolutions:["720p"],maxReferenceImages:1,isDefault:true};
 await page.route("**/api/video/catalog",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({configured:true,models:[model],providers:[{id:model.providerId,label:"Fixture",defaultModel:model.modelId,models:[model]}],defaultProvider:model.providerId})}));
 await page.route("**/api/billing/quote",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({version,credits:20,reserveCredits:20,feature:"video.generate",quantity:1})}));
 const attempts:any[]=[];await page.route("**/api/video/generate",route=>{attempts.push({id:route.request().headers()["x-naumi-billing-operation-id"],body:route.request().postDataJSON()});return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"fixture lost canvas response",code:"OPERATION_PENDING"})});});page.on("dialog",dialog=>dialog.accept());
 await page.addInitScript((id)=>localStorage.setItem("nv:canvas:last",`tree:${id}`),fixture.artworkId);const account=await (await page.request.get(`/api/account?email=${encodeURIComponent(fixture.email)}`)).json();expect(account.artworks.some((a:any)=>a.id===fixture.artworkId)).toBeTruthy();await page.goto(`/canvas?node=${fixture.artworkId}`);await page.locator(`.react-flow__node[data-id="${fixture.artworkId}"]`).click();
 for(let i=0;i<2;i++){await page.getByTitle("生成视频",{exact:true}).click();await page.getByPlaceholder("描述视频内容与运镜,如:商品缓慢旋转展示,柔和灯光").fill("Canvas retained prompt");await page.getByRole("button",{name:/以选中图片生成视频/}).click();await expect.poll(()=>attempts.length).toBe(i+1);await expect(page.getByTitle("生成视频",{exact:true})).toBeEnabled();}
 expect(attempts[1]).toEqual(attempts[0]);
});
