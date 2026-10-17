// A new OS process reads persisted sessions and source bytes; test database only.
import assert from 'node:assert/strict';
import {readFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {DeliveryStore} from '../src/delivery-store';
import {MultipartStore} from '../src/multipart-store';
import {resolveDatabaseActor} from '../src/identity';
import {PART_BYTES,partBytes} from '../src/multipart-contracts';
const input=JSON.parse(await readFile(process.argv[2],'utf8'));
assert(process.env.WORKFLOW_IMPORT_TEST_DATABASE_URL&&new URL(process.env.WORKFLOW_IMPORT_TEST_DATABASE_URL).pathname==='/import_test');
const pool=new pg.Pool({connectionString:process.env.WORKFLOW_IMPORT_TEST_DATABASE_URL,max:4});
try{
 const files=new DeliveryStore(pool,resolveDatabaseActor,input.root),store=new MultipartStore(files,resolveDatabaseActor),p=input.principal;
 const {session}=await store.get(p,input.sessionId);assert.equal(session.received.length,8);assert.equal(session.bytes,32*1024*1024+17);
 const source=await open(input.sourceFile,'r');try{for(let i=0;i<session.parts.length;i++){if(session.received.includes(i))continue;const b=Buffer.alloc(partBytes(session.bytes,i));assert.equal((await source.read(b,0,b.length,i*PART_BYTES)).bytesRead,b.length);assert.equal(createHash('sha256').update(b).digest('hex'),session.parts[i]);await store.put(p,input.sessionId,i,[b]);}}finally{await source.close();}
 const done=await store.complete(p,input.sessionId,input.expectedVersion);assert.equal(done.asset.sha256,input.sha256);assert.equal(done.asset.bytes,session.bytes);assert.equal(done.cleanupPending,false);
 const download=await files.download(p,input.sessionId),hash=createHash('sha256');let bytes=0;for await(const b of download.stream){hash.update(b);bytes+=b.length;}assert.equal(bytes,session.bytes);assert.equal(hash.digest('hex'),input.sha256);
 console.log('MULTIPART_REOPEN_PASS: separate_process=1 pool4=1 receipts8=1 uploaded_missing1=1 bytes33554449=1 global_sha256=1 downloaded_stream=1');
}finally{await pool.end();}
