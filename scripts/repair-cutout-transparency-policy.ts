import type {ModelConfig} from '../src/lib/model-config/types';

/** Upstreams that actually serve the cutout feature: the image.cutout binding's
 * public model (its direct target or every supplier-routing channel). */
export function cutoutUpstreamIds(config:ModelConfig):string[]{
 const id=config.bindings['image.cutout'];if(!id)return [];
 const model=config.publicModels.find(m=>m.id===id);if(!model)return [];
 const ids=model.supplierRouting?model.supplierRouting.channels.map(c=>c.upstreamId):model.target.type==='upstream'?[model.target.id]:[];
 return Array.from(new Set(ids));
}

/** Pure copy transform, no I/O. Only apimart-images upstreams that already
 * declare transparent capability and have no explicit transparency mapping get
 * imagegen.transparent='background'. An administrator's existing value
 * (including 'omit') is never overwritten; nothing else changes. */
export function mapCutoutTransparency(original:ModelConfig):{config:ModelConfig;changed:string[]}{
 const config=structuredClone(original),changed:string[]=[];
 for(const id of cutoutUpstreamIds(config)){
  const upstream=config.upstreamModels.find(u=>u.id===id);if(!upstream)continue;
  const provider=config.providers.find(p=>p.id===upstream.providerId);
  if(provider?.protocol!=='apimart-images'||!upstream.capabilities.transparent)continue;
  const imagegen=(upstream.parameterMap as {imagegen?:Record<string,string>}).imagegen;
  if(imagegen&&Object.hasOwn(imagegen,'transparent'))continue;
  (upstream.parameterMap as {imagegen?:Record<string,string>}).imagegen={...(imagegen||{}),transparent:'background'};
  changed.push(id);
 }
 return {config,changed};
}
