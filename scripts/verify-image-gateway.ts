import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import type { ImageJobKind, ImageJobRow } from "../src/lib/image-job-repository";

async function main() {
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || !process.env.DATABASE_URL?.includes("127.0.0.1")) throw new Error("需要独立本地测试数据库");
  process.env.NAUMI_MULTI_USER = "1";
  process.env.SETTINGS_SECRET = "fixture-settings-0123456789abcdef0123456789abcdef0123456789";
  process.env.VIDEO_WORKER_SECRET = "fixture-worker-0123456789abcdef0123456789abcdef0123456789";
  process.env.STORAGE_DRIVER = "local";
  process.env.MEDIA_DIR = path.resolve("output/gateway-fix-20261002/media");
  process.env.OPENAI_API_KEY = "local-fixture-key";
  process.env.OPENAI_IMAGE_MODEL = "naumi-image-auto";
  process.env.OPENAI_IMAGE_MODELS = "naumi-image-auto";
  process.env.OPENAI_IMAGE_QUALITY = "medium";
  const image = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "white" } }).png().toBuffer();
  const operations = new Map<string, string>();
  const wire: { id: string; quality: string; multipart: boolean; options: any }[] = [];
  let holdSecond = true;
  const server = createServer(async (request, response) => {
    try {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const multipart = String(request.headers["content-type"]).startsWith("multipart/");
      let options: any, quality: string, canonical: string;
      if (multipart) {
        const form = await new Request("http://fixture.test", { method: "POST", headers: { "content-type": String(request.headers["content-type"]) }, body }).formData();
        options = JSON.parse(String(form.get("extra_fields"))).naumi;
        assert.ok(form.get("image") || form.get("image[]"));
        quality = String(form.get("quality"));
        canonical = JSON.stringify([form.get("model"),form.get("prompt"),form.get("size"),quality,options]);
      } else {
        const parsed = JSON.parse(body.toString()); options = parsed.extra_fields.naumi; quality = parsed.quality;
        canonical = JSON.stringify(parsed);
      }
      assert.ok(options.operation_id); assert.ok(options.resolution);
      const prior = operations.get(options.operation_id);
      if (prior) assert.equal(canonical, prior, "recovery changed a bound paid request");
      else operations.set(options.operation_id, canonical);
      wire.push({ id: options.operation_id, quality, multipart, options });
      response.setHeader("content-type", "application/json");
      if (holdSecond && options.operation_id.endsWith(":image:1")) {
        response.writeHead(504); response.end(JSON.stringify({error:{message:"provider outcome pending",code:"provider_outcome_unknown"}})); return;
      }
      response.end(JSON.stringify({ created: 1, data: [{ b64_json: image.toString("base64") }] }));
    } catch (error) { response.writeHead(422); response.end(JSON.stringify({error:{message:String(error)}})); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
  const db = await import("../src/lib/db");
  const repo = await import("../src/lib/image-job-repository");
  const { DurableImageJobs } = await import("../src/lib/durable-image-jobs");
  const { signUserSession } = await import("../src/lib/native-auth");
  const generate = await import("../src/app/api/generate-image/route");
  const suite = await import("../src/app/api/suite/route");
  const aplus = await import("../src/app/api/aplus/route");
  const stamp = randomUUID(), email = `gateway-${stamp}@example.test`;
  const sql = db.getPool();
  try {
    await db.getOrCreateUser(email, "Gateway fixture");
    await db.addCreditBatch(email, 100, { source: "admin", reason: "Fixture" });
    const headers = { cookie: `nv_user=${signUserSession(email, Date.now())}`, "content-type": "application/json" };
    const submitted = await generate.POST(new Request("http://fixture.test/api/generate-image", { method: "POST", headers, body: JSON.stringify({prompt:"fixture product",model:"naumi-image-auto",count:2,quality:"",resolution:"1K",ratio:"1:1"}) }));
    assert.equal(submitted.status, 200, await submitted.clone().text());
    const { jobId } = await submitted.json();
    const waitJob = async (id:string, kind:ImageJobKind, predicate:(row:ImageJobRow)=>boolean) => {
      const deadline=Date.now()+20000;
      while (Date.now()<deadline) {
        const row=await repo.getImageJob(id,kind);
        if(row && predicate(row)) return row;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Error(`fixture timeout ${kind}`);
    }
    const pending = await waitJob(jobId,"generate",row=>!!row.snapshot.error && row.lease_token===null);
    assert.equal(pending.snapshot.status,"pending"); assert.equal(pending.billing_settled,false);
    assert.equal(operations.size,2);
    holdSecond=false; process.env.OPENAI_IMAGE_QUALITY="high";
    const kick=async(route:{POST:(request:Request)=>Promise<Response>},id:string)=> {
      await sql.query("UPDATE app_image_jobs SET lease_until=NULL WHERE id=$1",[id]);
      const result=await route.POST(new Request("http://fixture.test",{method:"POST",headers:{"content-type":"application/json","x-video-worker-secret":process.env.VIDEO_WORKER_SECRET!},body:JSON.stringify({workerJobId:id})}));
      assert.equal(result.status,200,await result.clone().text());
    };
    await kick(generate,jobId);
    const done=await waitJob(jobId,"generate",row=>row.snapshot.status==="done" && row.lease_token===null);
    assert.ok(Array.isArray(done.snapshot.images)); assert.equal(done.snapshot.images.length,2); assert.equal(done.snapshot.creditsUsed,12); assert.equal(operations.size,2);
    assert.ok(wire.every(request=>request.quality==="medium"));
    console.log("PASS generation: stable per-image IDs, uncertain outcome stays pending, frozen quality, recovery and one credit settlement");
    const shot=(id:string)=>({id,label:"Fixture",role:"main",ratio:"1:1",prompt:"fixture label",status:"pending",gradient:""});
    const suiteId=`suite-${stamp}`;
    await new DurableImageJobs<any>("suite").create(suiteId,email,{status:"pending",shots:[shot(`${suiteId}:shot:0`)],done:0,total:1,createdAt:Date.now(),imageQuality:"medium"},{images:[{buf:image,type:"image/png"}],extra:"",platform:"taobao",email,model:"naumi-image-auto",cost:6,requested:[],textModel:"fixture"},6,true);
    await kick(suite,suiteId); await waitJob(suiteId,"suite",row=>row.snapshot.status==="done" && row.lease_token===null);
    const aplusId=`aplus-${stamp}`;
    await new DurableImageJobs<any>("aplus").create(aplusId,email,{status:"pending",stage:"generating",sources:[{id:`${aplusId}:source`,status:"approved",version:1}],sourceInputs:[{buf:image,type:"image/png"}],sourceBuffers:[image],sourceHistory:[[]],shots:[shot(`${aplusId}:shot:0`)],done:0,total:1,extra:"",platform:"amazon",lang:"zh",format:"1:1",modules:["main"],email,model:"naumi-image-auto",imageQuality:"medium",textModel:"fixture",useDb:true,cost:6,generationStarted:true,reserved:true,parentId:"",parentIds:[],origin:"",createdAt:Date.now()},{},6,true);
    await kick(aplus,aplusId); await waitJob(aplusId,"aplus",row=>row.snapshot.status==="done" && row.lease_token===null);
    const edits=wire.filter(request=>request.multipart);
    assert.equal(edits.length,2); assert.ok(edits.every(request=>request.options.preserve_identity && request.options.task==="layout" && request.options.text_accuracy==="required" && request.quality==="medium"));
    const totals=await sql.query("SELECT sum(delta)::int AS charged,count(*)::int AS entries FROM app_ledger WHERE email=$1 AND kind='consume'",[email]);
    assert.equal(totals.rows[0].charged,-24); assert.equal(totals.rows[0].entries,3);
    console.log("PASS suite/A+: actual multipart fields, stable shot IDs, capabilities and independent credit settlements");
    for (const [kind, tier, charge, originalId, route] of [
      ["suite", "xhigh", 14, suiteId, suite], ["aplus", "max", 18, aplusId, aplus],
    ] as const) {
      const original = (await repo.getImageJob(originalId, kind))!;
      const id = `${kind}-quality-${stamp}`;
      const quality = {requested:tier,executed:tier,fallbackReason:null};
      const snapshot = {...original.snapshot,status:"pending",shots:[shot(`${id}:shot:0`)],done:0,total:1,
        cost:charge,imageQuality:tier,quality,renderingFinished:false};
      await new DurableImageJobs<any>(kind).create(id,email,snapshot,{...original.payload,cost:charge},charge,true);
      const callsBefore=wire.length;
      await kick(route,id);
      const completed=await waitJob(id,kind,row=>row.snapshot.status==="done" && row.lease_token===null);
      assert.equal(completed.snapshot.creditsUsed,charge);
      assert.equal(await db.getImageJobChargedCredits(id),charge);
      assert.equal(wire.length,callsBefore+1);
      assert.equal(wire.at(-1)?.quality,tier);
      assert.ok(wire.at(-1)?.id.endsWith(`:quality:${tier}`));
      const audit=(await sql.query("SELECT requested_quality,executed_quality,billed_credits FROM app_image_cost_audit WHERE job_id=$1",[id])).rows;
      assert.deepEqual(audit,[{requested_quality:tier,executed_quality:tier,billed_credits:charge}]);
      await kick(route,id);assert.equal(wire.length,callsBefore+1);assert.equal(await db.getImageJobChargedCredits(id),charge);
    }
    console.log("PASS suite/A+: selected quality reaches supplier, original quote and ledger audit survive replay");
    const { ImageOperationPending } = await import("../src/lib/image-gateway");
    const guardJobs = new DurableImageJobs<any>("generate");
    const guardId = `guard-${stamp}`;
    await guardJobs.create(guardId,email,{status:"pending"},{},0,false);
    let paidCalls=0;
    await assert.rejects(guardJobs.paidOperation(guardId,"legacy-model",{id:guardId},async()=>{paidCalls++;throw new Error("connection lost");}),ImageOperationPending);
    await assert.rejects(guardJobs.paidOperation(guardId,"naumi-image-auto",{id:guardId},async()=>{paidCalls++;return "unexpected";}),ImageOperationPending);
    assert.equal(paidCalls,1);
    const byokId=`${guardId}:byok`;
    await assert.rejects(guardJobs.paidOperation(guardId,"naumi-image-auto",{id:byokId,managedGateway:false},async()=>{throw new Error("BYOK connection lost");}),ImageOperationPending);
    await assert.rejects(guardJobs.paidOperation(guardId,"naumi-image-auto",{id:byokId},async()=>{throw new Error("must not submit");}),ImageOperationPending);
    const resultId=`${guardId}:success`;
    const value=await guardJobs.paidOperation(guardId,"legacy-model",{id:resultId},async()=>{paidCalls++;return image;});
    const cached=await new DurableImageJobs<any>("generate").paidOperation(guardId,"legacy-model",{id:resultId},async()=>{paidCalls++;return Buffer.from("unexpected");});
    assert.deepEqual(cached,value); assert.equal(paidCalls,2);
    const canvasDb=await import("../src/lib/db");
    const {processCanvasImageTask,publicCanvasImageTask}=await import("../src/lib/canvas-image-tasks");
    const artId=`canvas-source-${stamp}`,canvasId=`canvas-task-${stamp}`;
    await canvasDb.addArtworks(email,[{id:artId,title:"fixture",category:"fixture",prompt:"",status:"completed",image:`data:image/png;base64,${image.toString("base64")}`,gradient:""}]);
    await canvasDb.createCanvasImageTaskWithReservation({id:canvasId,email,sourceArtworkId:artId,parameters:{paidOperationVersion:1,artworkId:artId,oldText:"old",newText:"new",box:{x:10,y:10,width:100,height:100}},cost:0,metered:false});
    await sql.query("UPDATE app_canvas_image_tasks SET status='processing' WHERE id=$1",[canvasId]);
    assert.equal(await canvasDb.beginCanvasImageTaskSubmission(canvasId),true);
    assert.equal(await canvasDb.beginCanvasImageTaskSubmission(canvasId),false);
    const before=wire.length;
    await processCanvasImageTask((await canvasDb.getCanvasImageTask(email,canvasId))!);
    assert.equal((await canvasDb.getCanvasImageTask(email,canvasId))?.status,"needs_attention");
    assert.equal(wire.length,before);
    const publicTask=publicCanvasImageTask((await canvasDb.getCanvasImageTask(email,canvasId))!);
    assert.equal("upstreamStarted" in publicTask.parameters,false);
    assert.equal("upstreamResult" in publicTask.parameters,false);
    console.log("PASS paid-operation guard: unknown legacy submission survives configuration change, saved result replays without POST, canvas crash pauses for reconciliation");
    const legacyId=`legacy-${stamp}`;
    await guardJobs.create(legacyId,email,{status:"pending"},{},0,false);
    await sql.query("UPDATE app_image_jobs SET snapshot=snapshot-'paidOperationVersion' WHERE id=$1",[legacyId]);
    let legacyRan=false;
    await guardJobs.kick(legacyId,async()=>{legacyRan=true;});
    await waitJob(legacyId,"generate",row=>!!row.snapshot.error && row.lease_token===null);
    assert.equal(legacyRan,false);
    console.log("PASS upgrade: pre-ledger pending jobs cannot be automatically resubmitted");
    console.log("IMAGE_GATEWAY_RESULT=PASS");
  } finally { await sql.end(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
