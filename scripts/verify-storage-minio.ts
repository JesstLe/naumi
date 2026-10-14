import assert from 'node:assert/strict';
import {AwsClient} from 'aws4fetch';
import {storageConfiguration} from '../src/lib/object-storage/config';
import {createObjectStorage} from '../src/lib/object-storage/adapter';
async function main(){
 const origin='http://127.0.0.1:19374',bucket='naumi-isolated-contract';
 const env={STORAGE_DRIVER:'s3',S3_ENDPOINT:origin,S3_BUCKET:bucket,S3_REGION:'us-east-1',S3_ACCESS_KEY_ID:'naumi-fixture',S3_SECRET_ACCESS_KEY:'fixture-only-not-production'};
 const client=new AwsClient({accessKeyId:env.S3_ACCESS_KEY_ID,secretAccessKey:env.S3_SECRET_ACCESS_KEY,service:'s3',region:'us-east-1',retries:0});
 const created=await client.fetch(origin+'/'+bucket,{method:'PUT'});assert.ok(created.ok||created.status===409);
 const store=createObjectStorage(storageConfiguration(env)),key='contract/图片 空格.bin',body=Buffer.from('naumi-garage-real-s3-contract');
 try {
  await store.put(key,body,'application/octet-stream','private, max-age=300');assert.equal(await store.exists(key),true);
  assert.deepEqual(Buffer.from(await(await store.get(key)).arrayBuffer()),body);
  const ranged=await store.get(key,'bytes=6-11');assert.equal(ranged.status,206);assert.equal(ranged.headers.get('content-range'),`bytes 6-11/${body.length}`);assert.equal(await ranged.text(),'garage');
  assert.equal((await store.get(key,'bytes=999-')).status,416);
  const signed=await store.presign('GET',key,60,new Headers(),'download.bin');const download=await fetch(signed);assert.equal(download.status,200);assert.ok(download.headers.get('content-disposition')?.includes('download.bin'));assert.deepEqual(Buffer.from(await download.arrayBuffer()),body);
  const unauthorized=await fetch(origin+'/'+bucket+'/contract/test');assert.equal(unauthorized.status,403);
  const putKey='contract/put.bin';const putUrl=await store.presign('PUT',putKey,60,new Headers({'content-type':'application/octet-stream','content-length':'10'}));assert.equal((await fetch(putUrl,{method:'PUT',headers:{'content-type':'application/octet-stream'},body:Buffer.from('signed-put')})).status,200);assert.equal(await(await store.get(putKey)).text(),'signed-put');await store.delete(putKey);
  await store.delete(key);assert.equal(await store.exists(key),false);assert.equal((await store.get(key)).status,404);
  console.log('ISOLATED_MINIO=PASS PUT=1 GET_BYTES=1 RANGE206_416=1 SIGNED_GET_PUT=1 ANONYMOUS403=1 DELETE404=1 ENTERPRISE_NAS=NOT_TESTED');
 } finally {await store.delete(key);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
