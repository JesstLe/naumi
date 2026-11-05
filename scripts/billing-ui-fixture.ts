import { writeFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
async function main() {
    if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1")
        throw new Error("Requires isolated local PostgreSQL");
    const db = await import("../src/lib/db"), { getBillingRuntime } = await import("../src/lib/billing/server"), runtime = await getBillingRuntime();
    const path = "output/billing-20261003/ui-fixture.json";
    if (process.argv[2] === "cleanup") {
        const data = JSON.parse(readFileSync(path, "utf8")), current = await runtime.config.current();
        await runtime.config.publish({ id: randomUUID(), expectedVersion: current.version, config: data.original.config, actor: "fixture", reason: "Restore UI acceptance configuration" });
        // Real executable quotes belong to the synthetic user. Remove its
        // children before the account, without weakening the production FK.
        const quotes=await db.getPool().query("SELECT to_regclass('app_image_billing_quotes') AS name");
        if(quotes.rows[0]?.name)await db.getPool().query("DELETE FROM app_image_billing_quotes WHERE owner=$1",[data.email]);
        for (const table of ["app_billing_reconciliations", "app_billing_operations", "app_billing_intents", "app_artworks", "app_ledger", "app_credit_batches", "app_users"])
            await db.getPool().query(`DELETE FROM ${table} WHERE email=$1`, [data.email]);
    }
    else {
        const original = await runtime.config.current(), config = structuredClone(original.config);
        config.switches.metering = "on";
        config.features["image.generate"].pricing = { mode: "quality-resolution", quality: { low: 4, medium: 6, high: 10, xhigh: 14, max: 18, auto: 6 }, resolutionExtra: { "1K": 0, "2K": 2, "4K": 6, "5K": 10 } };
        await runtime.config.publish({ id: randomUUID(), expectedVersion: original.version, config, actor: "fixture", reason: "UI acceptance setup" });
        const email = `billing-ui-${randomUUID()}@example.test`;
        await db.getOrCreateUser(email, "UI fixture");
        await db.addCreditBatch(email, 100, { source: "admin", reason: "UI fixture" });
        const sharp=(await import("sharp")).default,bytes=await sharp({create:{width:64,height:64,channels:3,background:"white"}}).png().toBuffer(),artworkId=`billing-ui-${randomUUID()}`;
        await db.addArtworks(email,[{id:artworkId,title:"Canvas retry fixture",category:"main",prompt:"Canvas retained prompt",status:"completed",image:"/media/billing-ui-fixture.png",gradient:"",origin:"canvas",width:64,height:64}]);
        const { signSession } = await import("../src/lib/admin-auth"), { signUserSession } = await import("../src/lib/native-auth");
        writeFileSync(path, JSON.stringify({ original, acceptanceConfig:config, email, artworkId, imageBase64:bytes.toString("base64"), adminCookie: signSession(Date.now()), userCookie: signUserSession(email, Date.now()) }));
    }
    await db.getPool().end();
}
main().catch(e => { console.error(e); process.exitCode = 1; });
