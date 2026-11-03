import { spawnSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import pg from 'pg';

const root = process.cwd(), phase = process.argv[2] || 'MODIFIED', overlay = process.argv[3] ? path.resolve(process.argv[3]) : null;
const out = path.join(root, 'output/enterprise-collaboration-review-fixes-20261102', phase);
await mkdir(out, { recursive: true });
const label = `collaboration-integration-${randomUUID()}`; let container = '', exit = 1, stdout = '', stderr = '';
function command(args) { const r = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true }); if (r.status !== 0) throw Error(`docker ${args[0]}: ${r.stderr}`); return r.stdout.trim(); }
const sourcePaths = ['src/lib/collaboration/service.ts','src/lib/collaboration/events.ts','src/lib/collaboration/uploads.ts'];
try {
  await build({ entryPoints: ['scripts/verify-enterprise-collaboration-review-fixes.ts'], outfile: path.join(out, 'suite.cjs'), bundle: true, packages: 'external', platform: 'node', format: 'cjs', target: 'node24', conditions: ['react-server'], logLevel: 'warning', plugins: [{ name: 'real-modules-no-auth-sharing-stubs', setup(b) {
    b.onResolve({ filter: /^lucide-react$/ }, () => ({ path: path.join(root, 'node_modules/lucide-react/dist/esm/lucide-react.js') }));
    if (overlay) b.onLoad({ filter: /\.ts$/ }, async args => { const rel = path.relative(root, args.path).replaceAll('\\', '/'); if (!sourcePaths.includes(rel)) return;
      if (!(await access(path.join(overlay, rel)).then(() => true, () => false))) return;
      return { contents: await readFile(path.join(overlay, rel), 'utf8'), loader: 'ts', resolveDir: path.dirname(args.path) }; });
  } }] });
  container = command(['run', '-d', '--memory=256m', '--cpus=1', '--label', `naumi.fixture=${label}`, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=isolated-fixture', '-e', 'POSTGRES_DB=collaboration_fixture', 'postgres:16-alpine', '-c', 'shared_buffers=32MB', '-c', 'max_connections=30']);
  const inspect = JSON.parse(command(['inspect', container]))[0];
  if (inspect.Config.Labels['naumi.fixture'] !== label || inspect.HostConfig.Memory !== 268435456 || inspect.HostConfig.NanoCpus !== 1000000000) throw Error('Fixture ownership/resources mismatch');
  const port = inspect.NetworkSettings.Ports['5432/tcp'][0].HostPort, url = `postgres://postgres:isolated-fixture@127.0.0.1:${port}/collaboration_fixture?sslmode=disable`;
  let ready = false;
  for (let n = 0; n < 60; n++) { const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1000 }); try { await c.connect(); ready = (await c.query('SELECT 1 AS n')).rows[0].n === 1; } catch {} finally { await c.end().catch(() => {}); } if (ready) break; await new Promise(r => setTimeout(r, 250)); }
  if (!ready) throw Error('Fixture TCP SELECT1 readiness failed');
  const keep = /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|COMMONPROGRAMFILES|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i;
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => keep.test(k)));
  const poolMax = process.env.VERIFY_COLLAB_POOL_MAX || '5'; if (!/^[1-5]$/.test(poolMax)) throw Error('Test pool maximum must be 1..5');
  Object.assign(env, { DATABASE_URL: url, SETTINGS_SECRET: randomUUID() + randomUUID(), STORAGE_DRIVER: 'local', MEDIA_PRIVATE: '1', MEDIA_DIR: path.join(out, 'media'),
    NAUMI_ENTERPRISE_DEPLOYMENT_MODE: 'shared', PGPOOL_MAX: poolMax, NAUMI_DB_POOL_BUDGET: '15', NAUMI_COLLAB_INTEGRATION: '1', NAUMI_VERIFY_COLLABORATION: '1', COLLAB_EXPECT_FIXED: phase.startsWith('BASELINE') || phase.startsWith('ROLLBACK') ? '0' : '1', COLLABORATION_CHUNK_BYTES: '65536', COLLABORATION_ATTACHMENT_BYTES: '10485760' });
  exit = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--conditions=react-server', path.join(out, 'suite.cjs')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', b => { stdout += b; process.stdout.write(b); }); child.stderr.on('data', b => { stderr += b; process.stderr.write(b); });
    const timer = setTimeout(() => { child.kill(); }, 180000); child.once('error', e => { clearTimeout(timer); reject(e); }); child.once('exit', code => { clearTimeout(timer); resolve(code ?? 1); });
  });
} catch (e) { stderr += `${e.stack || e}\n`; console.error(e); }
finally {
  if (container) { const inspect = JSON.parse(command(['inspect', container]))[0]; if (inspect.Config.Labels['naumi.fixture'] !== label) throw Error('Cleanup ownership mismatch');
    command(['stop', '--timeout', '10', container]); command(['rm', '-v', container]); if (command(['ps', '-aq', '--filter', `label=naumi.fixture=${label}`])) throw Error('Fixture remains');
    stdout += 'FIXTURE_CLEANUP=PASS remaining=0\n'; console.log('FIXTURE_CLEANUP=PASS remaining=0');
  }
  await writeFile(path.join(out, 'RESULT.json'), JSON.stringify({ phase, command: [process.execPath, ...process.argv.slice(1)], input: 'local synthetic signed-cookie enterprise accounts; real PG/native routes/private storage; no auth/share stubs', stdout, stderr, exit, label, container }, null, 2));
}
process.exitCode = exit;
