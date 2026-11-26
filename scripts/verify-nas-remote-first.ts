import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createMediaCapacityFixture} from './fixtures/media-capacity';

async function main(){
  const dir=await mkdtemp(path.join(tmpdir(),'naumi-nas-remote-first-'));
  const objects=new Map<string,Buffer>();
  let outage=false,puts=0;
  const server=createServer(async(req,res)=>{
    if(req.method==='PUT'){
      puts++;
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);
      if(!outage)objects.set(req.url!,Buffer.concat(chunks));
      res.writeHead(outage?503:200).end();return;
    }
    const bytes=objects.get(req.url!);
    res.writeHead(bytes?200:404);res.end(req.method==='GET'?bytes:undefined);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as {port:number}).port;
  Object.assign(process.env,{
    NAUMI_VERIFY_ISOLATED_DB:'1',DATABASE_URL:'postgresql://fixture@127.0.0.1:1/unused',
    STORAGE_DRIVER:'s3',S3_ENDPOINT:`http://127.0.0.1:${port}`,S3_BUCKET:'fixture',S3_REGION:'garage',
    S3_ACCESS_KEY_ID:'fixture',S3_SECRET_ACCESS_KEY:'fixture-only-secret',S3_FORCE_PATH_STYLE:'true',
    MEDIA_DIR:dir,MEDIA_PRIVATE:'1',MEDIA_REMOTE_ACCESS:'proxy',NAUMI_NAS_DEFER_UPLOAD:process.argv.includes('--deferred')?'1':'0',
  });
  const capacity=createMediaCapacityFixture(dir,8*1024**3);
  try {
    const storage=await import('../src/lib/object-storage/runtime');
    const bytes=Buffer.from('NAS remote-first exact bytes');
    const absent=(key:string)=>assert.rejects(stat(path.join(dir,key)),{code:'ENOENT'});
    // The healthy remote path is still usable with no local buffer capacity.
    const deferred = process.argv.includes('--deferred');
    if (deferred) {
      const saved = await storage.writeStoredObject(bytes,'image/png','admitted.png');
      assert.equal(saved.remoteReady,false);
      assert.deepEqual(await readFile(path.join(dir,'admitted.png')),bytes);
      assert.equal(puts,0);
    }
    capacity.setAvailableBytes(deferred ? 5*1024**3 : 0);
    assert.deepEqual(await storage.writeStoredObject(bytes,'image/png','remote.png'),{remoteReady:true});
    assert.equal(puts,1);
    const response=await storage.fetchStoredObject('remote.png');
    assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
    await absent('remote.png');if (!deferred) assert.equal(capacity.observations().length,0);
    // A successful fallback is durable and never claimed as remotely stored.
    outage=true;capacity.setAvailableBytes(5*1024**3);
    assert.deepEqual(await storage.writeStoredObject(bytes,'image/png','fallback.png'),{remoteReady:false});
    assert.equal(puts,2);assert.deepEqual(await readFile(path.join(dir,'fallback.png')),bytes);
    assert.equal(objects.has('/fixture/fallback.png'),false);
    // Readiness gate is already blocked; a second write still cannot eat reserve.
    capacity.setAvailableBytes(4*1024**3);
    await assert.rejects(storage.writeStoredObject(bytes,'image/png','rejected.png'),/本地空间不足/);
    await absent('rejected.png');assert.equal(puts,2);
    console.log('NAS_REMOTE_FIRST PASS: actual HTTP and local bytes; healthy NAS keeps no duplicate, disk reserve preserved on outage');
  }finally{
    capacity.restore();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(dir,{recursive:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
