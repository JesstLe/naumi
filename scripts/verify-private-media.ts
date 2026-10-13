import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function main() {
  process.env.STORAGE_DRIVER='r2'; process.env.MEDIA_PRIVATE='1';
  process.env.R2_ACCOUNT_ID='test-account';process.env.R2_BUCKET='private-test';
  process.env.R2_ACCESS_KEY_ID='test-access';process.env.R2_SECRET_ACCESS_KEY='test-secret';
  process.env.MEDIA_DIR=await mkdtemp(path.join(tmpdir(),'naumi-media-'));
  const storage=await import('../src/lib/storage');
  assert.equal(storage.storageEnabled,true,'private R2 must work without public URL');
  assert.equal(typeof storage.presignStoredObject,'function','private signed object API');
  const signed=new URL(await storage.presignStoredObject('GET','test/a.png',60));
  assert.equal(signed.hostname,'test-account.r2.cloudflarestorage.com');
  assert.equal(signed.searchParams.get('X-Amz-Expires'),'60');
  assert.ok(signed.searchParams.has('X-Amz-Signature'));
  await assert.rejects(()=>storage.presignStoredObject('GET','../secret',60));
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(null,{status:503});
  const content=Buffer.from('preserved result');
  const location=await storage.writeStoredObject(content,'application/octet-stream','results/one.bin');
  assert.equal(location.remoteReady,false,'storage outage preserves model result locally');
  assert.deepEqual(await readFile(path.join(process.env.MEDIA_DIR,'results/one.bin')),content);
  assert.deepEqual((await storage.readManagedObject('/media/results/one.bin')).bytes,content);
  globalThis.fetch=originalFetch;
  console.log('PASS private config, signature, traversal, outage mirror and legacy read');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
