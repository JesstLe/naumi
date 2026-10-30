import 'server-only';
import sharp from 'sharp';
import {isManagedImageUrl} from '@/lib/object-storage/runtime';
import {readManagedObject} from '@/lib/object-storage/managed-read';

const MAX_LONG_EDGE=24_000;
function allowedRemoteImage(url:URL):boolean{
 for(const base of [process.env.R2_PUBLIC_BASE_URL,process.env.NEXT_PUBLIC_IMAGE_BASE_URL]){
  if(!base)continue;try{if(url.host===new URL(base).host)return true;}catch{/* Invalid deployment configuration is not a permitted origin. */}
 }
 return url.protocol==='https:'&&(url.host==='images.unsplash.com'||url.host.endsWith('.r2.dev'));
}
async function readArtworkImage(source:string,requestUrl:string):Promise<Buffer>{
 if(isManagedImageUrl(source))return(await readManagedObject(source,32*1024*1024)).bytes;
 const sameOrigin=source.startsWith('/')&&!source.startsWith('//'),target=sameOrigin?new URL(source,requestUrl):new URL(source);
 if(!sameOrigin&&!allowedRemoteImage(target))throw Error('所选图片来源不允许拼接');
 const response=await fetch(target,{signal:AbortSignal.timeout(30_000)});
 if(!response.ok)throw Error(`读取图片失败 (${response.status})`);
 return Buffer.from(await response.arrayBuffer());
}
/** No SQL, artifact insertion or receipt state. Preserve original source order,
 * orientation, scaling and white flattening; pixels are prepared before BEGIN. */
export async function prepareCanvasStitch(images:readonly string[],requestUrl:string){
 const sources=await Promise.all(images.map(image=>readArtworkImage(image,requestUrl)));
 const metadata=await Promise.all(sources.map(input=>sharp(input).rotate().metadata()));
 let targetWidth=Math.min(1536,Math.max(...metadata.map(meta=>meta.width||1024)));
 const estimatedHeight=metadata.reduce((sum,meta)=>sum+Math.round(((meta.height||targetWidth)/(meta.width||targetWidth))*targetWidth),0);
 if(estimatedHeight>MAX_LONG_EDGE)targetWidth=Math.max(640,Math.floor(targetWidth*(MAX_LONG_EDGE/estimatedHeight)));
 const panels=await Promise.all(sources.map(input=>sharp(input).rotate().resize({width:targetWidth,withoutEnlargement:false}).flatten({background:'#ffffff'}).png().toBuffer({resolveWithObject:true})));
 const totalHeight=panels.reduce((sum,panel)=>sum+panel.info.height,0);
 const bytes=await sharp({create:{width:targetWidth,height:totalHeight,channels:3,background:'#ffffff'}}).composite(panels.map((panel,index)=>({input:panel.data,left:0,top:panels.slice(0,index).reduce((sum,previous)=>sum+previous.info.height,0)}))).png().toBuffer();
 return{bytes,width:targetWidth,height:totalHeight};
}
