import 'server-only';
import {toFile} from 'openai';
import {modelAwareOpenAI} from '../model-config/clients';
import {observeOpenAI} from '../bi/model-calls';
import {getOpenAISettings} from '../settings';
import {getOpenAIBaseUrl} from '../openai-base';
import {withQualityFallback,sdkImageQuality} from '../image-quality-request';
import type {ResolvedImageQuality} from '../image-quality';

export type ModelImageTool='upscale'|'printfile';
/** Tool intent only. The managed client owns frozen model/parameter mapping,
 * supplier attempt identity and usage. No local enhancement or resize fallback. */
export async function generateToolImage(input:{tool:ModelImageTool;bytes:Buffer;type:string;quality:ResolvedImageQuality;direction?:string;scale?:number}){
  const settings=await getOpenAISettings();
  const prompt=input.tool==='upscale'
    ? `修复这张图像的模糊、压缩噪点和缺失细节，输出清晰图像。保持主体身份、构图、文字、颜色与原图一致。${input.direction==='portrait'?'重点恢复真实面部、皮肤与发丝细节。':input.direction==='product'?'重点恢复商品材质、边缘和印刷标识。':'保持原有画面风格和细节。'}${input.scale?`以原图 ${input.scale} 倍清晰度为修复目标；实际输出尺寸按所选模型参数。`:''}`
    : '将这张图像修复为适合印刷的高清图稿，提升细小线条与材质的清晰度，保留原有构图、主体、全部文字、标识、颜色及已有透明区域。';
  const client=observeOpenAI(modelAwareOpenAI({apiKey:settings.apiKey,baseURL:(await getOpenAIBaseUrl())||undefined,timeout:240_000,maxRetries:0}));
  const ext=input.type==='image/jpeg'?'jpg':input.type==='image/webp'?'webp':'png';
  const result=await withQualityFallback(input.quality,async quality=>client.images.edit({model:settings.model,image:await toFile(input.bytes,`input.${ext}`,{type:input.type}),prompt,n:1,size:'auto' as '1024x1024',quality:sdkImageQuality(quality)}),settings.model);
  const image=result.data?.[0];
  if(image?.b64_json)return Buffer.from(image.b64_json,'base64');
  if(image?.url){const response=await fetch(image.url,{signal:AbortSignal.timeout(30_000),redirect:'error'});if(response.ok)return Buffer.from(await response.arrayBuffer());}
  throw new Error('模型未返回图片，原任务结果待核实');
}
