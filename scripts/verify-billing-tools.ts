import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
async function main() {
    if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1")
        throw new Error("Requires isolated local PostgreSQL");
    Object.assign(process.env, { NAUMI_MULTI_USER: "1", SETTINGS_SECRET: "fixture-billing-0123456789abcdef0123456789abcdef", STORAGE_DRIVER: "local", MEDIA_DIR: path.resolve("output/billing-20261003/tool-media"), OPENAI_API_KEY: "fixture", OPENAI_IMAGE_MODEL: "gpt-image-1", OPENAI_IMAGE_MODELS: "gpt-image-1", REPLICATE_API_TOKEN: "fixture", NAUMI_IMAGE_QUALITY_SUPPORTED: "1" });
    const image = await sharp({ create: { width: 64, height: 64, channels: 4, background: "white" } }).png().toBuffer();
    let calls = 0, mode = "success";
    const mock = createServer(async (req, res) => {
        for await (const _ of req) { }
        if (req.url === "/image.png") {
            res.setHeader("content-type", "image/png");
            res.end(image);
            return;
        }
        calls++;
        res.setHeader("content-type", "application/json");
        if (mode !== "success") {
            res.writeHead(mode === "rejected" ? 400 : 500);
            res.end(JSON.stringify({ error: { message: "fixture failure" } }));
            return;
        }
        if (req.url?.includes("/models/"))
            res.end(JSON.stringify({ latest_version: { id: "fixture-version" } }));
        else if (req.url?.includes("predictions"))
            res.end(JSON.stringify({ status: "succeeded", output: `${base}/image.png` }));
        else
            res.end(JSON.stringify({ data: [{ b64_json: image.toString("base64") }], choices: [{ message: { content: JSON.stringify({ risk: "low", summary: "fixture", items: [] }) } }] }));
    });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(mock.address() as {
        port: number;
    }).port}`;
    process.env.OPENAI_BASE_URL = `${base}/v1`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url: any, options: any) => originalFetch(String(url).startsWith("https://api.replicate.com") ? String(url).replace("https://api.replicate.com", base) : url, options)) as typeof fetch;
    const db = await import("../src/lib/db"), { getBillingRuntime } = await import("../src/lib/billing/server"), { signUserSession } = await import("../src/lib/native-auth");
    const config = (await getBillingRuntime()).config, initial = await config.current(), email = `billing-tools-${randomUUID()}@example.test`;
    try {
        await db.getOrCreateUser(email);
        await db.addCreditBatch(email, 1000, { source: "admin", reason: "fixture" });
        for (const name of ["printfile", "ipcheck", "cutout", "upscale", "garment", "avatar", "dewrinkle", "dewatermark", "style", "tryon", "retouch", "recolor", "replicate", "inpaint", "extract", "garment3d", "packaging3d"]) {
            const current = await config.current(), next = structuredClone(initial.config);
            next.switches.metering = "on";
            next.features[`tool.${name}` as keyof typeof next.features].pricing = { mode: "fixed", credits: 3 };
            await config.publish({ id: randomUUID(), expectedVersion: current.version, config: next, actor: "fixture", reason: `fixture ${name}` });
            const route = await import(`../src/app/api/${name}/route`), operation = randomUUID();
            const request = () => { const form = new FormData(); for (const key of ["image", "mask", "ref", "top"])
                form.append(key, new Blob([image], { type: "image/png" }), `${key}.png`); form.append("quality", "medium"); form.append("style", "fixture watercolor"); form.append("color", "#ff0000"); form.append("prompt", "fixture"); form.append("dpi", "72"); form.append("wMm", "20"); form.append("hMm", "20"); return new Request(`http://fixture.test/api/${name}`, { method: "POST", headers: { cookie: `nv_user=${signUserSession(email, Date.now())}`, "x-naumi-billing-operation-id": operation }, body: form }); };
            const first = await route.POST(request());
            assert.equal(first.status, 200, `${name}: ${await first.clone().text()}`);
            const deadline = Date.now() + 20000;
            let row: any;
            while (Date.now() < deadline) {
                row = (await db.getPool().query("SELECT state,charged_credits FROM app_billing_operations WHERE id=$1", [`tool-${operation}`])).rows[0];
                if (row?.state === "settled")
                    break;
                await new Promise(resolve => setTimeout(resolve, 25));
            }
            assert.equal(row?.charged_credits, 3, `${name} must use its own configured tariff`);
            assert.equal(row.state, "settled");
            const suppliers = calls, again = await route.POST(request());
            assert.equal(again.status, 200, `${name} replay`);
            assert.equal(calls, suppliers, "Replay must not call upstream");
            assert.equal(Number((await db.getPool().query("SELECT count(*) AS n FROM app_ledger WHERE id=$1", [`led-tool-${operation}`])).rows[0].n), 1);
            console.log(`PASS ${name}: configured charge, one ledger, supplier replay guard`);
        }
        const artworkId=`billing-canvas-${randomUUID()}`;
        await db.addArtworks(email,[{id:artworkId,title:"Fixture",category:"main",prompt:"",status:"completed",image:`data:image/png;base64,${image.toString("base64")}`,gradient:"",resolution:"1K",width:64,height:64}],randomUUID());
        for(const name of ["expand","text-edit","annotate"]){
          const current=await config.current(),next=structuredClone(initial.config);next.switches.metering="on";next.features[`canvas.${name}` as keyof typeof next.features].pricing={mode:"fixed",credits:3};await config.publish({id:randomUUID(),expectedVersion:current.version,config:next,actor:"fixture",reason:`canvas ${name} fixture`});
          const route=await import(`../src/app/api/canvas/${name}/route`),id=randomUUID();
          const request=()=>{const form=new FormData();form.append("image",new Blob([image],{type:"image/png"}),"annotated.png");form.append("artworkId",artworkId);form.append("annotations",JSON.stringify([{type:"arrow",note:"fixture edit"}]));const body=name==="annotate"?form:JSON.stringify({artworkId,ratio:"4:3",oldText:"old",newText:"new",box:{x:1,y:1,width:32,height:32}});return new Request(`http://fixture.test/api/canvas/${name}`,{method:"POST",headers:{cookie:`nv_user=${signUserSession(email,Date.now())}`,"x-naumi-billing-operation-id":id,...(name==="annotate"?{}:{"content-type":"application/json"})},body});};
          const response=await route.POST(request());assert.equal(response.status,200,await response.clone().text());const before=calls;assert.equal((await route.POST(request())).status,200);assert.equal(calls,before);assert.equal(Number((await db.getPool().query("SELECT charged_credits FROM app_billing_operations WHERE id=$1",[`tool-${id}`])).rows[0].charged_credits),3);console.log(`PASS canvas.${name}: configured charge and replay`);
        }
        const { uploadImage } = await import("../src/lib/storage"), itemId = randomUUID(), imageUrl = await uploadImage(image, "image/png", `fixtures/billing-${itemId}.png`);
        const item = { id: itemId, batchId: randomUUID(), path: "fixture.png", image: imageUrl, width: 64, height: 64, prompt: "fixture", regions: [], versions: [], activeVersion: "", revision: 0, busy: false, createdAt: new Date().toISOString() };
        await db.insertCompetitorItem(email, item);
        const beforeConfig = await config.current(), nextConfig = structuredClone(initial.config);
        nextConfig.features["competitor.action"].pricing = { mode: "fixed", credits: 3 };
        nextConfig.switches.metering = "on";
        await config.publish({ id: randomUUID(), expectedVersion: beforeConfig.version, config: nextConfig, actor: "fixture", reason: "competitor fixture" });
        const competitor = await import("../src/app/api/competitors/[id]/action/route"), competitorOp = randomUUID();
        const competitorRequest = () => new Request(`http://fixture.test/api/competitors/${itemId}/action`, { method: "POST", headers: { cookie: `nv_user=${signUserSession(email, Date.now())}`, "content-type": "application/json", "x-naumi-billing-operation-id": competitorOp }, body: JSON.stringify({ action: "replicate", revision: 0, prompt: "fixture", regions: [], activeVersion: "" }) });
        const completed = await competitor.POST(competitorRequest(), { params: { id: itemId } });
        assert.equal(completed.status, 200, await completed.clone().text());
        assert.equal((await db.getCompetitorItem(email, itemId))?.versions.length, 1);
        const competitorCalls = calls;
        assert.equal((await competitor.POST(competitorRequest(), { params: { id: itemId } })).status, 200);
        assert.equal(calls, competitorCalls);
        assert.equal(Number((await db.getPool().query("SELECT charged_credits FROM app_billing_operations WHERE id=$1", [`tool-${competitorOp}`])).rows[0].charged_credits), 3);
        const ipcheck = await import("../src/app/api/ipcheck/route");
        for (const state of ["rejected", "unknown"]) {
            mode = state;
            const id = randomUUID(), form = new FormData();
            form.append("image", new Blob([image], { type: "image/png" }), "image.png");
            const result = await ipcheck.POST(new Request("http://fixture.test/api/ipcheck", { method: "POST", headers: { cookie: `nv_user=${signUserSession(email, Date.now())}`, "x-naumi-billing-operation-id": id }, body: form }));
            assert.equal(result.ok, false);
            const row = (await db.getPool().query("SELECT state,reserved_credits FROM app_billing_operations WHERE id=$1", [`tool-${id}`])).rows[0];
            assert.equal(row.state, state === "rejected" ? "settled" : "hold");
        }
        console.log("PASS competitor transaction and replay; confirmed rejection releases, unknown upstream outcome holds");
    }
    finally {
        const current = await config.current();
        await config.publish({ id: randomUUID(), expectedVersion: current.version, config: initial.config, actor: "fixture", reason: "fixture restore" });
        globalThis.fetch = originalFetch;
        await db.getPool().end();
        await new Promise<void>(resolve => mock.close(() => resolve()));
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
