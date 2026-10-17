import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const name='naumi-import-test-'+randomBytes(6).toString('hex'),password=randomBytes(32).toString('hex'),cwd=fileURLToPath(new URL('.',import.meta.url));
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();let started=false;
try{
 execFileSync('docker',['run','-d','--name',name,'-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=import_test','-p','127.0.0.1::5432','postgres:16-alpine'],{env:{...process.env,POSTGRES_PASSWORD:password},stdio:['ignore','pipe','pipe']});started=true;
 let ready=false;for(let i=0;i<60;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}if(!ready)throw Error('PG_NOT_READY');
 const port=docker(['port',name,'5432/tcp']).split(':').at(-1);
 execFileSync(process.execPath,['--import','tsx','--test','tests/import.test.ts'],{cwd,stdio:'inherit',timeout:90000,env:{...process.env,WORKFLOW_IMPORT_TEST_DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/import_test`}});
 console.log('IMPORT_VERIFY_PASS: synthetic_pg=1 real_source_mutations=0');
}catch(e){console.error(e.message);process.exitCode=1;}finally{if(started){docker(['rm','-f',name]);console.log('IMPORT_TEST_CLEANUP_PASS: only_this_test_container=1');}}
