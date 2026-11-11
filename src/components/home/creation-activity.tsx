"use client";
import { Check, ChevronRight, CircleAlert, ImageIcon, Loader2, ListChecks, Sparkles, Wrench } from "lucide-react";
import { workbenchStepLabel, type WorkbenchStep } from "@/lib/agent/workbench-activity";
import { CREATION_IMAGE_TOOLS } from "@/lib/agent/creation-settings";
import styles from "./creation-activity.module.css";

const parameterLabels: Record<string,string> = { model: "模型", ratio: "比例", resolution: "清晰度", quality: "质量", color: "颜色", strength: "强度", count: "数量", duration: "时长", output_format: "格式" };
export function CreationActivity({ steps, pending }: { steps: WorkbenchStep[]; pending?: boolean }) {
  const running = steps.findLast(step => step.status === "running");
  return <div className={styles.activity} data-testid="creation-activity">
    {pending && <div role="status" className={styles.current}><Loader2 className="animate-spin" size={16}/><span>{running ? `${workbenchStepLabel(running)}中…` : steps.length ? "整理结果…" : "正在处理…"}</span></div>}
    {steps.map((step,index) => {
      const status = step.status === "running" && !pending ? "unknown" : step.status || "done";
      const Icon = status === "error" ? CircleAlert : status === "running" ? Loader2 : step.kind === "skill" ? Sparkles : step.kind === "plan" ? ListChecks : Wrench;
      const label = workbenchStepLabel(step), hasDetails = step.kind !== "skill" && (!!step.summary || !!step.details?.parameters.length);
      return <div key={step.id||index} className={styles.step} data-tool-call={step.id} data-tool-status={status}>
        {hasDetails ? <details><summary><Icon size={15} className={status === "running" ? "animate-spin" : undefined}/><span>{label}</span><span className={styles.status}>{status === "running" ? "进行中" : status === "error" ? "未完成" : status === "unknown" ? "状态待确认" : status === "stopped" ? "已停止" : "已完成"}</span><ChevronRight className={styles.chevron} size={13}/></summary><div className={styles.detail}>
          {step.summary && <p>{step.summary}</p>}{!!step.details?.parameters.length && <dl>{step.details.parameters.map(pair => <div key={pair.name}><dt>{parameterLabels[pair.name]||pair.name}</dt><dd>{pair.value}</dd></div>)}</dl>}
        </div></details> : <div className={styles.row}><Icon size={15}/><span>{label}</span>{step.kind !== "skill" && <span className={styles.status}>{status === "error" ? "未完成" : status === "running" ? "进行中" : status === "unknown" ? "状态待确认" : status === "stopped" ? "已停止" : "已完成"}</span>}</div>}
        {status === "running" && (CREATION_IMAGE_TOOLS.has(step.tool) || ["generate_video","extend_video","edit_video"].includes(step.tool)) && <div className={styles.generation} role="status">
          <div><ImageIcon size={14}/><span>{step.progress ? `${step.progress.completed}/${step.progress.total} ` : ""}{step.tool.includes("video") ? "视频" : "图片"}生成中…</span></div>
          <div className={styles.preview}><span><Loader2 className="animate-spin" size={17}/></span></div>
        </div>}
      </div>;
    })}
    {!pending && !steps.length && <span className={styles.row}><Check size={14}/>已完成</span>}
  </div>;
}
