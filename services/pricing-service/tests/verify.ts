import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import { initialConfig, price, matrix, validateConfig, type Catalog } from "../core";
import { PricingStore } from "../store";
import { createPricingServer } from "../server";

async function main() {
  const catalogPath = fileURLToPath(new URL("../catalog.json", import.meta.url));
  const catalog: Catalog = JSON.parse(readFileSync(catalogPath,"utf8")), config = initialConfig(catalog);
  const request = { publicId:"gpt-image2.5",resolution:"4K",ratio:"1:1",quality:"medium",quantity:1 };
  const q=price(config,catalog,request);
  assert.equal(q.saleCny,"0.747432000");assert.equal(q.costScope,"output-only");assert.equal(q.actualModel,"gpt-image-2.5-flare");
  let checks=0;
  for(const tier of ["gold","platinum","diamond","site_official"] as const)for(const alias of config.aliases.slice(0,2))for(const row of catalog.native.output_reference_matrix)for(const quality of ["low","medium","high","xhigh","max"]) {
    const p=price({...config,tier},catalog,{...request,publicId:alias.publicId,resolution:row.resolution.toUpperCase(),ratio:row.size,quality});
    const tokens=BigInt(row.qualities[quality].output_tokens_reference), rate={gold:BigInt(24000000),platinum:BigInt(22800000),diamond:BigInt(21600000),site_official:BigInt(30000000)}[tier];
    const expectedNano=tokens*rate*BigInt(21)/BigInt(1000);
    assert.equal(p.saleCny,`${expectedNano/BigInt(1000000000)}.${(expectedNano%BigInt(1000000000)).toString().padStart(9,"0")}`);checks++;
  }
  const usage={textInput:1000,cachedTextInput:20,imageInput:100,cachedImageInput:10,imageOutput:1483};
  const full=price(config,catalog,{...request,usage});assert.equal(full.costUsd,"0.040268000");assert.equal(full.saleCny,"0.845628000");assert.equal(full.costScope,"full-call-estimate");
  const zero=price(config,catalog,{...request,usage,reportedTotalUsd:"0"});assert.equal(zero.saleCny,"0.000000000");assert.equal(zero.costSource,"reported-test-input");
  assert.equal(price(config,catalog,{...request,usage,reportedTotalUsd:"0.5"}).saleCny,"10.500000000","total must not add usage");
  assert.throws(()=>price(config,catalog,{...request,reportedTotalUsd:"-1"}));assert.throws(()=>price(config,catalog,{...request,quantity:0}));assert.throws(()=>price(config,catalog,{...request,ratio:"7:5"}));
  const cap={...config,qualityPolicy:"cap-medium" as const};for(const quality of ["medium","high","xhigh","max","auto"])assert.equal(price(cap,catalog,{...request,quality}).effective.quality,"medium");assert.equal(price(cap,catalog,{...request,quality:"low"}).effective.quality,"low");
  const ext=price(config,catalog,{...request,publicId:"image25-ext-flare",quality:"max",usage});assert.equal(ext.saleCny,"0.441000000");assert.equal(ext.effective.quality,undefined);assert.equal(ext.costScope,"full-call-estimate");assert.equal(price(config,catalog,{...request,publicId:"image25-ext-sunburst",quantity:4}).saleCny,"1.764000000");
  assert.throws(()=>price(config,catalog,{...request,publicId:"image25-ext-flare",ratio:"3:1"}));
  assert.equal(matrix(config,catalog,"gpt-image2.5").length,45);
  const fixed=structuredClone(config);fixed.fixedSales["gpt-image2.5|4K|1:1|medium"]="2.35";assert.equal(price(fixed,catalog,request).saleCny,"2.350000000");
  fixed.creditConversion={creditsPerCny:"10",rounding:"ceil"};assert.equal(price(fixed,catalog,request).credits,"24");fixed.fixedSales={};assert.equal(price(fixed,catalog,request).credits,"8");
  const bad=structuredClone(config);bad.aliases[1].publicId=bad.aliases[0].publicId;assert.throws(()=>validateConfig(bad,catalog));
  const dir=mkdtempSync(join(tmpdir(),"naumi-pricing-"));const path=join(dir,"pricing.sqlite");let store=new PricingStore(path,catalogPath);
  const token="fixture-local-admin-token-12345678",server=createPricingServer(store,token);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const health=await fetch(base+"/health");assert.equal(health.status,200);assert.equal((await health.json()).productionApplied,false);
    const unauth=await fetch(base+"/v1/state");assert.equal(unauth.status,401);
    const foreign=await fetch(base+"/v1/state",{headers:{Authorization:`Bearer ${token}`,Origin:"https://evil.test"}});assert.equal(foreign.status,403);
    const hostStatus=await new Promise<number>(done=>{const req=httpRequest(base+"/health",{headers:{Host:"evil.test"}},res=>{res.resume();done(res.statusCode!);});req.end();});assert.equal(hostStatus,403);
    const call=(p:string,body?:unknown,extra={})=>fetch(base+p,{method:body===undefined?"GET":"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
    assert.equal((await call("/v1/state")).status,200);assert.equal((await call("/v1/apply",{expectedVersion:1,expectedRevision:1,reason:""})).status,400);
    const create=await call("/v1/quote",request,{"Idempotency-Key":"frozen-before-update"}),frozen=await create.json();assert.equal(frozen.configVersion,1);assert.equal(frozen.saleCny,"0.747432000");
    const saved=store.saveDraft({...config,multiplier:"4"},1,"fixture");assert.equal(store.snapshot().config.multiplier,"3");
    const applied=store.publish(1,saved.revision,"fixture multiplier","fixture");assert.equal(applied.version,2);assert.equal(store.freeze(request,"new-version").saleCny,"0.996576000");
    const replay=await (await call("/v1/quote",request,{"Idempotency-Key":"frozen-before-update"})).json();assert.equal(replay.configVersion,1);assert.equal(replay.saleCny,frozen.saleCny);assert.equal(replay.replayed,true);
    assert.equal((await call("/v1/quote",{...request,quantity:2},{"Idempotency-Key":"frozen-before-update"})).status,409);
    assert.throws(()=>store.saveDraft(config,1,"fixture"));assert.throws(()=>store.publish(1,saved.revision,"stale","fixture"));
    const before=store.snapshot().version;assert.throws(()=>store.saveDraft({...config,multiplier:"-1"},store.draft().revision,"fixture"));assert.equal(store.snapshot().version,before);
    const rolled=store.rollback(1,2,"rollback rehearsal","fixture");assert.equal(rolled.version,3);assert.equal(rolled.config.multiplier,"3");assert.equal(store.getQuote(frozen.id).configVersion,1);
    const pkg=store.exportPackage();assert.equal(pkg.productionReady,false);assert.equal(pkg.config.creditConversion,null);
    assert.equal(store.history().length,3);
    // Native zero/failed/pending settlement is not represented as a real debit:
    // this module deliberately has no wallet/generation/reconciliation endpoints.
    assert.equal((await call("/v1/generate",{})).status,404);
  } finally { await new Promise<void>(r=>server.close(()=>r()));store.close(); }
  store=new PricingStore(path,catalogPath);assert.equal(store.snapshot().version,3);assert.equal(store.snapshot().config.multiplier,"3");assert.equal(store.freeze(request,"frozen-before-update").configVersion,1);store.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+requireSeparator()));assert.ok(dir.split(/[\\/]/).pop()!.startsWith("naumi-pricing-"));rmSync(dir,{recursive:true,force:true});
  console.log(`PASS: ${checks} native tier/model/spec/quality amounts; full input/output; total-over-usage; zero-vs-missing; EXT bundle; cap policy; fixed sales; credit rounding; auth/origin/host; conflict; persistence; frozen/idempotent quote; rollback; no paid calls or production writes`);
}
function requireSeparator(){return process.platform === "win32" ? "\\" : "/";}
main().catch(e=>{console.error(e);process.exitCode=1;});
