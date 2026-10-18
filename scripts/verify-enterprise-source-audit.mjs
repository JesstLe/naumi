import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const name = 'naumi-source-audit-' + randomBytes(6).toString('hex'), password = randomBytes(24).toString('hex');
const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let started = false;
try {
  docker(['run', '-d', '--name', name, '--label', 'naumi.fixture=source-audit', '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=source_audit', '-p', '127.0.0.1::5432', 'postgres:16-alpine']); started = true;
  let ready = false;
  for (let i = 0; i < 40; i++) { try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); ready = true; break; } catch { await new Promise(r => setTimeout(r, 500)); } }
  if (!ready) throw new Error('FIXTURE_DATABASE_NOT_READY');
  const port = docker(['port', name, '5432/tcp']).split(':').at(-1);
  execFileSync(process.execPath, ['--test', 'scripts/tests/enterprise-source-audit.test.mjs'], { stdio: 'inherit', timeout: 60000, env: { ...process.env, SOURCE_AUDIT_TEST_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/source_audit` } });
  console.log('SOURCE_AUDIT_VERIFY_PASS: real_pg=1 readonly_enforced=1 tenant_pinned=1 no_auto_bindings=1 no_raw_secrets=1');
} catch { console.error('SOURCE_AUDIT_VERIFY_FAILED'); process.exitCode = 1; }
finally { if (started) { docker(['rm', '-f', name]); console.log('SOURCE_AUDIT_FIXTURE_CLEANUP_PASS: only_this_container=1'); } }
