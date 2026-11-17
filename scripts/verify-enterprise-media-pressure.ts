import assert from 'node:assert/strict';
import {createServer,type Server,type ServerResponse} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';

const baseline=process.argv.includes('--expect-defect');
const origin=async(server:Server)=>{await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${(server.address() as {port:number}).port}`;};
const stop=async(server:Server)=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));};
async function until(condition:()=>boolean,message:string,ms=4000){const end=Date.now()+ms;while(!condition()){assert.ok(Date.now()<end,message);await delay(15);}}

async function main(){
 const out=path.resolve(process.argv[2]||'output/enterprise-media-pressure');await mkdir(out,{recursive:true});
 const png=await sharp({create:{width:850,height:600,channels:3,background:'#ddd'}}).png().toBuffer();
 const video=Buffer.from('abcdefghi');
 const pending=new Map<string,ServerResponse>(),seen=new Set<string>(),aborted=new Set<string>();let peak=0,hold=true;
 const finish=(key:string,res:ServerResponse)=>{
  if(res.destroyed||res.writableEnded)return;
  if(key.startsWith('video-')){res.writeHead(206,{'content-type':'video/mp4','content-length':3,'content-range':'bytes 1-3/9','accept-ranges':'bytes'});res.end(video.subarray(1,4));}
  else res.end(png.subarray(1));
 };
 const storage=createServer((req,res)=>{
  const key=req.url!.split('/').at(-1)!;seen.add(key);pending.set(key,res);peak=Math.max(peak,pending.size);
  res.on('close',()=>{if(!res.writableFinished)aborted.add(key);pending.delete(key);});
  if(key==='image-fallback'){res.writeHead(503).end();return;}
  if(key.startsWith('video-'))assert.equal(req.headers.range,'bytes=1-3');
  else {res.writeHead(200,{'content-type':'image/png','content-length':png.length});res.write(png.subarray(0,1));}
  if(!hold)finish(key,res);
 });
 const storageOrigin=await origin(storage);
 Object.assign(process.env,{STORAGE_DRIVER:'s3',S3_ENDPOINT:storageOrigin,S3_FORCE_PATH_STYLE:'true',S3_REGION:'us-east-1',S3_BUCKET:'fixture',S3_ACCESS_KEY_ID:'fixture-key',S3_SECRET_ACCESS_KEY:'fixture-only-secret',MEDIA_DIR:path.join(out,'local-mirror'),MEDIA_PRIVATE:'0',NAUMI_NAS_DEFER_UPLOAD:'0'});
 const {enterpriseMediaResponse}=await import('../src/lib/enterprise/media-response');
 const {streamManagedMedia}=await import('../src/lib/enterprise/media-stream');
 let appOrigin='';const appSeen=new Set<string>(),appAbort=new Set<string>();const errors:unknown[]=[];
 const app=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url!,appOrigin),key=url.pathname.split('/').at(-1)!;appSeen.add(key);
   // Same response-close signal adapter used by Next for Node routes.
   const signal=signalFromNodeResponse(res);signal.addEventListener('abort',()=>appAbort.add(key),{once:true});
   const request=new Request(url,{signal,headers:req.headers.range?{range:req.headers.range}:{}});
   const result=key.startsWith('video-')?await streamManagedMedia(request,`/media/${key}`,'video/mp4'):await enterpriseMediaResponse(request,`/media/${key}`);
   if(res.destroyed){await result.body?.cancel();return;}
   res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
  }catch(error){errors.push(error);if(!res.destroyed)res.writeHead(500).end();}
 });
 appOrigin=await origin(app);
 type Read={status:number;body:Buffer;retry:string|null;type:string|null;cache:string|null;range:string|null};
 const values=new Map<string,Read>();const tasks:{key:string;abort:AbortController;done:Promise<unknown>}[]=[];
 const client=(key:string)=>{
  const abort=new AbortController();const done=fetch(`${appOrigin}/${key}`,{signal:abort.signal,headers:key.startsWith('video-')?{range:'bytes=1-3'}:{}})
   .then(async response=>{values.set(key,{status:response.status,body:Buffer.from(await response.arrayBuffer()),retry:response.headers.get('retry-after'),type:response.headers.get('content-type'),cache:response.headers.get('cache-control'),range:response.headers.get('content-range')});})
   .catch(error=>{if(!abort.signal.aborted)throw error;});
  const item={key,abort,done};tasks.push(item);return item;
 };
 const metrics:Record<string,number|boolean>={};
 try{
  const total=baseline?12:36,group=Array.from({length:total},(_,i)=>client(`image-${i}`));
  await until(()=>appSeen.size===total,'app did not see all HTTP requests');
  await until(()=>seen.size>=(baseline?total:4),'storage did not see the expected requests');
  if(!baseline)await until(()=>[...values.values()].filter(x=>x.status===503).length>=8,'full queue must reject excess');
  metrics.initialPeak=peak;assert.equal(peak,baseline?12:4);
  if(!baseline){
   const queued=group.find(x=>!seen.has(x.key)&&!values.has(x.key));assert.ok(queued);queued.abort.abort();
   await until(()=>appAbort.has(queued.key),'queued client abort did not reach HTTP adapter');
   assert.ok(!seen.has(queued.key));
  }
  const active=group.find(x=>seen.has(x.key));assert.ok(active);active.abort.abort();
  await until(()=>appAbort.has(active.key),'client abort did not reach HTTP adapter');
  if(baseline){await delay(120);assert.ok(!aborted.has(active.key));}
  else{await until(()=>aborted.has(active.key),'cancelled image did not close the storage body');await until(()=>seen.size>4,'next queued preview did not start');}
  metrics.imageAbortReachesStorage=aborted.has(active.key);
  hold=false;for(const [key,res] of pending)finish(key,res);await Promise.all(group.map(x=>x.done));
  const rows=group.flatMap(x=>values.get(x.key)||[]);for(const row of rows){if(row.status===503){assert.equal(row.retry,'1');continue;}
   assert.equal(row.status,200);assert.equal(row.type,'image/webp');assert.match(row.cache||'',/private.*no-store/);
   const info=await sharp(row.body).metadata();assert.equal(info.width,480);
  }
  metrics.previewSuccess=rows.filter(x=>x.status===200).length;metrics.queueRejected=rows.filter(x=>x.status===503).length;
  await until(()=>pending.size===0,'image bodies not released');
  hold=true;const waiting=client('video-abort');await until(()=>seen.has(waiting.key),'range did not start');waiting.abort.abort();
  await until(()=>appAbort.has(waiting.key),'range abort did not reach HTTP adapter');
  if(baseline){await delay(120);assert.ok(!aborted.has(waiting.key));}
  else await until(()=>aborted.has(waiting.key),'range abort did not close upstream before headers');
  metrics.rangeAbortReachesStorage=aborted.has(waiting.key);
  hold=false;for(const [key,res] of pending)finish(key,res);await waiting.done;
  await client('video-success').done;const range=values.get('video-success')!;assert.equal(range.status,206);assert.equal(range.range,'bytes 1-3/9');assert.equal(range.body.toString(),'bcd');
  if(!baseline){
   await mkdir(process.env.MEDIA_DIR!,{recursive:true});await writeFile(path.join(process.env.MEDIA_DIR!,'image-fallback'),png);
   await client('image-fallback').done;const fallback=values.get('image-fallback')!;
   assert.equal(fallback.status,200);assert.equal((await sharp(fallback.body).metadata()).width,480);metrics.remoteFailureFallsBack=true;
   hold=true;const blockers=Array.from({length:4},(_,i)=>client(`image-expiry-${i}`));
   await until(()=>blockers.every(x=>seen.has(x.key)),'waiting-budget blockers did not start');
   const expired=client('image-expiry-waiter');await until(()=>values.has(expired.key),'queued preview did not expire',7500);await expired.done;
   assert.ok(!seen.has(expired.key));assert.equal(values.get(expired.key)?.status,503);assert.equal(values.get(expired.key)?.retry,'1');
   hold=false;for(const [key,res] of pending)finish(key,res);await Promise.all(blockers.map(x=>x.done));
   assert.ok(blockers.every(x=>values.get(x.key)?.status===200));metrics.queuedWaitExpires=true;
  }
  assert.deepEqual(errors,[]);metrics.rangeBytesPreserved=true;
 }finally{
  hold=false;for(const [key,res] of pending)finish(key,res);for(const task of tasks)task.abort.abort();await Promise.allSettled(tasks.map(x=>x.done));
  await stop(app);await stop(storage);await writeFile(path.join(out,'RESULT.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics));
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
