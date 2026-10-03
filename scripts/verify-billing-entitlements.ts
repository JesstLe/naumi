import assert from "node:assert/strict";
import { randomUUID, generateKeyPairSync, createSign } from "node:crypto";
async function main() {
    process.env.SETTINGS_SECRET = "fixture-settings-0123456789abcdef0123456789abcdef0123456789";
    const { createBillingFixture } = await import("./billing-fixture");
    const f = await createBillingFixture(), db = await import("../src/lib/db");
    const { getBillingRuntime } = await import("../src/lib/billing/server");
    const { resolveItem } = await import("../src/lib/payments");
    const runtime = await getBillingRuntime(), original = await runtime.config.current();
    const signupEmail = `billing-signup-${randomUUID()}@example.test`;
    const codes: string[] = [];
    const publish = async (change: (config: typeof original.config) => void) => {
        const current = await runtime.config.current(), config = structuredClone(current.config);
        change(config);
        return runtime.config.publish({ id: randomUUID(), expectedVersion: current.version, config, actor: "fixture", reason: "Entitlement acceptance" });
    };
    try {
        const email = await f.user(0), product = await resolveItem("pack", "c-990");
        assert.ok(product);
        assert.equal((product as any).billingConfigVersion, original.version, "Resolved product freezes configuration version");
        const order = await db.createOrder({ email, ...product });
        const rollbackOrder = await db.createOrder({ email, ...product });
        await f.pool.query("INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES($1,$2,0,'rollback injection','purchase')", [`led-order-${rollbackOrder.id}`, email]);
        await assert.rejects(() => db.fulfillOrder(rollbackOrder.id, "fixture", "rollback", rollbackOrder.amount));
        assert.equal((await db.getOrder(rollbackOrder.id))?.status, "pending");
        assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM app_credit_batches WHERE order_id=$1", [rollbackOrder.id])).rows[0].n, 0);
        await f.pool.query("DELETE FROM app_ledger WHERE id=$1", [`led-order-${rollbackOrder.id}`]);
        await publish(c => { c.products["c-990"].amountFen = 10900; c.products["c-990"].bonusCredits = 50; c.products["c-990"].expiry = { unit: "days", value: 7 }; });
        assert.equal((await db.fulfillOrder(order.id, "fixture", "transaction", order.amount + 1) as any).ok, false);
        assert.equal((await db.getUser(email))?.creditsTotal, 0, "Amount mismatch must not grant");
        const fulfillment = await Promise.all([db.fulfillOrder(order.id, "fixture", "transaction", order.amount), db.fulfillOrder(order.id, "fixture", "transaction", order.amount)]);
        assert.equal(fulfillment.filter(x => x.alreadyPaid).length, 1);
        const grants = (await f.pool.query("SELECT amount,expires_at,created_at FROM app_credit_batches WHERE order_id=$1", [order.id])).rows;
        assert.equal(grants.length, 1);
        assert.equal(grants[0].amount, product.credits);
        assert.ok(new Date(grants[0].expires_at).getTime() - new Date(grants[0].created_at).getTime() > 700 * 86400000, "Order preserves original two-year expiry");
        assert.equal(await resolveItem("pro", "pro-1y"), null);
        // Exercise the real payment callback with generated fixture keys and no payment-network calls.
        const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
        const previousPublicKey = await db.getSetting("alipay_public_key");
        await db.setSetting("alipay_public_key", keys.publicKey.export({ type: "spki", format: "pem" }).toString());
        try {
            const notify = await import("../src/app/api/payments/alipay/notify/route"), callbackOrder = await db.createOrder({ email, ...product });
            const callback = async (amount: string, valid = true) => {
                const params: Record<string, string> = { out_trade_no: callbackOrder.id, trade_status: "TRADE_SUCCESS", trade_no: "fixture-callback", total_amount: amount, sign_type: "RSA2" };
                const content = Object.keys(params).filter(k => k !== "sign_type").sort().map(k => `${k}=${params[k]}`).join("&");
                params.sign = valid ? createSign("RSA-SHA256").update(content).sign(keys.privateKey, "base64") : "invalid";
                return (await notify.POST(new Request("http://fixture.test/api/payments/alipay/notify", { method: "POST", body: new URLSearchParams(params) }))).text();
            };
            assert.equal(await callback(((product.amount + 1) / 100).toFixed(2)), "failure");
            assert.equal(await callback((product.amount / 100).toFixed(2), false), "failure");
            assert.equal(await callback((product.amount / 100).toFixed(2)), "success");
            assert.equal(await callback((product.amount / 100).toFixed(2)), "success");
            assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM app_credit_batches WHERE order_id=$1", [callbackOrder.id])).rows[0].n, 1);
        }
        finally {
            if (previousPublicKey === null)
                await f.pool.query("DELETE FROM app_settings WHERE k='alipay_public_key'");
            else
                await db.setSetting("alipay_public_key", previousPublicKey);
        }
        await publish(c => { c.credits.signup = { amount: 43, expiry: { unit: "days", value: 9 } }; c.credits.redeem = { unit: "days", value: 11 }; });
        await Promise.all(Array.from({ length: 4 }, () => db.getOrCreateUser(signupEmail, "Concurrent signup")));
        const signup = (await f.pool.query("SELECT amount,expires_at,created_at FROM app_credit_batches WHERE email=$1", [signupEmail])).rows;
        assert.equal(signup.length, 1);
        assert.equal(signup[0].amount, 43);
        assert.ok(Math.abs(new Date(signup[0].expires_at).getTime() - new Date(signup[0].created_at).getTime() - 9 * 86400000) < 10000);
        const cards = await db.generateCardKeys({ credits: 17, count: 2, expiryDays: null, batch: "billing-fixture", note: "fixture", actor: "fixture" });
        codes.push(...cards.map(c => c.code));
        await publish(c => { c.credits.redeem = { unit: "days", value: 40 }; });
        await Promise.all([db.redeemCardKey(cards[0].code, email), db.redeemCardKey(cards[0].code, email)]);
        const redeemed = (await f.pool.query("SELECT amount,expires_at,created_at FROM app_credit_batches WHERE id=$1", [`bat-redeem-${cards[0].code}`])).rows;
        assert.equal(redeemed.length, 1);
        assert.equal(redeemed[0].amount, 17);
        assert.ok(Math.abs(new Date(redeemed[0].expires_at).getTime() - new Date(redeemed[0].created_at).getTime() - 11 * 86400000) < 10000, "Issued code keeps grant expiry, separate from claim deadline");
        const other = await f.user(0);
        await assert.rejects(() => db.redeemCardKey(cards[0].code, other));
        const failLedger = `led-redeem-${cards[1].code}`;
        await f.pool.query("INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES($1,$2,0,'rollback injection','grant')", [failLedger, email]);
        await assert.rejects(() => db.redeemCardKey(cards[1].code, email));
        assert.equal((await f.pool.query("SELECT status FROM app_card_keys WHERE code=$1", [cards[1].code])).rows[0].status, "unused");
        await f.pool.query("DELETE FROM app_ledger WHERE id=$1", [failLedger]);
        await db.redeemCardKey(cards[1].code, email);
        const adjustmentId = randomUUID();
        await db.adjustUserCredits(email, 3, "fixture adjustment", { id: adjustmentId, actor: "fixture" });
        await db.adjustUserCredits(email, 3, "fixture adjustment", { id: adjustmentId, actor: "fixture" });
        await assert.rejects(() => db.adjustUserCredits(email, 3, "fixture adjustment", { id: adjustmentId, actor: "different" }));
        await f.pool.query("UPDATE app_users SET credits_used=credits_total WHERE email=$1", [email]);
        await assert.rejects(() => db.adjustUserCredits(email, -1, "cannot spend hold", { actor: "fixture" }));
        console.log("PASS frozen products, amount validation, concurrent signup, atomic redeem rollback and administrative replay/holds");
    }
    finally {
        const current = await runtime.config.current();
        await runtime.config.publish({ id: randomUUID(), expectedVersion: current.version, config: original.config, actor: "fixture", reason: "Restore fixture configuration" });
        await f.pool.query("DELETE FROM app_card_keys WHERE code=ANY($1::text[])", [codes]);
        for (const table of ["app_billing_operations", "app_ledger", "app_credit_batches", "app_users"])
            await f.pool.query(`DELETE FROM ${table} WHERE email=$1`, [signupEmail]);
        await f.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
