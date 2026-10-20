"use client";
import {assistantLivePresentation,type AssistantLiveActivity} from "@/lib/canvas/assistant-live-state";
import styles from "./assistant-live-status.module.css";

/** An activity animation, not a fabricated chain of thought or percentage. */
export function AssistantLiveStatus({activity,elapsed,now,label,attention,responding,english=false}:{
  activity?:AssistantLiveActivity;elapsed:number;now:number;label?:string;attention?:"waiting"|"restricted";responding:boolean;english?:boolean;
}) {
  const view=assistantLivePresentation(activity,elapsed,now,english),title=label||view.title;
  const seconds=Math.floor(Math.max(0,elapsed)/1000),clock=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;
  return <section data-testid="canvas-assistant-activity" data-activity-phase={activity?.phase||"processing"} className={`${styles.surface} ${attention?styles.paused:""} ${view.quiet?styles.quiet:""}`}>
    <div className={styles.header}>
      <span role="status" aria-live="polite" className={styles.heading}><span className={styles.signal} aria-hidden="true"><i/><i/><i/></span>{title}</span>
      <span data-testid="canvas-assistant-elapsed" className={styles.clock}>{english?"Elapsed ":"用时 "}{clock}</span>
    </div>
    {!attention&&<>
      {!responding&&!label&&<div className={styles.shimmer} aria-hidden="true" data-testid="assistant-live-placeholder"><span/><span/></div>}
      {!label&&<p className={styles.detail}>{view.detail}</p>}
      {(view.fresh||view.quiet)&&<span className={styles.connection} data-testid="assistant-connection-state" title={english?"Status connection to Naumi, not a provider health check":"仅表示与应用的状态连接，不代表模型服务已完成响应"}>{view.fresh?(english?"Connected":"连接正常"):(english?"Waiting for a new status":"等待新状态")}</span>}
    </>}
  </section>;
}
