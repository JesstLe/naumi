"use client";
import { forwardRef, type CSSProperties } from "react";
import { Settings2, History, Pencil, Copy, Download, Trash2, SlidersHorizontal } from "lucide-react";
import { CanvasActionMenu, type CanvasActionMenuItem } from "../canvas-action-menu";
import { useI18n } from "@/lib/i18n/locale-context";

/** Same anchored surface and overflow/menu behavior as image and text nodes. */
export const VideoNodeToolbar=forwardRef<HTMLDivElement,{
  style:CSSProperties;light:boolean;readOnly:boolean;locked:boolean;busy:boolean;hasResult:boolean;hasHistory?:boolean;settingsLabel?:string;
  onSettings:()=>void;onHistory:()=>void;onRename:()=>void;onCopy:()=>void;
  onDuplicate:()=>void;onDownload:()=>void;onDelete:()=>void;onProperties:()=>void;
  management:CanvasActionMenuItem[];
}>(function VideoNodeToolbar(props,ref){
  const {locale}=useI18n(),L=(zh:string,en:string)=>locale==='en'?en:zh;
  const blocked=props.readOnly||props.locked||props.busy;
  const button="canvas-ui-action flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-2.5 text-[13px] font-semibold disabled:opacity-40";
  return <div ref={ref} data-testid="video-node-toolbar" style={props.style}
    className="canvas-ui-surface canvas-dock-entry absolute z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-[14px] border p-1.5">
    <button type="button" className={button} onClick={props.onSettings} disabled={blocked}><Settings2 size={16}/>{props.settingsLabel||L("参数与引用","Settings & references")}</button>
    {props.hasHistory!==false&&<button type="button" className={button} onClick={props.onHistory}><History size={16}/>{L("历史","History")}</button>}
    <button type="button" className={button} onClick={props.onRename} disabled={blocked}><Pencil size={16}/>{L("重命名","Rename")}</button>
    <button type="button" className={button} onClick={props.onCopy}><Copy size={16}/>{L("复制节点","Copy node")}</button>
    <button type="button" className={button} onClick={props.onDownload} disabled={!props.hasResult}><Download size={16}/>{L("下载视频","Download video")}</button>
    <button type="button" className={button} onClick={props.onDelete} disabled={blocked}><Trash2 size={16}/>{L("删除","Delete")}</button>
    <CanvasActionMenu iconOnly label={L("更多节点操作","More node actions")} light={props.light} items={[
      {id:"duplicate",icon:Copy,label:L("创建副本","Duplicate"),disabled:blocked,onSelect:props.onDuplicate},
      ...props.management,
      {id:"properties",icon:SlidersHorizontal,label:L("属性设置","Properties"),onSelect:props.onProperties},
    ]}/>
  </div>;
});
