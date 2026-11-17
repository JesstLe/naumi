import {chooseVideoModel} from "./video-fusion/browser-model.mjs";
import { test, expect } from "@playwright/test";
import { readFileSync,writeFileSync } from "node:fs";
import { randomUUID, randomBytes, scryptSync, createHash } from "node:crypto";
import { Pool } from "pg";
import { CAP_RICH } from "./video-fusion/profiles";
import { captureBillingResponseBody } from "./billing-response-body";
const navigationDiagnostics=new WeakMap<object,unknown[]>();
async function fixtureVideoCatalog(page:any){
    // Billing-client fault regression only; full supplier E2E uses the video harness.
    const model={providerId:"managed-video",modelId:"fixture-video",label:"Fixture video",modes:["text","image"],durations:[4],aspectRatios:["16:9"],resolutions:["720p"],maxReferenceImages:1,supportsFirstFrame:true,supportsLastFrame:false,supportsNegativePrompt:false,isDefault:true,
        definition:{...CAP_RICH,modes:["text","single_image"],durationResolutionMap:[{durations:[4],resolutions:["720p"]}],aspectRatios:["16:9"],limits:{images:1,videos:0,audios:0},supportsMultiShot:false,supportsElements:false,supportsCamera:false,sources:{}}};
    await page.route("**/api/video/catalog",(route:any)=>route.fulfill({contentType:"application/json",body:JSON.stringify({configured:true,models:[model],providers:[{id:model.providerId,label:"Fixture",defaultModel:model.modelId,models:[model]}],defaultProvider:model.providerId})}));
}
test.beforeEach(async({page,request})=>{
    const events:unknown[]=[];navigationDiagnostics.set(page,events);const add=(value:unknown)=>{if(events.length<100)events.push(value);};
    page.on("pageerror",error=>add({type:"pageerror",message:error.message}));page.on("requestfailed",request=>add({type:"requestfailed",path:new URL(request.url()).pathname,error:request.failure()?.errorText}));page.on("response",response=>{const pathname=new URL(response.url()).pathname;if(pathname.startsWith("/admin")||pathname==="/api/admin/login")add({type:"response",path:pathname,status:response.status()});});
    const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));
    await page.context().addCookies([{name:"naumi_locale",value:"zh",domain:"127.0.0.1",path:"/"}]);
    const headers={cookie:`nv_admin=${fixture.adminCookie}`},current=await request.get("/api/admin/billing",{headers});expect(current.status()).toBe(200);
    const data=await current.json();
    const reset=await request.post("/api/admin/billing",{headers,data:{id:randomUUID(),expectedVersion:data.snapshot.version,config:fixture.acceptanceConfig,reason:"Reset isolated UI acceptance baseline"}});expect(reset.status()).toBe(200);
    // Remove only this suite's prior fixture nodes, so image hit targets remain exposed.
    expect(fixture.email).toMatch(/^billing-ui-[a-f0-9-]+@example\.test$/);
    const memberHeaders={cookie:`nv_user=${fixture.userCookie}`},nodes=await request.get("/api/canvas/video-nodes",{headers:memberHeaders});expect(nodes.status()).toBe(200);
    for(const node of (await nodes.json()).nodes){const removed=await request.patch(`/api/canvas/video-nodes/${node.id}`,{headers:memberHeaders,data:{expectedRevision:node.revision,operationId:randomUUID(),deleted:true}});expect(removed.status()).toBe(200);}
});
test.afterEach(async({page},info)=>{if(info.status!==info.expectedStatus){const body=JSON.stringify(navigationDiagnostics.get(page)||[],null,2);writeFileSync(`output/billing-20261003/navigation-${info.title.replace(/[^a-zA-Z0-9-]/g,"-")}.json`,body);await info.attach("navigation-diagnostics",{body:Buffer.from(body),contentType:"application/json"});}});
test("management center unifies navigation, deep links, settings and legacy entries", async ({ page }) => {
    const fixture = JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json", "utf8"));
    await page.context().addCookies([{ name: "nv_admin", value: fixture.adminCookie, domain: "127.0.0.1", path: "/" }, { name: "naumi_locale", value: "zh", domain: "127.0.0.1", path: "/" }]);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/center$/);
    await expect(page.getByRole("heading", { name: "平台总览", exact: true })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "管理中心导航", exact: true });
    await expect(nav.getByRole("link", { name: "运营概览", exact: true })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "用户管理", exact: true }).click();
    await expect(page).toHaveURL(/section=users/);
    await expect(page.getByRole("heading", { name: "用户与企业", exact: true })).toBeVisible();
    await page.reload();
    await expect(nav.getByRole("link", { name: "用户管理", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "新增用户", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "记录详情", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "新增用户", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "关闭详情", exact: true }).click();
    await nav.getByRole("link", { name: "套餐与账务", exact: true }).click();
    await page.getByRole("navigation",{name:"模块功能",exact:true}).getByRole("link",{name:"价格表",exact:true}).click();
    await expect(page).toHaveURL(/\/admin\/billing\/price-table$/);
    await page.getByRole("navigation",{name:"模块功能",exact:true}).getByRole("link", { name: "钱包与充值", exact: true }).click();
    await expect(page.getByRole("button",{name:"充值套餐",exact:true})).toHaveAttribute("aria-pressed","true");
    await expect(nav.getByRole("link", { name: "套餐与账务", exact: true })).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: "output/billing-20261003/management-center-desktop.png", fullPage: true });
    await nav.getByRole("link", { name: "系统与审计", exact: true }).click();
    await expect(page.getByRole("heading", { name: "系统设置", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/view=settings/);
    await nav.getByRole("link", { name: "套餐与账务", exact: true }).click();
    await page.getByRole("navigation",{name:"模块功能",exact:true}).getByRole("link",{name:"定价测算",exact:true}).click();
    await expect(page.getByRole("heading", { name: "积分定价方案", exact: true })).toBeVisible();
    await page.goto("/admin/bi?section=orders");
    await expect(page.getByRole("heading", { name: "充值订单", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "展开管理导航", exact: true }).click();
    await expect(nav.getByRole("link", { name: "套餐与账务", exact: true })).toBeVisible();
    await page.screenshot({ path: "output/billing-20261003/management-center-mobile-menu.png", fullPage: true });
    await nav.getByRole("link", { name: "套餐与账务", exact: true }).click();
    await page.getByRole("navigation",{name:"模块功能",exact:true}).getByRole("link", { name: "钱包与充值", exact: true }).click();
    await expect(page.getByRole("heading", { name: "计费管理", exact: true })).toBeVisible();
    await expect(nav).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "output/billing-20261003/management-center-mobile.png", fullPage: true });
    await page.goto("/admin/center?section=unknown");
    await expect(page.getByRole("heading", { name: "平台总览", exact: true })).toBeVisible();
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
    await page.goto("/admin/billing?section=prices");
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
test("anonymous visitors cannot access configuration", async ({ page }) => { await page.goto("/admin/billing?section=wallet"); await expect(page.getByRole("heading", { name: "计费管理", exact: true })).toHaveCount(0); expect((await page.request.get("/api/admin/billing")).status()).toBe(404); });
test("publish preserves the user's frozen price, conflict draft and restore", async ({ browser }) => {
    test.setTimeout(90000);
    const fixture = JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json", "utf8"));
    const admin = await browser.newContext(), member = await browser.newContext();
    await admin.addCookies([{ name: "nv_admin", value: fixture.adminCookie, domain: "127.0.0.1", path: "/" },{name:"naumi_locale",value:"zh",domain:"127.0.0.1",path:"/"}]);
    await member.addCookies([{ name: "nv_user", value: fixture.userCookie, domain: "127.0.0.1", path: "/" }]);
    await member.addCookies([{name:"naumi_locale",value:"zh",domain:"127.0.0.1",path:"/"}]);
    const a = await admin.newPage(), u = await member.newPage(), pool=new Pool({connectionString:process.env.DATABASE_URL});
    let submissions=0,confirmations=0;
    u.on("request",request=>{if(new URL(request.url()).pathname==="/api/generate-image"&&request.method()==="POST")submissions++;});
    u.on("dialog",dialog=>{confirmations++;void dialog.dismiss();});
    try {
        await a.goto("/admin/billing?section=prices");
        const initial = await (await admin.request.get("/api/admin/billing")).json();
        await expect.poll(async()=> (await (await member.request.get("/api/auth/session")).json()).user?.email).toBe(fixture.email);
        expect((await member.request.get("/api/config")).status()).toBe(200);
        // Auto frame is deliberately display-only; select a real frame before
        // testing a persisted executable price, rather than inventing its ID.
        await u.goto("/generate?ratio=1%3A1");
        // Wait for one control before checking its price; duplicate controls still fail.
        await expect(u.getByTestId("billing-estimate")).toHaveCount(1);
        await expect(u.getByTestId("billing-estimate")).toContainText("6");
        await u.locator("textarea").first().fill("Retain this local test prompt");
        await expect(u.locator("textarea").first()).toHaveValue("Retain this local test prompt");
        await a.getByLabel("普通生图 · 标准单价（积分）").fill("8");
        await a.getByLabel("发布说明").fill("UI acceptance eight credits");
        await a.getByRole("button", { name: "查看改动", exact: true }).click();
        await a.getByRole("button", { name: "发布配置", exact: true }).click();
        await expect(a.getByRole("status")).toContainText("已发布版本");
        const published=await (await admin.request.get("/api/admin/billing")).json();expect(published.snapshot.config.features["image.generate"].pricing.quality.medium).toBe(8);
        // Retain and consume the original browser body before click/navigation
        // completes; status diagnostics and JSON parsing share the same text.
        const response = await captureBillingResponseBody(u,r => r.url().includes("/api/generate-image") && r.request().method() === "POST");
        const [{accepted,text}]=await Promise.all([response.result,u.getByTestId("billing-estimate").click()]).finally(response.dispose);
        expect(accepted.status(),text).toBe(200);
        const originalId=accepted.request().headers()["x-naumi-billing-operation-id"],quoteId=accepted.request().headers()["x-naumi-image-quote"],jobId=JSON.parse(text).jobId;
        expect(originalId).toBeTruthy();expect(quoteId).toBeTruthy();expect(jobId).toBeTruthy();
        const savedQuote=(await pool.query("SELECT owner,quote FROM app_image_billing_quotes WHERE id=$1",[quoteId])).rows[0];
        expect(savedQuote.owner).toBe(fixture.email);expect(savedQuote.quote.requestedCredits).toBe(6);
        await expect.poll(async()=> (await (await member.request.get(`/api/generate-image?job=${encodeURIComponent(jobId)}`)).json()).status).toBe("done");
        const delivered=await (await member.request.get(`/api/generate-image?job=${encodeURIComponent(jobId)}`)).json();
        expect(delivered.creditsUsed).toBe(6);expect(delivered.billingStatus).toBe("confirmed");expect(delivered.mock).toBe(false);expect(delivered.images).toHaveLength(1);
        const job=(await pool.query("SELECT payload,billing_settled FROM app_image_jobs WHERE id=$1 AND email=$2",[jobId,fixture.email])).rows[0];
        expect(job.billing_settled).toBe(true);expect(job.payload.billingQuote.requestedCredits).toBe(6);
        expect((await pool.query("SELECT count(*)::int n,(-sum(delta))::int credits FROM app_ledger WHERE email=$1 AND kind='consume'",[fixture.email])).rows[0]).toEqual({n:1,credits:6});
        expect((await pool.query("SELECT count(*)::int n FROM app_artworks WHERE email=$1 AND id=$2",[fixture.email,delivered.images[0].id])).rows[0].n).toBe(1);
        const mediaResponse=await member.request.get(delivered.images[0].url);expect(mediaResponse.status()).toBe(200);const media=await mediaResponse.body();
        expect(media.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));expect([media.readUInt32BE(16),media.readUInt32BE(20)]).toEqual([1024,1024]);
        // Receipt reads, not another paid POST, observe this completed purchase.
        expect(submissions).toBe(1);expect(confirmations).toBe(0);
        const supplier=await (await member.request.get(process.env.BILLING_UI_PROVIDER_ORIGIN+"/fixture/stats")).json();expect(supplier.imagePosts).toBe(1);
        writeFileSync("output/billing-20261003/ui-frozen-price.json",JSON.stringify({originalId,quoteId,jobId,originalCredits:6,currentCredits:8,chargedCredits:delivered.creditsUsed,billingSettled:job.billing_settled,consumeRows:1,browserPaidPosts:submissions,supplierImagePosts:supplier.imagePosts,nativeDialogs:confirmations,deliveredImage:{id:delivered.images[0].id,bytes:media.length,sha256:createHash("sha256").update(media).digest("hex"),width:1024,height:1024}},null,2));
        await expect(u.locator("textarea").first()).toHaveValue("Retain this local test prompt");
        await expect(u.getByTestId("billing-estimate")).toContainText("6");
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
        await pool.end();
    }
});
test("configuration failure stays visible and cannot publish", async ({ page }) => {
    const fixture = JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json", "utf8"));
    await page.context().addCookies([{ name: "nv_admin", value: fixture.adminCookie, domain: "127.0.0.1", path: "/" }]);
    await page.route("**/api/admin/billing", async (route) => { await new Promise(resolve => setTimeout(resolve, 500)); await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "配置读取失败，请重试" }) }); });
    await page.goto("/admin/billing?section=wallet");
    await expect(page.getByRole("status")).toContainText("正在读取计费配置");
    await expect(page.getByRole("status")).toContainText("配置读取失败");
    await expect(page.getByRole("button", { name: "发布配置", exact: true })).toHaveCount(0);
});
test("uncertain submissions retain their identifier across explicit retries",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_user",value:fixture.userCookie,domain:"127.0.0.1",path:"/"}]);
 const ids:string[]=[];await page.route("**/api/generate-image",async route=>{ids.push(route.request().headers()["x-naumi-billing-operation-id"]);await route.fulfill({status:ids.length===1?503:409,contentType:"application/json",body:JSON.stringify({code:ids.length===1?"CONFIG_UNAVAILABLE":"OPERATION_PENDING",error:"fixture submission pending"})});});
 await page.goto("/generate");await expect(page.getByTestId("billing-estimate")).toContainText("6");await page.locator("textarea").first().fill("Fixture retained intent");await expect(page.locator("textarea").first()).toHaveValue("Fixture retained intent");
 await page.getByTestId("billing-estimate").click();await expect(page.getByText("fixture submission pending",{exact:true})).toBeVisible();await page.getByTestId("billing-estimate").click();await expect.poll(()=>ids.length).toBe(2);expect(ids[0]).toBeTruthy();expect(ids[1]).toBe(ids[0]);await expect(page.locator("textarea").first()).toHaveValue("Fixture retained intent");
});
test("administrators can change the customer billing unit",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_admin",value:fixture.adminCookie,domain:"127.0.0.1",path:"/"}]);await page.goto("/admin/billing?section=prices");
 await page.getByLabel("计费单位",{exact:true}).selectOption("task");await page.getByText("详细报价试算（特殊条件与失败场景）",{exact:true}).click();await page.getByLabel("模拟数量").fill("13");await page.getByRole("button",{name:"模拟报价",exact:true}).click();await expect(page.getByTestId("simulation-charge")).toHaveText("6 积分");
 await page.getByRole("button",{name:"查看改动",exact:true}).click();await expect(page.getByText(/单位：每张图片 → 每次任务/)).toBeVisible();
});
test("video retries retain the batch identity and uploaded reference",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_user",value:fixture.userCookie,domain:"127.0.0.1",path:"/"}]);
 await fixtureVideoCatalog(page);
 await page.route("**/api/billing/quote",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({version:1,credits:20,reserveCredits:20,feature:"video.generate",quantity:1})}));
 let uploads=0,registrations=0;await page.route("**/api/video/references",route=>{uploads++;return route.fulfill({contentType:"application/json",body:JSON.stringify({reference:{id:`ref-${uploads}`,storageKey:`ref-${uploads}.png`,url:`/media/ref-${uploads}.png`,kind:"image"}})});});
 await page.route("**/api/video/assets",async route=>{if(route.request().method()!=="POST")return route.continue();registrations++;const request=route.request().postDataJSON();expect(request.storageKey).toBe("ref-1.png");expect(request.operationId).toMatch(/^[a-f0-9-]{36}$/);return route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({asset:{artworkId:"fixture-uploaded-image",title:"ref.png",kind:"image",url:"/media/ref-1.png",storageKey:request.storageKey,mimeType:"image/png",bytes:Buffer.from(fixture.imageBase64,"base64").length,sha256:"a".repeat(64),probe:null,projectKey:null}})});});
 await page.route("**/media/ref-1.png",route=>route.fulfill({contentType:"image/png",body:Buffer.from(fixture.imageBase64,"base64")}));
 const attempts:any[]=[];await page.route("**/api/video/generate",route=>{attempts.push({id:route.request().headers()["x-naumi-billing-operation-id"],body:route.request().postDataJSON()});return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"fixture lost video response",code:"OPERATION_PENDING"})});});
 await page.goto("/video");await chooseVideoModel(page,page,"Fixture video");await page.getByLabel("视频描述",{exact:true}).fill("Retain this video request");
 const mode=page.getByRole("combobox",{name:"视频生成模式",exact:true});await mode.click();await page.getByRole("option",{name:"图生视频",exact:true}).click();await expect(mode).toHaveText("图生视频");
 await page.getByLabel("上传视频参考素材",{exact:true}).setInputFiles({name:"ref.png",mimeType:"image/png",buffer:Buffer.from(fixture.imageBase64,"base64")});
 await expect(page.getByTestId("video-reference-row")).toHaveCount(1);
 const generate=page.getByTestId("video-workbench").getByRole("button",{name:/^生成视频 · /});
 await expect(generate).toBeEnabled();await expect(generate).toContainText("约");await generate.click();
 await expect(page.getByText("fixture lost video response",{exact:true})).toBeVisible();await expect(generate).toHaveText("生成视频 · 20 积分");
 await generate.click();await expect.poll(()=>attempts.length).toBe(2);expect(attempts[1]).toEqual(attempts[0]);expect(uploads).toBe(1);expect(registrations).toBe(1);expect(attempts[0].body.idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);expect(attempts[0].body.modelId).toBe("fixture-video");expect(attempts[0].body.billingVersion).toBe(1);expect(attempts[0].body.billingCredits).toBe(20);expect(attempts[0].body.orderedInputs[0].nodeId).toBe("fixture-uploaded-image");const prompt=page.getByLabel("视频描述",{exact:true});await expect(prompt).toHaveAttribute("role","textbox");await expect(prompt).toHaveAttribute("contenteditable","true");await expect.poll(()=>prompt.textContent()).toBe("Retain this video request");expect(attempts[0].body.prompt).toBe("Retain this video request");
});
test("canvas video retries preserve the domain and billing identities",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_user",value:fixture.userCookie,domain:"127.0.0.1",path:"/"}]);
 await page.route("**/media/billing-ui-fixture.png",route=>route.fulfill({contentType:"image/png",body:Buffer.from(fixture.imageBase64,"base64")}));
 const version=(await (await page.request.get("/api/admin/billing",{headers:{cookie:`nv_admin=${fixture.adminCookie}`}})).json()).snapshot.version;
 await fixtureVideoCatalog(page);
 await page.route("**/api/billing/quote",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({version,credits:20,reserveCredits:20,feature:"video.generate",quantity:1})}));
 let confirmations=0;page.on("dialog",dialog=>{confirmations++;void dialog.dismiss();});
 const attempts:any[]=[];await page.route("**/api/canvas/video-nodes/*/generate",route=>{attempts.push({id:route.request().headers()["x-naumi-billing-operation-id"],body:route.request().postDataJSON()});return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"fixture lost canvas response",code:"OPERATION_PENDING"})});});
 await page.addInitScript((id)=>localStorage.setItem("nv:canvas:last",`tree:${id}`),fixture.artworkId);const account=await (await page.request.get(`/api/account?email=${encodeURIComponent(fixture.email)}`)).json();expect(account.artworks.some((a:any)=>a.id===fixture.artworkId)).toBeTruthy();await page.goto(`/canvas?node=${fixture.artworkId}`);await page.locator(`.react-flow__node[data-id="${fixture.artworkId}"]`).click();
 await page.getByRole("button",{name:"更多处理",exact:true}).click();await page.getByRole("menuitem",{name:/^生成视频/}).click();const dialog=page.getByRole("region",{name:"视频节点设置",exact:true});await expect(dialog).toBeVisible();await chooseVideoModel(page,dialog,"Fixture video");await dialog.getByLabel("视频描述",{exact:true}).fill("Canvas retained prompt");
 for(let i=0;i<2;i++){const generate=dialog.getByRole("button",{name:/^生成视频/});await expect(generate).toBeEnabled();await generate.click();await expect.poll(()=>attempts.length).toBe(i+1);await expect(dialog.getByRole("alert")).toHaveText("fixture lost canvas response");}
 expect(attempts[1]).toEqual(attempts[0]);expect(attempts[0].id).toBeTruthy();expect(attempts[0].body.idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);expect(confirmations).toBe(0);const prompt=dialog.getByLabel("视频描述",{exact:true});await expect(prompt).toHaveAttribute("role","textbox");await expect(prompt).toHaveAttribute("contenteditable","true");await expect.poll(()=>prompt.textContent()).toBe("Canvas retained prompt");
});

test("canvas image plans and toolbox submit once without native fee dialogs",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_user",value:fixture.userCookie,domain:"127.0.0.1",path:"/"},{name:"naumi_locale",value:"zh",domain:"127.0.0.1",path:"/"}]);
 let confirmations=0;page.on("dialog",dialog=>{confirmations++;void dialog.dismiss();});
 const version=(await(await page.request.get("/api/admin/billing",{headers:{cookie:`nv_admin=${fixture.adminCookie}`}})).json()).snapshot.version;
 await page.route("**/api/billing/quote",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({version,credits:6,reserveCredits:6,feature:"image.generate",quantity:1})}));
 await page.route("**/media/billing-ui-fixture.png",route=>route.fulfill({contentType:"image/png",body:Buffer.from(fixture.imageBase64,"base64")}));
 await page.route("**/api/download?**",route=>route.fulfill({contentType:"image/png",body:Buffer.from(fixture.imageBase64,"base64")}));
 const attempts:{path:string,headers:Record<string,string>,body:any}[]=[],plans:any[]=[];
 await page.route("**/api/imagegen/plan",route=>{const request=route.request().postDataJSON();plans.push(request);return route.fulfill({contentType:"application/json",body:JSON.stringify({request,intent:{background:null,operation:"edit",conflicts:[],requirements:[]},fingerprint:"billing-client-fixture",modelVersion:1,billingVersion:version,steps:[{key:"edit",operation:"edit",eligibleUpstreamIds:[],parameters:{},credits:6}],totalCredits:6,confirmationRequired:false,warnings:[]})});});
 await page.route("**/api/imagegen?**",route=>route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({error:"fixture submission pending"})}));
 for(const path of ["imagegen","cutout"])await page.route(`**/api/${path}`,route=>{attempts.push({path,headers:route.request().headers(),body:path==="imagegen"?route.request().postDataJSON():null});return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:`fixture direct ${path}`,code:"OPERATION_PENDING"})});});
 await page.route("**/api/media/image-cache",route=>{const sources=route.request().postDataJSON().sources,bytes=Buffer.from(fixture.imageBase64,"base64");return route.fulfill({contentType:"application/json",body:JSON.stringify({account:fixture.email.toLowerCase(),results:Object.fromEntries(sources.map((source:string)=>[source,{account:fixture.email.toLowerCase(),source,version:createHash("sha256").update(bytes).digest("hex"),fetchUrl:"/media/billing-ui-fixture.png",bytes:bytes.length,contentType:"image/png"}]))})});});
 await page.addInitScript(id=>localStorage.setItem("nv:canvas:last",`tree:${id}`),fixture.artworkId);
 await page.goto(`/canvas?node=${fixture.artworkId}`);await page.locator(`.react-flow__node[data-id="${fixture.artworkId}"]`).click();
 await expect(page.getByText("提交前确认报价",{exact:true})).toHaveCount(0);
 await expect(page.getByRole("button",{name:"图像创作",exact:true})).toHaveCount(0);await expect(page.getByRole("dialog",{name:"图像创作",exact:true})).toHaveCount(0);
 let inputUploads=0;await page.route("**/api/imagegen/inputs",route=>{inputUploads++;return route.fulfill({contentType:"application/json",body:JSON.stringify({artworkId:`asset-dock-${inputUploads}`,url:"/media/billing-ui-fixture.png",width:512,height:512})});});
 await page.getByLabel("节点提示词",{exact:true}).fill("Canvas retained image edit");await page.getByRole("button",{name:"生成",exact:true}).click();await expect.poll(()=>attempts.filter(a=>a.path==="imagegen").length).toBe(1);
 await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==="/api/billing/quote"&&response.request().method()==="POST"&&response.request().postDataJSON().feature==="tool.cutout"),page.goto("/cutout")]);await page.locator('input[type="file"]').first().setInputFiles({name:"reference.png",mimeType:"image/png",buffer:Buffer.from(fixture.imageBase64,"base64")});await expect(page.getByRole("button",{name:"移除图片",exact:true})).toBeVisible();
 await page.getByRole("button",{name:/开始抠图.*消耗 6 积分/}).click();await expect.poll(()=>attempts.filter(a=>a.path==="cutout").length).toBe(1);
 expect(confirmations).toBe(0);expect(attempts).toHaveLength(2);
 const image=attempts.find(attempt=>attempt.path==="imagegen")!;expect(plans).toHaveLength(1);expect(image.body.operationId).toBe(plans[0].operationId);expect(image.body.confirmation).toEqual({modelVersion:1,billingVersion:version,credits:6,confirmed:true});expect(inputUploads).toBe(1);expect(image.body.inputs[0].artworkId).toBe("asset-dock-1");expect(image.body.prompt).toBe("Canvas retained image edit");
 const cutout=attempts.find(attempt=>attempt.path==="cutout")!;expect(cutout.headers["x-naumi-billing-version"]).toBe(String(version));expect(cutout.headers["x-naumi-billing-credits"]).toBe("6");expect(cutout.headers["x-naumi-billing-operation-id"]).toBeTruthy();
});

test("business groups expose canvas prices, free controls and shared entries", async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_admin",value:fixture.adminCookie,domain:"127.0.0.1",path:"/"}]);await page.goto("/admin/billing?section=prices");
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
 try {await page.goto("/admin/billing?section=wallet");await page.getByRole("button",{name:"充值套餐",exact:true}).click();const product=Object.values(original.config.products).find((p:any)=>p.kind==="pack") as any;
 await page.locator("summary").filter({hasText:product.title}).click();const amount=page.getByLabel(`${product.id} · 售价（元）`);await amount.fill("19.999");await expect(amount).toHaveAttribute("aria-invalid","true");await amount.fill("19.99");await expect(amount).toHaveValue("19.99");
 await page.getByLabel("发布说明").fill("Exact yuan price UI fixture");await page.getByRole("button",{name:"查看改动",exact:true}).click();await page.getByRole("button",{name:"发布配置",exact:true}).click();await expect(page.getByRole("status")).toContainText("已发布版本");const current=(await (await page.request.get("/api/admin/billing")).json()).snapshot;expect(current.config.products[product.id].amountFen).toBe(1999);
 }finally {const current=(await (await page.request.get("/api/admin/billing")).json()).snapshot;expect((await page.request.post("/api/admin/billing",{data:{id:randomUUID(),expectedVersion:current.version,config:original.config,reason:"Restore yuan UI fixture"}})).status()).toBe(200);}
});

test("canvas assistant retries keep streamed billing intent and original conversation",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));await page.context().addCookies([{name:"nv_user",value:fixture.userCookie,domain:"127.0.0.1",path:"/"}]);await page.route("**/media/billing-ui-fixture.png",route=>route.fulfill({contentType:"image/png",body:Buffer.from(fixture.imageBase64,"base64")}));
 const attempts:any[]=[];await page.route("**/api/canvas/assistant",route=>{if(route.request().method()!=="POST")return route.continue();attempts.push({id:route.request().headers()["x-naumi-billing-operation-id"],body:route.request().postDataJSON()});return route.fulfill({contentType:"text/event-stream",body:attempts.length<3?'event: error\ndata: {"error":"fixture stream interrupted"}\n\n':'event: delta\ndata: {"text":"complete reply"}\n\nevent: done\ndata: {"ok":true}\n\n'});});
 await page.addInitScript(id=>localStorage.setItem("nv:canvas:last",`tree:${id}`),fixture.artworkId);await page.goto(`/canvas?node=${fixture.artworkId}`);await page.locator(`.react-flow__node[data-id="${fixture.artworkId}"]`).click();await page.getByRole("button",{name:"图片助手",exact:true}).click();const panel=page.getByTestId("canvas-assistant-panel"),input=panel.getByTestId("canvas-assistant-input");await input.fill("Retain assistant conversation");
 for(let i=0;i<3;i++){await panel.getByRole("button",{name:"发送消息",exact:true}).click();await expect.poll(()=>attempts.length).toBe(i+1);if(i<2){await expect(panel.getByRole("alert")).toContainText("fixture stream interrupted");await expect(input).toHaveValue("Retain assistant conversation");}else{await expect(panel.getByText("complete reply",{exact:true})).toBeVisible();await expect(input).toHaveValue("");}}
 expect(attempts[1]).toEqual(attempts[0]);expect(attempts[2]).toEqual(attempts[0]);expect(attempts[0].id).toBeTruthy();
});

test("canvas assistant partial output recovers from original history without another paid POST",async({page})=>{
 const fixture=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8")),sessionId=randomUUID();
 await page.context().addCookies([{name:"nv_user",value:fixture.userCookie,domain:"127.0.0.1",path:"/"}]);
 let posts=0,historyReads=0;
 await page.route("**/api/canvas/assistant",route=>{if(route.request().method()!=="POST")return route.continue();posts++;return route.fulfill({contentType:"text/event-stream",body:`event: open\ndata: ${JSON.stringify({sessionId})}\n\nevent: delta\ndata: {"text":"partial retained answer"}\n\nevent: error\ndata: {"error":"fixture partial stream interrupted"}\n\n`});});
 await page.route("**/api/canvas/assistant?**",route=>{
  const id=new URL(route.request().url()).searchParams.get("id");
  if(id){historyReads++;expect(id).toBe(sessionId);return route.fulfill({contentType:"application/json",body:JSON.stringify({session:{id:sessionId,anchorId:fixture.artworkId,referenceIds:[],running:false,status:"completed",steps:[],turns:[{id:"saved-user",role:"user",content:"Keep partial original request"},{id:"saved-answer",role:"assistant",content:"Original saved complete answer"}]}})});}
  return route.fulfill({contentType:"application/json",body:JSON.stringify({sessions:[{id:sessionId,title:"Original partial conversation",anchorId:fixture.artworkId,updatedAt:new Date().toISOString()}]})});
 });
 await page.addInitScript(id=>localStorage.setItem("nv:canvas:last",`tree:${id}`),fixture.artworkId);await page.goto(`/canvas?node=${fixture.artworkId}`);await page.locator(`.react-flow__node[data-id="${fixture.artworkId}"]`).click();await page.getByRole("button",{name:"图片助手",exact:true}).click();
 const panel=page.getByTestId("canvas-assistant-panel"),input=panel.getByTestId("canvas-assistant-input");
 await input.fill("Keep partial original request");await panel.getByRole("button",{name:"发送消息",exact:true}).click();
 await expect(panel.getByRole("alert")).toContainText("fixture partial stream interrupted");await expect(input).toHaveValue("");
 await expect(panel.getByText("partial retained answer",{exact:true})).toBeVisible();await expect(panel.getByRole("button",{name:"重试",exact:true})).toBeDisabled();
 await panel.getByRole("button",{name:"项目对话记录",exact:true}).click();await panel.getByTestId("canvas-assistant-history-item").filter({hasText:"Original partial conversation"}).click();
 await expect(panel.getByText("Original saved complete answer",{exact:true})).toBeVisible();expect(historyReads).toBe(1);expect(posts).toBe(1);
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
        await page.goto("/admin/billing?section=wallet");
        await expect(page).toHaveURL(/\/admin\?next=/);
        await expect(page.getByRole("heading", { name: "管理中心访问验证", exact: true })).toBeVisible();
        await expect(page.getByLabel("普通生图 · 标准单价（积分）")).toHaveCount(0);
        const input = page.getByPlaceholder("后台访问密码", { exact: true });
        await input.fill("incorrect-fixture-password"); await page.getByRole("button", { name: "登录", exact: true }).click();
        await expect(page.getByText("密码错误", { exact: true })).toBeVisible();
        await input.fill(password); await page.getByRole("button", { name: "登录", exact: true }).click();
        await expect(page).toHaveURL(/\/admin\/billing$/); await page.getByRole("link", { name: "钱包与充值", exact: true }).click();
        await expect(page.getByRole("button",{name:"充值套餐",exact:true})).toHaveAttribute("aria-pressed","true");
        await page.getByRole("button",{name:"业务收费",exact:true}).click();
        await expect(page.getByLabel("普通生图 · 标准单价（积分）")).toBeVisible();
        const cookie = (await page.context().cookies()).find(c => c.name === "nv_admin")!; expect(cookie.httpOnly).toBe(true); expect(cookie.value).not.toBe(fixture.adminCookie);
        await page.getByRole("navigation", { name: "管理中心导航", exact: true }).getByRole("link", { name: "系统与审计", exact: true }).click();
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
