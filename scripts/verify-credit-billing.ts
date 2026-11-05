import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import {mkdir,readFile,writeFile,rm} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type {GenParams} from "../src/lib/imagegen/generation-types";

/** Real PostgreSQL + public route regression; every supplier request stays local. */
async function main() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || url.hostname !== "127.0.0.1") throw new Error("Requires isolated local PostgreSQL");
  const evidence=path.resolve(process.env.CREDIT_BILLING_EVIDENCE||"output/credit-billing-regression");
  await mkdir(evidence,{recursive:true});
  const observations:{scenario:string;images:number;customerCredits:number;supplierPosts:number;platformPosts:number;rootCrashRecovery:boolean}[]=[];
  const scriptSha256=createHash("sha256").update(await readFile(new URL(import.meta.url))).digest("hex");
  const media=path.resolve("output/credits-handoff/media-"+randomUUID());
  Object.assign(process.env, {
    NAUMI_MULTI_USER: "1",
    SETTINGS_SECRET: "fixture-settings-0123456789abcdef0123456789abcdef0123456789",
    VIDEO_WORKER_SECRET: "fixture-worker-0123456789abcdef0123456789abcdef0123456789",
    STORAGE_DRIVER: "local", MEDIA_DIR: media,
    OPENAI_API_KEY: "fixture-platform", OPENAI_IMAGE_MODEL: "gpt-image-1",
    OPENAI_IMAGE_MODELS: "gpt-image-1", OPENAI_IMAGE_QUALITY: "medium",
    NAUMI_IMAGE_QUALITY_SUPPORTED: "1", USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK: "true",
  });
  const image = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "white" } }).png().toBuffer();
  let scenario = "success", requestCount = 0;
  let release: (() => void) | undefined;
  let hold: Promise<void> | undefined;
  const wire: {quality: string; byok: boolean}[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const byok = request.headers.authorization === "Bearer fixture-byok";
    wire.push({ quality: body.quality, byok });
    const index = requestCount++;
    if (hold) await hold;
    response.setHeader("content-type", "application/json");
    const qualityRejected = (scenario === "downgrade" || scenario === "byok-downgrade" || scenario === "mixed") && body.quality === "high" && (scenario !== "mixed" || index === 0)
      || scenario.startsWith("byok-platform") && byok
      || scenario.startsWith("byok-quality-") && byok && index < 2;
    if (scenario === "byok-platform-unknown" && !byok || scenario === "byok-quality-unknown" && byok && index >= 2) {
      response.writeHead(504);response.end(JSON.stringify({error:{message:"fixture supplier outcome unknown"}}));return;
    }
    if (qualityRejected || scenario === "failure" || scenario === "partial" && index === 1 || scenario === "byok-quality-generic" && byok && index >= 2) {
      response.writeHead(400);
      response.end(JSON.stringify({ error: { message: qualityRejected ? "quality is not supported" : "fixture rejected prompt" } }));
    } else response.end(JSON.stringify({ created: 1, data: [{ b64_json: image.toString("base64") }] }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as {port: number}).port}/v1`;
  process.env.OPENAI_BASE_URL = baseUrl;
  const originalFetch=globalThis.fetch;let externalRequests=0;
  globalThis.fetch=(input,init)=>{
    const target=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
    if(target.hostname!=="127.0.0.1"){externalRequests++;throw Error("Fixture attempted non-loopback transport");}
    return originalFetch(input,init);
  };
  const db = await import("../src/lib/db");
  const repo = await import("../src/lib/image-job-repository");
  const { signUserSession } = await import("../src/lib/native-auth");
  const route = await import("../src/app/api/generate-image/route");
  const sql = db.getPool();
  let originalConfig:import("../src/lib/billing/types").ConfigSnapshot|undefined;
  let originalSettings:{k:string;v:string}[]=[];
  const wait = async (predicate: () => Promise<boolean>) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error(`Fixture timeout: ${scenario}`);
  };
  try {
    // Exercise the production schema upgrade with an existing old-name audit row.
    await sql.query(`CREATE TABLE IF NOT EXISTS app_image_cost_audit (
      id text PRIMARY KEY, job_id text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '',
      requested_quality text NOT NULL DEFAULT '', executed_quality text NOT NULL DEFAULT '',
      upstream text NOT NULL DEFAULT '', images integer NOT NULL DEFAULT 1,
      billed_beans double precision NOT NULL DEFAULT 0, cost_beans double precision NOT NULL DEFAULT 0,
      margin_beans double precision NOT NULL DEFAULT 0, reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`);
    // The script may be rerun against its own already-migrated fixture DB.
    const old = await sql.query("SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='app_image_cost_audit' AND column_name='billed_beans'");
    if (!old.rowCount) await sql.query("ALTER TABLE app_image_cost_audit RENAME billed_credits TO billed_beans; ALTER TABLE app_image_cost_audit RENAME cost_credits TO cost_beans; ALTER TABLE app_image_cost_audit RENAME margin_credits TO margin_beans");
    const legacy = `legacy-${randomUUID()}`;
    await sql.query("INSERT INTO app_image_cost_audit(id,billed_beans,cost_beans,margin_beans) VALUES($1,10,6,4)", [legacy]);
    await db.ensureSchema();
    const migrated = (await sql.query("SELECT billed_credits,cost_credits,margin_credits FROM app_image_cost_audit WHERE id=$1", [legacy])).rows[0];
    assert.deepEqual(migrated, { billed_credits: 10, cost_credits: 6, margin_credits: 4 });
    console.log("PASS old audit column migration preserves values");
    const runtime=await (await import("../src/lib/billing/server")).getBillingRuntime();
    originalConfig=await runtime.config.current();
    originalSettings=(await sql.query("SELECT k,v FROM app_settings WHERE k=ANY($1)",[["multi_user_enabled","credits_metering"]])).rows;
    const baseline=(await import("./billing-unit-fixture")).fixtureConfig();
    await runtime.config.publish({id:randomUUID(),expectedVersion:originalConfig.version,config:baseline,actor:"fixture",reason:"Isolate legacy credit regression defaults"});
    await sql.query("DELETE FROM app_settings WHERE k=ANY($1)",[["multi_user_enabled","credits_metering"]]);

    const {imageBillCredits:legacyPrice}=await import("../src/lib/billing/legacy");
    const imageBillCredits=(q:string,r="1K")=>legacyPrice(baseline,q,r);
    let fixtureIp = 0;
    const run = async (name: string, count: number, expectedCharge: number, qualities: string[], byok = false, resolution = "1K", quality = "high", headerOnly = false, customDimensions = false) => {
      scenario = name; requestCount = 0; wire.length = 0;
      const email = `credits-${randomUUID()}@example.test`;
      await db.getOrCreateUser(email, "Credits fixture");
      await db.addCreditBatch(email, 100, { source: "admin", reason: "Fixture" });
      const before = await db.getUser(email);
      if (byok) await db.upsertUserImageProviderRecord({ id: `provider-${randomUUID()}`, email,
        name: "Fixture", isActive: true, enabled: true, protocol: "openai-images",
        baseUrlEnc: baseUrl, apiKeyEnc: "fixture-byok", models: ["gpt-image-1"], defaultModel: "gpt-image-1" });
      const headers = { cookie: `nv_user=${signUserSession(email, Date.now())}`, "content-type": "application/json", "x-real-ip": `127.0.0.${++fixtureIp}`, "x-naumi-image-quality": headerOnly ? quality : "low" };
      if (name === "partial") hold = new Promise<void>(resolve => { release = resolve; });
      const submitted = await route.POST(new Request("http://fixture.test/api/generate-image", { method: "POST", headers,
        body: JSON.stringify({ prompt: name, model: byok ? "byok:gpt-image-1" : "gpt-image-1", count, quality: headerOnly ? undefined : quality, resolution: customDimensions ? "1K" : resolution, ...(customDimensions ? {targetWidth:4096,targetHeight:2048} : {}), ratio: "1:1" }) }));
      let jobId:string;
      const expectedError=["failure","byok-quality-unknown","byok-quality-generic","byok-platform-unknown"].includes(name);
      let childBeforeRecovery:unknown;
      let rootCrashRecovery=false;
      if(byok){
        // New BYOK purchases are retired. Preserve the distinct compatibility
        // contract for already accepted jobs carrying the original envelope.
        assert.equal(submitted.status,409,await submitted.clone().text());assert.equal((await submitted.json()).code,"USER_IMAGE_PROVIDER_DISABLED");assert.equal(requestCount,0);
        const {freezeUserImageProvider}=await import("../src/lib/user-image-provider"),{JOBS}=await import("../src/lib/imagegen/generation-jobs");
        jobId="legacy-byok-"+randomUUID();
        const p:GenParams={prompt:name,userPrompt:name,category:"main",ratio:"1:1",resolution,style:"",quality,qualityDefault:"medium",count,transparent:false,ratiogen:false,email,images:[],parentId:"",parentIds:[],templateId:"",templateImage:"",templatePrompt:"",origin:"generate",projectGroupId:"",model:"byok:gpt-image-1",targetWidth:0,targetHeight:0};
        const byokSnapshot=freezeUserImageProvider(email,{id:"fixture-accepted-provider",name:"Fixture accepted provider",isActive:true,protocol:"openai-images",baseUrl,apiKey:"fixture-byok",models:["gpt-image-1"],defaultModel:"gpt-image-1"});
        const {quote}=await import("../src/lib/billing/quote"),frozenQuote=quote(await runtime.config.current(),{feature:"image.generate",quantity:count,quality,resolution,modelId:p.model,metered:true,byok:true,paidFen:0,userGroup:"user"});
        assert.equal(frozenQuote.requestedCredits,0);
        await JOBS.create(jobId,email,{status:"pending",createdAt:Date.now(),quality:{requested:quality,executed:quality,fallbackReason:null}},{p,cost:0,byok:true,byokSnapshot},0,true,frozenQuote);
        if(name === "byok-platform-crash"){
          // Stop exactly after the fallback child has committed its paid bytes,
          // before the root result write. The actual lease fences that owner.
          const {legacyUserOpenAIImages}=await import("../src/lib/imagegen/generation-provider");
          const {ImageJobLeaseLostError}=await import("../src/lib/image-job-lease");
          const set=JOBS.set.bind(JOBS);let interrupted=false;
          JOBS.set=async(id,snapshot)=>{
            const root=(snapshot as typeof snapshot & {paidOperations?:Record<string,{state:string}>}).paidOperations?.[jobId];
            if(id===jobId&&root?.state==="done"){interrupted=true;throw new ImageJobLeaseLostError();}
            return set(id,snapshot);
          };
          try{
            await JOBS.kick(jobId,async()=>{
              await JOBS.paidOperation(jobId,"gpt-image-1",{id:jobId,managedGateway:false,imageCount:count,quality,resolution:resolution as "1K"|"2K"|"4K"},
                ()=>legacyUserOpenAIImages(p,{apiKey:"fixture-byok",model:"gpt-image-1",baseUrl},{apiKey:"fixture-platform",model:"gpt-image-1",cutoutModel:"gpt-image-1"}));
            });
            await wait(async()=>interrupted&&(await repo.getImageJob(jobId,"generate"))?.lease_token===null);
          }finally{JOBS.set=set;}
          const stopped=(await repo.getImageJob(jobId,"generate"))!;
          const root=(stopped.snapshot.paidOperations as Record<string,{state:string;result?:unknown;children:Record<string,{state:string;result:unknown}>}>)[jobId];
          assert.equal(stopped.snapshot.status,"pending");assert.equal(stopped.billing_settled,false);
          assert.equal(root.state,"started");assert.equal(root.result,undefined);
          assert.equal(root.children[jobId+":image:0:provider-fallback"].state,"done");
          childBeforeRecovery=root.children[jobId+":image:0:provider-fallback"].result;
          const {decodeImageJobValue}=await import("../src/lib/image-job-codec");
          const decoded=await decodeImageJobValue(childBeforeRecovery,jobId) as {b64_json:string};
          assert.ok(Buffer.from(decoded.b64_json,"base64").equals(image),"Committed fallback checkpoint must contain the original supplier bytes");
          assert.equal(wire.filter(w=>!w.byok).length,1);
          rootCrashRecovery=true;
          // The lost owner releases into the existing ten-second recovery
          // cooldown. Observe it read-only; do not erase the fence or POST-loop.
          await wait(async()=>Boolean((await sql.query("SELECT lease_until IS NULL OR lease_until<=clock_timestamp() AS due FROM app_image_jobs WHERE id=$1",[jobId])).rows[0]?.due));
        }
        const beforeResume=wire.length;
        const resumed=await route.POST(new Request("http://fixture.test",{method:"POST",headers:{"content-type":"application/json","x-video-worker-secret":process.env.VIDEO_WORKER_SECRET!},body:JSON.stringify({workerJobId:jobId})}));
        assert.equal(resumed.status,200,await resumed.clone().text());
        if(rootCrashRecovery){
          await wait(async()=>{const row=await repo.getImageJob(jobId,"generate");return row?.snapshot.status==="done"&&row.lease_token===null;});
          assert.equal(wire.length,beforeResume,"A committed fallback child must be read, never resubmitted");
        }
      }else{assert.equal(submitted.status, 200, await submitted.clone().text());jobId=(await submitted.json()).jobId;}
      if (name === "partial") {
        // The fixture must not hold the first request while waiting for a
        // second request behind the application's bounded fan-out executor.
        await wait(async () => requestCount >= 1);
        assert.equal(Number((await sql.query("SELECT reserved_cost FROM app_image_jobs WHERE id=$1", [jobId])).rows[0].reserved_cost), count * imageBillCredits(quality, resolution));
        process.env.NAUMI_MULTI_USER = "0";
        assert.equal(await db.creditMeteringEnabled(), false);
        release!(); hold = undefined;
      }
      await wait(async () => { const row = await repo.getImageJob(jobId, "generate"); return !!row && ["done", "error"].includes(String(row.snapshot.status)) && row.lease_token === null; });
      const row = (await repo.getImageJob(jobId, "generate"))!;
      assert.equal(row.billing_settled, true);
      assert.equal(row.snapshot.status, expectedError ? "error" : "done");
      const billed = await db.getImageJobChargedCredits(jobId);
      assert.equal(billed, expectedCharge);
      assert.equal(Number((await sql.query("SELECT count(*) AS n FROM app_gen_reservations WHERE job_id=$1", [jobId])).rows[0].n), 0);
      const after = await db.getUser(email);
      assert.equal(after!.creditsTotal, before!.creditsTotal - expectedCharge);
      assert.equal(after!.creditsUsed, 0);
      if (name === "partial") process.env.NAUMI_MULTI_USER = "1";
      const audits = (await sql.query("SELECT * FROM app_image_cost_audit WHERE job_id=$1 ORDER BY id", [jobId])).rows;
      assert.equal(audits.length, qualities.length);
      assert.deepEqual(audits.map(a => a.executed_quality).sort(), [...qualities].sort());
      assert.equal(audits.reduce((n, a) => n + a.billed_credits, 0), expectedCharge);
      const cost = byok && !name.startsWith("byok-platform") ? 0 : qualities.reduce((n, q) => n + imageBillCredits(q, resolution), 0);
      assert.equal(audits.reduce((n, a) => n + a.cost_credits, 0), cost);
      assert.equal(audits.reduce((n, a) => n + a.margin_credits, 0), expectedCharge - cost);
      if (!expectedError) {
        assert.equal(row.snapshot.creditsUsed, expectedCharge);
        const response = await route.GET(new Request(`http://fixture.test/api/generate-image?job=${jobId}`, { headers }));
        const body = await response.json();
        assert.equal(body.creditsUsed, expectedCharge);
        assert.ok(body.images.every((im: Record<string, unknown>) => !("execution" in im)), "Internal cost metadata must stay private");
        if (name === "mixed") assert.equal((row.snapshot.quality as {executed:string}).executed, "mixed");
      }
      if (name.startsWith("byok-platform")&&!expectedError) {
        assert.ok(audits.every(a => a.reason === "provider-fallback"));assert.ok(wire.some(w => !w.byok && w.quality === "medium"));
        const roots=row.snapshot.paidOperations as Record<string,{state:string;children:Record<string,{state:string;failureReason?:string;result?:unknown}>}>;
        assert.deepEqual(Object.keys(roots),[jobId],"Fallback shares the original delivery and settlement root");
        assert.equal(roots[jobId].state,"done");
        for(let i=0;i<count;i++){
          assert.equal(roots[jobId].children[`${jobId}:image:${i}`].state,"rejected");
          assert.equal(roots[jobId].children[`${jobId}:image:${i}`].failureReason,"quality-unsupported");
          assert.equal(roots[jobId].children[`${jobId}:image:${i}:provider-fallback`].state,"done");
        }
        const images=row.snapshot.images as {id:string;url:string}[];
        assert.equal(images.length,count);assert.equal(new Set(images.map(im=>im.id)).size,count);
        if(rootCrashRecovery){
          assert.deepEqual(roots[jobId].children[jobId+":image:0:provider-fallback"].result,childBeforeRecovery);
          const {readManagedObject}=await import("../src/lib/object-storage/managed-read");
          assert.ok((await readManagedObject(images[0].url,2*1024*1024)).bytes.equals(image),"Recovered original supplier bytes must reach the delivered image");
          console.log("PASS fallback child crash: paid bytes committed, root absent, fresh lease delivers identical bytes; extra supplier POST=0");
        }
      }
      if(name.startsWith("byok-quality-"))assert.equal(wire.filter(w=>!w.byok).length,0,"A quality rejection does not authorize fallback for a different rejected or UNKNOWN sibling");
      if(name==="byok-platform-unknown")assert.equal(wire.filter(w=>!w.byok).length,1);
      if(name.endsWith("unknown")){
        assert.equal(row.snapshot.customerBilling,"released");assert.equal(row.snapshot.supplierCostStatus,"pending");
        const root=(row.snapshot.paidOperations as Record<string,{state:string;children:Record<string,{state:string;failureStatus?:number}>}>)[jobId];
        assert.equal(root.state,"started");
        const child=root.children[name==="byok-platform-unknown"?`${jobId}:image:0:provider-fallback`:`${jobId}:image:1`];
        assert.equal(child.state,"started");assert.equal(child.failureStatus,undefined);
        const reconciliation=(await sql.query("SELECT proof,result,charge FROM app_billing_reconciliations WHERE operation_id=$1 AND actor='system:image-job'",[jobId])).rows[0];
        assert.equal(JSON.parse(reconciliation.proof).supplierOutcome,"unknown");assert.equal(reconciliation.result.supplierCost,"pending");assert.equal(reconciliation.charge,0);
      }
      if(byok&&expectedError){
        const beforeKick=wire.length;
        const again=await route.POST(new Request("http://fixture.test",{method:"POST",headers:{"content-type":"application/json","x-video-worker-secret":process.env.VIDEO_WORKER_SECRET!},body:JSON.stringify({workerJobId:jobId})}));
        assert.equal(again.status,200);assert.equal(wire.length,beforeKick,"Original terminal worker re-entry must not POST again");
      }
      // Crash after committed settlement/checkpoint but before final status: resume twice.
      if (name === "downgrade" || name === "byok-platform") {
        const wireBefore = wire.length;
        await sql.query("UPDATE app_image_jobs SET snapshot=snapshot || '{\"status\":\"pending\",\"paidOperationVersion\":1}',lease_until=NULL WHERE id=$1", [jobId]);
        process.env.OPENAI_IMAGE_QUALITY = "low";
        process.env.NAUMI_IMAGE_QUALITY_SUPPORTED = "0";
        const kick = () => route.POST(new Request("http://fixture.test", { method: "POST", headers: { "content-type": "application/json", "x-video-worker-secret": process.env.VIDEO_WORKER_SECRET! }, body: JSON.stringify({ workerJobId: jobId }) }));
        await kick(); await kick();
        await wait(async () => { const job = await repo.getImageJob(jobId, "generate"); return job?.snapshot.status === "done" && job.lease_token === null; });
        assert.equal(wire.length, wireBefore, "Checkpoint recovery must not call supplier again");
        assert.equal(await db.getImageJobChargedCredits(jobId), expectedCharge);
        assert.equal(Number((await sql.query("SELECT count(*) AS n FROM app_image_cost_audit WHERE job_id=$1", [jobId])).rows[0].n), qualities.length);
        const replayed = (await repo.getImageJob(jobId, "generate"))!;
        assert.deepEqual((replayed.snapshot.quality as {executedQualities:string[]}).executedQualities.sort(), [...qualities].sort());
        process.env.OPENAI_IMAGE_QUALITY = "medium"; process.env.NAUMI_IMAGE_QUALITY_SUPPORTED = "1";
      }
      console.log(`PASS ${name}: committed charge=${expectedCharge}, audit=${audits.length}, supplier cost estimate=${cost}`);
      observations.push({scenario:name,images:qualities.length,customerCredits:expectedCharge,supplierPosts:wire.length,platformPosts:wire.filter(w=>!w.byok).length,rootCrashRecovery});
    };
    await run("success", 2, 20, ["high", "high"]);
    await run("partial", 2, 10, ["high"]);
    await run("failure", 2, 0, []);
    await run("downgrade", 1, 10, ["medium"]);
    await run("mixed", 2, 20, ["medium", "high"]);
    await run("byok-downgrade", 1, 0, ["medium"], true);
    await run("byok-platform", 1, 0, ["medium"], true);
    await run("byok-platform-multi", 2, 0, ["medium","medium"], true);
    await run("byok-platform-crash", 1, 0, ["medium"], true);
    await run("byok-quality-unknown", 2, 0, [], true);
    await run("byok-quality-generic", 2, 0, [], true);
    await run("byok-platform-unknown", 1, 0, [], true);
    for (const resolution of ["1K", "2K", "4K", "5K"]) {
      for (const quality of ["low", "medium", "high", "xhigh", "max"]) {
        await run(`tariff-${quality}-${resolution}`, 1, imageBillCredits(quality, resolution), [quality], false, resolution, quality, true);
      }
    }
    await run("partial", 2, 16, ["high"], false, "4K");
    await run("downgrade", 1, 16, ["medium"], false, "4K");
    await run("byok-downgrade", 1, 0, ["medium"], true, "4K");
    await run("custom-dimensions", 1, 12, ["medium"], false, "4K", "medium", true, true);
    // Metering is frozen on submission; disable it for the next public request.
    process.env.NAUMI_MULTI_USER = "0";
    await db.setSetting("multi_user_enabled", "0");
    await db.setSetting("credits_metering", "0");
    assert.equal(await db.creditMeteringEnabled(), false);
    await run("meter-off", 1, 0, ["high"]);
    assert.equal(externalRequests,0);
    await writeFile(path.join(evidence,"RESULT.json"),JSON.stringify({status:"PASS",scriptSha256,observations,externalRequests},null,2)+"\n");
    console.log("CREDIT_BILLING_RESULT=PASS");
  } catch(error){await writeFile(path.join(evidence,"FAILURE.json"),JSON.stringify({status:"FAIL",scriptSha256,scenario,completed:observations,error:error instanceof Error?error.name:"Error"},null,2)+"\n");throw error;}
  finally { release?.();
    if(originalConfig){const runtime=await (await import("../src/lib/billing/server")).getBillingRuntime(),current=await runtime.config.current();await runtime.config.publish({id:randomUUID(),expectedVersion:current.version,config:originalConfig.config,actor:"fixture",reason:"Restore credit regression configuration"});await sql.query("DELETE FROM app_settings WHERE k=ANY($1)",[["multi_user_enabled","credits_metering"]]);for(const row of originalSettings)await sql.query("INSERT INTO app_settings(k,v) VALUES($1,$2)",[row.k,row.v]);}
    await (await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();
    globalThis.fetch=originalFetch;
    await sql.end(); await new Promise<void>(resolve => server.close(() => resolve()));
    assert.equal(path.dirname(media),path.resolve("output/credits-handoff"));assert.match(path.basename(media),/^media-[a-f0-9-]{36}$/);
    await rm(media,{recursive:true,force:true}); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
