import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import test from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import type {Readable} from 'node:stream';
import {prepareWorksheetDownload} from '../src/source-worksheet-download';

test('verified worksheet spools have a process bound and release on cancellation',async()=>{
 const fixture=Buffer.from('fixture'),id=createHash('sha256').update(fixture).digest('hex');
 const clients=Array.from({length:4},()=>new AbortController());
 const get=(signal?:AbortSignal)=>prepareWorksheetDownload(fixture.length,id,async()=>fixture,async()=>{},signal);
 const streams:Readable[]=[];
 try{
  for(const c of clients)streams.push(await get(c.signal));
  await assert.rejects(get(),/WORKSHEET_FILE_BUSY/);
  const closed=once(streams[0],'close');clients[0].abort();await closed;
  // On Windows removal of named temporary files completes after the stream closes.
  let recovered:Readable|undefined;
  for(let n=0;n<20&&!recovered;n++){
   try{recovered=await get();}catch(error){assert.match(String(error),/WORKSHEET_FILE_BUSY/);await delay(10);}
  }
  assert.ok(recovered);streams.push(recovered);
  const chunks=[];for await(const data of recovered)chunks.push(data);
  assert.deepEqual(Buffer.concat(chunks),fixture);
 }finally{for(const stream of streams)stream.destroy();}
});
