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
await copyFile(new URL('./migrations/003-source-import.sql', import.meta.url), new URL('./dist/003-source-import.sql', import.meta.url));
await copyFile(new URL('./migrations/005-people-mapping.sql', import.meta.url), new URL('./dist/005-people-mapping.sql', import.meta.url));
await copyFile(new URL('./migrations/006-source-intake.sql', import.meta.url), new URL('./dist/006-source-intake.sql', import.meta.url));
console.log('BUILD_PASS: independent service factory; no Next.js or provider credentials');

await copyFile(new URL('./migrations/007-workspace-labels.sql', import.meta.url), new URL('./dist/007-workspace-labels.sql', import.meta.url));

await copyFile(new URL('./migrations/008-delivery-assets.sql', import.meta.url), new URL('./dist/008-delivery-assets.sql', import.meta.url));

await copyFile(new URL('./migrations/009-performance.sql', import.meta.url), new URL('./dist/009-performance.sql', import.meta.url));

await copyFile(new URL('./migrations/010-routing.sql', import.meta.url), new URL('./dist/010-routing.sql', import.meta.url));

await copyFile(new URL('./migrations/011-notifications.sql', import.meta.url), new URL('./dist/011-notifications.sql', import.meta.url));
await build({entryPoints:[fileURLToPath(new URL('./tools/notification-worker.ts',import.meta.url))],outfile:fileURLToPath(new URL('./dist/notification-worker.mjs',import.meta.url)),bundle:true,platform:'node',target:'node24',format:'esm',external:['pg']});
