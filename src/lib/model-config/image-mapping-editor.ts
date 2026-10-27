import {z} from 'zod';
import {compileImageParameterPlan} from './image-parameter-plan';
import {qualityPolicySchema} from './quality-policy';
import {resolutionPolicySchema} from './resolution-policy';
import {ModelConfigError,type ModelConfig} from './types';
export const imageMappingEditorSchema=z.strictObject({qualities:z.array(z.enum(['low','medium','high','xhigh','max'])).min(1).max(5),resolutions:z.array(z.enum(['1K','2K','4K'])).min(1).max(3),routes:z.array(z.strictObject({upstreamId:z.string().max(100),quality:qualityPolicySchema,resolution:resolutionPolicySchema})).min(1).max(100)});
export type ImageMappingEditorInput=z.infer<typeof imageMappingEditorSchema>;
export function applyImageMappingEditor(config:ModelConfig,publicIds:string[],upstreamIds:string[],input:ImageMappingEditorInput){
 const value=imageMappingEditorSchema.parse(input),ids=new Set(upstreamIds);
 if(ids.size!==value.routes.length||new Set(value.routes.map(r=>r.upstreamId)).size!==ids.size||value.routes.some(r=>!ids.has(r.upstreamId)))throw new ModelConfigError('IMAGE_MAPPING_INVALID','通道集合已变更，请刷新后配置',409);
 const next=structuredClone(config);
 for(const model of next.publicModels)if(publicIds.includes(model.id))model.displayResolutions=value.resolutions;
 for(const route of value.routes){
  if(route.quality.choices.length!==value.qualities.length||value.qualities.some(id=>!route.quality.choices.some(c=>c.id===id)))throw new ModelConfigError('IMAGE_MAPPING_INVALID','显示质量与通道映射不一致',422);
  const source=next.upstreamModels.find(u=>u.id===route.upstreamId)!;
  source.parameterMap.qualityPolicy=route.quality;source.parameterMap.resolutionPolicy=route.resolution;
  const provider=next.providers.find(p=>p.id===source.providerId)!;
  const ratio=source.parameterMap.apimartImages?.ratios[0]||'1:1';
  for(const quality of value.qualities)for(const resolution of value.resolutions)compileImageParameterPlan(source,{quality,resolution,ratio},{publicModelId:publicIds[0],protocol:provider.protocol,modelVersion:0,adapter:provider.options?.imageAdapter});
 }
 return next;
}
