import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

async function main() {
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw new Error("Requires isolated local PostgreSQL");
  Object.assign(process.env, { NAUMI_MULTI_USER: "1", NAUMI_IMAGE_QUALITY_SUPPORTED: "1",
    SETTINGS_SECRET: "fixture-settings-0123456789abcdef0123456789abcdef0123456789",
    STORAGE_DRIVER: "local", MEDIA_DIR: path.resolve("output/global-quality-20261003/media"),
    OPENAI_API_KEY: "fixture-platform", OPENAI_IMAGE_MODEL: "gpt-image-1", OPENAI_IMAGE_MODELS: "gpt-image-1", OPENAI_IMAGE_QUALITY: "medium" });
  const image = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "white" } }).png().toBuffer();
  let scenario = "success";
  const managedMode = process.argv.includes("--managed");
  const wire: string[] = [];
  const wireModels: string[] = [];
  const supplier = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk);
    const form = await new Request("http://fixture.test", { method: "POST", headers: { "content-type": String(request.headers["content-type"]) }, body: Buffer.concat(chunks) }).formData();
    const quality = String(form.get("quality")); wire.push(quality); wireModels.push(String(form.get("model")));
    response.setHeader("content-type", "application/json");
    if (scenario === "failure" || scenario === "downgrade" && quality === "xhigh") {
      response.writeHead(400); response.end(JSON.stringify({ error: { message: scenario === "failure" ? "fixture rejected prompt" : "quality is not supported" } }));
    } else response.end(JSON.stringify({ created: 1, data: [{ b64_json: image.toString("base64") }] }));
  });
  await new Promise<void>(resolve => supplier.listen(0, "127.0.0.1", resolve));
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(supplier.address() as {port:number}).port}/v1`;
  const modelFixture = managedMode ? await createModelFixture(supplier.listeners("request")[0] as import("node:http").RequestListener) : null;
  const privateMedia = managedMode ? await mkdtemp(path.join(tmpdir(), "naumi-managed-tools-")) : null;
  if (modelFixture) {
    process.env.PGOPTIONS = `-c search_path=${modelFixture.schemaName}`;
    process.env.MEDIA_DIR = privateMedia!;
    const origin = modelFixture.origin;
    process.env.OPENAI_BASE_URL = `${origin}/v1`;
    Object.assign(process.env, { NAUMI_ROUTER_MANAGEMENT_URL: origin, MODEL_CONFIG_TRUSTED_ORIGINS: origin, NAUMI_ROUTER_MANAGEMENT_TOKEN: "fixture-tools-private-control-token-20261004", MODEL_CONFIG_ENVELOPE_SECRET: "fixture-tools-private-envelope-secret-20261004" });
    modelFixture.config.providers[0].baseUrl = process.env.OPENAI_BASE_URL;
    modelFixture.config.upstreamModels[0].model = "registered-tools-wire";
    modelFixture.config.upstreamModels[0].parameterMap = {};
    Object.assign(modelFixture.config.upstreamModels[0].capabilities, { qualityRank: 5, qualities: ["low", "medium", "high", "xhigh", "max"], nativeResolutions: ["1K"], preserveIdentity: true, textAccuracy: true, maxReferenceImages: 8 });
  }
  const db = await import("../src/lib/db");
  const native = await import("../src/lib/native-auth");
  const quality = await import("../src/lib/image-quality-request");
  const canvasTasks = await import("../src/lib/canvas-image-tasks");
  const sql = db.getPool();
  await db.ensureSchema(); await db.setSetting("multi_user_enabled", "1"); await db.setSetting("credits_metering", "1");
  const routes = {
    retouch: await import("../src/app/api/retouch/route"), recolor: await import("../src/app/api/recolor/route"),
    replicate: await import("../src/app/api/replicate/route"), inpaint: await import("../src/app/api/inpaint/route"),
    extract: await import("../src/app/api/extract/route"), garment: await import("../src/app/api/garment/route"),
    garment3d: await import("../src/app/api/garment3d/route"), packaging3d: await import("../src/app/api/packaging3d/route"),
    avatar: await import("../src/app/api/avatar/route"), style: await import("../src/app/api/style/route"),
    tryon: await import("../src/app/api/tryon/route"), dewatermark: await import("../src/app/api/dewatermark/route"),
    dewrinkle: await import("../src/app/api/dewrinkle/route"),
  };
  const asyncRoutes = new Set(["garment3d", "packaging3d", "tryon"]);
  async function user() {
    const email = `global-quality-${randomUUID()}@example.test`;
    await db.getOrCreateUser(email, "Quality fixture"); await db.addCreditBatch(email, 100, {source:"admin",reason:"Fixture"});
    return { email, before: (await db.getUser(email))!, headers: {cookie:`nv_user=${native.signUserSession(email, Date.now())}`, "x-naumi-image-quality": "xhigh"} };
  }
  function form() {
    const body = new FormData();
    for (const key of ["image", "mask", "ref", "top"]) body.append(key, new File([image], `${key}.png`, {type:"image/png"}));
    for (const [key,value] of Object.entries({prompt:"fixture product",style:"watercolor",color:"#336699",resolution:"4K",ratio:"1:1",option:"gloss"})) body.append(key,value);
    return body;
  }
  async function assertCharge(email:string, before:number, expected:number) {
    const after = (await db.getUser(email))!;
    assert.equal(after.creditsTotal, before - expected, email); assert.equal(after.creditsUsed, 0, "No stranded reservation");
    const ledger = (await sql.query("SELECT COALESCE(-sum(delta),0) AS billed FROM app_ledger WHERE email=$1 AND kind='consume'",[email])).rows[0];
    assert.equal(Number(ledger.billed), expected, "Confirmed ledger equals the displayed charge");
    const audits = (await sql.query("SELECT * FROM app_image_cost_audit WHERE email=$1",[email])).rows;
    assert.equal(audits.reduce((sum,row)=>sum+row.billed_credits,0), expected);
    return audits;
  }
  try {
    if (modelFixture) await modelFixture.repo.current();
    for (const [name,route] of Object.entries(routes)) {
      scenario="success"; wire.length=0;
      const actor=await user();
      const result=await route.POST(new Request(`http://fixture.test/api/${name}`,{method:"POST",headers:actor.headers,body:form()}));
      assert.equal(result.status,200,`${name}: ${await result.clone().text()}`);
      let data=await result.json();
      if(asyncRoutes.has(name)) {
        const jobId=data.jobId;
        const getter=(route as {GET:(r:Request)=>Promise<Response>}).GET;
        const deadline=Date.now()+20000;
        while(Date.now()<deadline) {
          data=await (await getter(new Request(`http://fixture.test/api/${name}?job=${jobId}`,{headers:actor.headers}))).json();
          if(data.status==="done"||data.status==="error") break;
          await new Promise(resolve=>setTimeout(resolve,30));
        }
        assert.equal(data.status,"done",`${name}: ${JSON.stringify(data)}`);
      }
      const expected=["inpaint","extract","garment3d","packaging3d"].includes(name)?20:14;
      const audits=await assertCharge(actor.email,actor.before.creditsTotal,expected);
      assert.deepEqual(wire,["xhigh"],name); assert.equal(audits.length,1); assert.equal(audits[0].requested_quality,"xhigh");
      if (managedMode) assert.equal(wireModels.at(-1), "registered-tools-wire", `${name} must submit the configured supplier model, not the legacy environment model`);
      console.log(`PASS ${name}: quality=xhigh, committed=${expected}`);
    }
    for(const name of ["retouch","packaging3d"] as const) {
      const actor=await user();scenario="downgrade";wire.length=0;
      const body=form();const result=await routes[name].POST(new Request(`http://fixture.test/api/${name}`,{method:"POST",headers:actor.headers,body}));
      assert.equal(result.status,200,await result.clone().text()); let data=await result.json();
      if(data.jobId) {
        const id=data.jobId;
        while(true) {data=await(await routes.packaging3d.GET(new Request(`http://fixture.test/api/packaging3d?job=${id}`,{headers:actor.headers}))).json();if(data.status!=="pending")break;await new Promise(resolve=>setTimeout(resolve,30));}
        assert.equal(data.status,"done");
      }
      const audits=await assertCharge(actor.email,actor.before.creditsTotal,name==="retouch"?14:20);
      assert.deepEqual(wire,["xhigh","medium"]);assert.equal(audits[0].executed_quality,"medium");
      console.log(`PASS ${name}: confirmed rejection falls back once, original quote retained`);
    }
    scenario="failure";const failed=await user();
    const result=await routes.retouch.POST(new Request("http://fixture.test/api/retouch",{method:"POST",headers:failed.headers,body:form()}));
    assert.equal(result.status,502);await assertCharge(failed.email,failed.before.creditsTotal,0);
    scenario="success";
    const source=await user();const artId=`quality-source-${randomUUID()}`;
    await db.addArtworks(source.email,[{id:artId,title:"Fixture",category:"main",prompt:"",status:"completed",image:`data:image/png;base64,${image.toString("base64")}`,gradient:"",resolution:"4K",width:1024,height:1024}],`fixture-${randomUUID()}`);
    const expand=await import("../src/app/api/canvas/expand/route");
    wire.length=0;
    const expanded=await expand.POST(new Request("http://fixture.test/api/canvas/expand",{method:"POST",headers:{...source.headers,"content-type":"application/json"},body:JSON.stringify({artworkId:artId,ratio:"4:3"})}));
    assert.equal(expanded.status,200,await expanded.clone().text());assert.equal((await expanded.json()).cost,20);await assertCharge(source.email,source.before.creditsTotal,20);
    const queued=await canvasTasks.enqueueTextEditTask(source.email,{artworkId:artId,oldText:"Old",newText:"New",box:{x:1,y:1,width:100,height:100},quality:"max"});
    assert.equal(queued.cost,24);process.env.OPENAI_IMAGE_QUALITY="low";
    await canvasTasks.recoverCanvasImageTasks(1);
    const done=await db.getCanvasImageTask(source.email,queued.id);assert.equal(done?.status,"completed");assert.equal(await db.getCanvasImageTaskChargedCredits(queued.id),24);
    await assertCharge(source.email,source.before.creditsTotal,44);
    assert.equal((done?.parameters.qualityAudit as {requested:string}).requested,"max");assert.deepEqual(wire,["xhigh","max"]);
    let attempts=0;
    await assert.rejects(()=>quality.withQualityFallback({requested:"xhigh",executed:"xhigh",fallbackReason:null},async()=>{attempts++;throw Object.assign(new Error("quality upstream timeout"),{status:504});}));assert.equal(attempts,1);
    process.env.NAUMI_MULTI_USER="0";await db.setSetting("multi_user_enabled","0");await db.setSetting("credits_metering","0");
    const free=await user();const freeResult=await routes.retouch.POST(new Request("http://fixture.test/api/retouch",{method:"POST",headers:free.headers,body:form()}));
    assert.equal(freeResult.status,200);assert.equal((await freeResult.json()).cost,0);await assertCharge(free.email,free.before.creditsTotal,0);
    console.log("PASS canvas: inherited dimensions, frozen queued quote and quality; timeout never retries; metering-off is free");
    console.log("GLOBAL_IMAGE_QUALITY_RESULT=PASS");
  } finally {await sql.end();await new Promise<void>(resolve=>supplier.close(()=>resolve()));if(modelFixture)await modelFixture.cleanup();if(privateMedia)await rm(privateMedia,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
