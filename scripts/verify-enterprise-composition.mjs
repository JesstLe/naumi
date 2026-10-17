import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile,copyFile,symlink,realpath} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),out=resolve(process.env.NAUMI_COMPOSITION_EVIDENCE_DIR||join(root,'output/web-composition'));
await mkdir(out,{recursive:true});const fixture=await mkdtemp(join(out,'source-copy-')),name='naumi-web-composition-'+randomBytes(6).toString('hex'),password=randomBytes(32).toString('hex');let started=false;
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();
try{
 const lock=await readFile(join(root,'package-lock.json')),lockHash=createHash('sha256').update(lock).digest('hex');
 const dependencies=resolve(process.env.NAUMI_COMPOSITION_DEPENDENCIES||join(root,'output/composition-dependencies'),lockHash);
 await mkdir(join(dependencies,'scripts'),{recursive:true});
 let installed=false;try{installed=(await readFile(join(dependencies,'LOCK_SHA256'),'utf8'))===lockHash&&JSON.parse(await readFile(join(dependencies,'node_modules/next/package.json'),'utf8')).version===JSON.parse(lock).packages['node_modules/next'].version;}catch{}
 if(!installed){
  for(const file of ['package.json','package-lock.json','scripts/patch-next-body.mjs'])await copyFile(join(root,file),join(dependencies,file));
  if(process.platform==='win32')execFileSync(process.execPath,[join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),'ci','--no-audit','--no-fund'],{cwd:dependencies,stdio:'inherit',timeout:360000});
  else execFileSync('npm',['ci','--no-audit','--no-fund'],{cwd:dependencies,stdio:'inherit',timeout:360000});
  await writeFile(join(dependencies,'LOCK_SHA256'),lockHash);
 }
 assert.equal(JSON.parse(await readFile(join(dependencies,'node_modules/next/package.json'),'utf8')).version,JSON.parse(lock).packages['node_modules/next'].version);
 const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
 for(const f of new Set(files)){if(/(^|\/)\.env(?:\.|$)/.test(f))continue;assert(!f.split('/').includes('..')&&!f.startsWith('/'));const target=join(fixture,f);await mkdir(dirname(target),{recursive:true});await copyFile(join(root,f),target);}
 await writeFile(join(fixture,'.enterprise-composition-fixture'),'owned disposable source copy\n');
 await symlink(await realpath(join(dependencies,'node_modules')),join(fixture,'node_modules'),process.platform==='win32'?'junction':'dir');
 execFileSync('docker',['run','-d','--name',name,'--label','naumi.fixture=enterprise-web-composition','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=source_composition','-p','127.0.0.1::5432','postgres:16-alpine'],{env:{...process.env,POSTGRES_PASSWORD:password},stdio:['ignore','pipe','pipe']});started=true;
 let ready=false;for(let i=0;i<60;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}assert(ready);
 const port=docker(['port',name,'5432/tcp']).split(':').at(-1);
 const env={...process.env,NAUMI_VERIFY_ISOLATED_DB:'1',DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/source_composition`,NAUMI_COMPOSITION_EVIDENCE_DIR:out,SETTINGS_SECRET:randomBytes(32).toString('hex'),NAUMI_MULTI_USER:'1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',OPENAI_API_KEY:'',SMTP_HOST:'',PGOPTIONS:'',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:'.next-composition',MEDIA_DIR:join(fixture,'output/media')};
 if(process.env.NAUMI_COMPOSITION_RUNTIME_BUNDLE){
  const bundle=resolve(process.env.NAUMI_COMPOSITION_RUNTIME_BUNDLE),manifest=JSON.parse(await readFile(join(bundle,'manifest.json'),'utf8')),dist=join(fixture,'services/enterprise-workflow/dist');await mkdir(dist,{recursive:true});
  for(const file of ['manifest.json',...Object.keys(manifest.files)]){assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]+$/.test(file));const bytes=await readFile(join(bundle,file));if(file!=='manifest.json')assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.files[file]);await writeFile(join(dist,file),bytes);}
 }else execFileSync(process.execPath,['services/enterprise-workflow/build.mjs'],{cwd:fixture,env,stdio:'inherit',timeout:60000});
 execFileSync(process.execPath,['--require','./scripts/enterprise-integration-test-preload.cjs','--import','tsx','scripts/verify-enterprise-composition.ts'],{cwd:fixture,env,stdio:'inherit',timeout:480000});
 execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--noEmit','--incremental','false'],{cwd:fixture,env,stdio:'inherit',timeout:120000});
 console.log('LOCKED_WEB_TYPECHECK_PASS: full_source=1 next=15.5.27 shared_dependencies_untouched=1');
 console.log('WEB_COMPOSITION_VERIFY_PASS: real_next_http=1 separate_runtime_process=1 native_login=1 isolated_source_and_workflow_databases=1 production=0');
}catch(e){console.error(String(e.message).replaceAll(password,'[fixture-secret]'));process.exitCode=1;}
finally{if(started){docker(['rm','-f','-v',name]);console.log('WEB_COMPOSITION_FIXTURE_CLEANUP: owned_database_only=1');}}
