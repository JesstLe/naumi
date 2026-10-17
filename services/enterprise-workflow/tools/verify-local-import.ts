/** Read-only real-data reconciliation and local backup/isolated restore drill. */
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve,join } from 'node:path';
import pg from 'pg';
import { ImportStore,fileHash } from '../src/import-store';
const dir=resolve(process.argv[2]||'data/enterprise-local-import'),out=resolve(process.argv[3]||'output/real-import-verification');
await mkdir(out,{recursive:true});
const config=JSON.parse(await readFile(join(dir,'connection.json'),'utf8')),source=JSON.parse(await readFile(join(dir,'IMPORT_PAYLOAD.json'),'utf8'));
assert.equal(new URL(config.databaseUrl).hostname,'127.0.0.1');
const pool=new pg.Pool({connectionString:config.databaseUrl}),store=new ImportStore(pool,config.enterpriseId,join(dir,'blobs'));
try{
 const rows=await store.data(source.sourceHash),assets=await store.assets(source.sourceHash);assert.equal(rows.length,source.rows.length);
 for(let i=0;i<rows.length;i++){const {version,resolution,...raw}=rows[i];assert.deepEqual(raw,source.rows[i]);assert(version>=1);}
 assert.equal(assets.length,source.assets.length);for(const a of assets)assert.equal(await fileHash(join(dir,'blobs',a.sha256)),a.sha256);
 const thumb=JSON.parse(await readFile(join(dir,'THUMBNAILS.json'),'utf8'));assert.equal(thumb.failed.length,0);
 const orders=Number((await pool.query('SELECT count(*) n FROM enterprise_workflow.orders')).rows[0].n);assert.equal(orders,0);
 const before=Number((await pool.query('SELECT count(*) n FROM enterprise_workflow.import_audit')).rows[0].n);
 const replay=await store.ingest(source,'verification');assert(replay.replayed);
 assert.equal(Number((await pool.query('SELECT count(*) n FROM enterprise_workflow.import_audit')).rows[0].n),before);
 const dump=execFileSync('docker',['exec',config.container,'pg_dump','-U','postgres','-Fc','enterprise_import'],{maxBuffer:32*1024*1024});assert.equal(dump.subarray(0,5).toString(),'PGDMP');
 const backup=join(dir,'BACKUP.dump');await writeFile(backup,dump,{mode:0o600});
 const container='naumi-import-restore-'+randomBytes(6).toString('hex'),password=randomBytes(32).toString('hex');let started=false;
 const docker=(args:string[],input?:Buffer)=>execFileSync('docker',args,{input,encoding:'utf8',timeout:60000,stdio:['pipe','pipe','pipe']}).trim();
 try{
  execFileSync('docker',['run','-d','--name',container,'-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=restore_verify','postgres:16-alpine'],{env:{...process.env,POSTGRES_PASSWORD:password},stdio:['ignore','pipe','pipe']});started=true;
  let ready=false;for(let i=0;i<60;i++){try{docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}assert(ready);
  docker(['exec','-i',container,'pg_restore','-U','postgres','-d','restore_verify','--exit-on-error'],dump);
  const restored=JSON.parse(docker(['exec',container,'psql','-U','postgres','-d','restore_verify','-tAc','SELECT json_agg(document ORDER BY row_number) FROM enterprise_workflow.import_rows']));assert.deepEqual(restored,source.rows);
  assert.equal(Number(docker(['exec',container,'psql','-U','postgres','-d','restore_verify','-tAc','SELECT count(*) FROM enterprise_workflow.import_assets'])),assets.length);
 }finally{if(started)docker(['rm','-f',container]);}
 const report={sourceHash:source.sourceHash,rows:rows.length,children:rows.filter(r=>r.parentLabel).length,ambiguous:rows.filter(r=>r.parentCandidates.length>1).length,assets:assets.length,uniqueBlobs:new Set(assets.map(a=>a.sha256)).size,links:source.links.length,thumbnails:thumb.ready,rawRowsExact:true,workflowOrders:orders,replayNoWrites:true,backupPath:backup,backupSha256:await fileHash(backup),backupRestoreExact:true,volume:config.volume};
 await writeFile(join(out,'REAL_DATABASE_VERIFICATION.json'),JSON.stringify(report,null,2));
 console.log(`REAL_DATA_PASS: rows=${rows.length} assets=${assets.length} links=${source.links.length} raw_exact=1 blob_hashes=1 replay_no_writes=1 workflow_orders=0 thumbnails=${thumb.ready} backup_restore_exact=1`);
}finally{await pool.end();}
