'use client';
import {useEffect,useRef,useState} from 'react';
import type {VideoUiContract,VideoUiParameter} from '@/lib/video/ui-contract';
import type {VideoNodeConfig} from '@/lib/video/client-settings';
import type {OrderedInput} from '@/lib/video/references';
import {videoUiParameters,videoUiValue,setVideoUiValue,videoUiDraft} from '@/lib/video/ui-draft';
import {VideoField,videoFieldClass} from './form-controls';
import {useVideoI18n} from './i18n';
import {SelectMenu} from '@/components/ui/select-menu';
import {videoEditorChoices} from '@/lib/video/ui-parameter-options';
import {VideoContractDuration} from './duration-slider';
import {VideoParameterTiles} from './parameter-tiles';

const labels:Record<string,string>={durationSeconds:'视频时长',resolution:'视频分辨率',aspectRatio:'视频画幅',generateAudio:'生成声音',watermark:'视频水印',negativePrompt:'视频负面提示词',width:'视频宽度',height:'视频高度',providerOptions:'模型参数',camera:'摄影'};
const primary=new Set(['durationSeconds','resolution','aspectRatio','generateAudio']);
const fieldOrder:Record<string,number>={resolution:0,aspectRatio:1,durationSeconds:2};
/** Controls are a projection of the executable contract. Editing one field
 * never reconciles/deletes its siblings or assigns media roles. */
export function VideoContractFields({config,inputs=[],contract,onChange,disabled=false,advancedOnly=false,only}:{config:VideoNodeConfig;inputs?:readonly OrderedInput[];contract?:VideoUiContract;onChange:(config:VideoNodeConfig)=>void;disabled?:boolean;advancedOnly?:boolean;only?:readonly string[]}){
  const V=useVideoI18n(),parameters:Record<string,VideoUiParameter>=contract?{...videoUiParameters(config,inputs,contract)}:{durationSeconds:{type:'number'},resolution:{type:'string'},aspectRatio:{type:'string'},generateAudio:{type:'boolean'},negativePrompt:{type:'string'},watermark:{type:'boolean'},width:{type:'number'},height:{type:'number'},providerOptions:{type:'json'}};
  // Keep previously selected/unmapped values editable after changing a model.
  // The server preview, not this renderer, reports any mapping gap.
  try{for(const [key,value]of Object.entries(videoUiDraft(config,inputs).parameters))if(!parameters[key])parameters[key]={type:typeof value==='boolean'?'boolean':typeof value==='number'?'number':typeof value==='string'?'string':'json'};}catch{/* Structural error belongs to compile preview. */}
  return <fieldset disabled={disabled} className='grid grid-cols-2 gap-3' data-testid='video-contract-fields'>
    {Object.entries(parameters).filter(([key,rule])=>!rule.omitted&&(!advancedOnly||!primary.has(key))&&(!only||only.includes(key))).sort(([a],[b])=>(fieldOrder[a]??3)-(fieldOrder[b]??3)).map(([key,parameter])=>{
      const label=V(labels[key]||key),value=videoUiValue(config,key),change=(next:unknown)=>{if(contract)onChange(setVideoUiValue(config,key,next));else if(Object.hasOwn(config.parameters??{},key))onChange({...config,parameters:{...config.parameters,[key]:next as never}});else onChange({...config,[key]:next});};
      if(key==='durationSeconds'&&(parameter.type==='number'||parameter.type==='integer'))return <div key={key} className='col-span-2'><VideoContractDuration rule={parameter} value={value} onChange={change} disabled={disabled}/></div>;
      const values=videoEditorChoices(key,parameter,value),selected=values?.findIndex(item=>item===value);
      if((key==='resolution'||key==='aspectRatio')&&values)return <VideoParameterTiles key={key} name={key} label={label} values={values} value={value??parameter.default} onChange={change} disabled={disabled}/>;
      const text=value===undefined?'':typeof value==='string'?value:JSON.stringify(value);
      return <VideoField key={key} label={label}>{values?<SelectMenu label={label} size='sm' className='canvas-ui-control w-full rounded-lg' popoverClassName='canvas-ui-light' disabled={disabled}
        value={value===undefined?'':selected!==undefined&&selected>=0?String(selected):'current'}
        onChange={next=>{if(next!=='current')change(next===''?undefined:values[Number(next)]);}}
        options={[{value:'',label:V('模型默认')+(parameter.default!==undefined?` · ${String(parameter.default)}`:'')},
          ...(selected===-1&&value!==undefined?[{value:'current',label:String(value)}]:[]),
          ...values.map((item,index)=>({value:String(index),label:typeof item==='boolean'?V(item?'开启':'关闭开关'):item==='adaptive'?V('自动'):String(item)}))]}/>
        :parameter.type==='json'?<JsonDraftField label={label} value={value} placeholder={parameter.default===undefined?V('模型默认'):JSON.stringify(parameter.default)} onChange={change}/>
        :<input aria-label={label} className={videoFieldClass} type={parameter.type==='number'||parameter.type==='integer'?'number':'text'}
          min={parameter.minimum} max={parameter.maximum} step={parameter.type==='integer'?1:'any'} value={text} placeholder={parameter.default===undefined?V('模型默认'):String(parameter.default)}
          onChange={event=>change(event.target.value===''?undefined:parameter.type==='number'||parameter.type==='integer'?Number(event.target.value):event.target.value)}/>}</VideoField>;
    })}
  </fieldset>;
}

/** Preserve raw editor text while propagating a saveable JSON draft value. */
function JsonDraftField({label,value,placeholder,onChange}:{label:string;value:unknown;placeholder:string;onChange:(value:unknown)=>void}){
  const fingerprint=JSON.stringify(value),last=useRef(fingerprint);
  const asText=(value:unknown)=>value===undefined?'':typeof value==='string'?value:JSON.stringify(value);
  const [text,setText]=useState(()=>asText(value));
  useEffect(()=>{if(last.current!==fingerprint){last.current=fingerprint;setText(asText(value));}},[fingerprint,value]);
  return <textarea aria-label={label} className={videoFieldClass} rows={2} value={text} placeholder={placeholder} onChange={event=>{
    const raw=event.target.value;setText(raw);let next:unknown=raw||undefined;
    if(raw)try{next=JSON.parse(raw);}catch{/* Keep incomplete JSON editable. */}
    last.current=JSON.stringify(next);onChange(next);
  }}/>;
}
