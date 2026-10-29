import 'server-only';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { makeSupplierCopy103Plan, rollbackSupplierCopy103 } from '../lib/supplier-copy103.mjs';
import { digest } from '../lib/apib-activation.mjs';
import { validateModelConfig } from '../../src/lib/model-config/schema';
import { compileRouterProjection } from '../../src/lib/model-config/projection';
import { ensureSupplierModels } from '../../src/lib/supplier-models/schema';
import { ingestSupplierDirectory, saveSupplierModel } from '../../src/lib/supplier-models/repository';
import { supplierMetadataSchema } from '../../src/lib/supplier-models/types';
import { ensureSupplierVideoSchema, recordSupplierVideoDefinition } from '../../src/lib/supplier-models/video-access';
import { videoDefinitionSchema, videoWireProfileSchema } from '../../src/lib/video/capability-schema';
import { managedVideoDefinition } from '../../src/lib/video/model-definition';
import { validateBillingConfig } from '../../src/lib/billing/rules/schema';
import type { ConfigSnapshot } from '../../src/lib/billing/types';

type Admin = Awaited<ReturnType<typeof import('../../src/lib/model-config/server').getModelAdministration>>;
type Credential = { providerId: string; sourceCredentialRef: string; plain: string };
export type CopyPayload = { operationId: string; rollbackOperationId: string; actor: string;
  source: { version: number; digest: string; config: any }; credentials: Credential[];
  metadata: { providerId: string; modelId: string; label?: string; metadata: unknown }[];
  videoDefinitions?: { providerId: string; modelId: string; definition: unknown; profile?: unknown; sourceUrl: string }[];
  sourceVideoFrozen?: { upstreamId: string; value: { definition: unknown; profile?: unknown; sourceRevision?: unknown } }[];
  expected: { modelVersion: number; modelDigest: string; billingVersion: number; billingDigest: string; billingRawDigest: string };
  approvedConflictDigest?: string; approvedLocalEndpointsDigest?: string; approvedMetadataDigest?: string;
  reconcilePublication?: boolean;
};
const eq = (a: unknown, b: unknown) => digest(a) === digest(b);
function gate(ok: unknown, code: string): asserts ok { if (!ok) { const error = new Error(code); Object.assign(error, { code }); throw error; } }
const uuid = (s: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(s);
const key = (r: any) => `${r.providerId}\t${r.modelId}`;
const data = (r: any) => supplierMetadataSchema.parse(r.metadata);
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
/** Match the real billing repository read path, including newly added defaults.
 * This is a pure read projection; the original immutable stored config stays raw. */
export function normalizeCopy103Billing(raw: { version: unknown; config: unknown }): ConfigSnapshot {
  const version = Number(raw?.version);
  gate(Number.isSafeInteger(version) && version > 0, 'BILLING_VERSION_INVALID');
  return { version, config: validateBillingConfig(raw.config) };
}
async function assertRawBilling(a: Admin, expected: CopyPayload['expected'], normalized: ConfigSnapshot) {
  const row = (await a.pool.query('SELECT version,config FROM app_billing_config_versions WHERE version=$1', [expected.billingVersion])).rows[0];
  gate(row, 'BILLING_RAW_VERSION_MISSING');
  const raw = { version: Number(row.version), config: row.config };
  gate(typeof expected.billingRawDigest === 'string' && digest(raw) === expected.billingRawDigest, 'BILLING_RAW_CAS_HOLD');
  gate(digest(normalizeCopy103Billing(raw)) === digest(normalized), 'BILLING_NORMALIZATION_HOLD');
}
function save(root: string, value: any, secrets: string[]) {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  gate(!secrets.some(secret => secret && bytes.includes(secret)), 'PLAINTEXT_IN_JOURNAL_HOLD');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const path = join(root, 'state.json'), temp = path + '.' + randomUUID();
  writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 }); renameSync(temp, path);
}
// These metadata APIs own transactions. Bind them to this one outer PG tx;
// no independent COMMIT can expose half of the metadata migration.
function boundPool(tx: PoolClient): Pool {
  const query = (sql: any, values?: any) => typeof sql === 'string' && /^(BEGIN|COMMIT|ROLLBACK)\s*;?$/i.test(sql.trim())
    ? Promise.resolve({ rows: [], rowCount: 0 }) : tx.query(sql, values);
  return { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
}
function inputManifest(input: CopyPayload) {
  gate(uuid(input.operationId) && uuid(input.rollbackOperationId) && input.operationId !== input.rollbackOperationId, 'OPERATION_ID_INVALID');
  gate(!!input.actor && input.actor.length < 200 && digest(input.source.config) === input.source.digest, 'SOURCE_DIGEST_INVALID');
  const required = input.source.config.providers.filter((p: any) => p.credentialRef);
  gate(new Set(input.credentials.map(c => c.providerId)).size === input.credentials.length && required.length === input.credentials.length, 'CREDENTIAL_SET_MISMATCH');
  for (const p of required) { const c = input.credentials.find(c => c.providerId === p.id); gate(c && c.sourceCredentialRef === p.credentialRef && typeof c.plain === 'string' && !!c.plain.trim(), 'CREDENTIAL_SOURCE_MISMATCH'); }
  gate(new Set(input.metadata.map(key)).size === input.metadata.length, 'METADATA_DUPLICATE');
  for (const m of input.metadata) { gate(input.source.config.providers.some((p: any) => p.id === m.providerId), 'METADATA_PROVIDER_MISSING'); data(m); }
  for (const v of input.videoDefinitions || []) {
    gate(input.source.config.upstreamModels.some((u: any) => u.modality === 'video' && u.providerId === v.providerId && u.model === v.modelId), 'VIDEO_NOT_CONFIGURED');
    videoDefinitionSchema.parse(v.definition); if (v.profile !== undefined) videoWireProfileSchema.parse(v.profile);
    const url = new URL(v.sourceUrl); gate(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash, 'VIDEO_SOURCE_URL_INVALID');
  }
  gate(new Set((input.videoDefinitions || []).map(key)).size === (input.videoDefinitions || []).length, 'VIDEO_DUPLICATE');
  if (input.sourceVideoFrozen) {
    const ids = input.source.config.upstreamModels.filter((u: any) => u.modality === 'video').map((u: any) => u.id).sort();
    gate(eq(input.sourceVideoFrozen.map(v => v.upstreamId).sort(), ids), 'SOURCE_FROZEN_VIDEO_SET_MISMATCH');
  }
  return { operationId: input.operationId, rollbackOperationId: input.rollbackOperationId, actor: input.actor, sourceVersion: input.source.version,
    sourceDigest: input.source.digest, metadataDigest: digest(input.metadata), videoDigest: digest(input.videoDefinitions || []), sourceFrozenVideoDigest: digest(input.sourceVideoFrozen || []), expected: input.expected,
    credentialSources: input.credentials.map(({ providerId, sourceCredentialRef }) => ({ providerId, sourceCredentialRef })) };
}
function normalizedPlan(input: CopyPayload, target: any, refs: any, trustedOrigins: readonly string[]) {
  const plan = makeSupplierCopy103Plan(input.source.config, target, refs), normalized = validateModelConfig(plan.config, { trustedOrigins });
  // Schema normalization is part of the reviewed candidate, never an unrecorded
  // mutation between candidateDigest and saveDraft.
  for (const group of ['providers', 'upstreamModels', 'publicModels', 'pools']) {
    gate(normalized[group as keyof typeof normalized] instanceof Array, 'NORMALIZED_GROUP_INVALID');
    const rows: any[] = (normalized as any)[group];
    for (const old of target[group]) gate(rows.some(row => row.id === old.id), 'SCHEMA_REMOVED_TARGET_ROW');
    plan.delta = plan.delta.filter((change: any) => !(change.kind === 'row' && change.group === group));
    for (const row of rows) {
      const old = target[group].find((r: any) => r.id === row.id);
      if (!old || !eq(old, row)) plan.delta.push({ kind: 'row', group, id: row.id,
        before: old ? { present: true, value: structuredClone(old) } : { present: false }, after: { present: true, value: structuredClone(row) } });
    }
  }
  plan.config = normalized; plan.candidateDigest = digest(normalized);
  gate(digest(rollbackSupplierCopy103(normalized, plan)) === digest(target), 'NORMALIZED_INVERSE_MISMATCH');
  return plan;
}
async function baseline(a: Admin, expected: CopyPayload['expected']) {
  const model = await a.repo.current(), billing = await a.billing.current();
  gate(model.version === expected.modelVersion && model.digest === expected.modelDigest, 'MODEL_CAS_HOLD');
  gate(billing.version === expected.billingVersion && digest(billing) === expected.billingDigest, 'BILLING_CAS_HOLD');
  await assertRawBilling(a, expected, billing);
  return { model, billing };
}
async function metadataPlan(a: Admin, input: CopyPayload) {
  await ensureSupplierModels(a.pool); await ensureSupplierVideoSchema(a.pool);
  const rows = (await a.pool.query('SELECT id,provider_id,model_id,revision,metadata FROM app_supplier_model_metadata')).rows;
  const videos = (await a.pool.query('SELECT id,provider_id,model_id,revision,definition,profile,source_url FROM app_supplier_video_definitions')).rows;
  const metadata = input.metadata.map(m => { const old = rows.find(r => r.provider_id === m.providerId && r.model_id === m.modelId);
    return { providerId: m.providerId, modelId: m.modelId, label: m.label || m.modelId, operationId: randomUUID(), rollbackOperationId: randomUUID(),
      before: old ? { id: old.id, revision: Number(old.revision), metadata: data(old) } : null, after: data(m) }; });
  const video = (input.videoDefinitions || []).map(v => { const old = videos.find(r => r.provider_id === v.providerId && r.model_id === v.modelId);
    return { providerId: v.providerId, modelId: v.modelId, before: old ? { definition: old.definition, ...(old.profile ? { profile: old.profile } : {}), sourceUrl: old.source_url, revision: Number(old.revision) } : null,
      after: { definition: videoDefinitionSchema.parse(v.definition), ...(v.profile ? { profile: videoWireProfileSchema.parse(v.profile) } : {}), sourceUrl: v.sourceUrl } }; });
  const review = { metadata: metadata.map(m => ({ providerId: m.providerId, modelId: m.modelId, existing: !!m.before, beforeDigest: m.before ? digest(m.before.metadata) : null, afterDigest: digest(m.after), changed: !m.before || !eq(m.before.metadata, m.after) })),
    video: video.map(v => ({ providerId: v.providerId, modelId: v.modelId, existing: !!v.before, beforeDigest: v.before ? digest(v.before) : null, afterDigest: digest(v.after) })) };
  return { metadata, video, review, reviewDigest: digest(review) };
}
async function frozenHash(a: Admin, maxVersion: number) {
  return digest((await a.pool.query('SELECT model_version,upstream_id,model_digest,value FROM app_video_model_defaults WHERE model_version<=$1 ORDER BY model_version,upstream_id', [maxVersion])).rows);
}
async function videoReview(a: Admin, input: CopyPayload, candidate: any) {
  const rows = (await a.pool.query('SELECT provider_id,model_id,definition,profile,source_url FROM app_supplier_video_definitions')).rows;
  const result = [];
  for (const sourceUpstream of input.source.config.upstreamModels.filter((u: any) => u.modality === 'video')) {
    const u = candidate.upstreamModels.find((u: any) => u.id === sourceUpstream.id), p = candidate.providers.find((p: any) => p.id === u.providerId);
    const source = input.videoDefinitions?.find(v => v.providerId === u.providerId && v.modelId === u.model);
    const retained = rows.find(r => r.provider_id === u.providerId && r.model_id === u.model);
    const vendor = source || (retained ? { definition: retained.definition, ...(retained.profile ? { profile: retained.profile } : {}), sourceUrl: retained.source_url } : null);
    const computed = managedVideoDefinition(u, p, vendor ? { definition: vendor.definition, profile: vendor.profile, sourceRevision: { id: 'planned-source', revision: 1, sourceUrl: vendor.sourceUrl, collectedAt: '' } } as any : null);
    const { sources, ...definition } = computed.capability;
    const observed = input.sourceVideoFrozen?.find(v => v.upstreamId === u.id);
    if (input.sourceVideoFrozen) {
      gate(observed && eq(observed.value.definition, definition) && (observed.value.profile || undefined) === computed.profile, 'PLAN_VIDEO_EFFECTIVE_DEFAULT_MISMATCH');
      if (!observed.value.sourceRevision) gate(!vendor, 'PLAN_VIDEO_SOURCE_REVISION_CHANGED');
    }
    result.push({ upstreamId: u.id, definitionDigest: digest(definition), profile: computed.profile || null, sourceFrozenCompared: !!observed, supplierDefinition: !!vendor });
  }
  return result;
}
async function persistMetadata(tx: PoolClient, a: Admin, input: CopyPayload, state: any) {
  const pool = boundPool(tx);
  for (const m of state.metadata.metadata) {
    let row = (await tx.query('SELECT id,revision,metadata FROM app_supplier_model_metadata WHERE provider_id=$1 AND model_id=$2 FOR UPDATE', [m.providerId, m.modelId])).rows[0];
    if (m.before) gate(row && Number(row.revision) === m.before.revision && eq(row.metadata, m.before.metadata), 'METADATA_CAS_HOLD');
    else { gate(!row, 'METADATA_CREATED_AFTER_PLAN'); await ingestSupplierDirectory(pool, input.source.config.providers.find((p: any) => p.id === m.providerId), [{ id: m.modelId, label: m.label }]);
      row = (await tx.query('SELECT id,revision,metadata FROM app_supplier_model_metadata WHERE provider_id=$1 AND model_id=$2', [m.providerId, m.modelId])).rows[0]; }
    m.targetId = row.id; m.importBaseline = data(row);
    if (eq(row.metadata, m.after)) { m.appliedRevision = Number(row.revision); continue; }
    m.request = { id: m.operationId, modelId: row.id, expectedRevision: Number(row.revision), metadata: m.after, actor: input.actor };
    const result = await saveSupplierModel(pool, m.request); m.appliedRevision = result.revision;
  }
  for (const v of state.metadata.video) {
    const row = (await tx.query('SELECT definition,profile,source_url,revision FROM app_supplier_video_definitions WHERE provider_id=$1 AND model_id=$2 FOR UPDATE', [v.providerId, v.modelId])).rows[0];
    if (v.before) gate(row && Number(row.revision) === v.before.revision && eq(row.definition, v.before.definition) && (row.profile || undefined) === v.before.profile && row.source_url === v.before.sourceUrl, 'VIDEO_CAS_HOLD');
    else gate(!row, 'VIDEO_CREATED_AFTER_PLAN');
    const result = await recordSupplierVideoDefinition(a.pool, { providerId: v.providerId, modelId: v.modelId, ...v.after }, tx); v.appliedRevision = result.revision;
  }
}
async function verifyImported(a: Admin, state: any) {
  for (const [providerId, ref] of Object.entries(state.credentialRefs) as any) gate((await a.pool.query('SELECT 1 FROM app_model_credentials WHERE id=$1 AND provider_id=$2', [ref.targetCredentialRef, providerId])).rowCount === 1, 'CREDENTIAL_IMPORT_COMMIT_UNKNOWN');
  for (const m of state.metadata.metadata) { const r = (await a.pool.query('SELECT revision,metadata FROM app_supplier_model_metadata WHERE id=$1', [m.targetId])).rows[0]; gate(r && Number(r.revision) === m.appliedRevision && eq(r.metadata, m.after), 'METADATA_IMPORT_CONFLICT'); }
  for (const v of state.metadata.video) { const r = (await a.pool.query('SELECT revision,definition,profile,source_url FROM app_supplier_video_definitions WHERE provider_id=$1 AND model_id=$2', [v.providerId, v.modelId])).rows[0]; gate(r && Number(r.revision) === v.appliedRevision && eq(r.definition, v.after.definition) && (r.profile || undefined) === v.after.profile && r.source_url === v.after.sourceUrl, 'VIDEO_IMPORT_CONFLICT'); }
}
function restoreOwn(current: any, before: any, after: any): any {
  if (eq(before, after)) return structuredClone(current);
  if (eq(current, after)) return structuredClone(before);
  if ([current, before, after].every(v => v && typeof v === 'object' && !Array.isArray(v))) {
    const result = structuredClone(current);
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const b = Object.hasOwn(before, k) ? { v: before[k] } : {}, n = Object.hasOwn(after, k) ? { v: after[k] } : {}, c = Object.hasOwn(current, k) ? { v: current[k] } : {};
      if (eq(b, n)) continue;
      const restored = eq(c, n) ? b : Object.hasOwn(b, 'v') && Object.hasOwn(n, 'v') && Object.hasOwn(c, 'v') ? { v: restoreOwn((c as any).v, (b as any).v, (n as any).v) } : null;
      gate(restored, 'METADATA_ROLLBACK_FIELD_HOLD'); if (Object.hasOwn(restored, 'v')) result[k] = (restored as any).v; else delete result[k];
    }
    return result;
  }
  gate(false, 'METADATA_ROLLBACK_FIELD_HOLD');
}
async function publish(a: Admin, root: string, state: any, input: CopyPayload, kind: 'apply' | 'rollback', config: any, expected: any) {
  const field = kind + 'Request', id = kind === 'apply' ? input.operationId : input.rollbackOperationId;
  let existing; try { existing = await a.repo.publication(id); } catch (e: any) { gate(e.code === 'PUBLICATION_UNAVAILABLE', 'PUBLICATION_READ_HOLD'); }
  if (existing) { gate(!!state[field] && existing.digest === digest(config), 'PUBLICATION_REQUEST_MISMATCH'); if (existing.phase === 'applied') return existing;
    gate(existing.phase !== 'failed' && (!['unknown', 'activating', 'preparing'].includes(existing.phase) || input.reconcilePublication === true), 'PUBLICATION_RECONCILIATION_REQUIRED'); }
  const now = await a.repo.current(); gate(now.version === expected.version && now.digest === expected.digest, 'MODEL_CAS_HOLD');
  if (!state[field]) {
    const actor = `copy103:${id}`, draft = await a.repo.draft(actor); gate(draft.basedOnVersion === expected.version, 'DRAFT_BASE_HOLD');
    const saved = await a.repo.saveDraft({ id: draft.id, expectedRevision: draft.revision, config, actor }); gate(digest(saved.config) === digest(config), 'DRAFT_NORMALIZATION_HOLD');
    state[field] = { id, draftId: saved.id, expectedRevision: saved.revision, expectedVersion: expected.version, actor,
      reason: kind === 'apply' ? 'User-authorized supplier execution graph copy to isolated 103; target billing and customer defaults preserved' : 'Selective inverse of supplier copy; retain later unrelated fields and immutable task history' };
    save(root, state, input.credentials.map(c => c.plain));
  }
  const result = await a.runtime.publish(state[field]); state[kind + 'Publication'] = result; save(root, state, input.credentials.map(c => c.plain));
  gate(result.phase === 'applied', 'PUBLICATION_RECONCILIATION_REQUIRED'); return result;
}

export async function runSupplierCopy103(mode: 'PLAN' | 'APPLY' | 'VERIFY' | 'ROLLBACK', root: string, a: Admin, input: CopyPayload, proof: any, fixture = false) {
  const manifest = inputManifest(input), secrets = input.credentials.map(c => c.plain), path = join(root, 'state.json');
  if (fixture) gate(process.env.NAUMI_VERIFY_ISOLATED_DB === '1' && new URL(process.env.DATABASE_URL!).hostname === '127.0.0.1', 'ISOLATED_DB_REQUIRED');
  else { gate(proof?.target === '103.30.76.93' && proof.operationId === input.operationId && proof.scope === 'supplier-copy103-host-transaction' && proof.held === true &&
    eq(proof.locks, ['/opt/naumi-staging/releases/deploy.lock', '/opt/naumi-reverse-hub/releases/deploy.lock']) && Date.now() - Date.parse(proof.observedAt) >= 0 && Date.now() - Date.parse(proof.observedAt) < 120000, 'HELD_103_LOCK_PROOF_REQUIRED'); }
  let state = existsSync(path) ? read(path) : null;
  if (state) gate(eq(state.manifest, manifest), 'ORIGINAL_OPERATION_INPUT_CHANGED');
  if (mode === 'PLAN') {
    const { model, billing } = await baseline(a, input.expected);
    if (!state) {
      const placeholderRefs = Object.fromEntries(input.credentials.map(c => [c.providerId, { sourceCredentialRef: c.sourceCredentialRef, targetCredentialRef: randomUUID() }]));
      const plan = normalizedPlan(input, model.config, placeholderRefs, a.trustedOrigins);
      compileRouterProjection({ ...model, config: plan.config }, billing, { trustedOrigins: a.trustedOrigins });
      const metadata = await metadataPlan(a, input), videos = await videoReview(a, input, plan.config);
      state = { schemaVersion: 1, manifest, phase: 'PLANNED_PENDING_CREDENTIAL_REFS', baseline: model, billingDigest: digest(billing), billingRawDigest: input.expected.billingRawDigest,
        semanticPlan: plan, metadata, videoReview: videos, priorFrozenVideoHash: await frozenHash(a, model.version) };
      save(root, state, secrets);
    }
    return { mode, phase: state.phase, semanticCandidateDigest: state.semanticPlan.candidateDigest, finalCandidateDigest: null, credentialRefsPending: true,
      sourceCounts: state.semanticPlan.sourceCounts, conflicts: state.semanticPlan.conflicts, conflictDigest: digest(state.semanticPlan.conflicts),
      localEndpoints: state.semanticPlan.localEndpoints, localEndpointsDigest: digest(state.semanticPlan.localEndpoints), metadataReview: state.metadata.review,
      metadataReviewDigest: state.metadata.reviewDigest, videoReview: state.videoReview, sourceVideoDefinitionCount: (input.videoDefinitions || []).length, supplierCalls: 0 };
  }
  gate(state, 'PLAN_REQUIRED');
  const billingGuard = await a.pool.connect();
  try {
    // Current billing is append-only; holding SHARE blocks concurrent tariff INSERT.
    await billingGuard.query('BEGIN'); await billingGuard.query('LOCK TABLE app_billing_config_versions IN SHARE MODE');
    const bill = await a.billing.current(); gate(bill.version === input.expected.billingVersion && digest(bill) === state.billingDigest, 'BILLING_CAS_HOLD');
    gate(state.billingRawDigest === input.expected.billingRawDigest, 'BILLING_RAW_REVIEW_HOLD');
    await assertRawBilling(a, input.expected, bill);
    if (mode === 'APPLY') {
      if (!state.applyRequest) await baseline(a, input.expected);
      gate(!state.semanticPlan.conflicts.length || input.approvedConflictDigest === digest(state.semanticPlan.conflicts), 'CONFLICT_REVIEW_REQUIRED');
      gate(!state.semanticPlan.localEndpoints.length || input.approvedLocalEndpointsDigest === digest(state.semanticPlan.localEndpoints), 'LOCAL_ENDPOINT_REVIEW_REQUIRED');
      gate(input.approvedMetadataDigest === state.metadata.reviewDigest, 'METADATA_REVIEW_REQUIRED');
      if (!state.credentialRefs) {
        gate(eq(await videoReview(a, input, state.semanticPlan.config), state.videoReview), 'VIDEO_DEFAULTS_CHANGED_AFTER_PLAN');
        const tx = await a.pool.connect();
        try {
          await tx.query('BEGIN'); state.credentialRefs = {};
          for (const c of input.credentials) { const result = await a.credentials.importPlain({ providerId: c.providerId, plain: c.plain, actor: input.actor }, tx); state.credentialRefs[c.providerId] = { sourceCredentialRef: c.sourceCredentialRef, targetCredentialRef: result.id }; }
          state.plan = normalizedPlan(input, state.baseline.config, state.credentialRefs, a.trustedOrigins);
          compileRouterProjection({ ...state.baseline, config: state.plan.config }, bill, { trustedOrigins: a.trustedOrigins });
          await persistMetadata(tx, a, input, state);
          state.phase = 'IMPORT_COMMIT_PENDING'; save(root, state, secrets); await tx.query('COMMIT');
          state.phase = 'IMPORT_COMMITTED'; save(root, state, secrets);
        } catch (error) { await tx.query('ROLLBACK'); throw error; } finally { tx.release(); }
      }
      await verifyImported(a, state);
      for (const c of input.credentials) gate(await a.credentials.read(state.credentialRefs[c.providerId].targetCredentialRef, c.providerId) === c.plain, 'CREDENTIAL_CONTENT_HOLD');
      const publication = await publish(a, root, state, input, 'apply', state.plan.config, state.baseline);
      state.phase = 'APPLIED'; save(root, state, secrets);
      gate(await frozenHash(a, state.baseline.version) === state.priorFrozenVideoHash, 'OLD_VIDEO_FREEZE_CHANGED');
      return { mode, phase: state.phase, publication, candidateDigest: state.plan.candidateDigest, credentialImports: Object.keys(state.credentialRefs).length, metadataCount: state.metadata.metadata.length, videoDefinitionCount: state.metadata.video.length, supplierCalls: 0 };
    }
    gate(state.applyRequest && state.plan, 'APPLY_REQUEST_REQUIRED');
    const owned = await a.repo.publication(input.operationId); gate(owned.phase === 'applied' && owned.digest === state.plan.candidateDigest, 'APPLY_PUBLICATION_HOLD');
    if (mode === 'VERIFY') {
      const current = await a.repo.current(); gate(current.version === owned.version && current.digest === state.plan.candidateDigest, 'VERIFY_ACTIVE_CONFIG_CHANGED'); await verifyImported(a, state);
      gate(digest(rollbackSupplierCopy103(current.config, state.plan)) === state.baseline.digest, 'VERIFY_PROTECTED_FIELDS_CHANGED');
      gate(await frozenHash(a, state.baseline.version) === state.priorFrozenVideoHash, 'OLD_VIDEO_FREEZE_CHANGED');
      const video = [];
      for (const u of input.source.config.upstreamModels.filter((u: any) => u.modality === 'video')) {
        const provider = input.source.config.providers.find((p: any) => p.id === u.providerId), source = input.videoDefinitions?.find(v => v.providerId === u.providerId && v.modelId === u.model);
        const expected = managedVideoDefinition(u, provider, source ? { definition: source.definition, profile: source.profile, sourceRevision: { id: 'source-observation', revision: 1, sourceUrl: source.sourceUrl, collectedAt: '' } } as any : null);
        const row = (await a.pool.query('SELECT value FROM app_video_model_defaults WHERE model_version=$1 AND upstream_id=$2', [current.version, u.id])).rows[0];
        const { sources, ...computedDefinition } = expected.capability;
        const observed = input.sourceVideoFrozen?.find(r => r.upstreamId === u.id);
        if (input.sourceVideoFrozen) gate(observed, 'SOURCE_VIDEO_FROZEN_MISSING');
        const definition = observed ? observed.value.definition : computedDefinition, profile = observed ? observed.value.profile : expected.profile;
        gate(row && eq(row.value.definition, definition) && (row.value.profile || undefined) === profile, 'VIDEO_EFFECTIVE_DEFAULT_MISMATCH');
        if (observed && !observed.value.sourceRevision) gate(!row.value.sourceRevision, 'VIDEO_SOURCE_REVISION_CHANGED');
        video.push({ upstreamId: u.id, definitionMatches: true, sourceFrozenCompared: !!observed, sourceDefinitionPresent: !!source });
      }
      state.phase = 'VERIFIED'; save(root, state, secrets);
      return { mode, phase: state.phase, publication: owned, modelVersion: current.version, billingVersion: bill.version, billingUnchanged: true, priorVideoFrozenUnchanged: true, video, supplierCalls: 0, generationSubmitted: false };
    }
    gate(mode === 'ROLLBACK', 'MODE_INVALID');
    if (!state.rollback) {
      const current = await a.repo.current(), config = rollbackSupplierCopy103(current.config, state.plan); validateModelConfig(config, { trustedOrigins: a.trustedOrigins });
      const metadata = [];
      for (const m of state.metadata.metadata) {
        const row = (await a.pool.query('SELECT revision,metadata FROM app_supplier_model_metadata WHERE id=$1', [m.targetId])).rows[0]; gate(row, 'ROLLBACK_METADATA_MISSING');
        const restored = restoreOwn(row.metadata, m.before?.metadata || m.importBaseline, m.after);
        if (eq(row.metadata, restored)) continue;
        metadata.push({ id: m.rollbackOperationId, modelId: m.targetId, expectedRevision: Number(row.revision), metadata: supplierMetadataSchema.parse(restored), actor: input.actor });
      }
      const video = [];
      for (const v of state.metadata.video) {
        const row = (await a.pool.query('SELECT definition,profile,source_url,revision FROM app_supplier_video_definitions WHERE provider_id=$1 AND model_id=$2', [v.providerId, v.modelId])).rows[0]; gate(row, 'ROLLBACK_VIDEO_MISSING');
        const current = { definition: row.definition, ...(row.profile ? { profile: row.profile } : {}), sourceUrl: row.source_url };
        const before = v.before ? { definition: v.before.definition, ...(v.before.profile ? { profile: v.before.profile } : {}), sourceUrl: v.before.sourceUrl } : { definition: {}, sourceUrl: 'https://naumi.invalid/supplier-copy103/rollback' };
        video.push({ providerId: v.providerId, modelId: v.modelId, expectedRevision: Number(row.revision), current, restored: restoreOwn(current, before, v.after) });
      }
      state.rollback = { expected: current, config, metadata, video, oldFrozenHash: await frozenHash(a, current.version), metadataRestored: false }; save(root, state, secrets);
    }
    const rb = state.rollback;
    // Restore metadata first so the rollback publication freezes restored video
    // defaults; historical version-bound frozen rows remain immutable.
    if (!rb.metadataRestored) {
      const tx = await a.pool.connect();
      try { await tx.query('BEGIN'); const pool = boundPool(tx);
        for (const request of rb.metadata) await saveSupplierModel(pool, request);
        for (const v of rb.video) { const row = (await tx.query('SELECT revision,definition,profile,source_url FROM app_supplier_video_definitions WHERE provider_id=$1 AND model_id=$2 FOR UPDATE', [v.providerId, v.modelId])).rows[0];
          const current = { definition: row?.definition, ...(row?.profile ? { profile: row.profile } : {}), sourceUrl: row?.source_url };
          gate(eq(current, v.restored) || Number(row?.revision) === v.expectedRevision && eq(current, v.current), 'ROLLBACK_VIDEO_CAS_HOLD');
          await recordSupplierVideoDefinition(a.pool, { providerId: v.providerId, modelId: v.modelId, ...v.restored }, tx); }
        await tx.query('COMMIT'); rb.metadataRestored = true; save(root, state, secrets);
      } catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }
    }
    const publication = await publish(a, root, state, input, 'rollback', rb.config, rb.expected);
    gate((await a.repo.current()).digest === digest(rb.config), 'ROLLBACK_VERIFY_HOLD'); gate(await frozenHash(a, rb.expected.version) === rb.oldFrozenHash, 'OLD_VIDEO_FREEZE_CHANGED');
    state.phase = 'ROLLED_BACK'; save(root, state, secrets);
    return { mode, phase: state.phase, publication, restoredExecutionConfig: true, preservedLaterFields: true, billingUnchanged: true, retainedNewMetadataAsUnknown: state.metadata.metadata.filter((m: any) => !m.before).length, retainedNewVideoAsEmptyDefinition: state.metadata.video.filter((v: any) => !v.before).length, credentialsRetainedForHistory: true, supplierCalls: 0 };
  } finally { await billingGuard.query('ROLLBACK'); billingGuard.release(); }
}

async function main() {
  const mode = process.argv[2]; if (mode === 'LOADCHECK') { console.log('SUPPLIER_COPY103_LOAD=PASS DB=0 SUPPLIER_CALLS=0'); return; }
  gate(['PLAN', 'APPLY', 'VERIFY', 'ROLLBACK'].includes(mode), 'MODE_INVALID');
  let input = ''; for await (const chunk of process.stdin) { input += chunk; gate(input.length <= 16 * 1024 * 1024, 'STDIN_TOO_LARGE'); }
  const payload = JSON.parse(input); input = '';
  const root = resolve(process.argv[3] || 'output/supplier-copy103');
  const proof = read(join(root, 'LOCK_PROOF.json'));
  const native = globalThis.fetch, base = new URL(process.env.NAUMI_ROUTER_MANAGEMENT_URL!);
  globalThis.fetch = async (resource, init) => { const request = new Request(resource, init), url = new URL(request.url); gate(url.origin === base.origin && /^\/internal\/config\//.test(url.pathname), 'NON_ROUTER_NETWORK_DENIED'); return native(request); };
  const { getModelAdministration } = await import('../../src/lib/model-config/server'); const a = await getModelAdministration();
  try { const result = await runSupplierCopy103(mode as any, root, a, payload, proof); console.log(JSON.stringify(result)); }
  finally { payload.credentials?.forEach((c: any) => { c.plain = ''; }); await a.pool.end(); }
}
if (process.argv[1] && /(?:^|\/)supplier-copy103\.(?:ts|cjs|mjs|js)$/.test(process.argv[1].replaceAll('\\', '/'))) main().catch(error => {
  console.error('SUPPLIER_COPY103_HOLD', typeof error?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code) ? error.code : 'CHECK_FAILED'); process.exitCode = 1;
});
