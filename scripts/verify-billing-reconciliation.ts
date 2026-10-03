import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { facts, fixtureConfig } from "./billing-unit-fixture";
import { quote } from "../src/lib/billing/quote";
import { withBillingTransaction } from "../src/lib/billing/service";
async function main() {
    process.env.SETTINGS_SECRET = "fixture-settings-0123456789abcdef0123456789abcdef0123456789";
    const { createBillingFixture } = await import("./billing-fixture"), f = await createBillingFixture();
    try {
        const email = await f.user(40), id = randomUUID(), q = quote({ version: 1, config: fixtureConfig() }, facts({ feature: "video.generate" })), op = { id, email, quote: q, ledgerId: `led-${id}`, reason: "fixture", fingerprint: id };
        await withBillingTransaction(f.pool, tx => f.service.reserveTx(tx, op));
        await withBillingTransaction(f.pool, tx => f.service.settleTx(tx, op, { state: "unknown", items: [] }));
        const api = await import("../src/app/api/admin/billing/operations/route"), { signSession } = await import("../src/lib/admin-auth"), cookie = `nv_admin=${signSession(Date.now())}`;
        const command = { id: randomUUID(), operationId: id, reason: "Verified stored fixture result", proof: "Fixture retained media checked", result: { state: "succeeded", items: [{ id: "fixture-result", state: "succeeded", executedQuality: "medium" }] } };
        const req = (body: unknown, auth = true) => new Request("http://fixture.test/api/admin/billing/operations", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { cookie } : {}), origin: "http://fixture.test" }, body: JSON.stringify(body) });
        assert.equal((await api.POST(req(command, false))).status, 404);
        assert.equal((await api.POST(req({ ...command, result: { state: "unknown", items: [] } }))).status, 400);
        const completed = await Promise.all([api.POST(req(command)), api.POST(req(command))]);
        assert.ok(completed.every(r => r.status === 200));
        assert.equal((await f.pool.query("SELECT charged_credits,reserved_credits FROM app_billing_operations WHERE id=$1", [id])).rows[0].charged_credits, 20);
        assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM app_ledger WHERE id=$1", [op.ledgerId])).rows[0].n, 1);
        assert.equal((await api.POST(req({ ...command, proof: "different evidence" }))).status, 409);
        console.log("PASS authorized, audited, idempotent reconciliation uses frozen quotes");
    }
    finally {
        await f.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
