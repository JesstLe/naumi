#!/usr/bin/env node
'use strict';
/**
 * Offline entry-guard regression probe. No application import, DB, supplier or HTTP.
 * node scripts/verify-image-creation-rate-limits.cjs [--root DIR] [--ref COMMIT]
 *   [--expect limited|unlimited] [--report FILE.json] [--check-preservation]
 * --ref reads ALL source using git show; otherwise source comes from --root.
 * Baseline is deliberately fixed: its AST supplies the original guards/thresholds.
 * Four imagegen routes and reference-workbench execute their actual transpiled POST.
 * Legacy probes execute exact AST-selected auth/owner/ban/rate statements, ending
 * at an explicit continuation sentinel. Parsing, billing wrappers, model execution,
 * database ownership implementation and downstream generation are NOT acceptance.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {File: BufferFile} = require('node:buffer');
const BASELINE = '05598fe53bd03bfbaa74ff6ee5b39c2b689cb055';
const REPO = path.resolve(__dirname, '..');
const ACTOR = 'actor@example.test', FOREIGN = 'other@example.test';
const UUID = '11111111-1111-4111-8111-111111111111';
const IP = '192.0.2.10';
const small = ['imagegen', 'imagegen/inputs', 'imagegen/plan', 'imagegen/recover-delivery'];
const names = [...small, 'generate-image', 'canvas/annotate', 'canvas/expand', 'canvas/text-edit',
  'canvas/image-tasks', 'avatar', 'cutout', 'dewatermark', 'dewrinkle', 'inpaint', 'packaging3d',
  'printfile', 'recolor', 'replicate', 'retouch', 'style', 'tryon', 'upscale', 'suite', 'aplus',
  'reference-workbench/[...path]', 'extract', 'garment', 'garment3d', 'competitors/[id]/action'];
const files = names.map(n => `src/app/api/${n}/route.ts`);
const options = {root: process.cwd(), expect: 'unlimited', preservation: false};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--check-preservation') options.preservation = true;
  else if (arg === '--allow-unrelated') options.preservation = false;
  else if (['--root', '--ref', '--expect', '--report'].includes(arg)) {
    if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw Error(`Missing value: ${arg}`);
    options[arg.slice(2)] = process.argv[++i];
  } else if (arg === '--help') {
    console.log('Usage: node scripts/verify-image-creation-rate-limits.cjs --root DIR [--ref COMMIT] --expect limited|unlimited [--report FILE.json] [--check-preservation]');
    process.exit(0);
  } else throw Error(`Unknown argument: ${arg}`);
}
options.root = path.resolve(options.root);
if (!['limited', 'unlimited'].includes(options.expect)) throw Error('--expect must be limited or unlimited');
const ts = require(require.resolve('typescript', {paths: [REPO, options.root]}));
const printer = ts.createPrinter({removeComments: true, newLine: ts.NewLineKind.LineFeed});
const report = {kind: 'offline-fixture', baselineRef: BASELINE, root: options.root,
  ref: options.ref || null, expect: options.expect, preservation: options.preservation,
  status: 'RUNNING', routes: [], requests: 0, errors: [], limitations: [
    'Legacy = exact source guard projection, not complete route/business execution.',
    'Real small-route POST bodies execute; auth resolver, schema, wrappers and downstream services are explicit stubs.',
    'No supplier, real generation, DB, HTTP, billing/settlement or deployed-system acceptance.',
    'Absent branch-local ban guards are reported as absent, never synthesized or counted as passed.',
    'Frozen Date.now and fresh real rate-limit module per scenario; independent actors/requests are fixtures.'
  ]};
const observed = new Map();
function check(value, message) { if (!value) throw Error(message); }
function hash(s) { return createHash('sha256').update(s).digest('hex'); }
function git(ref, file) { return execFileSync('git', ['--no-pager', 'show', `${ref}:${file}`], {cwd: REPO, encoding: 'utf8', maxBuffer: 12 * 1024 * 1024}); }
function read(file, baseline = false) {
  if (baseline) return git(BASELINE, file);
  if (options.ref) return git(options.ref, file);
  const full = path.join(options.root, file), bytes = fs.readFileSync(full);
  const digest = hash(bytes);
  if (observed.has(full)) check(observed.get(full) === digest, `Source changed during verification: ${file}`);
  else observed.set(full, digest);
  return bytes.toString('utf8');
}
function parse(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  check(!sf.parseDiagnostics.length, `Invalid TypeScript AST: ${file}`);
  return sf;
}
function walk(node, accept) { const out = []; (function visit(n) { if (accept(n)) out.push(n); ts.forEachChild(n, visit); })(node); return out; }
function printed(node, sf) { return printer.printNode(ts.EmitHint.Unspecified, node, sf); }
function canonical(text) {
  // Compare AST, not formatting/quote style/numeric separators or comments.
  const tree = node => {
    if (ts.isParenthesizedExpression(node)) return tree(node.expression);
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return [node.kind, node.text];
    if (ts.isNumericLiteral(node)) return [node.kind, Number(node.text)];
    const children = []; ts.forEachChild(node, child => {children.push(tree(child));});
    return [node.kind, children];
  };
  return JSON.stringify(tree(parse('projection.ts', text)));
}
function calls(node, name) { return walk(node, n => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name); }
function ancestor(node, test) { for (let p = node.parent; p; p = p.parent) if (test(p)) return p; return null; }
function single(list, label) { check(list.length === 1, `${label}: expected one AST node, found ${list.length}`); return list[0]; }
function number(node, action) {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isParenthesizedExpression(node)) return number(node.expression, action);
  if (ts.isConditionalExpression(node)) {
    check(canonical(node.condition.getText()) === canonical('body.action === "analyze"'), 'Unknown conditional rate threshold');
    return number(action === 'analyze' ? node.whenTrue : node.whenFalse, action);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AsteriskToken) return number(node.left, action) * number(node.right, action);
  throw Error(`Unrecognized numeric rate AST: ${node.getText()}`);
}
function sites(sf) {
  const imports = sf.statements.filter(n => ts.isImportDeclaration(n) && n.moduleSpecifier.text === '@/lib/rate-limit');
  for (const n of imports) {
    const bindings = n.importClause?.namedBindings;
    check(bindings && ts.isNamedImports(bindings) && bindings.elements.length === 1 && bindings.elements[0].name.text === 'rateLimit'
      && (!bindings.elements[0].propertyName || bindings.elements[0].propertyName.text === 'rateLimit'), `${sf.fileName}: unrecognized limiter import`);
  }
  const found = calls(sf, 'rateLimit');
  check(found.length === 0 || imports.length === 1, `${sf.fileName}: missing real limiter import`);
  return found.map(call => {
    check(call.arguments.length === 3 && ts.isTemplateExpression(call.arguments[0]), `${sf.fileName}: unknown rate call`);
    const guard = ancestor(call, ts.isIfStatement), fn = ancestor(call, ts.isFunctionDeclaration);
    check(guard && fn?.name && guard.expression.pos <= call.pos && guard.expression.end >= call.end && !guard.elseStatement, `${sf.fileName}: rate call outside known if/function`);
    const terminals = walk(guard.thenStatement, n => ts.isReturnStatement(n) || ts.isThrowStatement(n));
    check(terminals.length === 1, `${sf.fileName}: unknown rate rejection branch`);
    const key = call.arguments[0].head.text.replace(/:$/, '');
    check(number(call.arguments[2]) === 600000, `${sf.fileName}: unexpected old window`);
    return {key, call, guard, fn, line: sf.getLineAndCharacterOfPosition(call.getStart(sf)).line + 1};
  });
}
function normalized(sf, rateSites) {
  const removed = new Set(rateSites.map(s => s.guard));
  // Only the selected rate ifs and imports made genuinely unused by their deletion.
  function transform(visitor) {
    const result = ts.transform(sf, [context => root => {
      const visit = node => visitor(node, n => ts.visitEachChild(n, visit, context));
      return ts.visitNode(root, visit);
    }]);
    const text = printer.printFile(result.transformed[0]); result.dispose(); return text;
  }
  let text = transform((n, visit) => removed.has(n) || (ts.isImportDeclaration(n) && n.moduleSpecifier.text === '@/lib/rate-limit') ? undefined : visit(n));
  sf = parse(sf.fileName, text);
  const dead = new Set();
  for (const stmt of walk(sf, ts.isVariableStatement)) {
    if (stmt.declarationList.declarations.length !== 1) continue;
    const d = stmt.declarationList.declarations[0];
    if (ts.isIdentifier(d.name) && d.name.text === 'ip' && d.initializer && calls(d.initializer, 'clientIp').length === 1) {
      const scope = stmt.parent;
      const refs = walk(scope, n => ts.isIdentifier(n) && n.text === 'ip' && n !== d.name);
      if (!refs.length) dead.add(stmt);
    }
  }
  text = transform((n, visit) => dead.has(n) ? undefined : visit(n));
  sf = parse(sf.fileName, text);
  const ipUsed = walk(sf, n => ts.isIdentifier(n) && n.text === 'clientIp' && !ancestor(n, ts.isImportDeclaration)).length;
  return transform((n, visit) => !ipUsed && ts.isImportDeclaration(n) && n.moduleSpecifier.text === '@/lib/ip' ? undefined : visit(n));
}
function verifyRateShape(base, target, sf, unlimited) {
  const retained = base.key === 'ref-quote' || base.key === 'competitor';
  if (!unlimited) {
    check(target && canonical(target.guard.getText(sf)) === canonical(base.guard.getText()), `${sf.fileName}/${base.key}: original rate guard changed`);
  } else if (!retained) check(!target, `${sf.fileName}/${base.key}: image limiter remains`);
  else {
    check(target, `${sf.fileName}/${base.key}: text limiter missing`);
    const prefix = base.key === 'ref-quote'
      ? '["workbench/infer-prompts","chat-image/send"].includes(body.action)'
      : 'body.action === "analyze"';
    const expected = `if (${prefix} && ${base.guard.expression.getText()}) ${base.guard.thenStatement.getText()}`;
    check(canonical(target.guard.getText(sf)) === canonical(expected), `${sf.fileName}/${base.key}: unrecognized text-only rate condition`);
  }
}
function transpile(text, file) {
  const result = ts.transpileModule(text, {fileName: file, compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}, reportDiagnostics: true});
  check(!result.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error), `Transpile failed: ${file}`);
  return result.outputText;
}
function sandbox(extra = {}) {
  class FrozenDate extends Date { static now() { return 2000000000000; } }
  const violations = [];
  const forbidden = name => { violations.push(name); throw Error(`Forbidden dependency/side effect: ${name}`); };
  const context = vm.createContext({Response, Request, Headers, File: globalThis.File || BufferFile, FormData,
    Buffer, URL, URLSearchParams, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, Error, Date: FrozenDate,
    console: {log() {}, warn() {}, error() {}}, fetch: () => forbidden('fetch'), ...extra}, {codeGeneration: {strings: false, wasm: false}});
  return {context, violations, forbidden};
}
function evaluate(code, file, context) { return new vm.Script(transpile(code, file), {filename: file}).runInContext(context, {timeout: 3000}); }
function moduleLoad(file, text, env, dependencies) {
  const module = {exports: {}};
  env.context.module = module; env.context.exports = module.exports;
  env.context.require = id => {
    if (!Object.hasOwn(dependencies, id)) return env.forbidden(`require:${id}`);
    const object = dependencies[id];
    return new Proxy(object, {get(target, key) {
      if (key === '__esModule') return false;
      if (!Object.hasOwn(target, key)) return env.forbidden(`export:${id}:${String(key)}`);
      return target[key];
    }});
  };
  // Isolate CommonJS lexical bindings between modules loaded into the same VM.
  new vm.Script(`(function(exports, require, module) {\n${transpile(text, file)}\n})(exports, require, module);`, {filename: file})
    .runInContext(env.context, {timeout: 3000});
  return module.exports;
}
function realRate(baseline, env) {
  const trace = [], implementation = moduleLoad('src/lib/rate-limit.ts', read('src/lib/rate-limit.ts', baseline), env, {'server-only': {}}).rateLimit;
  check(typeof implementation === 'function', 'Real rateLimit export missing');
  return {trace, rateLimit(key, limit, window) { const allowed = implementation(key, limit, window); trace.push({key, limit, window, allowed}); return allowed; }};
}
function makeRequest(route, body, scenario = {}) {
  const url = `https://fixture.invalid/api/${route === 'reference-workbench/[...path]' ? 'reference-workbench/' + (scenario.action === 'upload' ? 'workbench/upload-folder' : 'quote') : route}`;
  const headers = {'origin': scenario.crossSite ? 'https://foreign.invalid' : 'https://fixture.invalid', 'x-real-ip': IP};
  if (route === 'imagegen/inputs') {
    const data = new FormData(); data.append('image', new (globalThis.File || BufferFile)([Buffer.from('fixture-image-bytes')], 'fixture.png', {type: 'image/png'}));
    return new Request(url, {method: 'POST', headers, body: data});
  }
  return new Request(url, {method: 'POST', headers: {...headers, 'content-type': 'application/json'}, body: JSON.stringify(body)});
}
async function response(value) {
  if (value instanceof Response) return {status: value.status, body: await value.json()};
  check(value?.sentinel === true, 'Route did not reach response or continuation sentinel');
  return {status: 200, body: value};
}
function errorClass(name) { return class extends Error { constructor(message = name, status = 400) { super(message); this.status = status; this.code = name; } }; }

function actualRunner(route, text, baseline, scenario) {
  const env = sandbox(), rate = realRate(baseline, env), downstream = [], ban = [];
  const actor = scenario.anonymous ? null : ACTOR;
  const pass = (_request, run) => run();
  const continuation = (name, owner, data) => {
    check(owner === ACTOR, `${route}: downstream owner not authenticated actor`);
    downstream.push({name, owner}); return {sentinel: true, owner, name, ...data};
  };
  const dependencies = {
    'server-only': {},
    '@/lib/admin-auth': {resolveUserEmail: async () => actor},
    '@/lib/db': {dbEnabled: true, isBanned: async (email, ip) => {ban.push({email, ip}); return !!scenario.banned; }},
    '@/lib/bi/model-observer': {withBiRequest: pass},
    '@/lib/saas/creation-context': {withCreationRoute: pass, withCreationReceiptRoute: pass},
    '@/lib/durable-image-jobs': {imageWorkerAuthorized: () => false},
    '@/lib/rate-limit': {rateLimit: rate.rateLimit},
    '@/lib/imagegen/schema': {imagegenRequestSchema: {parse: x => x, safeParse: x => ({success: true, data: x})}},
    '@/lib/imagegen/dispatch': {
      submitImagegen: async (value, owner) => continuation('submitImagegen', owner, {operationId: value.operationId}),
      readImagegenReceipt: async () => null,
      getImagegenResult: async (_id, owner) => continuation('getImagegenResult', owner),
      resumeImagegen: () => env.forbidden('worker-resume')},
    '@/lib/imagegen/batch': {
      submitImagegenBatch: async (_value, owner) => continuation('submitImagegenBatch', owner),
      readImagegenBatchReceipt: async () => null,
      planImagegenBatch: async (_value, owner) => continuation('planImagegenBatch', owner)},
    '@/lib/imagegen/plan': {planImagegen: async (_value, owner) => continuation('planImagegen', owner)},
    '@/lib/imagegen/input-assets': {saveImagegenInput: async (_bytes, owner) => continuation('saveImagegenInput', owner)},
    '@/lib/imagegen/stored-delivery': {recoverStoredDelivery: async (_id, owner) => continuation('recoverStoredDelivery', owner)},
    '@/lib/imagegen/confirmation': {ImagegenConfirmationChanged: errorClass('IMAGEGEN_CONFIRMATION_CHANGED')},
    '@/lib/imagegen/creation-scope': {ImagegenScopeError: errorClass('IMAGEGEN_SCOPE_INVALID')},
    '@/lib/imagegen/plan-error': {ImagegenPlanError: errorClass('IMAGEGEN_PLAN_ERROR')},
    '@/lib/imagegen/quotes': {ImagegenQuoteError: errorClass('IMAGEGEN_QUOTE_INVALID'), assertImagegenQuoteReference() {},
      readImagegenQuote: () => env.forbidden('unexpected-saved-quote'),
      issueImagegenQuote: async (_value, owner) => continuation('issueImagegenQuote', owner)},
    'zod': {ZodError: errorClass('ZodError')}, 'node:crypto': require('node:crypto'),
    '@/lib/feature-access/server': {userFeaturePolicy: async () => ({})},
    '@/lib/feature-access/catalog': {allows: () => !scenario.featureDenied},
    '@/lib/imagegen/zip': {},
    '@/lib/reference-workbench/repository': {},
    '@/lib/reference-workbench/contract': {WorkbenchError: errorClass('WorkbenchError')},
    '@/lib/reference-workbench/service': {
      uploadFolder: async (owner) => continuation('uploadFolder', owner),
      preview: async (owner) => continuation('preview', owner)},
    '@/lib/reference-workbench/errors': {workbenchFailure: error => ({status: error.status || 500, body: {error: error.message}})}
  };
  dependencies['@/lib/billing/access'] = moduleLoad('src/lib/billing/access.ts', read('src/lib/billing/access.ts', baseline), env, dependencies);
  dependencies['@/lib/imagegen/body'] = moduleLoad('src/lib/imagegen/body.ts', read('src/lib/imagegen/body.ts', baseline), env, {'server-only': {}});
  const exports = moduleLoad(`src/app/api/${route}/route.ts`, text, env, dependencies);
  check(typeof exports.POST === 'function', `${route}: missing actual POST`);
  return {env, rate, downstream, ban, async run() {
    const body = route === 'reference-workbench/[...path]'
      ? {action: scenario.bodyAction || 'single/start', body: {email: FOREIGN}}
      : {version: 1, operationId: UUID, entry: 'canvas', mode: scenario.batch ? 'batch' : 'generate', prompt: 'fixture', email: FOREIGN};
    return response(await exports.POST(makeRequest(route, body, scenario)));
  }};
}

function legacyProjection(sf, base, targetSite, baseline, scenario) {
  const env = sandbox(), rate = realRate(baseline, env), downstream = [], ban = [], ownerReads = [];
  const fn = single(walk(sf, n => ts.isFunctionDeclaration(n) && n.name?.text === base.fn.name.text), `${sf.fileName}: handler`);
  const nodes = [], helpers = [];
  const add = n => { if (n && !nodes.includes(n)) nodes.push(n); };
  const isCanvas = base.key.startsWith('canvas-'), redo = base.key === 'aplus-redo', competitor = base.key === 'competitor';
  const varStatements = walk(fn, ts.isVariableStatement);
  const variables = name => varStatements.filter(s => s.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === name));
  let ownerMode = 'authenticated-email-override', banMode = 'exact-entry-condition';
  if (competitor) {
    const helperFile = 'src/lib/competitor-server.ts', helper = parse(helperFile, read(helperFile, baseline));
    for (const name of ['WorkspaceError', 'competitorActor', 'ownedCompetitor']) helpers.push(single(helper.statements.filter(n => (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name?.text === name), `${helperFile}:${name}`).getText(helper).replace(/^export\s+/, ''));
    add(single(walk(fn, n => ts.isExpressionStatement(n) && calls(n, 'competitorActor').length > 0), 'competitor actor assignment'));
    add(single(varStatements.filter(n => calls(n, 'ownedCompetitor').length > 0 && n.declarationList.declarations.some(d => d.name.getText(sf) === 'original')), 'competitor owner lookup'));
    ownerMode = 'actual-ownedCompetitor-helper';
  } else if (isCanvas) {
    add(single(varStatements.filter(s => calls(s, 'authenticatedEmail').length > 0), `${base.key}: auth binding`));
    add(single(walk(fn, n => ts.isIfStatement(n) && ['!email', 'dbEnabled && !email'].includes(n.expression.getText(sf).trim())), `${base.key}: anonymous guard`));
    const lookup = varStatements.filter(s => calls(s, 'listArtworksByIds').length > 0);
    if (base.key !== 'canvas-image-task') {
      const stmt = single(lookup, `${base.key}: owner binding`); add(stmt);
      const siblings = stmt.parent.statements, next = siblings[siblings.indexOf(stmt) + 1];
      check(next && ts.isIfStatement(next) && next.expression.getText(sf) === '!artwork', `${base.key}: missing exact owner rejection`); add(next);
      ownerMode = 'actual-artwork-guard-with-fixture-owned-query';
    } else ownerMode = 'authenticated-email-binding';
    banMode = 'no-branch-local-ban-in-original';
  } else {
    const auth = walk(fn, n => ts.isIfStatement(n) && n.expression.getText(sf) === 'dbEnabled' && calls(n, 'resolveUserEmail').length > 0);
    check(auth.length === (sf.fileName.includes('/aplus/') ? 2 : 1), `${base.key}: missing/unrecognized auth block (${auth.length})`);
    add(redo ? auth[0] : auth[auth.length - 1]);
    for (const s of variables('actorEmail')) add(s);
    if (redo) { ownerMode = 'actual-JOBS-owner-comparison'; banMode = 'no-branch-local-ban-in-original'; }
    else add(single(walk(fn, n => ts.isIfStatement(n) && calls(n.expression, 'isBanned').length > 0), `${base.key}: ban guard`));
  }
  if (targetSite) add(targetSite.guard);
  const ipStatements = variables('ip');
  if (ipStatements.length) add(redo ? ipStatements[0] : ipStatements[ipStatements.length - 1]);
  nodes.sort((a, b) => a.pos - b.pos);
  // Compare security nodes independently of optional whole-file preservation.
  const securitySource = nodes.filter(n => n !== targetSite?.guard && !variables('ip').includes(n)).map(n => canonical(n.getText(sf)));
  const authenticated = async () => scenario.anonymous ? null : ACTOR;
  Object.assign(env.context, {
    __request: makeRequest('fixture', {}), __input: {email: FOREIGN, artworkId: 'fixture-art'},
    __body: {action: scenario.bodyAction || 'edit'}, __params: {id: UUID},
    dbEnabled: true, resolveUserEmail: authenticated, clientIp: () => IP,
    currentImagegenStep: () => scenario.advanced ? {} : null,
    rateLimit: rate.rateLimit, NextResponse: Response,
    isBanned: async (email, ip) => {ban.push({email, ip}); return !!scenario.banned;},
    JOBS: {owner: async () => scenario.foreign ? FOREIGN : ACTOR},
    listArtworksByIds: async (email, ids) => {ownerReads.push({email, ids}); return scenario.foreign ? [] : [{id: 'fixture-art', email: ACTOR}];},
    getCompetitorItem: async (email, id) => {ownerReads.push({email, id}); return scenario.foreign ? null : {id, email};},
    z: require(require.resolve('zod', {paths: [REPO]})).z,
    __continue: value => {downstream.push(value); return {sentinel: true, ...value};}
  });
  // authenticatedEmail is a real source function; only its resolver is stubbed.
  const requestAuth = parse('src/lib/request-auth.ts', read('src/lib/request-auth.ts', baseline));
  helpers.unshift(single(requestAuth.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === 'authenticatedEmail'), 'authenticatedEmail helper').getText(requestAuth).replace(/^export\s+/, ''));
  const code = `${helpers.join('\n')}\n globalThis.__run=async function(){
    const request=__request,req=__request,input=__input,p=__input,body=__body,params=__params,jobId='fixture-job',artworkId='fixture-art';
    ${competitor ? 'let email="";' : ''}
    ${nodes.map(n => n.getText(sf)).join('\n')}
    return __continue({owner:${competitor || isCanvas ? 'email' : redo ? 'null' : 'input.email'}});
  };`;
  evaluate(code, `${sf.fileName}:guard-projection`, env.context);
  return {env, rate, downstream, ban, ownerReads, securitySource, ownerMode, banMode,
    snippets: nodes.map(n => ({line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, source: n.getText(sf)})),
    async run() { try { return await response(await env.context.__run()); } catch (e) { if (competitor && Number.isInteger(e.status)) return {status: e.status, body: {error: e.message}}; throw e; } }};
}
async function invoke(runner) {
  report.requests++;
  const result = await runner.run();
  check(!runner.env.violations.length, `Forbidden effects: ${runner.env.violations.join(', ')}`);
  return result;
}
async function exercise(make, base, limited, scenario, label) {
  const runner = make(scenario), limit = number(base.call.arguments[1], scenario.bodyAction), attempts = limit + 3;
  let continued = 0, blocked = 0; const outcomes = [];
  for (let i = 0; i < attempts; i++) {
    const before = runner.downstream.length, result = await invoke(runner);
    const reached = runner.downstream.length > before;
    const shouldReach = !limited || i < limit;
    check(reached === shouldReach, `${label}: request ${i + 1}/${attempts} expected ${shouldReach ? 'continuation' : 'old limit'}; got ${JSON.stringify(result)}`);
    if (reached) {check(result.status >= 200 && result.status < 300, `${label}: continuation returned ${result.status}`); continued++;}
    else {
      check(result.status === (base.key === 'imagegen' ? 400 : 429), `${label}: wrong limiter status ${result.status}`);
      check(runner.rate.trace.at(-1)?.allowed === false, `${label}: rejection did not execute real limiter`); blocked++;
    }
    if (i === 0 || i === limit - 1 || i >= limit) outcomes.push({request: i + 1, status: result.status, body: result.body});
  }
  check(runner.rate.trace.length === (limited ? attempts : 0), `${label}: unexpected rate-call count ${runner.rate.trace.length}`);
  return {label, action: scenario.bodyAction || null, attempts, limit, continued, blocked, outcomes,
    rateCalls: runner.rate.trace.length, firstRateCall: runner.rate.trace[0] || null, lastRateCall: runner.rate.trace.at(-1) || null};
}
async function security(make, base, actual) {
  const checks = [], anonymous = make({anonymous: true});
  let result = await invoke(anonymous);
  check(result.status === (base.key === 'aplus-redo' ? 403 : 401) && anonymous.downstream.length === 0, `${base.key}: anonymous guard failed ${JSON.stringify(result)}`);
  checks.push({scenario: 'anonymous', ...result});
  const own = make({}), projected = !actual;
  result = await invoke(own);
  check(result.status === 200 && own.downstream.length > 0, `${base.key}: authenticated continuation missing`);
  if (projected && base.key !== 'aplus-redo') check(own.downstream.at(-1).owner === ACTOR, `${base.key}: client email was not replaced by authenticated owner`);
  checks.push({scenario: 'forged-client-email', status: result.status, owner: ACTOR,
    evidence: actual ? own.downstream : own.ownerMode});
  if (!actual && ['actual-JOBS-owner-comparison', 'actual-artwork-guard-with-fixture-owned-query', 'actual-ownedCompetitor-helper'].includes(own.ownerMode)) {
    const foreign = make({foreign: true}); result = await invoke(foreign);
    check([403, 404].includes(result.status) && foreign.downstream.length === 0, `${base.key}: cross-owner guard failed`);
    checks.push({scenario: 'foreign-record', ...result, ownerReads: foreign.ownerReads});
  }
  const hasBan = actual ? base.key.startsWith('ref-') : own.banMode !== 'no-branch-local-ban-in-original';
  if (hasBan) {
    const banned = make({banned: true}); result = await invoke(banned);
    check(result.status === 403 && banned.downstream.length === 0 && banned.ban.length > 0, `${base.key}: ban guard failed`);
    check(banned.ban.every(x => x.email === ACTOR), `${base.key}: ban used untrusted owner`);
    checks.push({scenario: 'banned', ...result, calls: banned.ban});
  } else checks.push({scenario: 'banned', status: 'NOT_APPLICABLE', reason: 'Original entry branch has no local ban condition; wrappers/downstream are outside probe.'});
  if (actual) {
    const cross = make({crossSite: true}); result = await invoke(cross);
    check(result.status === 403 && cross.downstream.length === 0, `${base.key}: same-site guard failed`);
    checks.push({scenario: 'cross-site', ...result});
  }
  return checks;
}

async function main() {
  check(files.length === 29 && new Set(files).size === 29, 'Manifest must contain exactly 29 routes');
  let totalGuards = 0;
  for (let f = 0; f < files.length; f++) {
    const file = files[f], route = names[f], oldText = read(file, true), text = read(file);
    const oldAst = parse(file, oldText), ast = parse(file, text), oldSites = sites(oldAst), currentSites = sites(ast);
    check(oldSites.length === (route === 'aplus' || route.startsWith('reference-workbench/') ? 2 : 1), `${file}: baseline guard missing/unknown count`);
    totalGuards += oldSites.length;
    const entry = {file, baselineSha256: hash(oldText), selectedSha256: hash(text), mode: small.includes(route) || route.startsWith('reference-workbench/') ? 'actual-transpiled-POST' : 'exact-AST-guard-projection', guards: []};
    report.routes.push(entry);
    check(currentSites.every(s => oldSites.some(o => o.key === s.key)), `${file}: unrecognized additional rate guard`);
    if (options.preservation) {
      check(canonical(normalized(oldAst, oldSites)) === canonical(normalized(ast, currentSites)), `${file}: non-rate AST changed; inspect diff or omit --check-preservation for unrelated integrated work`);
      entry.preservation = 'PASS';
    }
    for (const base of oldSites) {
      const selectedSite = currentSites.find(s => s.key === base.key);
      verifyRateShape(base, selectedSite, ast, options.expect === 'unlimited');
      const isActual = entry.mode === 'actual-transpiled-POST';
      const defaults = base.key === 'ref-upload' ? {action: 'upload'} : base.key === 'ref-quote' ? {bodyAction: 'single/start'} : {};
      const make = (baseline, scenario) => isActual
        ? actualRunner(route, baseline ? oldText : text, baseline, {...defaults, ...scenario})
        : legacyProjection(baseline ? oldAst : ast, base, baseline ? base : selectedSite, baseline, scenario);
      const oldProbe = make(true, {}), newProbe = make(false, {});
      if (!isActual) check(JSON.stringify(oldProbe.securitySource) === JSON.stringify(newProbe.securitySource), `${file}/${base.key}: security guards/bindings changed or missing`);
      const actions = base.key === 'competitor' ? ['edit', 'replicate', 'analyze']
        : base.key === 'ref-quote' ? ['single/start', 'workbench/start', 'workbench/edit', 'chat-image/confirm', 'workbench/infer-prompts', 'chat-image/send'] : [null];
      const guard = {key: base.key, baselineLine: base.line, baselineCondition: base.guard.expression.getText(oldAst),
        selectedCondition: selectedSite?.guard.expression.getText(ast) || null,
        baselineKeyExpression: base.call.arguments[0].getText(oldAst), windowMs: number(base.call.arguments[2]),
        ancestorConditions: (() => {const a=[]; for(let p=base.guard.parent;p&&p!==base.fn;p=p.parent)if(ts.isIfStatement(p))a.push(p.expression.getText(oldAst)); return a;})(), probes: []};
      entry.guards.push(guard);
      if (!isActual) {guard.projection = newProbe.snippets; guard.ownerMode = newProbe.ownerMode; guard.banMode = newProbe.banMode;}
      for (const action of actions) {
        const scenario = action ? {bodyAction: action} : {};
        const textOnly = base.key === 'competitor' && action === 'analyze' || base.key === 'ref-quote' && ['workbench/infer-prompts', 'chat-image/send'].includes(action);
        guard.probes.push(await exercise(s => make(true, s), base, true, scenario, `${base.key}:${action || 'image'}:BASELINE`));
        guard.probes.push(await exercise(s => make(false, s), base, options.expect === 'limited' || textOnly, scenario, `${base.key}:${action || 'image'}:SELECTED`));
      }
      guard.security = await security(s => make(false, s), base, isActual);
      if (base.key === 'imagegen' || base.key === 'imagegen-plan') guard.probes.push(await exercise(s => make(false, s), base, options.expect === 'limited', {batch: true}, `${base.key}:batch:SELECTED`));
      if (base.key === 'gen') guard.probes.push(await exercise(s => make(true, s), base, false, {advanced: true}, 'gen:existing-imagegen-step-bypass:BASELINE'));
    }
    entry.status = 'PASS';
    console.log(`PASS ${file} guards=${oldSites.length} mode=${entry.mode}`);
  }
  check(totalGuards === 31, `Expected 31 original guards, found ${totalGuards}`);
  for (const [file, digest] of observed) check(hash(fs.readFileSync(file)) === digest, `Source mutated during verification: ${file}`);
  report.status = 'PASS'; report.originalGuardCount = totalGuards;
  report.routeCount = files.length; report.sourceFilesUnchanged = true;
  report.summary = `PASS expect=${options.expect} routes=29 oldGuards=31 requests=${report.requests} supplierCalls=0 dbCalls=0 httpCalls=0 sourceFilesUnchanged=true`;
  console.log(report.summary);
}
main().catch(error => {report.status = 'FAIL'; report.errors.push(error.stack || String(error)); console.error(`FAIL ${error.stack || error}`); process.exitCode = 1;}).finally(() => {
  if (!options.report) return;
  const destination = path.resolve(options.report);
  const relative = path.relative(options.root, destination).replace(/\\/g, '/');
  check(destination.endsWith('.json') && !observed.has(destination) && !/^(src|scripts|node_modules)\//.test(relative)
    && !['package.json', 'package-lock.json', 'tsconfig.json'].includes(relative), 'Report path would overwrite source/config');
  fs.mkdirSync(path.dirname(destination), {recursive: true}); fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`REPORT ${destination}`);
});
