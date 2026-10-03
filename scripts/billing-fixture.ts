import { randomUUID } from "node:crypto";
import { createBillingService, withBillingTransaction } from "../src/lib/billing/service";
export async function createBillingFixture() {
    if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1")
        throw new Error("Requires isolated local PostgreSQL");
    const db = await import("../src/lib/db");
    await db.ensureSchema();
    const pool = db.getPool(), service = createBillingService(), users: string[] = [];
    return { pool, service, async user(amount: number) {
            const email = `billing-${randomUUID()}@example.test`;
            users.push(email);
            await db.getOrCreateUser(email, "Billing fixture");
            await withBillingTransaction(pool, async (tx) => { await tx.query("DELETE FROM app_ledger WHERE email=$1", [email]); await tx.query("DELETE FROM app_credit_batches WHERE email=$1", [email]); await tx.query("UPDATE app_users SET credits_total=0,credits_used=0 WHERE email=$1", [email]); if (amount) {
                const id = randomUUID();
                await service.grantTx(tx, { id, email, amount, source: "admin", reason: "fixture funding", expiry: { unit: "years", value: 2 }, ledgerId: `fund-${id}`, fingerprint: id, actor: "fixture" });
            } });
            return email;
        }, async close() {
            for (const table of ["app_gen_reservations", "app_billing_operations", "app_ledger", "app_credit_batches", "app_users"])
                await pool.query(`DELETE FROM ${table} WHERE email=ANY($1::text[])`, [users]);
            await pool.end();
        } };
}
