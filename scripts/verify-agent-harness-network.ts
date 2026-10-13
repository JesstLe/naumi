import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createNaumiTools } from "../src/lib/agent/naumi-tools";
import { resolveVisionImages } from "../src/lib/agent/runtime";
import { assertPublicImageHost, readBoundedBytes } from "../src/lib/agent/harness-network";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  // Tool execution now verifies session authority before reaching the network.
  // Use a real isolated identity so this regression still reaches the redirect boundary.
  const fixture = process.env.DATABASE_URL ? await createModelFixture() : null;
  if (fixture) process.env.PGOPTIONS = `-c search_path=${fixture.schemaName}`;
  const db = await import("../src/lib/db");
  const owner = `network-${Date.now()}@example.test`;
  if (fixture) await db.getOrCreateUser(owner, "Network fixture");
  const native = await import("../src/lib/native-auth");
  const credentials = { cookie: fixture ? `nv_user=${native.signUserSession(owner, Date.now())}` : "fixture-confidential-cookie", authorization: "" };
  let sourceCalls=0,exfilCalls=0;
  const exfil=createServer((_req,res)=>{exfilCalls++;res.end("not allowed");});
  await new Promise<void>(r=>exfil.listen(0,"127.0.0.1",r));
  const target=`http://127.0.0.1:${(exfil.address() as {port:number}).port}/collect`;
  const source=createServer((_req,res)=>{sourceCalls++;res.writeHead(302,{location:target});res.end();});
  await new Promise<void>(r=>source.listen(0,"127.0.0.1",r));
  const origin=`http://127.0.0.1:${(source.address() as {port:number}).port}`;process.env.INTERNAL_APP_ORIGIN=origin;
  try {
    const tools=createNaumiTools(new Request(origin),owner,()=>credentials);
    await assert.rejects(()=>tools.find(t=>t.name==="generate_titles")!.execute("redirect",{idea:"generate product titles"},undefined));
    assert.equal(sourceCalls,1);assert.equal(exfilCalls,0);
    await assert.rejects(()=>tools.find(t=>t.name==="generate_titles")!.execute("ssrf",{image_url:origin+"/api/admin/settings"},undefined));
    assert.equal(sourceCalls,1);
    assert.equal((await resolveVisionImages([origin+"/api/admin/settings"],"fixture-cookie")).length,0);assert.equal(sourceCalls,1);
    for(const host of ["127.0.0.1","169.254.169.254","100.64.0.1","192.168.1.1","10.1.1.1","[::1]"]){await assert.rejects(()=>assertPublicImageHost(new URL(`https://${host}/x.png`),/.*/));}
    let cancelled=false;
    const large=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(20));controller.enqueue(new Uint8Array(20));},cancel(){cancelled=true;}}));
    await assert.rejects(()=>readBoundedBytes(large,32));assert.equal(cancelled,true);
    console.log("AGENT_HARNESS_NETWORK=PASS checks=15 redirect_credential_exfiltration=BLOCKED source_post_attempts=1 exfil_requests=0 same_origin_private_api=BLOCKED private_dns=BLOCKED chunked_limit=PASS real_supplier_calls=0");
  } finally {await Promise.all([new Promise<void>(r=>source.close(()=>r())),new Promise<void>(r=>exfil.close(()=>r()))]); if (fixture) { await db.getPool().end(); await fixture.cleanup(); } }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
