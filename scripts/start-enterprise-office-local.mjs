// Explicit local-only startup; no production endpoints and no existing process stops.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {createLocalOfficeBridge} from './enterprise-office-bridge.mjs';
const root=resolve('.'),dir=resolve(process.env.OFFICE_LOCAL_DIR||'data/enterprise-office-local'),source=resolve(process.env.OFFICE_IMPORT_CONFIG||'data/enterprise-sheet-workspace/connection.json');
await mkdir(dir,{recursive:true,mode:0o700});const config=JSON.parse(await readFile(source,'utf8'));if(new URL(config.databaseUrl).hostname!=='127.0.0.1')throw Error('LOCAL_DATABASE_REQUIRED');
let secret;try{secret=await readFile(join(dir,'engine-secret'),'utf8');}catch{secret=randomBytes(48).toString('hex');await writeFile(join(dir,'engine-secret'),secret,{mode:0o600});}
const image='onlyoffice/documentserver@sha256:ca17889f10b11141cc6441836aebdd2835cf3e1b49681b2fd6e155c94b7850b3',name=process.env.OFFICE_CONTAINER||'naumi-office-g63-20261019';
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']}).trim();let inspect;try{inspect=JSON.parse(docker(['inspect',name]))[0];}catch{}
if(inspect){if(inspect.Config.Image!==image||!inspect.State.Running||!inspect.Config.Env.includes('JWT_SECRET='+secret))throw Error('OFFICE_CONTAINER_CHANGED');}else{
 const envFile=join(dir,'documentserver.env');await writeFile(envFile,'JWT_ENABLED=true\nJWT_SECRET='+secret+'\nALLOW_PRIVATE_IP_ADDRESS=true\nALLOW_META_IP_ADDRESS=false\n', {mode:0o600});docker(['run','-d','--name',name,'--label','naumi.local=office-g63','--restart','no','--memory','4g','--cpus','2','--shm-size','256m','--env-file',envFile,'-p','127.0.0.1:18549:80',image]);
}
const pool=new pg.Pool({connectionString:config.databaseUrl,max:3,connectionTimeoutMillis:5000});
const schema=(await pool.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='enterprise_workflow.source_worksheet_files'::regclass AND contype='c'")).rows;
if(!schema.some(c=>c.definition.includes('67108864'))){if(!process.argv.includes('--migrate-local'))throw Error('OFFICE_LOCAL_MIGRATION_REQUIRED');await pool.query(await readFile('services/enterprise-workflow/migrations/038-office-attachment-size.sql','utf8'));}
const bridge=await createLocalOfficeBridge({pool,enterpriseId:config.enterpriseId,blobRoot:resolve(config.sourceBlobRoot||'data/enterprise-local-import/blobs'),stateDir:join(dir,'sessions'),root,engineSecret:secret,allowedOrigins:['http://127.0.0.1:18482','http://127.0.0.1:18550']});
bridge.server.listen(18548,'127.0.0.1',()=>console.log('OFFICE_LOCAL_READY: bridge=18548 document_server=18549 product=18482 local_only=1 production_connections=0'));
const close=()=>{bridge.server.closeAllConnections();bridge.server.close(()=>void pool.end().then(()=>process.exit(0)));};process.once('SIGTERM',close);process.once('SIGINT',close);
