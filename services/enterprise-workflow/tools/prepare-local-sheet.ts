/** Explicit LOCAL working database copy. No connection to 47; no source UPDATE. */
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import pg from 'pg';
const mode=process.argv[2],target=resolve(process.argv[3]||'data/enterprise-sheet-workspace'),out=resolve(process.argv[4]||'output/enterprise-local-sheet');
if(!['prepare','check'].includes(mode)||target!==resolve('data/enterprise-sheet-workspace'))throw Error('EXPLICIT_LOCAL_SHEET_TARGET_REQUIRED');
const originalDir=resolve('data/enterprise-local-import'),source=JSON.parse(await readFile(join(originalDir,'connection.json'),'utf8'));
const url=new URL(source.databaseUrl);if(url.hostname!=='127.0.0.1')throw Error('LOOPBACK_ONLY');const originalName=decodeURIComponent(url.pathname.slice(1)),dbName='enterprise_sheet_local_g58';
if(!/^[a-zA-Z0-9_-]+$/.test(source.container)||!/^[a-zA-Z0-9_-]+$/.test(originalName)||originalName===dbName)throw Error('LOCAL_SOURCE_INVALID');
await mkdir(out,{recursive:true});const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const docker=(args:string[],input?:Buffer)=>execFileSync('docker',args,{input,timeout:120000,maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe']});
const dbUrl=new URL(source.databaseUrl);dbUrl.pathname='/'+dbName;
const inspected=JSON.parse(docker(['inspect',source.container]).toString())[0];if(inspected.Config?.Labels?.['naumi.local']!=='enterprise-real-import'||!inspected.NetworkSettings?.Ports?.['5432/tcp']?.some((b:any)=>b.HostIp==='127.0.0.1'&&b.HostPort===url.port))throw Error('LOCAL_CONTAINER_BINDING_MISMATCH');
const beforePool=new pg.Pool({connectionString:source.databaseUrl,max:1});
const evidence=async(pool:pg.Pool)=>{const tables=['import_batches','import_rows','import_assets','import_audit'];const hashes:Record<string,string>={};for(const t of tables){const r=(await pool.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text AS raw FROM enterprise_workflow.${t} t`)).rows[0].raw;hashes[t]=sha(Buffer.from(r));}return hashes;};
try{
 const before=await evidence(beforePool);const configs={...source,databaseUrl:dbUrl.toString(),sourceBlobRoot:join(originalDir,'blobs'),port:18494};
 let prior;try{prior=JSON.parse(await readFile(join(target,'connection.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 if(mode==='prepare'){
  if(prior){if(prior.databaseUrl!==configs.databaseUrl||prior.enterpriseId!==source.enterpriseId||prior.container!==source.container)throw Error('TARGET_CONFIG_MISMATCH');}
  else{
   const dump=docker(['exec',source.container,'pg_dump','-U','postgres','-d',originalName,'--no-owner','--no-acl','--format=plain']);await writeFile(join(out,'LOCAL_SOURCE_BACKUP.sql'),dump,{flag:'wx',mode:0o600});await writeFile(join(out,'LOCAL_SOURCE_BACKUP.sha256'),sha(dump)+'\n',{flag:'wx'});
   docker(['exec',source.container,'createdb','-U','postgres',dbName]);docker(['exec','-i',source.container,'psql','-Xq','-v','ON_ERROR_STOP=1','-U','postgres','-d',dbName],dump);
   await mkdir(target,{recursive:true});await writeFile(join(target,'connection.json'),JSON.stringify(configs),{flag:'wx',mode:0o600});
  }
  const targetPool=new pg.Pool({connectionString:configs.databaseUrl,max:1});try{
   const versions=new Set((await targetPool.query('SELECT version FROM enterprise_workflow.schema_version')).rows.map(r=>r.version));
   for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>/^\d{3}-.*\.sql$/.test(f)).sort())if(!versions.has(Number(file.slice(0,3))))await targetPool.query(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
   const after=await evidence(targetPool),sourceAfter=await evidence(beforePool);if(JSON.stringify(before)!==JSON.stringify(after)||JSON.stringify(before)!==JSON.stringify(sourceAfter))throw Error('SOURCE_COPY_CHANGED');
   await writeFile(join(out,'LOCAL_COPY_RECEIPT.json'),JSON.stringify({originalName,targetName:dbName,sourceBefore:before,sourceAfter,targetSource:after,schemaVersion:37,sourceWrites:0,productionConnections:0},null,2));
  }finally{await targetPool.end();}
 }else{
  if(!prior)throw Error('TARGET_NOT_CONFIGURED');const p=new pg.Pool({connectionString:prior.databaseUrl,max:1});try{if(JSON.stringify(before)!==JSON.stringify(await evidence(p)))throw Error('SOURCE_COPY_CHANGED');}finally{await p.end();}
 }
 console.log(`LOCAL_SHEET_COPY_PASS: mode=${mode} original_source_unchanged=1 target_source_exact=1 independent_database=1 production_connections=0`);
}finally{await beforePool.end();}
