import {spawn,execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {once} from 'node:events';
const out=resolve(process.argv[2]),apiPort=Number(process.argv[3]||18525),productPort=Number(process.argv[4]||18524);
const name='naumi-sheet-ui-'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();
let started=false,api,web,closing=false;
const close=()=>{if(closing)return;closing=true;web?.kill('SIGTERM');api?.kill('SIGTERM');};process.once('SIGINT',close);process.once('SIGTERM',close);
try{
 await mkdir(out,{recursive:true});docker(['run','-d','--name',name,'--label','naumi.fixture=sheet-ui','-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_DB=sheet_ui','-p','127.0.0.1::5432','postgres:16-alpine']);started=true;
 let ready=false;for(let i=0;i<50;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}if(!ready)throw Error('FIXTURE_DATABASE_NOT_READY');
 const port=docker(['port',name,'5432/tcp']).split(':').at(-1);const config={databaseUrl:`postgresql://postgres:${password}@127.0.0.1:${port}/sheet_ui`,enterpriseId:randomUUID(),token:randomBytes(32).toString('hex'),port:apiPort,container:name};
 await writeFile(resolve(out,'connection.json'),JSON.stringify(config),{mode:0o600,flag:'wx'});
 api=spawn(process.execPath,['--import','tsx','services/enterprise-workflow/tools/preview-sheet-fixture.ts'],{stdio:['ignore','pipe','inherit'],windowsHide:true,env:{...process.env,SHEET_FIXTURE_DIR:out,SHEET_FIXTURE_ISOLATED:'1'}});api.stdout.on('data',b=>process.stdout.write(b));
 for(let i=0;i<150;i++){if(api.exitCode!==null)throw Error('FIXTURE_API_EXITED');try{const r=await fetch(`http://127.0.0.1:${apiPort}/v1/import/context`,{headers:{authorization:'Bearer '+config.token}});if(r.ok)break;}catch{}if(i===149)throw Error('FIXTURE_API_NOT_READY');await new Promise(r=>setTimeout(r,200));}
 web=spawn(process.execPath,['scripts/serve-enterprise-product.mjs',String(productPort),'18491',resolve(out,'connection.json')],{stdio:'inherit',windowsHide:true,env:{...process.env,ENTERPRISE_PRODUCT_DATA_MODE:'fixture'}});
 console.log(`SHEET_UI_PREVIEW: http://127.0.0.1:${productPort}/preview.html?v=4 isolated_database=1 real_source_copy=1`);
 await Promise.race([once(api,'exit'),once(web,'exit')]);let requested=false;try{requested=(await stat(resolve(out,'STOP'))).isFile();}catch{}if(!closing&&!requested)throw Error('FIXTURE_SERVICE_EXITED');
}catch(e){console.error(e.message);process.exitCode=1;}finally{close();if(web&&web.exitCode===null)await Promise.race([once(web,'exit'),new Promise(r=>setTimeout(r,3000))]);if(api&&api.exitCode===null)await Promise.race([once(api,'exit'),new Promise(r=>setTimeout(r,3000))]);if(started){docker(['rm','-f',name]);console.log('SHEET_UI_FIXTURE_CLEANUP_PASS: only_this_container=1');}}
