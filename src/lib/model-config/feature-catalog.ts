import type {FeatureId} from '../billing/rules/registry';
import {compactImageModelOptions,imageModelDisplayId} from '../image-model-routing';
import {adminConfiguredFeature} from './selection-policy';

export type FeatureCatalog={managed:boolean;supported?:boolean;available?:boolean;feature:FeatureId;version?:number;defaultModelId?:string;models:{id:string;label:string;creditHint?:string;modality:string;supportsEdit:boolean;qualities?:string[];qualityLabels?:Record<string,string>;nativeResolutions?:string[];generationParameters?:{ratios?:string[];resolutions?:string[];combinations?:string[]}}[]};
export type FeatureCatalogScope={actor:string;session:number;workspace:string;revision:number};
export type FeatureCatalogSnapshot={catalog:FeatureCatalog|null;selected:string;error:string|null};
export const EMPTY_FEATURE_CATALOG:FeatureCatalogSnapshot={catalog:null,selected:'',error:null};
export const featureCatalogScopeKey=(scope:FeatureCatalogScope)=>JSON.stringify([scope.actor,scope.session,scope.workspace,scope.revision]);
type Ports={
 read:(feature:FeatureId,scope:FeatureCatalogScope,isCurrent:()=>boolean)=>Promise<FeatureCatalog>;
 isCurrent:(scope:FeatureCatalogScope)=>boolean;
 preference:(scope:FeatureCatalogScope,key:string)=>string|undefined;
 remember:(scope:FeatureCatalogScope,key:string,value:string|undefined)=>void;
 version:(version?:number)=>void;
 selectionChanged:()=>void;
};
const canvasKind=(feature:FeatureId)=>feature.startsWith('canvas.')?(['canvas.image','canvas.expand','canvas.text-edit','canvas.annotate'].includes(feature)?'image':'text'):undefined;

/** One active identity lifetime owns catalogue reads,selection and subscribers.
 * Auth/HTTP/storage stay at the browser boundary;this owner never grants access. */
export function createFeatureCatalog(ports:Ports){
 let scope:FeatureCatalogScope|undefined,key='';
 const snapshots=new Map<FeatureId,FeatureCatalogSnapshot>(),inflight=new Map<FeatureId,Promise<FeatureCatalog>>(),canvasSelections=new Map<string,string>();
 const listeners=new Map<FeatureId,Set<()=>void>>(),scopeListeners=new Set<()=>void>();
 const emit=(feature:FeatureId)=>{for(const listener of listeners.get(feature)??[])listener();};
 const current=(captured=scope)=>!!captured&&captured===scope&&ports.isCurrent(captured);
 const assertCurrent=(captured:FeatureCatalogScope|undefined)=>{if(!current(captured))throw new Error('创作空间已切换');};
 function activate(next:FeatureCatalogScope){
  const nextKey=featureCatalogScopeKey(next);if(key===nextKey)return;
  scope={...next};key=nextKey;snapshots.clear();inflight.clear();canvasSelections.clear();ports.version();
  for(const feature of listeners.keys())emit(feature);
  for(const listener of scopeListeners)listener();
  ports.selectionChanged();
 }
 function chosen(feature:FeatureId){
  if(!current()||adminConfiguredFeature(feature))return undefined;
  const state=snapshots.get(feature);if(!state?.catalog)return undefined;
  const kind=canvasKind(feature),group=kind?canvasSelections.get(kind):undefined;
  return state.catalog.models.find(model=>group&&imageModelDisplayId(model.id)===imageModelDisplayId(group))?.id||state.selected||state.catalog.defaultModelId;
 }
 function accept(feature:FeatureId,input:FeatureCatalog,captured:FeatureCatalogScope){
  assertCurrent(captured);const previous=snapshots.get(feature);let catalog=input;
  if(input.models.some(model=>model.modality==='image')){
   const models=compactImageModelOptions(input.models,[input.defaultModelId].filter((id):id is string=>!!id));
   catalog={...input,models,defaultModelId:models.find(model=>imageModelDisplayId(model.id)===imageModelDisplayId(input.defaultModelId||''))?.id||models[0]?.id};
  }
  let selected='';
  if(adminConfiguredFeature(feature))ports.remember(captured,`naumi:model:${feature}`,undefined);
  else{
   const kind=canvasKind(feature),savedGroup=kind?ports.preference(captured,`naumi:model:canvas:${kind}`):undefined;
   if(kind&&savedGroup)canvasSelections.set(kind,savedGroup);
   const saved=(kind?canvasSelections.get(kind):undefined)||previous?.selected||ports.preference(captured,`naumi:model:${feature}`);
   selected=catalog.models.find(model=>imageModelDisplayId(model.id)===imageModelDisplayId(saved||''))?.id||catalog.models.find(model=>model.id===catalog.defaultModelId)?.id||catalog.models[0]?.id||'';
  }
  snapshots.set(feature,{catalog,selected,error:null});if(catalog.managed)ports.version(catalog.version);emit(feature);
  if(previous?.catalog?.version&&previous.catalog.version!==catalog.version)ports.selectionChanged();
  return catalog;
 }
 function load(feature:FeatureId,expected=key):Promise<FeatureCatalog>{
  if(expected!==key||!current())return Promise.reject(new Error('创作空间已切换'));
  const existing=inflight.get(feature);if(existing)return existing;
  const captured=scope!;const state=snapshots.get(feature);if(state?.error){snapshots.set(feature,{...state,error:null});emit(feature);}
  const promise=Promise.resolve().then(()=>{assertCurrent(captured);return ports.read(feature,captured,()=>current(captured));}).then(data=>accept(feature,data,captured)).catch(error=>{
   if(current(captured)){snapshots.set(feature,{catalog:null,selected:'',error:error instanceof Error?error.message:'读取失败'});emit(feature);}
   throw error;
  }).finally(()=>{if(inflight.get(feature)===promise)inflight.delete(feature);});
  inflight.set(feature,promise);return promise;
 }
 async function ensure(feature:FeatureId){
  const captured=scope;assertCurrent(captured);let catalog=snapshots.get(feature)?.catalog;
  if(!catalog){catalog=await load(feature);assertCurrent(captured);ports.selectionChanged();}
  if(!catalog.managed||adminConfiguredFeature(feature))return undefined;
  const selected=chosen(feature);
  if(catalog.available===false||catalog.supported===false||!selected||!catalog.models.some(model=>model.id===selected))throw new Error('当前功能没有启用模型，请联系管理员配置');
  return selected;
 }
 function select(feature:FeatureId,id:string,expected=key){
  if(expected!==key||!current()||adminConfiguredFeature(feature))return;
  const state=snapshots.get(feature);if(!state?.catalog?.models.some(model=>model.id===id))return;
  snapshots.set(feature,{...state,selected:id});const kind=canvasKind(feature);
  if(kind){canvasSelections.set(kind,id);ports.remember(scope!,`naumi:model:canvas:${kind}`,id);}
  ports.remember(scope!,`naumi:model:${feature}`,id);
  for(const [other,value]of snapshots){const selected=chosen(other)||'';if(value.selected!==selected)snapshots.set(other,{...value,selected});emit(other);}
  ports.selectionChanged();
 }
 return{activate,scopeKey:()=>key,chosen,load,ensure,select,
  managed:(feature:FeatureId)=>current()&&snapshots.get(feature)?.catalog?.managed===true,
  snapshot:(feature:FeatureId)=>snapshots.get(feature)||EMPTY_FEATURE_CATALOG,
  subscribedFeatures:()=>[...listeners].filter(([,set])=>set.size).map(([feature])=>feature),
  subscribe:(feature:FeatureId,listener:()=>void)=>{let set=listeners.get(feature);if(!set){set=new Set();listeners.set(feature,set);}set.add(listener);return()=>{set.delete(listener);if(!set.size)listeners.delete(feature);};},
  subscribeScope:(listener:()=>void)=>{scopeListeners.add(listener);return()=>{scopeListeners.delete(listener);};},
 };
}
