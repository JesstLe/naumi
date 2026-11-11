"use client";

import {useCallback,useEffect,useLayoutEffect,useRef,useState} from "react";

/** Owns viewport following only, never the conversation or generation task.
 * Detect the real scroll host so desktop shells do not scroll the outer page. */
export function useConversationScroll(sessionId:string,conversation:boolean,messages:unknown){
  const stream=useRef<HTMLDivElement>(null),composer=useRef<HTMLDivElement>(null);
  const host=useRef<HTMLElement|null>(null),following=useRef(true),jumping=useRef(false);
  const [away,setAway]=useState(false);
  const schedule=useRef<()=>void>(()=>{});
  const returnToBottom=useCallback(()=>{
    const element=host.current;if(!element)return;
    following.current=true;jumping.current=true;
    element.scrollTo({top:element.scrollHeight,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
    schedule.current();
  },[]);

  useLayoutEffect(()=>{
    if(!conversation||!stream.current)return;
    let element:HTMLElement|null=stream.current.parentElement;
    while(element&&element!==document.body&&!/(auto|scroll)/.test(getComputedStyle(element).overflowY))element=element.parentElement;
    const scrollHost=element&&element!==document.body?element:document.scrollingElement as HTMLElement;
    host.current=scrollHost;following.current=true;jumping.current=false;setAway(false);
    const documentHost=scrollHost===document.scrollingElement;
    const eventHost=documentHost?window:scrollHost;
    const nearBottom=()=>scrollHost.scrollHeight-scrollHost.scrollTop-(documentHost?window.innerHeight:scrollHost.clientHeight)<=80;
    let frame=0,touchY=0,lastTop=scrollHost.scrollTop;
    const measure=()=>{
      const near=nearBottom();setAway(!near);
      if(near)jumping.current=false;
      if(near)following.current=true;
    };
    const scroll=()=>{
      // Content growth can emit a scroll before ResizeObserver runs. It is not
      // an instruction to stop following; actual upward movement is.
      const top=scrollHost.scrollTop;
      if(!jumping.current&&top<lastTop-1)following.current=false;
      lastTop=top;measure();
    };
    const update=()=>{
      if(frame)cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        frame=0;
        if(!jumping.current&&scrollHost.scrollTop<lastTop-1)following.current=false;
        if(following.current&&!jumping.current)scrollHost.scrollTo({top:scrollHost.scrollHeight,behavior:"instant"});
        lastTop=scrollHost.scrollTop;
        measure();
      });
    };
    schedule.current=update;
    const interrupt=()=>{jumping.current=false;following.current=false;};
    const editable=(target:EventTarget|null)=>target instanceof Element&&!!target.closest('textarea,input,[contenteditable="true"]');
    const inConversation=(target:EventTarget|null)=>target instanceof Node&&!!stream.current?.parentElement?.contains(target);
    const wheel=(event:Event)=>{if((event as WheelEvent).deltaY<0&&inConversation(event.target)&&!editable(event.target))interrupt();};
    const touchStart=(event:Event)=>{touchY=(event as TouchEvent).touches[0]?.clientY||0;};
    const touchMove=(event:Event)=>{const y=(event as TouchEvent).touches[0]?.clientY||0;if(y>touchY&&inConversation(event.target)&&!editable(event.target))interrupt();touchY=y;};
    const key=(event:Event)=>{const e=event as KeyboardEvent;if(!editable(e.target)&&(["ArrowUp","PageUp","Home"].includes(e.key)||e.key===" "&&e.shiftKey))interrupt();};
    const end=()=>{jumping.current=false;measure();};
    eventHost.addEventListener("scroll",scroll,{passive:true});
    eventHost.addEventListener("scrollend",end);
    eventHost.addEventListener("wheel",wheel,{passive:true});
    eventHost.addEventListener("touchstart",touchStart,{passive:true});
    eventHost.addEventListener("touchmove",touchMove,{passive:true});
    eventHost.addEventListener("keydown",key);
    window.addEventListener("resize",update);
    const observer=new ResizeObserver(update);
    observer.observe(stream.current);if(composer.current)observer.observe(composer.current);observer.observe(scrollHost);
    scrollHost.scrollTo({top:scrollHost.scrollHeight,behavior:"instant"});lastTop=scrollHost.scrollTop;measure();
    return()=>{
      observer.disconnect();if(frame)cancelAnimationFrame(frame);
      eventHost.removeEventListener("scroll",scroll);eventHost.removeEventListener("scrollend",end);
      eventHost.removeEventListener("wheel",wheel);eventHost.removeEventListener("touchstart",touchStart);eventHost.removeEventListener("touchmove",touchMove);eventHost.removeEventListener("keydown",key);
      window.removeEventListener("resize",update);host.current=null;schedule.current=()=>{};
    };
  },[sessionId,conversation]);
  useEffect(()=>{if(conversation)schedule.current();},[messages,conversation]);
  return {stream,composer,showReturn:conversation&&away,returnToBottom};
}
