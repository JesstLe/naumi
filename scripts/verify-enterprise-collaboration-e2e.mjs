import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, rename, access } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import pg from 'pg';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { runBrowser } from './verify-enterprise-collaboration-e2e.browser.mjs';

const root = process.cwd(), phase = process.argv[2] || 'MODIFIED';
const source = path.resolve(process.argv[3] || root);
const out = path.join(root, 'output/enterprise-collaboration-e2e', phase);
if (await access(path.join(out, 'RESULT.json')).then(() => true, () => false)) await rename(out, `${out}-attempt-${Date.now()}`);
await mkdir(out, { recursive: true });
const label = `collab-e2e-${randomUUID()}`; let container = '', child, exit = 1, stdout = '', stderr = '', browserResult;
const log = s => { stdout += s + '\n'; console.log(s); };
function docker(args) { const r = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true }); if (r.status !== 0) throw Error(r.stderr); return r.stdout.trim(); }
const paths = ['src/lib/collaboration/contracts.ts', 'src/lib/collaboration/service.ts', 'src/app/api/collaboration/conversations/[id]/route.ts', 'src/components/canvas/canvas-client.tsx', 'src/components/collaboration/collaboration-client.ts', 'src/components/collaboration/collaboration-window.tsx', 'src/components/collaboration/chat-thread.tsx', 'src/components/collaboration/collaboration-entry.tsx'];
const overlay = { name: 'fixed-source-overlay', setup(b) { if (source !== root) b.onLoad({ filter: /\.(ts|tsx)$/ }, async args => { const rel = path.relative(root, args.path).replaceAll('\\', '/'); if (!paths.includes(rel)) return; return { contents: await readFile(path.join(source, rel), 'utf8'), loader: rel.endsWith('tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) }; }); } };
try {
  const stubs = {
    'next/navigation': `import {useSyncExternalStore} from 'react';const subscribe=f=>{window.addEventListener('popstate',f);return()=>window.removeEventListener('popstate',f)};const router={push:p=>window.__route(p),replace:p=>window.__route(p),refresh:()=>location.reload(),back:()=>history.back(),prefetch:()=>{}};const loc=()=>useSyncExternalStore(subscribe,()=>location.href);export const useRouter=()=>router;export const usePathname=()=>new URL(loc()).pathname;export const useSearchParams=()=>new URL(loc()).searchParams;`,
    'next/link': `import React from 'react';export default function Link({href,children,onClick,prefetch,replace,scroll,...rest}){return <a {...rest} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented&&!e.ctrlKey&&!e.metaKey){e.preventDefault();window.__route(href)}}}>{children}</a>}`,
    'next/image': `import React from 'react';export default function Image({fill,priority,unoptimized,quality,loader,...props}){return <img {...props} style={{...(fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:{}),...props.style}}/>}`,
    'next/dynamic': `import React,{lazy,Suspense} from 'react';export default function dynamic(load,opts){const C=lazy(async()=>{const m=await load();return m.default?m:{default:m}});return props=><Suspense fallback={null}><C {...props}/></Suspense>}`,
  };
  const product = await build({ entryPoints: ['scripts/verify-enterprise-collaboration-e2e.entry.tsx'], outdir: out, entryNames: 'app', bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', write: true, metafile: true, define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_DESKTOP_DEPLOYMENT': '"1"', 'process.env': '{}' }, plugins: [overlay, { name: 'next-navigation-only', setup(b) { b.onResolve({ filter: /^next\// }, args => stubs[args.path] ? { path: args.path, namespace: 'framework' } : undefined); b.onLoad({ filter: /.*/, namespace: 'framework' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: root })); } }] });
  if (!Object.keys(product.metafile.inputs).some(p => p.endsWith('components/canvas/canvas-client.tsx'))) throw Error('Full CanvasClient missing');
  await writeFile(path.join(out, 'browser-build.json'), JSON.stringify({ source, frameworkAdapters: Object.keys(stubs), inputs: Object.keys(product.metafile.inputs), sha256: createHash('sha256').update(await readFile(path.join(out, 'app.js'))).digest('hex') }, null, 2));
  const css = await postcss([tailwind('./tailwind.config.ts')]).process(await readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' });
  await writeFile(path.join(out, 'globals.css'), css.css);
  await build({ entryPoints: ['scripts/verify-enterprise-collaboration-e2e.server.ts'], outfile: path.join(out, 'server.cjs'), bundle: true, packages: 'external', platform: 'node', format: 'cjs', target: 'node24', conditions: ['react-server'], logLevel: 'warning', plugins: [overlay, { name: 'official-lucide-esm', setup(b) { b.onResolve({ filter: /^lucide-react$/ }, () => ({ path: path.join(root, 'node_modules/lucide-react/dist/esm/lucide-react.js') })); } }] });
  container = docker(['run', '-d', '--memory=256m', '--cpus=1', '--label', `naumi.fixture=${label}`, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=isolated-fixture', '-e', 'POSTGRES_DB=collab_e2e', 'postgres:16-alpine', '-c', 'shared_buffers=32MB', '-c', 'max_connections=30']);
  const inspect = JSON.parse(docker(['inspect', container]))[0];
  if (inspect.Config.Labels['naumi.fixture'] !== label || inspect.HostConfig.Memory !== 268435456 || inspect.HostConfig.NanoCpus !== 1000000000) throw Error('Fixture resource mismatch');
  const port = inspect.NetworkSettings.Ports['5432/tcp'][0].HostPort, url = `postgres://postgres:isolated-fixture@127.0.0.1:${port}/collab_e2e?sslmode=disable`;
  let ready = false;
  for (let n = 0; n < 80; n++) { const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1000 }); try { await c.connect(); ready = (await c.query('SELECT 1 n')).rows[0].n === 1; } catch {} finally { await c.end().catch(() => {}); } if (ready) break; await new Promise(r => setTimeout(r, 250)); }
  if (!ready) throw Error('TCP SELECT1 failed'); log('PG_READY=TCP_SELECT1 memory=268435456 cpus=1');
  const keep = /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|COMMONPROGRAMFILES|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i;
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => keep.test(k)));
  Object.assign(env, { DATABASE_URL: url, SETTINGS_SECRET: randomUUID() + randomUUID(), STORAGE_DRIVER: 'local', MEDIA_PRIVATE: '1', MEDIA_DIR: path.join(out, 'media'), NAUMI_ENTERPRISE_DEPLOYMENT_MODE: 'shared', PGPOOL_MAX: '5', NAUMI_DB_POOL_BUDGET: '15', NAUMI_MULTI_USER: '1', COLLABORATION_CHUNK_BYTES: '65536', COLLABORATION_PRESENCE_TTL_MS: '15000', E2E_OUT: out });
  child = spawn(process.execPath, ['--conditions=react-server', path.join(out, 'server.cjs')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  child.stdout.on('data', b => { stdout += b; process.stdout.write(b); }); child.stderr.on('data', b => { stderr += b; process.stderr.write(b); });
  const info = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Server readiness timeout')), 150000); child.once('error', reject); child.once('exit', code => { clearTimeout(timer); reject(Error(`Server exit ${code}`)); }); child.on('message', m => { if (m.type === 'ready') { clearTimeout(timer); resolve(m); } }); });
  browserResult = await runBrowser({ ...info, out, phase, log }); exit = 0;
} catch (e) { stderr += `${e.stack || e}\n`; console.error(e); }
finally {
  if (child && child.exitCode === null) { child.send({ type: 'close' }); await new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 15000); child.once('exit', () => { clearTimeout(timer); resolve(); }); }); }
  if (container) { const i = JSON.parse(docker(['inspect', container]))[0]; if (i.Config.Labels['naumi.fixture'] !== label) throw Error('Cleanup ownership mismatch'); docker(['stop', '--timeout', '10', container]); docker(['rm', '-v', container]); if (docker(['ps', '-aq', '--filter', `label=naumi.fixture=${label}`])) throw Error('Fixture remains'); log('FIXTURE_CLEANUP=PASS remaining=0'); }
  await writeFile(path.join(out, 'RESULT.json'), JSON.stringify({ phase, command: ['node', 'scripts/verify-enterprise-collaboration-e2e.mjs', phase, ...(source !== root ? [source] : [])], input: 'synthetic ordinary employee password login; real signed sessions/PG/native routes/private storage/full CanvasClient; isolated supplier catalogue stub', stdout, stderr, exit, label, container, browserResult }, null, 2));
}
process.exitCode = exit;
