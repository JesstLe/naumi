import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
async function main() {
    Object.assign(process.env, { SETTINGS_SECRET: "fixture-settings-0123456789abcdef0123456789abcdef0123456789", NAUMI_MULTI_USER: "1", OPENAI_API_KEY: "local-fixture-key" });
    const { createBillingFixture } = await import("./billing-fixture"), f = await createBillingFixture(), { getBillingRuntime } = await import("../src/lib/billing/server"), runtime = await getBillingRuntime(), original = await runtime.config.current();
    try {
        const email = await f.user(100), { signUserSession } = await import("../src/lib/native-auth"), { agentBillingPrecheck } = await import("../src/lib/billing/agent");
        const config = structuredClone(original.config);
        config.switches.metering = "on";
        config.features["image.generate"].pricing = { mode: "fixed", credits: 8 };
        config.thresholds.agentConfirmCredits = 7;
        const first = await runtime.config.publish({ id: randomUUID(), expectedVersion: original.version, config, actor: "fixture", reason: "Agent acceptance" });
        const session: import("../src/lib/billing/agent").AgentBillingSession = { email, id: randomUUID(), turnId:"turn1", cred: { cookie: `nv_user=${signUserSession(email, Date.now())}`, authorization: "", imageQuality: "medium" } };
        const check = (args: Record<string, unknown>, call = randomUUID()) => agentBillingPrecheck(session, "generate_image", args, call);
        const args = { prompt: "fixture", count: 1 };
        const waiting=await check(args); assert.equal(waiting?.block, true); assert.equal(waiting?.attention, "waiting");
        assert.equal(session.preparedBilling, undefined);
        session.turnId="turn2";
        assert.equal((await check({ ...args, confirm: true }))?.block,true);
        session.turnId="turn3";session.userConfirmedQuote=true;
        assert.equal(await check({ ...args, confirm: true }), undefined);
        assert.equal((session as import("../src/lib/billing/agent").AgentBillingSession).preparedBilling?.billingCredits, 8);
        session.turnId="turn4";
        assert.equal((await check(args))?.block,true);
        const changed = structuredClone(config);
        changed.features["image.generate"].pricing = { mode: "fixed", credits: 11 };
        await runtime.config.publish({ id: randomUUID(), expectedVersion: first.version, config: changed, actor: "fixture", reason: "Agent price changed" });
        session.turnId="turn5";session.userConfirmedQuote=true;
        const outdated = await check({ ...args, confirm: true });
        assert.ok(outdated);
        assert.equal(outdated.block, true);
        assert.match(outdated.reason, /价格已更新/); assert.equal(outdated.attention, "waiting");
        assert.equal((await check({ ...args, prompt: "new fixture", confirm: false }))?.block, true);
        const latest = await runtime.config.current(), withoutConfirm = structuredClone(latest.config);
        withoutConfirm.thresholds.agentConfirmCredits = 70;
        await runtime.config.publish({ id: randomUUID(), expectedVersion: latest.version, config: withoutConfirm, actor: "fixture", reason: "Raise confirmation threshold" });
        assert.equal(await check({ ...args, prompt: "small below threshold" }), undefined);
        const poor = { ...session, email: await f.user(0) };
        assert.equal((await agentBillingPrecheck(poor, "generate_image", { prompt: "balance check" }, randomUUID()))?.attention, "restricted");
    }
    finally {
        const current = await runtime.config.current();
        await runtime.config.publish({ id: randomUUID(), expectedVersion: current.version, config: original.config, actor: "fixture", reason: "Agent fixture restore" });
        await f.close();
    }
    console.log("PASS Agent prices and confirmation threshold follow configuration, stale confirmation blocked");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
