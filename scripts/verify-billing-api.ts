import assert from "node:assert/strict";
import { existsSync } from "node:fs";
async function main() {
    process.env.SETTINGS_SECRET = "fixture-billing-secret-0123456789abcdef0123456789";
    assert.ok(existsSync("src/lib/billing/server.ts"), "Billing runtime and admin API must exist");
    const api = await import("../src/app/api/admin/billing/route");
    const blocked = await api.GET(new Request("http://localhost/api/admin/billing"));
    assert.equal(blocked.status, 404);
    const { assertQuotedVersion } = await import("../src/lib/billing/request");
    const { quote } = await import("../src/lib/billing/quote");
    const { fixtureConfig, facts } = await import("./billing-unit-fixture");
    const q = quote({ version: 2, config: fixtureConfig() }, facts());
    assert.throws(() => assertQuotedVersion({ version: 1, credits: 6 }, q), (e: any) => e.code === "PRICE_CHANGED");
    assert.throws(() => assertQuotedVersion({ version: 2, credits: 5 }, q));
    assertQuotedVersion({ version: 2, credits: 6 }, q);
    if (process.env.NAUMI_VERIFY_ISOLATED_DB === "1" && new URL(process.env.DATABASE_URL || "http://invalid").hostname === "127.0.0.1") {
        const db = await import("../src/lib/db");
        const { signSession } = await import("../src/lib/admin-auth");
        const cookie = `nv_admin=${signSession(Date.now())}`;
        const req = (path: string, body?: unknown, origin = "http://localhost") => new Request(`http://localhost${path}`, { method: body === undefined ? "GET" : "POST", headers: { cookie, origin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        try {
            assert.equal((await api.POST(req("/api/admin/billing", {}, "https://evil.test"))).status, 403);
            assert.equal((await api.POST(req("/api/admin/billing", { invalid: true }))).status, 400);
            const initial = await (await api.GET(req("/api/admin/billing"))).json();
            assert.ok(initial.snapshot.version);
            const simulate = await import("../src/app/api/admin/billing/simulate/route");
            const before = await db.getPool().query("SELECT count(*) AS n FROM app_ledger");
            assert.equal((await simulate.POST(req("/api/admin/billing/simulate", { config: fixtureConfig(), facts: facts(), result: { state: "succeeded", items: [{ id: "a", state: "succeeded" }] } }))).status, 200);
            assert.deepEqual((await db.getPool().query("SELECT count(*) AS n FROM app_ledger")).rows, before.rows);
            const { randomUUID } = await import("node:crypto"), next = structuredClone(initial.snapshot.config);
            next.switches.metering = "off";
            const input = { id: randomUUID(), expectedVersion: initial.snapshot.version, config: next, reason: "fixture switch" };
            const published = await api.POST(req("/api/admin/billing", input));
            assert.equal(published.status, 200);
            assert.equal(await db.creditMeteringEnabled(), false);
            assert.equal((await api.POST(req("/api/admin/billing", { ...input, id: randomUUID() }))).status, 409);
            const publicQuote = await import("../src/app/api/billing/quote/route");
            assert.equal((await publicQuote.POST(req("/api/billing/quote", { feature: "image.generate", quantity: 1, metered: false }))).status, 400);
            const shown = await publicQuote.POST(req("/api/billing/quote", { feature: "image.generate", quantity: 1 }));
            assert.equal(shown.status, 200);
            const text = await shown.text();
            assert.equal(text.includes("costRates"), false);
            assert.equal(text.includes("actor"), false);
            await api.POST(req("/api/admin/billing", { id: randomUUID(), expectedVersion: (await published.json()).version, config: initial.snapshot.config, reason: "fixture restore" }));
        }
        finally {
            await db.getPool().end();
        }
    }
    console.log("PASS admin authorization and stale quote rejection");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
