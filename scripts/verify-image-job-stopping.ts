import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import sharp from "sharp";

async function main() {
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw new Error("Requires isolated local PostgreSQL");
  Object.assign(process.env, { NAUMI_MULTI_USER: "1", SETTINGS_SECRET: "fixture-stopping-secret-0123456789abcdef0123456789", VIDEO_WORKER_SECRET: "fixture-stopping-worker-0123456789abcdef0123456789", STORAGE_DRIVER: "local", MEDIA_DIR: path.resolve("output/image-pending-release-20261008/test-media"), OPENAI_API_KEY: "fixture-stopping-key", OPENAI_IMAGE_MODEL: "gpt-image-2", NAUMI_IMAGE_QUALITY_SUPPORTED: "1", NAUMI_ROUTER_MANAGEMENT_URL: "" });
  const pixels = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "white" } }).png().toBuffer();
  let wire = 0, mode = "disconnect";
  const mock = createServer(async (req, res) => {
    for await (const _ of req) {} wire++;
    if (mode === "disconnect" || mode === "mixed" && wire % 2 === 0) { req.socket.destroy(); return; }
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ data: [{ b64_json: pixels.toString("base64") }] }));
  });
  await new Promise<void>(r => mock.listen(0, "127.0.0.1", r));
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(mock.address() as {port:number}).port}/v1`;
  const { createBillingFixture } = await import("./billing-fixture"), f = await createBillingFixture();
  const db = await import("../src/lib/db"), repo = await import("../src/lib/image-job-repository");
  const { DurableImageJobs } = await import("../src/lib/durable-image-jobs");
  const { ImageOperationPending } = await import("../src/lib/image-gateway");
  const { quote } = await import("../src/lib/billing/quote"), { facts } = await import("./billing-unit-fixture");
  const { getBillingRuntime } = await import("../src/lib/billing/server"), { signUserSession } = await import("../src/lib/native-auth");
  const route = await import("../src/app/api/generate-image/route"), poll = await import("../src/lib/image-job-failure");
  const email = await f.user(200), snapshot = await (await getBillingRuntime()).config.current();
  const jobs = new DurableImageJobs<any>("generate"), cookie = `nv_user=${signUserSession(email,Date.now())}`;
  const make = async (options: {old?:boolean;result?:boolean;replay?:boolean;kind?:"generate"|"suite"|"aplus"}={}) => {
    const id=`stopping-${randomUUID()}`, q=quote(snapshot,facts({feature:"image.generate",quantity:1,quality:"medium"}));
    const kind=options.kind||"generate";
    await repo.createImageJob(id,email,kind,{status:"pending",error:"fixture unknown",...(!options.old?{paidOperationVersion:1,paidOperations:{[id]:{state:"started",model:"gpt-image-2",replayable:!!options.replay,...(options.result?{state:"done",result:{url:"/media/fixture.png"}}:{})}}}:{})},{},q.requestedCredits,true,q);
    return {id,q,kind};
  };
  const row = async(id:string)=>(await f.pool.query("SELECT * FROM app_image_jobs WHERE id=$1",[id])).rows[0];
  try {
    const keep=await make({replay:true});
    const x=await make();
    await f.pool.query("UPDATE app_billing_operations SET state='hold' WHERE id=$1",[x.id]);
    await jobs.handlePending(x.id,new ImageOperationPending(x.id,new Error("fixture")));
    assert.equal((await row(x.id)).snapshot.status,"error"); assert.equal((await row(x.id)).billing_settled,true);
    assert.equal((await f.pool.query("SELECT state,reserved_credits,charged_credits FROM app_billing_operations WHERE id=$1",[x.id])).rows[0].state,"released");
    assert.equal(Number((await f.pool.query("SELECT credits_used FROM app_users WHERE email=$1",[email])).rows[0].credits_used),keep.q.reserveCredits);
    assert.equal((await row(x.id)).snapshot.paidOperations[x.id].state,"started");
    assert.equal((await row(x.id)).snapshot.supplierCostStatus,"pending");
    await Promise.all(Array.from({length:8},()=>repo.failUndeliveredImageJob(x.id,null,"repeat")));
    assert.equal(Number((await f.pool.query("SELECT count(*) n FROM app_billing_reconciliations WHERE operation_id=$1",[x.id])).rows[0].n),1);
    console.log("PASS direct unknown stops, only own reservation released, supplier unknown preserved, 8 concurrent repeats idempotent");
    await jobs.handlePending(keep.id,new ImageOperationPending(keep.id,new Error("fixture")));assert.equal((await row(keep.id)).snapshot.status,"pending");
    const partial=await make({result:true});
    await f.pool.query("UPDATE app_image_jobs SET snapshot=snapshot || $2::jsonb WHERE id=$1",[partial.id,JSON.stringify({paidOperations:{one:{state:"done",result:{url:"/media/fixture.png"}},two:{state:"started",replayable:false}}})]);
    await jobs.handlePending(partial.id,new ImageOperationPending(partial.id,new Error("fixture")));
    assert.equal((await row(partial.id)).snapshot.status,"needs_attention");assert.equal((await row(partial.id)).billing_settled,false);
    assert.equal(poll.imageJobPollState("needs_attention"),"error");
    const attentionResponse=await route.GET(new Request(`http://fixture/api/generate-image?job=${partial.id}`,{headers:{cookie}}));assert.equal((await attentionResponse.json()).status,"error");
    assert.equal((await route.GET(new Request(`http://fixture/api/generate-image?job=${partial.id}`))).status,403);
    assert.ok(!(await jobs.active(email)).some(j=>j.id===partial.id));
    console.log("PASS replayable stays recoverable, partial paid result preserved, attention stops poll/active resume, unauthorized gets 403");
    for(const kind of ["suite","aplus"] as const){const j=await make({kind});await new DurableImageJobs<any>(kind).handlePending(j.id,new ImageOperationPending(j.id,null));assert.equal((await row(j.id)).snapshot.status,"error");}
    const old=await make({old:true});await jobs.kick(old.id,async()=>{throw new Error("legacy must not submit")});
    for(let i=0;i<100 && !(await row(old.id)).billing_settled;i++)await new Promise(r=>setTimeout(r,20));assert.equal((await row(old.id)).snapshot.status,"error");
    const leased=await make(); const claim=await repo.claimImageJob(leased.id,"generate"); await assert.rejects(()=>repo.failUndeliveredImageJob(leased.id,null,"invalid-token"),/执行权/);
    assert.equal(await repo.failUndeliveredImageJob(leased.id,claim!.lease_token,"valid-token"),true);
    const legacy=`legacy-${randomUUID()}`; await repo.createImageJob(legacy,email,"generate",{status:"pending"},{},7,true); await repo.failUndeliveredImageJob(legacy,null,"legacy-test"); assert.equal((await row(legacy)).snapshot.creditsReleased,7);
    console.log("PASS suite/aplus use same stop, old snapshots never submit, lease fence enforced, legacy reservation release");
    const body=JSON.stringify({prompt:"fixture disconnect",model:"gpt-image-2",quality:"medium",resolution:"1K",ratio:"1:1",count:1});
    const response=await route.POST(new Request("http://fixture/api/generate-image",{method:"POST",headers:{cookie,"content-type":"application/json","x-real-ip":"127.0.0.241"},body}));
    assert.equal(response.status,200,await response.clone().text());const {jobId}=await response.json();
    for(let i=0;i<150 && (await row(jobId)).snapshot.status==="pending";i++)await new Promise(r=>setTimeout(r,20));
    assert.equal((await row(jobId)).snapshot.status,"error");assert.equal(wire,1);
    assert.equal((await f.pool.query("SELECT state FROM app_supplier_calls WHERE operation_id=$1",[jobId])).rows[0].state,"unknown");
    await jobs.kick(jobId,async()=>{throw new Error("must not restart")});assert.equal(wire,1);
    const get=await route.GET(new Request(`http://fixture/api/generate-image?job=${jobId}`,{headers:{cookie}}));const customer=await get.json();assert.equal(customer.status,"error");assert.ok(customer.user);assert.equal(customer.user.creditsUsed,Number((await f.pool.query("SELECT credits_used FROM app_users WHERE email=$1",[email])).rows[0].credits_used));
    console.log("PASS real route against local disconnected HTTP: terminal error, no second submission, wallet released, cost still unknown");
    mode="success";
    const success=await route.POST(new Request("http://fixture/api/generate-image",{method:"POST",headers:{cookie,"content-type":"application/json","x-real-ip":"127.0.0.242"},body:JSON.stringify({...JSON.parse(body),prompt:"fixture normal image"})}));assert.equal(success.status,200,await success.clone().text());const ok=await success.json();
    for(let i=0;i<150 && (await row(ok.jobId)).snapshot.status==="pending";i++)await new Promise(r=>setTimeout(r,25));
    assert.equal((await row(ok.jobId)).snapshot.status,"done");const charged=await db.getImageJobChargedCredits(ok.jobId);assert.ok(charged>0);
    assert.equal(await repo.failUndeliveredImageJob(ok.jobId,null,"late-refund"),false);assert.equal(await db.getImageJobChargedCredits(ok.jobId),charged);
    console.log("PASS normal generation and fixed price unchanged, settled success protected from late refund");
    mode="mixed"; wire=0;
    const partialRequest=await route.POST(new Request("http://fixture/api/generate-image",{method:"POST",headers:{cookie,"content-type":"application/json","x-real-ip":"127.0.0.243"},body:JSON.stringify({...JSON.parse(body),prompt:"fixture partial success",count:2})}));
    assert.equal(partialRequest.status,200,await partialRequest.clone().text());const pj=await partialRequest.json();
    for(let i=0;i<150 && (await row(pj.jobId)).snapshot.status==="pending";i++)await new Promise(r=>setTimeout(r,25));
    assert.equal((await row(pj.jobId)).snapshot.status,"done");assert.equal((await row(pj.jobId)).snapshot.images.length,1);assert.equal(wire,2);
    assert.equal(await db.getImageJobChargedCredits(pj.jobId),charged);
    assert.equal((await f.pool.query("SELECT count(*)::int n FROM app_supplier_calls WHERE operation_id=$1 AND state='unknown'",[pj.jobId])).rows[0].n,1);
    console.log("PASS native batch partial success delivers saved image, charges only delivered unit, unknown supplier cost retained without retry");
    console.log("IMAGE_JOB_STOPPING_RESULT=PASS LIVE_PAID_CALLS=0");
  } finally {
    await f.pool.query("DELETE FROM app_supplier_call_outputs WHERE call_id IN(SELECT id FROM app_supplier_calls WHERE user_email=$1)",[email]);
    await f.pool.query("DELETE FROM app_supplier_calls WHERE user_email=$1",[email]);
    await f.close(); await new Promise<void>(r=>mock.close(()=>r()));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
