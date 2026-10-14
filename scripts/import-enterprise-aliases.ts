/** Additive, atomic roster import into an existing Naumi enterprise. No HTTP cutover. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { hashPassword, verifyPassword } from '../src/lib/pw';
import { loginIdentifierToEmail } from '../src/lib/account-identity';
import { createBillingService } from '../src/lib/billing/service';
import { fingerprint } from '../src/lib/billing/fingerprint';

type Entry = { alias: string; row: number; sheet: string };
type Roster = { source_sha256: string; rows: Entry[] };
type Manifest = {
  source: string; enterpriseId: string; owner: string; supervisor: string; roleId: string;
  created: string[]; linkedExisting: string[]; skipped: string[]; auditId: string | null;
  baseline: Record<string, string>; originalUsers: Record<string, string>;
  newUsers?: Record<string, string>; membershipHashes?: Record<string, string>;
};
const tables = ['app_users','app_enterprise_members','app_account_team_members','app_enterprise_audit',
  'app_credit_batches','app_ledger','app_billing_operations','app_gen_reservations',
  'app_account_teams','app_enterprise_roles','app_enterprise_settings','app_team_access_grants',
  'app_artworks','app_image_jobs'];
const digest = (s:string) => createHash('sha256').update(s).digest('hex');
const write = (path:string, value:unknown) => writeFileSync(path, JSON.stringify(value,null,2)+'\n', {mode:0o600});
async function checkpoint(tx:PoolClient) {
  const result:Record<string,string>={};
  for(const table of tables) result[table]=(await tx.query(`SELECT md5(COALESCE(string_agg(v,E'\\n' ORDER BY v),'')) AS h FROM (SELECT to_jsonb(t)::text AS v FROM ${table} t) s`)).rows[0].h;
  return result;
}
async function userHashes(tx:PoolClient) {
  return Object.fromEntries((await tx.query('SELECT email,md5(to_jsonb(u)::text) AS h FROM app_users u')).rows.map(r=>[r.email,r.h]));
}
async function membershipHashes(tx:PoolClient, emails:string[]) {
  return Object.fromEntries((await tx.query('SELECT email,md5(to_jsonb(m)::text) AS h FROM app_enterprise_members m WHERE email=ANY($1::text[])',[emails])).rows.map(r=>[r.email,r.h]));
}
const operation = (m:Manifest,email:string) => 'admin-roster-'+m.source.slice(0,16)+'-'+digest(m.enterpriseId+email).slice(0,24);
async function plan(tx:PoolClient, roster:Roster):Promise<Manifest> {
  const names=roster.rows.map(r=>r.alias);
  assert(names.length>0 && new Set(names).size===names.length,'Empty or duplicate alias');
  assert(names.every(n=>n===n.trim()&&n.length<=40&&!n.includes('@')&&!/[\r\n\t]/.test(n)), 'Invalid alias');
  const owner=loginIdentifierToEmail(process.env.NAUMI_IMPORT_OWNER || '北方');
  const teams=(await tx.query(`SELECT t.* FROM app_account_teams t JOIN app_enterprise_settings s ON s.team_id=t.id WHERE t.owner_email=$1 AND t.enabled AND s.enabled FOR SHARE OF t,s`,[owner])).rows;
  assert.equal(teams.length,1,'Exactly one enabled enterprise owned by specified owner required');
  const team=teams[0];
  const roles=(await tx.query('SELECT * FROM app_enterprise_roles WHERE enterprise_id=$1 FOR SHARE',[team.id])).rows;
  const employees=roles.filter(r=>r.name==='正式员工'&&!r.manage_members&&!r.view_records);
  assert.equal(employees.length,1,'Existing non-management employee role required');
  const supervisor=loginIdentifierToEmail(process.env.NAUMI_IMPORT_SUPERVISOR || '玄策');
  const parent=(await tx.query(`SELECT m.email,r.level,r.manage_members FROM app_enterprise_members m JOIN app_enterprise_roles r ON r.enterprise_id=m.enterprise_id AND r.id=m.role_id WHERE m.enterprise_id=$1 AND m.email=$2 FOR SHARE OF m,r`,[team.id,supervisor])).rows[0];
  assert(parent&&parent.manage_members&&parent.level<employees[0].level,'Supervisor must be an existing enterprise manager');
  const users=(await tx.query('SELECT email,name FROM app_users FOR SHARE')).rows;
  const byEmail=new Map(users.map(u=>[u.email,u]));
  const members=(await tx.query('SELECT email,enterprise_id FROM app_enterprise_members FOR SHARE')).rows;
  const memberships=new Map(members.map(m=>[m.email,m.enterprise_id]));
  const m:Manifest={source:roster.source_sha256,enterpriseId:team.id,owner,supervisor,roleId:employees[0].id,
    created:[],linkedExisting:[],skipped:[],auditId:null,baseline:await checkpoint(tx),originalUsers:await userHashes(tx)};
  for(const alias of names){
    const email=loginIdentifierToEmail(alias);
    if(!byEmail.has(email)){
      assert(!users.some(u=>u.name===alias),'Same display name with a different identity needs explicit mapping: '+alias);
      m.created.push(email);
    }else{
      m.skipped.push(email);
      if(email===owner)continue;
      const current=memberships.get(email);
      assert(!current||current===team.id,'Existing account belongs to another enterprise: '+alias);
      if(!current)m.linkedExisting.push(email);
    }
  }
  return m;
}
async function verify(tx:PoolClient,m:Manifest,password:string){
  const hashes=await userHashes(tx);
  for(const [email,h] of Object.entries(m.originalUsers))assert.equal(hashes[email],h,'Existing user changed: '+email);
  for(const table of ['app_account_team_members','app_account_teams','app_enterprise_roles','app_enterprise_settings','app_team_access_grants','app_artworks','app_image_jobs','app_gen_reservations']){
    const now=(await tx.query(`SELECT md5(COALESCE(string_agg(v,E'\\n' ORDER BY v),'')) AS h FROM (SELECT to_jsonb(t)::text AS v FROM ${table} t) s`)).rows[0].h;
    assert.equal(now,m.baseline[table],'Unrelated table changed: '+table);
  }
  let passed=0;
  for(const email of m.created){
    const u=(await tx.query('SELECT * FROM app_users WHERE email=$1',[email])).rows[0];
    assert(u&&verifyPassword(password,u.password_hash)&&!verifyPassword(password+'-wrong',u.password_hash),'Native password verification failed');
    assert.equal(loginIdentifierToEmail(u.name),email);assert.equal(u.role,'user');assert.equal(u.banned,false);
    assert.equal(u.account_expires_at,null);assert.equal(u.credits_total,99999);assert.equal(u.credits_used,0);
    const wallet=(await tx.query("SELECT coalesce(sum(remaining),0)::int AS amount,count(*)::int AS n FROM app_credit_batches WHERE email=$1 AND expires_at>now()",[email])).rows[0];
    assert.equal(wallet.amount,99999);assert.equal(wallet.n,1);
    const op=(await tx.query("SELECT state,charged_credits FROM app_billing_operations WHERE id=$1",[operation(m,email)])).rows[0];
    assert.equal(op.state,'settled');assert.equal(op.charged_credits,0);
    const ledger=(await tx.query('SELECT delta,kind FROM app_ledger WHERE id=$1',['led-'+operation(m,email)])).rows[0];
    assert.equal(ledger.delta,99999);assert.equal(ledger.kind,'grant');passed++;
  }
  const hashes2=await membershipHashes(tx,[...m.created,...m.linkedExisting]);
  assert.equal(Object.keys(hashes2).length,m.created.length+m.linkedExisting.length);
  for(const email of [...m.created,...m.linkedExisting]){
    const n=(await tx.query('SELECT * FROM app_enterprise_members WHERE email=$1',[email])).rows[0];
    assert.equal(n.enterprise_id,m.enterpriseId);assert.equal(n.role_id,m.roleId);assert.equal(n.supervisor_email,m.supervisor);assert.equal(n.employment,'permanent');
  }
  return {nativePasswordsPassed:passed,availableCreditsEach:99999,existingUsersUnchanged:Object.keys(m.originalUsers).length,enterpriseLinked:m.created.length+m.linkedExisting.length,providerCalls:0};
}
async function rollback(tx:PoolClient,m:Manifest){
  assert(m.newUsers&&m.membershipHashes,'Verified manifest required');
  const hashes=await userHashes(tx);
  for(const email of m.created)assert.equal(hashes[email],m.newUsers[email],'New account has since changed; stop rollback');
  const members=await membershipHashes(tx,[...m.created,...m.linkedExisting]);
  assert.deepEqual(members,m.membershipHashes,'Membership changed; stop rollback');
  // Any use, additional grants, or newly dependent data prevents deleting an account.
  for(const email of m.created){
    const batch=(await tx.query('SELECT id,amount,remaining FROM app_credit_batches WHERE email=$1',[email])).rows;
    assert.equal(batch.length,1);assert.equal(batch[0].id,'bat-'+operation(m,email));assert.equal(batch[0].amount,99999);assert.equal(batch[0].remaining,99999);
    assert.equal((await tx.query('SELECT 1 FROM app_ledger WHERE email=$1 AND id<>$2',[email,'led-'+operation(m,email)])).rowCount,0);
    assert.equal((await tx.query('SELECT 1 FROM app_billing_operations WHERE email=$1 AND id<>$2',[email,operation(m,email)])).rowCount,0);
    assert.equal((await tx.query('SELECT 1 FROM app_artworks WHERE email=$1 UNION ALL SELECT 1 FROM app_image_jobs WHERE email=$1 UNION ALL SELECT 1 FROM app_gen_reservations WHERE email=$1',[email])).rowCount,0);
  }
  await tx.query('DELETE FROM app_enterprise_members WHERE enterprise_id=$1 AND email=ANY($2::text[])',[m.enterpriseId,[...m.created,...m.linkedExisting]]);
  for(const email of m.created){
    await tx.query('DELETE FROM app_ledger WHERE id=$1',['led-'+operation(m,email)]);
    await tx.query('DELETE FROM app_credit_batches WHERE id=$1',['bat-'+operation(m,email)]);
    await tx.query('DELETE FROM app_billing_operations WHERE id=$1',[operation(m,email)]);
    await tx.query('DELETE FROM app_users WHERE email=$1',[email]);
  }
  if(m.auditId)await tx.query('DELETE FROM app_enterprise_audit WHERE id=$1',[m.auditId]);
  assert.deepEqual(await checkpoint(tx),m.baseline,'Rollback did not restore baseline');
}
async function main(){
  const [mode,rosterPath,manifestPath]=process.argv.slice(2);
  assert(['plan','apply','verify','rollback'].includes(mode)&&rosterPath&&manifestPath,'Usage: mode roster.json manifest.json');
  const roster=JSON.parse(readFileSync(rosterPath,'utf8')) as Roster;
  const password=['apply','verify'].includes(mode)?JSON.parse(readFileSync(0,'utf8')).password:'';
  if(password)assert(typeof password==='string'&&password.length>=8);
  const p=new Pool({connectionString:process.env.DATABASE_URL});const tx=await p.connect();
  try{
    await tx.query('BEGIN');await tx.query("SET LOCAL lock_timeout='10s'");
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-team-management'))");
    let m:Manifest;
    if(mode==='verify'||mode==='rollback'){
      m=JSON.parse(readFileSync(manifestPath,'utf8'));assert.equal(m.source,roster.source_sha256);
      if(mode==='verify'){const result=await verify(tx,m,password);console.log('VERIFY='+JSON.stringify(result))}
      else {await rollback(tx,m);console.log('ROLLBACK=PASS; BASELINE_TABLE_HASHES=RESTORED')}
    }else{
      m=await plan(tx,roster);
      if(mode==='apply'){
        assert(password,'Password must arrive through stdin');
        const policy=(await tx.query("SELECT v.config->'credits' AS credits FROM app_settings s JOIN app_billing_config_versions v ON v.version::text=s.v WHERE s.k='billing_config_version' FOR SHARE OF s,v")).rows[0]?.credits;
        assert(policy?.admin,'Existing billing policy required');
        const service=createBillingService();
        for(const email of m.created){
          const alias=roster.rows.find(r=>loginIdentifierToEmail(r.alias)===email)!.alias;
          await tx.query(`INSERT INTO app_users(email,name,plan,credits_total,credits_used,renews_at,password_hash,role,banned,account_expires_at) VALUES($1,$2,'starter',0,0,now()+interval '1 month',$3,'user',false,NULL)`,[email,alias,hashPassword(password)]);
          const id=operation(m,email);
          await service.grantTx(tx,{id,email,amount:99999,source:'admin',reason:'企业花名批量开户初始积分',expiry:policy.admin,debitOrder:policy.debitOrder,ledgerId:'led-'+id,actor:'admin@admin.com',fingerprint:fingerprint({source:m.source,email,credits:99999})});
        }
        for(const email of [...m.created,...m.linkedExisting])await tx.query(`INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,$4,'permanent')`,[m.enterpriseId,email,m.supervisor,m.roleId]);
        if(m.created.length||m.linkedExisting.length){
          m.auditId=randomUUID();
          await tx.query(`INSERT INTO app_enterprise_audit(id,enterprise_id,actor,action,target,fingerprint,result,changes) VALUES($1,$2,'admin@admin.com','roster-import',$3,$4,$5::jsonb,$6::jsonb)`,[m.auditId,m.enterpriseId,m.source,fingerprint({source:m.source,created:m.created,linked:m.linkedExisting}),JSON.stringify({ok:true,created:m.created.length,linkedExisting:m.linkedExisting.length}),JSON.stringify({created:m.created,linkedExisting:m.linkedExisting})]);
        }
        const result=await verify(tx,m,password);
        const hashes=await userHashes(tx);m.newUsers=Object.fromEntries(m.created.map(e=>[e,hashes[e]]));
        m.membershipHashes=await membershipHashes(tx,[...m.created,...m.linkedExisting]);
        console.log('APPLY_VERIFIED='+JSON.stringify(result));
      }
      write(manifestPath,m);
      console.log(mode.toUpperCase()+'='+JSON.stringify({roster:roster.rows.length,created:m.created.length,skipped:m.skipped.length,linkedExisting:m.linkedExisting.length,enterpriseId:m.enterpriseId}));
    }
    await tx.query(mode==='plan'?'ROLLBACK':'COMMIT');
  }catch(error){await tx.query('ROLLBACK');throw error}
  finally{tx.release();await p.end()}
}
main().catch(e=>{console.error('IMPORT_ERROR='+String(e));process.exitCode=1});
