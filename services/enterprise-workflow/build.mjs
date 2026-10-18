import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const {execFileSync:checkRosterEmbed}=await import('node:child_process');
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-people-roster.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-reference-assets.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-batch-recovery.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-calendar.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-delivery-scan.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-multipart.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-dashboard.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-asset-library.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-availability.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-corrections.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-plan-move.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-catalog.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-forms.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-demand-batch.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-demand-assets.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-worklogs.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-reviews.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-sla.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-capacity.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-appeals.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-projects.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-guidelines.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-publications.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-publication-files.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-preflight.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-changes.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
checkRosterEmbed(process.execPath,[fileURLToPath(new URL('../../scripts/build-handover-materials.mjs',import.meta.url)),'--check'],{stdio:'inherit'});
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await build({absWorkingDir:fileURLToPath(new URL('.',import.meta.url)), entryPoints: [fileURLToPath(new URL('./src/server.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('./dist/service.mjs', import.meta.url)),
  bundle: true, platform: 'node', target: 'node24', format: 'esm', external: ['pg','sharp'] });
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
await build({absWorkingDir:fileURLToPath(new URL('.',import.meta.url)),entryPoints:[fileURLToPath(new URL('./tools/notification-worker.ts',import.meta.url))],outfile:fileURLToPath(new URL('./dist/notification-worker.mjs',import.meta.url)),bundle:true,platform:'node',target:'node24',format:'esm',external:['pg','sharp']});

// Complete deployable runtime, fixed product artifact and self-verifying bundle metadata.
await build({absWorkingDir:fileURLToPath(new URL('.',import.meta.url)),entryPoints:[fileURLToPath(new URL('./tools/runtime.ts',import.meta.url))],outfile:fileURLToPath(new URL('./dist/runtime.mjs',import.meta.url)),bundle:true,platform:'node',target:'node24',format:'esm',external:['pg','sharp']});
const {readFile,writeFile,readdir}=await import('node:fs/promises'),{createHash}=await import('node:crypto'),{execFileSync}=await import('node:child_process'),{resolve}=await import('node:path');
const hash=b=>createHash('sha256').update(b).digest('hex'),canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}':JSON.stringify(v);
const directory=new URL('./dist/',import.meta.url),migrationNames=(await readdir(new URL('./migrations/',import.meta.url))).filter(f=>/^\d{3}-[a-z0-9-]+\.sql$/.test(f)).sort();
for(const file of migrationNames)await copyFile(new URL('./migrations/'+file,import.meta.url),new URL(file,directory));
await copyFile(new URL('../../design/enterprise-demo/preview.html',import.meta.url),new URL('product.html',directory));
await copyFile(new URL('./package.json',import.meta.url),new URL('runtime-package.json',directory));await copyFile(new URL('./package-lock.json',import.meta.url),new URL('runtime-package-lock.json',directory));
const files={};for(const file of ['service.mjs','runtime.mjs','notification-worker.mjs','product.html','runtime-package.json','runtime-package-lock.json',...migrationNames])files[file]=hash(await readFile(new URL(file,directory)));
let gitRevision=null,sourceDirty=true;const project=fileURLToPath(new URL('../../',import.meta.url));try{const top=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:project,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();if(resolve(top).toLowerCase()===resolve(project).toLowerCase()){gitRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:project,encoding:'utf8'}).trim();sourceDirty=!!execFileSync('git',['status','--porcelain'],{cwd:project,encoding:'utf8'}).trim();}}catch{}
const data={format:1,schemaVersion:34,gitRevision,sourceDirty,productSha256:files['product.html'],files,migrations:migrationNames.map(file=>({version:Number(file.slice(0,3)),file,sha256:files[file]}))};
await writeFile(new URL('manifest.json',directory),JSON.stringify({...data,releaseId:hash(canonical(data))},null,2)+'\n');
console.log('RUNTIME_BUILD_PASS: files='+Object.keys(files).length+' schema=34 source_dirty='+Number(sourceDirty)+' release_id='+hash(canonical(data)));
