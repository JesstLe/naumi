type Element = { id: number; start: number; sizeOffset: number; sizeLength: number; content: number; size: number; end: number };
export type DirectorEncodedFrame={data:Uint8Array;timestamp:number;key:boolean};
function vint(bytes: Uint8Array, offset: number, identifier = false) {
  const first = bytes[offset]; if (!first) throw new Error("WebM头部无效");
  let length = 1, bit = 0x80; while (!(first & bit)) { bit >>= 1; length++; }
  if (length > (identifier ? 4 : 8) || offset + length > bytes.length) throw new Error("WebM头部不完整");
  let value = BigInt(identifier ? first : first & (bit - 1)); for (let i = 1; i < length; i++) value = (value << BigInt(8)) | BigInt(bytes[offset + i]);
  return { length, value: !identifier && value === (BigInt(1) << BigInt(7 * length)) - BigInt(1) ? Infinity : Number(value) };
}
function element(bytes: Uint8Array, start: number): Element {
  const id = vint(bytes, start, true), sizeOffset = start + id.length, size = vint(bytes, sizeOffset), content = sizeOffset + size.length;
  return { id: id.value, start, sizeOffset, sizeLength: size.length, content, size: size.value, end: content + size.value };
}
function sizeBytes(value: number, minimum: number) {
  let length = minimum; while (value >= 2 ** (7 * length) - 1) length++; if (length > 8) throw new Error("WebM长度无效");
  const bytes = new Uint8Array(length); let encoded = BigInt(value) | (BigInt(1) << BigInt(length * 7)); for (let i = length - 1; i >= 0; i--) { bytes[i] = Number(encoded & BigInt(255)); encoded >>= BigInt(8); } return bytes;
}
/** A small WebM writer for the browser's VP8/VP9 encoder. Media is already encoded;
 * this only writes deterministic timestamps, duration and seek cues. */
export function muxDirectorWebm(frames:DirectorEncodedFrame[],width:number,height:number,seconds:number,codec:"V_VP8"|"V_VP9") {
  if(!frames.length||!frames[0].key||seconds<=0||!Number.isFinite(seconds))throw new Error("视频编码结果无效");
  const join=(parts:Uint8Array[])=>{const output=new Uint8Array(parts.reduce((sum,part)=>sum+part.length,0));let offset=0;for(const part of parts){output.set(part,offset);offset+=part.length;}return output;};
  const identifier=(id:number)=>{const bytes:number[]=[];do{bytes.unshift(id%256);id=Math.floor(id/256);}while(id);return new Uint8Array(bytes);};
  const el=(id:number,...parts:Uint8Array[])=>{const data=join(parts);return join([identifier(id),sizeBytes(data.length,1),data]);};
  const uint=(value:number)=>{const bytes=new Uint8Array(8);let integer=BigInt(Math.round(value));for(let i=7;i>=0;i--){bytes[i]=Number(integer&BigInt(255));integer>>=BigInt(8);}return bytes;};
  const number=(id:number,value:number)=>el(id,uint(value)),text=(id:number,value:string)=>el(id,new TextEncoder().encode(value));
  const duration=new Uint8Array(8);new DataView(duration.buffer).setFloat64(0,seconds*1000);
  const header=el(0x1a45dfa3,number(0x4286,1),number(0x42f7,1),number(0x42f2,4),number(0x42f3,8),text(0x4282,"webm"),number(0x4287,4),number(0x4285,2));
  const info=el(0x1549a966,number(0x2ad7b1,1_000_000),el(0x4489,duration),text(0x4d80,"Naumi director"),text(0x5741,"Naumi director"));
  const tracks=el(0x1654ae6b,el(0xae,number(0xd7,1),number(0x73c5,1),number(0x83,1),text(0x86,codec),number(0x23e383,seconds*1_000_000_000/frames.length),el(0xe0,number(0xb0,width),number(0xba,height))));
  const groups:{time:number;blocks:Uint8Array[]}[]=[];
  for(const frame of frames){const time=Math.round(frame.timestamp/1000);let group=groups.at(-1);if(!group||frame.key&&time-group.time>=1000){group={time,blocks:[]};groups.push(group);}
    const block=new Uint8Array(frame.data.length+4);block[0]=0x81;new DataView(block.buffer).setInt16(1,time-group.time);block[3]=frame.key?0x80:0;block.set(frame.data,4);group.blocks.push(el(0xa3,block));}
  const clusters=groups.map(group=>el(0x1f43b675,number(0xe7,group.time),...group.blocks));
  const seek=(positions:number[])=>el(0x114d9b74,...[0x1549a966,0x1654ae6b,0x1c53bb6b].map((id,index)=>el(0x4dbb,el(0x53ab,identifier(id)),number(0x53ac,positions[index]))));
  const headSize=seek([0,0,0]).length,clusterStart=headSize+info.length+tracks.length,positions:number[]=[];let offset=clusterStart;
  for(const cluster of clusters){positions.push(offset);offset+=cluster.length;}
  const cues=el(0x1c53bb6b,...groups.map((group,index)=>el(0xbb,number(0xb3,group.time),el(0xb7,number(0xf7,1),number(0xf1,positions[index])))));
  const seekHead=seek([headSize,headSize+info.length,offset]),parts=[seekHead,info,tracks,...clusters,cues],size=parts.reduce((sum,part)=>sum+part.length,0);
  return new Blob([header,identifier(0x18538067),sizeBytes(size,1),...parts],{type:"video/webm"});
}
/** MediaRecorder emits a live WebM with no Duration. Finalize its small Info header,
 * without decoding pixels or loading the full video into another byte buffer.
 * Existing indexed files only receive an in-place duration update. */
export async function finalizeDirectorWebm(blob: Blob, seconds: number): Promise<Blob> {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("录制时长无效");
  const bytes = new Uint8Array(await blob.slice(0, Math.min(blob.size, 1024 * 1024)).arrayBuffer()), header = element(bytes, 0);
  if (header.id !== 0x1a45dfa3) throw new Error("录制结果不是WebM");
  let segment = element(bytes, header.end); while (segment.id === 0xec) segment = element(bytes, segment.end);
  if (segment.id !== 0x18538067) throw new Error("WebM分段无效");
  let info: Element | undefined, indexed = false;
  for (let offset = segment.content; offset < bytes.length;) {
    const item = element(bytes, offset); if (item.id === 0x1f43b675) break;
    if (item.id === 0x114d9b74 || item.id === 0x1c53bb6b) indexed = true;
    if (item.id === 0x1549a966) info = item;
    if (!Number.isFinite(item.end) || item.end <= offset) break; offset = item.end;
  }
  if (!info || !Number.isFinite(info.end) || info.end > bytes.length) throw new Error("WebM录制信息不完整");
  let scale = 1_000_000, duration: Element | undefined;
  for (let offset = info.content; offset < info.end;) {
    const item = element(bytes, offset); if (item.end > info.end) throw new Error("WebM录制信息无效");
    if (item.id === 0x2ad7b1) { scale = 0; for (const byte of bytes.slice(item.content, item.end)) scale = scale * 256 + byte; }
    if (item.id === 0x4489) duration = item;
    if (!Number.isFinite(item.end) || item.end <= offset) throw new Error("WebM录制信息无效"); offset = item.end;
  }
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("WebM时间单位无效");
  const value = seconds * 1_000_000_000 / scale;
  if (duration) {
    if (![4, 8].includes(duration.size)) throw new Error("WebM时长字段无效");
    const payload = new Uint8Array(duration.size), view = new DataView(payload.buffer); if (duration.size === 4) view.setFloat32(0, value); else view.setFloat64(0, value);
    return new Blob([blob.slice(0, duration.content), payload, blob.slice(duration.end)], { type: "video/webm" });
  }
  if (indexed) throw new Error("当前浏览器的录制索引格式尚未支持");
  const payload = new Uint8Array(11); payload.set([0x44, 0x89, 0x88]); new DataView(payload.buffer).setFloat64(3, value);
  const infoSize = sizeBytes(info.size + payload.length, info.sizeLength), delta = payload.length + infoSize.length - info.sizeLength;
  const segmentSize = segment.size === Infinity ? blob.slice(segment.sizeOffset, segment.content) : sizeBytes(segment.size + delta, segment.sizeLength);
  return new Blob([blob.slice(0, segment.sizeOffset), segmentSize, blob.slice(segment.content, info.sizeOffset), infoSize, blob.slice(info.content, info.end), payload, blob.slice(info.end)], { type: "video/webm" });
}
