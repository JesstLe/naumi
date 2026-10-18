import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { sourceSite, inspectSource, probeSource, SourceAuditError } from './lib/enterprise-source-audit.mjs';

try {
  const [mode, ...args] = process.argv.slice(2), options = {};
  if (!['plan', 'inspect', 'probe'].includes(mode) || args.length !== 4) throw new SourceAuditError('USAGE_plan_inspect_probe_--site_FILE_--output_NEW_DIRECTORY');
  for (let i = 0; i < args.length; i += 2) {
    if (!['--site', '--output'].includes(args[i]) || options[args[i]] || !args[i + 1]) throw new SourceAuditError('ARGUMENT_INVALID');
    options[args[i]] = args[i + 1];
  }
  if (!options['--site'] || !options['--output']) throw new SourceAuditError('ARGUMENT_INVALID');
  const stat = await lstat(options['--site']);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw new SourceAuditError('SITE_FILE_INVALID');
  const raw = JSON.parse(await readFile(options['--site'], 'utf8')), site = sourceSite(raw), output = resolve(options['--output']);
  // Exclusive creation prevents overwriting an earlier audited snapshot or following an existing output symlink.
  await mkdir(output, { mode: 0o700 });
  if (process.platform === 'win32') {
    const sid = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { encoding: 'utf8', windowsHide: true }).trim();
    if (!/^S-1-5-\d+(?:-\d+)+$/.test(sid)) throw new SourceAuditError('OUTPUT_ACL_IDENTITY_INVALID');
    execFileSync('icacls.exe', [output, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { stdio: 'pipe', windowsHide: true });
  }
  let result;
  if (mode === 'plan') result = { version: 1, site, databaseInspected: false, employeeReady: false, sourceWrites: 0 };
  if (mode === 'probe') result = await probeSource(raw);
  if (mode === 'inspect') {
    if (!process.env.DATABASE_URL) throw new SourceAuditError('SOURCE_DATABASE_ENV_REQUIRED');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, application_name: 'enterprise-source-readonly-audit' });
    try {
      const inspected = await inspectSource(pool, raw, process.env); result = inspected.summary;
      await writeFile(join(output, 'IDENTITY_REVIEW.private.json'), JSON.stringify(inspected.roster, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    } finally { await pool.end(); }
  }
  await writeFile(join(output, 'SUMMARY.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`SOURCE_AUDIT_${mode.toUpperCase()}_PASS: source_writes=0 employee_ready=false`);
} catch (e) {
  // pg/network/fs errors may contain credentials, hostnames, or SQL values; never log them.
  console.error(e instanceof SourceAuditError ? e.message : 'SOURCE_AUDIT_FAILED'); process.exitCode = 1;
}
