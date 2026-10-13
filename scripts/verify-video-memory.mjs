import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readLimitedVideoResponse} from '../src/lib/video/result-download.ts';

// Exercise the real downloader, including chunk retention and its final copy.
// Source-text matching or allocating an unused buffer cannot prove this bound.
global.gc?.();
const total=150*1024*1024,chunkSize=1024*1024,before=process.memoryUsage();
let emitted=0,peakArrayBuffers=before.arrayBuffers;
const expected=createHash('sha256');
const source=new Response(new ReadableStream({pull(controller){
  if(emitted===total){controller.close();return;}
  const chunk=new Uint8Array(Math.min(chunkSize,total-emitted));chunk.fill((emitted/chunkSize)%251);emitted+=chunk.length;expected.update(chunk);controller.enqueue(chunk);
  peakArrayBuffers=Math.max(peakArrayBuffers,process.memoryUsage().arrayBuffers);
}}),{headers:{'content-type':'video/mp4','content-length':'1'}});
const result=await readLimitedVideoResponse(source,200*1024*1024);
const after=process.memoryUsage();peakArrayBuffers=Math.max(peakArrayBuffers,after.arrayBuffers);
assert.equal(result.bytes.byteLength,total);assert.equal(createHash('sha256').update(result.bytes).digest('hex'),expected.digest('hex'));assert.equal(source.body.locked,false);
assert.ok(after.heapUsed-before.heapUsed<32*1024*1024,'Downloader created a large JS/base64 copy');
assert.ok(peakArrayBuffers-before.arrayBuffers<total*2.2+20*1024*1024,'Downloader exceeded bounded chunks plus final byte buffer');
let cancelled=false,pulls=0;
const oversized=new Response(new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(chunkSize));},cancel(){cancelled=true;}}),{headers:{'content-type':'video/mp4'}});
await assert.rejects(()=>readLimitedVideoResponse(oversized,10*1024*1024));assert.equal(cancelled,true);assert.equal(oversized.body.locked,false);assert.ok(pulls<=12);
console.log(`VIDEO_MEMORY=PASS actual_download_bytes=${total} peak_array_buffer_delta=${peakArrayBuffers-before.arrayBuffers} heap_delta=${after.heapUsed-before.heapUsed} overflow_cancelled=true`);
