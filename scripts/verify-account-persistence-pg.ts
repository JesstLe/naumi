/** Full-source A/B of account/wallet/payment/provider owners against isolated PG.
 * A baseline is the complete saved checkout, never a mixed-source projection. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {Pool,type PoolClient} from "pg";

const arg=(n:string)=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];};
const baseline=process.argv.includes("--baseline"),mode=baseline?"BASELINE":"MODIFIED";
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");
 assert.equal(new URL(process.env.DATABASE_URL!).hostname,"127.0.0.1");
 const root=path.resolve(arg("--source-root")||"."),out=path.resolve(process.env.ACCOUNT_EVIDENCE||"output/refactor-r4a3-20261024"),scenario=arg("--scenario");
 const load=(file:string)=>import(pathToFileURL(path.join(root,file)).href);
 await mkdir(out,{recursive:true});
 if(!scenario){
  let total=0;for(const current of ["account","login"]){
   const args=["--conditions=react-server","--import","tsx",path.resolve("scripts/verify-account-persistence-pg.ts"),"--source-root",root,"--scenario",current,...(baseline?["--baseline"]:[])];
   const child=spawn(process.execPath,args,{windowsHide:true,env:{...process.env,TSX_TSCONFIG_PATH:path.join(root,"tsconfig.json")},stdio:["ignore","pipe","pipe"]});
   let stdout="",stderr="";child.stdout.on("data",v=>stdout+=v);child.stderr.on("data",v=>stderr+=v);
   const exit=await new Promise<number|null>((resolve,reject)=>{child.once("error",reject);child.once("exit",resolve);});
   await writeFile(path.join(out,`PG_${mode}_${current}.log`),stdout+stderr+`\nEXIT=${exit}\n`);process.stdout.write(stdout);process.stderr.write(stderr);assert.equal(exit,0,current);total+=Number(stdout.match(/CHECKS=(\d+)/)?.[1]||0);
  }
  console.log(`ACCOUNT_PERSISTENCE_PG=PASS mode=${mode} scenarios=2 checks=${total} SOURCE=FULL_CHECKOUT REAL_PG=1 SIGNUP_CONCURRENT=8 SINGLE_GRANT=1 SETTLEMENT=ONCE WALLET_LOCK=ACTUAL PROVIDER_BYTES=EXACT NEW_BYOK=RETIRED EXTERNAL=0`);return;
 }
 const schema=`account_${randomUUID().replaceAll("-","")}`,admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});
 let db:typeof import("../src/lib/db")|undefined,checks=0;
 const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;},ok=(v:unknown)=>{assert.ok(v);checks++;};
 const reject=async(p:Promise<unknown>,matcher:RegExp|((e:unknown)=>boolean))=>{await assert.rejects(p,matcher);checks++;};
 await admin.query(`CREATE SCHEMA ${schema}`);
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,SETTINGS_SECRET:"account-fixture-only-01234567890123456789012345",NAUMI_MULTI_USER:"1"});
 const originalFetch=globalThis.fetch;let external=0;
 globalThis.fetch=(async()=>{external++;throw new Error("External I/O is not part of the account fixture");}) as typeof fetch;
 try{
  db=await load("src/lib/db.ts");const pool=db!.getPool();await db!.ensureSchema();
  const access:typeof import("../src/lib/accounts/repository")=baseline?db!:await load("src/lib/accounts/repository.ts");
  const session:Pick<typeof import("../src/lib/accounts/session"),"getUser"|"getOrCreateUser"|"changeUserPlan">=baseline?db!:await load("src/lib/accounts/session.ts");
  const history:Pick<typeof import("../src/lib/payments/history"),"totalPaidCents">=baseline?db!:await load("src/lib/payments/history.ts");
  const wallet:typeof import("../src/lib/billing/wallet-balance")=baseline?db!:await load("src/lib/billing/wallet-balance.ts");
  const providers:typeof import("../src/lib/user-image-provider/repository")=baseline?db!:await load("src/lib/user-image-provider/repository.ts");
  const runtimeModule=await load("src/lib/billing/runtime.ts"),httpBilling=await load("src/lib/billing/server.ts");
  eq(runtimeModule.getBillingRuntime,httpBilling.getBillingRuntime);
  const runtime=await runtimeModule.getBillingRuntime();eq(runtime,await httpBilling.getBillingRuntime());
  if(!baseline){for(const api of [access,session,history,wallet,providers])for(const [name,fn] of Object.entries(api)){if(typeof fn==="function"&&name in db!)eq(fn,(db as unknown as Record<string,unknown>)[name]);}}
  const owner="account@fixture.test",other="other@fixture.test";
  await db!.setSignupBonus(7,"fixture");
  await Promise.all(Array.from({length:8},()=>session.getOrCreateUser("Account@Fixture.test","Original")));
  eq((await pool.query("SELECT count(*)::int n FROM app_users WHERE email=$1",[owner])).rows[0].n,1);
  eq((await pool.query("SELECT count(*)::int n,sum(remaining)::int total FROM app_credit_batches WHERE email=$1",[owner])).rows[0],{n:1,total:7});
  eq((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE email=$1 AND kind='grant'",[owner])).rows[0].n,1);
  eq((await session.getUser(owner))?.creditsTotal,7);eq((await session.getOrCreateUser(owner,"")).name,"Original");eq((await session.getOrCreateUser(owner,"Updated")).name,"Updated");
  await session.getOrCreateUser(other,"Other");eq(await session.getUser("absent@fixture.test"),null);
  if(scenario==="login"){
   await pool.query("UPDATE app_credit_batches SET expires_at=now()-interval '1 day' WHERE email=$1",[owner]);
   await pool.query("UPDATE app_users SET credits_total=999,credits_used=2 WHERE email=$1",[owner]);
   process.env.NAUMI_AUTH_LOGIN_ONLY="1";
   const before=(await pool.query("SELECT count(*)::int n FROM app_ledger WHERE email=$1",[owner])).rows[0].n;
   const user=await session.getUser(owner);eq(user?.creditsTotal,0);eq(user?.creditsUsed,2);
   eq((await pool.query("SELECT credits_total FROM app_users WHERE email=$1",[owner])).rows[0].credits_total,999);
   eq((await pool.query("SELECT expired FROM app_credit_batches WHERE email=$1",[owner])).rows[0].expired,false);
   eq((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE email=$1",[owner])).rows[0].n,before);
   eq(external,0);console.log(`ACCOUNT_SCENARIO=${scenario} MODE=${mode} CHECKS=${checks} RESULT=PASS SIDECAR=READONLY`);return;
  }
  // Credentials, roles and current account controls use owner-normalized facts.
  await access.setUserPassword("ACCOUNT@Fixture.test","fixture-password-hash");eq(await access.getUserPasswordHash(owner),"fixture-password-hash");eq(await access.getUserPasswordHash(other),null);
  eq(await access.userExists(owner.toUpperCase()),true);eq(await access.userExists("absent"),false);
  await access.setUserRole(owner,"admin");eq(await access.getUserRole(owner),"admin");eq(await access.getOwnerEmail(),owner);
  await access.setUserRole(other,"super-admin");eq(await access.getUserRole(other),"user");
  await access.setUserBanned(owner,true);eq(await access.bannedEmailsAmong([owner.toUpperCase(),owner,other]),[owner]);eq(await access.isBanned(` ${owner.toUpperCase()} `,null),true);eq(await access.isBanned(other,null),false);
  await access.setUserBanned(owner,false);await access.banIp(" 192.0.2.40 ","fixture");eq(await access.isBanned(other," 192.0.2.40 "),true);eq((await access.listBannedIps())[0].reason,"fixture");await access.unbanIp("192.0.2.40");eq(await access.isBanned(other,"192.0.2.40"),false);
  await access.recordLoginIp(owner,"192.0.2.41");await access.setUserNote(owner,"n".repeat(1003));eq((await pool.query("SELECT last_ip,length(note)::int n FROM app_users WHERE email=$1",[owner])).rows[0],{last_ip:"192.0.2.41",n:1000});
  const {OPERATOR_EMAIL}=await load("src/lib/operator.ts");eq(await access.getLocalOperatorEmail(),OPERATOR_EMAIL);
  await session.getOrCreateUser("operator@legacy.local");eq(await access.getLocalOperatorEmail(),"operator@legacy.local");await session.getOrCreateUser(OPERATOR_EMAIL);eq(await access.getLocalOperatorEmail(),OPERATOR_EMAIL);
  // Paid order sums never include another owner or a pending/failed order.
  for(const [email,status,amount] of [[owner,"paid",1200],[owner,"paid",3400],[owner,"pending",9999],[owner,"failed",9999],[other,"paid",8888]] as const)await pool.query("INSERT INTO app_orders(id,email,kind,item_id,amount,status) VALUES($1,$2,'pack','fixture',$3,$4)",[randomUUID(),email,amount,status]);
  eq(await history.totalPaidCents(owner.toUpperCase()),4600);eq(await history.totalPaidCents(other),8888);eq(await history.totalPaidCents("absent"),0);
  await pool.query("INSERT INTO app_invoices(id,email,plan,amount,created_at) VALUES('i-old',$1,'starter',12,'2020-01-01'),('i-new',$1,'starter',14,'2020-02-01'),('i-other',$2,'starter',90,'2020-03-01')",[owner,other]);
  eq((await session.getUser(owner))?.invoices.map(i=>[i.id,i.amount]),[["i-new",14],["i-old",12]]);
  const beforePlan=await session.getUser(owner),plan=await session.changeUserPlan(owner,"pro");eq(plan.invoice,null);eq(plan.user.plan,"pro");eq(plan.user.creditsTotal,beforePlan?.creditsTotal);eq(plan.user.renewsAt,beforePlan?.renewsAt);
  // Refresh and expired ledger work retain user-first settlement serialization.
  const {withTransaction}=await load("src/platform/db/transaction.ts");
  await withTransaction(pool,async(tx:PoolClient)=>{await tx.query("DELETE FROM app_ledger WHERE email=$1",[owner]);await tx.query("DELETE FROM app_credit_batches WHERE email=$1",[owner]);await tx.query("UPDATE app_users SET credits_total=0,credits_used=0 WHERE email=$1",[owner]);await runtime.service.grantTx(tx,{id:randomUUID(),email:owner,amount:30,source:"admin",reason:"fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"});});
  const {fixtureConfig,facts}=await load("scripts/billing-unit-fixture.ts"),{quote}=await load("src/lib/billing/quote.ts");
  const op={id:randomUUID(),email:owner,quote:quote({version:1,config:fixtureConfig()},facts()),ledgerId:randomUUID(),reason:"fixture",fingerprint:"original-request"};
  await withTransaction(pool,(tx:PoolClient)=>runtime.service.reserveTx(tx,op));eq((await session.getUser(owner))?.creditsUsed,6);
  const result={state:"succeeded",items:[{id:"original-result",state:"succeeded",executedQuality:"medium"}]};
  await Promise.all([wallet.refreshBalance(owner),withTransaction(pool,(tx:PoolClient)=>runtime.service.settleTx(tx,op,result)),withTransaction(pool,(tx:PoolClient)=>runtime.service.settleTx(tx,op,result))]);
  eq((await session.getUser(owner))?.creditsTotal,24);eq((await session.getUser(owner))?.creditsUsed,0);eq((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE id=$1 AND kind='consume'",[op.ledgerId])).rows[0].n,1);
  // Deterministically pause a read behind the real user lock; a stale cached
  // principal read before that lock would overwrite 24 instead of recording 22.
  const held=await pool.connect();let refresh:Promise<number>|undefined;
  try{
   await held.query("BEGIN");await held.query("SELECT email FROM app_users WHERE email=$1 FOR UPDATE",[owner]);
   refresh=wallet.refreshBalance(owner);
   let waiting=false;for(let i=0;i<120;i++){const rows=(await admin.query("SELECT wait_event_type FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND query LIKE '%SELECT email FROM app_users WHERE email=$1 FOR UPDATE%' AND wait_event_type='Lock'")).rows;if(rows.length){waiting=true;break;}await new Promise(r=>setTimeout(r,20));}
   ok(waiting);await held.query("UPDATE app_credit_batches SET remaining=remaining-2 WHERE email=$1",[owner]);await held.query("UPDATE app_users SET credits_total=22 WHERE email=$1",[owner]);await held.query("COMMIT");eq(await refresh,22);
  }finally{await held.query("ROLLBACK");held.release();if(refresh)await refresh;}
  await pool.query("INSERT INTO app_credit_batches(id,email,amount,remaining,source,expires_at) VALUES('expired-fixture',$1,4,4,'grant',now()-interval '1 day')",[owner]);
  await Promise.all([wallet.expireDueBatches(owner),wallet.expireDueBatches(owner)]);
  eq((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE id='led-exp-expired-fixture'")).rows[0].n,1);eq((await wallet.getCreditOverview(owner)).balance,22);eq((await wallet.getCreditOverview(owner)).nextExpiry?.amount,22);
  // Zero signup does not turn missing real credit into free paid operations.
  await db!.setSignupBonus(0,"fixture");const poor="poor@fixture.test";eq((await session.getOrCreateUser(poor)).creditsTotal,0);
  await reject(withTransaction(pool,(tx:PoolClient)=>runtime.service.reserveTx(tx,{...op,id:randomUUID(),email:poor,ledgerId:randomUUID()})),e=>(e as {code?:string}).code==="INSUFFICIENT_CREDITS");
  eq((await pool.query("SELECT credits_used FROM app_users WHERE email=$1",[poor])).rows[0].credits_used,0);
  // Persistence bytes, ownership reads and existing sequential activation. No
  // new BYOK catalog execution, network discovery or encryption migration.
  const providerFacade=await load("src/lib/user-image-provider.ts"),settings=await load("src/lib/settings.ts");
  const cipher=settings.encryptAtRest("old-fixture-key"),record={id:"fixture-provider-a",email:owner,name:"A",isActive:false,enabled:false,protocol:"openai-images" as const,baseUrlEnc:"https://fixture.invalid/v1",apiKeyEnc:cipher,models:["fixture-model"],defaultModel:"fixture-model"};
  const saved=await providers.upsertUserImageProviderRecord(record);eq(saved.apiKeyEnc,cipher);eq(saved.baseUrlEnc,record.baseUrlEnc);
  const recordB={...record,id:"fixture-provider-b",name:"B",apiKeyEnc:" raw-key "};await providers.upsertUserImageProviderRecord(recordB);await providers.upsertUserImageProviderRecord({...record,id:"fixture-provider-other",email:other});
  eq(await providers.countUserImageProviderRecords(owner.toUpperCase()),2);eq(await providers.getUserImageProviderRecordById(other,record.id),null);eq(await providers.activateUserImageProviderRecord(other,record.id),false);eq(await providers.deleteUserImageProviderRecord(other,record.id),false);
  await reject(providerFacade.saveUserImageProvider({email:other,id:record.id,name:"no-change",activate:false,protocol:"openai-images",baseUrl:record.baseUrlEnc,models:record.models,defaultModel:record.defaultModel}),/供应商不存在/);
  eq((await providers.getUserImageProviderRecordById(owner,record.id))?.apiKeyEnc,cipher);
  eq(await providers.activateUserImageProviderRecord(owner,record.id),true);eq(await providers.activateUserImageProviderRecord(owner,recordB.id),true);
  eq((await providers.getUserImageProviderRecord(owner))?.id,recordB.id);eq((await providers.listUserImageProviderRecords(owner)).filter(p=>p.isActive).length,1);eq((await providers.getUserImageProviderRecordById(owner,record.id))?.enabled,false);
  const listed=await providerFacade.listUserImageProviders(owner);eq(listed.find((p:{id:string})=>p.id===record.id)?.apiKey,"old-fixture-key");eq(listed.find((p:{id:string})=>p.id===recordB.id)?.apiKey," raw-key ");
  const historical=listed.find((p:{id:string})=>p.id===record.id),envelope=providerFacade.freezeUserImageProvider(owner,historical);eq(providerFacade.restoreUserImageProvider(owner,envelope),historical);assert.throws(()=>providerFacade.restoreUserImageProvider(other,envelope));checks++;
  eq(await providerFacade.getUserImageProvider(owner),null);
  const retired=await load("src/app/api/account/image-provider/route.ts");eq((await retired.GET()).status,410);eq((await retired.POST()).status,410);
  eq(await providers.deleteUserImageProviderRecord(owner,record.id),true);eq(await providers.countUserImageProviderRecords(owner),1);eq(await providers.deleteUserImageProviderRecord(owner),true);eq(await providers.countUserImageProviderRecords(other),1);
  eq(external,0);eq(pool.waitingCount,0);eq(pool.idleCount,pool.totalCount);
  await writeFile(path.join(out,`PG_${mode}_RESULT.json`),JSON.stringify({root,mode,schema,checks,signupConcurrency:8,external,providerConcurrency:"sequential-activation-only",runtimeSameInstance:true},null,2));
  console.log(`ACCOUNT_SCENARIO=${scenario} MODE=${mode} CHECKS=${checks} RESULT=PASS`);
 }finally{
  globalThis.fetch=originalFetch;if(db)await db.getPool().end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
  console.log(`ACCOUNT_CLEANUP=${scenario} SCHEMA_DROPPED=1 POOLS_CLOSED=1`);
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
