import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const name='naumi-people-members-test-'+randomBytes(6).toString('hex'),password=randomBytes(32).toString('hex'),cwd=fileURLToPath(new URL('.',import.meta.url));
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();let started=false;
try{
 execFileSync('docker',['run','-d','--name',name,'--label','naumi.fixture=people-members','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=people_members_g69_fixture','-p','127.0.0.1::5432','postgres:16-alpine'],{env:{...process.env,POSTGRES_PASSWORD:password},stdio:['ignore','pipe','pipe']});started=true;
 let ready=false;for(let i=0;i<60;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}if(!ready)throw Error('PG_NOT_READY');
 const port=docker(['port',name,'5432/tcp']).split(':').at(-1);
 // The test additionally checks its database-name guard before creating any table.
 const db='people_members_g69_'+randomBytes(5).toString('hex');docker(['exec',name,'createdb','-U','postgres',db]);
 execFileSync(process.execPath,['--import','tsx','--test','tests/people-members.test.ts'],{cwd,stdio:'inherit',timeout:90000,env:{...process.env,WORKFLOW_PEOPLE_MEMBERS_TEST_DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/${db}`}});
 console.log('PEOPLE_MEMBERS_VERIFY_PASS: isolated_pg=1 production_writes=0');
}catch(e){console.error(e instanceof Error?e.message:e);process.exitCode=1;}finally{if(started){docker(['rm','-f',name]);console.log('PEOPLE_MEMBERS_TEST_CLEANUP_PASS: only_this_container=1');}}
