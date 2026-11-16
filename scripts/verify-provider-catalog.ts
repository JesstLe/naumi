import assert from "node:assert/strict";
import { createModelFixture } from "./model-config-fixture";
import { discoverProviderCatalog } from "../src/lib/model-config/catalog";
import { readProviderCatalog, refreshProviderCatalog, PROVIDER_CATALOG_SQL } from "../src/lib/model-config/catalog-store";
import { createCatalogHandler } from "../src/lib/model-config/catalog-access";

async function main() {
  const f = await createModelFixture();
  try {
    const provider = f.config.providers[0];
    const response = await discoverProviderCatalog(provider, f.credentials, [f.origin], async (input) => {
      assert.equal(new URL(String(input)).pathname, "/v1/models");
      return Response.json({ data: [{ id: "ext-model-a", name: "灵动 2.5", owned_by: "fixture" }, { id: "ext-model-a" }, { id: "ext-model-b" }] });
    });
    assert.equal(response.status, "ok");
    assert.deepEqual(response.models.map((m) => m.id), ["ext-model-a", "ext-model-b"]);
    assert.equal(response.models[0].label, "灵动 2.5");
    const unsupported = await discoverProviderCatalog({ ...provider, protocol: "runninghub" }, f.credentials, [f.origin], async () => { throw new Error("must not call"); });
    assert.equal(unsupported.status, "unsupported");
    const missing = await discoverProviderCatalog({ ...provider, credentialRef: undefined }, f.credentials, [f.origin], async () => { throw new Error("must not call"); });
    assert.equal(missing.status, "no-credential");
    // Catalog concurrency and optional public metadata are different reads.
    // Counting /api/pricing as a second /models query made the old fixture
    // fail before this change; retain both concurrency assertions explicitly.
    let queries=0,metadataQueries=0;const fetcher:typeof fetch=async(input,init)=>{assert.equal(new Request(input,init).method,'GET');if(new URL(String(input)).pathname!=='/v1/models'){metadataQueries++;return new Response('{}',{status:404});}queries++;return Response.json({data:[{id:'ext-model-a',name:'灵动 2.5'}]})};
    await Promise.all([refreshProviderCatalog(f.sql,provider,f.credentials,[f.origin],fetcher),refreshProviderCatalog(f.sql,provider,f.credentials,[f.origin],fetcher)]);
    assert.equal(queries,1);
    assert.equal(metadataQueries,1);
    const persisted=await readProviderCatalog(f.sql,[provider]);assert.equal(persisted[0].models[0].label,'灵动 2.5');assert.equal(persisted[0].cached,true);assert.equal(persisted[0].stale,false);
    await refreshProviderCatalog(f.sql,provider,f.credentials,[f.origin],fetcher);assert.equal(queries,1);
    await f.sql.query("UPDATE app_model_provider_catalog SET updated_at=now()-interval '6 minutes'");
    const fail=await refreshProviderCatalog(f.sql,provider,f.credentials,[f.origin],async()=>new Response('secret-token-upstream-error',{status:401}));
    assert.equal(fail.status,'error');assert.equal(fail.models[0].id,'ext-model-a');assert.ok(!JSON.stringify(fail).includes('secret-token'));assert.ok(fail.lastSuccessAt);
    assert.equal((await readProviderCatalog(f.sql,[{...provider,baseUrl:provider.baseUrl+'/other'}]))[0].models.length,0);
    assert.equal((await discoverProviderCatalog(provider,f.credentials,[f.origin],async()=>Response.json({error:'bad'}))).status,'error');
    const admin={pool:f.sql,repo:f.repo,credentials:f.credentials,trustedOrigins:[f.origin]};
    const handler=createCatalogHandler({authorize:async()=>({actor:'catalog-admin'}),administration:async()=>admin as never,fetcher});
    const draft=await f.repo.draft('catalog-admin');
    const input={providerId:provider.id,draftId:draft.id,expectedRevision:draft.revision};
    const req=(body:unknown,origin?:string)=>new Request('http://fixture.test/api/admin/bi/model-config/catalog',{method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(body)});
    const denied=createCatalogHandler({authorize:async()=>Response.json({error:'not found'},{status:404}) as never,administration:async()=>{throw Error('must not assemble')}});
    assert.equal((await denied(new Request('http://fixture.test/api/admin/bi/model-config/catalog'))).status,404);
    assert.equal((await handler(req(input,'https://evil.test'))).status,403);
    assert.equal((await handler(req({...input,expectedRevision:99}))).status,409);
    assert.equal((await handler(req({...input,baseUrl:'http://169.254.169.254'}))).status,400);
    const summary=await handler(new Request('http://fixture.test/api/admin/bi/model-config/catalog'));assert.equal(summary.status,200);const data=await summary.json();assert.equal(data.providers[0].name,provider.name);assert.ok(data.providers[0].configuredModels.length);assert.ok(!JSON.stringify(data).includes(f.marker));
    await f.sql.query(PROVIDER_CATALOG_SQL);await f.sql.query(PROVIDER_CATALOG_SQL);
    assert.equal((await f.repo.current()).version,1);
    console.log("PROVIDER_CATALOG=PASS DEDUP=PASS LABEL=PASS UNSUPPORTED=EXPLICIT NO_CREDENTIAL=EXPLICIT PERSISTED=PASS RACE=ONE CACHE=PASS FAILURE_RETAINS_OLD=PASS ROTATION_ISOLATED=PASS NON_ADMIN=404 SAME_SITE=403 REVISION=409 ACTIVE_VERSION=UNCHANGED PAID_POSTS=0");
  } finally { await f.cleanup(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
