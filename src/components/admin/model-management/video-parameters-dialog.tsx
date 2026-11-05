"use client";
import {useState} from "react";
import type {ManagedModelRow} from "@/lib/model-config/management";
import {VideoCapabilityEditor} from "../model-config/video-capability-editor";
import {videoParametersSchema,type VideoParameters} from "@/lib/model-config/video-policy";
import styles from "./model-management.module.css";
import {Dialog} from "./dialog";


export function VideoParametersDialog({row,locked,error,onClose,onSave}:{row:ManagedModelRow;locked:boolean;error:string;onClose:()=>void;onSave:(routes:VideoParameters)=>void}){
  const [routes,setRoutes]=useState<VideoParameters>(()=>row.videoConfig!.routes.map(route=>({upstreamId:route.upstreamId,definition:route.definition,profile:route.profile})));
  const valid=videoParametersSchema.safeParse(routes).success;
  const sourceLabels:Record<string,string>={admin:"管理员",vendor:"供应商",adapter:"协议声明",unknown:"未知"};
  return <Dialog title="视频能力" locked={locked} onClose={onClose}><form onSubmit={event=>{event.preventDefault();if(valid)onSave(routes);}}><fieldset className={styles.dialogBody} disabled={locked}>
    {routes.map((route,index)=>{const published=row.videoConfig!.routes[index];return <section key={route.upstreamId}><h3>{published.provider} · {published.model}</h3>
      <details><summary>已发布能力与来源</summary><dl>{Object.entries(published.sources||{}).map(([field,source])=><div key={field}><dt>{field}</dt><dd>{sourceLabels[source]||source}</dd></div>)}</dl>
        {published.sourceRevision&&<a href={published.sourceRevision.sourceUrl} target="_blank" rel="noreferrer">供应商资料 r{published.sourceRevision.revision}</a>}<pre className="overflow-auto text-xs">{JSON.stringify(published.effective,null,2)}</pre></details>
      <VideoCapabilityEditor value={route.definition} profile={route.profile} onChange={(definition,profile)=>setRoutes(current=>current.map((item,i)=>i===index?{...item,definition,profile}:item))}/></section>;})}
    {error&&<p role="alert" className={styles.error}>{error}</p>}</fieldset><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button type="submit" className={styles.primary} disabled={locked||!valid}>保存并生效</button></footer></form></Dialog>;
}
