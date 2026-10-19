import {execFileSync,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const name='naumi-sheet-fixture-'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();
let started=false;
try{
 docker(['run','-d','--name',name,'--label','naumi.fixture=sheet-crud','-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_DB=sheet_fixture','-p','127.0.0.1::5432','postgres:16-alpine']);started=true;
 let ready=false;for(let i=0;i<50;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}if(!ready)throw Error('FIXTURE_NOT_READY');
 const port=docker(['port',name,'5432/tcp']).split(':').at(-1);
 const result=spawnSync(process.execPath,['--import','tsx','services/enterprise-workflow/tests/source-worksheet.ts'],{stdio:'inherit',timeout:180000,env:{...process.env,WORKSHEET_TEST_DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/sheet_fixture`}});if(result.status!==0)throw Error('WORKSHEET_TEST_FAILED');
}catch(e){console.error(e.message);process.exitCode=1;}finally{if(started){docker(['rm','-f',name]);console.log('WORKSHEET_FIXTURE_CLEANUP_PASS: only_this_container=1');}}
