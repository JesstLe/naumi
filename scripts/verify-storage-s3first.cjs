const assert = require('node:assert/strict');
const path = require('node:path');
const sourcePath=process.argv[2]||'src/lib/storage.ts';
const expectedMode=process.argv[3]||'remote';


function fixture(driver='s3'){
 const calls=[],files=new Map(),config={driver,enabled:true,mediaDir:'/fixture/media',privateMedia:true,accessMode:'proxy',publicBase:''};
 const state={putError:false,localError:false,getError:false,response:()=>new Response('remote-bytes',{headers:{'content-type':'image/png'}})};
 const local={put:async(k,b)=>{calls.push('local.put');if(state.localError)throw Error('local-write-failed');files.set(path.resolve(config.mediaDir,k),Buffer.from(b));},delete:async()=>{}};
 const remote={put:async()=>{calls.push('remote.put');if(state.putError)throw Error('remote-write-failed')},get:async()=>{calls.push('remote.get');if(state.getError)throw Error('remote-read-failed');return state.response()},delete:async()=>{}};
 const filePromises={mkdir:async()=>{},statfs:async()=>({bavail:10*1024*1024,bsize:4096}),stat:async p=>{calls.push('local.stat');const b=files.get(p);if(!b)throw Object.assign(Error('missing'),{code:'ENOENT'});return {isFile:()=>true,size:b.length}},readFile:async p=>{calls.push('local.read');return files.get(p)}};
 const {loadStorageSource}=require('./storage-source-fixture.cjs');
 const storage=loadStorageSource(sourcePath,{'fs/promises':filePromises,'path':path,
  './object-storage/config':{storageConfiguration:()=>config},
  './object-storage/adapter':{createObjectStorage:c=>c.driver==='local'?local:remote,safeStorageKey:k=>{if(!k||k.includes('..')||k.startsWith('/'))throw Error('unsafe');return k}},
  './image-upload-policy':{ORIGINAL_IMAGE_MAX_BYTES:64*1024*1024},
  './media-assets':{getMediaAsset:async()=>null},'./media-assets-reader':{getMediaAsset:async()=>null}});
 return{storage,calls,files,state,config};
}
(async()=>{
 let cases=0;const check=(v,label)=>{assert.ok(v,label);cases++};
 if(expectedMode==='mirror'){
  let f=fixture();let r=await f.storage.writeStoredObject(Buffer.from('new'),'image/png','test.png');check(r.remoteReady,'remoteReady preserved');check(f.calls.join(',')==='local.put,remote.put','baseline mirror-first order');check(f.files.size===1,'baseline retains mirror');
  f=fixture();f.files.set(path.resolve('/fixture/media/test.png'),Buffer.from('old-local'));r=await f.storage.readManagedObject('/media/test.png',100);check(r.bytes.toString()==='old-local','baseline local-first read');check(!f.calls.includes('remote.get'),'baseline local read avoids remote');
  console.log('S3FIRST_BASELINE=PASS CASES='+cases+' MIRROR_FIRST=1 LOCAL_FIRST_READ=1 SUPPLIER_CALLS=0');return;
 }
 let f=fixture();let r=await f.storage.writeStoredObject(Buffer.from('new'),'image/png','test.png');check(r.remoteReady,'remote write ready');check(f.calls.join(',')==='remote.put','no local write after remote success');check(f.files.size===0,'remote success uses no local disk');
 f=fixture();f.state.putError=true;r=await f.storage.writeStoredObject(Buffer.from('retained'),'image/png','test.png');check(!r.remoteReady,'outage not remote-ready');check(f.calls.join(',')==='remote.put,local.put','outage falls back after remote attempt');check([...f.files.values()][0].toString()==='retained','paid bytes retained locally');
 f.state.localError=true;await assert.rejects(()=>f.storage.writeStoredObject(Buffer.from('x'),'image/png','other.png'));cases++;
 f=fixture('local');r=await f.storage.writeStoredObject(Buffer.from('local'),'image/png','test.png');check(!r.remoteReady&&f.calls.join(',')==='local.put','local driver behavior retained');
 f=fixture();f.files.set(path.resolve('/fixture/media/test.png'),Buffer.from('stale'));r=await f.storage.readManagedObject('/media/test.png',100);check(r.bytes.toString()==='remote-bytes','remote is authoritative');check(f.calls.join(',')==='remote.get','no local read when remote available');check(r.contentType==='image/png','remote content type preserved');
 for(const status of [404,403,503]){f=fixture();f.state.response=()=>new Response(null,{status});f.files.set(path.resolve('/fixture/media/test.png'),Buffer.from('mirror'));r=await f.storage.readManagedObject('/media/test.png',100);check(r.bytes.toString()==='mirror','local fallback for remote '+status)}
 f=fixture();f.state.getError=true;f.files.set(path.resolve('/fixture/media/test.png'),Buffer.from('offline'));r=await f.storage.readManagedObject('/media/test.png',100);check(r.bytes.toString()==='offline','network outage retains local read');
 f=fixture();f.state.response=()=>new Response('large',{headers:{'content-length':'1000'}});await assert.rejects(()=>f.storage.readManagedObject('/media/test.png',2));cases++;
 f=fixture();await assert.rejects(()=>f.storage.readManagedObject('/media/test.png',2));cases++;
 f=fixture();f.state.response=()=>new Response(null,{status:404});f.files.set(path.resolve('/fixture/media/test.png'),Buffer.from('too-large'));await assert.rejects(()=>f.storage.readManagedObject('/media/test.png',2));cases++;
 f=fixture();f.state.response=()=>new Response(null,{status:503});await assert.rejects(()=>f.storage.readManagedObject('/media/test.png',100),/503/);cases++;
 f=fixture();await assert.rejects(()=>f.storage.readManagedObject('/media/..%2Fsecret',100));cases++;
 console.log('S3FIRST_MODIFIED=PASS CASES='+cases+' REMOTE_FIRST=1 OUTAGE_MIRROR=1 LOCAL_COMPAT=1 BOUNDS=1 SUPPLIER_CALLS=0');
})().catch(e=>{console.error(e);process.exitCode=1});
