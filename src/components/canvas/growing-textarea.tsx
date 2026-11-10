"use client";
import {useRef,type TextareaHTMLAttributes} from "react";
import {useGrowingTextarea} from "./use-growing-textarea";

/** Native editor descriptions share the composer's content measurement. The
 * editor body owns scrolling, even when several description fields are long. */
export function CanvasGrowingTextarea({value,style,...props}:Omit<TextareaHTMLAttributes<HTMLTextAreaElement>,"value">&{value:string}){
  const ref=useRef<HTMLTextAreaElement>(null);
  useGrowingTextarea(ref,value);
  return <textarea {...props} ref={ref} value={value} style={{...style,minHeight:112,resize:"none",overflow:"hidden"}}/>;
}
