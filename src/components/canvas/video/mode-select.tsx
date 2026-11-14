"use client";
import {SelectMenu} from '@/components/ui/select-menu';
import type {VideoCatalogModel} from '@/lib/video/client-settings';
import {VIDEO_CREATION_LABELS,type VideoCreationIntent} from '@/lib/video/mode-selection';
import {useVideoI18n} from './i18n';

/** An intent picker does not select another model or consult capability data.
 * Missing mappings are diagnosed by the same server compiler as submission. */
export function VideoModeSelect({value,model,models:_,disabled,className,onSelect}:{value:VideoCreationIntent|'auto';model?:VideoCatalogModel;models:VideoCatalogModel[];disabled:boolean;className:string;onSelect:(intent:VideoCreationIntent|'auto',model:VideoCatalogModel)=>void}){
 const V=useVideoI18n();if(model?.execution?.workflow)return null;
 const intents=model?.execution?model.execution.operations.map(op=>op.intent==='reference'?'omni_reference' as const:op.intent):Object.keys(VIDEO_CREATION_LABELS) as VideoCreationIntent[];
 const values=[...new Set(['auto',...intents,value])];
 return <div className='min-w-0' data-testid='video-mode-control'><SelectMenu label={V('视频生成模式')} size='sm' value={value} disabled={disabled||!model} className={className} popoverClassName='canvas-ui-light'
  onChange={selected=>{if(model)onSelect(selected as VideoCreationIntent|'auto',model);}} options={values.map(intent=>({value:intent,label:V(intent==='auto'?'自动':VIDEO_CREATION_LABELS[intent as VideoCreationIntent]||intent),buttonLabel:V(intent==='auto'?'自动':VIDEO_CREATION_LABELS[intent as VideoCreationIntent]||intent)}))}/></div>;
}
