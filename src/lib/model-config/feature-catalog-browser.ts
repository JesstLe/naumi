"use client";
import {authHeader} from '../supabase';
import {currentWorkspace,currentWorkspaceRevision,WORKSPACE_SELECTION} from '../saas/workspace-client';
import {MODEL_CATALOG_REFRESH,rememberModelCatalogVersion} from './public-client';
import {createFeatureCatalog,featureCatalogScopeKey,type FeatureCatalog,type FeatureCatalogScope} from './feature-catalog';
import type {FeatureId} from '../billing/rules/registry';

export const FEATURE_MODEL_SELECTION='naumi:feature-model-selected';
const RELOAD='naumi:feature-model-reload',legacyOwner='naumi:model:legacy-owner';
let actor='',session=0,installed=false;
const scope=():FeatureCatalogScope=>({actor,session,workspace:currentWorkspace(),revision:currentWorkspaceRevision()});
const preferenceScope=(value:FeatureCatalogScope)=>JSON.stringify([value.actor,value.workspace]);
const preferenceKey=(value:FeatureCatalogScope,key:string)=>`${key}:scope:${encodeURIComponent(preferenceScope(value))}`;
const store=createFeatureCatalog({
 isCurrent:captured=>featureCatalogScopeKey(captured)===featureCatalogScopeKey(scope()),
 async read(feature,captured,isCurrent){
  const headers=await authHeader();if(!isCurrent())throw new Error('创作空间已切换');
  headers['x-naumi-workspace']=captured.workspace;
  const response=await fetch(`/api/models?feature=${encodeURIComponent(feature)}`,{cache:'no-store',headers}),data=await response.json();
  if(!isCurrent())throw new Error('创作空间已切换');
  if(!response.ok)throw new Error(data.error||'模型列表加载失败');
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
let observedAt=0;
function reloadObserved(){observedAt=Date.now();for(const feature of store.subscribedFeatures())void store.load(feature).catch(()=>{});}
// Every window focus reloaded every subscribed catalog. A changed catalog is still
// caught by MODEL_CHANGED (409) -> MODEL_CATALOG_REFRESH, which reloads immediately.
function reloadOnReturn(){if(Date.now()-observedAt>=60_000)reloadObserved();}
function synchronize(){store.activate(scope());}
function install(){
 if(installed||typeof window==='undefined')return;installed=true;
 const changed=()=>{synchronize();reloadObserved();};
 window.addEventListener(WORKSPACE_SELECTION,changed);
 window.addEventListener(MODEL_CATALOG_REFRESH,reloadObserved);
 window.addEventListener('focus',reloadOnReturn);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reloadOnReturn();});
 window.addEventListener(RELOAD,event=>{const feature=(event as CustomEvent<FeatureId>).detail;if(feature)void activeFeatureCatalog().load(feature).catch(()=>{});});
}
export function activeFeatureCatalog(){install();synchronize();return store;}
/** Called by the existing AuthProvider at real identity transitions,not by
 * individual selectors. This partitions reads;it does not establish a session. */
export function activateFeatureCatalogIdentity(email:string|null,restart=false){
 const next=(email||'').trim().toLowerCase();if(next===actor&&!restart)return;
 actor=next;session++;activeFeatureCatalog();reloadObserved();
}
export const currentFeatureCatalogScope=()=>activeFeatureCatalog().scopeKey();
