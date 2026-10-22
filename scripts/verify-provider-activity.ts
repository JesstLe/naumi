import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, '1'); const address = new URL(process.env.DATABASE_URL!); assert.equal(address.hostname, '127.0.0.1'); assert.match(address.pathname, /fixture/);
  process.env.SETTINGS_SECRET = 'provider-activity-fixture-only-012345678901234567890123456';
  const db = await import('../src/lib/db'), schema = await import('../src/lib/model-config/schema');
  const { readProviderActivity } = await import('../src/lib/model-config/provider-activity'), { supplierChannelKey } = await import('../src/lib/model-config/channel-scheduler');
  await db.ensureSchema(); const pool = db.getPool(); await schema.ensureModelSchema(pool);
  const providers = schema.modelConfigSchema.shape.providers.parse(['one', 'two', 'empty'].map(id => ({ id, name: id + ' fixture', protocol: 'openai-chat', baseUrl: 'https://provider-' + id + '.fixture/v1', enabled: true, timeoutMs: 30000, maxConcurrent: 3 })));
  const capabilities = { verified: true, generate: true, edit: false, vision: false, transparent: false, preserveIdentity: false, textAccuracy: false, qualityRank: 1, qualities: [], nativeResolutions: [], maxReferenceImages: 0, expectedLatencyMs: 0 };
  const upstreamModels = [['one-primary', 'one', 'model-one'], ['one-alias', 'one', 'model-one'], ['two-observed', 'two', 'model-two'], ['two-unobserved', 'two', 'model-other']].map(([id, providerId, model]) => ({ id, providerId, model, label: 'fixture', modality: 'text', enabled: true, capabilities, parameterMap: {} }));
  const publicModel = (id: string, mode: string, upstreamId: string) => ({ id, label: 'fixture', modality: 'text', enabled: true, visible: true, target: { type: 'upstream', id: upstreamId }, supplierRouting: { mode, channels: [{ upstreamId, enabled: true, priority: 1, weight: 1 }] } });
  const config = { upstreamModels, publicModels: [publicModel('public-one', 'priority', 'one-primary'), publicModel('public-one-balanced', 'balanced', 'one-alias'), publicModel('public-two', 'priority', 'two-observed')] };
  const now = Date.parse('2026-10-23T12:00:00Z'), read = () => readProviderActivity(pool, config, providers, now);
  const absent = await read(); assert(absent.providers.every(provider => provider.stats.errorCode === 'NOT_RECORDED' && provider.stats.h24 === null));
  assert.equal(absent.providers[0].circuit.configuredChannels, 1); assert.equal(absent.providers[0].circuit.unobservedChannels, 1); assert.equal(absent.providers[0].circuit.openChannels, 0);
  await (await import('../src/lib/model-config/execution-audit')).ensureExecutionAuditSchema(pool);
  const insert = async (provider: string, state: string, age: number) => {
    const id = randomUUID(); await pool.query(`INSERT INTO app_model_execution_stages(id,operation_id,feature,public_model_id,model_version,billing_version,provider_id,wire_model,phase,state,attempt,created_at) VALUES($1,'fixture','fixture','fixture',1,1,$2,'SENSITIVE-WIRE-MODEL','text',$3,1,$4)`, [id, provider, state, new Date(now - age)]); return id;
  };
  await insert('one', 'response-received', 86_400_000); await insert('one', 'stream-completed', 0); await insert('one', 'submitted', 3_600_000); await insert('one', 'failed-response', 3_600_001);
  await insert('one', 'rejected-not-charged', 1000); await insert('one', 'failed-output', 1000); await insert('one', 'unknown', 1000); await insert('one', 'future-state', 1000);
  const finished = await insert('one', 'submitted', 2000); await pool.query("UPDATE app_model_execution_stages SET state='response-received' WHERE id=$1", [finished]);
  await insert('one', 'response-received', 86_400_001); await insert('one', 'response-received', -1); await insert('two', 'rejected-not-charged', 1000); await insert('deleted-provider', 'response-received', 1000);
  const key = (provider: string, model: string, baseUrl = providers.find(p => p.id === provider)!.baseUrl) => supplierChannelKey({ providerId: provider, baseUrl, wireModel: model });
  await pool.query(`INSERT INTO app_model_channel_health(key,open_until,probe_until) VALUES($1,$4,NULL),($2,NULL,$4),($3,$4,NULL)`, [key('one', 'model-one'), key('two', 'model-two'), key('one', 'model-one', 'https://old-private.fixture/v1'), new Date(now + 60_000)]);
  const before = (await pool.query('SELECT count(*)::int n FROM app_model_execution_stages')).rows[0].n;
  const recorded = await read(), one = recorded.providers.find(provider => provider.id === 'one')!, two = recorded.providers.find(provider => provider.id === 'two')!, empty = recorded.providers.find(provider => provider.id === 'empty')!;
  assert.deepEqual(one.stats.h24, { total: 9, accepted: 3, rejected: 1, failed: 2, unknown: 2, processing: 1 });
  assert.deepEqual(one.stats.h1, { total: 7, accepted: 2, rejected: 1, failed: 1, unknown: 2, processing: 1 });
  assert.equal(two.stats.h24!.total, 1); assert.equal(two.stats.h24!.rejected, 1); assert.equal(empty.stats.h24!.total, 0); assert.equal(empty.stats.errorCode, null);
  assert.deepEqual(one.routingModes, ['priority', 'balanced']); assert.equal(one.circuit.openChannels, 1); assert.equal(one.circuit.observedChannels, 1); assert.equal(one.circuit.unobservedChannels, 0);
  assert.equal(two.circuit.recoveringChannels, 1); assert.equal(two.circuit.unobservedChannels, 1); assert.equal(empty.circuit.configuredChannels, 0);
  assert.equal((await pool.query('SELECT count(*)::int n FROM app_model_execution_stages')).rows[0].n, before);
  assert.doesNotMatch(JSON.stringify(recorded), /SENSITIVE-WIRE-MODEL|old-private|baseUrl|credentialRef|https:/);
  await pool.query('ALTER TABLE app_model_channel_health RENAME TO fixture_saved_health');
  const missingHealth = await read(); assert(missingHealth.providers.every(provider => provider.circuit.errorCode === 'HEALTH_NOT_RECORDED' && provider.circuit.openChannels === null)); assert.equal(missingHealth.providers[0].stats.h24!.total, 9);
  await pool.query('ALTER TABLE fixture_saved_health RENAME TO app_model_channel_health');
  await pool.query('ALTER TABLE app_model_execution_stages RENAME TO fixture_saved_stages');
  const missingStats = await read(); assert(missingStats.providers.every(provider => provider.stats.errorCode === 'NOT_RECORDED' && provider.stats.h24 === null)); assert.equal(missingStats.providers[0].circuit.openChannels, 1);
  await pool.query('ALTER TABLE fixture_saved_stages RENAME TO app_model_execution_stages');
  const unsafePool = { connect: async () => { throw new Error('sk-SENSITIVE https://private.fixture/?key=DO_NOT_LEAK'); } } as unknown as typeof pool;
  const safe = await readProviderActivity(unsafePool, config, providers, now); assert(safe.providers.every(provider => provider.stats.errorCode === 'ACTIVITY_UNAVAILABLE' && provider.circuit.errorCode === 'HEALTH_UNAVAILABLE')); assert.doesNotMatch(JSON.stringify(safe), /sk-SENSITIVE|private.fixture|DO_NOT_LEAK/);
  const missingConfig = await readProviderActivity(pool, {}, providers, now); assert(missingConfig.providers.every(provider => provider.circuit.configuredChannels === null && provider.circuit.errorCode === 'CONFIG_NOT_RECORDED'));
  await pool.query('DELETE FROM app_model_execution_stages'); const zero = await read(); assert(zero.providers.every(provider => provider.stats.h24!.total === 0 && provider.stats.h1!.total === 0));
  await pool.query(`INSERT INTO app_model_execution_stages(id,operation_id,feature,public_model_id,model_version,billing_version,provider_id,wire_model,phase,state,attempt,created_at)
    SELECT gen_random_uuid(),'fixture','fixture','fixture',1,1,'one','fixture','text','response-received',1,$1 FROM generate_series(1,50001)`, [new Date(now)]);
  const limited = await read(); assert(limited.providers.every(provider => provider.stats.errorCode === 'ROW_LIMIT' && provider.stats.h24 === null && provider.stats.h1 === null));
  console.log('PROVIDER_ACTIVITY_FIXTURE_PASS missing_table_unknown=1 existing_empty_zero=1 state_buckets=1 inclusive_time_bounds=1 future_excluded=1 finish_updates_single_attempt=1 provider_grouping=1 channel_identity=1 alias_dedupe=1 unobserved_unknown=1 policy_from_publish=1 row_limit_unknown=1 fixed_errors=1 no_secret_fields=1 readonly_counts=1 real_supplier_calls=0');
  await pool.end();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
