/** Original product shell over synthetic source data only, for browser write acceptance. */
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {once} from 'node:events';
import pg from 'pg';
import {ImportStore} from '../src/import-store';
import {createImportServer} from '../src/import-server';
const name='naumi-people-preview-'+randomBytes(6).toString('hex'),password=randomBytes(32).toString('hex'),port=Number(process.argv[2]||18502),dir=resolve('output/people-fixture-'+name);
const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();
let started=false,pool:pg.Pool|undefined,server:ReturnType<typeof createImportServer>|undefined,proxy:ReturnType<typeof spawn>|undefined,closing=false;
const cleanup=async()=>{if(closing)return;closing=true;proxy?.kill();if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()));}await pool?.end();if(started)docker(['rm','-f',name]);};process.once('SIGINT',()=>void cleanup().then(()=>process.exit(0)));process.once('SIGTERM',()=>void cleanup().then(()=>process.exit(0)));
try{
 execFileSync('docker',['run','-d','--name',name,'-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=people_fixture','-p','127.0.0.1::5432','postgres:16-alpine'],{env:{...process.env,POSTGRES_PASSWORD:password},stdio:['ignore','pipe','pipe']});started=true;
 let ready=false;for(let i=0;i<60;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}if(!ready)throw Error('PG_NOT_READY');
 const dbPort=docker(['port',name,'5432/tcp']).split(':').at(-1);pool=new pg.Pool({connectionString:`postgresql://postgres:${password}@127.0.0.1:${dbPort}/people_fixture`});
 for(const f of ['001-workflow.sql','002-scheduling.sql','003-source-import.sql','004-source-identity.sql','005-people-mapping.sql'])await pool.query(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const enterpriseId=randomUUID(),store=new ImportStore(pool,enterpriseId,dir),row=(n:number)=>({excelRow:n,title:'验收产品'+n,parentLabel:'',raw:{'设计师':'合成真名甲','需求方':'合成真名乙'},rawCells:{['A'+n]:'验收产品'+n},parentCandidates:[],attachments:[],issues:[]});
 await store.ingest({schema:'enterprise-source-import-v1',sourceHash:'d'.repeat(64),workbookHash:'e'.repeat(64),sheet:'合成人员映射验收',headers:{A:'产品需求名称',H:'需求方',I:'设计师'},rows:[row(2),row(3),row(4)],issues:[],summary:{rows:3,children:0},assets:[],links:[]},'fixture');
 const token=randomBytes(32).toString('hex');server=createImportServer(store,token);server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw Error('NO_ADDRESS');await mkdir(dir,{recursive:true});const config=resolve(dir,'config.json');await writeFile(config,JSON.stringify({port:address.port,token}),{mode:0o600});
 proxy=spawn(process.execPath,['scripts/serve-enterprise-product.mjs',String(port),'18491',config],{stdio:'inherit'});proxy.on('exit',()=>void cleanup());console.log(`PEOPLE_FIXTURE_READY: http://127.0.0.1:${port}/preview.html?v=4 synthetic_rows=3 production_writes=0`);
}catch(e){console.error(e instanceof Error?e.message:e);await cleanup();process.exitCode=1;}
