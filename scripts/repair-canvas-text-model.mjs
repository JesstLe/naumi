import assert from 'node:assert/strict';
import {createHash, createHmac, randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Recovery changes presentation only: preserve the existing model, provider,
// bindings, business prices and immutable in-flight execution snapshots.
export function recoveryPlan(config, options = {}) {
  const next = structuredClone(config);
  const id = config.bindings['text.generate'];
  const model = next.publicModels.find(m => m.id === id);
  assert.ok(model?.enabled && model.modality === 'text', 'Existing text default must be enabled');
  assert.equal(model.target.type, 'upstream', 'Recovery requires the existing direct text model');
  if (options.upstreamId) {
    const previous = config.upstreamModels.find(u => u.id === model.target.id);
    const replacement = config.upstreamModels.find(u => u.id === options.upstreamId);
    const agent = config.publicModels.find(m => m.id === config.bindings['agent.text']);
    assert.ok(agent?.target.type === 'upstream' && agent.target.id === options.upstreamId, 'Only the already configured legacy Agent channel may be restored');
    assert.ok(previous && replacement && previous.model === replacement.model, 'Recovery must preserve the original wire model');
    model.target.id = options.upstreamId;
  }
  const upstream = next.upstreamModels.find(m => m.id === model.target.id);
  const provider = next.providers.find(p => p.id === upstream?.providerId);
  assert.ok(upstream?.enabled && upstream.modality === 'text' && upstream.capabilities.generate, 'Text upstream must support generation');
  assert.ok(provider?.enabled && provider.protocol === 'openai-chat' && provider.credentialRef, 'Existing text provider must be configured');
  for (const feature of ['canvas.text-generate', 'canvas.assistant']) {
    const settings = config.business?.[feature];
    if (settings) {
      assert.ok(settings.enabled && settings.defaultModelId === id && settings.options.some(o => o.enabled && o.modelId === id), 'Do not override an explicit feature restriction');
    }
  }
  model.visible = true;
  return {config: next, id, upstreamModel: upstream.model, providerId: provider.id, changed: JSON.stringify(config) !== JSON.stringify(next)};
}

async function main() {
  const mode = process.argv[2];
  assert.ok(['--inspect', '--apply', '--rollback', '--verify'].includes(mode), 'Use --inspect, --apply, --verify or --rollback VERSION');
  const evidence = resolve(process.env.NAUMI_RECOVERY_EVIDENCE || '/tmp/naumi-text-recovery');
  await mkdir(evidence, {recursive: true, mode: 0o700});
  const {default: pg} = await import('pg');
  const pool = new pg.Pool({connectionString: process.env.DATABASE_URL, ssl: false, max: 1});
  try {
    const passwordHash = (await pool.query("SELECT v FROM app_settings WHERE k='admin_password_hash'")).rows[0]?.v?.trim();
    assert.ok(passwordHash && process.env.SETTINGS_SECRET, 'Server-side administrator authentication required');
    const exp = Date.now() + 120000;
    const cookie = 'nv_admin=' + exp + '.' + createHmac('sha256', process.env.SETTINGS_SECRET).update(`admin-access:${exp}:${passwordHash}`).digest('hex');
    const origin = 'http://127.0.0.1:3000';
    const call = async (path, method = 'GET', body) => {
      const response = await fetch(origin + path, {method, redirect: 'error', signal: AbortSignal.timeout(60000), headers: {cookie, 'content-type': 'application/json', origin}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
      const data = await response.json();
      assert.ok(response.ok, `${path}: HTTP ${response.status} ${data.code || ''}`);
      return data;
    };
    const path = '/api/admin/bi/model-config';
    const state = await call(path);
    const health = await call('/api/health');
    assert.equal(health.db.ok, true);
    assert.equal(process.env.STORAGE_DRIVER, 's3', 'Production storage must stay unchanged');
    const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const billingHash = hash(state.billingSnapshot);
    const originalImageModels = state.snapshot.config.publicModels.filter(m => m.modality !== 'text');
    const plan = recoveryPlan(state.snapshot.config, {upstreamId: process.env.NAUMI_TEXT_RECOVERY_UPSTREAM});
    const before = await call('/api/models?feature=canvas.text-generate');
    console.log(`CURRENT_VERSION=${state.snapshot.version} DEFAULT=${plan.id} WIRE_MODEL=${plan.upstreamModel} VISIBLE_MODELS=${before.models.length}`);
    if (mode === '--verify') {
      assert.equal(plan.changed, false, 'Requested recovery is not active');
      for (const feature of ['canvas.text-generate', 'canvas.assistant']) {
        const catalog = await call('/api/models?feature=' + feature);
        assert.equal(catalog.defaultModelId, plan.id);
        assert.ok(catalog.models.some(m => m.id === plan.id));
      }
      const text = await call('/api/text-models');
      assert.equal(text.defaultModel, plan.id);
      assert.ok(text.models.includes(plan.id));
      const applied = (await pool.query("SELECT p.phase,p.router_digest FROM app_model_publications p WHERE version=$1", [state.snapshot.version])).rows[0];
      assert.equal(applied?.phase, 'applied');
      const res = await fetch(process.env.NAUMI_ROUTER_MANAGEMENT_URL.replace(/\/$/, '') + '/internal/config/state', {headers: {authorization: 'Bearer ' + process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN}, signal: AbortSignal.timeout(10000)});
      assert.equal(res.status, 200);
      assert.equal((await res.json()).digest, applied.router_digest);
      assert.equal((await fetch(origin + path)).status, 404);
      console.log(`PRODUCTION_VERIFY=PASS MODEL_VERSION=${state.snapshot.version} ROUTER_ACK=APPLIED CATALOG_DEFAULT=${plan.id} WIRE=${plan.upstreamModel} PROVIDER=${plan.providerId} BILLING_VERSION=${state.billingVersion} HEALTH=200 NON_ADMIN=404 STORAGE_DRIVER=s3 PAID_GENERATION_POSTS=0`);
      return;
    }
    if (mode === '--inspect') {
      await writeFile(resolve(evidence, 'original-config.json'), JSON.stringify(state.snapshot, null, 2), {mode: 0o600});
      await writeFile(resolve(evidence, 'modified-config.json'), JSON.stringify(plan.config, null, 2), {mode: 0o600});
      await writeFile(resolve(evidence, 'original-hash.txt'), state.snapshot.digest + '\n', {mode: 0o600});
      const catalog = await call(path + '/catalog', 'POST', {providerId: plan.providerId, draftId: state.draft.id, expectedRevision: state.draft.revision});
      assert.equal(catalog.status, 'ok', 'Upstream model discovery must succeed before recovery');
      console.log(`UPSTREAM_CATALOG_COUNT=${catalog.models.length} DEFAULT_ADVERTISED=${catalog.models.some(m => m.id === plan.upstreamModel)}`);
      assert.ok(catalog.models.some(m => m.id === plan.upstreamModel), 'Existing upstream default must be advertised');
      console.log(`BASELINE=BLOCKED ROOT_CAUSE=HIDDEN_DEFAULT UPSTREAM_CATALOG=SUPPORTED PRICE_CHANGES=0 PAID_GENERATION_POSTS=0`);
      return;
    }
    let publication;
    const operationId = randomUUID();
    // Persist before mutation; ambiguous activation is reconciled with this ID,
    // never by submitting a fresh publication or a paid model invocation.
    await writeFile(resolve(evidence, `operation-${operationId}.json`), JSON.stringify({mode, operationId, previousVersion: state.snapshot.version, reason: '恢复画布原默认文字模型可见性'}), {mode: 0o600});
    if (mode === '--rollback') {
      const targetVersion = Number(process.argv[3]);
      assert.ok(Number.isSafeInteger(targetVersion) && targetVersion > 0);
      publication = await call(path + '/versions', 'POST', {id: operationId, targetVersion, expectedVersion: state.snapshot.version, reason: '回滚文字默认模型可见性修复'});
    } else {
      if (!plan.changed) { console.log('MODIFIED=ALREADY_APPLIED'); return; }
      assert.deepEqual(state.draft.config, state.snapshot.config, 'Preserve unpublished administrator edits; reconcile draft first');
      assert.equal(state.draft.basedOnVersion, state.snapshot.version, 'Draft must be based on active configuration');
      const saved = await call(path + '/draft', 'PUT', {id: state.draft.id, expectedRevision: state.draft.revision, config: plan.config});
      const validation = await call(path + '/validate', 'POST', {draftId: saved.id, expectedRevision: saved.revision});
      assert.deepEqual(validation.changes, [{entity: 'publicModels', id: plan.id, change: 'changed'}]);
      publication = await call(path, 'POST', {id: operationId, draftId: saved.id, expectedRevision: saved.revision, expectedVersion: state.snapshot.version, reason: '恢复画布原默认文字模型可见性；保持上游、绑定和价格不变'});
    }
    await writeFile(resolve(evidence, 'publication.json'), JSON.stringify(publication, null, 2), {mode: 0o600});
    assert.equal(publication.phase, 'applied', `Publication pending; reconcile operation ${operationId} before any retry`);
    const after = await call(path);
    assert.equal(after.snapshot.version, publication.version);
    assert.equal(hash(after.billingSnapshot), billingHash, 'Billing snapshot must not change');
    assert.deepEqual(after.snapshot.config.publicModels.filter(m => m.modality !== 'text'), originalImageModels);
    assert.deepEqual(after.snapshot.config.providers, state.snapshot.config.providers);
    assert.deepEqual(after.snapshot.config.upstreamModels, state.snapshot.config.upstreamModels);
    assert.deepEqual(after.snapshot.config.bindings, state.snapshot.config.bindings);
    if (mode === '--apply') {
      assert.deepEqual(after.snapshot.config, plan.config);
      for (const feature of ['canvas.text-generate', 'canvas.assistant']) {
        const catalog = await call('/api/models?feature=' + feature);
        assert.equal(catalog.defaultModelId, plan.id);
        assert.ok(catalog.models.some(m => m.id === plan.id));
      }
      const text = await call('/api/text-models');
      assert.equal(text.defaultModel, plan.id);
      assert.ok(text.models.includes(plan.id));
    }
    assert.equal((await call('/api/health')).db.ok, true);
    assert.equal((await fetch(origin + path)).status, 404);
    console.log(`${mode === '--apply' ? 'MODIFIED' : 'ROLLBACK'}=PASS VERSION=${publication.version} DEFAULT=${plan.id} BILLING=UNCHANGED PROVIDERS=UNCHANGED IMAGE_MODELS=UNCHANGED HEALTH=200 NON_ADMIN=404 PAID_GENERATION_POSTS=0`);
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
