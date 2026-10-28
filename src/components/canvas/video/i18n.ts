"use client";
import {useCallback} from "react";
import {useI18n} from "@/lib/i18n/locale-context";
import {videoZh,videoEn} from "@/lib/i18n/video";
export function useVideoI18n(){
  const {locale,t}=useI18n();
  return useCallback((text:string)=>{
    if(locale!=="en")return videoZh[text]||text;
    if(/^镜头\s+$/.test(text))return text.replace("镜头","Shot");
    const trimmed=text.trim();
    if(videoEn[trimmed])return text.replace(trimmed,t(`video.${trimmed}`));
    // Only composed control labels reach this function; stored user text stays intact.
    return text.replace(/^视频(摄影机|镜头|焦距|光圈|运镜)$/,(_,word)=>`Video ${videoEn[word]}`).replace(/^(.+?)(\s*·\s*)$/,(match,word,separator)=>videoEn[word]?videoEn[word]+separator:match).replace(/积分$/,"credits").replace(/^镜头(\d+)(文字来源|描述|时长)$/,(_,index,field)=>`Shot ${index} ${field==="文字来源"?"text source":field==="描述"?"prompt":"duration"}`).replace(/^元素(\d+)(名称|描述)$/,(_,index,field)=>`Element ${index} ${field==="名称"?"name":"prompt"}`).replace(/^引用(\d+)角色$/,(_,index)=>`Reference ${index} role`).replace(/^引用(\d+)外观$/,(_,index)=>`Reference ${index} look`).replace(/^引用(\d+)状态$/,(_,index)=>`Reference ${index} state`).replace(/^(上移|下移|移除)引用(\d+)$/,(_,action,index)=>`${videoEn[action]} reference ${index}`).replace(/^参数 /,"Option ").replace(/播放器$/," player").replace(/^工作流(文本|种子|数值) /,(_,field)=>`Workflow ${field==="文本"?"text":field==="种子"?"seed":"number"} `);
  },[locale,t]);
}
