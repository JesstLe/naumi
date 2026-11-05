#!/usr/bin/env node
'use strict';

/**
 * Offline contract: execute actual AST-selected TypeScript functions, with an
 * in-memory pg query boundary. No application import, connection, or supplier.
 * Counts are settings SELECTs after the schema boundary, NOT measured latency.
 *
 * node scripts/verify-settings-batch-performance.cjs
 * node scripts/verify-settings-batch-performance.cjs --mode baseline
 * node scripts/verify-settings-batch-performance.cjs --mode modified
 * node scripts/verify-settings-batch-performance.cjs --mode baseline --source-root C:/absolute/restored-copy
 *
 * Defaults: --mode compare; preserved before/ is the SHA-pinned baseline.
 * --source-root selects the actual candidate (or restored baseline) to execute.
 * --baseline-root selects an alternative byte-identical preserved baseline.
 * --output-file output/SETTINGS_NAME.json overrides the report path.
 * The script never restores or edits application sources. Parent owns execution.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const BEFORE = path.join(ROOT, 'output/server-stability-performance-20261024/before');
const PINNED = {
  'src/lib/db.ts': 'f3c3501173b0723adeb87f23f6916cc934e4030c5c3eab7962e41152320c3113',
  'src/lib/settings.ts': '9634c458457982bd1b9a2f6336d49e3e082c5ba0de9f30e639f9b18672084192',
};
const FIXTURE_SECRET = 'settings-batch-offline-fixture-secret-20261024';
const OAI_KEYS = ['openai_api_key_enc', 'openai_image_model', 'openai_image_models', 'openai_cutout_model'];
const SMTP_KEYS = ['smtp_host', 'smtp_user', 'smtp_pass_enc', 'smtp_from', 'smtp_port'];
const DB_FUNCTIONS = ['getSetting', 'setSetting'];
const SETTING_FUNCTIONS = ['aesKey', 'encryptAtRest', 'decryptAtRest', 'normalizeImageModels',
  'imageModelCatalog', 'getLegacyOpenAISettings', 'getOpenAISettings', 'getSmtpConfig',
  'saveOpenAIKey', 'saveOpenAIModel', 'saveOpenAIModels', 'saveSmtp'];
const SETTING_CONSTANTS = ['OAI_KEY_ENC', 'OAI_MODEL', 'OAI_MODELS', 'OAI_CUTOUT_MODEL',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS_ENC', 'SMTP_FROM'];
const records = [];
let activeCase = 'setup';
let options;
const report = { schemaVersion: 1, evidenceTier: 'offline-actual-typescript-ast/in-memory-db',
  performanceMetric: 'settings SELECT count; schema initialization SQL and live latency are not measured',
  networkAccess: 'no network-capable dependencies exposed to executed functions', externalCalls: 0,
  productionAcceptance: false, records };

function cli() {
  const result = { mode: 'compare', sourceRoot: ROOT, baselineRoot: BEFORE, explicitSource: false };
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (flag === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split(' */')[0].slice(0)); return null; }
    if (!['--mode', '--source-root', '--baseline-root', '--output-file'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = process.argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value: ${flag}`);
    if (flag === '--mode') result.mode = value;
    else if (flag === '--output-file') result.outputFile = path.resolve(ROOT, value);
    else {
      assert.ok(path.isAbsolute(value), `${flag} requires an absolute path`);
      if (flag === '--source-root') { result.sourceRoot = path.resolve(value); result.explicitSource = true; }
      else result.baselineRoot = path.resolve(value);
    }
  }
  assert.ok(['baseline', 'modified', 'compare'].includes(result.mode), 'mode must be baseline, modified, or compare');
  result.outputFile ||= path.join(ROOT, `output/SETTINGS_${result.mode === 'compare' ? 'BATCH_PERFORMANCE' : result.mode.toUpperCase() + '_VERIFICATION'}.json`);
  assert.equal(path.dirname(result.outputFile), path.join(ROOT, 'output'), 'reports must stay in project output/');
  assert.match(path.basename(result.outputFile), /^SETTINGS_[A-Z0-9_]+\.json$/, 'report must be named SETTINGS_*.json');
  return result;
}
function local(value) {
  if (Array.isArray(value)) return Array.from(value, local);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, local(item)]));
  return value; // Preserve undefined, NaN and Infinity (unlike a JSON round-trip).
}
const deep = (actual, expected, message) => assert.deepEqual(local(actual), local(expected), message);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function parse(file, bytes = fs.readFileSync(file)) {
  const source = bytes.toString('utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length, 0, `${file}: TypeScript parse diagnostics`);
  return { file, bytes, source, ast, sha256: sha(bytes) };
}
function fn(model, name) {
  const found = model.ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(found.length, 1, `${model.file}: exactly one actual function ${name}`);
  assert.ok(found[0].body, `${name} has an executable body`);
  return found[0];
}
const body = (model, name) => fn(model, name).getText(model.ast);
function constant(model, name) {
  const found = model.ast.statements.filter(ts.isVariableStatement)
    .flatMap(node => Array.from(node.declarationList.declarations))
    .filter(node => ts.isIdentifier(node.name) && node.name.text === name);
  assert.equal(found.length, 1, `${model.file}: exactly one actual constant ${name}`);
  assert.ok(found[0].initializer);
  return `const ${name} = ${found[0].initializer.getText(model.ast)};`;
}
function models(root, phase) {
  const model = { root, phase, db: parse(path.join(root, phase==='baseline'?'src/lib/db.ts':'src/lib/settings/repository.ts')), settings: parse(path.join(root, 'src/lib/settings.ts')) };
  if (phase === 'baseline') for (const [file, hash] of Object.entries(PINNED)) assert.equal(model[file.endsWith('db.ts') ? 'db' : 'settings'].sha256, hash, `baseline byte hash: ${file}`);
  return model;
}
function stableSettings(model, candidate) {
  let source = model.source;
  const nodes = ['getLegacyOpenAISettings', 'getSmtpConfig'].map(name => fn(model, name)).sort((a, b) => b.pos - a.pos);
  for (const node of nodes) source = source.slice(0, node.getStart(model.ast)) + `/* permitted-body:${node.name.text} */` + source.slice(node.end);
  if (candidate) {
    const oldImport = 'import { dbEnabled, getSetting, setSetting, getSignupBonus } from "@/lib/db";';
    const newImport = 'import { dbEnabled, getSetting, getSettings, setSetting, getSignupBonus } from "@/lib/db";';
    assert.equal(source.split(newImport).length, 2, 'only expected db import extension');
    source = source.replace(newImport, oldImport);
  }
  return source;
}
function sourceContract(baseline, candidate) {
  // Main's performance algorithms are unchanged, but db/settings now have real
  // owners. Compare selected production declarations to the pinned incoming
  // source, not a pre-refactor whole-file shape or deleted import spelling.
  // Immutable incoming ref is now an ancestor of this integration. Reconstruct
  // its selected algorithms from Git, not this machine's ignored evidence tree.
  const incoming='368c93e2343c57a330a0db6831ccbef01283ed6d';
  const original=file=>parse(`${incoming}:${file}`,execFileSync('git',['show',`${incoming}:${file}`],{cwd:ROOT}));
  const originalDb=original('src/lib/db.ts'),originalSettings=original('src/lib/settings.ts');
  const tokens=text=>{const scan=ts.createScanner(ts.ScriptTarget.Latest,true),a=[];scan.setText(text);while(scan.scan()!==ts.SyntaxKind.EndOfFileToken)a.push(scan.getTokenText());return JSON.stringify(a);};
  assert.equal(tokens(body(candidate.db,'getSettings')),tokens(body(originalDb,'getSettings')),'incoming batch SQL/semantics retained in repository owner');
  for(const name of SETTING_FUNCTIONS)assert.equal(tokens(body(candidate.settings,name)),tokens(body(originalSettings,name)),name+' retains incoming algorithm');
  return {sourceStable:true,scope:'selected algorithms token-identical to pinned incoming main; owners moved',batchReaderOwner:'src/lib/settings/repository.ts',frozenExecutionSourceUnchanged:true};
}
function compile(model, secret) {
  const names = DB_FUNCTIONS.concat(model.phase === 'modified' ? ['getSettings'] : []);
  const source = [constant(secret, 'PLACEHOLDERS'), body(secret, 'settingsSecret'),
    ...SETTING_CONSTANTS.map(name => constant(model.settings, name)),
    ...names.map(name => body(model.db, name)), ...SETTING_FUNCTIONS.map(name => body(model.settings, name))].join('\n\n');
  const result = ts.transpileModule(source, { fileName: 'actual-settings-contract.ts', reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const errors = (result.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, 'actual selected functions transpile without diagnostics');
  return result.outputText;
}
function harness(model, config = {}) {
  const state = { values: new Map(config.rows instanceof Map ? config.rows : Object.entries(config.rows || {})),
    schemaCalls: 0, poolCalls: 0, reads: [], writes: [], events: [], contextReads: 0,
    schemaError: config.schemaError, queryError: config.queryError, scope: config.scope || null,
    guard: !!config.guard, schemaBarrier: null };
  const env = { SETTINGS_SECRET: FIXTURE_SECRET, ...(config.env || {}) };
  const pool = { query: async (sql, params) => {
    assert.ok(state.events.at(-1) === 'schema-ready', 'schema is awaited before each settings query');
    const normalized = sql.replace(/\s+/g, ' ').trim();
    state.events.push('query');
    if (/^SELECT /.test(normalized)) {
      state.reads.push({ sql: normalized, params: local(params) });
      if (state.queryError) throw state.queryError;
      if (normalized === 'SELECT v FROM app_settings WHERE k = $1') {
        assert.equal(params.length, 1);
        return { rows: state.values.has(params[0]) ? [{ v: state.values.get(params[0]) }] : [] };
      }
      assert.equal(normalized, 'SELECT k, v FROM app_settings WHERE k = ANY($1::text[])', 'parameterized batch SQL');
      assert.equal(params.length, 1);
      assert.ok(Array.isArray(params[0]), 'one text[] bind parameter');
      const wanted = new Set(params[0]);
      // Deliberately return rows in a different order, as PostgreSQL may do.
      return { rows: Array.from(state.values, ([k, v]) => ({ k, v })).filter(row => wanted.has(row.k)).reverse() };
    }
    assert.match(normalized, /^INSERT INTO app_settings \(k, v, updated_at\) VALUES \(\$1, \$2, now\(\)\) ON CONFLICT \(k\) DO UPDATE SET v = EXCLUDED.v, updated_at = now\(\)$/);
    assert.equal(params.length, 2);
    state.writes.push(local(params));
    state.values.set(params[0], params[1]);
    return { rows: [] };
  } };
  const exports = {};
  const context = vm.createContext({ exports, module: { exports }, Buffer, crypto, process: { env },
    dbEnabled: config.dbEnabled !== false,
    ensureSchema: async () => {
      state.schemaCalls++; state.events.push('schema-start');
      if (state.schemaError) throw state.schemaError;
      if (state.schemaBarrier) await state.schemaBarrier;
      state.events.push('schema-ready');
    },
    getPool: () => { state.poolCalls++; return pool; },
    stagingHistoryGuardEnabled: () => state.guard,
    require: name => {
      assert.equal(name, './model-config/context', 'only the execution-context boundary may be imported');
      return { currentModelExecution: () => { state.contextReads++; return state.scope; } };
    },
  });
  vm.runInContext(model.code, context, { filename: `${model.phase}-actual-settings.ts`, timeout: 5000 });
  return { api: exports, state, env };
}
function counts(h) { return { schemaCalls: h.state.schemaCalls, poolCalls: h.state.poolCalls,
  settingsSelects: h.state.reads.length, settingsWrites: h.state.writes.length, executionContextReads: h.state.contextReads }; }
async function test(name, run) {
  activeCase = name;
  const result = await run();
  records.push({ name, result: 'PASS', ...result });
  console.log(`CASE=${name} RESULT=PASS`);
}
async function capture(run) {
  try { return { status: 'fulfilled', value: await run() }; }
  catch (error) { return { status: 'rejected', error: { name: error.name, message: error.message, code: error.code } }; }
}
function matrix(cipher) {
  const oenv = { OPENAI_API_KEY: 'fixture-env-key', OPENAI_IMAGE_MODEL: 'env-image',
    OPENAI_IMAGE_MODELS: 'env-extra,env-image', OPENAI_CUTOUT_MODEL: 'env-cutout' };
  const senv = { SMTP_HOST: 'env-host', SMTP_USER: 'env-user', SMTP_PASS: 'fixture-env-pass', SMTP_FROM: 'env-from', SMTP_PORT: '587' };
  const orows = { openai_api_key_enc: cipher.key, openai_image_model: 'db-image',
    openai_image_models: '["db-extra","db-image","db-extra"]', openai_cutout_model: 'db-cutout' };
  const srows = { smtp_host: ' db-host ', smtp_user: ' db-user ', smtp_pass_enc: cipher.pass, smtp_from: ' db-from ', smtp_port: ' 2525 ' };
  const scoped = { connection: { apiKey: 'fixture-frozen-key' }, frozen: { publicModelId: 'frozen-image' } };
  const cases = [];
  const add = (name, method, env, rows, more = {}) => cases.push({ name, method, env, rows, ...more });
  const o = (name, rows = {}, more = {}) => add(`openai-${name}`, 'getOpenAISettings', oenv, rows, more);
  const s = (name, rows = {}, more = {}) => add(`smtp-${name}`, 'getSmtpConfig', senv, rows, more);
  o('missing-db-uses-env', {}, { expected: { apiKey: 'fixture-env-key', model: 'env-image', models: ['env-image', 'env-extra'], cutoutModel: 'env-cutout', source: 'env' } });
  o('all-db', orows, { expected: { apiKey: 'fixture-db-key', model: 'db-image', models: ['db-image', 'db-extra'], cutoutModel: 'db-cutout', source: 'db' } });
  o('no-env-no-db', {}, { env: {}, expected: { apiKey: '', model: 'gpt-image-2', models: ['gpt-image-2'], cutoutModel: 'gpt-image-1', source: 'none' } });
  o('empty-env', {}, { env: Object.fromEntries(Object.keys(oenv).map(key => [key, ''])) });
  o('undefined-env', {}, { env: Object.fromEntries(Object.keys(oenv).map(key => [key, undefined])) });
  o('db-disabled', orows, { dbEnabled: false });
  o('frozen-scope-bypasses-settings', orows, { scope: scoped, expected: { apiKey: 'fixture-frozen-key', model: 'frozen-image', models: ['frozen-image'], cutoutModel: 'frozen-image', source: 'db' } });
  o('direct-legacy', orows, { method: 'getLegacyOpenAISettings' });
  for (const key of OAI_KEYS) o(`partial-${key}`, { [key]: orows[key] });
  for (const value of ['', null, undefined]) o(`all-${String(value) || 'empty'}`, Object.fromEntries(OAI_KEYS.map(key => [key, value])));
  o('whitespace-model-not-trimmed', { openai_image_model: ' db-image ', openai_cutout_model: ' db-cutout ' });
  o('bad-cipher', { ...orows, openai_api_key_enc: 'not-a-gcm-cipher' });
  o('empty-decrypted-key', { ...orows, openai_api_key_enc: cipher.empty });
  o('whitespace-decrypted-key', { ...orows, openai_api_key_enc: cipher.whitespace });
  o('wrong-secret', orows, { env: { ...oenv, SETTINGS_SECRET: FIXTURE_SECRET + '-rotated' } });
  o('invalid-secret-decrypt-falls-back', orows, { env: { ...oenv, SETTINGS_SECRET: 'short' } });
  o('db-model-with-no-key-keeps-source-none', { openai_image_model: 'db-image' }, { env: {} });
  for (const models of ['[broken-json,valid-model', '[1,"valid-model",null,"bad name"]', '{"not":"an-array"}', 'a,b,a\nc', '[]', '["' + 'x'.repeat(81) + '"]'])
    o(`catalog-${cases.length}`, { openai_image_models: models });
  s('missing-db-uses-env', {}, { expected: { host: 'env-host', user: 'env-user', pass: 'fixture-env-pass', from: 'env-from', port: 587 } });
  s('all-db', srows, { expected: { host: 'db-host', user: 'db-user', pass: 'fixture-db-pass', from: 'db-from', port: 2525 } });
  s('guard-bypasses-settings', srows, { guard: true, expected: null });
  s('db-disabled', srows, { dbEnabled: false });
  s('no-config', {}, { env: {}, expected: null });
  s('undefined-env', {}, { env: Object.fromEntries(Object.keys(senv).map(key => [key, undefined])), expected: null });
  for (const key of SMTP_KEYS) s(`partial-${key}`, { [key]: srows[key] });
  for (const value of ['', '   ', null, undefined]) s(`all-${String(value) || 'empty'}`, Object.fromEntries(SMTP_KEYS.map(key => [key, value])));
  s('bad-cipher', { ...srows, smtp_pass_enc: 'not-a-gcm-cipher' });
  s('bad-cipher-without-env-pass', { ...srows, smtp_pass_enc: 'not-a-gcm-cipher' }, { env: {}, expected: null });
  s('empty-decrypted-pass', { ...srows, smtp_pass_enc: cipher.empty });
  s('whitespace-decrypted-pass', { ...srows, smtp_pass_enc: cipher.whitespace });
  s('env-strings-not-trimmed', {}, { env: { SMTP_HOST: ' host ', SMTP_USER: ' user ', SMTP_PASS: ' pass ' },
    expected: { host: ' host ', user: ' user ', pass: ' pass ', from: ' user ', port: 465 } });
  s('empty-from-falls-back-user', { ...srows, smtp_from: '' }, { env: {} });
  for (const port of ['', ' ', '0', '-1', 'not-a-number', 'NaN', '587', '587.5', 'Infinity', '65536'])
    s(`port-${port || 'empty'}`, { ...srows, smtp_port: port });
  for (const port of ['', '0', '-1', 'not-a-number', 'Infinity']) s(`env-port-${port || 'empty'}`, {}, { env: { ...senv, SMTP_PORT: port } });
  s('wrong-secret', srows, { env: { ...senv, SETTINGS_SECRET: FIXTURE_SECRET + '-rotated' } });
  for (const method of ['getOpenAISettings', 'getSmtpConfig']) {
    add(`${method}-schema-error`, method, method === 'getSmtpConfig' ? senv : oenv, {}, { schemaFailure: true });
    add(`${method}-query-error`, method, method === 'getSmtpConfig' ? senv : oenv, {}, { queryFailure: true });
  }
  return cases;
}
async function runScenario(model, scenario) {
  const injected = Object.assign(new Error('fixture-settings-read-failed'), { code: 'FIXTURE_SETTINGS_FAILURE' });
  const h = harness(model, { ...scenario, schemaError: scenario.schemaFailure ? injected : null, queryError: scenario.queryFailure ? injected : null });
  const result = await capture(() => h.api[scenario.method]());
  if (scenario.schemaFailure || scenario.queryFailure) {
    deep(result, { status: 'rejected', error: { name: 'Error', message: injected.message, code: injected.code } }, 'errors propagate rather than falling back');
  } else {
    assert.equal(result.status, 'fulfilled');
    if (Object.hasOwn(scenario, 'expected')) deep(result.value, scenario.expected, 'independent expected result');
  }
  const bypass = scenario.dbEnabled === false || (scenario.method === 'getSmtpConfig' && scenario.guard) ||
    (scenario.method === 'getOpenAISettings' && scenario.scope);
  const normalReads = scenario.method === 'getSmtpConfig' ? 5 : 4;
  const expectedReads = bypass || scenario.schemaFailure ? 0 : scenario.queryFailure ? 1 : model.phase === 'baseline' ? normalReads : 1;
  assert.equal(h.state.reads.length, expectedReads, `${scenario.name}: settings SELECT count`);
  assert.equal(h.state.schemaCalls, bypass ? 0 : scenario.schemaFailure ? 1 : expectedReads, 'schema boundary invocations');
  assert.equal(h.state.poolCalls, expectedReads, 'one existing-pool access per query');
  assert.equal(h.state.writes.length, 0, 'getters never write');
  if (expectedReads && model.phase === 'modified') deep(h.state.reads[0].params,
    [scenario.method === 'getSmtpConfig' ? SMTP_KEYS : OAI_KEYS], 'all settings in one parameterized batch');
  return { result, counts: counts(h) };
}
async function apiContract(model) {
  await test(`${model.phase}-single-key-compatible`, async () => {
    const h = harness(model, { rows: { present: 'value', empty: '', nullable: null, undefined: undefined, '': 'empty-key' } });
    for (const [key, expected] of [['present', 'value'], ['empty', ''], ['nullable', null], ['undefined', undefined], ['missing', null], ['', 'empty-key']]) {
      const before = h.state.reads.length;
      assert.equal(await h.api.getSetting(key), expected);
      assert.equal(h.state.reads.length - before, 1, 'single-key stays one SELECT');
    }
    await h.api.setSetting('present', 'updated');
    assert.equal(await h.api.getSetting('present'), 'updated', 'single-key read after awaited write');
    return { phase: model.phase, counts: counts(h) };
  });
  await test(`${model.phase}-errors-are-not-cached`, async () => {
    const injected = new Error('fixture-transient-query');
    const h = harness(model, { queryError: injected });
    await assert.rejects(() => h.api.getOpenAISettings(), error => error === injected);
    h.state.queryError = null;
    h.state.values.set('openai_image_model', 'recovered-model');
    assert.equal((await h.api.getOpenAISettings()).model, 'recovered-model');
    const schemaError = new Error('fixture-transient-schema');
    h.state.schemaError = schemaError;
    await assert.rejects(() => h.api.getSmtpConfig(), error => error === schemaError);
    h.state.schemaError = null;
    h.env.SMTP_HOST = 'recovered-host'; h.env.SMTP_USER = 'recovered-user'; h.env.SMTP_PASS = 'recovered-pass';
    assert.equal((await h.api.getSmtpConfig()).host, 'recovered-host');
    return { phase: model.phase, counts: counts(h) };
  });
  await test(`${model.phase}-writes-visible-on-next-read`, async () => {
    const h = harness(model, { env: { OPENAI_API_KEY: 'fixture-env-key', SMTP_HOST: 'old-host', SMTP_USER: 'old-user', SMTP_PASS: 'old-pass' } });
    assert.equal((await h.api.getOpenAISettings()).source, 'env');
    assert.equal((await h.api.getSmtpConfig()).host, 'old-host');
    await h.api.saveOpenAIKey('  fixture-updated-key  ');
    assert.equal((await h.api.getOpenAISettings()).apiKey, 'fixture-updated-key');
    await h.api.saveOpenAIModel(' new-model ');
    assert.equal((await h.api.getOpenAISettings()).model, 'new-model');
    await h.api.saveOpenAIModels(['extra-model', 'extra-model', 'bad model']);
    deep((await h.api.getOpenAISettings()).models, ['new-model', 'extra-model']);
    await h.api.saveSmtp({ host: ' new-host ', user: ' new-user ', from: ' new-from ', pass: ' new-pass ', port: 2525.7 });
    deep(await h.api.getSmtpConfig(), { host: 'new-host', user: 'new-user', from: 'new-from', pass: ' new-pass ', port: 2525 });
    const writes = h.state.writes.length;
    await h.api.saveSmtp({ pass: '' });
    assert.equal(h.state.writes.length, writes, 'empty password does not overwrite');
    await h.api.saveOpenAIKey('');
    assert.equal((await h.api.getOpenAISettings()).apiKey, 'fixture-env-key', 'empty decrypted key falls back');
    h.env.OPENAI_API_KEY = 'fixture-new-env-key';
    assert.equal((await h.api.getOpenAISettings()).apiKey, 'fixture-new-env-key', 'environment changes are not cached');
    h.state.values.delete('openai_image_model');
    h.env.OPENAI_IMAGE_MODEL = 'env-after-delete';
    assert.equal((await h.api.getOpenAISettings()).model, 'env-after-delete', 'external deletion is immediately visible');
    return { phase: model.phase, counts: counts(h) };
  });
  if (model.phase !== 'modified') return;
  await test('modified-empty-batch-does-not-open-db', async () => {
    const h = harness(model, { schemaError: new Error('must-not-touch-schema'), queryError: new Error('must-not-query') });
    deep(await h.api.getSettings([]), {});
    deep(counts(h), { schemaCalls: 0, poolCalls: 0, settingsSelects: 0, settingsWrites: 0, executionContextReads: 0 });
    return { counts: counts(h) };
  });
  await test('modified-batch-missing-duplicate-empty-and-special-keys', async () => {
    const maliciousKey = "x') OR TRUE; --";
    const h = harness(model, { rows: new Map([['b', 'value-b'], ['a', ''], ['', 'empty-key'],
      ['nullable', null], ['undefined', undefined], ['__proto__', 'literal-proto'], ['constructor', 'literal-constructor'],
      ['toString', 'literal-toString'], ['配置', 'unicode'], [maliciousKey, 'literal-key'], ['unrequested', 'not-in-result']]) });
    const keys = ['missing', 'a', 'b', 'b', '', '', 'nullable', 'undefined', '__proto__', 'constructor', 'toString', '配置', maliciousKey];
    const original = keys.slice();
    const result = await h.api.getSettings(keys);
    deep(result, Object.fromEntries(Array.from(new Set(keys), key => [key, h.state.values.has(key) ? h.state.values.get(key) : null])));
    deep(keys, original, 'caller key list is unchanged');
    assert.equal(Object.getPrototypeOf(result), null, 'special keys cannot inherit or alter a prototype');
    deep(h.state.reads[0].params, [Array.from(new Set(keys))], 'duplicates coalesce without changing empty/literal keys');
    assert.equal(h.state.reads.length, 1);
    assert.equal(Object.hasOwn(result, 'unrequested'), false);
    const missing = await h.api.getSettings(['__missing__', 'valueOf']);
    deep(missing, { __missing__: null, valueOf: null });
    result.b = 'caller-mutated';
    assert.equal((await h.api.getSettings(['b'])).b, 'value-b', 'returned map is not cached');
    await h.api.setSetting('b', 'updated-b');
    assert.equal((await h.api.getSettings(['b'])).b, 'updated-b', 'batch sees awaited write on next read');
    return { counts: counts(h) };
  });
  await test('modified-schema-awaited-and-errors-propagate', async () => {
    const h = harness(model, { rows: { present: 'value' } });
    let release;
    h.state.schemaBarrier = new Promise(resolve => { release = resolve; });
    const pending = h.api.getSettings(['present']);
    await Promise.resolve();
    assert.equal(h.state.reads.length, 0, 'no query before schema readiness');
    assert.equal(h.state.poolCalls, 0, 'no pool access before schema readiness');
    release();
    deep(await pending, { present: 'value' });
    h.state.schemaBarrier = null;
    for (const boundary of ['schemaError', 'queryError']) {
      const injected = new Error(`fixture-${boundary}`);
      h.state[boundary] = injected;
      await assert.rejects(() => h.api.getSettings(['present']), error => error === injected);
      h.state[boundary] = null;
      assert.equal((await h.api.getSettings(['present'])).present, 'value', 'failed read is not memoized');
    }
    return { counts: counts(h) };
  });
}
function writeReport() {
  fs.mkdirSync(path.dirname(options.outputFile), { recursive: true });
  fs.writeFileSync(options.outputFile, JSON.stringify(report, null, 2) + '\n');
  // Reopen the report rather than treating a successful write call as evidence.
  const reopened = JSON.parse(fs.readFileSync(options.outputFile, 'utf8'));
  assert.equal(reopened.status, report.status);
  assert.equal(reopened.records.length, records.length);
}
async function main() {
  options = cli();
  if (!options) return;
  report.mode = options.mode;
  report.outputFile = options.outputFile;
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/SETTINGS_BASELINE_HASHES.json'), 'utf8'));
  for (const [file, hash] of Object.entries(PINNED)) assert.equal(manifest.files.find(item => item.source === file)?.sha256, hash, 'preserved manifest hash');
  const baselineRoot = options.mode === 'baseline' && options.explicitSource ? options.sourceRoot : options.baselineRoot;
  const baseline = models(baselineRoot, 'baseline');
  const candidate = options.mode === 'baseline' ? null : models(options.sourceRoot, 'modified');
  const secret = parse(path.join(ROOT, 'src/lib/settings-secret.ts'));
  report.sources = { baselineRoot, baseline: Object.fromEntries(Object.entries(PINNED)),
    candidateRoot: candidate?.root || null, candidate: candidate ? { 'src/lib/db.ts': candidate.db.sha256, 'src/lib/settings.ts': candidate.settings.sha256 } : null,
    actualSettingsSecretModule: secret.sha256 };
  if (candidate) report.sourceContract = sourceContract(baseline, candidate);
  else report.sourceContract = { sourceStable: true, baselineByteHashesMatch: true };
  baseline.code = compile(baseline, secret);
  if (candidate) candidate.code = compile(candidate, secret);
  const seed = harness(baseline);
  const cipher = { key: seed.api.encryptAtRest('fixture-db-key'), pass: seed.api.encryptAtRest('fixture-db-pass'),
    empty: seed.api.encryptAtRest(''), whitespace: seed.api.encryptAtRest('   ') };
  const targets = options.mode === 'baseline' ? [baseline] : options.mode === 'modified' ? [candidate] : [baseline, candidate];
  for (const scenario of matrix(cipher)) await test(scenario.name, async () => {
    const outcomes = [];
    for (const model of targets) outcomes.push({ phase: model.phase, ...await runScenario(model, scenario) });
    if (outcomes.length === 2) deep(outcomes[1].result, outcomes[0].result, 'actual baseline/candidate result or rejection equivalence');
    return { method: scenario.method, phases: Object.fromEntries(outcomes.map(item => [item.phase, item.counts])),
      resultEquivalence: outcomes.length === 2 ? true : 'single-phase' };
  });
  for (const target of targets) await apiContract(target);
  report.status = 'PASS';
  report.cases = records.length;
  report.api = { status: 'PASS', singleKeySettingsSelects: 1, noValueCache: true, writeVisibleOnNextRead: true,
    missingBatchKey: 'null', emptyStringPreserved: true, undefinedFixtureValuePreserved: true,
    schemaAndQueryErrorsPropagate: true, scopeAndStagingGuardsPreserved: true };
  report.settingsSelects = options.mode === 'compare' ? { openai: { baseline: 4, modified: 1 }, smtp: { baseline: 5, modified: 1 } } :
    { openai: options.mode === 'baseline' ? 4 : 1, smtp: options.mode === 'baseline' ? 5 : 1 };
  writeReport();
  const openai = options.mode === 'compare' ? '4->1' : options.mode === 'baseline' ? '4' : '1';
  const smtp = options.mode === 'compare' ? '5->1' : options.mode === 'baseline' ? '5' : '1';
  console.log(`SETTINGS_BATCH_PERFORMANCE=PASS MODE=${options.mode} CASES=${records.length} OPENAI_SETTINGS_SELECTS=${openai} SMTP_SETTINGS_SELECTS=${smtp} SINGLE_SETTING_SELECTS=1 NO_VALUE_CACHE=YES EXTERNAL_CALLS=0 SOURCE_STABLE=PASS API=PASS`);
  console.log(`REPORT=${options.outputFile}`);
}
main().catch(error => {
  report.status = 'FAIL'; report.failedCase = activeCase;
  report.error = { name: error.name, message: error.message, stack: error.stack };
  if (options?.outputFile) { try { writeReport(); } catch (writeError) { console.error(writeError); } }
  console.error(`SETTINGS_BATCH_PERFORMANCE=FAIL CASE=${activeCase}`);
  console.error(error);
  process.exitCode = 1;
});
