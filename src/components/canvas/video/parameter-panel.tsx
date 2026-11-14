"use client";
import type {ResolvedVideoCapability} from '@/lib/video/capability-schema';
import type {VideoNodeConfig} from '@/lib/video/client-settings';
import type {VideoUiContract} from '@/lib/video/ui-contract';
import type {OrderedInput} from '@/lib/video/references';
import {VideoContractFields} from './contract-fields';
import {useVideoI18n} from './i18n';
export function VideoParameterPanel({config,count,onConfig,onCount,disabled=false,execution,inputs=[]}:{config:VideoNodeConfig;capability?:ResolvedVideoCapability;count:number;onConfig:(value:VideoNodeConfig)=>void;onCount:(value:number)=>void;disabled?:boolean;execution?:VideoUiContract;inputs?:readonly OrderedInput[]}){
 const V=useVideoI18n();return <fieldset disabled={disabled} className='space-y-4' data-testid='video-parameter-panel'>
  <VideoContractFields config={config} inputs={inputs} contract={execution} onChange={onConfig} disabled={disabled}/>
  <section aria-label={V('生成数量')} className='flex gap-2'>{[1,2,4].map(value=><button type='button' key={value} aria-pressed={count===value} className='canvas-ui-control flex-1 rounded-[9px] border p-2 text-xs' onClick={()=>onCount(value)}>{value} {V('个视频')}</button>)}</section>
 </fieldset>;
}
