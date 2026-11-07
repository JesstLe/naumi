/** Company workspace page: 304 for an unchanged build/site profile, fresh 200 on change,
 * security headers kept; the rail opens it with a plain link (no _rsc double fetch).
 * npx tsx scripts/verify-enterprise-workspace-cache.ts */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join,dirname} from "node:path";
import {createRequire} from "node:module";
import ts from "typescript";

async function main(){
  const root=process.cwd(),file="src/app/enterprise/workflow/route.ts";
  let site:any={mode:"enterprise",policy:{brand:{name:"Fixture Co"},workspaceModules:["tasks"],revision:1}};
  const source=ts.transpileModule(await readFile(join(root,file),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const local=createRequire(join(root,file)),mod={exports:{} as any};
  new Function("module","exports","require",source)(mod,mod.exports,(id:string)=>id==="@/lib/site-control/store"?{siteProfile:async()=>site}:local(id));
  const get=(headers:Record<string,string>={})=>mod.exports.GET(new Request("https://fixture.invalid/enterprise",{headers})) as Promise<Response>;

  const first=await get(),etag=first.headers.get("etag")!,body=await first.text();
  assert.equal(first.status,200);assert.match(etag,/^"[A-Za-z0-9_-]{32}"$/);
  assert.equal(first.headers.get("cache-control"),"private, no-cache");
  assert.equal(first.headers.get("x-frame-options"),"DENY");assert.equal(first.headers.get("content-security-policy"),"frame-ancestors 'none'");assert.equal(first.headers.get("x-content-type-options"),"nosniff");
  assert.ok(body.includes('globalThis.__NAUMI_SITE__={"brand":{"name":"Fixture Co"}')&&body.includes('data-workspace-mode="enterprise"'));
  assert.ok(body.length>1_000_000,"fixture serves the real product artifact");

  for(const header of [etag,"W/"+etag,`"stale", ${etag}`,"*"]){
    const again=await get({"if-none-match":header});assert.equal(again.status,304,header);assert.equal(await again.text(),"");assert.equal(again.headers.get("etag"),etag);assert.equal(again.headers.get("x-frame-options"),"DENY");
  }
  assert.equal((await get({"if-none-match":'"stale"'})).status,200);

  site={...site,policy:{...site.policy,revision:2}};
  const changed=await get({"if-none-match":etag});assert.equal(changed.status,200);assert.notEqual(changed.headers.get("etag"),etag);assert.ok((await changed.text()).includes('"revision":2'));
  site={mode:"platform",policy:{}};
  const platform=await get(),platformBody=await platform.text();assert.equal(platform.status,200);assert.ok(!platformBody.includes("<script>globalThis.__NAUMI_SITE__="));

  const rail=await readFile(join(root,"src/components/app-rail.tsx"),"utf8");
  assert.match(rail,/href === "\/enterprise"\s*\?\s*<a href=\{href\}/,"company workspace rail entry is a plain link");
  assert.ok(!/prefetch=\{href === "\/enterprise"/.test(rail));
  // Middleware headers win over the route's: the dedicated /enterprise rewrite must not force no-store.
  const middleware=await readFile(join(root,"src/middleware.ts"),"utf8");
  assert.match(middleware,/target\.pathname='\/enterprise\/workspace';\s*return NextResponse\.rewrite\(target,\{request:\{headers\},headers:WORKSPACE_PAGE_HEADERS\}\)/);
  assert.match(middleware,/WORKSPACE_PAGE_HEADERS = \{ \.\.\.ACCESS_HEADERS, "Cache-Control": "private, no-cache" \}/);
  console.log(`ENTERPRISE_WORKSPACE_CACHE=PASS bytes=${body.length} revalidate=304 changedSite=200 securityHeaders=kept railPlainLink=1 middlewareNoCache=1`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
