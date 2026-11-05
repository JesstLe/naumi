import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {createModelFixture} from "./model-config-fixture";
async function main() {
    Object.assign(process.env, { SETTINGS_SECRET: "fixture-settings-0123456789abcdef0123456789abcdef0123456789", NAUMI_MULTI_USER: "1", OPENAI_API_KEY: "local-fixture-key" });
    let digest="",supplierCalls=0;const publications=new Map<string,unknown>();
    const models=await createModelFixture(async(req,res)=>{
        const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
        const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
        res.setHeader("content-type","application/json");
        if(req.url==="/internal/config/prepare")return res.end(JSON.stringify({digest:body.digest,phase:"prepared"}));
        if(req.url==="/internal/config/activate"){assert.equal(body.expectedDigest,digest);digest=body.digest;const result={id:body.id,digest,phase:"applied"};publications.set(body.id,result);return res.end(JSON.stringify(result));}
        if(req.url==="/internal/config/state")return res.end(JSON.stringify({digest}));
        if(req.url?.startsWith("/internal/config/publications/")){const result=publications.get(decodeURIComponent(req.url.split("/").at(-1)!));if(result)return res.end(JSON.stringify(result));res.statusCode=404;return res.end(JSON.stringify({error:"Unknown publication"}));}
        supplierCalls++;res.statusCode=500;res.end(JSON.stringify({error:"Agent billing fixture forbids generation"}));
    });
    const oldOptions=process.env.PGOPTIONS;process.env.PGOPTIONS=`-c search_path=${models.schemaName}`;
    Object.assign(process.env,{NAUMI_MODEL_CONFIG_ONLY:"1",MODEL_CONFIG_TRUSTED_ORIGINS:models.origin,NAUMI_ROUTER_MANAGEMENT_URL:models.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"isolated-billing-router-private-token-20261014",MODEL_CONFIG_ENVELOPE_SECRET:"isolated-billing-envelope-key-20261014"});
    await models.repo.current();
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
        const call=randomUUID();assert.equal(await check(args,call),undefined,"A server-priced tool call does not wait for another user turn");
        const originalBilling=structuredClone(session.preparedBilling!),originalPlan=structuredClone(session.preparedImagegen!);
        assert.equal(originalBilling.billingCredits,8);
        assert.equal(originalPlan.steps[0].modelId,models.config.bindings["image.generate"]);
        assert.equal(originalPlan.billingVersion,first.version);
        assert.equal(await check(args,call),undefined);
        assert.equal(session.preparedBilling?.billingOperationId,originalBilling.billingOperationId,"The same session/turn/tool call retains its operation identity");
        session.turnId="turn2";
        session.userConfirmedQuote=false;
        assert.equal(await check({ ...args, confirm: true }), undefined);
        assert.equal((session as import("../src/lib/billing/agent").AgentBillingSession).preparedBilling?.billingCredits, 8);
        assert.equal(session.preparedImagegen?.steps[0].modelId,models.config.bindings["image.generate"]);
        session.turnId="turn3";
        assert.equal(await check(args),undefined);
        const changed = structuredClone(config);
        changed.features["image.generate"].pricing = { mode: "fixed", credits: 11 };
        const changedVersion=await runtime.config.publish({ id: randomUUID(), expectedVersion: first.version, config: changed, actor: "fixture", reason: "Agent price changed" });
        session.turnId="turn4";session.userConfirmedQuote=false;
        assert.equal(await check(args),undefined,"A new call prepares the current server quote without reconfirmation");
        assert.equal(session.preparedBilling?.billingCredits,11);
        assert.equal(session.preparedImagegen?.billingVersion,changedVersion.version);
        assert.equal(originalPlan.billingVersion,first.version,"A retained original plan is not mutated by a new publication");
        assert.equal(originalPlan.steps[0].credits,8);
        assert.equal(originalBilling.billingCredits,8);
        assert.equal(await check({ ...args, prompt: "new fixture", confirm: false }),undefined,"Legacy fee flags do not create a second pricing gate");
        const latest = await runtime.config.current(), withoutConfirm = structuredClone(latest.config);
        withoutConfirm.thresholds.agentConfirmCredits = 70;
        await runtime.config.publish({ id: randomUUID(), expectedVersion: latest.version, config: withoutConfirm, actor: "fixture", reason: "Raise confirmation threshold" });
        assert.equal(await check({ ...args, prompt: "small below threshold" }), undefined);
        for(let index=0;index<40;index++)assert.equal(await check({prompt:`ordinary ${index}`,count:1}),undefined,"Ordinary calls must not accumulate pending fee confirmations");
        assert.equal("pendingQuotes"in session,false);
        assert.equal(Number((await f.pool.query("SELECT count(*) AS n FROM app_gen_reservations WHERE email=$1",[email])).rows[0].n),0,"Preparing a quote does not reserve or debit");
        assert.equal(Number((await f.pool.query("SELECT count(*) AS n FROM app_ledger WHERE email=$1 AND kind='consume'",[email])).rows[0].n),0);
        const poor = { ...session, email: await f.user(0) };
        assert.equal((await agentBillingPrecheck(poor, "generate_image", { prompt: "balance check" }, randomUUID()))?.attention, "restricted");
        assert.equal((await agentBillingPrecheck(poor, "generate_image", { prompt: "balance check",confirm:true }, randomUUID()))?.attention, "restricted","A legacy fee-confirm flag never bypasses the real balance");
        assert.equal(supplierCalls,0);
    }
    finally {
        const current = await runtime.config.current();
        await runtime.config.publish({ id: randomUUID(), expectedVersion: current.version, config: original.config, actor: "fixture", reason: "Agent fixture restore" });
        await f.close();
        await models.cleanup();if(oldOptions===undefined)delete process.env.PGOPTIONS;else process.env.PGOPTIONS=oldOptions;
    }
    console.log("PASS Agent server quotes without repeated consent, stable operation identity, frozen original plan, current new-call price, 40 calls without pending accumulation, real balance and zero supplier requests");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
