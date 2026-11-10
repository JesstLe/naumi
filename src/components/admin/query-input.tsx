"use client";
import {useEffect,useRef,useState,type InputHTMLAttributes} from "react";

/** Keep typing local; publish one URL filter after the user pauses. Delayed
 * router acknowledgements must not replace text entered since that commit. */
export function AdminQueryInput({value,onCommit,onCompositionStart,onCompositionEnd,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,"value"|"onChange">&{value:string;onCommit:(value:string)=>void}){
  const [draft,setDraft]=useState(value),[composing,setComposing]=useState(false),committed=useRef(value),sent=useRef(new Set<string>()),commit=useRef(onCommit);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  commit.current=onCommit;
  useEffect(()=>{
    if(sent.current.delete(value))return;
    committed.current=value;sent.current.clear();setDraft(value);
  },[value]);
  useEffect(()=>{
    if(composing||draft===committed.current)return;
    timer.current=setTimeout(()=>{committed.current=draft;sent.current.add(draft);commit.current(draft);},250);
    return()=>clearTimeout(timer.current);
  },[draft,composing,value]);
  return <input {...props} value={draft} onChange={event=>setDraft(event.target.value)}
    onCompositionStart={event=>{clearTimeout(timer.current);setComposing(true);onCompositionStart?.(event);}}
    onCompositionEnd={event=>{setDraft(event.currentTarget.value);setComposing(false);onCompositionEnd?.(event);}}/>;
}
