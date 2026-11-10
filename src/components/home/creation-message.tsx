"use client";

import { useEffect,useRef,useState } from "react";
import { Download, Ellipsis, Expand, Loader2, Palette, PanelsTopLeft, RotateCcw, ScanEye, Scissors, Shirt, SquarePen, Sun, Blend, X } from "lucide-react";
import { useWorkspaceRouter } from "@/lib/desktop/navigation";
import { agentMediaUrl } from "@/lib/agent/media-policy";
import { downloadImage } from "@/lib/download";
import { useFeatureAccess } from "@/lib/feature-access/client";
import { CachedImage } from "@/components/cached-image";
import type { WorkbenchMessage } from "@/lib/agent/workbench-contract";
import type { CreationWorkbenchPort } from "./creation-contract";
import styles from "./creation-workbench.module.css";

const tools = [
  {name:"产品精修",route:"/retouch",Icon:Sun}, {name:"AI 变清晰",route:"/upscale",Icon:ScanEye},
  {name:"AI 抠图",route:"/cutout",Icon:Scissors}, {name:"局部改图",route:"/inpaint",Icon:SquarePen},
  {name:"产品换色",route:"/recolor",Icon:Palette}, {name:"AI 融图",route:"/fuse",Icon:Blend},
  {name:"服装上身",route:"/tryon",Icon:Shirt}, {name:"发送到画布",route:"/canvas",Icon:PanelsTopLeft},
];

export function messageReferences(content:string) {
  return content.split("\n").flatMap(line=>{const m=line.match(/^\[商品图\]\s*(\S+)$/);return m && agentMediaUrl(m[1]) ? [m[1]]:[];});
}
export function messagePrompt(content:string) {return content.split("\n").filter(line=>!/^\[商品图\]\s*\S+$/.test(line)).join("\n").trim();}

function ResultImage({url,alt,prompt,port,onPreview}:{url:string;alt:string;prompt:string;port:CreationWorkbenchPort;onPreview:(url:string)=>void}) {
  const router=useWorkspaceRouter(), {canPage}=useFeatureAccess();
  const [error,setError]=useState(""),[pending,setPending]=useState(false),[more,setMore]=useState(false);
  async function openTool(route:string) {
    setPending(true);setError("");
    try {
      if(route==="/canvas") {
        const id=await port.resolveArtwork(url);
        if(!id)throw Error("尚未找到此图片的作品记录，请稍后重试");
        router.push(`/canvas?node=${encodeURIComponent(id)}`);
      } else router.push(`${route}?src=${encodeURIComponent(url)}`);
    }catch(e){setError(e instanceof Error?e.message:"操作失败，请重试");}finally{setPending(false);}
  }
  return <div className={styles.resultBlock}>
    <div className={styles.resultImage}>
      <button type="button" className={styles.imageOpen} aria-label="放大查看图片" onClick={()=>onPreview(url)}><CachedImage src={url} alt={alt||"生成图片"}/></button>
      <div className={styles.imageTop}>
        <button type="button" aria-label="下载图片" title="下载图片" onClick={()=>void downloadImage(url).catch(()=>setError("下载失败，请重试"))}><Download/></button>
        <button type="button" aria-label="更多图片操作" aria-expanded={more} onClick={()=>setMore(!more)}><Ellipsis/></button>
        <button type="button" aria-label="放大图片" onClick={()=>onPreview(url)}><Expand/></button>
      </div>
      {more&&<div className={styles.imageMenu}><button type="button" onClick={()=>{port.stage(prompt,[url]);setMore(false);}}>用作参考</button>{canPage("/canvas")&&<button type="button" disabled={pending} onClick={()=>void openTool("/canvas")}>发送到画布</button>}</div>}
      <div className={styles.imageTools} aria-label="图片工具">{tools.filter(t=>canPage(t.route)).map(t=><button type="button" key={t.route} disabled={pending} aria-label={t.name} title={t.name} onClick={()=>void openTool(t.route)}><t.Icon/><span>{t.name}</span></button>)}</div>
    </div>
    {error&&<p className={styles.error} role="alert">{error}</p>}
  </div>;
}

export function CreationMessage({message,previous,port,onPreview}:{message:WorkbenchMessage;previous?:WorkbenchMessage;port:CreationWorkbenchPort;onPreview:(url:string)=>void}) {
  if(message.role==="user") {
    const refs=messageReferences(message.content);
    return <div className={styles.userMessage}>
      {refs.length>0&&<button type="button" className={styles.userReference} aria-label="查看参考图" onClick={()=>onPreview(refs[0])}><CachedImage src={refs[0]} alt="参考图"/><span>{refs.length}</span></button>}
      <p>{messagePrompt(message.content)}</p>
    </div>;
  }
  const source=previous?.role==="user"?previous.content:"",prompt=messagePrompt(source);
  const images=message.content.split("\n").flatMap(line=>{const m=line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);return m&&agentMediaUrl(m[2])&&!/\.(mp4|webm|mov|m4v)(\?|$)/i.test(m[2])?[m[2]]:[];});
  return <div className={styles.assistantMessage}>
    {message.content.split("\n").map((line,i)=>{
      const match=line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/),video=line.match(/^视频链接\s*[:：]\s*(\S+)$/);
      const url=match?.[2]||video?.[1];
      if(url&&agentMediaUrl(url))return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)?<video key={i} controls playsInline src={url} className={styles.resultVideo}/>:<ResultImage key={i} url={url} alt={match?.[1]||""} prompt={prompt} port={port} onPreview={onPreview}/>;
      return line.trim()?<p key={i} className={styles.responseText}>{line}</p>:null;
    })}
    {message.pending&&<p role="status" className={styles.pending}><Loader2 className="animate-spin"/>正在执行</p>}
    {!!message.steps?.length&&<details className={styles.steps}><summary>执行记录 · {message.steps.length}</summary>{message.steps.map((step,i)=><p key={i}><strong>{step.tool}</strong> {step.summary}</p>)}</details>}
    {!message.pending&&prompt&&<div className={styles.resultActions}>
      <button type="button" disabled={port.busy||port.unavailable} onClick={()=>port.stage(prompt,images.length?[images[0]]:messageReferences(source))}><SquarePen/>重新编辑</button>
      <button type="button" disabled={port.busy||port.unavailable} onClick={()=>port.regenerate(prompt,messageReferences(source))}><RotateCcw/>重新生成</button>
    </div>}
  </div>;
}

export function CreationImageViewer({url,onClose}:{url:string;onClose:()=>void}) {
  const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow="hidden";close.current?.focus();return()=>{document.body.style.overflow=overflow;previous?.focus({preventScroll:true});};},[]);
  return <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="图片预览" onClick={onClose} onKeyDown={e=>{if(e.key==="Escape")onClose();if(e.key==="Tab"){e.preventDefault();close.current?.focus();}}}><button ref={close} type="button" aria-label="关闭图片预览" onClick={onClose}><X/></button><CachedImage src={url} alt="图片预览" onClick={e=>e.stopPropagation()}/></div>;
}
