import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { fixtureConfig } from "./billing-unit-fixture";
async function main() {
    if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1")
        throw new Error("Requires isolated local PostgreSQL");
    assert.ok(existsSync("src/lib/billing/catalog.ts"), "Versioned billing configuration must exist");
    const { createConfigRuntime } = await import("../src/lib/billing/catalog");
    const db = await import("../src/lib/db");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false, max: 5 });
    let initializes = 0;
    const runtime = createConfigRuntime({ pool, ensureSchema: db.ensureSchema, initialize: async () => { initializes++; return fixtureConfig(); } });
    try {
        const init = await Promise.all([runtime.current(), runtime.current(), runtime.current()]);
        assert.equal(new Set(init.map(x => x.version)).size, 1);
        assert.ok(initializes <= 1);
        const initial = init[0];
        const a = structuredClone(initial.config), b = structuredClone(initial.config);
        a.features["image.generate"].pricing = { mode: "fixed", credits: 8 };
        b.features["image.generate"].pricing = { mode: "fixed", credits: 9 };
        const id = randomUUID();
        const attempts = await Promise.allSettled([runtime.publish({ id, expectedVersion: initial.version, config: a, actor: "alice", reason: "price A" }), runtime.publish({ id: randomUUID(), expectedVersion: initial.version, config: b, actor: "bob", reason: "price B" })]);
        assert.equal(attempts.filter(x => x.status === "fulfilled").length, 1);
        const current = await runtime.current();
        // Idempotency is independently exercised on a fresh operation, regardless of the race winner.
        const replayInput = { id: randomUUID(), expectedVersion: current.version, config: fixtureConfig(), actor: "alice", reason: "restore defaults" };
        const first = await runtime.publish(replayInput), replay = await runtime.publish(replayInput);
        assert.equal(first.version, replay.version);
        await assert.rejects(() => runtime.publish({ ...replayInput, actor: "mallory" }));
        await assert.rejects(() => runtime.publish({ ...replayInput, config: a }));
        const restoreInput = { id: randomUUID(), expectedVersion: first.version, targetVersion: initial.version, actor: "alice", reason: "restore old version" };
        const restored = await runtime.restore(restoreInput);
        assert.ok(restored.version > first.version);
        assert.deepEqual((await runtime.byVersion(initial.version)).config, initial.config);
        await assert.rejects(() => runtime.restore({ ...restoreInput, targetVersion: first.version }));
        await runtime.publish({ id: randomUUID(), expectedVersion: restored.version, config: fixtureConfig(), actor: "fixture", reason: "reset fixture defaults" });
        await assert.rejects(() => createConfigRuntime({ pool, ensureSchema: async () => { throw new Error("database down"); }, initialize: async () => fixtureConfig() }).current(), (e: any) => e.code === "CONFIG_UNAVAILABLE");
        console.log("PASS concurrent initialization, atomic version publishing, conflict, replay, restore, fail-closed reads");
    }
    finally {
        await pool.end();
        await db.getPool().end();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
