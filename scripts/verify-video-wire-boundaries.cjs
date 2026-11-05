#!/usr/bin/env node
'use strict';

/** Full-source baseline/candidate differential, not a projected codec mock.
 * Every declared profile executes create/poll/cancel and response decoding.
 * Workflow upload executes its actual module with owned-byte storage fixture
 * and the existing injected transport port. No HTTP/PG/supplier is reachable. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { build } = require('esbuild');
const ts = require('typescript');
const workspace = path.resolve(__dirname, '..');
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const root = path.resolve(arg('--source-root') || workspace);
const mode = arg('--mode') || 'modified';
const evidence = path.resolve(arg('--evidence') || path.join(workspace, 'output/refactor-r5d-20261026'));
assert.ok(['baseline', 'modified', 'rollback'].includes(mode));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const text = file => fs.readFileSync(path.join(root, file), 'utf8');
let checks = 0, network = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };

async function bundle(entry) {
  return build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, absWorkingDir: root,
    write: false, bundle: true, metafile: true, platform: 'node', target: 'node22', format: 'cjs',
    external: ['pg', 'sharp'], alias: { 'server-only': path.join(workspace, 'scripts/fleet-server-only.cjs') },
    tsconfig: path.join(root, 'tsconfig.json') });
}
function execute(source, imports, filename) {
  const projected = { exports: {} };
  const fallback = createRequire(path.join(workspace, 'package.json'));
  vm.runInNewContext(source, { module: projected, exports: projected.exports,
    require: id => Object.hasOwn(imports, id) ? imports[id] : fallback(id),
    console, Buffer, process, URL, URLSearchParams, FormData, File, Blob, Response, Request, Headers,
    TextEncoder, TextDecoder, Uint8Array, AbortSignal, AbortController, ReadableStream, TransformStream,
    setTimeout, clearTimeout, setInterval, clearInterval, structuredClone,
    fetch: async () => { network++; throw Error('unexpected network'); },
  }, { filename, timeout: 5000 });
  return projected.exports;
}
async function plain(value) {
  if (value === undefined) return { type: 'undefined' };
  if (value instanceof FormData) return { type: 'multipart', entries: await Promise.all([...value].map(async ([key, item]) =>
    [key, typeof item === 'string' ? item : { name: item.name, mime: item.type, bytes: Buffer.from(await item.arrayBuffer()).toString('hex') }])) };
  if (Array.isArray(value)) return Promise.all(value.map(plain));
  if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await plain(item)])));
  return value;
}
async function main() {
  const separated = fs.existsSync(path.join(root, 'src/lib/video/providers/wire-helpers.ts'));
  const compiled = await bundle(`import * as wire from './src/lib/video/providers/wire';
    import {videoWireEndpoint} from './src/lib/video/providers/wire-adapter';
    import {VIDEO_WIRE_PROFILES,videoProfileProtocol} from './src/lib/video/capability-schema';
    import {readBounded} from './src/lib/supplier-cost/io';
    export {wire,videoWireEndpoint,VIDEO_WIRE_PROFILES,videoProfileProtocol,readBounded};
    ${separated ? "export * as helpers from './src/lib/video/providers/wire-helpers'; export * as registry from './src/lib/video/providers/wire-registry';" : ''}`);
  const api = execute(compiled.outputFiles[0].text, {}, 'actual-full-source-wire.cjs');
  const rows = [], profiles = [...api.VIDEO_WIRE_PROFILES];
  const capture = async (label, fn) => {
    try { rows.push({ label, outcome: 'return', value: await plain(await fn()) }); }
    catch (error) { rows.push({ label, outcome: 'throw', error: { name: error.name, message: error.message,
      ...(error.code === undefined ? {} : { code: error.code }), ...(error.status === undefined ? {} : { status: error.status }),
      ...(error.fields === undefined ? {} : { fields: Array.from(error.fields) }) } }); }
  };
  const refs = {
    image: { id: 'image-1', kind: 'image', role: 'reference', url: 'https://media.example.test/image.png', submissionName: 'input/owned.png' },
    first: { id: 'first-1', kind: 'image', role: 'first_frame', url: 'https://media.example.test/first.png' },
    last: { id: 'last-1', kind: 'image', role: 'last_frame', url: 'https://media.example.test/last.png' },
    video: { id: 'video-1', kind: 'video', role: 'source_video', url: 'https://media.example.test/source.mp4', durationSeconds: 5 },
    audio: { id: 'audio-1', kind: 'audio', role: 'source_audio', url: 'https://media.example.test/source.wav', durationSeconds: 5 },
  };
  const variants = [
    ['text', []], ['single_image', [refs.first]], ['frames_required', [refs.first, refs.last]],
    ['first_optional', [refs.last]], ['last_optional', [refs.first]], ['reference', [refs.image, refs.video, refs.audio]],
    ['video_edit', [refs.video, refs.image]], ['extend', [refs.video]], ['motion_control', [refs.first, refs.video]],
    ['lip_sync', [refs.video, refs.audio]],
  ];
  const polls = [
    {}, { status: 'mystery' }, { status: 'processing', progress: 50 }, { status: 'completed' },
    { status: 'completed', url: 'https://media.example.test/result.mp4?token=private', video_url: 'https://media.example.test/result.mp4', task: { status: 'succeeded', content: { url: 'https://media.example.test/result.mp4' } } },
    { status: 'failed', message: 'fixture failure', error: { code: 'fixture', message: 'fixture failure' } },
    { code: 0, data: [] }, { code: 805, msg: 'node error' },
    { code: 'success', data: { status: 'completed', results: [{ type: 'video', url: 'https://media.example.test/result.mp4' }] } },
    { data: { status: 'completed', result: { videos: [{ url: ['https://media.example.test/result.mp4'] }] } } },
    { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://media.example.test/result.mp4' } }] } } },
  ];
  const contexts = [];
  for (const profile of profiles) {
    const base = { profile, provider: { id: 'fixture', label: 'Fixture', protocol: api.videoProfileProtocol(profile),
      apiKey: 'fixture-key', baseUrl: 'https://supplier.example.test/v1', models: ['selected'], defaultModel: 'wrong-default', idempotencyStrategy: 'none' },
      request: { source: 'workflow', providerId: 'fixture', modelId: 'selected', prompt: 'A cube rotates.', mode: 'text',
        durationSeconds: 5, resolution: '720p', aspectRatio: '16:9', references: [], idempotencyKey: 'original-operation' } };
    for (const [modeName, references] of variants) contexts.push([`${profile}/${modeName}`, { ...base, request: { ...base.request, mode: modeName, references } }]);
    contexts.push([profile + '/false-zero', { ...base, request: { ...base.request, generateAudio: false, watermark: false, providerOptions: { seed: 0 } } }]);
    contexts.push([profile + '/advanced', { ...base, request: { ...base.request, shots: [{ prompt: 'one', durationSeconds: 5 }], elements: [{ name: 'role', description: 'same', references: [refs.image] }] } }]);
    contexts.push([profile + '/workflow', { ...base, request: { ...base.request, providerOptions: { seed: 0 },
      workflowManifest: { version: 1, kind: profile, workflowId: 'selected-workflow', inputs: [{ name: 'seed', type: 'custom', path: ['seed'] }, { name: 'prompt', type: 'prompt', path: ['prompt'], required: true }] } } }]);
    await capture(profile + '/poll', () => api.wire.buildVideoPoll(base, 'task/unsafe ?'));
    await capture(profile + '/cancel', () => api.wire.buildVideoCancel(base, 'task/unsafe ?'));
    await capture(profile + '/overrides', () => [api.wire.buildVideoCreate({ ...base, provider: { ...base.provider, createPath: '/custom/create' } }),
      api.wire.buildVideoPoll({ ...base, provider: { ...base.provider, pollPath: '/custom/{id}' } }, 'task/unsafe ?')]);
    for (const payload of [{}, { id: 'task-1', task_id: 'task-1', status: 'processing' }, { data: { task_id: 'task-1', id: 'task-1', status: 'processing' } }]) await capture(profile + '/created/' + JSON.stringify(payload), () => api.wire.decodeVideoCreated(profile, payload));
    for (let index = 0; index < polls.length; index++) await capture(profile + '/decoded/' + index, () => api.wire.decodeVideoPolled(profile, polls[index], 'task-1'));
  }
  const manifest = JSON.parse(text('scripts/video-fusion/application-protocol-cases.json'));
  for (const item of manifest.cases) {
    const base = contexts.find(([, context]) => context.profile === item.profile)[1];
    const references = item.refs.map((key, index) => ({ ...refs[key.split(':')[0]] || refs.image, id: 'ref-' + index,
      ...(key.includes(':') ? { role: key.split(':')[1] } : {}) }));
    contexts.push(['application/' + item.id, { ...base, request: { ...base.request, mode: item.mode, references, ...item.extra } }]);
  }
  for (const [label, context] of contexts) await capture(label + '/create', () => api.wire.buildVideoCreate(context));
  await capture('unknown-profile', () => api.wire.buildVideoCreate({ ...contexts[0][1], profile: 'unknown-fixture' }));
  await capture('duplicate-built-in', () => api.wire.registerVideoWireProfile('ark', {}));
  const provider = contexts[0][1].provider;
  for (const profile of profiles) for (const baseUrl of ['https://supplier.example.test', 'https://supplier.example.test/v1/', 'https://supplier.example.test/api/v3', 'https://supplier.example.test/v1beta']) {
    for (const target of ['/v1/videos', '/api/v3/tasks', '/v1beta/models/x', '/upload/image']) await capture('endpoint/' + profile + '/' + baseUrl + target,
      () => api.videoWireEndpoint({ ...provider, videoProfile: profile, baseUrl }, target));
  }
  await capture('helper/nulls', () => [api.wire.object(null), api.wire.field({ a: [{ b: 0 }] }, 'a.0.b'), api.wire.string(' x '), api.wire.mediaUrl('file:///x')]);
  await capture('helper/statuses', () => ['succeeded', 'failed', 'cancelled', 'pending', 'running'].map(api.wire.wireStatus));
  await capture('helper/redaction', () => api.wire.sanitizeWirePayload({ apiKey: 'key', payload: JSON.stringify({ password: 'private', url: 'https://user:pass@media.example.test/video-reference-media/private?token=x#x' }) }));
  await capture('helper/unknown', () => api.wire.wireStatus('not-a-real-state'));
  await capture('helper/missing-result', () => api.wire.polled({}, { status: 'completed' }));
  await capture('helper/reserved-option', () => api.wire.selectWireOptions({ ...contexts[0][1], request: { providerOptions: { override: 'wrong-model' } } }, { override: 'model' }));
  const helperNames = Object.keys(api.wire).filter(name => !['registerVideoWireProfile', 'buildVideoCreate', 'buildVideoPoll', 'buildVideoCancel', 'decodeVideoCreated', 'decodeVideoPolled'].includes(name));
  if (separated) {
    for (const name of helperNames) check(api.helpers[name] === api.wire[name], true, name + ' compatibility alias');
    check(api.registry.registerVideoWireProfile === api.wire.registerVideoWireProfile, true, 'single registration owner');
  }
  const uploadSource = ts.transpileModule(text('src/lib/video/providers/workflow-upload.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const uploads = [], bytes = Buffer.from('owned-media-fixture-bytes');
  const uploader = execute(uploadSource, { 'server-only': {}, '../../storage': { readManagedObject: async () => ({ bytes, contentType: 'image/png' }) },
    '../../supplier-cost/io': { readBounded: api.readBounded }, './wire': api.wire, './wire-helpers': api.helpers,
    './wire-adapter': { videoWireEndpoint: api.videoWireEndpoint }, './wire-endpoint': { videoWireEndpoint: api.videoWireEndpoint },
    '../media-formats': { mediaExtension: mime => mime === 'image/png' ? 'png' : 'bin' } }, 'actual-workflow-upload.cjs');
  for (const profile of ['comfyui', 'runninghub']) {
    const context = { ...contexts[0][1], profile, request: { ...contexts[0][1].request, references: [{ ...refs.image, storageKey: 'owned.png', sha256: hash(bytes), mimeType: 'image/png' }] } };
    await capture('upload/' + profile, () => uploader.uploadWorkflowReferences(context, async (url, input) => {
      uploads.push({ profile, url, method: input.method, headers: input.headers, body: await plain(input.body) });
      return Response.json(profile === 'comfyui' ? { name: 'uploaded.png', subfolder: 'owned' } : { data: { fileName: 'owned/uploaded.png' } });
    }));
    await capture('upload/' + profile + '/bad-name', () => uploader.uploadWorkflowReferences(context, async () => Response.json({ name: '../escape.png', data: { fileName: '../escape.png' } })));
    await capture('upload/' + profile + '/changed-bytes', () => uploader.uploadWorkflowReferences({ ...context, request: { ...context.request, references: [{ ...context.request.references[0], sha256: 'wrong-hash' }] } }, async () => { throw Error('must not upload'); }));
  }
  rows.push({ label: 'upload-actual-transports', outcome: 'return', value: await plain(uploads) });
  check(network, 0, 'no network');
  check(rows.filter(row => row.label.endsWith('/poll')).length, profiles.length, 'each profile polled');
  check(rows.filter(row => row.label.endsWith('/cancel')).length, profiles.length, 'each profile cancellation decoded');
  check(rows.find(row => row.label === 'duplicate-built-in').outcome, 'throw', 'duplicate profile remains rejected');
  check(rows.find(row => row.label === 'unknown-profile').error.code, 'VIDEO_PROFILE_UNAVAILABLE', 'unknown profile retains error');
  check(rows.filter(row => row.label.startsWith('upload/') && row.label.endsWith('/changed-bytes')).every(row => row.error.code === 'VIDEO_PROFILE_INPUT_UNSUPPORTED'), true, 'changed frozen media not uploaded');
  const snapshot = { profiles, exports: Object.keys(api.wire).sort(), rows };
  const baselinePath = path.join(evidence, 'BASELINE_BEHAVIOR.json');
  if (mode === 'baseline') fs.writeFileSync(baselinePath, JSON.stringify(snapshot, null, 2) + '\n');
  else check(snapshot, JSON.parse(fs.readFileSync(baselinePath, 'utf8')), 'complete baseline wire outcome equality');
  const source = Object.fromEntries(Object.keys(compiled.metafile.inputs).filter(file => file.startsWith('src/')).map(file => [file, hash(fs.readFileSync(path.resolve(root, file)))]));
  const result = { status: 'PASS', mode, checks, profiles: profiles.length, operations: rows.length, successfulOutcomes: rows.filter(row => row.outcome === 'return').length,
    rejectedOutcomes: rows.filter(row => row.outcome === 'throw').length, network, separated, sourceRoot: root, source, baselineSnapshotSha256: hash(fs.readFileSync(baselinePath)),
    actualAlgorithms: true, realSupplier: false, storageOwnership: 'owned-byte fixture', transport: 'existing injected function port', wholeApplication: false };
  fs.writeFileSync(path.join(evidence, mode.toUpperCase() + '_WIRE_RESULT.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`VIDEO_WIRE_BOUNDARY=PASS mode=${mode} profiles=${profiles.length} operations=${rows.length} checks=${checks} DIFFERENTIAL=${mode === 'baseline' ? 'CAPTURED' : 'EXACT'} HTTP=0 PG=0 PAID_CALLS=0 ACTUAL_CODECS=1 ACTUAL_UPLOAD=1`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
