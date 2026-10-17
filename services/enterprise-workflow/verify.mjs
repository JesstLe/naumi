import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const name = `naumi-workflow-fixture-${randomBytes(6).toString('hex')}`;
const password = randomBytes(24).toString('hex');
const here = fileURLToPath(new URL('.', import.meta.url));
const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let started = false;
try {
  docker(['run', '-d', '--name', name, '--label', 'naumi.fixture=enterprise-workflow', '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=workflow_fixture', '-p', '127.0.0.1::5432', 'postgres:16-alpine']);
  started = true;
  let ready = false;
  for (let n = 0; n < 40; n++) {
    // The image's temporary init server accepts Unix sockets before its final TCP server starts.
    try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); ready = true; break; }
    catch { await new Promise(r => setTimeout(r, 500)); }
  }
  if (!ready) throw new Error('POSTGRES_FIXTURE_NOT_READY');
  const port = docker(['port', name, '5432/tcp']).split(':').at(-1);
  docker(['exec', name, 'createdb', '-U', 'postgres', 'scheduling_fixture']);
  docker(['exec', name, 'createdb', '-U', 'postgres', 'identity_fixture']);
  const cli = fileURLToPath(import.meta.resolve('tsx/cli'));
  execFileSync(process.execPath, [cli, '--test', 'tests/domain.test.ts', 'tests/postgres.test.ts', 'tests/scheduling.test.ts', 'tests/source-identity.test.ts'], {
    cwd: here, stdio: 'inherit', timeout: 90000,
    env: { ...process.env, WORKFLOW_TEST_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/workflow_fixture`,
      WORKFLOW_SCHEDULING_TEST_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/scheduling_fixture`, WORKFLOW_IDENTITY_TEST_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/identity_fixture` },
  });
  console.log('VERIFY_PASS: domain + isolated PostgreSQL + HTTP; production untouched');
} catch (e) { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }
finally {
  if (started) { docker(['rm', '-f', name]); console.log('FIXTURE_CLEANUP_PASS: only this run container removed'); }
}
