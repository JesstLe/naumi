/* Isolated controller: one owned 256 MiB / 1 CPU PostgreSQL, random loopback port,
 * exact label/ID cleanup in finally. No production env files or external providers. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(process.argv[2] || process.cwd());
const req = createRequire(path.join(process.cwd(), 'package.json'));
const output = path.resolve(process.cwd(), 'output/enterprise-collaboration-server');
fs.mkdirSync(output, { recursive: true });
function command(exe, args, options = {}) {
  const r = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, ...options });
  if (r.status !== 0) throw new Error(`${exe} ${args[0]} exit=${r.status}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
async function main() {
  const targets = ['src/lib/enterprise/collaboration-access.ts', 'src/lib/collaboration/service.ts', 'src/lib/collaboration/uploads.ts', 'src/app/api/collaboration/bootstrap/route.ts'];
  if (targets.some(p => !fs.existsSync(path.join(root, p)))) {
    console.log('COLLABORATION_BASELINE=MISSING_FEATURE routes=0 implementation=0'); process.exitCode = 2; return;
  }
  const build = path.join(output, 'verify-bundle.cjs');
  // Only the OTHER, parallel module is replaced, explicitly and fail-closed. Identity,
  // schema, SQL, routes, local storage, HTTP, SSE, and production helpers remain real.
  const sharePort = `export async function validateShareForMessageTx(tx,actor,enterprise,members,shareId){
    const r=(await tx.query('SELECT * FROM fixture_share_port WHERE id=$1',[shareId])).rows[0];
    if(!r||r.enterprise_id!==enterprise||!members.includes(r.author_id)||!members.includes(r.requester_id)||members.length!==2||![r.author_id,r.requester_id].includes(actor))
      throw Object.assign(new Error('fixture external share port denied'),{status:403});
  }`;
  await req('esbuild').build({ entryPoints: [path.join(root, 'scripts/verify-enterprise-collaboration-server.ts')], outfile: build,
    bundle: true, packages: 'external', platform: 'node', format: 'cjs', target: 'node24', conditions: ['react-server'],
    nodePaths: [path.join(process.cwd(), 'node_modules')], tsconfig: path.join(root, 'tsconfig.json'),
    plugins: [{ name: 'explicit-other-module-port', setup(b) {
      // The shared dependency's CJS entry is mislabelled type=module; bundle its
      // published ESM entry without editing shared node_modules or stubbing icons.
      b.onResolve({ filter: /^lucide-react$/ }, () => ({ path: path.join(path.dirname(req.resolve('lucide-react/package.json')), 'dist/esm/lucide-react.js') }));
      b.onResolve({ filter: /^@\/lib\/canvas-sharing\/service$/ }, () => ({ path: 'fixture-share-port', namespace: 'fixture-share-port' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture-share-port' }, () => ({ contents: sharePort, loader: 'ts' }));
    } }], logLevel: 'warning' });
  const label = `collaboration-${randomUUID()}`; let container, readiness;
  try {
    container = command('docker', ['run', '-d', '--memory=256m', '--cpus=1', '--label', `naumi.fixture=${label}`,
      '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=isolated-collaboration-fixture', '-e', 'POSTGRES_DB=collaboration_fixture',
      'postgres:16-alpine', '-c', 'shared_buffers=32MB', '-c', 'max_connections=50']);
    const info = JSON.parse(command('docker', ['inspect', container]))[0];
    if (info.Config.Labels['naumi.fixture'] !== label || info.HostConfig.Memory !== 268435456 || info.HostConfig.NanoCpus !== 1000000000) throw Error('Fixture ownership/budget mismatch');
    const port = Number(info.NetworkSettings.Ports['5432/tcp'][0].HostPort);
    const connectionString = `postgres://postgres:isolated-collaboration-fixture@127.0.0.1:${port}/collaboration_fixture?sslmode=disable`;
    for (let n = 0; n < 60; n++) {
      const client = new (req('pg').Client)({ connectionString, connectionTimeoutMillis: 1000 });
      try { await client.connect(); await client.query('SELECT 1'); readiness = true; break; }
      catch { await new Promise(r => setTimeout(r, 300)); } finally { await client.end().catch(() => {}); }
    }
    if (!readiness) throw Error('TCP SELECT 1 readiness failed');
    console.log('FIXTURE=READY memory=268435456 cpus=1 TCP_SELECT_1=PASS');
    const env = { ...process.env, DATABASE_URL: connectionString, SETTINGS_SECRET: randomUUID() + randomUUID(),
      STORAGE_DRIVER: 'local', MEDIA_DIR: path.join(output, label, 'media'), MEDIA_PRIVATE: '0',
      COLLABORATION_CHUNK_BYTES: '65536', COLLABORATION_ATTACHMENT_BYTES: '10485760',
      NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', NAUMI_ENTERPRISE_DEPLOYMENT_MODE: 'shared',
      NAUMI_ENTERPRISE_ALLOWED_IDS: '', NAUMI_AUTH_LOGIN_ONLY: '', FLEET_PORTAL_ONLY: '',
      PGPOOL_MAX: '5', NAUMI_DB_POOL_BUDGET: '15', NAUMI_VERIFY_COLLABORATION: '1', NAUMI_VERIFY_ROOT: root };
    const status = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--conditions=react-server', build], { env, stdio: 'inherit', windowsHide: true });
      child.once('error', reject); child.once('exit', resolve);
    });
    process.exitCode = status === 0 ? 0 : 1;
  } finally {
    if (container) {
      const info = JSON.parse(command('docker', ['inspect', container]))[0];
      if (info.Config.Labels['naumi.fixture'] !== label) throw Error('Refusing mismatched fixture cleanup');
      command('docker', ['stop', '--timeout', '10', container]); command('docker', ['rm', container]);
      const remaining = command('docker', ['ps', '-aq', '--filter', `label=naumi.fixture=${label}`]);
      if (remaining) throw Error('Owned fixture still exists');
      console.log('FIXTURE_CLEANUP=PASS remaining=0');
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
