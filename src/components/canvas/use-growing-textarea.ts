"use client";
import {useLayoutEffect,type RefObject} from "react";

/** Measure in layout pixels, independent of canvas zoom. The surrounding card
 * or composer owns overflow; the textarea never creates a second scrollbar. */
export function useGrowingTextarea(ref:RefObject<HTMLTextAreaElement|null>,value:string,typographyKey=""){
  useLayoutEffect(()=>{
    const field=ref.current;if(!field)return;
    const measure=()=>{
      field.style.height="0px";
      const style=getComputedStyle(field);
      const border=(parseFloat(style.borderTopWidth)||0)+(parseFloat(style.borderBottomWidth)||0);
      field.style.height=`${Math.ceil(field.scrollHeight+border)}px`;
    };
    measure();
    let width=field.clientWidth;
    const observer=new ResizeObserver(()=>{
      if(field.clientWidth===width)return;
      width=field.clientWidth;measure();
    });
    observer.observe(field);
    let active=true;
    void document.fonts?.ready.then(()=>{if(active)measure();});
    return()=>{active=false;observer.disconnect();};
  },[ref,value,typographyKey]);
}
