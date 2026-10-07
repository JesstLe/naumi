import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { Pool } from "pg";
test("management center unifies navigation, deep links, settings and legacy entries", async ({ page }) => {
    const fixture = JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json", "utf8"));
    await page.context().addCookies([{ name: "nv_admin", value: fixture.adminCookie, domain: "127.0.0.1", path: "/" }, { name: "naumi_locale", value: "zh", domain: "127.0.0.1", path: "/" }]);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/center$/);
    await expect(page.getByRole("heading", { name: "运营概览", exact: true })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "管理中心导航", exact: true });
    await expect(nav.getByRole("link", { name: "数据概览", exact: true })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "用户与企业", exact: true }).click();
    await expect(page).toHaveURL(/section=users/);
    await expect(page.getByRole("heading", { name: "用户与企业", exact: true })).toBeVisible();
    await page.reload();
    await expect(nav.getByRole("link", { name: "用户与企业", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "新增用户", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "记录详情", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "新增用户", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "关闭详情", exact: true }).click();
    await nav.getByRole("link", { name: "价格、成本与规则", exact: true }).click();
    await expect(page.getByLabel("普通生图 · 标准单价（积分）")).toBeVisible();
    await expect(nav.getByRole("link", { name: "价格、成本与规则", exact: true })).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: "output/billing-20261003/management-center-desktop.png", fullPage: true });
    await nav.getByRole("link", { name: "接口与站点设置", exact: true }).click();
    await expect(page.getByRole("heading", { name: "系统设置", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/view=settings/);
    await nav.getByRole("link", { name: "内部定价测算", exact: true }).click();
    await expect(page.getByRole("heading", { name: "积分定价方案", exact: true })).toBeVisible();
    await page.goto("/admin/bi?section=orders");
    await expect(page.getByRole("heading", { name: "充值订单", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "展开管理导航", exact: true }).click();
    await expect(nav.getByRole("link", { name: "充值订单", exact: true })).toBeVisible();
    await page.screenshot({ path: "output/billing-20261003/management-center-mobile-menu.png", fullPage: true });
    await nav.getByRole("link", { name: "价格、成本与规则", exact: true }).click();
    await expect(page.getByRole("heading", { name: "计费管理", exact: true })).toBeVisible();
    await expect(nav).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "output/billing-20261003/management-center-mobile.png", fullPage: true });
    await page.goto("/admin/center?section=unknown");
    await expect(page.getByRole("heading", { name: "运营概览", exact: true })).toBeVisible();
});

test("management center pages reject anonymous and ordinary member sessions", async ({ page }) => {
    const fixture = JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json", "utf8"));
    for (const member of [false, true]) {
        if (member) await page.context().addCookies([{ name: "nv_user", value: fixture.userCookie, domain: "127.0.0.1", path: "/" }]);
        for (const path of ["/admin/center", "/admin/bi", "/admin/billing", "/admin/pricing"]) expect((await page.request.get(path)).status()).toBe(404);
        await page.goto("/admin?view=settings");
        await expect(page.getByRole("heading", { name: "系统设置", exact: true })).toHaveCount(0);
        expect((await page.request.get("/api/admin/bi?section=users")).status()).toBe(404);
        expect((await page.request.get("/api/admin/billing")).status()).toBe(404);
    }
});

test("billing administration simulates drafts and protects publishing", async ({ page }) => {
    if (!process.env.BILLING_UI_ADMIN_COOKIE)
        throw new Error("Isolated fixture admin cookie required");
    await page.context().addCookies([{ name: "nv_admin", value: process.env.BILLING_UI_ADMIN_COOKIE, domain: "127.0.0.1", path: "/" }]);
    await page.goto("/admin/billing");
    await page.getByLabel("普通生图 · 标准单价（积分）").fill("8");
    await page.getByText("详细报价试算（特殊条件与失败场景）", { exact: true }).click();
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
        await a.getByLabel("普通生图 · 标准单价（积分）").fill("8");
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
        await a.getByLabel("普通生图 · 标准单价（积分）").fill("9");
        const latest = await (await admin.request.get("/api/admin/billing")).json(), external = structuredClone(latest.snapshot.config);
        external.features["tool.cutout"].pricing = { mode: "fixed", credits: 3 };
        expect((await admin.request.post("/api/admin/billing", { data: { id: randomUUID(), expectedVersion: latest.snapshot.version, config: external, reason: "Concurrent UI fixture" } })).status()).toBe(200);
        await a.getByLabel("发布说明").fill("Conflict acceptance");
        await a.getByRole("button", { name: "查看改动", exact: true }).click();
        await a.getByRole("button", { name: "发布配置", exact: true }).click();
        await expect(a.getByRole("alert").filter({ hasText: "草稿已保留" })).toBeVisible();
        await expect(a.getByLabel("普通生图 · 标准单价（积分）")).toHaveValue("9");
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
 await page.getByLabel("计费单位",{exact:true}).selectOption("task");await page.getByText("详细报价试算（特殊条件与失败场景）",{exact:true}).click();await page.getByLabel("模拟数量").fill("13");await page.getByRole("button",{name:"模拟报价",exact:true}).click();await expect(page.getByTestId("simulation-charge")).toHaveText("6 积分");
 await page.getByRole("button",{name:"查看改动",exact:true}).click();await expect(page.getByText(/单位：每张图片 → 每次任务/)).toBeVisible();
});
test("video retries retain the batch identity and uploaded reference",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_user",value:fixture.userCookie,domain:"127.0.0.1",path:"/"}]);
 const model={providerId:"openai-videos",modelId:"fixture-video",label:"Fixture video",modes:["text","image"],durations:[4],aspectRatios:["16:9"],resolutions:["720p"],maxReferenceImages:1,isDefault:true};
 await page.route("**/api/video/catalog",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({configured:true,models:[model],providers:[{id:model.providerId,label:"Fixture",defaultModel:model.modelId,models:[model]}],defaultProvider:model.providerId})}));
 await page.route("**/api/billing/quote",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({version:1,credits:20,reserveCredits:20,feature:"video.generate",quantity:1})}));
 let uploads=0;await page.route("**/api/video/references",route=>{uploads++;return route.fulfill({contentType:"application/json",body:JSON.stringify({reference:{id:`ref-${uploads}`,url:`/media/ref-${uploads}.png`,kind:"image"}})});});
 const attempts:any[]=[];await page.route("**/api/video/generate",route=>{attempts.push({id:route.request().headers()["x-naumi-billing-operation-id"],body:route.request().postDataJSON()});return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"fixture lost video response",code:"OPERATION_PENDING"})});});
 await page.goto("/video");await page.locator("textarea").first().fill("Retain this video request");await page.locator('input[type="file"]').first().setInputFiles({name:"ref.png",mimeType:"image/png",buffer:Buffer.from("local upload fixture")});
 await expect(page.getByRole("button",{name:/Fixture video/})).toBeVisible();const button=page.getByRole("button",{name:/生成 1 条视频 · 20 积分/});await button.click();await expect(page.getByText("fixture lost video response",{exact:true})).toBeVisible();await button.click();await expect.poll(()=>attempts.length).toBe(2);expect(attempts[1]).toEqual(attempts[0]);expect(uploads).toBe(1);
});
test("canvas video retries preserve the domain and billing identities",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_user",value:fixture.userCookie,domain:"127.0.0.1",path:"/"}]);
 await page.route("**/media/billing-ui-fixture.png",route=>route.fulfill({contentType:"image/png",body:Buffer.from(fixture.imageBase64,"base64")}));
 const version=(await (await page.request.get("/api/admin/billing",{headers:{cookie:`nv_admin=${fixture.adminCookie}`}})).json()).snapshot.version;
 const model={providerId:"openai-videos",modelId:"fixture-video",label:"Fixture video",modes:["text","image"],durations:[4],aspectRatios:["16:9"],resolutions:["720p"],maxReferenceImages:1,isDefault:true};
 await page.route("**/api/video/catalog",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({configured:true,models:[model],providers:[{id:model.providerId,label:"Fixture",defaultModel:model.modelId,models:[model]}],defaultProvider:model.providerId})}));
 await page.route("**/api/billing/quote",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({version,credits:20,reserveCredits:20,feature:"video.generate",quantity:1})}));
 let confirmations=0;page.on("dialog",dialog=>{confirmations++;void dialog.dismiss();});
 const attempts:any[]=[];await page.route("**/api/video/generate",route=>{attempts.push({id:route.request().headers()["x-naumi-billing-operation-id"],body:route.request().postDataJSON()});return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"fixture lost canvas response",code:"OPERATION_PENDING"})});});
 await page.addInitScript((id)=>localStorage.setItem("nv:canvas:last",`tree:${id}`),fixture.artworkId);const account=await (await page.request.get(`/api/account?email=${encodeURIComponent(fixture.email)}`)).json();expect(account.artworks.some((a:any)=>a.id===fixture.artworkId)).toBeTruthy();await page.goto(`/canvas?node=${fixture.artworkId}`);await page.locator(`.react-flow__node[data-id="${fixture.artworkId}"]`).click();
 for(let i=0;i<2;i++){await page.getByTitle("生成视频",{exact:true}).click();await page.getByPlaceholder("描述视频内容与运镜,如:商品缓慢旋转展示,柔和灯光").fill("Canvas retained prompt");await page.getByRole("button",{name:/以选中图片生成视频/}).click();await expect.poll(()=>attempts.length).toBe(i+1);await expect(page.getByTitle("生成视频",{exact:true})).toBeEnabled();}
 expect(attempts[1]).toEqual(attempts[0]);expect(confirmations).toBe(0);
});

test("canvas images and toolbox submit on one click without fee dialogs",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_user",value:fixture.userCookie,domain:"127.0.0.1",path:"/"},{name:"naumi_locale",value:"zh",domain:"127.0.0.1",path:"/"}]);
 let confirmations=0;page.on("dialog",dialog=>{confirmations++;void dialog.dismiss();});
 const version=(await(await page.request.get("/api/admin/billing",{headers:{cookie:`nv_admin=${fixture.adminCookie}`}})).json()).snapshot.version;
 await page.route("**/api/billing/quote",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({version,credits:6,reserveCredits:6,feature:"image.generate",quantity:1})}));
 await page.route("**/media/billing-ui-fixture.png",route=>route.fulfill({contentType:"image/png",body:Buffer.from(fixture.imageBase64,"base64")}));
 await page.route("**/api/download?**",route=>route.fulfill({contentType:"image/png",body:Buffer.from(fixture.imageBase64,"base64")}));
 const attempts:{path:string,headers:Record<string,string>}[]=[];
 for(const path of ["generate-image","cutout"])await page.route(`**/api/${path}`,route=>{attempts.push({path,headers:route.request().headers()});return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:`fixture direct ${path}`,code:"OPERATION_PENDING"})});});
 await page.addInitScript(id=>localStorage.setItem("nv:canvas:last",`tree:${id}`),fixture.artworkId);
 await page.goto(`/canvas?node=${fixture.artworkId}`);await page.locator(`.react-flow__node[data-id="${fixture.artworkId}"]`).click();
 await expect(page.getByText("提交前确认报价",{exact:true})).toHaveCount(0);
 await page.getByTitle("生成新版本",{exact:true}).click();await expect.poll(()=>attempts.filter(a=>a.path==="generate-image").length).toBe(1);
 await page.goto("/cutout");await page.locator('input[type="file"]').first().setInputFiles({name:"reference.png",mimeType:"image/png",buffer:Buffer.from(fixture.imageBase64,"base64")});
 await page.getByRole("button",{name:/开始抠图.*消耗 6 积分/}).click();await expect.poll(()=>attempts.filter(a=>a.path==="cutout").length).toBe(1);
 expect(confirmations).toBe(0);expect(attempts).toHaveLength(2);
 for(const attempt of attempts){expect(attempt.headers["x-naumi-billing-version"]).toBe(String(version));expect(attempt.headers["x-naumi-billing-credits"]).toBe("6");expect(attempt.headers["x-naumi-billing-operation-id"]).toBeTruthy();}
});

test("business groups expose canvas prices, free controls and shared entries", async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_admin",value:fixture.adminCookie,domain:"127.0.0.1",path:"/"}]);await page.goto("/admin/billing");
 await expect(page.getByText("高级结算设置",{exact:true})).toBeVisible();await expect(page.getByLabel("失败收费比例（%）")).not.toBeVisible();
 await page.getByRole("button",{name:"画布",exact:true}).click();await page.getByRole("button",{name:"配置画布文字识别（OCR）",exact:true}).click();
 await expect(page.getByRole("heading",{name:"画布文字识别（OCR）",exact:true})).toBeVisible();await expect(page.getByTestId("business-example")).toContainText("扣 0 积分");
 await page.getByLabel("本功能参与积分计费").check();await page.getByLabel("画布文字识别（OCR） · 单价（积分）").fill("2");await expect(page.getByTestId("business-example")).toContainText("扣 2 积分");
 await page.getByLabel("计费单位",{exact:true}).selectOption("item");await expect(page.getByTestId("business-example")).toContainText("扣 6 积分");
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:"output/billing-20261003/billing-business-canvas.png",fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole("button",{name:"配置普通生图",exact:true}).click();await expect(page.getByRole("heading",{name:"普通生图",exact:true})).toBeVisible();await page.getByLabel("普通生图 · 标准单价（积分）").fill("7");
 await page.getByRole("button",{name:"图片生成",exact:true}).click();await expect(page.getByLabel("普通生图 · 标准单价（积分）")).toHaveValue("7");
 await page.getByRole("button",{name:"设置该功能的供应商成本",exact:true}).click();await expect(page.getByLabel("成本项",{exact:true})).toHaveValue("image.generate");
});
test("recharge prices use yuan and preserve exact stored fen",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_admin",value:fixture.adminCookie,domain:"127.0.0.1",path:"/"}]);const original=(await (await page.request.get("/api/admin/billing")).json()).snapshot;
 try {await page.goto("/admin/billing");await page.getByRole("button",{name:"充值套餐",exact:true}).click();const product=Object.values(original.config.products).find((p:any)=>p.kind==="pack") as any;
 await page.locator("summary").filter({hasText:product.title}).click();const amount=page.getByLabel(`${product.id} · 售价（元）`);await amount.fill("19.999");await expect(amount).toHaveAttribute("aria-invalid","true");await amount.fill("19.99");await expect(amount).toHaveValue("19.99");
 await page.getByLabel("发布说明").fill("Exact yuan price UI fixture");await page.getByRole("button",{name:"查看改动",exact:true}).click();await page.getByRole("button",{name:"发布配置",exact:true}).click();await expect(page.getByRole("status")).toContainText("已发布版本");const current=(await (await page.request.get("/api/admin/billing")).json()).snapshot;expect(current.config.products[product.id].amountFen).toBe(1999);
 }finally {const current=(await (await page.request.get("/api/admin/billing")).json()).snapshot;expect((await page.request.post("/api/admin/billing",{data:{id:randomUUID(),expectedVersion:current.version,config:original.config,reason:"Restore yuan UI fixture"}})).status()).toBe(200);}
});

test("canvas assistant retries keep streamed billing intent and original conversation",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_user",value:fixture.userCookie,domain:"127.0.0.1",path:"/"}]);await page.route("**/media/billing-ui-fixture.png",route=>route.fulfill({contentType:"image/png",body:Buffer.from(fixture.imageBase64,"base64")}));
 const attempts:any[]=[];await page.route("**/api/canvas/assistant",route=>{attempts.push({id:route.request().headers()["x-naumi-billing-operation-id"],body:route.request().postDataJSON()});return route.fulfill({contentType:"text/event-stream",body:attempts.length<3?'event: delta\ndata: {"text":"partial reply"}\n\nevent: error\ndata: {"error":"fixture stream interrupted"}\n\n':'event: delta\ndata: {"text":"complete reply"}\n\nevent: done\ndata: {"ok":true}\n\n'});});
 await page.addInitScript(id=>localStorage.setItem("nv:canvas:last",`tree:${id}`),fixture.artworkId);await page.goto(`/canvas?node=${fixture.artworkId}`);await page.locator(`.react-flow__node[data-id="${fixture.artworkId}"]`).click();await page.getByTitle("画布助手",{exact:true}).click();const panel=page.getByLabel("画布助手面板",{exact:true}),input=panel.getByPlaceholder("问点什么，或让助手写提示词…（Enter 发送，Shift+Enter 换行）");await input.fill("Retain assistant conversation");
 for(let i=0;i<3;i++){await panel.getByRole("button",{name:"发送",exact:true}).click();await expect.poll(()=>attempts.length).toBe(i+1);if(i<2){await expect(panel.getByText("fixture stream interrupted",{exact:true})).toBeVisible();await expect(input).toHaveValue("Retain assistant conversation");}else{await expect(panel.getByText("complete reply",{exact:true})).toBeVisible();await expect(input).toHaveValue("");}}
 expect(attempts[1]).toEqual(attempts[0]);expect(attempts[2]).toEqual(attempts[0]);expect(attempts[0].id).toBeTruthy();
});

test("configured access password gates email admins, deep links and logout", async ({ page }) => {
    if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw new Error("Requires isolated local PostgreSQL");
    const fixture = JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json", "utf8")), pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const previous = (await pool.query("SELECT v FROM app_settings WHERE k='admin_password_hash'")).rows[0]?.v, role = (await pool.query("SELECT role FROM app_users WHERE email=$1", [fixture.email])).rows[0].role;
    const password = "isolated-ui-access-password", salt = randomBytes(16), hash = `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 32).toString("hex")}`;
    try {
        await pool.query("INSERT INTO app_settings(k,v) VALUES('admin_password_hash',$1) ON CONFLICT(k) DO UPDATE SET v=excluded.v", [hash]);
        await pool.query("UPDATE app_users SET role='admin' WHERE email=$1", [fixture.email]);
        await page.context().addCookies([{ name: "nv_user", value: fixture.userCookie, domain: "127.0.0.1", path: "/" }, { name: "nv_admin", value: fixture.adminCookie, domain: "127.0.0.1", path: "/" }]);
        expect((await (await page.request.get("/api/admin/login")).json()).nativeAdmin).toBe(false);
        expect((await page.request.get("/api/admin/billing")).status()).toBe(404);
        await page.goto("/admin/billing");
        await expect(page).toHaveURL(/\/admin\?next=/);
        await expect(page.getByRole("heading", { name: "管理中心访问验证", exact: true })).toBeVisible();
        await expect(page.getByLabel("普通生图 · 标准单价（积分）")).toHaveCount(0);
        const input = page.getByPlaceholder("后台访问密码", { exact: true });
        await input.fill("incorrect-fixture-password"); await page.getByRole("button", { name: "登录", exact: true }).click();
        await expect(page.getByText("密码错误", { exact: true })).toBeVisible();
        await input.fill(password); await page.getByRole("button", { name: "登录", exact: true }).click();
        await expect(page).toHaveURL(/\/admin\/billing$/); await expect(page.getByLabel("普通生图 · 标准单价（积分）")).toBeVisible();
        const cookie = (await page.context().cookies()).find(c => c.name === "nv_admin")!; expect(cookie.httpOnly).toBe(true); expect(cookie.value).not.toBe(fixture.adminCookie);
        await page.getByRole("navigation", { name: "管理中心导航", exact: true }).getByRole("link", { name: "接口与站点设置", exact: true }).click();
        await expect(page.getByRole("heading", { name: "系统设置", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "退出管理中心", exact: true }).click();
        await expect(page.getByRole("heading", { name: "管理中心访问验证", exact: true })).toBeVisible();
        expect((await page.request.get("/api/admin/billing")).status()).toBe(404);
        await page.goto("/admin/center?section=users"); await expect(page.getByPlaceholder("后台访问密码", { exact: true })).toBeVisible();
    } finally {
        if (previous === undefined) await pool.query("DELETE FROM app_settings WHERE k='admin_password_hash'"); else await pool.query("UPDATE app_settings SET v=$1 WHERE k='admin_password_hash'", [previous]);
        await pool.query("UPDATE app_users SET role=$2 WHERE email=$1", [fixture.email, role]); await pool.end();
    }
});
