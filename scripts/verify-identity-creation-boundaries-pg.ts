/** R4B2 full-checkout A/B: real identity, policy, creation and wallet functions.
 * Random local PG schemas; no product server, provider requests or task replay. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {Pool} from "pg";
import type {CreationContext} from "../src/lib/saas/creation-scope";
import type {BillingConfig,BillingResult,BillingService,OperationInput} from "../src/lib/billing/types";

const arg=(n:string)=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];};
const parts=["cold","mode","mode-supabase","scope","session","policy","project","billing"];
async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");
  const connection=process.env.DATABASE_URL!;assert.equal(new URL(connection).hostname,"127.0.0.1");assert.match(new URL(connection).pathname,/fixture/);
  const root=path.resolve(arg("--source-root")||"."),baseline=process.argv.includes("--baseline"),mode=baseline?"BASELINE":"MODIFIED",part=arg("--part");
  const out=path.resolve(process.env.IDENTITY_CREATION_EVIDENCE||"output/refactor-r4b2-20261025");await mkdir(out,{recursive:true});
  const load=(file:string)=>import(pathToFileURL(path.join(root,file)).href);
  if(!part){
    let checks=0;
    for(const p of parts){
      const args=["--conditions=react-server","--import","tsx",path.resolve("scripts/verify-identity-creation-boundaries-pg.ts"),"--source-root",root,"--part",p,...(baseline?["--baseline"]:[])];
      const child=spawn(process.execPath,args,{env:{...process.env,TSX_TSCONFIG_PATH:path.join(root,"tsconfig.json")},windowsHide:true,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";
      child.stdout.on("data",v=>stdout+=v);child.stderr.on("data",v=>stderr+=v);
      const code=await new Promise<number|null>((resolve,reject)=>{child.once("error",reject);child.once("close",resolve);});
      await writeFile(path.join(out,`PG_${mode}_${p}.log`),stdout+stderr+`\nEXIT=${code}\n`);process.stdout.write(stdout);process.stderr.write(stderr);assert.equal(code,0,p);checks+=Number(stdout.match(/CHECKS=(\d+)/)?.[1]||0);
    }
    console.log(`IDENTITY_CREATION_BOUNDARIES_PG=PASS mode=${mode} parts=${parts.length} checks=${checks} SOURCE=FULL_CHECKOUT PG=ACTUAL COLD_AUTH_DEPENDENCY=${baseline?"COUPLED_REPRODUCED":"REMOVED"} SCOPE=ONE_STORE POLICY=CAS_AUTHORIZED WALLET=FROZEN_ONCE UNKNOWN=RETAINED HTTP=ACTUAL SUPPLIER=0 EXTERNAL=0`);return;
  }
  assert.ok(parts.includes(part));let checks=0,external=0;
  const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;},ok=(a:unknown)=>{assert.ok(a);checks++;};
  const rejects=async(p:Promise<unknown>,pattern?:RegExp)=>{if(pattern)await assert.rejects(p,pattern);else await assert.rejects(p);checks++;};
  const throws=(f:()=>unknown,pattern?:RegExp)=>{if(pattern)assert.throws(f,pattern);else assert.throws(f);checks++;};
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;delete process.env.NAUMI_MULTI_USER;
  if(part==="mode-supabase")Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:"https://supabase.fixture.invalid",NEXT_PUBLIC_SUPABASE_ANON_KEY:"fixture-public-key",NAUMI_MULTI_USER:"1"});
  Object.assign(process.env,{SETTINGS_SECRET:"identity-creation-fixture-012345678901234567890",NAUMI_VIDEO_WORKER:"0"});
  const schema="identity_"+randomUUID().replaceAll("-",""),admin=new Pool({connectionString:connection,ssl:false});await admin.query(`CREATE SCHEMA ${schema}`);process.env.PGOPTIONS=`-c search_path=${schema}`;
  const originalFetch=globalThis.fetch;globalThis.fetch=(async()=>{external++;throw Error("External request forbidden by local identity fixture");}) as typeof fetch;
  let db:typeof import("../src/lib/db")|undefined,appPool:Pool|undefined;
  const owner="owner@identity.fixture",other="other@identity.fixture",adminEmail="admin@identity.fixture";
  const personal=():CreationContext=>({actorEmail:owner,scopeKind:"personal",tenantId:null});
  try{
    const pool=(await load("src/platform/db/pool.ts")).getPool() as Pool;appPool=pool;
    const scopePath=baseline?"src/lib/saas/creation-context.ts":"src/lib/saas/creation-scope.ts";
    const accessPath=baseline?"src/lib/saas/creation-context.ts":"src/lib/saas/creation-access.ts";
    const policyPath=baseline?"src/lib/feature-access/server.ts":"src/lib/feature-access/repository.ts";
    if(part==="cold"){
      // Import the actual owner first; a legacy facade must not mask its dependencies.
      const scope=await load(scopePath),req=createRequire(path.join(root,"package.json"));eq(typeof scope.currentCreationContext,"function");eq(pool.totalCount,0);
      const cached=()=>Object.keys(req.cache).map(p=>p.replaceAll("\\","/").toLowerCase());
      eq(cached().some(p=>p===path.join(root,"src/lib/admin-auth.ts").replaceAll("\\","/").toLowerCase()),baseline);
      await load(policyPath);eq(pool.totalCount,0);
      const service=await load("src/lib/billing/service.ts");eq(typeof service.createBillingService().reserveTx,"function");eq(pool.totalCount,0);
      eq(cached().some(p=>p===path.join(root,"src/lib/saas/creation-context.ts").replaceAll("\\","/").toLowerCase()),baseline);
      eq((await admin.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema=$1",[schema])).rows[0].n,0);
    }else if(part==="mode-supabase"){
      const account=await load(baseline?"src/lib/native-auth.ts":"src/lib/accounts/mode.ts");eq(await account.multiUserEnabled(),false);eq(pool.totalCount,0);
      if(!baseline)eq((await load("src/lib/native-auth.ts")).multiUserEnabled,account.multiUserEnabled);
    }else{
      db=await load("src/lib/db.ts");await db!.ensureSchema();
      const schemaApi=await load("src/lib/saas/creation-schema.ts");await schemaApi.ensureCreationSchema();
      const runtime=await(await load("src/lib/billing/runtime.ts")).getBillingRuntime();
      const publish=async(change:(config:BillingConfig)=>void)=>{const snap=await runtime.config.current(),config=structuredClone(snap.config);change(config);return runtime.config.publish({id:randomUUID(),actor:"fixture",reason:"isolated R4B2 fixture",expectedVersion:snap.version,config});};
      await publish(c=>{c.credits.signup.amount=0;c.switches.metering="legacy-auto";});
      for(const email of [owner,other,adminEmail])await db!.getOrCreateUser(email,email);
      const scope=await load(scopePath),access=await load(accessPath),legacy=await load("src/lib/saas/creation-context.ts");
      const {withTransaction}=await load("src/platform/db/transaction.ts");
      const runTx=<T>(fn:(tx:import("pg").PoolClient)=>Promise<T>):Promise<T>=>withTransaction(pool,fn);
      if(part==="mode"){
        const account=await load(baseline?"src/lib/native-auth.ts":"src/lib/accounts/mode.ts"),meter=await load(baseline?"src/lib/native-auth.ts":"src/lib/billing/metering.ts"),billing=await load("src/lib/billing/runtime.ts");
        const setting=async(k:string,v:string)=>pool.query("INSERT INTO app_settings(k,v) VALUES($1,$2) ON CONFLICT(k) DO UPDATE SET v=excluded.v",[k,v]);
        eq(await account.multiUserEnabled(),false);
        for(const [v,expected] of [["1",true],["true",true],[" true ",true],["0",false],["false",false],["yes",false]] as const){await setting(account.MULTI_USER_SETTING,v);eq(await account.multiUserEnabled(),expected);}
        process.env.NAUMI_MULTI_USER=" 1 ";eq(await account.multiUserEnabled(),true);delete process.env.NAUMI_MULTI_USER;await setting(account.MULTI_USER_SETTING,"0");
        await runTx(async tx=>{await tx.query("UPDATE app_settings SET v='1' WHERE k=$1",[account.MULTI_USER_SETTING]);eq(await account.multiUserEnabled(tx),true);throw Error("fixture mode rollback");}).catch(e=>{assert.match(e.message,/fixture mode rollback/);checks++;});eq(await account.multiUserEnabled(),false);
        await setting(meter.CREDITS_METERING_SETTING,"true");eq(await meter.creditsMeteringOn(),true);eq(await billing.meteringFor(await runtime.config.current()),true);
        await setting(meter.CREDITS_METERING_SETTING,"0");eq(await meter.creditsMeteringOn(),false);
        await setting(account.MULTI_USER_SETTING,"true");eq(await meter.creditsMeteringOn(),false);eq(await billing.meteringFor(await runtime.config.current()),true);
        await publish(c=>{c.switches.metering="off";});eq(await meter.creditsMeteringOn(),false);eq(await billing.meteringFor(await runtime.config.current()),false);
        await publish(c=>{c.switches.metering="on";});eq(await meter.creditsMeteringOn(),true);eq(await billing.meteringFor(await runtime.config.current()),true);
        if(!baseline){const native=await load("src/lib/native-auth.ts");eq(native.multiUserEnabled,account.multiUserEnabled);eq(native.creditsMeteringOn,meter.creditsMeteringOn);}
      }else if(part==="scope"){
        eq(scope.currentCreationContext(),undefined);eq(scope.frozenCreationScope(null),undefined);eq(scope.frozenCreationScope(personal(),owner),personal());
        throws(()=>scope.frozenCreationScope({...personal(),tenantId:randomUUID()},owner),/冻结创作归属无效/);throws(()=>scope.frozenCreationScope(personal(),other),/冻结创作归属无效/);
        const parent=personal();await scope.withFrozenCreation(parent,async()=>{
          eq(scope.currentCreationContext(),parent);eq(legacy.currentCreationContext(),parent);
          await scope.withoutCreationContext(async()=>{eq(scope.currentCreationContext(),undefined);});eq(scope.currentCreationContext(),parent);
          await scope.withFrozenCreation(undefined,async()=>eq(scope.currentCreationContext(),undefined));eq(scope.currentCreationContext(),parent);
          await rejects(scope.withFrozenCreation({...personal(),requestText:"child"},async()=>{eq(scope.currentCreationContext().requestText,"child");throw Error("nested failure");}),/nested failure/);eq(scope.currentCreationContext(),parent);
          await Promise.all(Array.from({length:8},(_,i)=>scope.withFrozenCreation({...personal(),requestText:String(i)},async()=>{await new Promise(resolve=>setImmediate(resolve));eq(scope.currentCreationContext().requestText,String(i));eq(legacy.currentCreationContext().requestText,String(i));})));
          eq(scope.currentCreationContext(),parent);
        });eq(scope.currentCreationContext(),undefined);
        for(const name of ["currentCreationContext","withFrozenCreation","withoutCreationContext","frozenCreationScope","creationId"])eq(legacy[name],scope[name]);
        for(const name of ["assertCreationFeature","bindCreationParent","bindActualCreationProject","assertCreationProjectInput","bindCreationMedia","assertCurrentCreationFeature"])eq(legacy[name],access[name]);
        ok(/^cr-[0-9a-f-]{36}$/.test(scope.creationId()));
      }else if(part==="session"){
        const native=await load("src/lib/native-auth.ts"),auth=await load("src/lib/admin-auth.ts"),now=Date.now(),token=native.signUserSession(owner,now);
        const request=(value=token)=>new Request("http://fixture.test/api/imagegen",{headers:{cookie:`nv_user=${value}`}});
        eq(native.verifyUserSession(token,now),owner);eq(native.verifyUserSession(token,now+native.USER_TTL_MS+1),null);eq(native.verifyUserSession(token.slice(0,-1)+(token.endsWith("0")?"1":"0"),now),null);
        eq(await native.activeNativeUserEmail(request()),owner);eq(await auth.resolveUserEmail(request()),owner);eq(await auth.requireAdmin(request()),false);
        await pool.query("UPDATE app_users SET banned=true WHERE email=$1",[owner]);eq(await native.activeNativeUserEmail(request()),null);eq(await auth.resolveUserEmail(request()),null);await pool.query("UPDATE app_users SET banned=false,auth_revoked_before=now()+interval '1 second' WHERE email=$1",[owner]);eq(await native.activeNativeUserEmail(request()),null);
        await pool.query("UPDATE app_users SET auth_revoked_before=NULL,account_expires_at=now()-interval '1 second' WHERE email=$1",[owner]);eq(await native.activeNativeUserEmail(request()),null);await pool.query("UPDATE app_users SET account_expires_at=NULL,role='admin' WHERE email=$1",[owner]);eq(await auth.requireAdmin(request()),true);
        const reset=native.signResetToken(owner,now);eq(native.verifyResetToken(reset,now),owner);eq(native.verifyResetToken(reset,now+native.RESET_TTL_MS+1),null);eq(native.verifyUserSession(reset,now),null);eq(native.verifyResetToken(token,now),null);
        await auth.setAdminPassword("identity-fixture-password");eq(await auth.requireAdmin(request()),false);const adminToken=await auth.authenticateAdminPassword("identity-fixture-password");ok(adminToken);eq(await auth.requireAdmin(new Request("http://fixture.test/admin",{headers:{cookie:`nv_admin=${adminToken}`}})),true);
        eq(await native.activeNativeAccountEmail(other),other);eq(await native.activeNativeAccountEmail("absent@identity.fixture"),null);
      }else if(part==="policy"){
        const repo=await load(policyPath),server=await load("src/lib/feature-access/server.ts"),native=await load("src/lib/native-auth.ts");
        for(const name of ["FeatureAccessError","ensureFeatureAccessSchema","policyFromRow","userFeaturePolicy","featureAccessUsers","validatePolicyCommand","saveFeaturePolicy"])eq(server[name],repo[name]);
        eq((await repo.userFeaturePolicy(owner)).version,0);throws(()=>repo.policyFromRow({mode:"custom",allowed:["not-a-feature"],version:0}),/权限配置异常/);
        const command={id:randomUUID(),email:owner.toUpperCase(),mode:"custom",allowed:["canvas","generate"],expectedVersion:0};const saved=await repo.saveFeaturePolicy(adminEmail,command);eq(saved.version,1);eq(await repo.saveFeaturePolicy(adminEmail,command),saved);
        await rejects(repo.saveFeaturePolicy(other,command),/请求标识/);await rejects(repo.saveFeaturePolicy(adminEmail,{...command,id:randomUUID()}),/权限已更新/);
        const raced=await Promise.allSettled(["canvas","generate"].map(id=>repo.saveFeaturePolicy(adminEmail,{...command,id:randomUUID(),allowed:[id],expectedVersion:1})));eq(raced.filter(x=>x.status==="fulfilled").length,1);eq((await repo.userFeaturePolicy(owner)).version,2);
        await pool.query("CREATE FUNCTION reject_policy_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit fault'; END $$; CREATE TRIGGER policy_fault BEFORE INSERT ON app_feature_access_audit FOR EACH ROW EXECUTE FUNCTION reject_policy_audit()");
        await rejects(repo.saveFeaturePolicy(adminEmail,{...command,id:randomUUID(),email:other,expectedVersion:0}),/fixture audit fault/);eq((await repo.userFeaturePolicy(other)).version,0);await pool.query("DROP TRIGGER policy_fault ON app_feature_access_audit; DROP FUNCTION reject_policy_audit()");
        const cookie=`nv_user=${native.signUserSession(owner,Date.now())}`,request=(p:string)=>new Request(`http://fixture.test${p}`,{headers:{cookie}});
        const own=await load("src/app/api/feature-access/route.ts"),res=await own.GET(request(`/api/feature-access?email=${other}`));eq(res.status,200);eq((await res.json()).email,owner);eq((await own.GET(new Request("http://fixture.test/api/feature-access"))).status,401);
        eq((await server.featureRequestGate(request("/api/cutout"))).status,403);await rejects(server.assertAgentToolAccess(owner,"generate_image"),/授权/);
        const users=await repo.featureAccessUsers("owner@identity",1);eq(users.total,1);eq(users.users[0].email,owner);eq(users.users[0].policy.version,2);
      }else if(part==="project"){
        const writer=await load("src/lib/saas/creation-writer.ts"),key="tree:text-root";await pool.query("INSERT INTO app_canvas_text_nodes(id,email,project_key) VALUES('text-root',$1,$2),('legacy-root',$1,'tree:legacy-root')",[owner,key]);
        await scope.withFrozenCreation(personal(),async()=>{await access.bindActualCreationProject(owner,key);eq(scope.currentCreationContext().parentContext,key);});eq((await pool.query("SELECT scope_kind FROM app_creation_contexts WHERE context_id=$1",[key])).rows[0].scope_kind,"personal");
        await rejects(scope.withFrozenCreation({...personal(),actorEmail:other},()=>access.bindActualCreationProject(other,key)),/不存在或无权/);
        const tenant=randomUUID();await rejects(access.bindCreationParent({...personal(),scopeKind:"tenant",tenantId:tenant},key),/已固定/);
        await rejects(scope.withFrozenCreation({...personal(),scopeKind:"tenant",tenantId:tenant,workspaceExplicit:true},()=>access.bindActualCreationProject(owner,key)),/已固定/);
        await scope.withFrozenCreation(personal(),()=>access.bindActualCreationProject(owner,"tree:legacy-root",{receipt:true}));eq((await pool.query("SELECT count(*)::int n FROM app_creation_contexts WHERE context_id='tree:legacy-root'")).rows[0].n,0);
        const newKey="tree:transaction-root";await rejects(scope.withFrozenCreation(personal(),()=>runTx(async tx=>{await access.bindActualCreationProject(owner,newKey,{tx,newRoot:true});throw Error("fixture project rollback");})),/fixture project rollback/);eq((await pool.query("SELECT count(*)::int n FROM app_creation_contexts WHERE context_id=$1",[newKey])).rows[0].n,0);
        await scope.withFrozenCreation({...personal(),scopeKind:"tenant",tenantId:tenant},()=>access.bindCreationMedia(owner,"asset-fixture"));await rejects(scope.withFrozenCreation(personal(),()=>access.bindCreationMedia(owner,"asset-fixture")),/其他企业/);await rejects(scope.withFrozenCreation(personal(),()=>access.bindCreationMedia(other,"foreign")),/操作者不一致/);
        throws(()=>access.assertCreationFeature({creation:false},"/api/imagegen"),/权益已关闭/);access.assertCreationFeature({generate:true},"/api/imagegen");checks++;
        let continuation="";await legacy.withCreationRequest(new Request("http://fixture.test/api/imagegen",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({prompt:"original prompt",count:0,parameters:{moderation:false}})}),owner,async()=>{
          eq(scope.currentCreationContext().requestText,"original prompt");eq(scope.currentCreationContext().parameters.count,0);const id=await writer.startCreation("r4b2-request","request-one",owner);ok(id);continuation=legacy.creationContinuationHeader()["x-naumi-creation-context"];return Response.json({id});
        });
        const continued=()=>new Request("http://fixture.test/api/imagegen",{method:"POST",headers:{"x-naumi-creation-context":continuation}});
        await legacy.withCreationRequest(continued(),owner,async()=>{eq(scope.currentCreationContext().actorEmail,owner);ok(scope.currentCreationContext().creationId);return Response.json({ok:true});});
        await rejects(legacy.withCreationRequest(continued(),other,async()=>Response.json({})),/创作上下文无效/);await rejects(legacy.withCreationRequest(new Request("http://fixture.test/api/imagegen",{method:"POST",headers:{"x-naumi-creation-context":continuation+"bad"}}),owner,async()=>Response.json({})),/创作上下文无效/);
      }else if(part==="billing"){
        const {fixtureConfig,facts}=await load("scripts/billing-unit-fixture.ts"),{quote}=await load("src/lib/billing/quote.ts");
        const service:BillingService=(await load("src/lib/billing/service.ts")).createBillingService();const q=quote({version:7,config:fixtureConfig()},facts());eq(q.requestedCredits,6);
        const fund=async(email:string,n:number)=>{await pool.query("DELETE FROM app_ledger WHERE email=$1",[email]);await pool.query("DELETE FROM app_credit_batches WHERE email=$1",[email]);await pool.query("UPDATE app_users SET credits_total=$2,credits_used=0 WHERE email=$1",[email,n]);if(n)await pool.query("INSERT INTO app_credit_batches(id,email,amount,remaining,source,expires_at) VALUES($1,$2,$3,$3,'admin',now()+interval '1 year')",[randomUUID(),email,n]);};await fund(owner,30);await fund(other,5);
        const make=(email=owner):OperationInput=>{const id=randomUUID();return {id,email,quote:q,reason:"R4B2 fixture",ledgerId:`led-${id}`,fingerprint:id};};
        const op=make(),context={...personal(),requestText:"frozen purchase",parameters:{count:0,moderation:false}};
        await scope.withFrozenCreation(context,()=>runTx(tx=>service.reserveTx(tx,op)));await scope.withFrozenCreation(context,()=>runTx(tx=>service.reserveTx(tx,op)));
        eq((await pool.query("SELECT count(*)::int n FROM app_creation_links WHERE target_type='billing' AND target_id=$1",[op.id])).rows[0].n,1);eq((await pool.query("SELECT count(*)::int n FROM app_gen_reservations WHERE job_id=$1",[op.id])).rows[0].n,1);
        await publish(c=>{c.features["image.generate"].pricing={mode:"fixed",credits:99};});
        const result:BillingResult={state:"succeeded",items:[{id:"delivered-result",state:"succeeded",executedQuality:"medium"}]};const first=await runTx(tx=>service.settleTx(tx,op,result));eq(first.charge,6);eq((await runTx(tx=>service.settleTx(tx,op,result))).replayed,true);
        const row=(await pool.query("SELECT quote,charged_credits,state FROM app_billing_operations WHERE id=$1",[op.id])).rows[0];eq(row.quote.configVersion,7);eq(row.quote.requestedCredits,6);eq(row.charged_credits,6);eq(row.state,"settled");eq((await pool.query("SELECT count(*)::int n,sum(delta)::int delta FROM app_ledger WHERE id=$1",[op.ledgerId])).rows[0],{n:1,delta:-6});
        eq((await pool.query("SELECT request_snapshot,parameters_snapshot FROM app_creation_records WHERE id=$1",[(context as CreationContext).creationId])).rows[0].request_snapshot.text,"frozen purchase");
        const poor=make(other);await rejects(scope.withFrozenCreation({...personal(),actorEmail:other},()=>runTx(tx=>service.reserveTx(tx,poor))),/可用积分不足/);eq((await pool.query("SELECT count(*)::int n FROM app_billing_operations WHERE id=$1",[poor.id])).rows[0].n,0);
        const rolled=make();await rejects(scope.withFrozenCreation(personal(),()=>runTx(async tx=>{await service.reserveTx(tx,rolled);throw Error("fixture reserve rollback");})),/fixture reserve rollback/);eq((await pool.query("SELECT count(*)::int n FROM app_creation_links WHERE target_id=$1",[rolled.id])).rows[0].n,0);eq((await pool.query("SELECT count(*)::int n FROM app_billing_operations WHERE id=$1",[rolled.id])).rows[0].n,0);
        const unknown=make();await scope.withFrozenCreation(personal(),()=>runTx(tx=>service.reserveTx(tx,unknown)));const held=await runTx(tx=>service.settleTx(tx,unknown,{state:"unknown",items:[{id:"uncertain-original",state:"unknown"}]}));eq(held.charge,0);eq(held.state,q.tariff.settlement.unknown);eq((await pool.query("SELECT count(*)::int n FROM app_gen_reservations WHERE job_id=$1",[unknown.id])).rows[0].n,1);eq((await runTx(tx=>service.reserveTx(tx,unknown))).replayed,true);
        await rejects(runTx(tx=>service.reserveTx(tx,{...unknown,email:other})),/该操作编号/);eq((await pool.query("SELECT count(*)::int n FROM app_billing_operations WHERE email=$1",[owner])).rows[0].n,2);
      }
    }
    eq(external,0);console.log(`IDENTITY_PART=${part} MODE=${mode} CHECKS=${checks} RESULT=PASS`);
  }finally{
    globalThis.fetch=originalFetch;if(appPool)await appPool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();console.log(`IDENTITY_CLEANUP=${part} SCHEMA_DROPPED=1 POOLS_CLOSED=1 EXTERNAL=${external}`);
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
