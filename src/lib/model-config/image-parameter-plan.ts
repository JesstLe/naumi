import {z} from 'zod';
import {acceptsAPIMartRatio} from './apimart-image-policy';
import {ModelConfigError,type UpstreamModel} from './types';
import {policyQuality} from './quality-policy';
import {mapResolution,RESOLUTION_FIELDS} from './resolution-policy';
import {exactRatioPixels} from '../imagegen/request-size';
import {IMAGEGEN_FIELDS_BY_CAPABILITY} from '../imagegen/capabilities';
import type {CapabilityKey,CapabilitySet} from '../imagegen/types';

const scalar=z.union([z.string().max(200),z.number().finite(),z.boolean()]);
export const imageParameterSelectionSchema=z.strictObject({quality:z.string().min(1).max(100),resolution:z.string().min(1).max(100),ratio:z.string().min(1).max(100),advanced:z.record(z.string(),scalar).optional()});
export type ImageParameterSelection=z.infer<typeof imageParameterSelectionSchema>;
export const imageParameterPlanSchema=z.strictObject({version:z.literal(1),upstreamId:z.string().max(100),wireModel:z.string().max(200),protocol:z.string().max(50),modelVersion:z.number().int().nonnegative(),requested:imageParameterSelectionSchema,wire:z.record(z.string(),scalar),clear:z.array(z.string().max(100)).max(40),effective:z.strictObject({quality:z.string().max(100).optional(),resolution:z.string().max(100).optional(),ratio:z.string().max(100)}),expectedPixels:z.strictObject({width:z.number().int().positive(),height:z.number().int().positive()}).optional()});
export type ImageParameterPlan=z.infer<typeof imageParameterPlanSchema>;
export const imageParameterPlansSchema=z.record(z.string(),imageParameterPlanSchema);
export type ImageParameterPlans=Record<string,ImageParameterPlan>;
const fail=(message:string):never=>{throw new ModelConfigError('IMAGE_MAPPING_INVALID',message,422);};
const safePath=(field:string)=>/^[A-Za-z][A-Za-z0-9]*(?:[_.][A-Za-z][A-Za-z0-9]*)*$/.test(field)&&!field.split('.').some(k=>['__proto__','prototype','constructor'].includes(k));
const tier=(value:unknown)=>typeof value==='string'&&/^[124]k$/i.test(value)?value.toUpperCase():undefined;

/** Pure, public-data-only compiler. Published maps own execution; discovery
 * evidence is not a second whitelist. The result contains no credentials/media. */
export function compileImageParameterPlan(source:Pick<UpstreamModel,'id'|'model'|'parameterMap'>,selection:ImageParameterSelection,context:{publicModelId:string;protocol:string;modelVersion:number;adapter?:string}):ImageParameterPlan{
 const requested=imageParameterSelectionSchema.parse(selection),map=source.parameterMap,wire:Record<string,string|number|boolean>={},clear=new Set<string>();
 const put=(field:string,value:string|number|boolean)=>{
  if(!safePath(field))fail('参数字段无效：'+field);
  if(Object.hasOwn(wire,field)&&wire[field]!==value)fail('同一字段存在冲突映射：'+field);
  wire[field]=value;clear.add(field);
 };
 let quality:string|undefined;
 if(map.qualityPolicy){clear.add('quality');quality=policyQuality(map.qualityPolicy,requested.quality);if(quality!==undefined)put('quality',quality!);}
 else if(map.quality&&Object.keys(map.quality).length){quality=map.quality[requested.quality as keyof typeof map.quality];if(quality===undefined)fail('未配置质量映射：'+requested.quality);put('quality',quality!);}
 // With no manual mapping the existing protocol default remains unchanged.
 let resolution:string|undefined,expectedPixels:{width:number;height:number}|undefined;
 const adapter=map.apimartImages;
 const pixels=adapter&&!acceptsAPIMartRatio(adapter,requested.ratio)?exactRatioPixels(requested.ratio,context.publicModelId):undefined;
 if(adapter&&!acceptsAPIMartRatio(adapter,requested.ratio)&&!pixels)fail('未配置此比例的发送方式：'+requested.ratio);
 if(adapter&&requested.ratio==='auto'&&adapter.automaticRatio?.enabled&&!map.resolutionPolicy?.ratioField)fail('自适应画幅缺少比例发送字段');
 if(pixels){
  RESOLUTION_FIELDS.forEach(f=>clear.add(f));
  const field=map.resolutionPolicy?.ratioField&&map.resolutionPolicy.ratioField!==map.resolutionPolicy.field?map.resolutionPolicy.ratioField:'size';
  put(field,`${pixels.width}x${pixels.height}`);expectedPixels=pixels;
 }else if(map.resolutionPolicy){
  if(map.resolutionPolicy.mode==='map'&&map.resolutionPolicy.field===map.resolutionPolicy.ratioField)fail('分辨率与比例不能写入同一字段');
  RESOLUTION_FIELDS.forEach(f=>clear.add(f));
  const body:Record<string,any>={};mapResolution(body,map.resolutionPolicy,requested.resolution,requested.ratio);
  const flatten=(value:Record<string,any>,prefix='')=>{for(const [key,v]of Object.entries(value)){const field=prefix?prefix+'.'+key:key;if(v&&typeof v==='object')flatten(v,field);else put(field,v);}};flatten(body);
  resolution=map.resolutionPolicy.mode==='map'?map.resolutionPolicy.values[requested.resolution as '1K']:undefined;
 }else if(map.resolution?.[requested.resolution as keyof typeof map.resolution]){
  RESOLUTION_FIELDS.forEach(f=>clear.add(f));resolution=map.resolution[requested.resolution as keyof typeof map.resolution];put('size',resolution!);
 }
 for(const [key,value]of Object.entries(requested.advanced||{})){
  const fields=IMAGEGEN_FIELDS_BY_CAPABILITY[key as CapabilityKey];if(!fields)fail('未知图片参数：'+key);
  const field=map.imagegen?.[key as CapabilityKey];
  if(field==='omit'){fields.filter(f=>f!=='omit').forEach(f=>clear.add(f));continue;}
  if(!field){if(['outputFormat','outputCompression','transparent'].includes(key))continue;fail('未配置参数映射：'+key);}
  if(!fields.includes(field!))fail('实际参数字段不匹配：'+key);
  put(field!,value);
 }
 // An omitted field cannot be reintroduced by a second mapping layer.
 for(const [key,field]of Object.entries(map.imagegen||{}))if(field==='omit'){
  for(const f of IMAGEGEN_FIELDS_BY_CAPABILITY[key as CapabilityKey]||[])if(f!=='omit'){if(Object.hasOwn(wire,f))fail('不发送与字段映射冲突：'+f);clear.add(f);}
 }
 if(map.qualityPolicy?.mode==='omit'&&Object.hasOwn(wire,'quality'))fail('质量不发送与字段映射冲突');
 const effectiveResolution=tier(resolution)||(resolution&&map.resolutionPolicy?.mode==='map'?(['1K','2K','4K'] as const).find(t=>map.resolutionPolicy!.values[t]===resolution):undefined);
 if(!expectedPixels&&adapter&&effectiveResolution)expectedPixels=adapter.outputDimensions?.[`${effectiveResolution}:${requested.ratio}`];
 return imageParameterPlanSchema.parse({version:1,upstreamId:source.id,wireModel:source.model,protocol:context.protocol,modelVersion:context.modelVersion,requested,wire,clear:[...clear],effective:{...(quality!==undefined?{quality}:{}),...(effectiveResolution?{resolution:effectiveResolution}:{}),ratio:requested.ratio},...(expectedPixels?{expectedPixels}:{})});
}

/** Mutates only allowlisted image parameter fields; model/auth/prompt stay owned
 * by their existing protocol. Omit really removes inherited SDK defaults. */
export function applyImageParameterPlan(body:Record<string,any>,plan:ImageParameterPlan){
 for(const field of plan.clear){const keys=field.split('.');let parent=body;for(const key of keys.slice(0,-1)){parent=parent?.[key];if(!parent||typeof parent!=='object')break;}if(parent&&typeof parent==='object')delete parent[keys.at(-1)!];}
 for(const [field,value]of Object.entries(plan.wire)){if(!safePath(field))fail('冻结参数字段无效');const keys=field.split('.');let parent=body;for(const key of keys.slice(0,-1))parent=parent[key]=parent[key]&&typeof parent[key]==='object'?parent[key]:{};parent[keys.at(-1)!]=value;}
 return body;
}

/** Explicit administrator fields are executable configuration, not discovery.
 * Structural edit/mask constraints remain separate and are never fabricated. */
export function configuredImageCapabilities(source:Pick<UpstreamModel,'capabilities'|'parameterMap'>,legacy:CapabilitySet):CapabilitySet{
 const result=structuredClone(legacy);
 for(const [key,field]of Object.entries(source.parameterMap.imagegen||{}))if(field!=='omit'&&IMAGEGEN_FIELDS_BY_CAPABILITY[key as CapabilityKey]?.includes(field))result[key as CapabilityKey]={state:'supported',source:'管理员已发布参数映射',checkedAt:''};
 return result;
}

export function imagePlanSelection(facts:{quality:string;resolution:string;requestedResolution?:string;ratio?:string},request?:{parameters?:Record<string,unknown>;output?:Record<string,unknown>}):ImageParameterSelection{
 const p=request?.parameters||{},o=request?.output||{},advanced:Record<string,string|number|boolean>={};
 for(const key of ['inputFidelity','moderation']as const)if(typeof p[key]==='string')advanced[key]=p[key] as string;
 if(typeof p.width==='number'&&typeof p.height==='number')advanced.pixelSize=`${p.width}x${p.height}`;
 if(typeof o.background==='string')advanced.transparent=o.background;
 if(typeof o.format==='string')advanced.outputFormat=o.format;
 if(o.compressionMode==='native'&&typeof o.compression==='number')advanced.outputCompression=o.compression;
 return {quality:facts.quality,resolution:facts.requestedResolution||facts.resolution,ratio:facts.ratio||'1:1',...(Object.keys(advanced).length?{advanced}:{})};
}
