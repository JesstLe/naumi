/** Actual temporary Git and byte reads. Bounded I/O preserves the ordered
 * digest, detects same-size/mtime edits and still hashes on every call. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sourceIdentity,hash} from './verification/refactor-runner.mjs';
const out=path.resolve(process.env.SOURCE_IDENTITY_EVIDENCE||'output/refactor-source-identity'),root=path.join(out,'fixture-'+randomUUID());
await fs.mkdir(root,{recursive:true});const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trimEnd();
let checks=0,reads=0,active=0,peak=0;const read=fs.readFile;
try{
 git('init','-q');
 for(let i=0;i<24;i++)await fs.writeFile(path.join(root,'input-'+String(i).padStart(2,'0')+'.txt'),Buffer.alloc(4096,i));
 git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@local.invalid','commit','-qm','source fixture');
 const expectedRows=[];for(const file of git('ls-files','-z').split('\0').filter(Boolean).sort())expectedRows.push([file,hash(await read(path.join(root,file)))]);
 fs.readFile=async function(...args){reads++;active++;peak=Math.max(peak,active);try{return await read.apply(this,args);}finally{active--;}};
 const original=await sourceIdentity(root);assert.equal(original.digest,hash(JSON.stringify(expectedRows)));checks++;assert.equal(original.files,24);checks++;assert.equal(original.dirty,false);checks++;assert.equal(reads,24);checks++;assert.ok(peak>1&&peak<=8);checks++;
 const repeated=await sourceIdentity(root);assert.equal(repeated.digest,original.digest);checks++;assert.equal(reads,48);checks++;
 const file=path.join(root,'input-00.txt'),stat=await fs.stat(file);await fs.writeFile(file,Buffer.alloc(4096,99));await fs.utimes(file,stat.atime,stat.mtime);
 const edited=await sourceIdentity(root);assert.notEqual(edited.digest,original.digest);checks++;assert.equal(edited.hashes['input-00.txt'],hash(Buffer.alloc(4096,99)));checks++;
 await fs.unlink(path.join(root,'input-01.txt'));const deleted=await sourceIdentity(root);assert.equal(deleted.hashes['input-01.txt'],null);checks++;assert.equal(deleted.files,24);checks++;
 await fs.writeFile(path.join(root,'new-input.txt'),'new input');const added=await sourceIdentity(root);assert.equal(added.files,25);checks++;assert.equal(added.hashes['new-input.txt'],hash(Buffer.from('new input')));checks++;
 const result={status:'PASS',checks,peakReads:peak,fullByteReadsEveryCall:true,hashCache:false,originalDigest:original.digest,sameSizeMtimeEditDetected:true,trackedDeletionRecorded:true,untrackedAdditionRecorded:true};await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');
 console.log(`REFACTOR_SOURCE_IDENTITY=PASS CHECKS=${checks} MAX_READS=${peak} FULL_BYTES_EVERY_BOUNDARY=1 HASH_CACHE=0 SAME_SIZE_MTIME_EDIT=DETECTED ORDERED_DIGEST=EXACT`);
}finally{fs.readFile=read;assert.ok(root.startsWith(out+path.sep));await fs.rm(root,{recursive:true,force:true});}
