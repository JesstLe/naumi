/** Actual workbench route + Harness; auth/persistence/Agent engine are explicit
 * in-memory fixtures. No database, supplier, production env or Next server. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createServer } = require('node:http');
const { getEventListeners } = require('node:events');
const { randomUUID } = require('node:crypto');
const { build } = require('esbuild');

const root = process.cwd();
const option = name => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
const variant = path.resolve(option('--variant-root') || root);
const out = path.resolve(option('--out') || 'output/agent-streams-20261029/test');
fs.mkdirSync(out, { recursive: true });
const ownedFiles = new Set(['src/app/api/agent/route.ts', 'src/lib/agent/harness.ts', 'src/lib/agent/markdown-images.ts']);
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(?:PATH|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|SYSTEMDRIVE|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)));
const fixture = 'agent-stream-' + randomUUID();
let failures = 0;
function check(ok, name, facts) { console.log(JSON.stringify({ check: name, pass: !!ok, ...facts })); if (!ok) failures++; }

async function bundle(entry, name, mocks = false) {
  const file = path.join(out, name + '.cjs');
  await build({ entryPoints: [path.resolve(entry)], outfile: file, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', conditions: ['react-server'], plugins: [{ name: 'isolated-agent', setup(b) {
    b.onLoad({ filter: /\.(?:ts|tsx)$/ }, async args => {
      const rel = path.relative(root, args.path).replaceAll('\\', '/');
      if (ownedFiles.has(rel)) return { contents: fs.readFileSync(path.join(variant, rel), 'utf8'), loader: 'ts', resolveDir: path.dirname(args.path) };
    });
    if (!mocks) return;
    const stubs = {
      'next/server': 'export const NextResponse=Response;',
      '@/lib/release-runtime/http': 'export const observeReleaseRequest=(r,f)=>f();export const routeAgentToOwner=async()=>null;',
      '@/lib/release-runtime/identity': 'export const releaseRuntimeEnabled=()=>false;export const releaseError=()=>Response.json({}, {status:500});',
      '@/lib/agent/legacy-runtime': 'export const forwardLegacyAgentSession=async()=>null;',
      '@/lib/image-skills/server': 'export const resolveImageSkill=async()=>null;',
      '@/lib/image-skills/catalog': 'export class SkillError extends Error {}',
      '@/lib/bi/model-observer': 'export const withBiRequest=(r,f)=>f();',
      '@/lib/admin-auth': 'export const resolveUserEmail=async r=>r.headers.get("x-fixture-owner");',
      '@/lib/db': 'export const dbEnabled=true;',
      '@/lib/rate-limit': 'export const rateLimit=()=>true;',
      '@/lib/settings': 'export const getOpenAISettings=async()=>({apiKey:"fixture-local-not-a-credential"});',
      '@/lib/text-models': 'export const requestedTextModel=()=>"fixture";',
      '@/lib/agent/runtime': `const f=globalThis.__agentStreamFixture;export const MODEL_ID='fixture';
        export const getOrCreateSession=(email,id)=>f.create(email,id);export const getSession=(email,id)=>f.sessions.get(email+':'+id);
        export const persistAgentSession=s=>f.persist(s);export const appendSessionEvent=(s,type,data)=>s.events.push({type,data,at:Date.now()});
        export const agentVisionEnabled=()=>false;export const resolveVisionImages=async()=>[];export const markVisionUnsupported=()=>false;
        export const primeAgentSystemPrompt=()=>{if(f.primeError)throw Error('fixture-prime-failure');};export const refreshSessionCredentials=()=>{};`,
    };
    b.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'stub' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'js' }));
  } }] });
  return file;
}

function makeFixture() {
  const f = { sessions: new Map(), beforePersist: undefined, primeError: false,
    create(email, id) {
      const key = email + ':' + id;
      if (f.sessions.has(key)) return f.sessions.get(key);
      const s = { id, email, title: '', running: false, events: [], calls: 0, aborts: 0, acceptedTools: 0, saved: [], pending: [], harness: { sanitize: x => x },
        agent: { state: { messages: [] }, prompt(message) {
          s.calls++; s.acceptedTools++; s.agent.state.messages.push({ role: 'user', content: message });
          return new Promise((resolve, reject) => s.pending.push({ resolve, reject }));
        }, abort() { s.aborts++; }, steer() {} },
        settle(error) {
          const pending = s.pending.splice(0);
          if (!error) s.agent.state.messages.push({ role: 'assistant', content: [{ type: 'text', text: 'fixture reply ' + id }], stopReason: 'stop' });
          for (const p of pending) error ? p.reject(error) : p.resolve();
        },
      };
      f.sessions.set(key, s); return s;
    },
    async persist(s) { if (f.beforePersist) { const hook = f.beforePersist; f.beforePersist = undefined; await hook(); } s.saved.push({ running: s.running, messages: structuredClone(s.agent.state.messages) }); },
  };
  return f;
}
const microtasks = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const request = (id, signal, owner = 'owner@fixture.test') => new Request('http://fixture.invalid/api/agent', { method: 'PUT', signal, headers: { 'content-type': 'application/json', 'x-fixture-owner': owner }, body: JSON.stringify({ sessionId: id, message: '保留原文「报价后确认」和 [商品图] /media/reference.png' }) });

async function routeTests(file, f) {
  const api = require(file);
  const real = { setInterval, clearInterval, setTimeout, clearTimeout };
  const timers = new Map(); let next = 0;
  global.setInterval = (fn, ms) => { const id = ++next; timers.set(id, { fn, ms, interval: true }); return id; };
  global.setTimeout = (fn, ms) => { const id = ++next; timers.set(id, { fn, ms, interval: false }); return id; };
  global.clearInterval = global.clearTimeout = id => timers.delete(id);
  const tick = async () => { for (const [id, t] of [...timers]) if (t.interval && timers.has(id)) t.fn(); await microtasks(); };
  const counts = () => ({ intervals: [...timers.values()].filter(t => t.interval).length, timers: timers.size });
  const state = id => f.sessions.get('owner@fixture.test:' + id);
  try {
    // Abort after async first save, before start() subscribes: the signal is
    // already aborted, so addEventListener alone will never invoke its callback.
    const ac = new AbortController(), req = request('ag-preabort', ac.signal);
    f.beforePersist = () => ac.abort();
    const response = await api.PUT(req), s = state('ag-preabort');
    check(s.calls === 0 && !s.running && timers.size === 0, 'already-aborted-after-persist', { status: response.status, promptCalls: s.calls, running: s.running, listeners: getEventListeners(req.signal, 'abort').length, ...counts() });
    if (s.calls) { await response.body.cancel(); s.settle(); await microtasks(); }

    const signal = new AbortController(), req2 = request('ag-cancel', signal.signal), res2 = await api.PUT(req2), old = state('ag-cancel');
    check(counts().intervals === 1, 'single-700ms-pump', { ...counts(), periods: [...timers.values()].filter(t => t.interval).map(t => t.ms) });
    await res2.body.cancel();
    const retry = await api.PUT(request('ag-cancel'));
    check(old.running && old.calls === 1 && retry.status === 409, 'cancel-retains-run-ownership-until-settlement', { retryStatus: retry.status, promptCalls: old.calls, acceptedTools: old.acceptedTools, running: old.running, abortCalls: old.aborts });
    if (retry.status === 200) await retry.body.cancel();
    check(timers.size === 0 && !old.onDelta && getEventListeners(req2.signal, 'abort').length === 0, 'cancel-releases-transport', { ...counts(), callback: !!old.onDelta, listeners: getEventListeners(req2.signal, 'abort').length });
    old.settle(new Error('fixture aborted after accepted tool settled')); await microtasks();
    check(!old.running && old.saved.at(-1).running === false, 'cancelled-run-finally-persists-idle', { running: old.running, persistedRunning: old.saved.at(-1).running });
    const resumed = await api.PUT(request('ag-cancel')); old.settle(); await microtasks(); await tick();
    check(resumed.status === 200 && (await resumed.text()).includes('event: final'), 'explicit-next-turn-after-settlement', { status: resumed.status, promptCalls: old.calls });

    const abortA = new AbortController(), aReq = request('ag-isolate', abortA.signal), a = await api.PUT(aReq);
    const b = await api.PUT(request('ag-isolate', undefined, 'other@fixture.test'));
    const one = state('ag-isolate'), two = f.sessions.get('other@fixture.test:ag-isolate');
    const subscriber = await api.PUT(request('ag-isolate'));
    const polls = await Promise.all([0, 1, 2].map(() => api.GET(new Request('http://fixture.invalid/api/agent?sessionId=ag-isolate&since=0', { headers: { 'x-fixture-owner': 'owner@fixture.test' } }))));
    abortA.abort(); await a.text();
    check(subscriber.status === 409 && one.calls === 1 && polls.every(p => p.status === 200) && two.aborts === 0 && !!two.onDelta, 'multiple-observers-and-owner-isolation', { secondPUT: subscriber.status, promptCalls: one.calls, GETs: polls.length, otherAborts: two.aborts, otherCallback: !!two.onDelta });
    one.settle(new Error('fixture abort')); two.settle(); await microtasks(); await tick();
    check((await b.text()).includes('fixture reply ag-isolate') && timers.size === 0 && getEventListeners(aReq.signal, 'abort').length === 0, 'abort-and-other-success-release', counts());

    const errReq = request('ag-error'), err = await api.PUT(errReq), failing = state('ag-error');
    failing.settle(new Error('fixture model failure')); await microtasks(); await tick();
    check((await err.text()).includes('event: error') && timers.size === 0 && !failing.onDelta && !failing.running, 'failure-releases-all', { ...counts(), running: failing.running });
    const successReq = request('ag-success'), success = await api.PUT(successReq), successSession = state('ag-success');
    successSession.onDelta('中文流'); successSession.settle(); await microtasks(); await tick();
    const wire = await success.text();
    check(wire.includes('event: delta') && wire.includes('event: final') && timers.size === 0 && getEventListeners(successReq.signal, 'abort').length === 0, 'success-exact-wire-and-release', { bytes: Buffer.byteLength(wire), ...counts() });

    const timeoutReq = request('ag-timeout'), timeoutResponse = await api.PUT(timeoutReq), timed = state('ag-timeout');
    const deadline = [...timers.values()].find(t => !t.interval && t.ms === 780000);
    assert(deadline); deadline.fn();
    check(timed.aborts === 1 && timed.running, 'unchanged-deadline-awaits-settlement', { deadlineMs: deadline.ms, aborts: timed.aborts, running: timed.running });
    timed.settle(new Error('fixture deadline')); await microtasks(); await tick(); await timeoutResponse.text();

    // A native controller can error while a producer still holds onDelta.
    // Merely setting closed=true used to make subsequent cancel skip cleanup.
    const NativeStream = global.ReadableStream; let producer;
    global.ReadableStream = class extends NativeStream { constructor(source, strategy) { super({ ...source, start(controller) { producer = controller; return source.start?.(controller); } }, strategy); } };
    let broken;
    try { broken = await api.PUT(request('ag-enqueue')); } finally { global.ReadableStream = NativeStream; }
    const brokenSession = state('ag-enqueue');
    producer.error(new Error('fixture transport failure')); brokenSession.onDelta('late delta');
    await broken.text().catch(() => {});
    check(timers.size === 0 && !brokenSession.onDelta && brokenSession.aborts === 1, 'enqueue-error-releases-immediately', { ...counts(), aborts: brokenSession.aborts, callback: !!brokenSession.onDelta });
    brokenSession.settle(new Error('producer settled')); await microtasks(); await tick();

    f.primeError = true; let setupResponse, setupError;
    try { setupResponse = await api.PUT(request('ag-setup-error')); } catch (error) { setupError = error.message; }
    await microtasks(); await tick();
    const setup = state('ag-setup-error');
    check(!setup.running && timers.size === 0 && !setup.onDelta && setup.calls === 0, 'synchronous-setup-error-releases', { ...counts(), running: setup.running, callback: !!setup.onDelta, promptCalls: setup.calls, thrown: setupError });
    if (setupResponse) await setupResponse.text();
    // Dispose baseline's intentionally reproduced failed-start fixture too.
    timers.clear(); setup.onDelta = undefined; f.primeError = false;
  } finally { Object.assign(global, real); }
  return api;
}

async function httpTest(api, f) {
  let responses = 0, aborted = 0, wireBytes = 0;
  const server = createServer(async (incoming, outgoing) => {
    const ac = new AbortController();
    outgoing.on('close', () => { if (!outgoing.writableEnded) { aborted++; ac.abort(); } });
    const result = await api.PUT(request('ag-http', ac.signal));
    outgoing.writeHead(result.status, { 'content-type': 'text/event-stream' });
    const reader = result.body.getReader();
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; wireBytes += value.length; outgoing.write(value); } }
    finally { reader.releaseLock(); responses++; outgoing.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const ac = new AbortController(), res = await fetch(`http://127.0.0.1:${port}`, { signal: ac.signal });
    const reader = res.body.getReader(); await reader.read(); ac.abort(); await reader.cancel().catch(() => {}); reader.releaseLock();
    for (let i = 0; i < 100 && responses === 0; i++) await new Promise(resolve => setTimeout(resolve, 5));
    const s = f.sessions.get('owner@fixture.test:ag-http');
    const observed = await api.GET(new Request('http://fixture.invalid/api/agent?sessionId=ag-http&since=0', { headers: { 'x-fixture-owner': 'owner@fixture.test' } }));
    const state = await observed.json();
    check(aborted === 1 && responses === 1 && s.aborts === 1 && state.running && s.calls === 1 && !s.onDelta, 'real-http-disconnect-and-GET-reconnect', { port, wireBytes, transportClosed: responses, aborts: s.aborts, running: state.running, promptCalls: s.calls });
    s.settle(new Error('HTTP cancelled orchestration settled')); await microtasks();
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  check(!server.listening, 'owned-http-resource-closed', { listening: server.listening });
}

async function markdownTests() {
  const file = await bundle('src/lib/agent/harness.ts', 'harness');
  const worker = path.join(out, 'markdown-worker.cjs');
  fs.writeFileSync(worker, `const {AgentHarness,PublicOutputBuffer}=require(${JSON.stringify(file)});const h=new AgentHarness('owner@fixture.test','ag-markdown');const n=Number(process.argv[2]);const text='!['.repeat(n/2);const t=performance.now();let output='';const b=new PublicOutputBuffer(h,x=>output+=x);b.push(text);b.finish();if(output!==text)throw Error('changed text');console.log(JSON.stringify({inputBytes:n,outputBytes:Buffer.byteLength(output),ms:Math.round((performance.now()-t)*100)/100}));`);
  for (const bytes of [16384, 65536, 196608]) {
    const r = spawnSync(process.execPath, [worker, String(bytes)], { encoding: 'utf8', env: cleanEnv, timeout: 3000 });
    check(r.status === 0, 'bounded-actual-output-buffer-' + bytes, { input: '"![".repeat(' + bytes / 2 + ')', exit: r.status, signal: r.signal, error: r.error?.code, stdout: r.stdout.trim() });
  }
  const { AgentHarness } = require(file), h = new AgentHarness('owner@fixture.test', 'ag-differential');
  const { agentMediaUrl } = require(await bundle('src/lib/agent/media-policy.ts', 'media-policy'));
  const baseline = text => text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt, url) => agentMediaUrl(url) ? full : `[${alt || '图片'}]`).replace(/!\[([^\]]*)\]\[[^\]]*\]/g, (_full, alt) => `[${alt || '图片'}]`);
  const samples = ['![a](/media/a.png)', '![a](https://outside.invalid/a.png)', '![]()', '![][ref]', '![a![b](x)', '![a](x ![b](y)', '![a]wrong![b](x)', '![a](![b][ref])', '保留 “原文”\n\n![商品图](/media/a.png)'];
  let seed = 169029;
  const parts = ['![', ']', '[', '(', ')', 'x', '\n', '中文', '/media/a.png', 'https://outside.invalid/x', ' '];
  for (let i = 0; i < 12000; i++) { let text = ''; for (let j = 0; j < 12; j++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; text += parts[seed % parts.length]; } samples.push(text); }
  let mismatch = 0;
  for (const text of samples) if (h.publicText(text, false) !== baseline(text)) { mismatch++; if (mismatch < 3) console.log(JSON.stringify({ text, actual: h.publicText(text, false), expected: baseline(text) })); }
  check(!mismatch, 'markdown-original-contract-differential', { seed: 169029, samples: samples.length, mismatch });
}

(async () => {
  // Never inherit application env/credentials into the actual Harness constructor.
  for (const key of Object.keys(process.env)) if (!(key in cleanEnv)) delete process.env[key];
  console.log(JSON.stringify({ fixture, variant, input: 'fixed session controls; output <= existing 192KiB limit', evidence: 'actual route/Harness; stub auth, persistence, Agent engine; native local HTTP; no PG or supplier' }));
  const f = global.__agentStreamFixture = makeFixture();
  const file = await bundle('src/app/api/agent/route.ts', 'route', true);
  const api = await routeTests(file, f);
  await httpTest(api, f);
  await markdownTests();
  console.log(`CAPACITY_AGENT_STREAMS failures=${failures} SUPPLIER_CALLS=0 DB_CALLS=0 OWNED_SERVERS=0`);
  process.exitCode = failures ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
