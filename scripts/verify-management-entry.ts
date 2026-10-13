import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, '1');
  assert.equal(new URL(process.env.DATABASE_URL!).hostname, '127.0.0.1');
  process.env.SETTINGS_SECRET = 'entry-status-fixture-01234567890123456789';
  process.env.NAUMI_MULTI_USER = '1';
  const db = await import('../src/lib/db'), erp = await import('../src/lib/enterprise/server');
  const native = await import('../src/lib/native-auth'), api = await import('../src/app/api/team/access/route');
  await erp.ensureEnterpriseSchema();
  const p = db.getPool(), root = randomUUID();
  const owner = 'boss@entry.fixture', director = 'director@entry.fixture', member = 'member@entry.fixture', legacy = 'legacy@entry.fixture';
  for (const email of [owner, director, member, legacy]) await db.getOrCreateUser(email, email);
  await p.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'Entry enterprise',$2,now()-interval '1 day')", [root, owner]);
  await p.query('INSERT INTO app_enterprise_settings(team_id) VALUES($1)', [root]);
  const role = randomUUID(), worker = randomUUID();
  await p.query("INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,'总监',10,true,true),($1,$3,'员工',100,false,false)", [root, role, worker]);
  for (const [email, r] of [[director, role], [member, worker]]) await p.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,$4,'permanent')", [root, email, owner, r]);
  for (const email of [owner, legacy]) await p.query("INSERT INTO app_team_access_grants(email,scope,starts_at,expires_at,created_by,updated_by) VALUES($1,'owned',now()-interval '1 day',NULL,'fixture','fixture')", [email]);
  const before = (await p.query('SELECT email,password_hash,role,credits_total,credits_used,account_expires_at FROM app_users ORDER BY email')).rows;
  const req = (email?: string) => new Request('http://fixture.test/api/team/access', { headers: email ? { cookie: 'nv_user=' + native.signUserSession(email, Date.now()) } : {} });
  assert.equal((await api.GET(req())).status, 401);
  const read = async (email: string) => { const response = await api.GET(req(email)); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control')!, /no-store/); return response.json(); };
  const ownerEntry = await read(owner);
  if (process.env.ENTRY_BASELINE === '1') {
    assert.equal(ownerEntry.allowed, true);
    assert.equal(ownerEntry.enterprise, true);
    assert.equal(ownerEntry.status, undefined);
    assert.equal(ownerEntry.href, undefined);
    assert.equal((await read(director)).allowed, false);
    console.log('BASELINE=REPRODUCED OWNER_STATUS_AND_DESTINATION=MISSING DIRECTOR_WITH_ENTERPRISE_ACCESS=FALSE');
    await p.end(); return;
  }
  const contract = await import('../src/lib/teams/entry-contract');
  assert.equal(contract.parseEntryDiscovery(ownerEntry).href, '/enterprise');
  assert.equal(ownerEntry.status, 'active'); assert.equal(ownerEntry.expiresAt, null);
  assert.equal((await read(director)).allowed, true);
  assert.equal((await read(member)).status, 'forbidden');
  assert.equal((await read(legacy)).href, '/team');
  assert.equal((await read(legacy)).allowed, true);
  assert.throws(() => contract.parseEntryDiscovery({ allowed: true }), /Invalid/);
  assert.notEqual(contract.entryStatusLabel('error'), contract.entryStatusLabel('ungranted'));
  assert.notEqual(contract.entryStatusLabel('loading'), contract.entryStatusLabel('ungranted'));
  for (const [patch, status] of [
    ["enabled=false", 'paused'], ["enabled=true,revoked_at=now()", 'revoked'],
    ["revoked_at=NULL,expires_at=now()-interval '1 second'", 'expired'],
    ["expires_at=NULL,starts_at=now()+interval '1 day'", 'scheduled'],
    ["starts_at=now()-interval '1 day'", 'active'],
  ]) {
    await p.query(`UPDATE app_team_access_grants SET ${patch} WHERE email=$1`, [owner]);
    for (const email of [owner, director]) { const e = await read(email); assert.equal(e.status, status); assert.equal(e.allowed, status === 'active'); }
  }
  await p.query("INSERT INTO app_feature_access(email,mode,allowed) VALUES($1,'custom','[]'::jsonb)", [owner]);
  assert.equal((await read(owner)).status, 'forbidden');
  await p.query('DELETE FROM app_feature_access WHERE email=$1', [owner]);
  await p.query('UPDATE app_enterprise_settings SET enabled=false WHERE team_id=$1', [root]);
  assert.equal((await read(owner)).status, 'paused');
  await p.query('UPDATE app_enterprise_settings SET enabled=true WHERE team_id=$1', [root]);
  await p.query('DELETE FROM app_team_access_grants WHERE email=$1', [owner]);
  assert.equal((await read(owner)).status, 'ungranted');
  assert.deepEqual((await p.query('SELECT email,password_hash,role,credits_total,credits_used,account_expires_at FROM app_users ORDER BY email')).rows, before);
  console.log('MODIFIED=PASS OWNER_DIRECTOR=ENTERPRISE LEGACY=TEAM PERMANENT=NULL PAUSE_REVOKE_EXPIRY_SCHEDULE_FEATURE_DISABLE=ENFORCED');
  console.log('DISPLAY=PASS LOADING_AND_ERROR_NOT_UNAUTHORIZED PRIVATE_NO_STORE=PASS USERS_CREDITS_PASSWORDS=UNCHANGED PROVIDER_CALLS=0');
  await p.end();
}
main().catch(error => { console.error(error); process.exitCode = 1; });

