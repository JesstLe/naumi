import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import sharp from "sharp";
import { fixtureConfig, facts } from "./billing-unit-fixture";
import { validateBillingConfig } from "../src/lib/billing/rules/schema";
import { quote } from "../src/lib/billing/quote";
import { estimateCost } from "../src/lib/billing/costs";
import { yuanToFen } from "../src/lib/billing/decimal";

async function main() {
    if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw new Error("Requires isolated local PostgreSQL");
    const legacy = fixtureConfig();
    for (const id of ["canvas.text-generate", "canvas.assistant", "canvas.ocr"] as const) delete (legacy.features as any)[id];
    const untouched = JSON.stringify(legacy), upgraded = validateBillingConfig(legacy);
    assert.equal(JSON.stringify(legacy), untouched, "Old stored config is not mutated");
    for (const id of ["canvas.text-generate", "canvas.assistant", "canvas.ocr"] as const) {
        const q = quote({ version: 1, config: upgraded }, facts({ feature: id }));
        assert.equal(q.requestedCredits, 0);
        assert.equal(estimateCost(q, {state:"succeeded",items:[{id:"text",state:"succeeded"}]}), null, "Text/OCR must not inherit legacy image estimates");
    }
    const invalid = structuredClone(legacy); delete (invalid.features as any)["image.generate"];
    assert.throws(() => validateBillingConfig(invalid), "Original missing tariffs still fail closed");
    assert.equal(yuanToFen("19.99"), 1999); assert.equal(yuanToFen("0.01"), 1); assert.equal(yuanToFen("2."), 200);
    for (const invalidAmount of ["", "1.001", "-1", "21474836.48", "1e2"]) assert.equal(yuanToFen(invalidAmount), null);

    Object.assign(process.env, { NAUMI_MULTI_USER:"1", SETTINGS_SECRET:"fixture-billing-0123456789abcdef0123456789abcdef", STORAGE_DRIVER:"local", MEDIA_DIR:path.resolve("output/billing-20261003/canvas-extra-media"), OPENAI_API_KEY:"fixture", AGENT_API_KEY:"fixture", OPENAI_TEXT_MODEL:"fixture-text", PADDLE_OCR_REQUIRED:"true" });
    let calls=0, mode="success", release:()=>void=()=>{};
    const mock=createServer(async(req,res)=>{
        let raw="";for await(const chunk of req)raw+=chunk;
        calls++;
        if(mode==="rejected"){res.writeHead(400,{"content-type":"application/json"});res.end(JSON.stringify({error:{message:"fixture rejected"}}));return;}
        if(req.url==="/ocr"){res.setHeader("content-type","application/json");res.end(JSON.stringify({rec_texts:["hello"],rec_scores:[0.99],rec_polys:[[[1,1],[50,1],[50,20],[1,20]]]}));return;}
        const body=JSON.parse(raw);assert.equal(body.model,"fixture-text");
        assert.deepEqual(body.modalities,["text"]);
        assert.ok(body.messages[0].content.includes("不要生成、编辑或返回图片"));
        if(mode==="image") {
            const image={images:[{type:"image_url",image_url:{url:"data:image/png;base64,fixture"}}],content:null};
            if(body.stream){res.writeHead(200,{"content-type":"text/event-stream"});res.end(`data: ${JSON.stringify({choices:[{delta:image}]})}\n\ndata: ${JSON.stringify({choices:[{delta:{},finish_reason:"stop"}]})}\n\ndata: [DONE]\n\n`);}
            else{res.setHeader("content-type","application/json");res.end(JSON.stringify({choices:[{message:image,finish_reason:"stop"}]}));}
            return;
        }
        if(body.stream){
            res.writeHead(200,{"content-type":"text/event-stream"});
            res.write(`data: ${JSON.stringify({choices:[{delta:{content:"first "}}]})}\n\n`);
            if(mode==="paused")await new Promise<void>(resolve=>{release=resolve;});
            if(mode==="broken"){await new Promise(r=>setTimeout(r,25));res.destroy();return;}
            res.end(`data: ${JSON.stringify({choices:[{delta:{content:"reply"}}]})}\n\ndata: [DONE]\n\n`);
        }else{res.setHeader("content-type","application/json");res.end(JSON.stringify({choices:[{message:{content:mode==="parts"?[{type:"reasoning",text:"PRIVATE"},{type:"text",text:"fixture reply"}]:"fixture reply"}}]}));}
    });
    await new Promise<void>(resolve=>mock.listen(0,"127.0.0.1",resolve));
    const base=`http://127.0.0.1:${(mock.address() as {port:number}).port}`;
    Object.assign(process.env,{OPENAI_BASE_URL:`${base}/v1`,AGENT_BASE_URL:`${base}/v1`,PADDLE_OCR_BASE_URL:`${base}/ocr`});
    const db=await import("../src/lib/db"), {getBillingRuntime}=await import("../src/lib/billing/server"), {signUserSession}=await import("../src/lib/native-auth");
    const runtime=(await getBillingRuntime()).config, original=await runtime.current(), email=`canvas-extra-${randomUUID()}@example.test`;
    let version=original.version, displayed=3;
    const routes={"canvas.text-generate":await import("../src/app/api/canvas/text-generate/route"),"canvas.assistant":await import("../src/app/api/canvas/assistant/route"),"canvas.ocr":await import("../src/app/api/canvas/ocr/route")};
    try{
        await db.getOrCreateUser(email);await db.addCreditBatch(email,100,{source:"admin",reason:"fixture"});
        const image=await sharp({create:{width:64,height:64,channels:3,background:"white"}}).png().toBuffer(), {uploadImage}=await import("../src/lib/storage");
        const artworkId=randomUUID(),imageUrl=await uploadImage(image,"image/png",`fixtures/${artworkId}.png`);
        await db.addArtworks(email,[{id:artworkId,title:"Fixture",category:"main",prompt:"Fixture",status:"completed",image:imageUrl,gradient:"",origin:"canvas",width:64,height:64}]);
        const configure = async(credits:number, enabled=true)=>{const current=await runtime.current(),config=structuredClone(current.config);config.switches.metering="on";for(const id of Object.keys(routes) as (keyof typeof routes)[]){config.features[id].enabled=enabled;config.features[id].pricing={mode:"fixed",credits};}version=(await runtime.publish({id:randomUUID(),expectedVersion:current.version,config,actor:"fixture",reason:"Canvas extra acceptance"})).version;displayed=enabled?credits:0;}
        const request = (feature:keyof typeof routes,id:string, confirmed=true,textMode?:string)=>{return new Request(`http://fixture.test/api/canvas/${feature.split(".")[1]}`,{method:"POST",headers:{cookie:`nv_user=${signUserSession(email,Date.now())}`,"content-type":"application/json","x-naumi-billing-operation-id":id,...(confirmed?{"x-naumi-billing-version":String(version),"x-naumi-billing-credits":String(displayed)}:{})},body:JSON.stringify(feature==="canvas.text-generate"?{prompt:"Fixture",...(textMode?{mode:textMode,sourceIds:[artworkId],...(textMode==="assist"?{productIds:[artworkId]}:{})}:{})}:feature==="canvas.assistant"?{anchorId:artworkId,messages:[{role:"user",content:"Fixture"}]}:{artworkId})});}
        await configure(3);
        for(const feature of Object.keys(routes) as (keyof typeof routes)[]){
            const id=randomUUID(), before=calls;
            assert.equal((await routes[feature].POST(request(feature,id,false))).status,409);assert.equal(calls,before,"Missing quote cannot call supplier");
            const response=await routes[feature].POST(request(feature,id));assert.equal(response.status,200,await response.clone().text());
            const text=await response.text();assert.ok(text.includes(feature==="canvas.ocr"?"hello":"reply"));
            const after=calls,replayed=await routes[feature].POST(request(feature,id));assert.equal(replayed.status,200);const replayText=await replayed.text();if(feature==="canvas.assistant"){assert.ok(replayText.includes('"text":"first reply"'));assert.ok(replayText.includes('"replayed":true'));}else assert.deepEqual(JSON.parse(replayText),JSON.parse(text));assert.equal(calls,after);
            assert.equal((await db.getPool().query("SELECT charged_credits FROM app_billing_operations WHERE id=$1",[`tool-${id}`])).rows[0].charged_credits,3);
        }
        for(const textMode of ["general","reverse","assist"]){
            mode="parts";const id=randomUUID(),before=calls,response=await routes["canvas.text-generate"].POST(request("canvas.text-generate",id,true,textMode));
            assert.equal(response.status,200);assert.equal((await response.json()).text,"fixture reply");assert.equal(calls,before+1);
        }
        mode="image";
        for(const feature of ["canvas.text-generate","canvas.assistant"] as const){
            const id=randomUUID(),before=calls,response=await routes[feature].POST(request(feature,id,true,"general"));
            const payload=await response.text();assert.ok(payload.includes("TEXT_OUTPUT_IMAGE"));assert.ok(!payload.includes("data:image"));
            assert.equal(calls,before+1);assert.deepEqual((await db.getPool().query("SELECT state,charged_credits,reserved_credits FROM app_billing_operations WHERE id=$1",[`tool-${id}`])).rows[0],{state:"hold",charged_credits:0,reserved_credits:3});
            assert.equal((await routes[feature].POST(request(feature,id,true,"general"))).status,409);assert.equal(calls,before+1,"Unknown output must never be submitted again with the same ID");
        }
        mode="success";
        await configure(0,false);
        const free=await routes["canvas.text-generate"].POST(request("canvas.text-generate",randomUUID(),false));assert.equal(free.status,200);await free.text();
        await configure(3);mode="paused";
        const id=randomUUID(),stream=await routes["canvas.assistant"].POST(request("canvas.assistant",id)),reader=stream.body!.getReader();
        const first=await reader.read();assert.ok(new TextDecoder().decode(first.value).includes("first "),"First token arrives before supplier completion");
        const after=calls;assert.equal((await routes["canvas.assistant"].POST(request("canvas.assistant",id))).status,409);assert.equal(calls,after);
        await configure(9);release();let tail="";for(;;){const result=await reader.read();if(result.done)break;tail+=new TextDecoder().decode(result.value);}assert.ok(tail.includes('"ok":true'));
        assert.equal((await db.getPool().query("SELECT charged_credits FROM app_billing_operations WHERE id=$1",[`tool-${id}`])).rows[0].charged_credits,3,"In-flight stream retains frozen price");
        mode="rejected";const rejectedId=randomUUID(),rejected=await routes["canvas.text-generate"].POST(request("canvas.text-generate",rejectedId));assert.equal(rejected.status,502);
        assert.deepEqual((await db.getPool().query("SELECT state,charged_credits,reserved_credits FROM app_billing_operations WHERE id=$1",[`tool-${rejectedId}`])).rows[0],{state:"settled",charged_credits:0,reserved_credits:0});
        mode="broken";const brokenId=randomUUID(),broken=await routes["canvas.assistant"].POST(request("canvas.assistant",brokenId));const brokenText=await broken.text();assert.ok(brokenText.includes("event: error"));
        const row=(await db.getPool().query("SELECT state,charged_credits,reserved_credits FROM app_billing_operations WHERE id=$1",[`tool-${brokenId}`])).rows[0];assert.deepEqual(row,{state:"hold",charged_credits:0,reserved_credits:9});
        const brokenCalls=calls;assert.equal((await routes["canvas.assistant"].POST(request("canvas.assistant",brokenId))).status,409);assert.equal(calls,brokenCalls);
        mode="paused";const recoveryId=randomUUID(),recovery=await routes["canvas.assistant"].POST(request("canvas.assistant",recoveryId)),recoveryReader=recovery.body!.getReader();await recoveryReader.read();
        await db.getPool().query("UPDATE app_credit_batches SET expires_at=now()-interval '1 second' WHERE email=$1",[email]);release();let recoveryText="";for(;;){const part=await recoveryReader.read();if(part.done)break;recoveryText+=new TextDecoder().decode(part.value);}assert.ok(recoveryText.includes("event: error"));
        const saved=(await db.getPool().query("SELECT state,result_response,charged_credits FROM app_billing_operations WHERE id=$1",[`tool-${recoveryId}`])).rows[0];assert.equal(saved.state,"manual");assert.equal(saved.charged_credits,0);assert.equal(saved.result_response.text,"first reply");
        await db.addCreditBatch(email,100,{source:"admin",reason:"Recovery fixture"});const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");
        await withBillingTransaction(db.getPool(),tx=>createBillingService().reconcileTx(tx,{id:randomUUID(),operationId:`tool-${recoveryId}`,actor:"fixture-admin",reason:"Recover known streamed reply",proof:"Saved fixture reply",result:{state:"succeeded",items:[{id:`tool-${recoveryId}`,state:"succeeded",executedQuality:"medium"}]}}));
        const recoveryCalls=calls;const recovered=await routes["canvas.assistant"].POST(request("canvas.assistant",recoveryId));assert.equal(recovered.status,200);assert.ok((await recovered.text()).includes('"replayed":true'));assert.equal(calls,recoveryCalls);
        console.log("PASS old-version free defaults, strict validation, exact yuan conversion, all 3 real canvas APIs, free/paid/replay, SSE first token/frozen price/rejection/uncertain stream/saved-output funding recovery");
    }finally{
        release();const current=await runtime.current();await runtime.publish({id:randomUUID(),expectedVersion:current.version,config:original.config,actor:"fixture",reason:"Restore canvas acceptance"});
        for(const table of ["app_gen_reservations","app_billing_operations","app_artworks","app_bi_model_calls","app_ledger","app_credit_batches","app_users"])await db.getPool().query(`DELETE FROM ${table} WHERE email=$1`,[email]);
        await db.getPool().end();await new Promise<void>(resolve=>mock.close(()=>resolve()));
    }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
