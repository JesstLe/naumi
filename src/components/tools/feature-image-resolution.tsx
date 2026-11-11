'use client';
import {useEffect,useMemo} from 'react';
import {useFeatureModels} from '@/lib/model-config/feature-client';
import type {FeatureId} from '@/lib/billing/types';
import {useI18n} from '@/lib/i18n/locale-context';
import {SelectMenu} from '@/components/ui/select-menu';

/** The published model catalogue, not its display name, owns allowed values. */
export function FeatureImageResolution({feature,value,onChange,disabled=false}:{feature:FeatureId;value:string;onChange:(value:string)=>void;disabled?:boolean}){
  const {catalog,selected}=useFeatureModels(feature),{locale}=useI18n();
  const model=catalog?.models.find(model=>model.id===selected);
  const options=useMemo(()=>model?.generationParameters?.resolutions||model?.nativeResolutions||['1K'],[model]);
  useEffect(()=>{if(model&&options.length&&!options.includes(value))onChange(options[0]);},[model,options,value,onChange]);
  const label=locale==='en'?'Resolution':'输出分辨率';
  return <label className="grid gap-1.5 text-xs"><span>{label}</span><SelectMenu label={label} value={value} onChange={onChange} disabled={disabled||!options.length} options={options.map(value=>({value,label:value}))}/></label>;
}
