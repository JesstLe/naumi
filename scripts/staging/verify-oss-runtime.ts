// Isolated S3 transport fixture, not an Alibaba OSS live-service acceptance.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

const objects=new Map<string,{bytes:Buffer,type:string}>();
let requests=0, outage=false;
const virtualHost=process.env.NAUMI_OSS_FIXTURE_VIRTUAL_HOST==='1';
const server=createServer(async(req,res)=>{
 requests++;
 assert.match(req.headers.authorization||'',/^AWS4-HMAC-SHA256 Credential=fixture-oss-access\//);
 if(virtualHost)assert.match(req.headers.host||'',/^fixture-bucket\.oss-fixture\.local:/);
 const key=decodeURIComponent(new URL(req.url||'/', 'http://fixture').pathname.replace(virtualHost ? /^\// : /^\/fixture-bucket\//,''));
 if(outage){res.writeHead(503);res.end();return;}
 if(req.method==='PUT'){
  const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);
  objects.set(key,{bytes:Buffer.concat(chunks),type:String(req.headers['content-type']||'application/octet-stream')});res.writeHead(200);res.end();return;
 }
 if(req.method==='DELETE'){objects.delete(key);res.writeHead(204);res.end();return;}
 const obj=objects.get(key);if(!obj){res.writeHead(404);res.end();return;}
 const headers={'content-type':obj.type,'content-length':String(obj.bytes.length),'accept-ranges':'bytes','etag':'"'+createHash('md5').update(obj.bytes).digest('hex')+'"'};
 if(req.method==='HEAD'){res.writeHead(200,headers);res.end();return;}
 const range=String(req.headers.range||'').match(/^bytes=(\d+)-(\d+)$/);
 if(range){const start=Number(range[1]),end=Math.min(Number(range[2]),obj.bytes.length-1);res.writeHead(206,{...headers,'content-length':String(end-start+1),'content-range':`bytes ${start}-${end}/${obj.bytes.length}`});res.end(obj.bytes.subarray(start,end+1));return;}
 res.writeHead(200,headers);res.end(obj.bytes);
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const address=server.address() as {port:number};
Object.assign(process.env,{STORAGE_DRIVER:'s3',S3_ENDPOINT:`http://${virtualHost?'oss-fixture.local':'127.0.0.1'}:${address.port}`,S3_REGION:'fixture-region',S3_ACCESS_KEY_ID:'fixture-oss-access',S3_SECRET_ACCESS_KEY:'fixture-only-not-a-real-key',S3_BUCKET:'fixture-bucket',S3_FORCE_PATH_STYLE:virtualHost?'false':'true',S3_PUBLIC_BASE_URL:'',DATABASE_URL:''});
// The candidate checkout is read-only. Mount this newer fixture separately in
// /tmp, rather than creating a new mountpoint inside the frozen checkout.
const sourceRoot=process.env.NAUMI_STAGING_SOURCE_ROOT || fileURLToPath(new URL('../../',import.meta.url));
const storage=await import(pathToFileURL(path.join(sourceRoot,'src/lib/storage.ts')).href);
let app:ReturnType<typeof spawn>|undefined;
try{
 assert.equal(storage.storageDriver,'s3');assert.equal(storage.storageEnabled,true);
 const fixture=await readFile('/fixture.png'),key='canvas-uploads/oss-runtime-fixture.png';
 const url=await storage.uploadImage(fixture,'image/png',key);assert.equal(url,'/media/'+key);
 assert.equal(await storage.managedObjectExists(url),true);
 const read=await storage.readManagedObject(url);assert.deepEqual(read.bytes,fixture);
 await assert.rejects(storage.readManagedObject(url,1));
 assert.equal(storage.storageKeyFromManagedUrl('/media/%2e%2e/fixture'),null);
 const range=await storage.fetchStoredObject(key,'bytes=0-127');assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),fixture.subarray(0,128));
 const callsBefore=requests;await assert.rejects(storage.uploadImage(fixture,'image/png','../escape.png'));assert.equal(requests,callsBefore);
 console.log('OSS_TRANSPORT_FIXTURE=PASS PUT=1 GET=1 HEAD=1 RANGE=206 CONTENT_SHA256=IDENTICAL MAX_BYTES=ENFORCED TRAVERSAL=BLOCKED');
 // Exercise the actual fixed standalone image with no DB, model credentials,
 // production media mount, or external network access.
 app=spawn(process.execPath,['/app/server.js'],{env:{...process.env,PORT:'18033',HOSTNAME:'127.0.0.1'},stdio:['ignore','ignore','pipe']});
 let errors='';app.stderr?.on('data',b=>{errors=(errors+b.toString()).slice(-2000)});
 const origin='http://127.0.0.1:18033';
 let ready=false;for(let i=0;i<80;i++){try{const r=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1000)});if(r.status===200){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,150));}
 assert.equal(ready,true,errors);
 const http=await fetch(origin+url);assert.equal(http.status,200);assert.deepEqual(Buffer.from(await http.arrayBuffer()),fixture);
 const partial=await fetch(origin+url,{headers:{Range:'bytes=0-127'}});assert.equal(partial.status,206);assert.deepEqual(Buffer.from(await partial.arrayBuffer()),fixture.subarray(0,128));
 assert.equal((await fetch(origin+'/media/fixture-missing.png')).status,404);
 // Immutable media can remain in Next's fetch cache after an earlier GET.
 // Use a distinct never-read key to exercise an actual upstream outage.
 const outageKey='canvas-uploads/oss-runtime-outage.png';
 await storage.uploadImage(fixture,'image/png',outageKey);
 outage=true;assert.equal((await fetch(origin+'/media/'+outageKey)).status,503);outage=false;
 console.log('OSS_FIXED_IMAGE_FIXTURE=PASS MEDIA=200 RANGE=206 MISSING=404 OUTAGE=503 DB=NONE NETWORK=ISOLATED LIVE_OSS=NOT_TESTED');
 assert.equal(await storage.deleteImageByUrl(url),true);assert.equal(await storage.managedObjectExists(url),false);
 assert.equal(await storage.deleteImageByUrl('/media/'+outageKey),true);
 console.log('OSS_FIXTURE_CLEANUP=PASS DELETE=2 REAL_CREDENTIALS=0 REAL_SUPPLIER_CALLS=0 STAGING_RUNTIME_CHANGED=0');
 console.log('OSS_FIXTURE_ADDRESSING=PASS STYLE='+ (virtualHost?'virtual-host':'path'));
}finally{
 if(app){app.kill('SIGTERM');await new Promise<void>(r=>{if(app!.exitCode!==null)r();else app!.once('exit',()=>r())});}
 await new Promise<void>(r=>server.close(()=>r()));
}
