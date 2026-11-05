/** R4A7 real PostgreSQL/full-checkout A/B. Existing commercial/admin behavior,
 * owner exports and actual HTTP handlers. No payment/model network requests. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {Pool} from "pg";

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const parts=["health","health-disabled","card-license","orders","admin","legacy"];
async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");assert.equal(new URL(process.env.DATABASE_URL!).hostname,"127.0.0.1");
  const root=path.resolve(arg("--source-root")||"."),baseline=process.argv.includes("--baseline"),mode=baseline?"BASELINE":"MODIFIED",part=arg("--part");
  const out=path.resolve(process.env.COMMERCIAL_EVIDENCE||"output/refactor-r4a7-20261025"),load=(file:string)=>import(pathToFileURL(path.join(root,file)).href);
  await mkdir(out,{recursive:true});
  if(!part){
    let checks=0;
    for(const p of parts){
      const args=["--conditions=react-server","--import","tsx",path.resolve("scripts/verify-commercial-admin-owners-pg.ts"),"--source-root",root,"--part",p,...(baseline?["--baseline"]:[])];
      const child=spawn(process.execPath,args,{env:{...process.env,TSX_TSCONFIG_PATH:path.join(root,"tsconfig.json")},windowsHide:true,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";
      child.stdout.on("data",v=>stdout+=v);child.stderr.on("data",v=>stderr+=v);const code=await new Promise<number|null>((resolve,reject)=>{child.once("error",reject);child.once("exit",resolve);});
      await writeFile(path.join(out,`PG_${mode}_${p}.log`),stdout+stderr+`\nEXIT=${code}\n`);process.stdout.write(stdout);process.stderr.write(stderr);assert.equal(code,0,p);checks+=Number(stdout.match(/CHECKS=(\d+)/)?.[1]||0);
    }
    console.log(`COMMERCIAL_ADMIN_OWNERS_PG=PASS mode=${mode} parts=${parts.length} checks=${checks} SOURCE=FULL_CHECKOUT PG=ACTUAL CONTRACT=ORIGINAL GRANT=ONCE ATOMIC_ROLLBACK=PASS UNKNOWN=NO_REPLAY HEALTH=PROBE_NO_DDL HTTP=ACTUAL_HANDLERS SUPPLIER=0 PAYMENT_NETWORK=0`);return;
  }
  assert.ok(parts.includes(part));
  let checks=0,external=0;
  const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;},ok=(a:unknown)=>{assert.ok(a);checks++;};
  const rejects=async(p:Promise<unknown>,pattern?:RegExp)=>{if(pattern)await assert.rejects(p,pattern);else await assert.rejects(p);checks++;};
  if(part==="health-disabled"){
    process.env.DATABASE_URL="";const db=await load("src/lib/db.ts"),api=baseline?db:await load("src/platform/db/pool.ts");eq(db.dbEnabled,false);eq(await api.pingDb(),{ok:false,error:"DATABASE_URL 未配置"});
    if(!baseline)eq(db.pingDb,api.pingDb);console.log(`COMMERCIAL_PART=${part} MODE=${mode} CHECKS=${checks} RESULT=PASS`);return;
  }
  const schema="commercial_"+randomUUID().replaceAll("-",""),admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});await admin.query(`CREATE SCHEMA ${schema}`);
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,NAUMI_MULTI_USER:"1",SETTINGS_SECRET:"commercial-owner-fixture-012345678901234567890"});
  const realFetch=globalThis.fetch;globalThis.fetch=(async()=>{external++;throw Error("No external requests in commercial-owner fixture");}) as typeof fetch;
  let db:typeof import("../src/lib/db")|undefined,poolEnded=false;
  const owner="commercial-owner@fixture.test",other="commercial-other@fixture.test";
  try{
    db=await load("src/lib/db.ts");const pool=db!.getPool();
    const modules=baseline?[db!]:await Promise.all(["src/platform/db/pool.ts","src/lib/billing/card-keys.ts","src/lib/licensing/repository.ts","src/lib/accounts/administration.ts","src/lib/payments/orders.ts","src/lib/billing/legacy-credit-reservation.ts"].map(load));
    const api=Object.assign({},...modules) as typeof import("../src/lib/db");
    if(part==="health"){
      eq(pool.totalCount,0);eq(await api.pingDb(),{ok:true});
      eq((await pool.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema=current_schema()")).rows[0].n,0);
      eq(api.getPool(),pool);
      const {GET}=await load("src/app/api/health/route.ts"),response=await GET();eq(response.status,200);eq((await response.json()).db.ok,true);
      await pool.end();poolEnded=true;const failed=await api.pingDb();eq(failed.ok,false);ok(failed.error);
    }else{
      await db!.ensureSchema();
      if(!baseline&&part==="card-license")for(const m of modules)for(const [name,fn] of Object.entries(m))if(typeof fn==="function"&&name in db!)eq(fn,(db as unknown as Record<string,unknown>)[name]);
      const runtime=await(await load("src/lib/billing/runtime.ts")).getBillingRuntime(),initial=await runtime.config.current();
      await runtime.config.publish({id:randomUUID(),expectedVersion:initial.version,actor:"fixture",reason:"isolated commercial fixture",config:{...initial.config,credits:{...initial.config.credits,signup:{amount:0,expiry:{unit:"days",value:30}}},switches:{...initial.config.switches,metering:"on"}}});
      const publish=async(change:(c:typeof initial.config)=>void)=>{const snap=await runtime.config.current(),config=structuredClone(snap.config);change(config);return runtime.config.publish({id:randomUUID(),expectedVersion:snap.version,actor:"fixture",reason:"fixture change",config});};
      const fund=async(email:string,amount:number)=>{
        await db!.getOrCreateUser(email);await pool.query("DELETE FROM app_ledger WHERE email=$1",[email]);await pool.query("DELETE FROM app_credit_batches WHERE email=$1",[email]);await pool.query("UPDATE app_users SET credits_total=$2,credits_used=0 WHERE email=$1",[email,amount]);
        if(amount)await pool.query("INSERT INTO app_credit_batches(id,email,amount,remaining,source,expires_at) VALUES($1,$2,$3,$3,'admin',now()+interval '1 year')",[randomUUID(),email,amount]);
      };
      await fund(owner,20);await fund(other,10);
      if(part==="card-license"){
        await publish(c=>{c.credits.redeem={unit:"days",value:7};});
        await rejects(api.generateCardKeys({credits:0,count:1,expiryDays:null,batch:"invalid",note:""}));
        const cards=await api.generateCardKeys({credits:8,count:4,expiryDays:null,batch:"owned",note:"exact-note",actor:"fixture"});eq(cards.length,4);eq(new Set(cards.map(c=>c.code)).size,4);ok(cards.every(c=>/^NOVA(?:-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}){3}$/.test(c.code)));eq(cards[0].billing_grant?.expiry,{unit:"days",value:7});eq(cards[0].note,"exact-note");eq(cards[0].expires_at,null);
        await publish(c=>{c.credits.redeem={unit:"days",value:40};});
        const redeemed=await Promise.all(Array.from({length:4},()=>api.redeemCardKey(" "+cards[0].code.toLowerCase()+" ",owner.toUpperCase())));ok(redeemed.every(r=>r.credits===8));
        const grant=(await pool.query("SELECT amount,expires_at,created_at FROM app_credit_batches WHERE id=$1",[`bat-redeem-${cards[0].code}`])).rows;eq(grant.length,1);eq(grant[0].amount,8);ok(Math.abs(new Date(grant[0].expires_at).getTime()-new Date(grant[0].created_at).getTime()-7*86400000)<5000);
        await rejects(api.redeemCardKey(cards[0].code,other),/已被使用/);await api.setCardKeyStatus(cards[0].code,"disabled");eq((await api.listCardKeys()).find(c=>c.code===cards[0].code)?.status,"used");
        await api.setCardKeyStatus(cards[1].code,"disabled");await rejects(api.redeemCardKey(cards[1].code,owner),/停用/);await api.setCardKeyStatus(cards[1].code,"unused");
        const ledgerId=`led-redeem-${cards[1].code}`;await pool.query("INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES($1,$2,0,'injection','grant')",[ledgerId,owner]);await rejects(api.redeemCardKey(cards[1].code,owner));eq((await api.listCardKeys()).find(c=>c.code===cards[1].code)?.status,"unused");eq((await pool.query("SELECT count(*)::int n FROM app_credit_batches WHERE id=$1",[`bat-redeem-${cards[1].code}`])).rows[0].n,0);await pool.query("DELETE FROM app_ledger WHERE id=$1",[ledgerId]);await api.redeemCardKey(cards[1].code,owner);
        await pool.query("UPDATE app_card_keys SET expires_at=now()-interval '1 second' WHERE code=$1",[cards[2].code]);await rejects(api.redeemCardKey(cards[2].code,owner),/过期/);await rejects(api.redeemCardKey("missing",owner),/不存在/);eq(await api.cardKeyStats(),{issued:4,used:2,creditsRedeemed:16});
        const licenses=await api.generateLicenses({count:2,deviceLimit:2,expiryDays:null,batch:"license-fixture",note:"original"}),key=licenses[0].key;eq(licenses.length,2);ok(/^NOVA(?:-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}){4}$/.test(key));eq(await api.validateLicense(" "+key.toLowerCase()+" "),{ok:true,key,tier:"pro",expiresAt:null});eq((await api.validateLicense("")).ok,false);eq((await api.validateLicense("missing")).ok,false);
        const first=await api.activateLicense(key," HOST-ONE ");ok(first.ok);eq(first.ok&&first.activatedDevices,1);eq((await api.activateLicense(key,"host-one")).ok,true);eq((await api.activateLicense(key,"host-two")).ok,true);eq((await api.activateLicense(key,"host-three")).ok,false);eq((await api.activateLicense(key,"")).ok,false);
        const activations=await api.licenseActivations(key);eq(activations.length,2);ok(activations.every(a=>a.active&&Number.isFinite(Date.parse(a.activatedAt))&&Number.isFinite(Date.parse(a.lastSeen))));eq((await api.listLicenses()).find(l=>l.key===key)?.activations,2);
        const route=await load("src/app/api/license/activate/route.ts"),request=(host:string,k=key)=>new Request("http://fixture.test/api/license/activate",{method:"POST",headers:{"content-type":"application/json","x-real-ip":"192.0.2.45"},body:JSON.stringify({key:k,host})});eq((await route.POST(request("host-one"))).status,200);eq((await route.POST(request("host-three"))).status,400);
        await api.setLicenseStatus(key.toLowerCase(),"revoked");eq((await api.validateLicense(key)).ok,false);eq((await api.activateLicense(key,"host-one")).ok,false);eq(await api.licenseStats(),{issued:2,active:1,revoked:1,activations:2});
        await pool.query("UPDATE app_licenses SET expires_at=now()-interval '1 second' WHERE key=$1",[licenses[1].key]);eq((await api.validateLicense(licenses[1].key)).ok,false);
      }else if(part==="orders"){
        await publish(c=>{c.products["c-990"]={...c.products["c-990"],baseCredits:17,bonusCredits:0,amountFen:990,expiry:{unit:"days",value:7}};});
        const payments=await load("src/lib/payments.ts"),product=await payments.resolveItem("pack","c-990");ok(product);const order=await api.createOrder({email:owner.toUpperCase(),...product});eq(order.email,owner);eq(order.status,"pending");eq(order.amount,990);eq(order.credits,17);eq(order.billingQuote,product.billingQuote);ok(Number.isFinite(Date.parse(order.createdAt)));eq(order.paidAt,null);eq(await api.getOrder("missing"),null);eq((await api.fulfillOrder("missing","fixture")).ok,false);
        await publish(c=>{c.products["c-990"].amountFen=1490;c.products["c-990"].baseCredits=99;c.products["c-990"].expiry={unit:"days",value:40};});
        eq((await api.fulfillOrder(order.id,"fixture","wrong",991)).ok,false);eq((await api.getOrder(order.id))?.status,"pending");eq((await pool.query("SELECT count(*)::int n FROM app_credit_batches WHERE order_id=$1",[order.id])).rows[0].n,0);
        const done=await Promise.all(Array.from({length:4},()=>api.fulfillOrder(order.id,"fixture","original-txn",990)));eq(done.filter(r=>r.alreadyPaid).length,3);ok(done.every(r=>r.ok));const paid=await api.getOrder(order.id);eq(paid?.billingQuote,product.billingQuote);eq(paid?.amount,990);eq(paid?.providerTxn,"original-txn");eq(paid?.status,"paid");ok(paid?.paidAt);
        const grants=(await pool.query("SELECT amount,expires_at,created_at FROM app_credit_batches WHERE order_id=$1",[order.id])).rows;eq(grants.length,1);eq(grants[0].amount,17);ok(Math.abs(new Date(grants[0].expires_at).getTime()-new Date(grants[0].created_at).getTime()-7*86400000)<5000);eq((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE id=$1",[`led-order-${order.id}`])).rows[0].n,1);
        const rollback=await api.createOrder({email:owner,...product}),lid=`led-order-${rollback.id}`;await pool.query("INSERT INTO app_ledger(id,email,delta,reason,kind) VALUES($1,$2,0,'injection','purchase')",[lid,owner]);await rejects(api.fulfillOrder(rollback.id,"fixture","rollback",990));eq((await api.getOrder(rollback.id))?.status,"pending");eq((await pool.query("SELECT count(*)::int n FROM app_credit_batches WHERE order_id=$1",[rollback.id])).rows[0].n,0);
        await pool.query("DELETE FROM app_ledger WHERE id=$1",[lid]);await api.fulfillOrder(rollback.id,"fixture","recovered",990);eq((await api.getOrder(rollback.id))?.status,"paid");
        const guest="new-guest@fixture.test",guestOrder=await api.createOrder({email:guest,...product});ok((await api.fulfillOrder(guestOrder.id,"fixture","guest",990)).ok);eq((await db!.getCreditOverview(guest)).balance,17);
        // Historical Pro fulfillment only. Sequential recovery is not a claim
        // that the legacy SELECT-then-INSERT issuer is concurrency-safe.
        const pro=await api.createOrder({email:owner,kind:"pro",itemId:"legacy",title:"Historical Pro",credits:0,amount:100});ok((await api.fulfillOrder(pro.id,"fixture","pro",100)).ok);const key=await api.ensureProLicenseForOrder(pro.id,owner);ok(key);eq(await api.ensureProLicenseForOrder(pro.id,owner),key);eq((await pool.query("SELECT count(*)::int n FROM app_licenses WHERE batch=$1",[pro.id])).rows[0].n,1);eq((await pool.query("SELECT bound_email FROM app_licenses WHERE batch=$1",[pro.id])).rows[0].bound_email,owner);eq((await pool.query("SELECT count(*)::int n FROM app_credit_batches WHERE order_id=$1",[pro.id])).rows[0].n,0);
      }else if(part==="admin"){
        await pool.query("UPDATE app_users SET name='Owner',credits_used=2,note='private-note' WHERE email=$1",[owner]);
        for(const [id,email] of [["one",owner],["two",owner],["three",other]])await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient) VALUES($1,$2,'title','main','','completed','/media/a.png','')",[id,email]);
        for(const [id,email,delta,reason,kind,days] of [["a",owner,-6,"generation","consume",0],["b",other,-4,"tool","consume",0],["c",owner,-99,"管理员调整积分","consume",0],["d",owner,5,"grant","grant",0],["e",owner,-12,"old","consume",60]] as const)await pool.query("INSERT INTO app_ledger(id,email,delta,reason,kind,created_at) VALUES($1,$2,$3,$4,$5,now()-($6::text||' days')::interval)",[id,email,delta,reason,kind,days]);
        const users=await api.listAllUsers();eq(users.length,2);eq(users.find(u=>u.email===owner)?.recent7,6);eq(users.find(u=>u.email===owner)?.note,"private-note");eq(users.find(u=>u.email===owner)?.artworks,2);eq(await api.adminStats(),{users:2,remaining:28,used:2,artworks:3});
        const usage=await api.adminUsageSummary();eq(usage.rangeDays,30);eq(usage.totals,{credits:10,operations:2,activeUsers:2});eq(usage.daily.reduce((n,d)=>n+d.credits,0),10);eq((await api.adminUsageSummary(999)).rangeDays,365);eq((await api.adminUsageSummary(-1)).rangeDays,1);
        await rejects(api.setOwnerAccount(owner,owner,"fixture-hash"),/相同/);await rejects(api.setOwnerAccount(owner,other,"fixture-hash"),/已被注册/);eq((await api.listAllUsers()).length,2);
        // Original early-installation fallback, not populated-account migration.
        const fresh="fresh-owner@fixture.test";await api.setOwnerAccount("absent@fixture.test",fresh,"fixture-password-hash");const created=(await pool.query("SELECT role,password_hash FROM app_users WHERE email=$1",[fresh])).rows[0];eq(created,{role:"admin",password_hash:"fixture-password-hash"});
        await pool.query(`CREATE FUNCTION fixture_block_delete() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture deletion failure';END$$;CREATE TRIGGER fixture_block_delete BEFORE DELETE ON app_users FOR EACH ROW EXECUTE FUNCTION fixture_block_delete();`);
        const before=async()=>({users:(await pool.query("SELECT count(*)::int n FROM app_users")).rows[0].n,artworks:(await pool.query("SELECT count(*)::int n FROM app_artworks")).rows[0].n,ledger:(await pool.query("SELECT count(*)::int n FROM app_ledger")).rows[0].n});const original=await before();await rejects(api.deleteUser(owner),/fixture deletion failure/);eq(await before(),original);await pool.query("DROP TRIGGER fixture_block_delete ON app_users");
        await pool.query("INSERT INTO app_invoices(id,email,plan,amount) VALUES('invoice',$1,'starter',100)",[owner]);await api.deleteUser(owner.toUpperCase());eq((await pool.query("SELECT count(*)::int n FROM app_users WHERE email=$1",[owner])).rows[0].n,0);eq((await pool.query("SELECT count(*)::int n FROM app_artworks WHERE email=$1",[owner])).rows[0].n,0);eq((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE email=$1",[owner])).rows[0].n,0);eq((await pool.query("SELECT count(*)::int n FROM app_invoices WHERE email=$1",[owner])).rows[0].n,0);eq((await pool.query("SELECT count(*)::int n FROM app_users WHERE email=$1",[other])).rows[0].n,1);
      }else if(part==="legacy"){
        await publish(c=>{c.switches.metering="off";});eq(await api.reserveCredits(owner,999),true);eq((await pool.query("SELECT credits_used FROM app_users WHERE email=$1",[owner])).rows[0].credits_used,0);await api.refundCredits(owner,999);
        await publish(c=>{c.switches.metering="on";});eq(await api.reserveCredits(owner,0),true);const held=await Promise.all(Array.from({length:4},()=>api.reserveCredits(owner.toUpperCase(),6)));eq(held.filter(Boolean).length,3);eq((await pool.query("SELECT credits_used FROM app_users WHERE email=$1",[owner])).rows[0].credits_used,18);eq((await db!.getCreditOverview(owner)).balance,20);eq(await api.reserveCredits(owner,3),false);eq(await api.reserveCredits("absent@fixture.test",1),false);await api.refundCredits(owner,6);eq((await pool.query("SELECT credits_used FROM app_users WHERE email=$1",[owner])).rows[0].credits_used,12);await api.refundCredits(owner,100);eq((await pool.query("SELECT credits_used FROM app_users WHERE email=$1",[owner])).rows[0].credits_used,0);
        await publish(c=>{c.features["tool.upscale"].pricing={mode:"fixed",credits:6};});
        const sync=await load("src/lib/billing/synchronous-operation.ts"),quotes=await load("src/lib/billing/quote.ts"),unit=await load("scripts/billing-unit-fixture.ts"),snapshot=await runtime.config.current(),q=quotes.quote(snapshot,unit.facts({feature:"tool.upscale"})),op=randomUUID();let executions=0;
        const input={email:owner,operationId:op,path:"/api/upscale",feature:"tool.upscale" as const,identity:async()=>({hash:"original-fixture-intent",confirmation:{version:snapshot.version,credits:q.requestedCredits}}),snapshot:async()=>snapshot,quote:async()=>q};
        const action=async()=>{executions++;eq(await sync.configuredToolCost(),6);eq(await api.reserveCredits(owner,999),true);eq((await pool.query("SELECT credits_used FROM app_users WHERE email=$1",[owner])).rows[0].credits_used,6);sync.markBillingUpstream("unknown");await api.refundCredits(owner,6);return {status:500,body:{error:"fixture unknown"}};};
        await sync.withSynchronousOperation(input,action);const state=(await pool.query("SELECT state FROM app_billing_operations WHERE id=$1",["tool-"+op])).rows[0].state;ok(["hold","manual"].includes(state));eq((await pool.query("SELECT credits_used FROM app_users WHERE email=$1",[owner])).rows[0].credits_used,6);eq((await sync.withSynchronousOperation(input,action)).status,409);eq(executions,1);eq((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume' AND email=$1",[owner])).rows[0].n,0);
      }
      eq(pool.waitingCount,0);eq(pool.idleCount,pool.totalCount);
    }
    eq(external,0);console.log(`COMMERCIAL_PART=${part} MODE=${mode} CHECKS=${checks} RESULT=PASS`);
  }finally{
    globalThis.fetch=realFetch;if(db&&!poolEnded)await db.getPool().end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();console.log(`COMMERCIAL_CLEANUP=${part} SCHEMA_DROPPED=1 POOLS_CLOSED=1`);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
