import {createHash} from 'node:crypto';
import type {FileHandle} from 'node:fs/promises';
import {WorkflowError} from './contracts';
export type ZipEntry={name:string;bytes:number;sha256:string;open:()=>Promise<AsyncIterable<Uint8Array>>};
const table=Uint32Array.from({length:256},(_,i)=>{let v=i;for(let n=0;n<8;n++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});
export const zipCrc=(crc:number,b:Uint8Array)=>{for(const n of b)crc=table[(crc^n)&255]^(crc>>>8);return crc>>>0;};
/** Deterministic UTF8 ZIP32 STORE, bounded chunks, validated lengths/hash, signed data descriptors. */
export async function writePublicationZip(file:FileHandle,entries:ZipEntry[],signal?:AbortSignal){
 let position=0;const hash=createHash('sha256'),central:Buffer[]=[];
 const write=async(b:Buffer)=>{signal?.throwIfAborted();hash.update(b);for(let at=0;at<b.length;){const r=await file.write(b,at,b.length-at,position);if(!r.bytesWritten)throw Error('ZIP_WRITE_FAILED');at+=r.bytesWritten;position+=r.bytesWritten;}if(position>=0xffffffff)throw new WorkflowError(413,'PUBLICATION_PACKAGE_TOO_LARGE');};
 if(entries.length>21||new Set(entries.map(e=>e.name)).size!==entries.length)throw new WorkflowError(409,'PUBLICATION_PACKAGE_ENTRIES');
 for(const e of entries){if(!/^(manifest\.json|files\/[a-zA-Z0-9][^/\\\u0000-\u001f]*)$/.test(e.name))throw new WorkflowError(409,'PUBLICATION_PACKAGE_PATH');const name=Buffer.from(e.name),offset=position,h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x808,6);h.writeUInt16LE(33,12);h.writeUInt16LE(name.length,26);await write(h);await write(name);let crc=0xffffffff,count=0;const digest=createHash('sha256');
  for await(const raw of await e.open()){const b=Buffer.from(raw);count+=b.length;if(count>e.bytes)throw new WorkflowError(409,'ASSET_CORRUPT');crc=zipCrc(crc,b);digest.update(b);await write(b);}crc=(crc^0xffffffff)>>>0;if(count!==e.bytes||digest.digest('hex')!==e.sha256)throw new WorkflowError(409,'ASSET_CORRUPT');const d=Buffer.alloc(16);d.writeUInt32LE(0x08074b50);d.writeUInt32LE(crc,4);d.writeUInt32LE(count,8);d.writeUInt32LE(count,12);await write(d);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x808,8);c.writeUInt16LE(33,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(count,20);c.writeUInt32LE(count,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);
 }
 const start=position;for(const b of central)await write(b);const size=position-start,end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(size,12);end.writeUInt32LE(start,16);await write(end);await file.sync();return {bytes:position,sha256:hash.digest('hex')};
}
