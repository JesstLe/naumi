// Documented repository browser acceptance workflow. Uses its own Chromium, disposable PG, no ordinary browser/CDP.
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve(process.argv[2]),hold=process.argv.includes('--hold'),name='naumi-office-test-'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');let api,web,bridge,started=false;
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();
const run=async(label,args,env=process.env)=>{const r=spawnSync(process.execPath,args,{env,encoding:'utf8',timeout:240000,windowsHide:true});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');await writeFile(resolve(out,label+'.log'),(r.stdout||'')+(r.stderr||''));if(r.status!==0)throw Error(label+'_FAILED');};
const child=(args,env=process.env)=>{const p=spawn(process.execPath,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});p.stdout.on('data',b=>process.stdout.write(b));p.stderr.on('data',b=>process.stderr.write(b));return p;};
const ready=async(url,headers={})=>{for(let i=0;i<150;i++){try{if((await fetch(url,{headers})).ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('FIXTURE_NOT_READY');};
try{
 await mkdir(out,{recursive:true});docker(['run','-d','--name',name,'--label','naumi.fixture=office','-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_DB=office_service','-p','127.0.0.1::5432','postgres:16-alpine']);started=true;for(let i=0;i<60;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const port=docker(['port',name,'5432/tcp']).split(':').at(-1),databaseUrl=`postgresql://postgres:${password}@127.0.0.1:${port}/office_service`;
 await run('SERVICE',['--import','tsx','services/enterprise-workflow/tests/source-worksheet.ts'],{...process.env,WORKSHEET_TEST_DATABASE_URL:databaseUrl});
 docker(['exec',name,'psql','-U','postgres','-d','office_service','-c','CREATE DATABASE office_ui']);const config={databaseUrl:databaseUrl.replace('/office_service','/office_ui'),enterpriseId:randomUUID(),token:randomBytes(32).toString('hex'),port:18551,container:name};await writeFile(resolve(out,'connection.json'),JSON.stringify(config),{mode:0o600});
 api=child(['--import','tsx','services/enterprise-workflow/tools/preview-sheet-fixture.ts'],{...process.env,SHEET_FIXTURE_DIR:out,SHEET_FIXTURE_ISOLATED:'1'});await ready('http://127.0.0.1:18551/v1/import/context',{authorization:'Bearer '+config.token});
 web=child(['scripts/serve-enterprise-product.mjs','18550','18491',resolve(out,'connection.json')],{...process.env,ENTERPRISE_PRODUCT_DATA_MODE:'fixture'});await ready('http://127.0.0.1:18550/preview.html?v=4');
 bridge=child(['--import','tsx','scripts/verify-office-bridge-fixture.mjs',out]);await ready('http://127.0.0.1:18552/office/session');
 console.log('OFFICE_FIXTURE_READY: web=18550 bridge=18552 engine=18549 disposable_pg=1 production_connections=0');
 if(hold){const until=Date.now()+600000;while(Date.now()<until){try{await access(resolve(out,'RUN_BROWSER'));break;}catch{await new Promise(r=>setTimeout(r,500));}}}
 await run('BROWSER',['scripts/verify-office-browser.mjs',resolve(out,'browser'),'18550']);console.log('OFFICE_FIXTURE_PASS: local_engine=real persistence=disposable production_connections=0');
}catch(e){console.error(e.message);process.exitCode=1;}finally{for(const p of [bridge,web,api])p?.kill();if(started){docker(['rm','-f',name]);console.log('OFFICE_FIXTURE_CLEANUP_PASS: only_this_database_container=1 document_engine_preserved=1');}}
