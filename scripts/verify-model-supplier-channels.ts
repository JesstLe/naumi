import { spawn } from "node:child_process";
import { fixtureConfig } from "./billing-unit-fixture";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";
async function main() {
    let digest = "", failure = 0, active = 0, maxActive = 0, flowFailure="", failureTwo=0;
    const calls: any[] = [];
    const png = await sharp({ create: { width: 256, height: 256, channels: 4, background: "white" } }).png().toBuffer();
    const f = await createModelFixture(async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const c of req)
            chunks.push(Buffer.from(c));
        let body: any = {};
        if (chunks.length) {
            const request = new Request("http://mock" + req.url, { method: "POST", headers: { "content-type": String(req.headers["content-type"]) }, body: Buffer.concat(chunks) });
            if (String(req.headers["content-type"]).includes("multipart")) {
                const fd = await request.formData();
                body = Object.fromEntries(fd);
                body.references = Array.from(fd.values()).filter(v => typeof v !== "string").length;
            }
            else
                body = await request.json();
        }
        res.setHeader("content-type", "application/json");
        if(req.url==="/v1/models")return res.end(JSON.stringify({data:[{id:"nano-banana-2"}]}));
        if (req.url === "/internal/config/state")
            return res.end(JSON.stringify({ digest }));
        if (req.url === "/internal/config/prepare")
            return res.end(JSON.stringify({ digest: body.digest, phase: "prepared" }));
        if (req.url === "/internal/config/activate") {
            digest = body.digest;
            return res.end(JSON.stringify({ id: body.id, digest, phase: "applied" }));
        }
        if (!/\/v1\/(?:images|chat)\//.test(req.url || "")) {
            res.statusCode = 404;
            return res.end("{}");
        }
        calls.push(body);
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(r => setTimeout(r, 30));
        active--;
        if(["wire-image-two","nano-banana-2"].includes(body.model)&&failureTwo){res.statusCode=failureTwo;return res.end(JSON.stringify({error:{message:"second supplier failed"}}));}
        if (body.model === "wire-image-one" && failure) {
            res.statusCode = failure;
            return res.end(JSON.stringify({ error: { code: "mock", ...(failure === 400 ? { billing_status: "not_charged" } : {}) } }));
        }
        if (req.url === "/v1/chat/completions") {
            if(flowFailure&&body.model==="nano-banana-pro"){
                if(flowFailure==="http"){res.statusCode=500;return res.end(JSON.stringify({error:{message:"Flow unavailable"}}));}
                if(flowFailure==="disconnect")return req.socket.destroy();
                if(flowFailure==="timeout"){await new Promise(r=>setTimeout(r,250));return res.end(JSON.stringify({choices:[]}));}
                res.setHeader("content-type","text/event-stream");
                if(flowFailure==="sse")return res.end('data: '+JSON.stringify({error:{message:"Flow generation failed"}})+'\n\n');
                if(flowFailure==="corrupt")return res.end('data: '+JSON.stringify({choices:[{delta:{content:'![image](data:image/png;base64,Y2FzdA==)'}}]})+'\n\n');
                return res.end('data: '+JSON.stringify({choices:[{delta:{content:'No image available'}}]})+'\n\n');
            }
            res.setHeader("content-type", "text/event-stream");
            return res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: '![image](data:image/png;base64,' + png.toString("base64") + ')' } }] }) + '\n\ndata: [DONE]\n\n');
        }
        res.end(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }));
    });
    Object.assign(process.env, { PGOPTIONS: `-c search_path=${f.schemaName}`, NAUMI_MULTI_USER: "1", NAUMI_ROUTER_MANAGEMENT_URL: f.origin, NAUMI_ROUTER_MANAGEMENT_TOKEN: "channels-router-fixture-token-long", MODEL_CONFIG_ENVELOPE_SECRET: "channels-envelope-fixture-secret-long", MODEL_CONFIG_TRUSTED_ORIGINS: f.origin, OPENAI_API_KEY: "fixture-only", STORAGE_DRIVER: "local" });
    const db = await import("../src/lib/db");
    try {
        const cred = await f.credentials.importPlain({ providerId: "p2", plain: "fixture-channel-two", actor: "fixture" });
        f.config.providers[0].maxConcurrent = 2;
        f.config.providers.push({ ...f.config.providers[0], id: "p2", name: "Second supplier", credentialRef: cred.id });
        f.config.upstreamModels.push({ ...structuredClone(f.config.upstreamModels[0]), id: "u2", providerId: "p2", model: "wire-image-two" });
        f.config.upstreamModels[0].parameterMap.quality = { medium: "low" };
        f.config.upstreamModels[1].parameterMap.quality = { medium: "high" };
        const flowCred = await f.credentials.importPlain({ providerId: "p3", plain: "fixture-channel-flow", actor: "fixture" });
        f.config.providers.push({ ...f.config.providers[0], id: "p3", name: "Flow supplier", protocol: "new-api-flow", credentialRef: flowCred.id });
        f.config.upstreamModels.push({ ...structuredClone(f.config.upstreamModels[0]), id: "u3", providerId: "p3", model: "nano-banana-pro" });
        const backupCred=await f.credentials.importPlain({providerId:"p4",plain:"fixture-channel-flow-backup",actor:"fixture"});
        f.config.providers.push({...f.config.providers[2],id:"p4",name:"Backup Flow supplier",credentialRef:backupCred.id});
        f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[2]),id:"u4",providerId:"p4",model:"nano-banana-2"});
        await f.repo.current();
        await db.ensureSchema();
        await db.setSetting("multi_user_enabled", "1");
        const email = "channels@example.test";
        await db.getOrCreateUser(email);
        await db.addCreditBatch(email, 10000, { source: "admin", reason: "isolated fixture" });
        const admin = await (await import("../src/lib/model-config/server")).getModelAdministration(), b0 = await admin.billing.current(), bc = fixtureConfig();
        bc.switches.metering = "on";
        await admin.billing.publish({ id: randomUUID(), expectedVersion: b0.version, config: bc, actor: "fixture", reason: "fixture" });
        const billing = await admin.billing.current(), before = await admin.repo.current();
        const handler = (await import("../src/lib/model-config/management-access")).createModelManagementHandler({ authorize: async () => ({ actor: "fixture-admin" }), managed: async () => true, administration: async () => admin });
        const req = (data?: unknown) => new Request(f.origin + "/api/admin/model-management", { method: data ? "POST" : "GET", headers: { "content-type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}) });
        const channels = [{ upstreamId: "u1", enabled: true, priority: 1, weight: 7 }, { upstreamId: "u2", enabled: true, priority: 1, weight: 3 }];
        const body = { action: "channels", id: randomUUID(), expectedVersion: before.version, rowId: "image-a", policy: { mode: "balanced", channels } };
        assert.equal((await handler(req({ ...body, policy: { ...body.policy, channels: [] } }))).status, 400);
        assert.equal((await handler(req(body))).status, 200);
        const balanced = await admin.repo.current();
        assert.equal((await handler(req(body))).status, 200);
        assert.equal((await admin.repo.current()).version, balanced.version);
        assert.deepEqual(balanced.config.upstreamModels, before.config.upstreamModels);
        assert.deepEqual(await admin.billing.current(), billing);
        const executor = (await import("../src/lib/model-config/execution")).createModelExecutor({ runtime: admin.runtime, credentials: admin.credentials, billingByVersion: version => admin.billing.byVersion(version), trustedOrigins: [f.origin], gateway: () => ({ baseUrl: f.origin, apiKey: "fixture" }) });
        const freeze = async (snapshot?: typeof before) => executor.resolve({ feature: "image.generate", binding: "image.generate", requestedModelId: "image-a", snapshot: snapshot || await admin.repo.current(), billing, facts: { task: "draft", quality: "medium", resolution: "1K", ratio: "1:1", needsEdit: false, preserveIdentity: false, needsText: false, nativeResolution: false, references: 0 } });
        const frozen = await freeze(), client = (await executor.clientFor(frozen)).client;
        const gen = () => client.images.generate({ model: "image-a", prompt: "mock routing", n: 1, quality: "medium" as never });
        for (let i = 0; i < 40; i++)
            await gen();
        assert.equal(calls.filter(c => c.model === "wire-image-one").length, 28);
        assert.equal(calls.filter(c => c.model === "wire-image-two").length, 12);
        assert.ok(calls.filter(c => c.model === "wire-image-one").every(c => c.quality === "low"));
        assert.ok(calls.filter(c => c.model === "wire-image-two").every(c => c.quality === "high"));
        const nWorkers = calls.length, workers = [];
        for (let i = 0; i < 2; i++) {
            const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--conditions", "react-server", "scripts/verify-model-supplier-channels.ts", "--worker"], { env: process.env, windowsHide: true });
            let log = "";
            const ready = new Promise<void>((resolve, reject) => { child.stdout.on("data", d => { log += d; if (log.includes("READY"))
                resolve(); }); child.stderr.on("data", d => log += d); child.once("error", reject); child.once("exit", code => reject(new Error(`Worker exited before ready: ${code} ${log}`))); });
            const exit = new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(log))); });
            await ready;
            workers.push({ child, exit });
        }
        for (const { child } of workers)
            child.stdin.end("start");
        await Promise.all(workers.map(w => w.exit));
        assert.equal(calls.slice(nWorkers).filter(c => c.model === "wire-image-one").length, 14);
        assert.equal(calls.slice(nWorkers).filter(c => c.model === "wire-image-two").length, 6);
        const { signUserSession } = await import("../src/lib/native-auth"), cookie = `nv_user=${signUserSession(email, Date.now())}`, request = (path: string, data?: unknown, extra: Record<string, string> = {}) => new Request(f.origin + path, { method: data ? "POST" : "GET", headers: { cookie, "content-type": "application/json", ...extra }, ...(data ? { body: JSON.stringify(data) } : {}) });
        const quoteApi = await import("../src/app/api/billing/quote/route"), genApi = await import("../src/app/api/generate-image/route"), q = await (await quoteApi.POST(request("/api/billing/quote", { feature: "image.generate", modelId: "image-a", quality: "medium", resolution: "1K", ratio: "1:1", quantity: 1 }))).json();
        const created = await genApi.POST(request("/api/generate-image", { prompt: "mock end-to-end", model: "image-a", quality: "medium", resolution: "1K", ratio: "1:1", count: 1 }, { "x-naumi-model-version": String(q.modelVersion), "x-naumi-billing-version": String(q.version), "x-naumi-billing-credits": String(q.credits), "x-naumi-billing-operation-id": randomUUID() }));
        assert.equal(created.status, 200, await created.clone().text());
        const jobId = (await created.json()).jobId;
        let done: any;
        for (let i = 0; i < 200; i++) {
            done = await (await genApi.GET(request("/api/generate-image?job=" + jobId))).json();
            if (["done", "error"].includes(done.status))
                break;
            await new Promise(r => setTimeout(r, 50));
        }
        assert.equal(done.status, "done", JSON.stringify(done));
        assert.equal(await db.getImageJobChargedCredits(jobId), q.credits);
        const parallel = await Promise.allSettled(Array.from({ length: 8 }, gen));
        assert.ok(parallel.filter(r => r.status === "fulfilled").length >= 4);
        assert.ok(maxActive <= 4);
        assert.equal((await db.getPool().query("SELECT count(*) n FROM app_model_provider_leases")).rows[0].n, "0");
        const publish = async (policy: unknown) => { const res = await handler(req({ ...body, id: randomUUID(), expectedVersion: (await admin.repo.current()).version, policy })); assert.equal(res.status, 200, await res.clone().text()); };
        await publish({ mode: "priority", channels: [channels[0], { ...channels[1], priority: 2 }] });
        const priorityClient = (await executor.clientFor(await freeze())).client;
        const priorityGen = () => priorityClient.images.generate({ model: "image-a", prompt: "priority fixture", n: 1 });
        const cap = (await import("../src/lib/model-config/capacity")).createProviderCapacity(db.getPool()), limit = { providerId: "p1", baseUrl: f.origin + "/v1", maxConcurrent: 2, timeoutMs: 120000 }, l1 = await cap.acquire(limit), l2 = await cap.acquire(limit);
        await priorityGen();
        assert.equal(calls.at(-1).model, "wire-image-two");
        await l1.release();
        await l2.release();
        failure = 400;
        const n = calls.length;
        await priorityGen();
        assert.deepEqual(calls.slice(n).map(c => c.model), ["wire-image-one", "wire-image-two"]);
        failure = 500;
        await db.getPool().query("UPDATE app_model_channel_health SET failures=0,open_until=NULL,probe_until=NULL");
        for (let i = 0; i < 3; i++) {
            const n = calls.length;
            await priorityGen();
            assert.deepEqual(calls.slice(n).map(c=>c.model),["wire-image-one","wire-image-two"]);
        }
        await priorityGen();
        assert.equal(calls.at(-1).model, "wire-image-two", "circuit skips failed supplier for future tasks");
        failure = 0;
        await db.getPool().query("UPDATE app_model_channel_health SET open_until=now()-interval '1 second',probe_until=NULL");
        await priorityGen();
        assert.equal(calls.at(-1).model, "wire-image-one");
        await publish({ mode: "balanced", channels: [{ upstreamId: "u3", enabled: true, priority: 1, weight: 1 }] });
        const flowClient = (await executor.clientFor(await freeze())).client;
        await flowClient.images.generate({ model: "image-a", prompt: "flow fixture", n: 1 });
        assert.equal(calls.at(-1).model, "nano-banana-pro");
        assert.equal(calls.at(-1).stream, true);
        await flowClient.images.edit({ model: "image-a", prompt: "edit", image: new File([new Uint8Array(png)], "ref.png", { type: "image/png" }), n: 1 });
        assert.equal(calls.at(-1).messages[0].content[1].type, "image_url");
        await publish({mode:"priority",channels:[{upstreamId:"u3",enabled:true,priority:1,weight:7},{upstreamId:"u4",enabled:true,priority:2,weight:3}]});
        const routedScope=await executor.describe(await freeze());
        routedScope.supplierRouting!.targets[0].scope.connection.timeoutMs=80;
        const routed=(await import("../src/lib/model-config/clients")).executionOpenAI(routedScope,{trustedOrigins:[f.origin]});
        for(const mode of ["http","sse","empty","corrupt","disconnect","timeout"]){
            await db.getPool().query("DELETE FROM app_model_channel_health");flowFailure=mode;const start=calls.length;
            await routed.images.generate({model:"image-a",prompt:"Flow fallback",n:1});
            assert.deepEqual(calls.slice(start).map(c=>c.model),["nano-banana-pro","nano-banana-2"],mode);
            assert.equal((await db.getPool().query("SELECT count(*) FROM app_model_provider_leases")).rows[0].count,"0");
        }
        await db.getPool().query("DELETE FROM app_model_channel_health");flowFailure="sse";const editStart=calls.length;
        await routed.images.edit({model:"image-a",prompt:"Change reference color",image:new File([new Uint8Array(png)],"reference.png",{type:"image/png"}),n:1});
        assert.deepEqual(calls.slice(editStart).map(c=>c.model),["nano-banana-pro","nano-banana-2"]);assert.equal(calls[editStart].messages[0].content[1].image_url.url,calls[editStart+1].messages[0].content[1].image_url.url,"Fallback preserves reference bytes");
        await db.getPool().query("DELETE FROM app_model_channel_health");flowFailure="timeout";const cancelStart=calls.length,cancel=new AbortController();setTimeout(()=>cancel.abort(),45);
        await assert.rejects(routed.images.generate({model:"image-a",prompt:"cancelled",n:1},{signal:cancel.signal}));await new Promise(r=>setTimeout(r,100));assert.equal(calls.length,cancelStart+1,"Caller cancellation must not start the backup supplier");assert.equal((await db.getPool().query("SELECT count(*) FROM app_model_provider_leases")).rows[0].count,"0");
        // A real durable task stays pending until the second supplier finishes, then charges once.
        flowFailure="sse";await db.getPool().query("DELETE FROM app_model_channel_health");
        const fq=await(await quoteApi.POST(request("/api/billing/quote",{feature:"image.generate",modelId:"image-a",quality:"medium",resolution:"1K",ratio:"1:1",quantity:1}))).json();
        const submit=async()=>genApi.POST(request("/api/generate-image",{prompt:"Flow durable fallback",model:"image-a",quality:"medium",resolution:"1K",ratio:"1:1",count:1},{"x-naumi-model-version":String(fq.modelVersion),"x-naumi-billing-version":String(fq.version),"x-naumi-billing-credits":String(fq.credits),"x-naumi-billing-operation-id":randomUUID()}));
        const fallbackStart=calls.length, accepted=await submit();assert.equal(accepted.status,200);const fallbackJob=(await accepted.json()).jobId;
        let fallbackDone:any;for(let i=0;i<200;i++){fallbackDone=await(await genApi.GET(request("/api/generate-image?job="+fallbackJob))).json();if(["done","error"].includes(fallbackDone.status))break;await new Promise(r=>setTimeout(r,30));}
        assert.equal(fallbackDone.status,"done",JSON.stringify(fallbackDone));assert.deepEqual(calls.slice(fallbackStart).map(c=>c.model),["nano-banana-pro","nano-banana-2"]);assert.equal(await db.getImageJobChargedCredits(fallbackJob),fq.credits);
        await db.getPool().query("DELETE FROM app_model_channel_health");failureTwo=500;
        const exhausted=await submit();assert.equal(exhausted.status,200);const exhaustedJob=(await exhausted.json()).jobId;
        let exhaustedDone:any;for(let i=0;i<200;i++){exhaustedDone=await(await genApi.GET(request("/api/generate-image?job="+exhaustedJob))).json();if(["done","error"].includes(exhaustedDone.status))break;await new Promise(r=>setTimeout(r,30));}
        assert.equal(exhaustedDone.status,"error");assert.equal(await db.getImageJobChargedCredits(exhaustedJob),0);assert.equal((await db.getPool().query("SELECT billing_settled FROM app_image_jobs WHERE id=$1",[exhaustedJob])).rows[0].billing_settled,true);
        flowFailure="";failureTwo=0;
        const old = (await executor.clientFor(frozen)).client;
        await old.images.generate({ model: "image-a", prompt: "frozen", n: 1 });
        assert.ok(["wire-image-one", "wire-image-two"].includes(calls.at(-1).model));
        const stages = (await db.getPool().query("SELECT DISTINCT provider_id,wire_model FROM app_model_execution_stages")).rows;
        assert.ok(stages.some(r => r.provider_id === "p1"));
        assert.ok(stages.some(r => r.provider_id === "p2"));
        assert.ok(stages.some(r => r.provider_id === "p3"));
        await publish(null);
        assert.equal((await admin.repo.current()).config.publicModels[0].supplierRouting, undefined);
        assert.deepEqual(await admin.billing.current(), billing);
        const { applyChannelPolicy } = await import("../src/lib/model-config/channel-policy"), familyConfig = structuredClone(before.config);
        familyConfig.upstreamModels.push({ ...structuredClone(familyConfig.upstreamModels[0]), id: "uf1", model: "gemini-3.0-pro-image-square" }, { ...structuredClone(familyConfig.upstreamModels[0]), id: "uf2", model: "gemini-3.0-pro-image-portrait" });
        familyConfig.publicModels.push({ id: "gemini-3.0-pro-image-square", label: "Nano", modality: "image", enabled: true, visible: true, target: { type: "upstream", id: "uf1" } }, { id: "gemini-3.0-pro-image-portrait", label: "Nano", modality: "image", enabled: true, visible: false, target: { type: "upstream", id: "uf2" } });
        const family = applyChannelPolicy(familyConfig, { id: "gemini-3.0-pro-image", publicIds: ["gemini-3.0-pro-image-square", "gemini-3.0-pro-image-portrait"] }, { mode: "balanced", channels: [{ ...channels[0], upstreamId: "uf1" }, { ...channels[1], upstreamId: "u3" }] });
        assert.equal(family.publicModels[1].supplierRouting!.channels[0].upstreamId, "uf1");
        assert.equal(family.publicModels[2].supplierRouting!.channels[0].upstreamId, "uf2");
        assert.equal(family.publicModels[2].supplierRouting!.channels[1].upstreamId, "u3");
        const { claimChannel } = await import("../src/lib/model-config/channel-scheduler"), scope = await executor.describe(frozen);
        let familyDefault = 0;
        for (let i = 0; i < 40; i++) {
            const variant = i % 2 ? "portrait" : "square", policy = { mode: "balanced" as const, channels: [{ ...channels[0], upstreamId: "uf" + (i % 2 ? 2 : 1) }, { ...channels[1], upstreamId: "u3" }] };
            const targets = policy.channels.map((c, j) => ({ ...c, scope: { ...scope, supplierRouting: undefined, connection: { ...scope.connection, providerId: j ? "p3" : "p1", wireModel: j ? "nano-banana-pro" : "gemini-3.0-pro-image-" + variant, maxConcurrent: 2 } } }));
            const claim = await claimChannel(db.getPool(), "gemini-3.0-pro-image-" + variant, policy, targets, new Set());
            if (claim.target.upstreamId !== "u3")
                familyDefault++;
            await claim.release();
        }
        assert.equal(familyDefault, 28, "Ratio aliases must share weighted scheduling");
        const registration={action:"register",id:randomUUID(),expectedVersion:(await admin.repo.current()).version,providerId:"p3",model:"nano-banana-2",confirmed:true,capabilityVerified:false,qualityPolicy:{mode:"omit",choices:[{id:"medium",label:"标准"}]},edit:true,vision:false,qualityRank:3,qualities:[],resolutions:[],maxReferenceImages:1};const registrationResult=await handler(req(registration));assert.equal(registrationResult.status,200,await registrationResult.clone().text());const registered=(await admin.repo.current()).config.upstreamModels.find(u=>u.model==="nano-banana-2"&&u.providerId==="p3")!;assert.equal(registered.capabilities.verified,false);assert.equal(registered.parameterMap.qualityPolicy?.mode,"omit");
        console.log("MULTI_SUPPLIER_CHANNELS=PASS WEIGHT_70_30=28_12 SHARED_CONCURRENCY=4 NO_DOUBLE_LEASE=1 PRIORITY_BUSY_OVERFLOW=PASS HTTP_SSE_EMPTY_CORRUPT_DISCONNECT_TIMEOUT_FALLBACK=PASS REFERENCE_EDIT_FALLBACK=PASS USER_CANCEL_NO_FALLBACK=PASS FALLBACK_JOB_SINGLE_SETTLEMENT=PASS ALL_FAILED_RELEASE_CREDITS=PASS CIRCUIT_RECOVERY=PASS NANO_INLINE_EDIT=PASS FAMILY_HIDDEN_RATIO_SHARED_WEIGHTS=PASS FROZEN_REPLAY_DRAFT_BILLING_AUDIT=PASS REGISTER_NANO_PROFILE_NO_CAPABILITY_INVENTION=PASS CROSS_PROCESS_WEIGHTED=PASS QUOTE_TASK_MEDIA_SETTLEMENT=PASS REAL_PAID_CALLS=0");
    }
    finally {
        await db.getPool().end();
        await f.cleanup();
    }
}
async function worker() { const db = await import("../src/lib/db"); try {
    const admin = await (await import("../src/lib/model-config/server")).getModelAdministration(), executor = await (await import("../src/lib/model-config/execution")).getModelExecutor(), snapshot = await admin.repo.current(), billing = await admin.billing.current(), frozen = await executor.resolve({ feature: "image.generate", binding: "image.generate", requestedModelId: "image-a", snapshot, billing, facts: { task: "draft", quality: "medium", resolution: "1K", needsEdit: false, preserveIdentity: false, needsText: false, nativeResolution: false, references: 0 } }), client = (await executor.clientFor(frozen)).client;
    console.log("READY");
    await new Promise<void>(resolve => process.stdin.once("data", () => resolve()));
    for (let i = 0; i < 10; i++)
        await client.images.generate({ model: "image-a", prompt: "worker fixture", quality: "medium" as never, n: 1 });
}
finally {
    await db.getPool().end();
} }
(process.argv.includes("--worker") ? worker() : main()).catch(e => { console.error(e); process.exitCode = 1; });
