import {freezeCreationSettings,creationToolArguments,creationImageForm} from "../src/lib/agent/creation-settings";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {createModelFixture} from "./model-config-fixture";
async function main() {
    Object.assign(process.env, { SETTINGS_SECRET: "fixture-settings-0123456789abcdef0123456789abcdef0123456789", NAUMI_MULTI_USER: "1", OPENAI_API_KEY: "local-fixture-key" });
    const wireRequests:Record<string,unknown>[]=[];
    let digest="",supplierCalls=0;const publications=new Map<string,unknown>();
    const models=await createModelFixture(async(req,res)=>{
        const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
        if(req.url?.includes('/images/')){
          const request=new Request('http://local'+req.url,{method:'POST',headers:req.headers as HeadersInit,body:Buffer.concat(chunks)});
          const form=await request.formData();wireRequests.push(Object.fromEntries([...form.entries()].filter(([,value])=>typeof value==='string')));
          res.setHeader('content-type','application/json');return res.end(JSON.stringify({data:[{b64_json:readFileSync('public/demos/workbench-v2/suite-coffee-scene.webp').toString('base64')}]}));
        }
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
    models.config.upstreamModels[0].capabilities.preserveIdentity=true;
    models.config.upstreamModels.push({...structuredClone(models.config.upstreamModels[0]),id:'u2',model:'wire-image-two'});
    models.config.publicModels.push({...structuredClone(models.config.publicModels[0]),id:'image-b',label:'Second image',target:{type:'upstream',id:'u2'}});
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
        const {resolveCreationSettings}=await import('../src/lib/agent/creation-settings-server');
        await resolveCreationSettings({image:{modelId:'image-a'}});await assert.rejects(()=>resolveCreationSettings({image:{modelId:'hidden-unknown'}}));
        session.turnId='creation-a';session.creationSettings=freezeCreationSettings({image:{modelId:'image-a',ratio:'1:1',resolution:'2K'}});
        const llmArgs={prompt:'product',model:'image-b',ratio:'16:9',resolution:'1K'};
        assert.equal(await check(creationToolArguments('generate_image',llmArgs,session.creationSettings)),undefined);
        const turnA=structuredClone(session.preparedImagegen!);
        assert.equal(turnA.request.modelId,'image-a');assert.equal(turnA.request.parameters.resolution,'2K');assert.equal(turnA.request.parameters.ratio,'1:1');
        session.turnId='creation-b';session.creationSettings=freezeCreationSettings({image:{modelId:'image-b',ratio:'1:1',resolution:'1K'}});
        assert.equal(await check(creationToolArguments('generate_image',llmArgs,session.creationSettings)),undefined);
        assert.equal(session.preparedImagegen?.request.modelId,'image-b');assert.equal(session.preparedImagegen?.request.parameters.resolution,'1K');assert.equal(turnA.request.modelId,'image-a');assert.equal(turnA.request.parameters.resolution,'2K');
        const {withModelRequest}=await import('../src/lib/model-config/requests'),{modelAwareOpenAI}=await import('../src/lib/model-config/clients');
        const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
        for(const [modelId,resolution] of [['image-a','2K'],['image-b','1K']] as const){
          const f=new FormData();f.set('image',new File([png],'product.png',{type:'image/png'}));f.set('color','#C8102E');
          const selected=creationImageForm('/api/recolor',f,freezeCreationSettings({image:{modelId,resolution,ratio:'1:1'}}))!;
          const request=new Request('http://127.0.0.1/api/recolor',{method:'POST',headers:selected.headers,body:selected.body});
          await withModelRequest(request,async()=>{
            const client=modelAwareOpenAI({apiKey:'fixture-only',baseURL:models.origin+'/v1'});
            await client.images.edit({model:'legacy-wrong-model',image:new File([png],'product.png',{type:'image/png'}),prompt:'fixture recolor',size:'1024x1024'});
          },email);
        }
        assert.equal(wireRequests.length,2);assert.equal(wireRequests[0].model,'wire-image-one');assert.equal(wireRequests[0].size,'2048x2048');assert.equal(wireRequests[1].model,'wire-image-two');
        assert.equal(Number((await f.pool.query("SELECT count(*) AS n FROM app_ledger WHERE email=$1 AND kind='consume'",[email])).rows[0].n),0);
        const {recordTurnCreationSettings,persistAgentSession}=await import('../src/lib/agent/runtime');
        const {AgentHarness}=await import('../src/lib/agent/harness'),{getAgentSession}=await import('../src/lib/agent/session-repository'),{restoreWorkbenchMessages}=await import('../src/lib/agent/workbench-activity');
        const durable={id:'ag-fixture-'+randomUUID(),email,title:'turn settings',agent:{state:{messages:[] as any[]}},harness:new AgentHarness(email,'ag-fixture'),events:[],turnId:'turn-a'} as unknown as import('../src/lib/agent/runtime').Session;
        recordTurnCreationSettings(durable,freezeCreationSettings({image:{modelId:'image-a',resolution:'2K'}}),'chat-a');
        durable.agent.state.messages.push({role:'user',content:'first'} as any,{role:'assistant',content:[{type:'text',text:'first result'}]} as any);
        await persistAgentSession(durable);
        durable.turnId='turn-b';recordTurnCreationSettings(durable,freezeCreationSettings({image:{modelId:'image-b',resolution:'1K'}}),'chat-b');
        durable.agent.state.messages.push({role:'user',content:'second'} as any,{role:'assistant',content:[{type:'text',text:'second result'}]} as any);
        durable.events=[];await persistAgentSession(durable);
        const saved=await getAgentSession(email,durable.id);const reopened=restoreWorkbenchMessages(saved!.messages as any[],saved!.steps as any[]);
        assert.equal(reopened[1].creationSettings?.image?.modelId,'image-a');assert.equal(reopened[3].creationSettings?.image?.modelId,'image-b');assert.equal(reopened[1].agentModel,'chat-a');
        await f.pool.query('DELETE FROM app_agent_sessions WHERE id=$1 AND email=$2',[durable.id,email]);
        console.log('TURN_PERSISTENCE_PG=PASS original_round_metadata=preserved event_compaction=preserved replay_calls=0');
        console.log('TURN_PARAMETERS_PG=PASS quotes=A2K/B1K frozen_A=unchanged actual_wire_models=one/two wire_A_size=2048x2048 real_supplier_calls=0');

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
