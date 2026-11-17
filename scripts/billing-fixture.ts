import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createBillingService, withBillingTransaction } from "../src/lib/billing/service";
export async function createBillingFixture({ freshSchema = false } = {}) {
    if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1")
        throw new Error("Requires isolated local PostgreSQL");
    const schema = freshSchema ? 'billing_fixture_' + randomUUID().replaceAll('-','') : undefined;
    const previousOptions = process.env.PGOPTIONS;
    const owner = schema ? new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:2000}) : undefined;
    let schemaCreated=false;
    async function dropSchema(){
        if(!owner||!schema)return;
        if(previousOptions===undefined)delete process.env.PGOPTIONS;else process.env.PGOPTIONS=previousOptions;
        try{if(schemaCreated)await owner.query(`DROP SCHEMA ${schema} CASCADE`);}finally{await owner.end();}
    }
    const db = await import("../src/lib/db");
    try {
        if(owner&&schema){
            await owner.connect();await owner.query(`CREATE SCHEMA ${schema}`);schemaCreated=true;
            process.env.PGOPTIONS=[previousOptions,`-c search_path=${schema}`].filter(Boolean).join(' ');
        }
        await db.ensureSchema();
        if(schema) {
            const {rows}=await db.getPool().query("SELECT current_schema() AS schema");
            if(rows[0]?.schema!==schema)throw new Error("Billing fixture did not enter its dedicated schema");
        }
    }catch(error){
        if(schemaCreated)await db.getPool().end();
        await dropSchema();
        throw error;
    }
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
            if(schema){try{await pool.end();}finally{await dropSchema();}return;}
            for (const table of ["app_billing_intents","app_billing_reconciliations","app_orders","app_video_results","app_video_tasks","app_canvas_image_tasks","app_image_jobs","app_gen_reservations", "app_billing_operations", "app_ledger", "app_credit_batches", "app_users"])
                await pool.query(`DELETE FROM ${table} WHERE email=ANY($1::text[])`, [users]);
            await pool.end();
        } };
}
