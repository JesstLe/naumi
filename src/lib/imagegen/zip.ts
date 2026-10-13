import "server-only";
const table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let n=0;n<8;n++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes:Buffer){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function imagegenFilename(name:string,ordinal:number,extension:string){
 let base=name.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>:"/\\|?*]/g,"-").replace(/^[. ]+|[. ]+$/g,"").slice(0,80)||"image";
 if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base))base=`image-${base}`;
 return `${base}-${ordinal}.${extension}`;
}
/** ZIP64 STORE, bounded to one original at a time; no multi-gigabyte JSZip buffer. */
export async function* streamImagegenZip(files:AsyncIterable<{name:string;bytes:Buffer}>){
 let offset=BigInt(0);const directory:Buffer[]=[];
 for await(const file of files){
  const name=Buffer.from(file.name,"utf8"),crc=crc32(file.bytes),size=BigInt(file.bytes.length);
  const extra=Buffer.alloc(20);extra.writeUInt16LE(1,0);extra.writeUInt16LE(16,2);extra.writeBigUInt64LE(size,4);extra.writeBigUInt64LE(size,12);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(45,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(0xffffffff,18);header.writeUInt32LE(0xffffffff,22);header.writeUInt16LE(name.length,26);header.writeUInt16LE(extra.length,28);
  const centralExtra=Buffer.alloc(28);centralExtra.writeUInt16LE(1,0);centralExtra.writeUInt16LE(24,2);centralExtra.writeBigUInt64LE(size,4);centralExtra.writeBigUInt64LE(size,12);centralExtra.writeBigUInt64LE(offset,20);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(45,4);central.writeUInt16LE(45,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(33,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(0xffffffff,20);central.writeUInt32LE(0xffffffff,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(centralExtra.length,30);central.writeUInt32LE(0xffffffff,42);
  directory.push(Buffer.concat([central,name,centralExtra]));
  yield header;yield name;yield extra;yield file.bytes;
  offset+=BigInt(header.length+name.length+extra.length)+size;
 }
 const start=offset;for(const block of directory){yield block;offset+=BigInt(block.length);}
 const end=Buffer.alloc(56);end.writeUInt32LE(0x06064b50,0);end.writeBigUInt64LE(BigInt(44),4);end.writeUInt16LE(45,12);end.writeUInt16LE(45,14);end.writeBigUInt64LE(BigInt(directory.length),24);end.writeBigUInt64LE(BigInt(directory.length),32);end.writeBigUInt64LE(offset-start,40);end.writeBigUInt64LE(start,48);yield end;
 const locator=Buffer.alloc(20);locator.writeUInt32LE(0x07064b50,0);locator.writeBigUInt64LE(offset,8);locator.writeUInt32LE(1,16);yield locator;
 const classic=Buffer.alloc(22);classic.writeUInt32LE(0x06054b50,0);classic.writeUInt16LE(0xffff,8);classic.writeUInt16LE(0xffff,10);classic.writeUInt32LE(0xffffffff,12);classic.writeUInt32LE(0xffffffff,16);yield classic;
}
