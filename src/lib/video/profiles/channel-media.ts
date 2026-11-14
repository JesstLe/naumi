import {videoDiagnostic,type VideoResult,type ResolvedVideoAsset,type VideoExecutionDraft} from '../execution-contract';
import type {ChannelVideoMapping} from './channel-contract';
const fail=(reason:string):VideoResult<never>=>({ok:false,diagnostics:[videoDiagnostic('constraint','MEDIA_PROPERTIES_OUT_OF_RANGE','inputs',reason,'调整真实素材规格或用途')]});
type Input=VideoExecutionDraft['inputs'][number];
/** Called only with actual resolved assets. Pending Workflow slots never get
 * invented MIME/dimensions/duration in order to satisfy a legacy normalizer. */
export function validateChannelMedia(c:ChannelVideoMapping,media:Input[],assets:Record<string,ResolvedVideoAsset>,duration:number):VideoResult<true>{
 const images=media.filter(i=>i.kind==='image').map(i=>assets[i.id]),videos=media.filter(i=>i.kind==='video').map(i=>assets[i.id]),audios=media.filter(i=>i.kind==='audio').map(i=>assets[i.id]);
 if([...images,...videos,...audios].some(a=>!a))return fail('真实媒体属性缺失');
 const videoMime=['video/mp4','video/quicktime'],audioMime=['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave'];
 const types=(items:ResolvedVideoAsset[],allowed:string[])=>items.every(i=>allowed.includes(i.mimeType));
 const dims=(items:ResolvedVideoAsset[],min:number,max:number,lo:number,hi:number)=>items.every(i=>i.width&&i.height&&Math.min(i.width,i.height)>=min&&Math.max(i.width,i.height)<=max&&i.width/i.height>=lo&&i.width/i.height<=hi);
 const seconds=(items:ResolvedVideoAsset[],min:number)=>items.every(i=>(i.durationSeconds??0)>=min);
 const h3=['apib-h3','geek-h3-multimodal'].includes(c.kind),multi=['apib-seedance20','apib-seedance25','apib-wan3','apib-kling-feature'].includes(c.kind)||h3;
 if(multi&&!types(videos,videoMime))return fail('参考视频格式没有通道映射');
 if(multi&&c.kind!=='apib-kling-feature'&&!types(audios,c.kind==='geek-h3-multimodal'?[...audioMime,'audio/mp4','audio/x-m4a','audio/aac','audio/aacp','audio/adts']:audioMime))return fail('参考音频格式没有通道映射');
 if(c.kind==='apib-seedance20'){
  const total=videos.reduce((n,v)=>n+(v.durationSeconds??0),0);
  if(audios.length&&!images.length&&!videos.length||videos.length&&(total<=1.8||total>=15.2)||videos.some(v=>!v.width||!v.height||Math.min(v.width,v.height)<480||Math.min(v.width,v.height)>720))return fail('Seedance参考需视觉输入，视频总时长及短边不符合真实通道约束');
 }
 if(c.kind==='apib-seedance25'){
  if(!types(images,['image/jpeg','image/jpg','image/png','image/webp','image/bmp','image/tiff','image/gif','image/heic','image/heif'])||!seconds([...videos,...audios],2)||!dims([...images,...videos],300,6000,0.4,2.5)||videos.some(v=>v.width!*v.height!<409600||v.width!*v.height!>8295044))return fail('Seedance扩展参考的格式、时长或像素不符合真实通道约束');
 }
 if(c.kind==='apib-wan3'&&(!seconds([...videos,...audios],1)||!dims(images,240,8000,1/8,8)||!dims(videos,240,4096,1/8,8)||videos.reduce((n,v)=>n+(v.durationSeconds??0),0)+duration>30))return fail('Wan参考规格或来源加输出总时长超过通道约束');
 if(c.kind==='apib-kling-feature'&&(!seconds(videos,3)||!dims(videos,720,2160,0,Infinity)))return fail('Kling特征视频至少三秒且尺寸为720至2160');
 if(h3){
  if(c.kind==='apib-h3'&&!types(images,['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif'])||!seconds([...videos,...audios],2)||!dims([...images,...videos],256,5760,0.4,2.5)||audios.length&&!images.length&&!videos.length||c.kind==='geek-h3-multimodal'&&media.length>12)return fail('H3参考格式、数量、视觉依赖或真实规格不符合通道要求');
  const frames=media.filter(i=>i.role==='first_frame'||i.role==='last_frame');
  if(c.kind==='geek-h3-multimodal'&&frames.length===2){const [a,b]=frames.map(i=>assets[i.id]);if(Math.abs((a.width!/a.height!)/(b.width!/b.height!)-1)>0.02)return fail('H3首尾帧宽高比差异超过2%');}
 }
 return {ok:true,value:true};
}
