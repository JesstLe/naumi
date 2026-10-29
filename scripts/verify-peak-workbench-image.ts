import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Pool} from 'pg';
import sharp from 'sharp';

async function main(){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL||'http://invalid').hostname!=='127.0.0.1')throw Error('Requires isolated loopback PG');
 const admin=new Pool({connectionString:process.env.DATABASE_URL}),schema='peak_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
 const dir=await mkdtemp(path.join(tmpdir(),'naumi-peak-image-'));
 const bytes=await sharp(randomBytes(2400*2400*4),{raw:{width:2400,height:2400,channels:4}}).png({compressionLevel:0}).toBuffer();
 let gets=0;const server=createServer((req,res)=>{if(req.method!=='GET'){res.writeHead(405);res.end();return;}gets++;res.writeHead(200,{'content-type':'image/png','content-length':String(bytes.length)});res.end(bytes);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,MEDIA_DIR:dir,MEDIA_PRIVATE:'1',MEDIA_REMOTE_ACCESS:'proxy',STORAGE_DRIVER:'s3',S3_ENDPOINT:`http://127.0.0.1:${(server.address() as {port:number}).port}`,S3_BUCKET:'fixture',S3_REGION:'fixture',S3_ACCESS_KEY_ID:'fixture-only',S3_SECRET_ACCESS_KEY:'fixture-only',SETTINGS_SECRET:'fixture-peak-workbench-isolated-secret',NAUMI_MULTI_USER:'1',NAUMI_RELEASE_RUNTIME:'0'});
 const db=await import('../src/lib/db'),assets=await import('../src/lib/media-assets'),service=await import('../src/lib/reference-workbench/service'),canvas=await import('../src/lib/canvas-image-input');
 try{
  const owner='peak-owner@example.test',other='peak-other@example.test',id='peak-image-'+randomUUID(),key='peak/'+id+'.png';
  await db.getOrCreateUser(owner);await db.getOrCreateUser(other);
  await assets.registerMediaAsset(key,bytes,'image/png',true,owner,false);
  await db.addArtworks(owner,[{id,title:'fixture',category:'main',prompt:'fixture',status:'completed',image:'/media/'+key,source:'',gradient:''}]);
  const before=gets,result=await service.imageBytes(owner,id);
  assert.equal(gets-before,1);assert.equal(result.mimeType,'image/png');assert.equal(createHash('sha256').update(result.buffer).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
  const meta=await sharp(result.buffer).metadata();assert.equal(meta.width,2400);assert.equal(meta.height,2400);
  const deniedBefore=gets;await assert.rejects(()=>service.imageBytes(other,id));assert.equal(gets,deniedBefore);
  await assert.rejects(()=>service.imageBytes(owner,'missing'));assert.equal(gets,deniedBefore);
  await assert.rejects(()=>canvas.readCanvasImage('/media/'+key,'http://internal',owner),/大小限制/);
  assert.equal((await canvas.readCanvasOutput('/media/'+key,'http://internal',owner)).buffer.length,bytes.length);
  console.log('PEAK_WORKBENCH_IMAGE=PASS CHECKS=9 PG=ISOLATED HTTP=REAL PNG_BYTES='+bytes.length+' OUTPUT_READS=1 ORIGINAL_SHA=PASS OWNER_ISOLATION=PASS INPUT_LIMIT_UNCHANGED=1 SUPPLIER_CALLS=0');
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await db.getPool().end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
