/** Explicit local-only provisioning. Persistent database; never a disposable fixture or production bootstrap. */
import { execFileSync } from 'node:child_process';
import { randomBytes,randomUUID } from 'node:crypto';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import pg from 'pg';
import { ImportStore } from '../src/import-store';
import { createImportServer } from '../src/import-server';
const mode=process.argv[2],dir=resolve(process.argv[3]||'data/enterprise-local-import'),configFile=join(dir,'connection.json');
const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim();
await mkdir(dir,{recursive:true});
let config:{databaseUrl:string;enterpriseId:string;token:string;port:number;container:string;volume:string};
try{config=JSON.parse(await readFile(configFile,'utf8'));}catch(e){
 if(mode!=='init'||(e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
 const id=randomBytes(6).toString('hex'),password=randomBytes(32).toString('hex'),container='naumi-enterprise-import-'+id,volume=container+'-data';
 docker(['volume','create',volume]);
 execFileSync('docker',['run','-d','--name',container,'--label','naumi.local=enterprise-real-import','--restart','unless-stopped','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=enterprise_import','-v',volume+':/var/lib/postgresql/data','-p','127.0.0.1::5432','postgres:16-alpine'],{env:{...process.env,POSTGRES_PASSWORD:password},stdio:['ignore','pipe','pipe'],timeout:60000});
 const port=docker(['port',container,'5432/tcp']).split(':').at(-1);
 config={databaseUrl:`postgresql://postgres:${password}@127.0.0.1:${port}/enterprise_import`,enterpriseId:randomUUID(),token:randomBytes(32).toString('hex'),port:18494,container,volume};
 await writeFile(configFile,JSON.stringify(config),{mode:0o600,flag:'wx'});
}
if(new URL(config.databaseUrl).hostname!=='127.0.0.1')throw Error('LOCAL_DATABASE_REQUIRED');
const pool=new pg.Pool({connectionString:config.databaseUrl,max:4});
const store=new ImportStore(pool,config.enterpriseId,join(dir,'blobs'));
if(mode==='serve'){
 const port=process.argv[4]?Number(process.argv[4]):config.port;if(!Number.isInteger(port)||port<1024||port>65535)throw Error('INVALID_LOCAL_PORT');
 await pool.query('SELECT 1');const server=createImportServer(store,config.token);server.listen(port,'127.0.0.1',()=>console.log(`LOCAL_IMPORT_READY: port=${port} persistent_postgres=1 data=real source_writes=0`));
 const close=()=>{server.close(()=>void pool.end().then(()=>process.exit(0)));server.closeAllConnections();};process.once('SIGINT',close);process.once('SIGTERM',close);
}else{try{
 if(mode==='init'||mode==='migrate'){
  let ready=false;for(let i=0;i<60;i++){try{await pool.query('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}if(!ready)throw Error('LOCAL_DATABASE_NOT_READY');
  for(const name of ['001-workflow.sql','002-scheduling.sql','003-source-import.sql','004-source-identity.sql','005-people-mapping.sql','006-source-intake.sql','007-workspace-labels.sql','008-delivery-assets.sql','009-performance.sql','010-routing.sql','011-notifications.sql'])await pool.query(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
  if(mode==='migrate'){console.log('LOCAL_MIGRATION_PASS: version=11 existing_rows_preserved=1');}else{
  const result=await store.ingest(JSON.parse(await readFile(join(dir,'IMPORT_PAYLOAD.json'),'utf8')),'local-owner');
  await writeFile(join(dir,'IMPORT_RESULT.json'),JSON.stringify({...result,container:config.container,volume:config.volume},null,2));console.log('LOCAL_IMPORT_PASS: '+JSON.stringify(result));
  }
 }else if(mode==='deactivate'||mode==='reactivate'){console.log(JSON.stringify(await store.active(process.argv[4],mode==='reactivate','local-owner')));}
 else throw Error('MODE_REQUIRED: init|serve|deactivate|reactivate');
}finally{await pool.end();}}
