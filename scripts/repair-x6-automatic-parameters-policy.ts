import assert from 'node:assert/strict';
import type {ModelConfig} from '../src/lib/model-config/types';

/** One-off reviewed publication candidate. No I/O, discovery overwrite or
 * model-name capability inference in request handling. Explicit edits win. */
export function repairX6AutomaticParameters(original:ModelConfig):ModelConfig {
 const result=structuredClone(original);
 const contracts=[
  ['apib:seedream-5-0-pro','seedream-5-0-pro','seedream-5-0-pro'],
  ['apib:gemini-3-pro-image-preview','gemini-3-pro-image-preview','gemini-3-pro'],
  ['apib:gemini-3.1-flash-image-preview','gemini-3.1-flash-image-preview','gemini-3.1-flash'],
 ] as const;
 for(const [id,wire,doc]of contracts){
  const u=result.upstreamModels.find(u=>u.id===id),p=result.providers.find(p=>p.id===u?.providerId);
  assert(u&&u.model===wire&&u.providerId==='apib-image'&&p?.protocol==='apimart-images','X6_ROUTE_IDENTITY_CHANGED');
  const policy=u.parameterMap.apimartImages;
  assert(policy&&u.parameterMap.resolutionPolicy?.ratioField==='size','X6_WIRE_CONTRACT_CHANGED');
  // Disabled routes and explicit false/unknown declarations are retained.
  if(!u.enabled||!p.enabled)continue;
  const source=`https://docs.apimart.ai/en/api-reference/images/${doc}/generation; related public parameter documentation, not APIB paid runtime acceptance`;
  if(!Object.hasOwn(policy,'automaticRatio'))policy.automaticRatio={enabled:true,source,checkedAt:'2026-10-30'};
  if(u.capabilities.edit&&!Object.hasOwn(u.capabilities.imagegen||{},'edit'))u.capabilities.imagegen={...u.capabilities.imagegen,edit:{state:'supported',source,checkedAt:'2026-10-30'}};
  // Restore only the exact historical six-ratio hold, not arbitrary later
  // administrator exclusions. Native documented pixels are not strict ratios.
  if(wire==='seedream-5-0-pro'&&JSON.stringify(policy.ratios)===JSON.stringify(['21:9','3:2','4:3','1:1','3:4','2:3'])){
   policy.ratios.push('16:9','9:16');
   for(const [key,width,height]of [['1K:16:9',1312,736],['1K:9:16',736,1312],['2K:16:9',2560,1440],['2K:9:16',1440,2560]] as const){
    policy.outputDimensions??={};
    const previous=policy.outputDimensions[key];
    assert(!previous||previous.width===width&&previous.height===height,'X6_PIXEL_TABLE_CHANGED');
    policy.outputDimensions[key]={width,height};
   }
  }
 }
 return result;
}

/** Selective inverse for a fresh CAS publication. Validate ALL touched fields
 * before writing the returned copy; never restore the whole production config. */
export function rollbackX6AutomaticParameters(current:ModelConfig,original:ModelConfig):ModelConfig {
 const expected=repairX6AutomaticParameters(original),changes:{id:string;keys:string[];before:unknown}[]=[];
 const read=(o:any,keys:string[])=>keys.reduce((v,k)=>v?.[k],o);
 for(const old of original.upstreamModels){
  const next=expected.upstreamModels.find(u=>u.id===old.id)!;
  for(const keys of [['parameterMap','apimartImages','automaticRatio'],['capabilities','imagegen','edit'],['parameterMap','apimartImages','ratios'],...['1K:16:9','1K:9:16','2K:16:9','2K:9:16'].map(k=>['parameterMap','apimartImages','outputDimensions',k])]){
   const before=read(old,keys),after=read(next,keys);if(JSON.stringify(before)===JSON.stringify(after))continue;
   const now=current.upstreamModels.find(u=>u.id===old.id);
   assert(now&&now.providerId===old.providerId&&now.model===old.model,'X6_ROLLBACK_ROUTE_CHANGED');
   assert.deepEqual(read(now,keys),after,'X6_ROLLBACK_LATER_EDIT');changes.push({id:old.id,keys,before});
  }
 }
 const result=structuredClone(current);
 for(const {id,keys,before}of changes){
  const target=result.upstreamModels.find(u=>u.id===id)!;let parent:any=target;
  for(const k of keys.slice(0,-1))parent=parent[k];
  if(before===undefined)delete parent[keys.at(-1)!];else parent[keys.at(-1)!]=structuredClone(before);
 }
 for(const u of result.upstreamModels){const old=original.upstreamModels.find(v=>v.id===u.id);if(old&&!old.capabilities.imagegen&&u.capabilities.imagegen&&!Object.keys(u.capabilities.imagegen).length)delete u.capabilities.imagegen;}
 return result;
}
