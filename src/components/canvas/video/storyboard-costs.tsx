"use client";
import {useEffect,useRef,useState} from "react";
import type {StoryboardPlan} from "@/lib/storyboard/plan";
import type {StoryboardSelection} from "@/lib/video/storyboard-client";
import type {StoryboardCostReport,CostTotals} from "@/lib/storyboard/costs";
import {currentWorkspace} from "@/lib/saas/workspace-client";
import type {VideoPrivateFetch} from "./use-video-nodes";

export function StoryboardCosts({scope,projectKey,planId,revision,dirty,selection,disabled,onSave,request}:{scope:string;projectKey:string;planId?:string;revision:number;dirty:boolean;selection:StoryboardSelection[];disabled:boolean;onSave:()=>Promise<StoryboardPlan>;request:VideoPrivateFetch}){
 const workspace=currentWorkspace(),[data,setData]=useState<{report:StoryboardCostReport;selection:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[compare,setCompare]=useState("");
 const pending=useRef<AbortController|null>(null),identity=JSON.stringify([scope,workspace,projectKey,planId]);
 useEffect(()=>{setData(null);setError("");setBusy(false);setCompare("");return()=>pending.current?.abort();},[identity]);
 const stale=!!data&&(dirty||data.report.revision!==revision||data.selection!==JSON.stringify(selection)||(compare?Number(compare):null)!==data.report.baselineRevision),css="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs disabled:opacity-40";
 const inspect=async()=>{if(busy||disabled||pending.current&&!pending.current.signal.aborted)return;pending.current?.abort();const controller=new AbortController();pending.current=controller;setBusy(true);setError("");try{
  const plan=await onSave();if(controller.signal.aborted)return;
  const response=await request("/api/canvas/storyboards/costs",{method:"POST",signal:controller.signal,headers:{"content-type":"application/json","x-naumi-workspace":workspace,"x-naumi-project-context":projectKey},body:JSON.stringify({projectKey,planId:plan.id,revision:plan.revision,nodes:selection,...(compare?{compareRevision:Number(compare)}:{})})}),report=await response.json();
  if(!response.ok)throw new Error(report.error||"费用读取失败");if(!controller.signal.aborted)setData({report,selection:JSON.stringify(selection)});
 }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"费用读取失败");}finally{if(pending.current===controller){pending.current=null;if(!controller.signal.aborted)setBusy(false);}}};
 const totals=(title:string,value:CostTotals)=><div className="space-y-1 rounded-lg border border-slate-100 bg-white p-3"><h4 className="font-medium">{title}</h4><p>已结算{value.unknownCount?"已知小计":""} {value.chargedCredits} 积分</p><p>预扣 {value.reservedCredits} · 已退 {value.refundedCredits} · 已释放 {value.releasedCredits}</p><p>{value.taskCount} 项任务 · {value.pendingCount} 项结算中{value.failedTaskCount?` · ${value.failedTaskCount} 项失败或取消`:""}{value.unknownCount?` · ${value.unknownCount} 项费用待核实`:""}{value.externalUnknownCount?` · ${value.externalUnknownCount} 项外部费用未知`:""}</p></div>;
 const report=data?.report;
 return <section aria-label="方案费用与返工影响" className="space-y-3 text-xs">
  <div className="flex flex-wrap items-center gap-2"><button type="button" className={css} disabled={disabled||busy||!selection.length} onClick={()=>void inspect()}>{busy?"读取中…":"费用与返工影响"}</button><label className="flex items-center gap-2">对比版本<input aria-label="费用对比方案版本" className="w-20 rounded-lg border bg-white p-2" type="number" min={1} max={revision} value={compare} disabled={busy} onChange={event=>setCompare(event.target.value)}/></label></div>
  {error&&<p role="alert" className="text-red-600">{error}</p>}
  {report&&<><p role="status" className={stale?"text-amber-700":"text-slate-500"}>{stale?"方案或选择已变化，请刷新费用":"方案版本 "+report.revision+" · "+new Date(report.observedAt).toLocaleTimeString()}</p>
   <div className="grid gap-2 md:grid-cols-3">{totals("本方案任务",report.totals.plan)}{totals("共享节点历史 · 未归属本方案",report.totals.sharedHistory)}{totals("继承与素材复用 · 非本轮新增",report.totals.reusedReferences)}</div>
   <div className="grid gap-2 rounded-lg bg-white p-3 sm:grid-cols-2"><p>本轮生成{report.quote.upperBound?"上限":"报价"}：{report.quote.generationCredits??"未知"} 积分 · {report.quote.newShots} 镜</p><p>后续合成{report.quote.assemblyUpperBound?"上限":"报价"}：{report.quote.assemblyCredits??"未报价"} 积分</p><p>复用 {report.quote.reusedShots} 镜 · 自备算力 {report.quote.byocShots} 镜外部费用未计入</p>{report.quote.error&&<p className="text-amber-700">{report.quote.error}</p>}</div>
   <p className="text-amber-700">历史归属缺失和外部费用不计为零；报价不锁价，复用不新增生成费用。</p>
   {!!report.coverage.referencedMaterialCostsUnknown.length&&<p>{report.coverage.referencedMaterialCostsUnknown.length} 个引用声音素材缺少采购费用记录</p>}
   {report.coverage.unacceptedOperations.length>0&&<p>{report.coverage.unacceptedOperations.length} 个阶段或导出意图尚无任务回执</p>}
   {!!report.coverage.missingReferencedTaskIds?.length&&<p className="text-amber-700">{report.coverage.missingReferencedTaskIds.length} 个候选任务记录缺失，费用待核实</p>}
   {(report.impact.structureChanged||report.impact.audioChanged)&&<p>{report.impact.structureChanged?"镜头结构已变更":""}{report.impact.audioChanged?" · 声音编排已变更":""}</p>}
   <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full text-left"><thead><tr>{["镜头","本轮","生成影响","剪辑影响"].map(label=><th className="p-2 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{report.impact.shots.map(shot=><tr className="border-t border-slate-100" key={shot.nodeId}><td className="p-2">{shot.number}</td><td className="p-2">{{generate:"新生成",reuse:"复用采用版",unselected:"未选择"}[shot.execution]}</td><td className="p-2">{shot.generationAffected?(shot.reasons.includes("depends-on-changed")?"输入依赖变化":shot.reasons.includes("selected-generation")?"所选新生成":"本镜变化"):"—"}</td><td className="p-2">{shot.editorialAffected?"采用或裁剪变化":"—"}</td></tr>)}</tbody></table></div>
   <details><summary className="cursor-pointer">阶段与任务明细（{report.detailCount}）</summary><div className="mt-2 space-y-2">{report.stages.map(stage=><p key={stage.kind}>{{video:"视频生成","audio-processing":"声音处理","speech-generation":"生成配音","transcription":"音频转写",media:"媒体处理与导出",review:"辅助审片"}[stage.kind]} · 已结算 {stage.totals.chargedCredits} 积分 · 待核实 {stage.totals.unknownCount} 项</p>)}{report.items.map(item=><div className="break-all rounded border bg-white p-2" key={`${item.kind}:${item.id}`}><p>{item.id} · {({queued:"准备处理",processing:"处理中",needs_attention:"待核查",completed:"完成",failed:"失败",cancelled:"已取消"} as Record<string,string>)[item.status]||"待核实"} · {{plan:"方案任务","shared-node":"共享历史",inherited:"继承复用","referenced-media":"素材复用"}[item.attribution]}{item.remake?" · 返工":""}</p><p>已结算 {item.billing.chargedCredits??"未知"} · 预扣 {item.billing.reservedCredits} · 已退 {item.billing.refundedCredits}{item.externalCostUnknown?" · 外部费用未知":""}</p></div>)}{report.detailsTruncated&&<p>明细显示前 {report.items.length} 项；汇总包含全部相关任务。</p>}</div></details>
  </>}
 </section>;
}
