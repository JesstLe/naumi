import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await build({ entryPoints: [fileURLToPath(new URL('./src/server.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('./dist/service.mjs', import.meta.url)),
  bundle: true, platform: 'node', target: 'node24', format: 'esm', external: ['pg'] });
await copyFile(new URL('./migrations/001-workflow.sql', import.meta.url), new URL('./dist/001-workflow.sql', import.meta.url));
await copyFile(new URL('./migrations/002-scheduling.sql', import.meta.url), new URL('./dist/002-scheduling.sql', import.meta.url));
await copyFile(new URL('./migrations/004-source-identity.sql', import.meta.url), new URL('./dist/004-source-identity.sql', import.meta.url));
console.log('BUILD_PASS: independent service factory; no Next.js or provider credentials');
