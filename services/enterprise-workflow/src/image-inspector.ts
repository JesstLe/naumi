import sharp from 'sharp';
import type {ImageInspection,ImageMeasurement,ImageSpecification,PreflightIssue} from './preflight-contracts';
export const INSPECTOR_VERSION='sharp-'+sharp.versions.sharp+'-png-jpeg-v1';
/** Decode real pixels; no filename/MIME trust. Per-call pipeline memory and time limits. */
export async function inspectPublicationImage(bytes:Buffer):Promise<ImageInspection>{
 if(bytes.length>32*1024*1024)return {status:'incomplete',code:'INSPECTOR_BYTE_LIMIT'};
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!png&&!jpeg)return {status:'incomplete',code:'UNSUPPORTED_FORMAT'};
 try{const instance=sharp(bytes,{limitInputPixels:16_000_000,failOn:'warning',sequentialRead:true}).timeout({seconds:10}),m=await instance.metadata();
  if(m.depth!=='uchar')return {status:'incomplete',code:'INSPECTOR_DEPTH_UNSUPPORTED'};
  if(!m.width||!m.height)return {status:'fail',code:'DECODE_FAILED'};
  if(m.width>32768||m.height>32768||m.width*m.height>16_000_000)return {status:'incomplete',code:'INSPECTOR_PIXEL_LIMIT'};
  if(m.pages&&m.pages>1||png&&pngAnimation(bytes))return {status:'incomplete',code:'ANIMATION_NOT_SUPPORTED'};
  const {data,info}=await instance.rotate().ensureAlpha().raw().toBuffer({resolveWithObject:true});let transparent=false;
  for(let n=info.channels-1;n<data.length;n+=info.channels)if(data[n]!==255){transparent=true;break;}
  return {status:'checked',measurement:{format:png?'png':'jpeg',width:info.width,height:info.height,bytes:bytes.length,transparent,originalWidth:m.width,originalHeight:m.height,orientation:m.orientation??1}};
 }catch(e){const s=String(e);return /pixel limit/i.test(s)?{status:'incomplete',code:'INSPECTOR_PIXEL_LIMIT'}:/timeout/i.test(s)?{status:'incomplete',code:'INSPECTOR_TIMEOUT'}:{status:'fail',code:'DECODE_FAILED'};}
}
function pngAnimation(bytes:Buffer){for(let p=8;p+12<=bytes.length;){const length=bytes.readUInt32BE(p);if(length>bytes.length-p-12)return false;if(bytes.toString('ascii',p+4,p+8)==='acTL')return true;p+=length+12;}return false;}
export function imageIssues(m:ImageMeasurement,s:ImageSpecification){const issues:PreflightIssue[]=[];if(!s.formats.includes(m.format))issues.push({code:'FORMAT',expected:s.formats,actual:m.format});if(m.width<s.minWidth||m.width>s.maxWidth)issues.push({code:'WIDTH',expected:{min:s.minWidth,max:s.maxWidth},actual:m.width});if(m.height<s.minHeight||m.height>s.maxHeight)issues.push({code:'HEIGHT',expected:{min:s.minHeight,max:s.maxHeight},actual:m.height});if(m.bytes>s.maxBytes)issues.push({code:'FILE_BYTES',expected:{max:s.maxBytes},actual:m.bytes});if(s.alpha==='forbid'&&m.transparent||s.alpha==='require'&&!m.transparent)issues.push({code:'TRANSPARENCY',expected:s.alpha,actual:m.transparent});if(s.aspect){const a=s.aspect,left=Math.abs(m.width*a.height-m.height*a.width)*10000,right=m.height*a.width*a.toleranceBps;if(left>right)issues.push({code:'ASPECT_RATIO',expected:a,actual:{width:m.width,height:m.height}});}return issues;}
