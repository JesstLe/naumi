import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const name='naumi-runtime-test-'+randomBytes(6).toString('hex'),password=randomBytes(32).toString('hex'),cwd=fileURLToPath(new URL('.',import.meta.url));let started=false,containerId;
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();
try{
 execFileSync(process.execPath,['--import','tsx','../../scripts/verify-enterprise-runtime-ports.cjs'],{cwd,stdio:'inherit',timeout:60000});
 if(!process.env.RUNTIME_BUNDLE_DIR)execFileSync(process.execPath,['build.mjs'],{cwd,stdio:'inherit',timeout:60000});else console.log('RUNTIME_PREBUILT_VERIFY: bundle_files_used_without_rebuild=1');
 containerId=execFileSync('docker',['run','-d','--name',name,'--label','naumi.fixture=enterprise-runtime','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=runtime_fixture','-p','127.0.0.1::5432','postgres:16-alpine'],{env:{...process.env,POSTGRES_PASSWORD:password},stdio:['ignore','pipe','pipe']}).toString().trim();started=true;
 let ready=false;for(let i=0;i<60;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}if(!ready)throw Error('DATABASE_NOT_READY');
 const port=docker(['port',name,'5432/tcp']).split(':').at(-1);execFileSync(process.execPath,['--import','tsx','tests/runtime.acceptance.ts'],{cwd,stdio:'inherit',timeout:240000,env:{...process.env,NAUMI_VERIFY_ISOLATED_DB:'1',RUNTIME_TEST_CONTAINER:name,RUNTIME_TEST_DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/runtime_fixture`}});
 console.log('RUNTIME_VERIFY_PASS: real_processes=1 isolated_pg=1 no_production=1 provider_calls=0');
}catch{console.error('RUNTIME_VERIFY_FAILED: inspect isolated acceptance output');process.exitCode=1;}finally{if(started){
 docker(['rm','-f','-v',name]);if(docker(['ps','-aq','--no-trunc','--filter','id='+containerId]))throw Error('RUNTIME_FIXTURE_CLEANUP_FAILED');
 if(process.env.NAUMI_RUNTIME_EVIDENCE_DIR){const out=resolve(process.env.NAUMI_RUNTIME_EVIDENCE_DIR);await mkdir(out,{recursive:true});await writeFile(join(out,'CLEANUP.json'),JSON.stringify({status:'PASS',name,containerId,label:'naumi.fixture=enterprise-runtime',containerAbsent:true,otherResourcesUntouched:true},null,2)+'\n');}
 console.log('RUNTIME_FIXTURE_CLEANUP_PASS: only_this_container=1');}}
