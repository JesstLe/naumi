import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {storageConfiguration} from '../src/lib/object-storage/config';
import {createObjectStorage,StorageRequestError} from '../src/lib/object-storage/adapter';
async function main(){
 const dir=await mkdtemp(path.join(tmpdir(),'naumi-adapter-'));
 try {
  assert.throws(()=>storageConfiguration({STORAGE_DRIVER:'typo'}));
  assert.throws(()=>storageConfiguration({STORAGE_DRIVER:'s3',S3_ENDPOINT:'https://name:secret@example.com'}));
  assert.throws(()=>storageConfiguration({MEDIA_REMOTE_ACCESS:'typo'}));
  const local=createObjectStorage(storageConfiguration({STORAGE_DRIVER:'local',MEDIA_DIR:dir}));
  const bytes=Buffer.from('naumi-garage-contract');await local.put('contract/object.bin',bytes,'application/octet-stream','no-store');
  assert.equal(await local.exists('contract/object.bin'),true);assert.deepEqual(Buffer.from(await(await local.get('contract/object.bin')).arrayBuffer()),bytes);
  for(const [range,status,text] of [['bytes=6-11',206,'garage'],['bytes=-8',206,'contract'],['bytes=99-',416,''],['bytes=-',416,''],['bytes=-0',416,'']] as const){const res=await local.get('contract/object.bin',range);assert.equal(res.status,status);assert.equal(await res.text(),text);}
  await assert.rejects(()=>local.get('../private'));
  await local.delete('contract/object.bin');assert.equal(await local.exists('contract/object.bin'),false);await local.delete('contract/object.bin');
  const remote=createObjectStorage(storageConfiguration({STORAGE_DRIVER:'r2',R2_ACCOUNT_ID:'fixture',R2_BUCKET:'fixture',R2_ACCESS_KEY_ID:'fixture',R2_SECRET_ACCESS_KEY:'fixture'}));
  const signed=new URL(await remote.presign('GET','folder/a b.png',60));assert.equal(signed.searchParams.get('X-Amz-Expires'),'60');assert.ok(signed.searchParams.has('X-Amz-Signature'));
  const original=globalThis.fetch;let status=403;globalThis.fetch=async()=>new Response(null,{status});
  try {await assert.rejects(()=>remote.exists('a'),(e:any)=>e instanceof StorageRequestError&&e.status===403);status=503;await assert.rejects(()=>remote.exists('a'));await assert.rejects(()=>remote.delete('a'));status=404;assert.equal(await remote.exists('a'),false);await remote.delete('a');globalThis.fetch=async()=>{throw Error('network fixture');};await assert.rejects(()=>remote.exists('a'));}finally{globalThis.fetch=original;}
  console.log('UNIFIED_STORAGE_CONTRACT=PASS LOCAL_STREAM_RANGE=1 R2_SIGNATURE=1 CONFIG_ERRORS=1 ABSENT_VS_UNKNOWN=1');
 }finally{await rm(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
