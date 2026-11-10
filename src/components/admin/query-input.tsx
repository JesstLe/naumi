"use client";
import {useEffect,useRef,useState,type InputHTMLAttributes} from "react";

/** Keep typing local; publish one URL filter after the user pauses. Delayed
 * router acknowledgements must not replace text entered since that commit. */
export function AdminQueryInput({value,onCommit,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,"value"|"onChange">&{value:string;onCommit:(value:string)=>void}){
  const [draft,setDraft]=useState(value),committed=useRef(value),sent=useRef(new Set<string>()),commit=useRef(onCommit);
  commit.current=onCommit;
  useEffect(()=>{
    committed.current=value;
    if(sent.current.delete(value))return;
    sent.current.clear();setDraft(value);
  },[value]);
  useEffect(()=>{
    if(draft===committed.current)return;
    const timer=setTimeout(()=>{committed.current=draft;sent.current.add(draft);commit.current(draft);},250);
    return()=>clearTimeout(timer);
  },[draft]);
  return <input {...props} value={draft} onChange={event=>setDraft(event.target.value)}/>;
}
