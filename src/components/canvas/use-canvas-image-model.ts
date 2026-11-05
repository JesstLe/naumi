"use client";
import {useCallback,useEffect,useMemo,useRef,useState,type SetStateAction} from 'react';
import {useImageQuality} from '@/lib/image-quality-context';
import {useFeatureModels,useFeatureCatalogScope,currentFeatureCatalogScope} from '@/lib/model-config/feature-client';
import {canvasModelParameters} from '@/lib/canvas/generation-parameters';
import {canvasImageCatalogMode,canvasImageModelSelection,canvasImageRatio,canvasImageResolution,type CanvasImageModels} from '@/lib/canvas/image-model-selection';

type DraftPort={draftKey:string|null;ratio:string;setRatio:(value:SetStateAction<string>)=>void};
const preferenceKey='naumi:canvas-image-model';
function savedModel(){try{return window.localStorage.getItem(preferenceKey)||'';}catch{return '';}}
function rememberModel(model:string){try{window.localStorage.setItem(preferenceKey,model);}catch{/* Optional preference never prevents the in-memory selection. */}}

/** Own only the editor's model/options and resolution selection. Catalogue
 * reads/feature selection,quality,per-node ratio and generation stay original. */
export function useCanvasImageModel(draft:DraftPort){
 const scope=useFeatureCatalogScope();
 const [storedSelection,setSelection]=useState<CanvasImageModels&{scope:string}>({scope,model:'',models:[]});
 const [storedResolution,updateResolution]=useState({scope,value:'1K'});
 const selection=storedSelection.scope===scope?storedSelection:{model:'',models:[]};
 const resolution=storedResolution.scope===scope?storedResolution.value:'1K';
 const setResolution=useCallback((value:SetStateAction<string>)=>{
  if(scope!==currentFeatureCatalogScope())return;
  updateResolution(current=>{const previous=current.scope===scope?current.value:'1K';return{scope,value:typeof value==='function'?value(previous):value};});
 },[scope]);
 const {quality,modelConfig}=useImageQuality('canvas.image',selection.model);
 const {catalog,selected,setSelected,error}=useFeatureModels('canvas.image');
 const latestDraft=useRef(draft);latestDraft.current=draft;
 useEffect(()=>{
  const saved=canvasImageCatalogMode(catalog,modelConfig)==='legacy'?savedModel():'';
  setSelection(current=>{const previous=current.scope===scope?current:{scope,model:'',models:[]};
   const next=canvasImageModelSelection({catalog,selected,config:modelConfig,previous:previous.model,saved});return next?{...next,scope}:previous;
  });
 },[catalog,selected,modelConfig,scope]);
 const parameters=useMemo(()=>canvasModelParameters(selection.models.find(model=>model.id===selection.model)?.generationParameters),[selection.models,selection.model]);
 const {draftKey,ratio}=draft;
 useEffect(()=>{
  const current=latestDraft.current;if(current.draftKey!==draftKey)return;
  current.setRatio(value=>canvasImageRatio(parameters,value));
  setResolution(value=>canvasImageResolution(parameters,value));
 },[parameters,draftKey,ratio,setResolution]);
 function pick(model:string){
  if(scope!==currentFeatureCatalogScope())return;
  if(catalog?.managed){setSelected(model);return;}
  setSelection(current=>({...current,model}));rememberModel(model);
 }
 return {...selection,quality,error,resolution,setResolution,pick,parameters};
}
