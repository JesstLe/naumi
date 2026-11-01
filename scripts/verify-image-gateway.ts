import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID,createHash } from "node:crypto";
import path from "node:path";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import sharp from "sharp";
import type { ImageJobKind, ImageJobRow } from "../src/lib/image-job-repository";

async function main() {
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw new Error("需要独立本地测试数据库");
  process.env.NAUMI_MULTI_USER = "1";
  process.env.SETTINGS_SECRET = "fixture-settings-0123456789abcdef0123456789abcdef0123456789";
  process.env.VIDEO_WORKER_SECRET = "fixture-worker-0123456789abcdef0123456789abcdef0123456789";
  process.env.STORAGE_DRIVER = "local";
  process.env.MEDIA_DIR = path.resolve("output/gateway-fix-20261002/media");
  process.env.OPENAI_API_KEY = "local-fixture-key";
  process.env.OPENAI_IMAGE_MODEL = "naumi-image-auto";
  process.env.OPENAI_IMAGE_MODELS = "naumi-image-auto";
  process.env.OPENAI_IMAGE_QUALITY = "medium";
  process.env.NAUMI_IMAGE_QUALITY_SUPPORTED = "1";
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
  const evidence=path.resolve(process.env.GATEWAY_VERIFY_EVIDENCE||"output/image-gateway-regression");await mkdir(evidence,{recursive:true});
  const observations:Record<string,unknown>={source:process.env.GITHUB_SHA||null,verifierSha256:createHash("sha256").update(await readFile(process.argv[1])).digest("hex"),externalSupplierRequests:0};
  try {
    await db.getOrCreateUser(email, "Gateway fixture");
    await db.addCreditBatch(email, 100, { source: "admin", reason: "Fixture" });
    const headers = { cookie: `nv_user=${signUserSession(email, Date.now())}`, "content-type": "application/json" };
    const submitted = await generate.POST(new Request("http://fixture.test/api/generate-image", { method: "POST", headers, body: JSON.stringify({prompt:"fixture product",model:"naumi-image-auto",count:2,quality:"",resolution:"1K",ratio:"1:1"}) }));
    assert.equal(submitted.status, 200, await submitted.clone().text());
    const { jobId } = await submitted.json();
    const waitJob = async (id:string, kind:ImageJobKind, predicate:(row:ImageJobRow)=>boolean) => {
      const deadline=Date.now()+Math.min(300000,Math.max(20000,Number(process.env.NAUMI_VERIFY_TIMEOUT_MS)||20000));
      while (Date.now()<deadline) {
        const row=await repo.getImageJob(id,kind);
        if(row && predicate(row)) return row;
        if(row?.snapshot.status==="error")throw new Error(`fixture terminal ${kind}: ${row.snapshot.error}`);
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Error(`fixture timeout ${kind}`);
    }
    const unavailable = await waitJob(jobId,"generate",row=>!!row.snapshot.error && row.lease_token===null);
    // Current customer policy ends an undelivered wait and releases only its
    // reservation. It never proves that the supplier did not charge or lets a
    // worker replay the old purchase. Do not restore obsolete indefinite holds.
    assert.equal(unavailable.snapshot.status,"error");assert.equal(unavailable.billing_settled,true);
    assert.equal(unavailable.snapshot.customerBilling,"released");assert.equal(unavailable.snapshot.supplierCostStatus,"pending");
    assert.equal((unavailable.snapshot.paidOperations as Record<string,{state:string}>)[jobId].state,"started");
    assert.equal((await sql.query("SELECT count(*)::int n FROM app_gen_reservations WHERE job_id=$1",[jobId])).rows[0].n,0);
    assert.equal((await sql.query("SELECT count(*)::int n FROM app_ledger WHERE email=$1 AND kind='consume'",[email])).rows[0].n,0);
    const release=(await sql.query("SELECT proof,result,charge FROM app_billing_reconciliations WHERE operation_id=$1 AND actor='system:image-job'",[jobId])).rows[0];
    assert.equal(JSON.parse(release.proof).supplierOutcome,"unknown");assert.equal(release.result.supplierCost,"pending");assert.equal(release.charge,0);
    assert.equal(operations.size,2);
    holdSecond=false; process.env.OPENAI_IMAGE_QUALITY="high";
    const kick=async(route:{POST:(request:Request)=>Promise<Response>},id:string)=> {
      await sql.query("UPDATE app_image_jobs SET lease_until=NULL WHERE id=$1",[id]);
      const result=await route.POST(new Request("http://fixture.test",{method:"POST",headers:{"content-type":"application/json","x-video-worker-secret":process.env.VIDEO_WORKER_SECRET!},body:JSON.stringify({workerJobId:id})}));
      assert.equal(result.status,200,await result.clone().text());
    };
    await kick(generate,jobId);
    assert.equal(wire.length,2,"ending the customer wait never authorizes another old supplier POST");
    assert.deepEqual((await repo.getImageJob(jobId,"generate"))!.snapshot.paidOperations,unavailable.snapshot.paidOperations);
    observations.undelivered={jobId,status:"error",customerBilling:"released",supplierOutcome:"unknown",supplierCost:"pending",consumes:0,oldWorkerPosts:0};
    console.log("GATEWAY_UNDELIVERED_OUTCOME=PASS STATUS=error CUSTOMER_BILLING=released SUPPLIER_COST=pending ORIGINAL_ATTEMPT=started CONSUMES=0 OLD_WORKER_POSTS=0");
    // A new, explicit user purchase is a different operation. Keep the original
    // failed receipt intact; exercise successful fan-out and completed replay.
    const fresh=await generate.POST(new Request("http://fixture.test/api/generate-image",{method:"POST",headers,body:JSON.stringify({prompt:"fixture product",model:"naumi-image-auto",count:2,quality:"medium",resolution:"1K",ratio:"1:1"})}));
    assert.equal(fresh.status,200,await fresh.clone().text());const freshId=(await fresh.json()).jobId;assert.notEqual(freshId,jobId);
    const done=await waitJob(freshId,"generate",row=>row.snapshot.status==="done" && row.lease_token===null);
    assert.ok(Array.isArray(done.snapshot.images)); assert.equal(done.snapshot.images.length,2); assert.equal(done.snapshot.creditsUsed,12); assert.equal(operations.size,4);
    assert.ok(wire.every(request=>request.quality==="medium"));
    await kick(generate,freshId);assert.equal(wire.length,4);assert.equal(await db.getImageJobChargedCredits(freshId),12);
    observations.generation={jobId:freshId,images:2,credits:12,completedWorkerPosts:0};
    console.log("PASS generation: stable per-image IDs, frozen quality, explicit new purchase and completed recovery with one credit settlement");
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
      assert.equal(original.billing_settled,true);
      // A completed snapshot contains binary/checkpoint references owned by its
      // original job. A distinct test purchase must start with raw fixture
      // inputs, not clone another job's paid result pointers.
      const common={status:"pending",shots:[shot(`${id}:shot:0`)],done:0,total:1,createdAt:Date.now(),cost:charge,imageQuality:tier,quality};
      const snapshot=kind==="suite"?common:{...common,stage:"generating",sources:[{id:`${id}:source`,status:"approved",version:1}],sourceInputs:[{buf:image,type:"image/png"}],sourceBuffers:[image],sourceHistory:[[]],extra:"",platform:"amazon",lang:"zh",format:"1:1",modules:["main"],email,model:"naumi-image-auto",textModel:"fixture",useDb:true,generationStarted:true,reserved:true,parentId:"",parentIds:[],origin:""};
      const payload=kind==="suite"?{images:[{buf:image,type:"image/png"}],extra:"",platform:"taobao",email,model:"naumi-image-auto",cost:charge,requested:[],textModel:"fixture"}:{};
      assert.equal(Object.hasOwn(snapshot,"paidOperations"),false);
      await new DurableImageJobs<any>(kind).create(id,email,snapshot,payload,charge,true);
      const callsBefore:number=wire.length;
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
    let guardFinished=false,guardFailure:unknown;
    await guardJobs.kick(guardId,async()=>{try{
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
    }catch(error){guardFailure=error;}finally{guardFinished=true;}});
    await waitJob(guardId,"generate",row=>guardFinished&&row.lease_token===null);if(guardFailure)throw guardFailure;
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
    observations.paidGuard={actualJobLease:true,paidCalls,unknownReposts:0,savedBytesReused:true};
    await writeFile(path.join(evidence,"RESULT.json"),JSON.stringify({status:"PASS",...observations},null,2)+"\n");
    console.log("IMAGE_GATEWAY_RESULT=PASS");
  } catch(error){await writeFile(path.join(evidence,"FAILURE.json"),JSON.stringify({status:"FAIL",...observations,error:error instanceof Error?error.message:String(error)},null,2)+"\n");throw error;}
  finally { await (await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();await sql.end(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
