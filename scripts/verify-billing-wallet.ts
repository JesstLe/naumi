import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { quote } from "../src/lib/billing/quote";
import { facts, fixtureConfig } from "./billing-unit-fixture";
async function main() {
    if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1")
        throw new Error("Requires isolated local PostgreSQL");
    assert.ok(existsSync("src/lib/billing/service.ts"), "Atomic billing service must exist");
    const { createBillingFixture } = await import("./billing-fixture");
    const { withBillingTransaction } = await import("../src/lib/billing/service");
    const f = await createBillingFixture();
    try {
        const email = await f.user(100);
        const id = randomUUID(), q = quote({ version: 1, config: fixtureConfig() }, facts({ quantity: 2 }));
        const op = { id, email, quote: q, reason: "fixture", ledgerId: `wallet-${id}`, fingerprint: id };
        const run = <T>(action: (tx: import("pg").PoolClient) => Promise<T>) => withBillingTransaction(f.pool, action);
        await run(tx => f.service.reserveTx(tx, op));
        await run(tx => f.service.reserveTx(tx, op));
        assert.equal(Number((await f.pool.query("SELECT credits_used FROM app_users WHERE email=$1", [email])).rows[0].credits_used), 12);
        await assert.rejects(() => run(tx => f.service.reserveTx(tx, { ...op, fingerprint: "different" })));
        const result = { state: "succeeded" as const, items: [{ id: "a", state: "succeeded" as const, executedQuality: "medium" }, { id: "b", state: "failed" as const }] };
        await run(tx => f.service.settleTx(tx, op, result));
        await run(tx => f.service.settleTx(tx, op, result));
        assert.equal(Number((await f.pool.query("SELECT count(*) AS n FROM app_ledger WHERE id=$1", [op.ledgerId])).rows[0].n), 1);
        assert.equal(Number((await f.pool.query("SELECT credits_total FROM app_users WHERE email=$1", [email])).rows[0].credits_total), 94);
        const unknown = { ...op, id: randomUUID(), ledgerId: `unknown-${id}` };
        await run(tx => f.service.reserveTx(tx, unknown));
        const held = await run(tx => f.service.settleTx(tx, unknown, { state: "unknown", items: [] }));
        assert.equal(held.charge, 0);
        assert.equal(Number((await f.pool.query("SELECT credits_used FROM app_users WHERE email=$1", [email])).rows[0].credits_used), 12);
        await run(tx => f.service.releaseTx(tx, unknown));
        await run(tx => f.service.releaseTx(tx, unknown));
        const expEmail = await f.user(20), expired = { ...op, id: randomUUID(), email: expEmail, ledgerId: `expire-${id}` };
        await run(tx => f.service.reserveTx(tx, expired));
        await f.pool.query("UPDATE app_credit_batches SET expires_at=now()-interval '1 second' WHERE email=$1", [expEmail]);
        await assert.rejects(() => run(tx => f.service.settleTx(tx, expired, result)));
        assert.equal(Number((await f.pool.query("SELECT count(*) AS n FROM app_ledger WHERE id=$1", [expired.ledgerId])).rows[0].n), 0);
        assert.equal(Number((await f.pool.query("SELECT credits_used FROM app_users WHERE email=$1", [expEmail])).rows[0].credits_used), 12);
        const poor = await f.user(12);
        const race = await Promise.allSettled([1, 2].map(i => run(tx => f.service.reserveTx(tx, { ...op, id: randomUUID(), email: poor, ledgerId: `race-${id}-${i}` }))));
        assert.equal(race.filter(x => x.status === "fulfilled").length, 1);
        const protectedEmail = await f.user(20), one = quote({ version: 1, config: fixtureConfig() }, facts());
        const protectedA = { ...op, id: randomUUID(), email: protectedEmail, quote: one, ledgerId: `protect-a-${id}` }, protectedB = { ...op, id: randomUUID(), email: protectedEmail, quote: one, ledgerId: `protect-b-${id}` };
        await run(tx => f.service.reserveTx(tx, protectedA));
        await run(tx => f.service.reserveTx(tx, protectedB));
        await f.pool.query("UPDATE app_credit_batches SET remaining=8 WHERE email=$1", [protectedEmail]);
        await assert.rejects(() => run(tx => f.service.settleTx(tx, protectedA, { state: "succeeded", items: [{ id: "ok", state: "succeeded", executedQuality: "medium" }] })));
        const rollback = { ...op, id: randomUUID(), ledgerId: `rollback-${id}` };
        await assert.rejects(() => run(async (tx) => { await f.service.reserveTx(tx, rollback); throw new Error("injected failure"); }));
        assert.equal(Number((await f.pool.query("SELECT count(*) AS n FROM app_billing_operations WHERE id=$1", [rollback.id])).rows[0].n), 0);
        const gift = { id: randomUUID(), email, amount: 25, source: "grant" as const, reason: "fixture gift", expiry: { unit: "days" as const, value: 30 }, ledgerId: `gift-${id}`, fingerprint: id, actor: "fixture-admin" };
        await run(tx => f.service.grantTx(tx, gift));
        await run(tx => f.service.grantTx(tx, gift));
        assert.equal(Number((await f.pool.query("SELECT count(*) AS n FROM app_ledger WHERE id=$1", [gift.ledgerId])).rows[0].n), 1);
        await assert.rejects(() => run(tx => f.service.grantTx(tx, { ...gift, actor: "another-admin" })));
        const adjustment = { ...gift, id: randomUUID(), email: poor, amount: -1, ledgerId: `adjust-${id}` };
        await assert.rejects(() => run(tx => f.service.adjustTx(tx, adjustment)));
        const debitRollback = { ...op, id: randomUUID(), ledgerId: `debit-rollback-${id}` };
        await run(tx => f.service.reserveTx(tx, debitRollback));
        const before = await f.pool.query("SELECT credits_total,credits_used FROM app_users WHERE email=$1", [email]);
        await assert.rejects(() => run(async (tx) => {
            const query = tx.query.bind(tx);
            tx.query = ((...args: unknown[]) => {
                if (typeof args[0] === "string" && args[0].startsWith("INSERT INTO app_ledger"))
                    throw new Error("injected ledger failure");
                return (query as (...args: unknown[]) => unknown)(...args);
            }) as typeof tx.query;
            try {
                await f.service.settleTx(tx, debitRollback, result);
            }
            finally {
                tx.query = query as typeof tx.query;
            }
        }));
        assert.deepEqual((await f.pool.query("SELECT credits_total,credits_used FROM app_users WHERE email=$1", [email])).rows, before.rows);
        assert.equal((await f.pool.query("SELECT state FROM app_billing_operations WHERE id=$1", [debitRollback.id])).rows[0].state, "reserved");
        console.log("PASS wallet reserve/settle/release idempotency, unknown holds, expiry rollback, concurrency and transaction rollback");
    }
    finally {
        await f.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
