"use client";
import {useEffect,useRef,useState} from "react";
import {Loader2,RefreshCw,X} from "lucide-react";
import {authHeader} from "@/lib/supabase";
import type {VideoCapabilityReview} from "@/lib/model-config/video-capability-review";
import styles from "./model-management.module.css";

const modeNames:Record<string,string>={text:"文生视频",single_image:"图生视频",frames_required:"首尾帧",first_optional:"首帧可选",last_optional:"尾帧可选",reference:"参考生成",video_edit:"视频编辑",extend:"续写",motion_control:"运动控制",lip_sync:"口型同步"};
export function VideoCapabilityUpgrade({locked,error,onClose,onApply}:{locked:boolean;error:string;onClose:()=>void;onApply:(review:VideoCapabilityReview)=>void}){
  const dialog=useRef<HTMLDialogElement>(null),[review,setReview]=useState<VideoCapabilityReview|null>(null),[loadError,setLoadError]=useState(""),[attempt,setAttempt]=useState(0);
  useEffect(()=>{const element=dialog.current!;element.showModal();return()=>element.close();},[]);
  useEffect(()=>{
    const controller=new AbortController();setReview(null);setLoadError("");
    void (async()=>{try{
      const response=await fetch("/api/admin/model-management?view=video-capability-upgrade",{cache:"no-store",headers:await authHeader(),signal:controller.signal});
      const body=await response.json();if(!response.ok)throw new Error(body.error||"视频能力读取失败");
      if(!controller.signal.aborted)setReview(body);
    }catch(cause){if(!controller.signal.aborted)setLoadError(cause instanceof Error?cause.message:"视频能力读取失败");}})();
    return()=>controller.abort();
  },[attempt]);
  const rows=review?.rows.filter(row=>row.status!=="current")||[];
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="video-capability-upgrade-title" onCancel={event=>{event.preventDefault();if(!locked)onClose();}}>
    <header className={styles.dialogHeader}><h2 id="video-capability-upgrade-title">更新视频能力</h2><button aria-label="关闭" disabled={locked} onClick={onClose}><X size={20}/></button></header>
    <div className={styles.dialogBody}>
      {!review&&!loadError&&<div role="status" className="flex items-center gap-2"><Loader2 size={16} className={styles.spin}/>正在核对已配置模型</div>}
      {loadError&&<div role="alert" className={styles.error}>{loadError}<button className={styles.secondary} onClick={()=>setAttempt(value=>value+1)}><RefreshCw size={14}/>重试</button></div>}
      {review&&<>
        <div className="mb-3 flex items-center justify-between text-sm"><span>{review.publicIds.length} 个模型待更新</span><span className="text-slate-500">配置 v{review.version}</span></div>
        {rows.length?<div className="max-h-96 space-y-3 overflow-y-auto">{rows.map(row=><section key={row.publicId} className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between gap-3 font-medium"><span>{row.label}</span><span className={row.status==="conflict"?"text-amber-700":"text-slate-600"}>{row.status==="conflict"?"保留人工配置":"待更新"}</span></div>
          <p className="mt-2 text-sm text-slate-500">{row.beforeModes.map(mode=>modeNames[mode]||mode).join(" · ")||"未声明"}</p>
          {row.status==="ready"?<p className="mt-1 text-sm text-slate-900">→ {row.afterModes.map(mode=>modeNames[mode]||mode).join(" · ")}</p>:<details className="mt-2 text-sm text-amber-700"><summary>查看差异</summary>{row.reason}</details>}
        </section>)}</div>:<p role="status" className="text-sm text-slate-600">已配置模型的能力已是当前版本</p>}
      </>}
      {error&&<p role="alert" className={styles.error}>{error}</p>}
    </div>
    <footer className={styles.dialogFooter}><button className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button className={styles.primary} disabled={locked||!review?.publicIds.length} onClick={()=>review&&onApply(review)}>更新并生效</button></footer>
  </dialog>;
}
