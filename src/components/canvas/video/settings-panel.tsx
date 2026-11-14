"use client";
import {CanvasModelSelect} from '../model-select';
import {useVideoI18n} from './i18n';
import {selectedVideoCatalogModel,type VideoCatalogModel,type VideoNodeConfig} from '@/lib/video/client-settings';
import {selectVideoUiModel,selectVideoUiIntent,videoUiPreference} from '@/lib/video/ui-draft';
import type {OrderedInput} from '@/lib/video/references';
import {VideoField} from './form-controls';
import {VideoModeSelect} from './mode-select';
import {VideoContractFields} from './contract-fields';

/** Model selection changes identity only. Controls come from the compiler's
 * public description; existing unmapped values remain editable, never reset. */
export function VideoSettingsPanel({config,models,onChange,onNotice:_,disabled=false,advancedOnly=false,inputs=[]}:{
 config:VideoNodeConfig;models:VideoCatalogModel[];onChange:(next:VideoNodeConfig)=>void;onNotice:(message:string)=>void;disabled?:boolean;advancedOnly?:boolean;inputs?:readonly OrderedInput[];
}){
 const V=useVideoI18n(),model=selectedVideoCatalogModel(models,config),preference=videoUiPreference(config,inputs);
 return <fieldset disabled={disabled} className='space-y-3' data-testid='video-settings-panel'>
  {!advancedOnly&&<><VideoField label={V('视频模型')}><CanvasModelSelect fullWidth disabled={disabled} label={V('视频模型')} placeholder={V('未选择模型')} value={model?`${model.providerId}/${model.modelId}`:''}
   options={models.map(item=>({value:`${item.providerId}/${item.modelId}`,modelId:item.modelId,label:item.label}))} onChange={value=>{const selected=models.find(item=>`${item.providerId}/${item.modelId}`===value);if(selected)onChange(selectVideoUiModel(config,selected));}}/></VideoField>
   <VideoModeSelect value={!preference?'auto':preference==='reference'?'omni_reference':preference} model={model} models={models} disabled={disabled} className='w-full' onSelect={(intent,selected)=>onChange(selectVideoUiIntent(config,selected,intent))}/></>}
  <VideoContractFields config={config} inputs={inputs} contract={model?.execution} onChange={onChange} disabled={disabled} advancedOnly={advancedOnly}/>
 </fieldset>;
}
