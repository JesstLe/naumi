"use client";
import {useCallback,useEffect,useSyncExternalStore} from 'react';
import type {FeatureId} from '../billing/rules/registry';
import {EMPTY_FEATURE_CATALOG} from './feature-catalog';
import {activeFeatureCatalog,currentFeatureCatalogScope} from './feature-catalog-browser';
export type {FeatureCatalog} from './feature-catalog';
export {FEATURE_MODEL_SELECTION} from './feature-catalog-browser';
export {currentFeatureCatalogScope} from './feature-catalog-browser';

/** Existing public entrypoints all use the same identity-bound owner. */
export const ensureFeatureModelSelection=(feature:FeatureId)=>activeFeatureCatalog().ensure(feature);
export const chosenFeatureModel=(feature:FeatureId)=>activeFeatureCatalog().chosen(feature);
export const featureModelManaged=(feature:FeatureId)=>activeFeatureCatalog().managed(feature);
export const selectFeatureModel=(feature:FeatureId,id:string)=>activeFeatureCatalog().select(feature,id);
export function useFeatureCatalogScope(){
 return useSyncExternalStore(activeFeatureCatalog().subscribeScope,currentFeatureCatalogScope,()=> 'server');
}
export function useFeatureModels(feature:FeatureId){
 const scope=useFeatureCatalogScope();
 const subscribe=useCallback((listener:()=>void)=>activeFeatureCatalog().subscribe(feature,listener),[feature]);
 const getSnapshot=useCallback(()=>activeFeatureCatalog().snapshot(feature),[feature]);
 const snapshot=useSyncExternalStore(subscribe,getSnapshot,()=>EMPTY_FEATURE_CATALOG);
 useEffect(()=>{void activeFeatureCatalog().load(feature,scope).catch(()=>{});},[feature,scope]);
 return{...snapshot,
  reload:useCallback(()=>{void activeFeatureCatalog().load(feature,scope).catch(()=>{});},[feature,scope]),
  setSelected:useCallback((id:string)=>activeFeatureCatalog().select(feature,id,scope),[feature,scope]),
 };
}
