import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { createBffAuthenticator, resolveDatabaseActor, createWorkflowServer, WorkflowStore, SchedulingStore } from '../src/server';
import { defaultLayout, schedulingCommandSchema, type SchedulingCommand, type Workbook } from '../src/scheduling-contracts';
import { evolveWorkbook } from '../src/scheduling-domain';
import { canRead } from '../src/domain';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const enterpriseId = randomUUID(), teamId = randomUUID(), otherTeam = randomUUID(), foreignEnterprise = randomUUID();
const issuer = 'https://fixture-bff.invalid', audience = 'enterprise-workflow';
function token(subject: string, team = teamId, patch: Record<string, unknown> = {}, h: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url');
  const data = `${encode({ alg: 'EdDSA', typ: 'JWT', kid: 'fixture', ...h })}.${encode({ iss: issuer, aud: audience,
    sub: subject, enterpriseId, teamId: team, iat: now, exp: now + 180, jti: randomUUID(), ...patch })}`;
  return `${data}.${sign(null, Buffer.from(data), privateKey).toString('base64url')}`;
}
const authenticate = createBffAuthenticator({ issuer, audience, publicKeys: { fixture: publicKey } });
test('signed identity: trust, TTL, audience, signature, strict claims and key rotation', async () => {
  const request = (authorization: string) => ({ headers: { authorization, 'x-user': 'lead', 'x-enterprise': enterpriseId } }) as unknown as IncomingMessage;
  assert.deepEqual(await authenticate(request(`Bearer ${token('lead')}`)), { enterpriseId, subject: 'lead', teamId });
  const now = Math.floor(Date.now() / 1000);
  for (const t of [token('lead', teamId, { iss: 'other' }), token('lead', teamId, { aud: 'other' }),
    token('lead', teamId, { exp: now - 1 }), token('lead', teamId, { iat: now + 60 }),
    token('lead', teamId, { exp: now + 301 }), token('lead', teamId, { permissions: ['manage'] }),
    token('lead', teamId, {}, { alg: 'none' }), token('lead', teamId, {}, { kid: 'missing' }),
    token('lead').replace(/\.[^.]+$/, '.AAAA'), 'invalid']) assert.equal(await authenticate(request(`Bearer ${t}`)), null);
  assert.equal(await authenticate(request('')), null);
  assert.equal(await authenticate({ headers: { 'x-user': 'lead', 'x-enterprise': enterpriseId } } as unknown as IncomingMessage), null);
  const next = generateKeyPairSync('ed25519');
  const rotated = createBffAuthenticator({ issuer, audience, publicKeys: { fixture: publicKey, next: next.publicKey } });
  assert.ok(await rotated(request(`Bearer ${token('lead')}`)));
  assert.throws(() => createBffAuthenticator({ issuer, audience, publicKeys: { fixture: privateKey } }), /ED25519_PUBLIC_KEY_REQUIRED/);
  console.log('IDENTITY_PASS: verified_signature=1 strict_claims=1 invalid_tokens_denied=12 private_keys_rejected=1');
});

test('schedule domain: field stability, view protection, layout-only commands and published history', () => {
  const command = (action: SchedulingCommand['action'], expectedVersion = 0) => schedulingCommandSchema.parse({ commandId: randomUUID(), teamId, expectedVersion, action, reason: 'fixture' });
  let w = evolveWorkbook(null, command({ type: 'initialize' }), 'lead', new Date().toISOString());
  const change = (a: SchedulingCommand['action']) => { w = evolveWorkbook(w, command(a, w.version), 'lead', new Date().toISOString()); };
  change({ type: 'set-fields', fields: [{ id: 'custom_channel', label: '投放渠道', type: 'select', options: ['站内'], archived: false }] });
  assert.throws(() => change({ type: 'set-fields', fields: [] }), /FIELD_DELETE_OR_TYPE_CHANGE/);
  assert.throws(() => change({ type: 'set-options', options: w.options.slice(1) }), /OPTION_DELETE_REQUIRES_REFERENCE_CHECK/);
  assert.throws(() => change({ type: 'rename-view', viewId: 'team', name: '表格' }), /DUPLICATE_VIEW_NAME/);
  assert.throws(() => change({ type: 'reorder-views', viewIds: ['team','team'] }), /INVALID_VIEW_ORDER/);
  assert.throws(() => change({ type: 'save-draft', viewId: 'team', baseRevision: 1, config: { ...defaultLayout(), columns: defaultLayout().columns.map(c => ({ ...c, id: c.id === 'due' ? 'points' : c.id })) } }), /INVALID_COLUMNS/);
  const config = defaultLayout(); config.columns[0].visible = false;
  assert.throws(() => change({ type: 'save-draft', viewId: 'team', baseRevision: 1, config }), /TITLE_COLUMN_REQUIRED/);
  for (const v of w.views.slice(1)) change({ type: 'archive-view', viewId: v.id, archived: true });
  assert.throws(() => change({ type: 'archive-view', viewId: 'team', archived: true }), /LAST_VIEW_REQUIRED/);
  for (let i=0;i<19;i++) {
    const revision=w.views[0].revision;
    change({type:'save-draft',viewId:'team',baseRevision:revision,config:defaultLayout()});
    change({type:'publish-view',viewId:'team',baseRevision:revision});
  }
  assert.equal(w.views[0].history.length,20);
  change({type:'save-draft',viewId:'team',baseRevision:20,config:defaultLayout()});
  change({type:'publish-view',viewId:'team',baseRevision:20});
  assert.equal(w.views[0].history.length,20);
  assert.throws(()=>change({type:'restore-view',viewId:'team',revision:1}),/HISTORY_NOT_FOUND/);
  for(let i=0;i<15;i++)change({type:'create-view',viewId:'view_'+i,name:'视图'+i,copyFrom:'team'});
  assert.throws(()=>change({type:'create-view',viewId:'overflow',name:'超额'}),/VIEW_LIMIT/);
  assert.equal(schedulingCommandSchema.safeParse({ ...command({ type: 'initialize' }), permissions: ['manage'] }).success, false);
  assert.equal(schedulingCommandSchema.safeParse({ ...command({ type: 'initialize' }), action: { type: 'patch-task', status: 'accepted' } }).success, false);
  console.log('SCHEDULING_DOMAIN_PASS: stable_fields=1 stable_options=1 last_view=1 arbitrary_task_patch_denied=1');
});

test('PostgreSQL + signed HTTP: scoped workflow and durable scheduling commands', async () => {
  const connectionString = process.env.WORKFLOW_SCHEDULING_TEST_DATABASE_URL;
  assert.ok(connectionString, 'Run verify.mjs for a separate disposable scheduling database');
  assert.ok(['127.0.0.1','localhost'].includes(new URL(connectionString).hostname));
  const pool = new pg.Pool({ connectionString, max: 8 });
  const store = new SchedulingStore(pool, resolveDatabaseActor);
  const workflow = new WorkflowStore(pool, resolveDatabaseActor, async () => false);
  let server = createWorkflowServer(workflow, authenticate, store);
  let base = '';
  async function listen() {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string'); base = `http://127.0.0.1:${address.port}`;
  }
  const principal = (subject = 'lead', team = teamId) => ({ enterpriseId, teamId: team, subject });
  const request = async (path: string, subject = 'lead', body?: unknown, team = teamId, patch = {}) => {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token(subject,team,patch)}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, value: await response.json() as any };
  };
  const cmd = (action: SchedulingCommand['action'], expectedVersion: number, team = teamId): SchedulingCommand => ({ commandId: randomUUID(), teamId: team, action, expectedVersion, reason: 'fixture变更原因' });
  const send = async (command: SchedulingCommand, subject = 'lead', team = teamId) => {
    const r = await request('/v1/scheduling/commands', subject, command, team); assert.equal(r.status, 200, JSON.stringify(r.value)); return r.value;
  };
  const url = `/v1/teams/${teamId}/scheduling`;
  try {
    await listen(); assert.equal((await fetch(`${base}/readyz`)).status, 503);
    await pool.query(await readFile(new URL('../migrations/001-workflow.sql',import.meta.url),'utf8'));
    assert.equal((await fetch(`${base}/readyz`)).status,503);
    for (const file of ['002-scheduling.sql','002-scheduling.sql']) await pool.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    assert.equal((await request('/readyz')).status, 200);
    for (const [e,t] of [[enterpriseId,teamId],[enterpriseId,otherTeam],[foreignEnterprise,randomUUID()]]) await pool.query('INSERT INTO enterprise_workflow.teams(enterprise_id,team_id) VALUES($1,$2)',[e,t]);
    for (const subject of ['lead','lead2','ops','designer','viewer','disabled','expired']) await pool.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject) VALUES($1,$2)', [enterpriseId,subject]);
    const grants: [string,string,string[],string[]][] = [['lead',teamId,['manage','dispatch'],[]], ['lead2',teamId,['dispatch'],[]],
      ['ops',teamId,['request'],[]], ['designer',teamId,['execute'],['design']], ['viewer',teamId,['review'],[]],
      ['lead',otherTeam,['execute'],['design']], ['disabled',teamId,['manage'],[]], ['expired',teamId,['manage'],[]]];
    for (const [subject,t,permissions,kinds] of grants) await pool.query('INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds) VALUES($1,$2,$3,$4,$5)', [enterpriseId,t,subject,JSON.stringify(permissions),JSON.stringify(kinds)]);
    await pool.query("UPDATE enterprise_workflow.accounts SET enabled=false WHERE subject='disabled'; UPDATE enterprise_workflow.team_members SET expires_at=now()-interval '1 second' WHERE subject='expired'");
    for (const subject of ['disabled','expired','unknown']) assert.equal((await request(url,subject)).status,403);
    assert.equal((await fetch(base + url, { headers: { 'x-user': 'lead','x-enterprise': enterpriseId } })).status,401);
    const init = cmd({ type: 'initialize' },0);
    let w = (await send(init)).workbook as Workbook;
    assert.equal(w.views.length,5); assert.equal((await send(init)).replayed,true);
    assert.equal((await request('/v1/scheduling/commands','lead',{ ...init, reason: '内容不同' })).status,409);
    assert.equal((await request('/v1/scheduling/commands','viewer',cmd({type:'initialize'},0))).status,403);
    assert.equal((await request(`/v1/teams/${otherTeam}/scheduling`)).status,404);
    assert.equal((await request(url,'lead',undefined,teamId,{enterpriseId:foreignEnterprise})).status,403);
    // A supervisor in team A does not become a supervisor in team B.
    assert.equal((await request('/v1/scheduling/commands','lead',cmd({type:'initialize'},0,otherTeam),otherTeam)).status,403);
    const field = { id:'custom_channel',label:'投放渠道',type:'text' as const,options:[],archived:false };
    w = (await send(cmd({ type:'set-fields',fields:[field] },w.version))).workbook;
    const config = defaultLayout(); config.columns[0].width = 390; config.density = 'compact';
    config.columns.push({id:field.id,label:field.label,width:140,visible:true,tint:'blue'});
    w = (await send(cmd({type:'save-draft',viewId:'team',baseRevision:1,config},w.version))).workbook;
    const reader = await request(url,'designer'); assert.equal(reader.status,200);
    assert.ok(!('draft' in reader.value.workbook.views[0]) && !('history' in reader.value.workbook.views[0]));
    assert.equal(reader.value.workbook.views[0].published.columns[0].width,310);
    w = (await send(cmd({type:'publish-view',viewId:'team',baseRevision:1},w.version))).workbook;
    assert.equal(w.views[0].revision,2); assert.equal(w.views[0].published.columns[0].width,390);
    assert.equal(w.views[1].revision,1);
    const savedPersonal = cmd({type:'save-personal',viewId:'team',baseRevision:2,config:{...config,density:'relaxed'}},0);
    assert.equal((await send(savedPersonal,'designer')).personal.version,1);
    assert.equal((await request(url + '/personal/team','ops')).value.personal.config,null);
    assert.equal((await request(url + '/personal/team','designer')).value.personal.config.density,'relaxed');
    assert.equal((await send(cmd({type:'reset-personal',viewId:'team'},1),'designer')).personal.version,2);
    assert.equal((await request(url+'/personal/team','designer')).value.personal.config,null);
    assert.equal((await send(cmd({type:'save-personal',viewId:'team',baseRevision:2,config:{...config,density:'relaxed'}},2),'designer')).personal.version,3);
    assert.equal((await request(url + '/personal/team?subject=designer','ops')).value.personal.version,0);
    assert.equal((await request('/v1/scheduling/commands','ops',savedPersonal)).status,409);
    const changes = [cmd({type:'rename-view',viewId:'grid',name:'A方案'},w.version),cmd({type:'rename-view',viewId:'grid',name:'B方案'},w.version)];
    const races = await Promise.all(changes.map(c => request('/v1/scheduling/commands','lead',c)));
    assert.deepEqual(races.map(r => r.status).sort(),[200,409]); w = races.find(r => r.status === 200)!.value.workbook;
    // Two independent signing sessions use the same persisted version: only one shared draft save wins.
    const draftRaces = await Promise.all(['lead','lead2'].map(s => request('/v1/scheduling/commands',s,cmd({type:'save-draft',viewId:'team',baseRevision:2,config},w.version))));
    assert.deepEqual(draftRaces.map(r => r.status).sort(),[200,409]); w = draftRaces.find(r=>r.status===200)!.value.workbook;
    const duplicate = cmd({type:'rename-view',viewId:'grid',name:'共同版本'},w.version);
    const duplicates = await Promise.all([send(duplicate),send(duplicate)]);
    assert.equal(duplicates.filter(x=>x.replayed).length,1); w = duplicates[0].workbook;
    const atomic = await pool.query(`SELECT (SELECT count(*) FROM enterprise_workflow.schedule_audit) AS a,(SELECT count(*) FROM enterprise_workflow.schedule_commands) AS c`);
    await pool.query(`CREATE FUNCTION enterprise_workflow.fail_schedule() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit failure'; END $$;
      CREATE TRIGGER fail_schedule BEFORE INSERT ON enterprise_workflow.schedule_audit FOR EACH ROW EXECUTE FUNCTION enterprise_workflow.fail_schedule()`);
    assert.equal((await request('/v1/scheduling/commands','lead',cmd({type:'rename-view',viewId:'grid',name:'不应保存'},w.version))).status,500);
    assert.equal((await request('/v1/scheduling/commands','designer',cmd({type:'reset-personal',viewId:'team'},3))).status,500);
    await pool.query('DROP TRIGGER fail_schedule ON enterprise_workflow.schedule_audit; DROP FUNCTION enterprise_workflow.fail_schedule()');
    assert.equal((await request(url)).value.workbook.version,w.version);
    assert.equal((await request(url+'/personal/team','designer')).value.personal.version,3);
    assert.deepEqual((await pool.query(`SELECT (SELECT count(*) FROM enterprise_workflow.schedule_audit) AS a,(SELECT count(*) FROM enterprise_workflow.schedule_commands) AS c`)).rows,atomic.rows);
    w = (await send(cmd({type:'restore-view',viewId:'team',revision:1},w.version))).workbook;
    assert.equal(w.views[0].revision,3); assert.equal(w.views[0].published.columns[0].width,310);
    assert.equal((await request(url+'/personal/team','designer')).value.stale,true);
    assert.equal((await request('/v1/scheduling/commands','designer',cmd({type:'save-personal',viewId:'team',baseRevision:2,config},3))).value.error.code,'VIEW_VERSION_CONFLICT');
    w = (await send(cmd({type:'create-view',viewId:'copy',name:'复制总表',copyFrom:'team'},w.version))).workbook;
    assert.equal(w.views.at(-1)!.history.length,1); assert.equal(w.views.at(-1)!.draft,null); assert.equal(w.views.at(-1)!.revision,1);
    w = (await send(cmd({type:'archive-view',viewId:'copy',archived:true},w.version))).workbook;
    assert.ok(!(await request(url,'designer')).value.workbook.views.some((v:any)=>v.id==='copy'));
    w = (await send(cmd({type:'archive-view',viewId:'copy',archived:false},w.version))).workbook;
    assert.equal((await request(url+'/audit','designer')).status,403);
    const audit = (await request(url+'/audit')).value.events;
    assert.ok(audit.every((e:any)=>e.scope==='team')); // Other people's personal filter activity is not disclosed.
    assert.equal((await request(url+'/audit?subject=designer')).status,200);
    // Unified service also uses team-scoped live identity for business commands, not a global role union.
    const orderId = randomUUID(), taskId = randomUUID(); let orderVersion = 0;
    const work = async (subject:string,action:unknown,team=teamId) => {
      const r = await request('/v1/commands',subject,{commandId:randomUUID(),orderId,expectedVersion:orderVersion,action},team);
      if(r.status===200)orderVersion=r.value.order.version; return r;
    };
    assert.equal((await work('ops',{type:'create',title:'fixture需求',brief:'fixture',acceptance:'fixture'})).status,200);
    assert.equal((await work('ops',{type:'submit-requirement'})).status,200);
    assert.equal((await work('lead',{type:'approve-requirement'})).status,200);
    assert.equal((await work('lead',{type:'plan-tasks',tasks:[{id:taskId,title:'主图',kind:'design',points:3,dueAt:new Date(Date.now()+86400000).toISOString(),dependencyIds:[]}]})).status,200);
    assert.equal((await work('lead',{type:'publish'})).status,200);
    assert.equal((await request(`/v1/orders/${orderId}`,'lead',undefined,otherTeam)).status,404);
    assert.equal((await work('lead',{type:'assign',taskId,assignee:'lead'})).status,403); // Its only execution grant is in the OTHER team.
    assert.equal((await work('designer',{type:'claim',taskId})).status,200);
    const facts = (await pool.query('SELECT document FROM enterprise_workflow.orders WHERE enterprise_id=$1 AND id=$2',[enterpriseId,orderId])).rows[0].document;
    assert.equal(facts.teamId,teamId); assert.equal(facts.tasks[0].status,'claimed');
    assert.equal(canRead({enterpriseId,subject:'unscoped',permissions:['manage'],workKinds:[]},facts),false);
    assert.equal(facts.tasks[0].dueAt.length>0,true); assert.equal(facts.tasks[0].points,3);
    const workBefore = await pool.query('SELECT * FROM enterprise_workflow.orders');
    w = (await send(cmd({type:'set-options',options:w.options.map(o=>({...o,label:o.id==='idle'?'待安排':o.label}))},w.version))).workbook;
    assert.deepEqual((await pool.query('SELECT * FROM enterprise_workflow.orders')).rows,workBefore.rows);
    // Revocation is checked BEFORE a historical idempotency replay.
    await pool.query("UPDATE enterprise_workflow.team_members SET permissions='[\"execute\"]' WHERE enterprise_id=$1 AND team_id=$2 AND subject='lead'",[enterpriseId,teamId]);
    assert.equal((await request('/v1/scheduling/commands','lead',init)).status,403);
    await pool.query("UPDATE enterprise_workflow.accounts SET enabled=false WHERE enterprise_id=$1 AND subject='designer'",[enterpriseId]);
    assert.equal((await request('/v1/scheduling/commands','designer',savedPersonal)).status,403);
    await pool.query("UPDATE enterprise_workflow.team_members SET permissions='[\"manage\",\"dispatch\"]' WHERE enterprise_id=$1 AND team_id=$2 AND subject='lead'",[enterpriseId,teamId]);
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    // A different connection pool + server process state proves recovery does not rely on JS memory.
    const recovered = new pg.Pool({connectionString,max:2});
    try {
      server=createWorkflowServer(new WorkflowStore(recovered,resolveDatabaseActor,async()=>false),authenticate,new SchedulingStore(recovered,resolveDatabaseActor));
      await listen(); assert.equal((await request(url)).value.workbook.version,w.version);
      assert.equal((await send(duplicate)).replayed,true);
      assert.equal((await request(url+'/personal/team','designer')).status,403);
      // Separate OS process, fresh pool, no parent object references or browser storage.
      const probe = execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`
        import pg from 'pg';
        import {SchedulingStore,resolveDatabaseActor} from './src/server.ts';
        const pool=new pg.Pool({connectionString:process.env.WORKFLOW_SCHEDULING_TEST_DATABASE_URL});
        try {const r=await new SchedulingStore(pool,resolveDatabaseActor).get(JSON.parse(process.env.FIXTURE_PRINCIPAL),process.env.FIXTURE_TEAM);
          console.log('PROCESS_RECOVERY_PASS: version='+r.workbook.version);
        } finally {await pool.end();}`], {encoding:'utf8',timeout:15000,env:{...process.env,FIXTURE_PRINCIPAL:JSON.stringify(principal()),FIXTURE_TEAM:teamId}}).trim();
      assert.equal(probe,`PROCESS_RECOVERY_PASS: version=${w.version}`); console.log(probe);
      assert.equal((await pool.query("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,'0');
    } finally { await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())); await recovered.end(); }
    console.log('SCHEDULING_HTTP_PASS: durable=1 team_scope=1 team_role_union=0 cas_winners=1 draft_winners=1 idempotent_writes=1 private_view_isolation=1 atomic_rollback=1 workflow_mutations=0 revoked_replay_denied=1 restart_recovered=1 legacy_writes=0 provider_calls=0');
  } finally { if(server.listening) await new Promise<void>(r=>server.close(()=>r())); await pool.end(); }
});
