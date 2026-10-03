import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createBillingFixture } from "./billing-fixture";
async function main() {
    Object.assign(process.env, { SETTINGS_SECRET: "fixture-settings-0123456789abcdef0123456789abcdef0123456789", NAUMI_MULTI_USER: "1" });
    const f = await createBillingFixture();
    try {
        assert.ok((await import("node:fs")).existsSync("src/lib/billing/intent.ts"), "Async creation must preserve submission identity");
        const { withBillingIntent } = await import("../src/lib/billing/intent"), { signUserSession } = await import("../src/lib/native-auth"), email = await f.user(100), id = randomUUID();
        const request = (body = { prompt: "fixture" }) => new Request("http://localhost/api/generate-image", { method: "POST", headers: { cookie: `nv_user=${signUserSession(email, Date.now())}`, "content-type": "application/json", "x-naumi-billing-operation-id": id }, body: JSON.stringify(body) });
        let calls = 0;
        let release!: () => void;
        const hold = new Promise<void>(r => release = r);
        const action = async () => { calls++; await hold; return Response.json({ jobId: "existing-fixture-job" }); };
        const first = withBillingIntent(request(), action);
        await new Promise(r => setTimeout(r, 50));
        assert.equal((await withBillingIntent(request(), action)).status, 409);
        release();
        assert.equal((await first).status, 200);
        assert.deepEqual(await (await withBillingIntent(request(), action)).json(), { jobId: "existing-fixture-job" });
        assert.equal(calls, 1);
        assert.equal((await withBillingIntent(request({ prompt: "changed" }), action)).status, 409);
        const unknownId = randomUUID(), unknown = () => new Request(request(), { headers: { cookie: `nv_user=${signUserSession(email, Date.now())}`, "content-type": "application/json", "x-naumi-billing-operation-id": unknownId } });
        assert.equal((await withBillingIntent(unknown(), async () => { throw new Error("fixture process interrupted"); })).status, 503);
        assert.equal((await withBillingIntent(unknown(), async () => { calls++; return Response.json({}); })).status, 409);
        assert.equal(calls, 1);
        console.log("PASS uncertain and duplicate async submissions never execute creation twice");
    }
    finally {
        await f.close();
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
