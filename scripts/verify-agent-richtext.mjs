import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const temp = mkdtempSync(join(tmpdir(), 'naumi-richtext-test-'));
try {
  const outfile = join(temp, 'verify.cjs');
  await build({ entryPoints: ['scripts/verify-agent-richtext.tsx'], outfile, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.module.css': 'empty' }, logLevel: 'error' });
  const result = spawnSync(process.execPath, [outfile], { encoding: 'utf8' });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exitCode = result.status ?? 1;
} finally { rmSync(temp, { recursive: true, force: true }); }
