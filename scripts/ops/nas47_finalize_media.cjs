/* Close the copy/readback tail without repeating already verified immutable
 * objects. Initial evidence and source are read-only mounts. Never deletes. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=JSON.parse(fs.readFileSync('/creds.json','utf8')),u=new URL(C.endpointContainersBridge),region=C.region||'garage';
const WORK='/work',SOURCE='/media',sha=b=>crypto.createHash('sha256').update(b).digest('hex'),hmac=(k,v)=>crypto.createHmac('sha256',k).update(v).digest();
function atomic(name,v){const p=path.join(WORK,name);fs.writeFileSync(p+'.tmp',JSON.stringify(v),{mode:0o600});fs.renameSync(p+'.tmp',p);}
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p,out);else if(e.isFile()){const s=fs.lstatSync(p);out.push({key:path.relative(SOURCE,p).split(path.sep).join('/'),size:s.size,mtimeMs:s.mtimeMs,ino:s.ino});}}return out;}
function same(a,b){return a.size===b.size&&a.ino===b.ino&&a.mtimeMs===b.mtimeMs;}
function safe(key){const p=path.resolve(SOURCE,key);if(!p.startsWith(SOURCE+'/')||key.includes('\\')||key.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('KEY_ESCAPE');return p;}
async function digest(file){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}
async function request(method,key,hash=sha(Buffer.alloc(0)),size=0,file){const p='/'+C.bucket+'/'+key.split('/').map(encodeURIComponent).join('/'),date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8),headers={host:u.host,'x-amz-content-sha256':hash,'x-amz-date':date};if(method==='PUT')headers['content-length']=String(size);const names=Object.keys(headers).sort(),canonical=[method,p,'',names.map(k=>k+':'+headers[k]+'\n').join(''),names.join(';'),hash].join('\n'),scope=day+'/'+region+'/s3/aws4_request',signkey=hmac(hmac(hmac(hmac('AWS4'+C.secretAccessKey,day),region),'s3'),'aws4_request');headers.authorization='AWS4-HMAC-SHA256 Credential='+C.accessKeyId+'/'+scope+', SignedHeaders='+names.join(';')+', Signature='+crypto.createHmac('sha256',signkey).update(['AWS4-HMAC-SHA256',date,scope,sha(canonical)].join('\n')).digest('hex');return fetch(u.origin+p,{method,headers,...(file?{body:fs.createReadStream(file),duplex:'half'}:{}),redirect:'error',signal:AbortSignal.timeout(180000)});}
async function run(){
 const initial=JSON.parse(fs.readFileSync('/initial/SUMMARY.json','utf8')),copy=JSON.parse(fs.readFileSync('/migration/migrate-final.json','utf8')),tail=JSON.parse(fs.readFileSync('/tail/migrate-tail-final.json','utf8'));
 if(initial.phase==='VERIFYING'&&!fs.existsSync('/initial/STOPPED_FOR_DURABLE_RESUME.json'))throw Error('INITIAL_VERIFIER_STILL_ACTIVE');
 if(['errors','mismatch','changed'].some(k=>initial[k]!==0)||[copy,tail].some(v=>v.FATAL||['errors','mismatch','tooLarge'].some(k=>v[k]!==0)))throw Error('COPY_NOT_CLEAN_AND_FINISHED');
 const prior=new Map();for(const file of ['/initial/verified-files.jsonl',path.join(WORK,'verified-files.jsonl'),path.join(WORK,'verified-next.jsonl')])if(fs.existsSync(file))for(const line of fs.readFileSync(file,'utf8').split('\n'))if(line){const v=JSON.parse(line);if(v.op==='verified')prior.set(v.key,v);}
 const files=walk(SOURCE).sort((a,b)=>a.key.localeCompare(b.key)),result={phase:'VERIFYING',files:files.length,verified:0,bytes:0,inheritedVerified:0,newReadbacks:0,uploaded:0,errors:0,missing:0,mismatch:0,changed:0,deleted:0,at:new Date().toISOString()};atomic('MEDIA_MANIFEST.json',files);atomic('SUMMARY.json',result);
 const log=fs.openSync(path.join(WORK,'verified-next.jsonl'),'w',0o600);
 function append(v){fs.writeSync(log,JSON.stringify(v)+'\n');result.verified++;result.bytes+=v.size;if(!v.inheritedReadback||result.verified%64===0)fs.fsyncSync(log);}
 let cursor=0;
 const progress=setInterval(()=>atomic('SUMMARY.json',{...result,at:new Date().toISOString()}),5000);
 try{const settled=await Promise.allSettled(Array.from({length:8},async()=>{while(cursor<files.length){const item=files[cursor++],p=safe(item.key),old=prior.get(item.key);if(old&&same(old,item)){append({...old,...item,op:'verified',inheritedReadback:true});result.inheritedVerified++;continue;}
  const hash=await digest(p);let r=await request('GET',item.key);if(r.status===404){await r.body?.cancel();r=await request('PUT',item.key,hash,item.size,p);if(!r.ok)throw Error('PUT_'+r.status);await r.body?.cancel();result.uploaded++;r=await request('GET',item.key);}
  if(!r.ok)throw Error('GET_'+r.status);const h=crypto.createHash('sha256');let bytes=0;for await(const b of r.body){h.update(b);bytes+=b.length;}if(bytes!==item.size||h.digest('hex')!==hash)throw Error('REMOTE_BYTES_CONFLICT');const after=fs.lstatSync(p);if(!same(item,{size:after.size,ino:after.ino,mtimeMs:after.mtimeMs}))throw Error('SOURCE_CHANGED');
  append({...item,op:'verified',sha256:hash,at:new Date().toISOString()});result.newReadbacks++;atomic('SUMMARY.json',result);
 }}));const failed=settled.find(v=>v.status==='rejected');if(failed)throw failed.reason;}finally{clearInterval(progress);fs.fsyncSync(log);fs.closeSync(log);}
 const after=walk(SOURCE).sort((a,b)=>a.key.localeCompare(b.key));if(JSON.stringify(files)!==JSON.stringify(after))throw Error('LIVE_SOURCE_CHANGED_RECONCILE');
 fs.renameSync(path.join(WORK,'verified-next.jsonl'),path.join(WORK,'verified-files.jsonl'));result.phase='ALL_BYTES_VERIFIED';result.at=new Date().toISOString();atomic('SUMMARY.json',result);console.log(JSON.stringify(result));
}
run().catch(e=>{atomic('FAILED.json',{at:new Date().toISOString(),error:e.message,deleted:0});process.exitCode=1;});
