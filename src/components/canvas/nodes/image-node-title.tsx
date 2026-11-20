"use client";
import {useEffect,useRef,useState} from 'react';
import {useI18n} from '@/lib/i18n/locale-context';

/** Node-local editor; persistence and undo remain with the existing document owner. */
export function ImageNodeTitle({id,title,disabled,onCommit,onRequest}:{id:string;title:string;disabled?:boolean;
  onCommit?:(id:string,title:string)=>Promise<void>;onRequest?:(id:string,title:string)=>void}){
  const [editing,setEditing]=useState(false),[value,setValue]=useState(title),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const english=useI18n().locale==='en';
  const input=useRef<HTMLInputElement>(null),cancelled=useRef(false),flight=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(editing){input.current?.focus();input.current?.select();}},[editing]);
  useEffect(()=>{if(error&&!saving)input.current?.focus();},[error,saving]);
  useEffect(()=>{if(disabled){cancelled.current=true;setEditing(false);}},[disabled]);
  async function commit(){
    if(cancelled.current||flight.current||disabled)return;
    const next=value.trim();if(!next||next===title){setEditing(false);return;}
    flight.current=true;setSaving(true);setError('');
    try{await onCommit?.(id,next);if(alive.current)setEditing(false);}
    catch(e){if(alive.current)setError(e instanceof Error?e.message:english?'Save failed. Please try again.':'保存失败，请重试');}
    finally{flight.current=false;if(alive.current)setSaving(false);}
  }
  return <span className="nodrag nopan relative min-w-0 flex-1 cursor-text" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}
    onDoubleClick={e=>{e.stopPropagation();if(editing||saving||disabled)return;if(!onCommit){onRequest?.(id,title);return;}cancelled.current=false;setValue(title);setError('');setEditing(true);}}>
    {editing?<input ref={input} data-testid="image-title-input" aria-label={english?'Image name':'图片名称'} aria-invalid={!!error} title={error||undefined}
      className="nodrag nopan canvas-ui-input h-[28px] w-full min-w-0 rounded border !border-[#315fc8] bg-white px-1.5 text-inherit text-[#20242c] outline-none"
      value={value} maxLength={60} disabled={saving} onChange={e=>setValue(e.target.value)} onBlur={()=>void commit()}
      onKeyDown={e=>{e.stopPropagation();if(e.nativeEvent.isComposing)return;if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}if(e.key==='Escape'){e.preventDefault();cancelled.current=true;setEditing(false);}}}/>
      :<span data-testid="image-node-title" className="block truncate" title={title}>{title}</span>}
    {error&&<span role="alert" className="absolute left-0 top-full z-20 rounded bg-white px-2 py-1 text-[11px] font-normal text-red-600 shadow">{error}</span>}
  </span>;
}
