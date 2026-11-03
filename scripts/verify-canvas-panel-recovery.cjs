// Real production Next/Webpack chunk failure + source Canvas boundary/reference hook.
// The Canvas shell/panel/locale/workspace are explicit fixtures, not full App E2E.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process'), { createHash } = require('node:crypto');
const { chromium, expect } = require('@playwright/test');
const argv = process.argv.slice(2), arg = (key, fallback) => argv.includes(key) ? argv[argv.indexOf(key) + 1] : fallback;
const root = path.resolve(arg('--source-root', path.join(__dirname, '..')));
const out = path.resolve(arg('--output-root', 'output/canvas-panel-recovery-20261103/' + (argv.includes('--baseline') ? 'baseline' : 'modified')));
const baseline = argv.includes('--baseline'), dependencies = path.resolve(__dirname, '../node_modules');
const app = path.join(out, 'next-fixture'), sourceHashes = [], checks = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let server, browser;
fs.mkdirSync(app, { recursive: true });
function write(name, text) { const file = path.join(app, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
function copy(source, target = source) { const bytes = fs.readFileSync(path.join(root, source)); sourceHashes.push({ source, sha256: hash(bytes) }); write(target, bytes); }
function env() { return Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|temp|tmp|appdata|localappdata|userprofile|comspec|pathext)$/i.test(key)).concat([['NEXT_TELEMETRY_DISABLED', '1'], ['NODE_ENV', 'production']])); }
async function command(args, logName) {
  const child = spawn(process.execPath, [path.join(dependencies, 'next/dist/bin/next'), ...args], { cwd: app, env: env(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', data => log += data); child.stderr.on('data', data => log += data);
  const timeout = setTimeout(() => child.kill(), 180000);
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }); clearTimeout(timeout);
  fs.writeFileSync(path.join(out, logName), log); assert.equal(code, 0, log); return log;
}
async function main() {
  const canvasSource = fs.readFileSync(path.join(root, 'src/components/canvas/canvas-client.tsx'), 'utf8');
  sourceHashes.push({ source: 'src/components/canvas/canvas-client.tsx', sha256: hash(canvasSource) });
  const declarations = [...canvasSource.matchAll(/^const (\w+) = (?:dynamic|recoverablePanel)\(/gm)].map(match => match[1]);
  assert.deepEqual(declarations, ['AssistantRichText', 'ImageCropDialog', 'CharacterEditor', 'TimelineEditor', 'AudioEditor', 'SceneEditor', 'DirectorEditor', 'NodePropertiesPanel', 'AnnotateEditorModal', 'CanvasComfyDialog', 'TemplatesClient', 'CreditPacks', 'PayQrModal', 'AccountClient', 'SecurityClient', 'GenerateClient', 'CheckoutClient']);
  assert.equal([...canvasSource.matchAll(baseline ? /= dynamic\(/g : /= recoverablePanel\(/g)].length, 17, 'Fixture must match the selected source implementation');
  const nextVersion = require(path.join(dependencies, 'next/package.json')).version;
  const reactVersion = require(path.join(dependencies, 'react/package.json')).version;
  write('package.json', JSON.stringify({ name: 'canvas-panel-recovery-fixture', private: true, version: '1.0.0', dependencies: { next: nextVersion, react: reactVersion, 'react-dom': reactVersion } }));
  if (!fs.existsSync(path.join(app, 'node_modules'))) fs.symlinkSync(dependencies, path.join(app, 'node_modules'), 'junction');
  write('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'es2017', lib: ['dom', 'esnext'], module: 'esnext', moduleResolution: 'bundler', jsx: 'preserve', strict: true, skipLibCheck: true, noEmit: true, esModuleInterop: true, paths: { '@/*': ['./src/*'] } }, include: ['**/*.ts', '**/*.tsx', '.next/types/**/*.ts'], exclude: ['node_modules'] }));
  write('next.config.mjs', 'export default {experimental:{cpus:1},generateBuildId:async()=>"panel-' + (baseline ? 'baseline' : 'modified') + '"};');
  copy('src/components/canvas/canvas-error-boundary.tsx');
  copy('src/components/canvas/use-image-reference-draft.ts');
  copy('src/lib/canvas/image-reference-drafts.ts');
  copy('src/lib/browser-crypto.ts');
  if (!baseline) copy('src/components/canvas/recoverable-panel.tsx');
  write('src/lib/i18n/locale-context.tsx', '"use client";export function useI18n(){return {locale:"zh"};}');
  write('src/lib/saas/workspace-client.ts', 'export const WORKSPACE_SELECTION="fixture-workspace";export const currentWorkspace=()=>"personal";');
  write('src/app/layout.tsx', 'export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}');
  write('src/app/canvas/page.tsx', 'import {CanvasErrorBoundary} from "@/components/canvas/canvas-error-boundary";import Fixture from "../fixture";export default function Page(){return <CanvasErrorBoundary><Fixture/></CanvasErrorBoundary>}');
  write('src/app/desktop/canvas/page.tsx', 'export {default} from "../../canvas/page";');
  write('src/app/ssr-visible/page.tsx', 'import {SsrVisible} from "../fixture";export default function Page(){return <SsrVisible/>}');
  write('src/app/lazy-panel.tsx', '"use client";export function TestPanel({title,onClose,open}:{title:string;onClose?:()=>void;open?:boolean}){return open===false?null:<section data-testid="loaded-panel">RECOVERY_REAL_CHUNK_V1 {title}<button onClick={onClose}>Close loaded</button></section>}export default TestPanel;');
  write('src/app/fixture.tsx', `"use client";
import {useEffect,useRef,useState} from 'react';
${baseline ? "import panelFactory from 'next/dynamic';" : "import {recoverablePanel as panelFactory} from '@/components/canvas/recoverable-panel';"}
import {useImageReferenceDraft} from '@/components/canvas/use-image-reference-draft';
const load=()=>{(window as any).loaderAttempts++;return import('./lazy-panel').then(module=>module.TestPanel);};
const loading=()=> <span role="status">Fixture loading</span>;
const Panel=panelFactory(load,{${baseline ? 'ssr:false,' : ''}loading});
const DefaultPanel=panelFactory(()=>import('./lazy-panel'),{${baseline ? 'ssr:false,' : ''}loading});
const KeepMountedPanel=panelFactory(load,{${baseline ? 'ssr:false,' : ''}loading});
const OptionalPanel=panelFactory(async()=>function Optional({gridClass}:{gridClass?:string}={}){return <div className={gridClass}/>;},{${baseline ? 'ssr:false,' : ''}loading});
export function SsrVisible(){return <><Panel title="server-only-loading"/><OptionalPanel gridClass="typed-optional-prop"/></>;}
export default function Fixture(){
  const [prompt,setPrompt]=useState('initial'),[open,setOpen]=useState(false),[mode,setMode]=useState('close'),[keepMounted,setKeepMounted]=useState(false),[keepOpen,setKeepOpen]=useState(false);
  const owner=useRef(''),refs=useImageReferenceDraft('fixture-node','fixture-owner');
  useEffect(()=>{owner.current=crypto.randomUUID();(window as any).parentMarker=owner.current;return()=>{(window as any).parentUnmounts++;};},[]);
  useEffect(()=>{(window as any).readDraft=async()=>({prompt,files:await Promise.all(refs.files.map(async file=>({name:file.name,body:await file.text()}))),taskId:'original-accepted-task',operationId:'original-operation'});},[prompt,refs.files]);
  return <main data-testid="canvas-parent"><textarea aria-label="Draft" value={prompt} onChange={e=>setPrompt(e.target.value)}/><button onClick={()=>refs.add([new File(['draft-file-bytes'],'reference.png',{type:'image/png'})])}>Add reference</button><output data-testid="refs">{refs.files.length}</output><button onClick={()=>{setMode('close');setOpen(true);}}>Open panel</button><button onClick={()=>{setMode('inline');setOpen(true);}}>Open inline</button><button onClick={()=>{setMode('default');setOpen(true);}}>Open default</button><button onClick={()=>setKeepMounted(true)}>Mount hidden</button><button onClick={()=>setKeepOpen(true)}>Show mounted</button>{keepMounted&&<KeepMountedPanel title="keep-mounted" open={keepOpen} onClose={()=>{(window as any).closeCalls++;setKeepOpen(false);}}/>}{open&&(mode==='default'?<DefaultPanel title="default-export" onClose={()=>setOpen(false)}/>:<Panel title="named-export" {...(mode==='close'?{onClose:()=>{(window as any).closeCalls++;setOpen(false);}}:{})}/>)}</main>;
}`);
  await command(['build'], 'build.log');
  const chunks = [];
  function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, entry.name); if (entry.isDirectory()) walk(p); else if (p.endsWith('.js') && fs.readFileSync(p, 'utf8').includes('RECOVERY_REAL_CHUNK_V1')) chunks.push(p); } }
  walk(path.join(app, '.next/static/chunks'));
  assert.equal(chunks.length, 1, 'Expected exactly one real lazy chunk');
  const chunkUrl = '/_next/' + path.relative(path.join(app, '.next'), chunks[0]).replaceAll('\\', '/');
  const chunkSha256 = hash(fs.readFileSync(chunks[0]));
  server = spawn(process.execPath, [path.join(dependencies, 'next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '0'], { cwd: app, env: env(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '', origin; server.stdout.on('data', data => { log += data; const match = log.match(/http:\/\/127\.0\.0\.1:(\d+)/); if (match) origin = match[0]; }); server.stderr.on('data', data => log += data);
  await expect.poll(() => origin, { timeout: 20000 }).toBeTruthy();
  await expect.poll(async () => { try { return (await fetch(origin + '/canvas')).status; } catch { return 0; } }, { timeout: 20000 }).toBe(200);
  const ssr = await fetch(origin + '/ssr-visible').then(response => response.text());
  assert(ssr.includes('Fixture loading')); assert(!ssr.includes('<section data-testid="loaded-panel"'));
  checks.push({ name: 'SSR_FALSE_LOADING_ONLY_OPTIONAL_PROPS_TYPECHECKED', pass: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  async function fixture(routePath, failures) {
    const context = await browser.newContext(), page = await context.newPage();
    const record = { chunkRequests: 0, generationPosts: 0, nonGet: [], external: [], errors: [], navigations: 0 };
    page.on('pageerror', error => record.errors.push(error.message));
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) record.navigations++; });
    await context.addInitScript(() => { window.loaderAttempts = 0; window.parentUnmounts = 0; window.closeCalls = 0; window.revokedUrls = []; const revoke = URL.revokeObjectURL; URL.revokeObjectURL = url => { window.revokedUrls.push(url); revoke.call(URL, url); }; });
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname !== '127.0.0.1') { record.external.push(request.url()); return route.abort(); }
      if (request.method() !== 'GET') record.nonGet.push({ url: request.url(), method: request.method() });
      if (/generate|imagegen|billing/.test(url.pathname) && request.method() === 'POST') record.generationPosts++;
      if (url.pathname === chunkUrl) { record.chunkRequests++; if (record.chunkRequests <= failures) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'fixture missing lazy chunk' }); }
      return route.continue();
    });
    await page.goto(origin + routePath);
    await page.getByRole('textbox', { name: 'Draft' }).fill('unsaved prompt kept');
    await page.getByRole('button', { name: 'Add reference', exact: true }).click();
    await expect(page.getByTestId('refs')).toHaveText('1');
    const before = await page.evaluate(async () => ({ marker: window.parentMarker, draft: await window.readDraft() }));
    return { page, context, record, before, initialNavigations: record.navigations };
  }
  async function preserved(f) {
    assert.deepEqual(await f.page.evaluate(async () => ({ marker: window.parentMarker, draft: await window.readDraft() })), f.before);
    assert.equal(await f.page.evaluate(() => window.parentUnmounts), 0);
    assert.equal(await f.page.evaluate(() => window.revokedUrls.length), 0);
    assert.equal(f.record.navigations, f.initialNavigations); assert.equal(f.record.generationPosts, 0); assert.deepEqual(f.record.nonGet, []); assert.deepEqual(f.record.external, []);
  }
  if (baseline) {
    const f = await fixture('/canvas', 1);
    try {
      await f.page.getByRole('button', { name: 'Open panel', exact: true }).click();
      await expect(f.page.getByText('画布出错了', { exact: true })).toBeVisible();
      await expect(f.page.getByTestId('canvas-parent')).toHaveCount(0);
      assert.equal(await f.page.evaluate(() => window.parentUnmounts), 1);
      assert.equal(await f.page.evaluate(() => window.revokedUrls.length), 1);
      await f.page.getByRole('button', { name: '重试', exact: true }).click();
      await expect(f.page.getByTestId('canvas-parent')).toBeVisible();
      await expect(f.page.getByTestId('refs')).toHaveText('0');
      await f.page.getByRole('button', { name: 'Open panel', exact: true }).click();
      await expect(f.page.getByText('画布出错了', { exact: true })).toBeVisible();
      assert.equal(f.record.chunkRequests, 1); assert.equal(await f.page.evaluate(() => window.loaderAttempts), 1);
      checks.push({ name: 'BASELINE_REAL_CHUNK_FAILURE_UNMOUNTS_CANVAS_DROPS_FILE_AND_RETRY_REUSES_REJECTION', pass: true, ...f.record });
    } finally { await f.context.close(); }
  } else {
    for (const routePath of ['/canvas', '/desktop/canvas']) {
      const f = await fixture(routePath, 1);
      try {
        await f.page.getByRole('button', { name: 'Open panel', exact: true }).click();
        await expect(f.page.getByRole('button', { name: '重试', exact: true })).toBeVisible();
        await expect(f.page.getByText('画布出错了', { exact: true })).toHaveCount(0);
        await preserved(f); assert.equal(f.record.chunkRequests, 1);
        await f.page.getByRole('button', { name: '重试', exact: true }).click();
        await expect(f.page.getByTestId('loaded-panel')).toContainText('named-export');
        assert.equal(f.record.chunkRequests, 2); assert.equal(await f.page.evaluate(() => window.loaderAttempts), 2);
        await preserved(f);
        await f.page.getByRole('button', { name: 'Close loaded', exact: true }).click();
        await f.page.getByRole('button', { name: 'Open default', exact: true }).click();
        await expect(f.page.getByTestId('loaded-panel')).toContainText('default-export');
        await preserved(f);
        checks.push({ name: 'REAL_CHUNK_RETRY_PRESERVES_PARENT_FILES_TASK_ID_' + routePath, pass: true, ...f.record });
      } finally { await f.context.close(); }
    }
    for (const inline of [false, true]) {
      const f = await fixture('/canvas', 100);
      try {
        await f.page.getByRole('button', { name: inline ? 'Open inline' : 'Open panel', exact: true }).click();
        await expect(f.page.getByRole('button', { name: '重试', exact: true })).toBeVisible();
        await preserved(f);
        await f.page.getByRole('button', { name: '重试', exact: true }).click();
        await expect.poll(() => f.record.chunkRequests).toBe(2);
        await expect(f.page.getByRole('button', { name: '重试', exact: true })).toBeVisible();
        await f.page.waitForTimeout(250); assert.equal(f.record.chunkRequests, 2);
        await f.page.getByRole('button', { name: '关闭', exact: true }).click();
        await expect(f.page.getByRole('button', { name: '重试', exact: true })).toHaveCount(0);
        assert.equal(await f.page.evaluate(() => window.closeCalls), inline ? 0 : 1);
        await preserved(f); checks.push({ name: 'PERSISTENT_CHUNK_FAILURE_BOUNDED_CLOSE_' + (inline ? 'INLINE' : 'CALLBACK'), pass: true, ...f.record });
      } finally { await f.context.close(); }
    }
    const f = await fixture('/canvas', 100);
    try {
      await f.page.getByRole('button', { name: 'Mount hidden', exact: true }).click();
      await expect.poll(() => f.record.chunkRequests).toBe(1);
      await f.page.waitForTimeout(150);
      await expect(f.page.getByRole('button', { name: '重试', exact: true })).toHaveCount(0);
      await f.page.getByRole('button', { name: 'Show mounted', exact: true }).click();
      await expect(f.page.getByRole('button', { name: '重试', exact: true })).toBeVisible();
      await f.page.getByRole('button', { name: '关闭', exact: true }).click();
      await expect(f.page.getByRole('button', { name: '重试', exact: true })).toHaveCount(0);
      await f.page.getByRole('button', { name: 'Show mounted', exact: true }).click();
      await expect(f.page.getByRole('button', { name: '重试', exact: true })).toBeVisible();
      assert.equal(f.record.chunkRequests, 1);
      await f.page.getByRole('button', { name: '重试', exact: true }).click();
      await expect.poll(() => f.record.chunkRequests).toBe(2);
      await preserved(f); checks.push({ name: 'KEPT_MOUNTED_OPEN_FALSE_ERROR_HIDDEN_REOPEN_EXPLICIT_RETRY', pass: true, ...f.record });
    } finally { await f.context.close(); }
  }
  fs.writeFileSync(path.join(out, 'server.log'), log);
  fs.writeFileSync(path.join(out, 'RESULT.json'), JSON.stringify({ result: 'PASS', baseline, evidence: 'Production Next/Webpack lazy chunk + actual source boundary/reference hook; Canvas shell/panel/locale/workspace fixtures', nextVersion, reactVersion, sourceHashes, chunkUrl, chunkSha256, checks, supplierCalls: 0 }, null, 2));
  console.log(`${baseline ? 'BASELINE_EXPECTED_BUG' : 'MODIFIED_PANEL_RECOVERY'}=PASS REAL_PRODUCTION_WEBPACK_CHUNK=YES CASES=${checks.length} SUPPLIER_CALLS=0`);
}
main().catch(error => { fs.writeFileSync(path.join(out, 'FAILURE.txt'), String(error.stack || error)); console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (server) server.kill(); });
