import {canonicalPublicModelId} from "./public-identity";
import type {FeatureId} from '../billing/rules/registry';
import {compactImageModelOptions,imageModelDisplayId} from '../image-model-routing';
import {adminConfiguredFeature} from './selection-policy';

export type FeatureCatalog={managed:boolean;supported?:boolean;available?:boolean;feature:FeatureId;version?:number;defaultModelId?:string;models:{id:string;previousIds?:string[];label:string;creditHint?:string;modality:string;supportsEdit:boolean;qualities?:string[];qualityLabels?:Record<string,string>;nativeResolutions?:string[];generationParameters?:{ratios?:string[];resolutions?:string[];combinations?:string[]}}[]};
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
 // 按 feature 记代际:全局失效(发布)递增全部有活动的 feature;单项目失效(显式 reload)只递增自身,
 // 不殃及其他 feature 的在途请求(否则它们的 ensure 等待会被无谓打断)。
 const generations=new Map<FeatureId,number>();
 // 快照提交代际:失效保留旧快照供展示,但只有当前代际提交的目录才能作为被取代请求的衔接目标。
 const snapshotGenerations=new Map<FeatureId,number>();
 const featureGen=(feature:FeatureId)=>generations.get(feature)||0;
 const snapshots=new Map<FeatureId,FeatureCatalogSnapshot>(),inflight=new Map<FeatureId,Promise<FeatureCatalog>>(),canvasSelections=new Map<string,string>();
 const listeners=new Map<FeatureId,Set<()=>void>>(),scopeListeners=new Set<()=>void>();
 const emit=(feature:FeatureId)=>{for(const listener of listeners.get(feature)??[])listener();};
 const current=(captured=scope)=>!!captured&&captured===scope&&ports.isCurrent(captured);
 const assertCurrent=(captured:FeatureCatalogScope|undefined)=>{if(!current(captured))throw new Error('创作空间已切换');};
 function activate(next:FeatureCatalogScope){
  const nextKey=featureCatalogScopeKey(next);if(key===nextKey)return;
  scope={...next};key=nextKey;snapshots.clear();snapshotGenerations.clear();inflight.clear();canvasSelections.clear();ports.version();
  for(const feature of listeners.keys())emit(feature);
  for(const listener of scopeListeners)listener();
  ports.selectionChanged();
 }
 function chosen(feature:FeatureId){
  if(!current()||adminConfiguredFeature(feature))return undefined;
  const state=snapshots.get(feature);if(!state?.catalog)return undefined;
  const kind=canvasKind(feature),group=kind?canvasSelections.get(kind):undefined;
  return state.catalog.models.find(model=>group&&imageModelDisplayId(model.id)===imageModelDisplayId(canonicalPublicModelId(state.catalog!.models,group)))?.id||state.selected||state.catalog.defaultModelId;
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
   selected=catalog.models.find(model=>imageModelDisplayId(model.id)===imageModelDisplayId(canonicalPublicModelId(catalog.models,saved||'')))?.id||catalog.models.find(model=>model.id===catalog.defaultModelId)?.id||catalog.models[0]?.id||'';
  }
  snapshots.set(feature,{catalog,selected,error:null});snapshotGenerations.set(feature,featureGen(feature));if(catalog.managed)ports.version(catalog.version);emit(feature);
  if(previous?.catalog?.version&&previous.catalog.version!==catalog.version)ports.selectionChanged();
  return catalog;
 }
 /** 失效:发布传全局(所有有活动的 feature 代际递增、在途作废,后续 load 真实重拉);
  * 显式 reload 传 feature,仅作废该 feature 的在途请求。旧响应晚到时由 load 的代际防护拒绝提交。 */
 function invalidate(feature?:FeatureId){
  if(feature!==undefined){generations.set(feature,featureGen(feature)+1);inflight.delete(feature);return;}
  const all=new Set<FeatureId>([...inflight.keys(),...snapshots.keys(),...generations.keys()]);
  for(const f of all)generations.set(f,featureGen(f)+1);
  inflight.clear();
 }
 function load(feature:FeatureId,expected=key):Promise<FeatureCatalog>{
  if(expected!==key||!current())return Promise.reject(new Error('创作空间已切换'));
  const existing=inflight.get(feature);if(existing)return existing;
  const captured=scope!,startedGeneration=featureGen(feature);const state=snapshots.get(feature);if(state?.error){snapshots.set(feature,{...state,error:null});emit(feature);}
  // 被新代际取代(发布/显式失效后晚到):不提交旧响应、不把取代误报为错误,
  // 直接衔接当前代际——等待已在途的新请求,或采用当前代际已提交的新目录,否则重发真实请求。
  const superseded=():Promise<FeatureCatalog>|FeatureCatalog=>{
   const retry=inflight.get(feature);if(retry)return retry;
   const fresh=snapshots.get(feature)?.catalog;
   if(fresh&&snapshotGenerations.get(feature)===featureGen(feature))return fresh;
   throw new Error('模型目录已更新');
  };
  const promise=Promise.resolve().then(()=>{assertCurrent(captured);return ports.read(feature,captured,()=>current(captured));}).then(data=>{
   // 身份校验先于衔接:scope 已切换的旧身份请求立即拒绝,不得等待甚至接上其他身份的在途请求。
   if(!current(captured))throw new Error('创作空间已切换');
   if(startedGeneration!==featureGen(feature))return superseded();
   return accept(feature,data,captured);
  },error=>{
   if(startedGeneration!==featureGen(feature)&&current(captured))return superseded();
   throw error;
  }).catch(error=>{
   if(startedGeneration===featureGen(feature)&&current(captured)){snapshots.set(feature,{catalog:null,selected:'',error:error instanceof Error?error.message:'读取失败'});emit(feature);}
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
 return{activate,invalidate,scopeKey:()=>key,chosen,load,ensure,select,
  managed:(feature:FeatureId)=>current()&&snapshots.get(feature)?.catalog?.managed===true,
  snapshot:(feature:FeatureId)=>snapshots.get(feature)||EMPTY_FEATURE_CATALOG,
  subscribedFeatures:()=>[...listeners].filter(([,set])=>set.size).map(([feature])=>feature),
  subscribe:(feature:FeatureId,listener:()=>void)=>{let set=listeners.get(feature);if(!set){set=new Set();listeners.set(feature,set);}set.add(listener);return()=>{set.delete(listener);if(!set.size)listeners.delete(feature);};},
  subscribeScope:(listener:()=>void)=>{scopeListeners.add(listener);return()=>{scopeListeners.delete(listener);};},
 };
}
