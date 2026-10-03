import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import sharp from "sharp";
import path from "node:path";
async function main() {
    if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1")
        throw new Error("Requires isolated local PostgreSQL");
    Object.assign(process.env, { NAUMI_MULTI_USER: "1", SETTINGS_SECRET: "fixture-billing-0123456789abcdef0123456789abcdef", VIDEO_WORKER_SECRET: "fixture-worker-0123456789abcdef0123456789abcdef", STORAGE_DRIVER: "local", MEDIA_DIR: path.resolve("output/billing-20261003/media"), OPENAI_API_KEY: "fixture", OPENAI_IMAGE_MODEL: "gpt-image-1", OPENAI_IMAGE_MODELS: "gpt-image-1", NAUMI_IMAGE_QUALITY_SUPPORTED: "1" });
    let release!: () => void;
    const hold = new Promise<void>(resolve => release = resolve);
    let calls = 0;
    const image = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "white" } }).png().toBuffer();
    const mock = createServer(async (req, res) => { for await (const _ of req) { } const index = calls++; await hold; res.setHeader("content-type", "application/json"); if (index === 1) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: { message: "fixture rejection" } }));
    }
    else
        res.end(JSON.stringify({ data: [{ b64_json: image.toString("base64") }] })); });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(mock.address() as {
        port: number;
    }).port}/v1`;
    const db = await import("../src/lib/db"), { getBillingRuntime } = await import("../src/lib/billing/server"), { signUserSession } = await import("../src/lib/native-auth"), route = await import("../src/app/api/generate-image/route");
    const config = (await getBillingRuntime()).config, initial = await config.current(), email = `billing-image-${randomUUID()}@example.test`;
    try {
        await db.getOrCreateUser(email);
        await db.addCreditBatch(email, 100, { source: "admin", reason: "fixture" });
        const request = (version?: number, credits?: number) => new Request("http://fixture.test/api/generate-image", { method: "POST", headers: { cookie: `nv_user=${signUserSession(email, Date.now())}`, "content-type": "application/json", "x-real-ip": "127.0.0.222", ...(version === undefined ? {} : { "x-naumi-billing-version": String(version), "x-naumi-billing-credits": String(credits) }) }, body: JSON.stringify({ prompt: "fixture frozen tariff", model: "gpt-image-1", count: 2, quality: "high", resolution: "1K", ratio: "1:1" }) });
        const submit = await route.POST(request(initial.version, 20));
        assert.equal(submit.status, 200, await submit.clone().text());
        const { jobId } = await submit.json();
        const deadline = Date.now() + 20000;
        while (calls < 2 && Date.now() < deadline)
            await new Promise(resolve => setTimeout(resolve, 25));
        assert.equal(calls, 2);
        const next = structuredClone(initial.config);
        next.features["image.generate"].pricing = { mode: "fixed", credits: 17 };
        next.switches.metering = "off";
        next.costs["*:*:high:1K"]={currency:"CNY",amountMicros:"9000000",unit:"image",source:"manual-estimate"};
        const changed = await config.publish({ id: randomUUID(), expectedVersion: initial.version, config: next, actor: "fixture", reason: "change while upstream blocked" });
        assert.equal((await route.POST(request(initial.version, 20))).status, 409, "Stale displayed quote must reject before supplier");
        release();
        while (await db.getImageJobChargedCredits(jobId) === 0 && Date.now() < deadline)
            await new Promise(resolve => setTimeout(resolve, 25));
        assert.equal(await db.getImageJobChargedCredits(jobId), 10, "Old job keeps its original price even with metering off");
        assert.equal(calls, 2);
        let audits:any[]=[];while(Date.now()<deadline){audits=(await db.getPool().query("SELECT * FROM app_image_cost_audit WHERE job_id=$1",[jobId])).rows;if(audits.length)break;await new Promise(resolve=>setTimeout(resolve,25));}
        assert.equal(audits.length,1);assert.equal(Number(audits[0].billing_config_version),initial.version);assert.equal(audits[0].cost_currency,"credits");assert.equal(audits[0].cost_source,"legacy-credit-estimate");assert.equal(audits[0].cost_actual,false);assert.equal(audits[0].billed_credits,10);assert.equal(audits[0].cost_credits,10);
        const row = (await db.getPool().query("SELECT payload FROM app_image_jobs WHERE id=$1", [jobId])).rows[0];
        assert.equal(row.payload.billingQuote.configVersion, initial.version);
        const { quote } = await import("../src/lib/billing/quote"), { facts } = await import("./billing-unit-fixture"), repository = await import("../src/lib/image-job-repository");
        const reviewed = `billing-review-${randomUUID()}`, reviewQuote = quote(initial, facts({ feature: "image.aplus", quantity: 2, quality: "high" }));
        await repository.createImageJob(reviewed, email, "aplus", { status: "pending", stage: "reviewing", generationStarted: false, sources: [{ status: "approved" }] }, {}, 20, false, reviewQuote);
        await repository.reserveReviewedImageJob(reviewed);
        assert.equal(Number((await db.getPool().query("SELECT reserved_cost FROM app_image_jobs WHERE id=$1", [reviewed])).rows[0].reserved_cost), 20, "Review stage keeps original metering and reservation");
        await repository.settleImageJob(reviewed, { state: "succeeded", items: [{ id: "review-one", state: "succeeded", executedQuality: "medium" }] }, "fixture review", null);
        assert.equal(await db.getImageJobChargedCredits(reviewed), 10);
        await config.publish({ id: randomUUID(), expectedVersion: changed.version, config: initial.config, actor: "fixture", reason: "fixture restore" });
        console.log("PASS blocked real route freezes quote, partial charge and metering, stale version rejects without supplier call");
    }
    finally {
        release();
        const current = await config.current();
        if (JSON.stringify(current.config) !== JSON.stringify(initial.config))
            await config.publish({ id: randomUUID(), expectedVersion: current.version, config: initial.config, actor: "fixture", reason: "fixture cleanup" });
        await db.getPool().end();
        await new Promise<void>(resolve => mock.close(() => resolve()));
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
