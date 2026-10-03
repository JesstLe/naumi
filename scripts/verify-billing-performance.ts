import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createBillingFixture } from "./billing-fixture";
import { withBillingTransaction } from "../src/lib/billing/service";
async function main() {
    Object.assign(process.env, { SETTINGS_SECRET: "fixture-settings-0123456789abcdef0123456789abcdef0123456789", NAUMI_MULTI_USER: "1" });
    const f = await createBillingFixture();
    const { Client } = await import("pg"), original = Client.prototype.query, phase = new AsyncLocalStorage<string>(), counts = { new: 0, settle: 0 };
    (Client.prototype as any).query = function (...args: any[]) { if (String(args[0]).includes("app_billing_config_versions") && String(args[0]).includes("SELECT")) {
        if (phase.getStore() === "settle")
            counts.settle++;
        else
            counts.new++;
    } return (original as any).apply(this, args); };
    try {
        const users = await Promise.all(Array.from({ length: 10 }, () => f.user(100000))), { signUserSession } = await import("../src/lib/native-auth"), { quoteForRequest, getBillingRuntime } = await import("../src/lib/billing/server"), { imageRequestBilling } = await import("../src/lib/image-quality-request"), snapshot = await (await getBillingRuntime()).config.current();
        let maxPoolWaiting = 0;
        const connect = f.pool.connect.bind(f.pool);
        (f.pool as any).connect = (...args: any[]) => { const pending = (connect as any)(...args); maxPoolWaiting = Math.max(maxPoolWaiting, f.pool.waitingCount); return pending; };
        const run = async (index: number) => {
            const email = users[index % users.length], r = new Request("http://localhost/api/suite", { headers: { cookie: `nv_user=${signUserSession(email, Date.now())}` } });
            const q = await phase.run("new", async () => { await imageRequestBilling(r); return quoteForRequest(r, { feature: "image.suite", quantity: 13 }); });
            const id = randomUUID(), op = { id, email, quote: q, ledgerId: `perf-${id}`, reason: "performance fixture", fingerprint: id };
            await phase.run("new", () => withBillingTransaction(f.pool, tx => f.service.reserveTx(tx, op)));
            await phase.run("settle", () => withBillingTransaction(f.pool, tx => f.service.settleTx(tx, op, { state: "succeeded", items: Array.from({ length: 13 }, (_, i) => ({ id: `item-${i}`, state: "succeeded", executedQuality: "medium" })) })));
        };
        await run(0);
        counts.new = 0;
        counts.settle = 0;
        await run(0);
        assert.ok(counts.new <= 1, `New task reads configuration ${counts.new} times (maximum one)`);
        assert.equal(counts.settle, 0);
        const output: any[] = [];
        for (const concurrency of [1, 10]) {
            for (let i = 0; i < 50; i++)
                await run(i);
            counts.new = 0;
            counts.settle = 0;
            maxPoolWaiting = 0;
            let errorCount = 0;
            const times: number[] = [], start = performance.now();
            for (let i = 0; i < 500; i += concurrency)
                await Promise.all(Array.from({ length: concurrency }, async (_, j) => { const at = performance.now(); try {
                    await run(i + j);
                }
                catch {
                    errorCount++;
                } times.push(performance.now() - at); }));
            times.sort((a, b) => a - b);
            output.push({ environment: { node: process.version, postgres: "local PostgreSQL16", supplier: "none", scope: "quote + reserve + settle", poolMax: 5, cache: "warm" }, samples: 500, concurrency, p50Ms: times[250], p95Ms: times[475], throughput: 500 / (performance.now() - start) * 1000, errorCount, configQueriesPerNewTask: counts.new / 500, configQueriesPerSettlement: counts.settle / 500, ruleCandidates: snapshot.config.features["image.suite"].rules.length, maxPoolWaiting });
            assert.equal(errorCount, 0);
            assert.ok(counts.new <= 500);
            assert.equal(counts.settle, 0);
        }
        writeFileSync("output/billing-20261003/performance.json", JSON.stringify(output, null, 2));
        console.log(JSON.stringify(output));
    }
    finally {
        Client.prototype.query = original;
        await f.close();
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
