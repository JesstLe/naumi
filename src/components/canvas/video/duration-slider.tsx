'use client';
import type {CSSProperties} from 'react';
import type {VideoUiParameter} from '@/lib/video/ui-contract';
import {videoEditorDurations} from '@/lib/video/ui-parameter-options';
import styles from '@/components/video/duration-control.module.css';
import {useVideoI18n} from './i18n';

/** Executable-contract editor; no legacy capability or model-name inference. */
export function VideoContractDuration({rule,value,onChange,disabled=false}:{rule:VideoUiParameter;value:unknown;onChange:(value:number|undefined)=>void;disabled?:boolean}){
  const V=useVideoI18n(),options=videoEditorDurations(rule,value),seconds=options.seconds;
  const min=seconds?0:options.min,max=seconds?Math.max(1,seconds.length-1):options.max;
  const index=seconds?Math.max(0,seconds.indexOf(options.selected)):Math.min(max,Math.max(min,options.selected));
  const current=value===undefined?rule.default:value;
  const text=current===-1?V('自动'):typeof current==='number'?`${current}s`:V('模型默认');
  const invalid=typeof current==='number'&&current!==-1&&(seconds?!seconds.includes(current):current<min||current>max);
  return <fieldset disabled={disabled} className={styles.control} data-testid='video-contract-duration'>
    <div className={styles.heading}><span>{V('视频时长')}</span><div className={styles.selection}>
      <button type='button' aria-label={V('时长跟随模型')} aria-pressed={value===undefined} onClick={()=>onChange(undefined)}>{V('默认')}</button>
      {options.automatic&&<button type='button' aria-pressed={value===-1} onClick={()=>onChange(-1)}>{V('自动')}</button>}
      <output aria-label={V('当前视频时长')} aria-invalid={invalid||undefined}>{text}</output>
    </div></div>
    <input aria-label={V('视频时长')} aria-valuetext={text} type='range' min={min} max={max} step={seconds?1:options.step} value={index}
      disabled={disabled||seconds?.length===1} style={{'--duration-progress':`${(index-min)/(max-min||1)*100}%`} as CSSProperties}
      onChange={e=>{const n=Number(e.currentTarget.value),next=seconds?seconds[n]:n;if(next!==undefined)onChange(next);}}
      onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}/>
    <div className={styles.bounds} aria-hidden='true'><span>{seconds?.[0]??options.min}s</span><span>{seconds?.at(-1)??options.max}s</span></div>
  </fieldset>;
}
