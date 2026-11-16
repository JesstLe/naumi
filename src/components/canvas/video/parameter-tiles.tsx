'use client';
import {RatioIcon} from '../composer-controls';
import {useVideoI18n} from './i18n';

/** Same flat choice tiles and ratio glyph as the image composer. */
export function VideoParameterTiles({name,label,values,value,onChange,disabled=false}:{name:'resolution'|'aspectRatio';label:string;values:Array<string|number|boolean|null>;value:unknown;onChange:(value:unknown)=>void;disabled?:boolean}){
  const V=useVideoI18n(),options=value!==undefined&&!values.includes(value as never)?[...values,value]:values;
  return <fieldset aria-label={label} disabled={disabled} className='col-span-2 min-w-0'>
    <legend className='canvas-ui-muted mb-2 text-xs font-semibold'>{label}</legend>
    <div className={name==='resolution'?'grid grid-cols-3 gap-2':'grid grid-cols-4 gap-2'}>
      {options.map((item,index)=>{const text=item==='adaptive'||item==='auto'?V('自适应'):String(item),parts=String(item).split(':').map(Number);
        return <button key={index} type='button' aria-label={`${label} ${text}`} aria-pressed={item===value} disabled={disabled} onClick={()=>onChange(item)}
          className={`canvas-ui-control flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${name==='resolution'?'h-10 text-xs font-semibold':'h-14 text-[11px] font-medium'} ${item===value?'!border-[#6366f1] font-semibold':''}`}>
          {name==='aspectRatio'&&<RatioIcon w={parts[0]||1} h={parts[1]||1}/>}
          <span className='max-w-full truncate'>{text}</span>
        </button>;
      })}
    </div>
  </fieldset>;
}
