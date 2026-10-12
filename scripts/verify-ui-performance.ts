import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {createModelFixture} from "./model-config-fixture";

async function main() {
  const baseline=process.argv.includes("--baseline");
  const rootArg=process.argv.find(value=>value.startsWith("--source-root="))?.slice("--source-root=".length);
  const cdn=baseline ? await import(pathToFileURL(rootArg?rootArg+"/src/lib/cdn.ts":process.cwd()+"/output/performance-20261012/baseline-cdn.ts").href) : await import("../src/lib/cdn");
  for (const src of ["https://remote.test/a.png","data:image/png;base64,fixture","blob:fixture","/media/a.gif","/media/a.svg","/media/a.mp4","/media/../secret.png","/media/%2e%2e/a.png","/media/a.png?token=fixture"]) assert.equal(cdn.cdnThumb(src,640),src);
  assert.equal(cdn.cdnUrl("/media/original.png"),"/media/original.png");
  assert.equal(cdn.cdnThumb("/media/original.png",300),baseline?"/media/original.png":"/_next/image?url=%2Fmedia%2Foriginal.png&w=384&q=75");
  if(!baseline){const image={dataset:{},src:"/_next/image?x",getAttribute:()=>"/_next/image?x"};assert.equal(cdn.onImgError({currentTarget:image},"/media/original.png"),true);assert.equal(image.src,"/media/original.png");assert.equal(cdn.onImgError({currentTarget:image},"/media/original.png"),false);}
  let providerCalls=0;
  const f=await createModelFixture((_req,res)=>{providerCalls++;res.writeHead(500);res.end();});
  process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
  process.env.NAUMI_MULTI_USER="1";
  const db=await import("../src/lib/db");
  try {
    await db.ensureSchema();await db.setSetting("multi_user_enabled","1");
    const email="performance@example.test",other="other@example.test";
    await db.getOrCreateUser(email,"Performance");await db.getOrCreateUser(other,"Other");
    // More than the legacy 1000 cap; bulky prompt never belongs in eight previews.
    await f.sql.query(`INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,created_at)
      SELECT 'perf-'||i,$1,'Image '||i,'main',repeat('fixture ',400),'completed','/media/original.png','',
      CASE WHEN i <= 10 THEN '2026-10-12T12:00:00Z'::timestamptz ELSE '2026-10-11T12:00:00Z'::timestamptz END
      FROM generate_series(1,1005) i`,[email]);
    await f.sql.query(`INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,deleted_at)
      VALUES('failed',$1,'failed','main','','failed','/media/a.png','',NULL),
      ('empty',$1,'empty','main','','completed','','',NULL),
      ('deleted',$1,'deleted','main','','completed','/media/a.png','',now()),
      ('other',$2,'other','main','','completed','/media/a.png','',NULL)`,[email,other]);
    const {signUserSession}=await import("../src/lib/native-auth");
    const route=baseline ? await import(pathToFileURL(rootArg?rootArg+"/src/app/api/account/route.ts":process.cwd()+"/output/performance-20261012/baseline-account.ts").href) : await import("../src/app/api/account/route");
    const req=(query:string,auth=email)=>new Request("http://fixture.test/api/account?email="+encodeURIComponent(email)+query,{headers:{cookie:`nv_user=${signUserSession(auth,Date.now())}`}});
    assert.equal((await route.GET(req("",other))).status,401);
    const full=await (await route.GET(req(""))).json();assert.equal(full.artworks.length,1000);
    const query="&view=workbench&dayStart=2026-10-12T00:00:00Z&dayEnd=2026-10-13T00:00:00Z";
    const response=await route.GET(req(query));assert.equal(response.status,200);const result=await response.json();
    if(baseline){assert.equal(result.artworks.length,1000);console.log(`BASELINE=PASS ACCOUNT_ROWS=1000 THUMB=ORIGINAL CROSS_ACCOUNT=401 PROVIDER_CALLS=${providerCalls}`);return;}
    assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(result.artworks.length,8);
    assert.deepEqual(result.stats,{total:1005,today:10});assert.ok(result.artworks.every((a:any)=>!('prompt' in a)&&!('source' in a)));
    const reduction=100*(1-JSON.stringify(result).length/JSON.stringify(full).length);assert.ok(reduction>95);
    assert.equal((await route.GET(req("&view=workbench"))).status,400);
    for(const hours of [23,25])assert.equal((await route.GET(req(`&view=workbench&dayStart=2026-10-12T00:00:00Z&dayEnd=${new Date(Date.UTC(2026,9,12)+hours*3600000).toISOString()}`))).status,200);
    assert.equal((await route.GET(new Request("http://fixture.test/api/account?email="+other+query,{headers:{cookie:`nv_user=${signUserSession(other,Date.now())}`}}))).status,200);
    assert.equal(providerCalls,0);
    console.log(`MODIFIED=PASS ACCOUNT_ROWS=8 COUNTS=1005/10 PAYLOAD_REDUCTION=${reduction.toFixed(2)}% AUTH=INTACT DST=PASS CACHE=PRIVATE ORIGINAL_URL=UNCHANGED FALLBACK=ONCE PROVIDER_CALLS=0`);
  } finally {await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
