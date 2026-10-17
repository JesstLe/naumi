import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const name='naumi-runtime-test-'+randomBytes(6).toString('hex'),password=randomBytes(32).toString('hex'),cwd=fileURLToPath(new URL('.',import.meta.url));let started=false;
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();
try{
 if(!process.env.RUNTIME_BUNDLE_DIR)execFileSync(process.execPath,['build.mjs'],{cwd,stdio:'inherit',timeout:60000});else console.log('RUNTIME_PREBUILT_VERIFY: bundle_files_used_without_rebuild=1');
 execFileSync('docker',['run','-d','--name',name,'--label','naumi.fixture=enterprise-runtime','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=runtime_fixture','-p','127.0.0.1::5432','postgres:16-alpine'],{env:{...process.env,POSTGRES_PASSWORD:password},stdio:['ignore','pipe','pipe']});started=true;
 let ready=false;for(let i=0;i<60;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}if(!ready)throw Error('DATABASE_NOT_READY');
 const port=docker(['port',name,'5432/tcp']).split(':').at(-1);execFileSync(process.execPath,['--import','tsx','tests/runtime.acceptance.ts'],{cwd,stdio:'inherit',timeout:240000,env:{...process.env,NAUMI_VERIFY_ISOLATED_DB:'1',RUNTIME_TEST_CONTAINER:name,RUNTIME_TEST_DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/runtime_fixture`}});
 console.log('RUNTIME_VERIFY_PASS: real_processes=1 isolated_pg=1 no_production=1 provider_calls=0');
}catch{console.error('RUNTIME_VERIFY_FAILED: inspect isolated acceptance output');process.exitCode=1;}finally{if(started){docker(['rm','-f','-v',name]);console.log('RUNTIME_FIXTURE_CLEANUP_PASS: only_this_container=1');}}
