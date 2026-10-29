import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { createModelFixture } from './model-config-fixture';
import { fixtureConfig } from './billing-unit-fixture';
import { createModelRuntime } from '../src/lib/model-config/runtime';
import { ingestSupplierDirectory, saveSupplierModel } from '../src/lib/supplier-models/repository';
import { unknownSupplierMetadata } from '../src/lib/supplier-models/types';
import { recordSupplierVideoDefinition } from '../src/lib/supplier-models/video-access';
import { managedVideoDefinition } from '../src/lib/video/model-definition';
import { digest } from './lib/apib-activation.mjs';
import { runSupplierCopy103 as sourceRun, type CopyPayload } from './ops/supplier-copy103';
const runSupplierCopy103: typeof sourceRun = process.env.SUPPLIER_COPY103_OPERATOR_BUNDLE
  ? createRequire(import.meta.url)(resolve(process.env.SUPPLIER_COPY103_OPERATOR_BUNDLE)).runSupplierCopy103 : sourceRun;
function removeFixture(path: string) {
  const absolute = resolve(path), prefix = resolve(tmpdir()) + sep + 'naumi-supplier-copy103-';
  assert(absolute.startsWith(prefix) && absolute.length > prefix.length);
  rmSync(absolute, { recursive: true, force: true });
}

async function main() {
  let supplierCalls = 0, checks = 0;
  const f = await createModelFixture((_req, res) => { supplierCalls++; res.writeHead(500); res.end('No supplier requests'); });
  const root = mkdtempSync(join(tmpdir(), 'naumi-supplier-copy103-'));
  const eq = (actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected); checks++; };
  try {
    const videoCredential = await f.credentials.importPlain({ providerId: 'pv', plain: 'target-video-fixture', actor: 'fixture' });
    f.config.providers.push({ ...f.config.providers[0], id: 'pv', name: 'Fixture video', credentialRef: videoCredential.id, protocol: 'openai-videos', enabled: false });
    f.config.upstreamModels.push({ ...structuredClone(f.config.upstreamModels[0]), id: 'uv', providerId: 'pv', model: 'fixture-video', modality: 'video', enabled: false,
      capabilities: { ...structuredClone(f.config.upstreamModels[0].capabilities), maxReferenceImages: 0, video: { modes: ['text'], durationResolutionMap: [{ durations: [5], resolutions: ['720p'] }], aspectRatios: ['1:1'], limits: { images: 0 } } } });
    f.config.publicModels.push({ id: 'video-a', label: 'Fixture video', modality: 'video', visible: false, enabled: false, target: { type: 'upstream', id: 'uv' } });
    f.config.business = { 'image.generate': { enabled: true, defaultModelId: 'image-a', options: [{ modelId: 'image-a', enabled: true, sort: 2, unit: 'image', pricing: { mode: 'cny-fixed', amountMicros: '120000', creditsPerCnyMicros: '100000000', rounding: 'ceil' } }] } };
    const before = await f.repo.current();
    await f.sql.query('CREATE TABLE app_billing_config_versions(version bigint PRIMARY KEY,config jsonb NOT NULL)');
    await f.sql.query('INSERT INTO app_billing_config_versions VALUES(8,$1::jsonb)', [JSON.stringify(fixtureConfig())]);
    const billing = { current: async () => { const row = (await f.sql.query('SELECT * FROM app_billing_config_versions ORDER BY version DESC LIMIT 1')).rows[0]; return { version: Number(row.version), config: row.config }; } };
    let routerDigest = '', prepares = 0, activations = 0, loseNextActivationReceipt = false;
    const applied = new Map<string, any>();
    const router: any = {
      prepare: async () => { prepares++; }, state: async () => routerDigest, status: async (id: string) => applied.get(id) || null,
      activate: async (id: string, expected: string, next: string) => { eq(expected, routerDigest); activations++; routerDigest = next; const result = { id, digest: next, phase: 'applied' }; applied.set(id, result); if (loseNextActivationReceipt) { loseNextActivationReceipt = false; throw Error('fixture receipt lost'); } return result; },
      seal: () => { throw Error('Direct fixture projection must not seal supplier keys'); }, open: () => { throw Error('Unused'); }, legacy: () => { throw Error('No discovery'); }
    };
    const runtime = createModelRuntime({ pool: f.sql, repo: f.repo, credentials: f.credentials, router, billing: billing.current, trustedOrigins: [f.origin] });
    const a: any = { pool: f.sql, repo: f.repo, credentials: f.credentials, router, runtime, billing, trustedOrigins: [f.origin] };
    await ingestSupplierDirectory(f.sql, f.config.providers[0], [{ id: 'wire-image-one', label: 'Existing target metadata' }]);
    const existing = (await f.sql.query('SELECT * FROM app_supplier_model_metadata')).rows[0];
    const targetMetadata = unknownSupplierMetadata(); targetMetadata.notes = 'Target baseline';
    await saveSupplierModel(f.sql, { id: randomUUID(), modelId: existing.id, expectedRevision: 1, actor: 'fixture', metadata: targetMetadata });
    const source = structuredClone(before.config), sourceKey1 = 'source-virtual-key-one-not-real', sourceKey2 = 'source-virtual-key-two-not-real';
    for (const p of source.providers) p.credentialRef = randomUUID();
    source.upstreamModels[0].parameterMap.quality = { high: 'medium', medium: 'low' };
    source.upstreamModels.push({ ...structuredClone(source.upstreamModels[0]), id: 'source-only', model: 'source-only-wire' });
    source.publicModels.push({ ...source.publicModels[0], id: 'source-only-public', target: { type: 'upstream', id: 'source-only' } });
    source.business!['image.generate']!.options[0].pricing = { mode: 'cny-fixed', amountMicros: '50000', creditsPerCnyMicros: '100000000', rounding: 'ceil' };
    const sourceMetadata = unknownSupplierMetadata(); sourceMetadata.notes = 'Source observation'; sourceMetadata.capabilities.generate = true;
    const bill = await billing.current();
    const input: CopyPayload = { operationId: randomUUID(), rollbackOperationId: randomUUID(), actor: 'fixture-copy103', source: { version: 152, digest: digest(source), config: source },
      credentials: source.providers.map((p, i) => ({ providerId: p.id, sourceCredentialRef: p.credentialRef!, plain: i ? sourceKey2 : sourceKey1 })),
      metadata: [{ providerId: 'p1', modelId: 'wire-image-one', metadata: sourceMetadata }, { providerId: 'p1', modelId: 'source-only-wire', metadata: sourceMetadata }],
      videoDefinitions: [{ providerId: 'pv', modelId: 'fixture-video', definition: { supportsNegativePrompt: true }, profile: 'openai-videos', sourceUrl: 'https://supplier.example/docs/video' }],
      expected: { modelVersion: before.version, modelDigest: before.digest, billingVersion: bill.version, billingDigest: digest(bill) } };
    const computedVideo = managedVideoDefinition(source.upstreamModels.find(u => u.id === 'uv')!, source.providers.find(p => p.id === 'pv')!, {
      ...input.videoDefinitions![0], sourceRevision: { id: randomUUID(), revision: 3, sourceUrl: input.videoDefinitions![0].sourceUrl, collectedAt: '2026-10-29T00:00:00.000Z' }
    } as any);
    const { sources: _sources, ...observedDefinition } = computedVideo.capability;
    input.sourceVideoFrozen = [{ upstreamId: 'uv', value: { definition: observedDefinition, profile: computedVideo.profile, sourceRevision: computedVideo.sourceRevision } }];
    const mismatchRoot = mkdtempSync(join(tmpdir(), 'naumi-supplier-copy103-video-mismatch-'));
    try {
      const mismatch = structuredClone(input); (mismatch.sourceVideoFrozen![0].value.definition as any).supportsNegativePrompt = false;
      await assert.rejects(runSupplierCopy103('PLAN', mismatchRoot, a, mismatch, null, true), /PLAN_VIDEO_EFFECTIVE_DEFAULT_MISMATCH/); checks++;
      eq((await f.repo.current()).digest, before.digest);
    } finally { removeFixture(mismatchRoot); }
    const sourceBefore = digest(input.source), credentialCount = Number((await f.sql.query('SELECT count(*) FROM app_model_credentials')).rows[0].count);
    const plan: any = await runSupplierCopy103('PLAN', root, a, input, null, true);
    eq(plan.credentialRefsPending, true); eq(plan.finalCandidateDigest, null);
    eq(Number((await f.sql.query('SELECT count(*) FROM app_model_credentials')).rows[0].count), credentialCount);
    eq((await f.repo.current()).digest, before.digest);
    input.approvedConflictDigest = plan.conflictDigest; input.approvedLocalEndpointsDigest = plan.localEndpointsDigest; input.approvedMetadataDigest = plan.metadataReviewDigest;
    const badApproval = { ...input, approvedMetadataDigest: '' };
    await assert.rejects(runSupplierCopy103('APPLY', root, a, badApproval, null, true), /METADATA_REVIEW_REQUIRED/); checks++;
    await f.sql.query('INSERT INTO app_billing_config_versions VALUES(9,$1::jsonb)', [JSON.stringify(fixtureConfig())]);
    await assert.rejects(runSupplierCopy103('APPLY', root, a, input, null, true), /BILLING_CAS_HOLD/); checks++;
    eq(Number((await f.sql.query('SELECT count(*) FROM app_model_credentials')).rows[0].count), credentialCount);
    await f.sql.query('DELETE FROM app_billing_config_versions WHERE version=9');
    const apply: any = await runSupplierCopy103('APPLY', root, a, input, null, true);
    eq(apply.publication.id, input.operationId); eq(apply.publication.phase, 'applied'); eq(apply.credentialImports, 2);
    const verified: any = await runSupplierCopy103('VERIFY', root, a, input, null, true);
    eq(verified.phase, 'VERIFIED'); eq(verified.video.length, 1); eq(verified.billingUnchanged, true);
    eq(digest(await billing.current()), digest(bill)); eq((await f.repo.current()).config.business, before.config.business);
    const state = JSON.parse(readFileSync(join(root, 'state.json'), 'utf8'));
    for (const c of input.credentials) {
      const ref = state.credentialRefs[c.providerId].targetCredentialRef;
      assert.notEqual(ref, c.sourceCredentialRef); checks++;
      eq(await f.credentials.read(ref, c.providerId), c.plain);
      const encoded = (await f.sql.query('SELECT key_enc FROM app_model_credentials WHERE id=$1', [ref])).rows[0].key_enc;
      assert(!encoded.includes(c.plain)); checks++;
      assert(!readFileSync(join(root, 'state.json'), 'utf8').includes(c.plain)); checks++;
    }
    const snapshotHash = (await f.repo.current()).digest, publicationCount = Number((await f.sql.query('SELECT count(*) FROM app_model_publications')).rows[0].count);
    const repeats: any = await runSupplierCopy103('APPLY', root, a, input, null, true);
    eq(repeats.publication.id, input.operationId); eq(activations, 1); eq(prepares, 1);
    eq((await f.repo.current()).digest, snapshotHash); eq(Number((await f.sql.query('SELECT count(*) FROM app_model_publications')).rows[0].count), publicationCount);
    eq(Number((await f.sql.query('SELECT count(*) FROM app_model_credentials')).rows[0].count), credentialCount + 2);
    const current = await f.repo.current(), later = structuredClone(current.config); later.upstreamModels[0].label = 'Later unrelated label';
    later.business!['image.generate']!.options[0].sort = 9;
    const draft = await f.repo.draft('later-fixture'), saved = await f.repo.saveDraft({ id: draft.id, expectedRevision: draft.revision, config: later, actor: 'later-fixture' });
    const laterPub = await runtime.publish({ id: randomUUID(), draftId: saved.id, expectedRevision: saved.revision, expectedVersion: current.version, actor: 'later-fixture', reason: 'Later unrelated fields' }); eq(laterPub.phase, 'applied');
    const row = (await f.sql.query('SELECT id,revision,metadata FROM app_supplier_model_metadata WHERE provider_id=$1 AND model_id=$2', ['p1', 'wire-image-one'])).rows[0];
    const ownedConflict = structuredClone(row.metadata); ownedConflict.notes = 'Later changed our own source observation';
    const conflictSave = await saveSupplierModel(f.sql, { id: randomUUID(), modelId: row.id, expectedRevision: Number(row.revision), metadata: ownedConflict, actor: 'later-fixture' });
    await assert.rejects(runSupplierCopy103('ROLLBACK', root, a, input, null, true), /METADATA_ROLLBACK_FIELD_HOLD/); checks++;
    eq((await f.repo.current()).version, laterPub.version);
    const repair = await saveSupplierModel(f.sql, { id: randomUUID(), modelId: row.id, expectedRevision: conflictSave.revision, metadata: row.metadata, actor: 'later-fixture' }); row.revision = repair.revision;
    row.metadata.brand = 'Later brand'; await saveSupplierModel(f.sql, { id: randomUUID(), modelId: row.id, expectedRevision: Number(row.revision), metadata: row.metadata, actor: 'later-fixture' });
    const rolled: any = await runSupplierCopy103('ROLLBACK', root, a, input, null, true); eq(rolled.phase, 'ROLLED_BACK'); eq(rolled.publication.id, input.rollbackOperationId);
    const restored = (await f.repo.current()).config;
    eq(restored.upstreamModels[0].label, 'Later unrelated label'); eq(restored.business!['image.generate']!.options[0].sort, 9);
    const expected = structuredClone(before.config); expected.upstreamModels[0].label = 'Later unrelated label'; expected.business!['image.generate']!.options[0].sort = 9;
    eq(restored, expected);
    const metadata = (await f.sql.query('SELECT metadata FROM app_supplier_model_metadata WHERE id=$1', [existing.id])).rows[0].metadata;
    eq(metadata, { ...targetMetadata, brand: 'Later brand' });
    const added = (await f.sql.query('SELECT metadata FROM app_supplier_model_metadata WHERE model_id=$1', ['source-only-wire'])).rows[0].metadata;
    eq(added, unknownSupplierMetadata());
    eq((await f.sql.query('SELECT definition,profile FROM app_supplier_video_definitions WHERE provider_id=$1', ['pv'])).rows[0], { definition: {}, profile: null });
    const repeatRollback: any = await runSupplierCopy103('ROLLBACK', root, a, input, null, true); eq(repeatRollback.publication.id, input.rollbackOperationId); eq(activations, 3);
    eq(digest(input.source), sourceBefore); eq(digest(await billing.current()), digest(bill)); eq(supplierCalls, 0);
    // A concurrent tariff publication must be detected before any copy writes.
    const staleRoot = mkdtempSync(join(tmpdir(), 'naumi-supplier-copy103-stale-'));
    try { await assert.rejects(runSupplierCopy103('PLAN', staleRoot, a, input, null, true), /MODEL_CAS_HOLD/); checks++; }
    finally { removeFixture(staleRoot); }
    const unknownRoot = mkdtempSync(join(tmpdir(), 'naumi-supplier-copy103-unknown-'));
    try {
      const current = await f.repo.current(), unknown = structuredClone(input);
      unknown.operationId = randomUUID(); unknown.rollbackOperationId = randomUUID(); unknown.expected.modelVersion = current.version; unknown.expected.modelDigest = current.digest;
      const review: any = await runSupplierCopy103('PLAN', unknownRoot, a, unknown, null, true);
      unknown.approvedConflictDigest = review.conflictDigest; unknown.approvedLocalEndpointsDigest = review.localEndpointsDigest; unknown.approvedMetadataDigest = review.metadataReviewDigest;
      const countBefore = Number((await f.sql.query('SELECT count(*) FROM app_model_credentials')).rows[0].count);
      loseNextActivationReceipt = true;
      await assert.rejects(runSupplierCopy103('APPLY', unknownRoot, a, unknown, null, true), /PUBLICATION_RECONCILIATION_REQUIRED/); checks++;
      eq((await f.repo.publication(unknown.operationId)).phase, 'unknown'); eq((await f.repo.current()).digest, current.digest);
      const n = activations;
      await assert.rejects(runSupplierCopy103('APPLY', unknownRoot, a, unknown, null, true), /PUBLICATION_RECONCILIATION_REQUIRED/); checks++;
      eq(activations, n); eq(Number((await f.sql.query('SELECT count(*) FROM app_model_credentials')).rows[0].count), countBefore + 2);
      unknown.reconcilePublication = true;
      const recovered: any = await runSupplierCopy103('APPLY', unknownRoot, a, unknown, null, true); eq(recovered.publication.id, unknown.operationId); eq(recovered.publication.phase, 'applied'); eq(activations, n);
      const accepted: any = await runSupplierCopy103('VERIFY', unknownRoot, a, unknown, null, true); eq(accepted.phase, 'VERIFIED');
      await runSupplierCopy103('ROLLBACK', unknownRoot, a, unknown, null, true);
      eq(digest(await billing.current()), digest(bill)); eq(supplierCalls, 0);
    } finally { removeFixture(unknownRoot); }
    console.log(`SUPPLIER_COPY103_PG=PASS CHECKS=${checks} CREDENTIALS_ENCRYPTED=2 FIXED_UUID_REPLAY=PASS SELECTIVE_ROLLBACK=PASS BILLING_UNCHANGED=PASS OLD_VIDEO_FROZEN=PASS SUPPLIER_CALLS=${supplierCalls}`);
  } finally { await f.cleanup(); removeFixture(root); }
}
main().catch(error => { console.error('SUPPLIER_COPY103_PG_FAIL', error?.code || error?.name, error?.message); process.exitCode = 1; });
