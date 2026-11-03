// Real browser cache modules and AST-extracted CanvasClient initialization /
// persistence effects. HTTP/auth faults and React state commits are explicit
// fixture boundaries; no live account, database or supplier is contacted.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const ts = require('typescript'), esbuild = require('esbuild');
const { chromium } = require('@playwright/test');
const args = process.argv.slice(2), arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const sourceRoot = path.resolve(arg('--source-root', path.join(__dirname, '..')));
const outputRoot = path.resolve(arg('--output-root', 'output/canvas-read-resilience-20261103/startup'));
const baseline = args.includes('--baseline'), dependencies = path.resolve(__dirname, '../node_modules');
const owner = 'startup-owner@fixture.test', other = 'startup-other@fixture.test';
const checks = [], loaded = new Map(), pageErrors = [], external = [];
let server, browser;
fs.mkdirSync(outputRoot, { recursive: true });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function read(relative) {
  const file = path.join(sourceRoot, relative), bytes = fs.readFileSync(file);
  loaded.set(relative, { path: file, sha256: hash(bytes) }); return bytes.toString('utf8');
}
function transpileExpression(value) {
  return ts.transpileModule(`const extracted = ${value};`, { fileName: 'canvas-startup-expression.tsx', compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText.replace(/^const extracted = /, '').trim().replace(/;$/, '');
}
const canvasSource = read('src/components/canvas/canvas-client.tsx');
const ast = ts.createSourceFile('canvas-client.tsx', canvasSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [], retryCallbacks = [];
(function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]) effects.push(node.arguments[0]);
  if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onClick' && node.initializer && ts.isJsxExpression(node.initializer)
    && node.initializer.expression?.getText(ast).includes('setCanvasLoadAttempt')) retryCallbacks.push(node.initializer.expression);
  ts.forEachChild(node, visit);
})(ast);
const initialization = effects.filter(n => n.getText(ast).includes('loadedProjectRequest.current = null') && n.getText(ast).includes('loadCurrentAccount'));
const persistence = effects.filter(n => n.getText(ast).includes('naumi:canvas-text-nodes:') && n.getText(ast).includes('localStorage.setItem') && n.getText(ast).includes('textNodesReady'));
assert.equal(initialization.length, 1, 'one actual CanvasClient initialization effect');
assert.equal(persistence.length, 1, 'one actual CanvasClient text persistence effect');
const initCode = transpileExpression(initialization[0].getText(ast));
const persistCode = transpileExpression(persistence[0].getText(ast));
const retryCode = retryCallbacks.length === 1 ? transpileExpression(retryCallbacks[0].getText(ast)) : null;
if (!baseline) { assert.equal(retryCallbacks.length, 1, 'one real retry click handler'); assert.ok(initialization[0].parent.arguments[1]?.getText(ast).includes('canvasLoadAttempt'), 'real effect subscribes to retry attempt'); }
const libraryCode = {};
for (const [kind, relative] of [['works', 'src/components/works/works-client.tsx'], ['workbench', 'src/components/home/workbench-client.tsx']]) {
  const code = read(relative), tree = ts.createSourceFile(relative, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), found = [];
  (function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.arguments[0]?.getText(tree).includes('loadAccountSnapshot')) found.push(node.arguments[0]);
    ts.forEachChild(node, visit);
  })(tree);
  assert.equal(found.length, 1, 'one real ' + kind + ' account effect'); libraryCode[kind] = transpileExpression(found[0].getText(tree));
}
const hasDeadline = fs.existsSync(path.join(sourceRoot, 'src/lib/browser-read-deadline.ts'));
const entry = `import * as data from '@/lib/browser-data-cache';
${hasDeadline ? "import * as deadline from '@/lib/browser-read-deadline';" : 'const deadline = {};'}
window.fixtureModules={...data,...deadline};window.fixtureReady=true;`;

async function compile() {
  const bundle = await esbuild.build({ stdin: { contents: entry, resolveDir: sourceRoot, sourcefile: 'startup-entry.ts' },
    outfile: path.join(outputRoot, 'bundle.js'), bundle: true, platform: 'browser', format: 'iife', metafile: true,
    nodePaths: [dependencies], alias: { '@': path.join(sourceRoot, 'src') },
    plugins: [{ name: 'auth-fixture', setup(build) {
      build.onResolve({ filter: /(^|\/)supabase$/ }, input => ({ path: input.path, namespace: 'auth-fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'auth-fixture' }, () => ({ contents: 'export function authHeader(){return window.fixtureAuth();}', loader: 'js' }));
    } }],
  });
  for (const item of Object.keys(bundle.metafile.inputs)) {
    if (item.startsWith('auth-fixture:')) continue;
    const file = path.resolve(item), relative = path.relative(sourceRoot, file);
    if (relative.startsWith('src') && fs.existsSync(file)) loaded.set(relative.replaceAll('\\', '/'), { path: file, sha256: hash(fs.readFileSync(file)) });
  }
  assert.ok(loaded.has('src/lib/browser-data-cache.ts'), 'actual account cache module bundled');
}

async function fixture(config = {}) {
  const context = await browser.newContext();
  const page = await context.newPage(); page.setDefaultTimeout(3000);
  page.on('pageerror', error => pageErrors.push(error.message));
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin !== origin) { external.push(u.href); return route.abort(); }
    return route.continue();
  });
  await page.addInitScript(({ owner, config, initCode, persistCode, retryCode, libraryCode }) => {
    const nativeTimer = window.setTimeout.bind(window);
    window.fixtureTimer = nativeTimer;
    // Only exact product deadlines are compressed, preserving ordering. IDB,
    // browser event loops, fixture watchdogs, and cache freshness are untouched.
    window.setTimeout = (fn, ms, ...rest) => nativeTimer(fn, [20_000, 30_000, 35_000].includes(ms) ? ms / 100 : ms, ...rest);
    window.fixtureFault = { account: 'ok', projects: 'ok', text: 'ok', auth: 'ok', ...config };
    window.fixtureCalls = { account: 0, projects: 0, text: 0, auth: 0, mutations: 0, aborted: 0 };
    window.fixtureHolds = [];
    const textNode = { id: 'text-1', content: 'saved server text', width: 0, height: 0 };
    const userDraft = JSON.stringify([{ id: 'local-draft', content: 'unsaved prompt stays here' }]);
    localStorage.setItem(`naumi:canvas-text-nodes:${owner}`, userDraft);
    sessionStorage.setItem('naumi:imagegen-pending:v1:fixture', 'original-operation-accepted-no-replay');
    window.fixtureProtected = { draft: userDraft, receipt: sessionStorage.getItem('naumi:imagegen-pending:v1:fixture') };
    function hold(label, signal) {
      return new Promise((resolve, reject) => {
        const row = { label, resolve, reject, signal }; window.fixtureHolds.push(row);
        signal?.addEventListener('abort', () => { window.fixtureCalls.aborted++; }, { once: true });
        // Deliberately non-cooperative: late callbacks must remain fenced.
      });
    }
    window.fixtureAuth = () => { window.fixtureCalls.auth++; return window.fixtureFault.auth === 'hang' ? hold('auth') : Promise.resolve({}); };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      const method = (init.method || 'GET').toUpperCase();
      if (url.pathname.startsWith('/api/') && method !== 'GET') { window.fixtureCalls.mutations++; throw Error('UNEXPECTED_MUTATION'); }
      let key = url.pathname === '/api/account' ? 'account' : url.pathname === '/api/projects' ? 'projects' : url.pathname === '/api/canvas/text-nodes' ? 'text' : null;
      if (!key) return originalFetch(input, init);
      window.fixtureCalls[key]++;
      const mode = window.fixtureFault[key];
      const json = key === 'account' ? { artworks: [{ id: window.fixtureFault.artId || 'server-art', image: '/owned.png', status: 'completed' }], stats: { today: 2, total: 7 }, user: { secret: 'NOT_CACHEABLE' } } :
        key === 'projects' ? { names: { 'tree:one': 'Server project' } } : { persisted: true, nodes: [textNode] };
      if (mode === 'hang') return hold(key, init.signal);
      if (mode === 'reject') throw new Error(key + ' unavailable');
      if (mode === 'denied') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      if (mode === 'malformed') return new Response('{bad-json', { headers: { 'Content-Type': 'application/json' } });
      if (mode === 'shape') return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      if (mode === 'body-hang') return { ok: true, status: 200, json: () => hold(key + '-body', init.signal) };
      if (mode === 'native-local') return new Response(JSON.stringify({ persisted: false }), { headers: { 'Content-Type': 'application/json' } });
      if (mode === 'legacy-local') return new Response(JSON.stringify({ persisted: false, nodes: [] }), { headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json' } });
    };
    window.fixtureResolve = (label, result) => {
      const rows = window.fixtureHolds.filter(x => x.label === label); window.fixtureHolds = window.fixtureHolds.filter(x => x.label !== label);
      for (const row of rows) row.resolve(label.endsWith('-body') || label === 'auth' ? result : new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } }));
      return rows.length;
    };
    window.fixtureWatch = promise => Promise.race([
      promise.then(value => ({ kind: 'resolved', value }), error => ({ kind: 'rejected', name: error.name, message: error.message })),
      new Promise(resolve => nativeTimer(() => resolve({ kind: 'pending' }), 850)),
    ]);
    window.fixtureCacheRead = query => window.fixtureModules.loadAccountSnapshot(owner, query || '');
    window.fixtureLibraryQuery = kind => {
      if (kind === 'works') return '';
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
      return new URLSearchParams({ view: 'workbench', dayStart: dayStart.toISOString(), dayEnd: dayEnd.toISOString() }).toString();
    };
    window.fixtureLibrarySnapshot = { artworks: [{ id: 'saved-library-art', image: '/owned-library.png', status: 'completed' }], stats: { today: 2, total: 7 } };
    window.fixtureLibraryStart = (kind, opts = {}) => {
      const state = window.fixtureLibraryState ||= { works: null, recent: null, stats: { today: 0, total: 0 }, selected: null, active: null };
      let load = window.fixtureModules.loadAccountSnapshot;
      if (opts.mode) load = (email, query, apply) => {
        if (opts.mode.endsWith('-stale')) apply(window.fixtureLibrarySnapshot);
        if (opts.mode.startsWith('timeout')) return Promise.reject(new DOMException('fixture read timeout', 'TimeoutError'));
        if (opts.mode.startsWith('error')) return Promise.reject(new Error('Account load 403'));
        if (opts.mode === 'late') return new Promise(resolve => { window.fixtureLibraryComplete = resolve; });
        if (opts.mode === 'success') return Promise.resolve({ artworks: [{ id: 'new-owner-art', image: '/new.png' }], stats: { today: 1, total: 1 } });
        throw Error('UNKNOWN_LIBRARY_FIXTURE');
      };
      const env = { ready: true, user: { email: opts.email || owner }, artworkIdRef: { current: {} }, loadAccountSnapshot: load };
      for (const key of ['works', 'recent', 'stats', 'selected', 'active']) env['set' + key[0].toUpperCase() + key.slice(1)] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
      const cleanup = Function(...Object.keys(env), `return (${libraryCode[kind]})`)(...Object.values(env))();
      window.fixtureLibraryCleanup = cleanup; return state;
    };
    window.fixtureStart = (opts = {}) => {
      const state = { works: null, names: {}, textNodes: [], textNodesReady: false, canvasLoadError: null, persistedWrites: 0 };
      const refs = { loadedProjectRequest: { current: null }, desktopProjectOpened: { current: null }, pendingNodeRef: { current: null }, deepFocusRef: { current: false }, restoredRef: { current: false } };
      let commitsPending = false;
      const base = { ...window.fixtureModules, ...refs, ready: true, authenticatedEmail: owner, user: { email: owner }, requestedProject: null,
        locale: 'zh', canvasLoadAttempt: 0, targetEmail: owner, TEXT_NODE_DEFAULT_W: 300, TEXT_NODE_DEFAULT_H: 180, authHeader: window.fixtureAuth,
        privateFetchRaw: async (input, init = {}) => { await window.fixtureAuth(); return fetch(input, init); },
        setPinnedNode: () => {}, setBrowsing: () => {}, setActiveKey: () => {}, setTargetEmail: () => {}, setReadOnly: () => {}, ...opts };
      const persist = () => {
        const bindings = { ...base, ...state };
        return Function(...Object.keys(bindings), `return (${persistCode})`) (...Object.values(bindings))();
      };
      for (const name of ['works', 'names', 'textNodes', 'textNodesReady', 'canvasLoadError']) {
        const setter = 'set' + name[0].toUpperCase() + name.slice(1);
        base[setter] = value => {
          state[name] = typeof value === 'function' ? value(state[name]) : value;
          if (!commitsPending) { commitsPending = true; queueMicrotask(() => { commitsPending = false; persist(); }); }
        };
      }
      const cleanup = Function(...Object.keys(base), `return (${initCode})`)(...Object.values(base))();
      window.fixtureState = state; window.fixtureCleanup = cleanup; window.fixtureRefs = refs;
      window.fixtureRetry = () => {
        if (!retryCode) throw new Error('RETRY_HANDLER_ABSENT');
        let attempt = base.canvasLoadAttempt;
        const callback = Function('setCanvasLoadError', 'setCanvasLoadAttempt', `return (${retryCode})`)(base.setCanvasLoadError, value => { attempt = typeof value === 'function' ? value(attempt) : value; });
        callback();
        if (attempt !== base.canvasLoadAttempt) { cleanup?.(); return window.fixtureStart({ ...opts, canvasLoadAttempt: attempt }); }
      };
      return state;
    };
  }, { owner, config, initCode, persistCode, retryCode, libraryCode });
  await page.goto(origin); await page.waitForFunction(() => window.fixtureReady);
  await page.evaluate(owner => window.fixtureModules.activateBrowserData(owner), owner);
  return { page, close: () => context.close() };
}

let origin;
async function check(name, defect, run) {
  try { const detail = await run(); checks.push({ name, pass: true, defect, detail }); }
  catch (error) { checks.push({ name, pass: false, defect, error: error.stack || error.message }); }
  console.log('CHECK=' + name + ' RESULT=' + (checks.at(-1).pass ? 'PASS' : 'FAIL'));
}
const saved = async page => page.evaluate(owner => ({
  draft: localStorage.getItem(`naumi:canvas-text-nodes:${owner}`), receipt: sessionStorage.getItem('naumi:imagegen-pending:v1:fixture'),
  protected: window.fixtureProtected, calls: window.fixtureCalls, state: window.fixtureState,
}), owner);

async function main() {
  await compile();
  server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/bundle.js' ? 'application/javascript' : 'text/html'); res.end(req.url === '/bundle.js' ? fs.readFileSync(path.join(outputRoot, 'bundle.js')) : '<!doctype html><html><body><script src="/bundle.js"></script></body></html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });

  for (const fault of ['hang', 'body-hang', 'auth-hang']) await check('ACCOUNT_' + fault.toUpperCase().replaceAll('-', '_') + '_BOUNDED', true, async () => {
    const f = await fixture(fault === 'auth-hang' ? { auth: 'hang' } : { account: fault });
    try {
      const result = await f.page.evaluate(() => window.fixtureWatch(window.fixtureCacheRead()));
      assert.equal(result.kind, baseline ? 'pending' : 'rejected');
      if (!baseline) assert.match(result.name, /Timeout|Abort/);
      const state = await saved(f.page); assert.equal(state.draft, state.protected.draft); assert.equal(state.receipt, state.protected.receipt); assert.equal(state.calls.mutations, 0);
      return { result, calls: state.calls };
    } finally { await f.close(); }
  });

  await check('TIMEOUT_NEW_READ_NO_POISONED_SHARED_PROMISE', true, async () => {
    const f = await fixture({ account: 'hang' });
    try {
      const first = await f.page.evaluate(() => window.fixtureWatch(window.fixtureCacheRead()));
      await f.page.evaluate(() => { window.fixtureFault.account = 'ok'; });
      const second = await f.page.evaluate(() => window.fixtureWatch(window.fixtureCacheRead()));
      assert.equal(first.kind, baseline ? 'pending' : 'rejected'); assert.equal(second.kind, baseline ? 'pending' : 'resolved');
      const state = await saved(f.page); assert.equal(state.calls.account, baseline ? 1 : 2); return { first, second, calls: state.calls };
    } finally { await f.close(); }
  });

  await check('LATE_BODY_AFTER_TIMEOUT_CANNOT_PUBLISH_OR_CACHE', true, async () => {
    const f = await fixture({ account: 'body-hang' });
    try {
      const first = await f.page.evaluate(() => window.fixtureWatch(window.fixtureCacheRead()));
      await f.page.evaluate(() => { window.fixtureFault.account = 'ok'; window.fixtureResolve('account-body', { artworks: [{ id: 'late-old-art', status: 'completed' }] }); });
      await f.page.waitForTimeout(80);
      const second = await f.page.evaluate(() => window.fixtureWatch(window.fixtureCacheRead()));
      assert.equal(first.kind, baseline ? 'pending' : 'rejected'); assert.equal(second.kind, 'resolved');
      assert.equal(second.value.artworks[0].id, baseline ? 'late-old-art' : 'server-art'); return { first, second };
    } finally { await f.close(); }
  });

  await check('HEALTHY_READS_DEDUP_AND_HOT_CACHE_RETAINED', false, async () => {
    const f = await fixture({ account: 'hang' }); try {
      await f.page.evaluate(() => { window.fixtureBoth = Promise.all([window.fixtureCacheRead(), window.fixtureCacheRead()]); });
      await f.page.waitForFunction(() => window.fixtureCalls.account === 1); await f.page.waitForTimeout(40);
      const result = await f.page.evaluate(async () => {
        window.fixtureFault.account = 'ok'; window.fixtureResolve('account', { artworks: [{ id: 'server-art', status: 'completed' }], user: { secret: 'NOT_CACHEABLE' } });
        const both = await window.fixtureBoth; const again = await window.fixtureCacheRead(); return { both, again, calls: window.fixtureCalls };
      });
      assert.equal(result.calls.account, 1); assert.equal(result.again.artworks[0].id, 'server-art'); assert.equal(result.again.user, undefined); assert.equal(result.calls.mutations, 0); return result;
    } finally { await f.close(); }
  });

  await check('AUTHORITY_DENIAL_REJECTS_NO_EMPTY_SUCCESS', false, async () => {
    const f = await fixture({ account: 'denied' }); try {
      const result = await f.page.evaluate(() => window.fixtureWatch(window.fixtureCacheRead())); assert.equal(result.kind, 'rejected'); assert.match(result.message, /403/);
      const state = await saved(f.page); assert.equal(state.draft, state.protected.draft); return result;
    } finally { await f.close(); }
  });

  await check('MALFORMED_ACCOUNT_SHAPE_NOT_CACHED_AS_EMPTY_DOCUMENT', true, async () => {
    const f = await fixture({ account: 'shape' }); try {
      const first = await f.page.evaluate(() => window.fixtureWatch(window.fixtureCacheRead()));
      await f.page.evaluate(() => { window.fixtureFault.account = 'ok'; });
      const second = await f.page.evaluate(() => window.fixtureWatch(window.fixtureCacheRead()));
      assert.equal(first.kind, baseline ? 'resolved' : 'rejected'); assert.equal(second.kind, 'resolved');
      if (baseline) assert.deepEqual(second.value.artworks, []); else assert.equal(second.value.artworks[0].id, 'server-art');
      return { first, second };
    } finally { await f.close(); }
  });

  await check('ACCOUNT_SWITCH_REJECTS_OLD_SHARED_RESULT', false, async () => {
    const f = await fixture({ account: 'hang' }); try {
      await f.page.evaluate(() => { window.fixtureResult = null; window.fixtureCacheRead().then(value => window.fixtureResult = { kind: 'resolved', value }, error => window.fixtureResult = { kind: 'rejected', message: error.message }); });
      await f.page.waitForFunction(() => window.fixtureCalls.account === 1);
      await f.page.evaluate(other => { window.fixtureModules.activateBrowserData(other); window.fixtureResolve('account', { artworks: [{ id: 'other-account-old' }] }); }, other);
      await f.page.waitForFunction(() => window.fixtureResult !== null); const result = await f.page.evaluate(() => window.fixtureResult); assert.equal(result.kind, 'rejected'); return result;
    } finally { await f.close(); }
  });

  for (const key of ['account', 'projects', 'text']) await check('REAL_CANVAS_' + key.toUpperCase() + '_HANG_EXITS_WAITING', true, async () => {
    const f = await fixture({ [key]: 'hang' }); try {
      await f.page.evaluate(() => window.fixtureStart()); await f.page.waitForTimeout(750);
      const result = await saved(f.page); assert.equal(result.state.works, null); assert.equal(result.state.textNodesReady, false);
      assert.equal(!!result.state.canvasLoadError, !baseline); assert.equal(result.draft, result.protected.draft); assert.equal(result.receipt, result.protected.receipt); assert.equal(result.calls.mutations, 0); return result;
    } finally { await f.close(); }
  });

  await check('REAL_CANVAS_ACCOUNT_ERROR_PRESERVES_LOCAL_DRAFT', true, async () => {
    const f = await fixture({ account: 'reject' }); try {
      await f.page.evaluate(() => window.fixtureStart()); await f.page.waitForTimeout(150); const result = await saved(f.page);
      if (baseline) { assert.deepEqual(result.state.works, []); assert.equal(result.state.textNodesReady, true); assert.equal(result.draft, '[]'); }
      else { assert.equal(result.state.works, null); assert.equal(result.state.textNodesReady, false); assert.ok(result.state.canvasLoadError); assert.equal(result.draft, result.protected.draft); }
      assert.equal(result.receipt, result.protected.receipt); return result;
    } finally { await f.close(); }
  });

  for (const key of ['projects', 'text']) await check('REAL_CANVAS_' + key.toUpperCase() + '_ERROR_NOT_EMPTY_SUCCESS', true, async () => {
    const f = await fixture({ [key]: 'reject' }); try {
      await f.page.evaluate(() => window.fixtureStart()); await f.page.waitForTimeout(150); const result = await saved(f.page);
      assert.equal(result.state.textNodesReady, baseline); assert.equal(!!result.state.canvasLoadError, !baseline);
      if (!baseline) { assert.equal(result.state.works, null); assert.equal(result.draft, result.protected.draft); }
      assert.equal(result.receipt, result.protected.receipt); return result;
    } finally { await f.close(); }
  });

  for (const key of ['projects', 'text']) for (const mode of ['denied', 'malformed', 'shape', 'body-hang']) await check('REAL_CANVAS_' + key.toUpperCase() + '_' + mode.toUpperCase().replaceAll('-', '_') + '_NOT_EMPTY_SUCCESS', true, async () => {
    const f = await fixture({ [key]: mode }); try {
      await f.page.evaluate(() => window.fixtureStart()); await f.page.waitForTimeout(mode === 'body-hang' ? 750 : 150); const result = await saved(f.page);
      assert.equal(result.state.textNodesReady, baseline && mode !== 'body-hang'); assert.equal(!!result.state.canvasLoadError, !baseline);
      if (!baseline) { assert.equal(result.state.works, null); assert.equal(result.draft, result.protected.draft); }
      assert.equal(result.receipt, result.protected.receipt); assert.equal(result.calls.mutations, 0); return result;
    } finally { await f.close(); }
  });

  await check('REAL_CANVAS_HEALTHY_INITIALIZATION_AND_TEXT_NORMALIZATION', false, async () => {
    const f = await fixture(); try {
      await f.page.evaluate(() => window.fixtureStart()); await f.page.waitForFunction(() => window.fixtureState.textNodesReady);
      const result = await saved(f.page); assert.equal(result.state.works[0].id, 'server-art'); assert.equal(result.state.names['tree:one'], 'Server project'); assert.equal(result.state.textNodes[0].width, 300); assert.deepEqual(result.state.textNodes[0].sourceIds, []); assert.equal(result.state.canvasLoadError, null); assert.equal(result.receipt, result.protected.receipt); return result;
    } finally { await f.close(); }
  });

  await check('REAL_CANVAS_EXPLICIT_NONPERSISTED_TEXT_USES_OLD_LOCAL_DRAFT', false, async () => {
    const f = await fixture({ text: 'legacy-local' }); try {
      await f.page.evaluate(() => window.fixtureStart()); await f.page.waitForFunction(() => window.fixtureState.textNodesReady);
      const result = await saved(f.page); assert.equal(result.state.textNodes[0].id, 'local-draft'); assert.equal(result.state.textNodes[0].content, 'unsaved prompt stays here'); return result;
    } finally { await f.close(); }
  });

  await check('REAL_CANVAS_NATIVE_NO_DATABASE_ACCOUNT_AND_LOCAL_TEXT_REMAIN_VALID', false, async () => {
    const f = await fixture({ account: 'native-local', text: 'legacy-local' }); try {
      await f.page.evaluate(() => window.fixtureStart()); await f.page.waitForFunction(() => window.fixtureState.textNodesReady);
      const result = await saved(f.page); assert.deepEqual(result.state.works, []); assert.equal(result.state.textNodes[0].id, 'local-draft'); assert.equal(result.state.canvasLoadError, null); assert.equal(result.receipt, result.protected.receipt); return result;
    } finally { await f.close(); }
  });

  for (const kind of ['works', 'workbench']) {
    await check('REAL_' + kind.toUpperCase() + '_STALE_CALLBACK_TIMEOUT_RETENTION', true, async () => {
      const f = await fixture(); try {
        await f.page.evaluate(kind => window.fixtureLibraryStart(kind, { mode: 'timeout-stale' }), kind); await f.page.waitForTimeout(50);
        const result = await f.page.evaluate(() => window.fixtureLibraryState), list = kind === 'works' ? result.works : result.recent;
        if (baseline) assert.deepEqual(list, []); else assert.equal(list[0].id, 'saved-library-art');
        if (kind === 'workbench') assert.deepEqual(result.stats, baseline ? { today: 0, total: 0 } : { today: 2, total: 7 });
        return { state: result, boundary: 'Exact caller effect; explicit onStale then TimeoutError read fixture' };
      } finally { await f.close(); }
    });
    await check('REAL_' + kind.toUpperCase() + '_NO_STALE_TIMEOUT_DOES_NOT_FABRICATE_LIBRARY', false, async () => {
      const f = await fixture(); try {
        await f.page.evaluate(kind => window.fixtureLibraryStart(kind, { mode: 'timeout-empty' }), kind); await f.page.waitForTimeout(50);
        const result = await f.page.evaluate(() => window.fixtureLibraryState); assert.deepEqual(kind === 'works' ? result.works : result.recent, []);
        if (kind === 'workbench') assert.deepEqual(result.stats, { today: 0, total: 0 }); return result;
      } finally { await f.close(); }
    });
    await check('REAL_' + kind.toUpperCase() + '_STALE_403_STILL_CLEARS_LIBRARY', false, async () => {
      const f = await fixture(); try {
        await f.page.evaluate(kind => window.fixtureLibraryStart(kind, { mode: 'error-stale' }), kind); await f.page.waitForTimeout(50);
        const result = await f.page.evaluate(() => window.fixtureLibraryState); assert.deepEqual(kind === 'works' ? result.works : result.recent, []);
        if (kind === 'workbench') assert.deepEqual(result.stats, { today: 0, total: 0 }); return result;
      } finally { await f.close(); }
    });
    await check('REAL_' + kind.toUpperCase() + '_CLEANUP_ACCOUNT_SWITCH_FENCES_OLD_RESULT', false, async () => {
      const f = await fixture(); try {
        await f.page.evaluate(({ kind, other }) => {
          window.fixtureLibraryStart(kind, { mode: 'late' }); const old = window.fixtureLibraryComplete; window.fixtureLibraryCleanup?.();
          window.fixtureLibraryStart(kind, { mode: 'success', email: other }); old({ artworks: [{ id: 'old-owner-art', image: '/old.png' }], stats: { today: 99, total: 99 } });
        }, { kind, other }); await f.page.waitForTimeout(50);
        const result = await f.page.evaluate(() => window.fixtureLibraryState); assert.equal((kind === 'works' ? result.works : result.recent)[0].id, 'new-owner-art');
        if (kind === 'workbench') assert.deepEqual(result.stats, { today: 1, total: 1 }); return result;
      } finally { await f.close(); }
    });
    await check('REAL_' + kind.toUpperCase() + '_CACHE_STALE_REVALIDATION_SUCCESS_UPDATES', false, async () => {
      const f = await fixture(); try {
        await f.page.evaluate(async kind => {
          await window.fixtureCacheRead(window.fixtureLibraryQuery(kind)); const now = Date.now; Date.now = () => now() + 31_000;
          window.fixtureFault.account = 'hang'; window.fixtureLibraryStart(kind);
        }, kind);
        await f.page.waitForFunction(kind => (kind === 'works' ? window.fixtureLibraryState.works : window.fixtureLibraryState.recent)?.[0]?.id === 'server-art', kind);
        await f.page.evaluate(() => window.fixtureResolve('account', { artworks: [{ id: 'new-server-art', image: '/new.png' }], stats: { today: 5, total: 12 } }));
        await f.page.waitForFunction(kind => (kind === 'works' ? window.fixtureLibraryState.works : window.fixtureLibraryState.recent)?.[0]?.id === 'new-server-art', kind);
        const result = await f.page.evaluate(() => window.fixtureLibraryState); if (kind === 'workbench') assert.deepEqual(result.stats, { today: 5, total: 12 }); return result;
      } finally { await f.close(); }
    });
    await check('REAL_' + kind.toUpperCase() + '_CACHE_ACTUAL_DEADLINE_RETAINS_STALE', false, async () => {
      const f = await fixture(); try {
        await f.page.evaluate(async kind => {
          await window.fixtureCacheRead(window.fixtureLibraryQuery(kind)); const now = Date.now; Date.now = () => now() + 31_000;
          window.fixtureFault.account = 'hang'; window.fixtureLibraryStart(kind);
        }, kind);
        await f.page.waitForFunction(kind => (kind === 'works' ? window.fixtureLibraryState.works : window.fixtureLibraryState.recent)?.[0]?.id === 'server-art', kind);
        await f.page.waitForTimeout(450); const result = await f.page.evaluate(() => ({ state: window.fixtureLibraryState, calls: window.fixtureCalls }));
        assert.equal((kind === 'works' ? result.state.works : result.state.recent)[0].id, 'server-art'); if (kind === 'workbench') assert.deepEqual(result.state.stats, { today: 2, total: 7 });
        assert.equal(result.calls.aborted, baseline ? 0 : 1); assert.equal(result.calls.account, 2); return { ...result, boundary: 'Real account cache aged31s, actual product read deadline; baseline remains pending' };
      } finally { await f.close(); }
    });
  }

  await check('REAL_CANVAS_CLEANUP_DOES_NOT_CANCEL_SHARED_ACCOUNT_SIBLING', false, async () => {
    const f = await fixture({ account: 'hang', projects: 'hang' }); try {
      await f.page.evaluate(() => { window.fixtureSibling = null; window.fixtureCacheRead().then(value => window.fixtureSibling = { kind: 'resolved', value }, error => window.fixtureSibling = { kind: 'rejected', name: error.name }); window.fixtureStart(); });
      await f.page.waitForFunction(() => window.fixtureCalls.account === 1 && window.fixtureCalls.projects === 1);
      await f.page.evaluate(() => { window.fixtureCleanup?.(); window.fixtureResolve('account', { artworks: [{ id: 'still-owned-by-sibling', status: 'completed' }] }); window.fixtureResolve('projects', { names: {} }); });
      await f.page.waitForFunction(() => window.fixtureSibling !== null); await f.page.waitForTimeout(50);
      const result = await f.page.evaluate(() => ({ sibling: window.fixtureSibling, state: window.fixtureState, calls: window.fixtureCalls }));
      assert.equal(result.sibling.kind, 'resolved'); assert.equal(result.sibling.value.artworks[0].id, 'still-owned-by-sibling'); assert.equal(result.state.works, null); assert.equal(result.state.textNodesReady, false); assert.equal(result.calls.account, 1);
      if (!baseline) assert.equal(result.calls.aborted, 1, 'only own project read aborts, shared account remains active'); return result;
    } finally { await f.close(); }
  });

  if (!baseline) await check('REAL_CANVAS_EXPLICIT_RETRY_RECOVERS_WITHOUT_CLEARING_DRAFTS', false, async () => {
    const f = await fixture({ account: 'hang' }); try {
      await f.page.evaluate(() => window.fixtureStart()); await f.page.waitForFunction(() => !!window.fixtureState.canvasLoadError);
      const before = await saved(f.page); assert.equal(before.draft, before.protected.draft);
      await f.page.evaluate(() => { window.fixtureFault.account = 'ok'; window.fixtureRetry(); });
      await f.page.waitForFunction(() => window.fixtureState.textNodesReady);
      const result = await saved(f.page); assert.equal(result.state.works[0].id, 'server-art'); assert.equal(result.state.canvasLoadError, null); assert.equal(result.receipt, result.protected.receipt); assert.equal(result.calls.account, 2); assert.equal(result.calls.mutations, 0); return result;
    } finally { await f.close(); }
  });

  if (!baseline) await check('READ_HELPER_CLEANUP_ABORT_AND_LATE_SETTLEMENT', false, async () => {
    const f = await fixture(); try {
      const result = await f.page.evaluate(async () => {
        const run = window.fixtureModules.withBrowserReadDeadline;
        const parent = new AbortController(); let adds = 0, removes = 0, lateAbort = 0, workCalls = 0;
        const add = parent.signal.addEventListener.bind(parent.signal), remove = parent.signal.removeEventListener.bind(parent.signal);
        parent.signal.addEventListener = (...args) => { adds++; return add(...args); };
        parent.signal.removeEventListener = (...args) => { removes++; return remove(...args); };
        const fast = await run(async signal => { signal.addEventListener('abort', () => lateAbort++); return 7; }, { timeoutMs: 35, signal: parent.signal });
        await new Promise(resolve => window.fixtureTimer(resolve, 60));
        const pre = new AbortController(); pre.abort();
        const preResult = await run(async () => { workCalls++; }, { timeoutMs: 35, signal: pre.signal }).then(() => 'resolved', e => e.name);
        const abort = new AbortController(); let release;
        const pending = run(() => new Promise(resolve => { release = resolve; }), { timeoutMs: 100, signal: abort.signal }).then(value => ({ kind: 'resolved', value }), e => ({ kind: 'rejected', name: e.name }));
        await Promise.resolve(); abort.abort(); const aborted = await pending; release(9); await Promise.resolve();
        const failure = await run(async () => { throw new Error('expected-read-failure'); }, { timeoutMs: 35 }).then(() => '', e => e.message);
        return { fast, adds, removes, lateAbort, workCalls, preResult, aborted, failure };
      });
      assert.equal(result.fast, 7); assert.equal(result.adds, result.removes); assert.equal(result.lateAbort, 0); assert.equal(result.workCalls, 0); assert.equal(result.preResult, 'AbortError'); assert.equal(result.aborted.kind, 'rejected'); assert.equal(result.aborted.name, 'AbortError'); assert.equal(result.failure, 'expected-read-failure'); return result;
    } finally { await f.close(); }
  });
  assert.deepEqual(external, []); assert.deepEqual(pageErrors, []);
  const pass = checks.every(x => x.pass); const label = baseline ? 'BASELINE_REPRODUCED' : 'PASS';
  const result = { status: pass ? label : 'FAIL', baseline, checks, pageErrors, external, loaded: [...loaded.values()], providerCalls: 0, generationPosts: 0,
    evidence: 'Real browser/IndexedDB/cache modules; actual AST-extracted Canvas effects. HTTP/auth/state commits are explicit fixtures, not a full deployed Canvas UI.' };
  fs.writeFileSync(path.join(outputRoot, 'RESULT.json'), JSON.stringify(result, null, 2));
  console.log(`CANVAS_STARTUP_DEADLINES=${pass ? label : 'FAIL'} CHECKS=${checks.length} DEFECTS=${checks.filter(x => x.defect).length} REAL_SOURCE=1 GENERATION_POSTS=0 PAGEERRORS=${pageErrors.length} EXIT=${pass ? 0 : 1}`);
  if (!pass) process.exitCode = 1;
}
main().catch(error => { console.error(error); fs.writeFileSync(path.join(outputRoot, 'FAILURE.txt'), String(error.stack || error)); process.exitCode = 1; })
  .finally(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
