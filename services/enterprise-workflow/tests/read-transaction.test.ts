import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {Pool} from 'pg';
import {WorkflowError} from '../src/contracts';
import {resolveDatabaseActor} from '../src/identity';
import {WorkflowStore} from '../src/store';
import {NotificationStore} from '../src/notification-store';

// Wait for an actual blocked relation read before attempting the write on another connection.
export async function whileReadWaits<T>(pool: Pool, table: 'orders' | 'events' | 'notifications' | 'performance_claims', read: () => Promise<T>, write: () => Promise<void>) {
  const blocker = await pool.connect();
  let result: Promise<PromiseSettledResult<T>> | undefined;
  try {
    const pid = Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    await blocker.query('BEGIN');
    await blocker.query(`LOCK TABLE enterprise_workflow.${table} IN ACCESS EXCLUSIVE MODE`);
    result = read().then(value => ({status: 'fulfilled', value}), reason => ({status: 'rejected', reason}));
    let waiting = false;
    for (let i = 0; i < 60; i++) {
      waiting = (await blocker.query('SELECT EXISTS(SELECT FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS waiting', [pid])).rows[0].waiting;
      if (waiting) break;
      await delay(15);
    }
    assert.ok(waiting, `read must reach its blocked ${table} query`);
    await write();
  } finally {
    try { await blocker.query('ROLLBACK'); } finally { blocker.release(); await result; }
  }
  return (await result)!;
}

export async function readTransactionChecks(pool: Pool) {
  const p = {enterpriseId: randomUUID(), teamId: randomUUID(), subject: 'scope-reader'};
  const orderId = randomUUID(), values = [p.enterpriseId, p.teamId, p.subject];
  await pool.query('INSERT INTO enterprise_workflow.teams(enterprise_id,team_id) VALUES($1,$2)', values.slice(0,2));
  await pool.query('INSERT INTO enterprise_workflow.accounts(enterprise_id,subject) VALUES($1,$2)', [p.enterpriseId,p.subject]);
  await pool.query(`INSERT INTO enterprise_workflow.team_members(enterprise_id,team_id,subject,permissions,work_kinds) VALUES($1,$2,$3,'["request"]','[]')`, values);
  const store = new WorkflowStore(pool, resolveDatabaseActor, async () => true);
  const legacy = new WorkflowStore(pool, (tx, p) => resolveDatabaseActor(tx,p), async () => true);
  await store.execute(p, {commandId: randomUUID(), orderId, expectedVersion: 0, action: {type:'create',title:'Fixture request',brief:'Fixture brief',acceptance:'Fixture acceptance'}});
  assert.equal((await store.dashboard(p)).todos[0].orderId, orderId);
  assert.equal((await store.detail(p, orderId)).events[0].aggregateVersion, 1);

  const write = async (sql: string, params: string[]) => {
    const tx = await pool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query("SET LOCAL lock_timeout='400ms'");
      assert.equal((await tx.query(sql, params)).rowCount, 1);
      await tx.query('COMMIT');
    } finally {
      try { await tx.query('ROLLBACK'); } finally { tx.release(); }
    }
  };
  const revoke = () => write('UPDATE enterprise_workflow.team_members SET enabled=false WHERE enterprise_id=$1 AND team_id=$2 AND subject=$3', values);
  const restore = () => write('UPDATE enterprise_workflow.team_members SET enabled=true WHERE enterprise_id=$1 AND team_id=$2 AND subject=$3', values);
  const reassign = () => write(`UPDATE enterprise_workflow.orders SET document=jsonb_set(document,'{requester}','"other-requester"') WHERE enterprise_id=$1 AND id=$2`, [p.enterpriseId,orderId]);
  const restoreRequester = () => write(`UPDATE enterprise_workflow.orders SET document=jsonb_set(document,'{requester}',to_jsonb($3::text)) WHERE enterprise_id=$1 AND id=$2`, [p.enterpriseId,orderId,p.subject]);
  const locked = (error: unknown) => (error as {code?: string})?.code === '55P03';
  const denied = (result: PromiseSettledResult<unknown>, status: number) => {
    assert.equal(result.status,'rejected');
    assert.ok(result.reason instanceof WorkflowError);
    assert.equal(result.reason.status,status);
  };

  assert.equal((await whileReadWaits(pool,'orders', () => legacy.dashboard(p), async () => { await assert.rejects(revoke, locked); })).status,'fulfilled');
  denied(await whileReadWaits(pool,'orders', () => store.dashboard(p), revoke),403);
  await restore();
  assert.equal((await whileReadWaits(pool,'orders', () => legacy.list(p), async () => { await assert.rejects(revoke, locked); })).status,'fulfilled');
  for (const [table, read] of [['orders', () => store.list(p)], ['orders', () => store.tasks(p)], ['orders', () => store.week(p,{start:'2030-01-01'})], ['events', () => store.facts(p)]] as const) {
    denied(await whileReadWaits<unknown>(pool, table, read, revoke),403);
    await restore();
  }
  const sourceBinding = {sourceInstance:'fixture', sourceEnterprise:randomUUID(), sourceSubject:'source-reader'};
  await pool.query('INSERT INTO enterprise_workflow.source_enterprises(source_instance,source_enterprise,enterprise_id) VALUES($1,$2,$3)', [sourceBinding.sourceInstance,sourceBinding.sourceEnterprise,p.enterpriseId]);
  await pool.query('INSERT INTO enterprise_workflow.source_identities(source_instance,source_enterprise,enterprise_id,source_subject,subject) VALUES($1,$2,$3,$4,$5)', [sourceBinding.sourceInstance,sourceBinding.sourceEnterprise,p.enterpriseId,sourceBinding.sourceSubject,p.subject]);
  const mapped = {...p, sourceBinding};
  assert.equal((await store.dashboard(mapped)).todos[0].orderId, orderId);
  denied(await whileReadWaits(pool,'orders', () => store.dashboard(mapped), () => write('UPDATE enterprise_workflow.source_enterprises SET enabled=false WHERE source_instance=$1 AND source_enterprise=$2', [sourceBinding.sourceInstance,sourceBinding.sourceEnterprise])),403);

  assert.equal((await whileReadWaits(pool,'events', () => legacy.detail(p,orderId), async () => { await assert.rejects(reassign, locked); })).status,'fulfilled');
  denied(await whileReadWaits(pool,'events', () => store.detail(p,orderId), reassign),404);
  await restoreRequester();
  denied(await whileReadWaits(pool,'events', () => store.dashboard(p), reassign),409);

  await restoreRequester();
  const notices = new NotificationStore(pool, resolveDatabaseActor);
  const notificationId = randomUUID();
  await pool.query(`INSERT INTO enterprise_workflow.notifications(id,enterprise_id,team_id,subject,event_id,order_id,action,actor,title,aggregate_version,created_at)
    VALUES($1::uuid,$2,$3,$4,$1::uuid::text,$5,'fixture','fixture','Fixture notice',1,now())`, [notificationId,...values,orderId]);
  const inbox = () => notices.read(p,{action:'inbox'});
  assert.equal((await inbox()).notifications?.[0].id, notificationId);
  denied(await whileReadWaits(pool,'notifications', inbox, reassign),409);
  assert.equal((await inbox()).unread, 0);

  console.log('WORKFLOW_READ_TRANSACTION_PASS: legacy_membership_and_order_writes_block=1 snapshot_writes_commit=1 revoked_membership_and_binding_403=1 hidden_order_404=1 dashboard_inbox_scope_change_409=1 list_tasks_week_facts_revocation=1');
}
