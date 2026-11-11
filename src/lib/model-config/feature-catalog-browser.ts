"use client";
import {authHeader} from '../supabase';
import {currentWorkspace,currentWorkspaceRevision,WORKSPACE_SELECTION} from '../saas/workspace-client';
import {rememberModelCatalogVersion} from './public-client';
import {subscribeModelCatalogRefresh} from './catalog-refresh';
import {createFeatureCatalog,featureCatalogScopeKey,type FeatureCatalog,type FeatureCatalogScope} from './feature-catalog';
import type {FeatureId} from '../billing/rules/registry';

export const FEATURE_MODEL_SELECTION='naumi:feature-model-selected';
const RELOAD='naumi:feature-model-reload',legacyOwner='naumi:model:legacy-owner';
let actor='',session=0,installed=false;
const scope=():FeatureCatalogScope=>({actor,session,workspace:currentWorkspace(),revision:currentWorkspaceRevision()});
const preferenceScope=(value:FeatureCatalogScope)=>JSON.stringify([value.actor,value.workspace]);
const preferenceKey=(value:FeatureCatalogScope,key:string)=>`${key}:scope:${encodeURIComponent(preferenceScope(value))}`;
// 目录新鲜度:记录每次成功读取的时间,供挂载路径跳过刚拉过的目录(预取→面板挂载不再重复请求)。
// 新鲜还要求当前 scope 存在有效快照:刷新失败会把快照写成 error 状态,此时不得因旧时间戳短路恢复。
// 失效通道(发布总线/身份/工作区切换/显式 reload)不经此判断,依旧真实拉取。
const catalogFetchedAt=new Map<FeatureId,number>();
let catalogEpoch=0;
const CATALOG_FRESH_MS=120_000;
export const featureCatalogFresh=(feature:FeatureId)=>{
 const at=catalogFetchedAt.get(feature);
 if(at===undefined||Date.now()-at>=CATALOG_FRESH_MS)return false;
 const state=store.snapshot(feature);
 return !!(state.catalog&&!state.error);
};
export function prefetchFeatureCatalog(feature:FeatureId){if(!featureCatalogFresh(feature))void activeFeatureCatalog().load(feature).catch(()=>{});}
const store=createFeatureCatalog({
 isCurrent:captured=>featureCatalogScopeKey(captured)===featureCatalogScopeKey(scope()),
 async read(feature,captured,isCurrent){
  // 发布代际:在途请求跨越发布时不标记新鲜,旧目录不得再短路后续挂载/预取(下一次读取会真实重拉)。
  const startedEpoch=catalogEpoch;
  const headers=await authHeader();if(!isCurrent())throw new Error('创作空间已切换');
  headers['x-naumi-workspace']=captured.workspace;
  const response=await fetch(`/api/models?feature=${encodeURIComponent(feature)}`,{cache:'no-store',headers}),data=await response.json();
  if(!isCurrent())throw new Error('创作空间已切换');
  if(!response.ok)throw new Error(data.error||'模型列表加载失败');
  if(startedEpoch===catalogEpoch)catalogFetchedAt.set(feature,Date.now());
  return data as FeatureCatalog;
 },
 preference(captured,key){
  try{
   const storage=window.localStorage,saved=storage.getItem(preferenceKey(captured,key));if(saved)return saved;
   // The old origin-wide preference has no owner. Migrate it once,only to
   // the first non-anonymous actor/workspace;never seed every later account.
   const old=storage.getItem(key);if(!old||!captured.actor)return undefined;
   const owner=storage.getItem(legacyOwner),partition=preferenceScope(captured);
   if(!owner)storage.setItem(legacyOwner,partition);
   return !owner||owner===partition?old:undefined;
  }catch{return undefined;}
 },
 remember(captured,key,value){try{if(value===undefined)window.localStorage.removeItem(preferenceKey(captured,key));else window.localStorage.setItem(preferenceKey(captured,key),value);}catch{/* Optional preference never blocks the live selection. */}},
 version:rememberModelCatalogVersion,
 selectionChanged(){if(typeof window!=='undefined')window.dispatchEvent(new Event(FEATURE_MODEL_SELECTION));},
});
function reloadObserved(){for(const feature of store.subscribedFeatures())void store.load(feature).catch(()=>{});}
function synchronize(){store.activate(scope());}
function install(){
 if(installed||typeof window==='undefined')return;installed=true;
 const changed=()=>{catalogFetchedAt.clear();synchronize();reloadObserved();};
 window.addEventListener(WORKSPACE_SELECTION,changed);
 // 发布事件即时失效:递增代际并清空全部新鲜度时间戳(含当前无人订阅的 feature),
 // 同时作废旧代际在途请求(不得去重到发布前的响应),已订阅项立即重拉。
 subscribeModelCatalogRefresh(()=>{catalogEpoch++;catalogFetchedAt.clear();store.invalidate();reloadObserved();});
 // 显式 reload 是失效通道:作废该 feature 旧代际在途请求(不得复用旧响应冒充重试结果)后真实重拉。
 window.addEventListener(RELOAD,event=>{const feature=(event as CustomEvent<FeatureId>).detail;if(feature){const store=activeFeatureCatalog();store.invalidate(feature);void store.load(feature).catch(()=>{});}});
}
export function activeFeatureCatalog(){install();synchronize();return store;}
/** Called by the existing AuthProvider at real identity transitions,not by
 * individual selectors. This partitions reads;it does not establish a session. */
export function activateFeatureCatalogIdentity(email:string|null,restart=false){
 const next=(email||'').trim().toLowerCase();if(next===actor&&!restart)return;
 actor=next;session++;catalogFetchedAt.clear();activeFeatureCatalog();reloadObserved();
}
export const currentFeatureCatalogScope=()=>activeFeatureCatalog().scopeKey();
