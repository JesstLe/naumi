// Actual AuthProvider + AdminClient + Edge. Only routing, HTTP, cache, auth SDK
// and the post-auth settings page are fixtures. No production or supplier I/O.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const esbuild = require('esbuild'), { chromium } = require('@playwright/test');
const args = process.argv.slice(2), arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const source = path.resolve(arg('--source-root', path.join(__dirname, '..')));
const out = path.resolve(arg('--output-root', 'output/browser-stability-goal-20261103/auth-admin/modified'));
const baseline = args.includes('--baseline'), blocked = args.includes('--blocked-baseline');
const dependencies = path.resolve(__dirname, '../node_modules');
const blockedSource = path.resolve(arg('--blocked-source', 'output/browser-stability-goal-20261103/auth/MODIFIED_FILE.tsx'));
const sourceHashes = [], checks = [], pageErrors = [], external = [];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let browser, server;
fs.mkdirSync(out, { recursive: true });

async function main() {
  const authBytes = fs.readFileSync(blocked ? blockedSource : path.join(source, 'src/lib/auth-context.tsx'));
  if (blocked) {
    assert(authBytes.includes(Buffer.from('bootstrapState')) && !authBytes.includes(Buffer.from('independentAccess')),
      'Blocked baseline must be the reviewed pre-fix bootstrap, not the original or final source');
    sourceHashes.push({ path: blockedSource, sha256: hash(authBytes), role: 'reviewed regression source' });
  }
  const stubs = {
    'next/navigation': `import {useSyncExternalStore} from 'react';
      const listeners=new Set();const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};
      export const usePathname=()=>useSyncExternalStore(subscribe,()=>window.fixturePath,()=>'/');
      window.fixtureNavigate=path=>{window.fixturePath=path;listeners.forEach(fn=>fn())};
      const router={replace:path=>window.fixtureNavigate(path)},params=new URLSearchParams('view=settings');
      export const useRouter=()=>router;export const useSearchParams=()=>params;`,
    '@/components/admin/center-shell': 'export const AdminCenterShell=({children})=>children;',
    '@/components/admin/admin-settings': 'export const AdminSettings=()=> <div data-testid="verified-admin-settings">Verified settings fixture</div>;',
    '@/lib/auth-modal-context': 'const fn=()=>{};export const useAuthModal=()=>({openAuth:fn});',
    '@/lib/supabase': 'export async function authHeader(){return {}};export function browserSupabase(){throw Error("unexpected Supabase")}',
    '@/lib/auth-mode': 'export const supabaseEnabled=false;',
    '@/lib/browser-data-cache': 'export function activateBrowserData(){};export function invalidateBrowserData(){};export function installBrowserDataObserver(){};',
    '@/lib/browser-image-cache': 'export function activateBrowserImages(){};export function clearBrowserImages(){};export function configureBrowserImageCache(){};',
    '@/components/ui/button': 'export function Button({variant,children,...props}){return <button {...props}>{children}</button>}',
    '@/components/ui/input': 'export function Input({error,...props}){return <input {...props}/>}',
    'lucide-react': 'export const Loader2=()=>null,ShieldAlert=()=>null,Lock=()=>null;',
  };
  const result = await esbuild.build({
    stdin: { contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
      import{AuthProvider,useAuth}from'@/lib/auth-context';import{AdminClient}from'@/components/admin/admin-client';import{usePathname}from'next/navigation';
      function Probe(){const auth=useAuth();const[draft,setDraft]=useState('retained recovery draft');window.auth=auth;
        window.authSnapshot={ready:auth.ready,user:auth.user?.email||null};
        return <div><input aria-label="Recovery draft" value={draft} onChange={e=>setDraft(e.target.value)}/>
          <button id="fixture-action" onClick={()=>window.fixtureActions++}>Fixture setup action</button></div>}
      function Route(){const pathname=usePathname();return <><Probe/>{(pathname==='/admin'||pathname.startsWith('/admin/'))&&<AdminClient/>}</>}
      createRoot(document.getElementById('root')).render(<AuthProvider><Route/></AuthProvider>);`,
      loader: 'tsx', resolveDir: source, sourcefile: 'auth-admin-review.tsx' },
    outfile: path.join(out, 'bundle.js'), bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', metafile: true,
    nodePaths: [dependencies], alias: { '@': path.join(source, 'src'), react: path.join(dependencies, 'react'), 'react-dom': path.join(dependencies, 'react-dom') },
    define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' },
    plugins: [{ name: 'explicit-fixtures', setup(build) {
      build.onResolve({ filter: /.*/ }, input => Object.hasOwn(stubs, input.path) ? { path: input.path, namespace: 'fixture' } : null);
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, input => ({ contents: stubs[input.path], loader: 'tsx', resolveDir: source }));
      if (blocked) build.onLoad({ filter: /[\\/]auth-context\.tsx$/ }, () => ({ contents: authBytes.toString(), loader: 'tsx', resolveDir: path.join(source, 'src/lib') }));
    } }],
  });
  for (const input of Object.keys(result.metafile.inputs)) {
    const file = path.resolve(input);
    if (input.includes('src/') && fs.existsSync(file) && !(blocked && /[\\/]auth-context\.tsx$/.test(file))) {
      sourceHashes.push({ path: file, sha256: hash(fs.readFileSync(file)) });
    }
  }
  server = http.createServer((req, res) => {
    res.setHeader('content-type', req.url === '/bundle.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/bundle.js' ? fs.readFileSync(path.join(out, 'bundle.js')) : '<html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  async function fixture(routePath, { denyLogin = false, configHang = false } = {}) {
    const context = await browser.newContext(), page = await context.newPage();
    page.setDefaultTimeout(1500);
    await context.addInitScript(({ routePath, denyLogin, configHang }) => {
      window.fixturePath = routePath; window.fixtureActions = 0; window.calls = []; window.repaired = false;
      localStorage.setItem('review:draft', 'unchanged fixture draft');
      const person = { email: 'review@fixture.test', name: 'review', creditsTotal: 100, creditsUsed: 0, plan: 'starter', joinedAt: '2026-01-01', renewsAt: '2027-01-01', invoices: [] };
      window.fixturePerson = person;
      const real = fetch, timer = setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...rest) => timer(fn, ms === 15000 ? 120 : ms, ...rest);
      window.fetch = async (input, init = {}) => {
        if (!String(input).startsWith('/api/')) return real(input, init);
        const method = init.method || 'GET'; window.calls.push({ url: String(input), method });
        const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
        if (input === '/api/config') {
          if (window.repaired) return response({ db: true, multiUser: true, authMode: 'mock' });
          if (configHang) return new Promise(() => {});
          return response({ error: 'model catalog unavailable fixture' }, 503);
        }
        if (input === '/api/admin/login') return method === 'POST'
          ? denyLogin ? response({ error: 'fixture rejected' }, 401) : response({ ok: true })
          : response({ localAvailable: true, localAuthed: false, passwordRequired: true });
        if (input === '/api/auth/session') return response({ user: person });
        throw Error('unexpected API ' + input + ' ' + method);
      };
    }, { routePath, denyLogin, configHang });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(origin + routePath); await page.waitForFunction(() => !!window.auth);
    await page.waitForTimeout(configHang ? 180 : 50);
    return { page, close: () => context.close() };
  }
  const snapshot = f => f.page.evaluate(() => ({ ...window.authSnapshot, calls: window.calls,
    actions: window.fixtureActions, inert: !!document.getElementById('fixture-action')?.closest('[inert]'),
    draft: document.querySelector('[aria-label="Recovery draft"]')?.value, rawDraft: localStorage.getItem('review:draft'),
    alert: document.querySelector('[role=alert]')?.textContent || null }));
  const posts = value => value.calls.filter(call => call.method === 'POST');
  async function check(name, defect, run) {
    try { checks.push({ name, defect, pass: true, detail: await run() }); }
    catch (error) { checks.push({ name, defect, pass: false, error: error.stack || String(error) }); }
    console.log('CHECK=' + name + ' ' + (checks.at(-1).pass ? 'PASS' : 'FAIL'));
  }
  for (const routePath of ['/admin', '/admin/center']) {
    await check('INDEPENDENT_ADMIN_LOGIN_' + routePath, true, async () => {
      const f = await fixture(routePath); try {
        await f.page.locator('input[type=password]').waitFor({ state: 'attached' });
        const before = await snapshot(f); assert.equal(posts(before).length, 0, 'No automatic admin mutation');
        assert.equal(before.inert, false, 'Product config outage must not block the independent administrator');
        if (!baseline) assert.equal(before.ready, false, 'UI exception must not invent a verified product session');
        await f.page.locator('input[type=password]').fill('local-only-fixture-password');
        await f.page.getByRole('button', { name: '登录', exact: true }).click();
        await f.page.getByTestId('verified-admin-settings').waitFor();
        const after = await snapshot(f); assert.equal(posts(after).length, 1); assert.equal(posts(after)[0].url, '/api/admin/login');
        assert.equal(after.rawDraft, 'unchanged fixture draft'); return { before, after };
      } finally { await f.close(); }
    });
  }
  await check('INDEPENDENT_SETUP_INTERACTION', true, async () => {
    const f = await fixture('/setup'); try {
      const before = await snapshot(f); assert.equal(before.inert, false);
      await f.page.getByRole('button', { name: 'Fixture setup action' }).click();
      const after = await snapshot(f); assert.equal(after.actions, 1); assert.equal(posts(after).length, 0);
      if (!baseline) assert.equal(after.ready, false); return after;
    } finally { await f.close(); }
  });
  if (!blocked) {
    await check('ADMIN_DENIAL_STILL_DENIES', false, async () => {
      const f = await fixture('/admin', { denyLogin: true }); try {
        await f.page.locator('input[type=password]').fill('rejected-fixture-password');
        await f.page.getByRole('button', { name: '登录', exact: true }).click();
        await f.page.getByText('fixture rejected', { exact: true }).waitFor();
        assert.equal(await f.page.getByTestId('verified-admin-settings').count(), 0);
        const after = await snapshot(f); assert.equal(posts(after).length, 1); return after;
      } finally { await f.close(); }
    });
  }
  if (!baseline) {
    for (const routePath of ['/canvas', '/adminish', '/setupish', '/setup/nested']) {
      await check('ORDINARY_ROUTE_STILL_BLOCKED_' + routePath, false, async () => {
        const f = await fixture(routePath); try {
          const before = await snapshot(f); assert.equal(before.ready, false); assert.equal(before.inert, true);
          await f.page.evaluate(() => document.getElementById('fixture-action').click());
          const after = await snapshot(f); assert.equal(after.actions, 0); assert.equal(posts(after).length, 0); return after;
        } finally { await f.close(); }
      });
    }
    if (!blocked) {
      await check('ADMIN_HUNG_CONFIG_RETAINS_READONLY_SESSION_RULES', false, async () => {
        const f = await fixture('/admin', { configHang: true }); try {
          assert.equal((await snapshot(f)).inert, false);
          await f.page.evaluate(() => window.auth.applyServerUser(window.fixturePerson, true));
          await f.page.waitForTimeout(180);
          const mutation = await f.page.evaluate(async () => ({ spend: window.auth.consumeCredits(7), plan: await window.auth.changePlan('pro') }));
          assert.deepEqual(mutation, { spend: false, plan: null });
          const after = await snapshot(f); assert.equal(after.ready, false); assert.equal(posts(after).length, 0); return { mutation, after };
        } finally { await f.close(); }
      });
      await check('MANUAL_REPAIR_THEN_BUSINESS_RECONNECT', false, async () => {
        const f = await fixture('/admin'); try {
          await f.page.locator('input[type=password]').fill('local-only-fixture-password');
          await f.page.getByRole('button', { name: '登录', exact: true }).click();
          await f.page.getByTestId('verified-admin-settings').waitFor();
          await f.page.getByRole('textbox', { name: 'Recovery draft' }).fill('edited recovery draft');
          await f.page.evaluate(() => { window.repaired = true; window.fixtureNavigate('/canvas'); });
          await f.page.getByRole('button', { name: '重新连接' }).click();
          await f.page.waitForFunction(() => window.authSnapshot?.ready);
          const after = await snapshot(f); assert.equal(after.ready, true); assert.equal(after.user, 'review@fixture.test');
          assert.equal(after.inert, false); assert.equal(after.draft, 'edited recovery draft'); assert.equal(after.rawDraft, 'unchanged fixture draft');
          assert.equal(posts(after).length, 1, 'Reconnect must not replay admin or account POST'); return after;
        } finally { await f.close(); }
      });
    }
  }
  assert.deepEqual(pageErrors, []); assert.deepEqual(external, []);
  assert(sourceHashes.every(row => hash(fs.readFileSync(row.path)) === row.sha256), 'Source must remain fixed throughout the run');
  const failures = checks.filter(check => !check.pass), defects = failures.filter(check => check.defect), controls = failures.filter(check => !check.defect);
  const status = blocked ? defects.length === 3 && controls.length === 0 ? 'REPRODUCED' : 'INVALID_BASELINE' : failures.length ? 'FAIL' : 'PASS';
  const exit = status === 'PASS' ? 0 : status === 'REPRODUCED' ? 1 : 2;
  fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify({ status, baseline, blockedBaseline: blocked, sourceHashes, checks, pageErrors, external,
    evidence: 'Actual AuthProvider and AdminClient in Edge; Next routing, HTTP, auth SDK/cache and post-auth settings are fixtures; setup uses interaction probe, not SetupClient', supplierCalls: 0, exit }, null, 2));
  console.log(`AUTH_BOOTSTRAP_ADMIN=${status} CHECKS=${checks.length} DEFECTS=${defects.length} CONTROL_FAILURES=${controls.length} ACTUAL_ADMIN_CLIENT=1 SUPPLIER_CALLS=0 EXIT=${exit}`);
  process.exitCode = exit;
}
main().catch(error => { console.error(error); process.exitCode = 2; }).finally(async () => {
  await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
