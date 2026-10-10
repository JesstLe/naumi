"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import type { WorkflowImportResult } from "@/lib/canvas-workflow-import";
import { readWorkflowClipboard } from "@/lib/canvas/workflow-clipboard";
import { browserRandomUUID } from "@/lib/browser-crypto";
import { authHeader } from "@/lib/supabase";

type Attempt = { operationId: string; html: string; projectKey: string | null; x: number; y: number };
type Progress = { done: number; total: number; error?: string };
export function useWorkflowPaste({ email, projectKey, browsing, readOnly, onCommitted }: {
  email?: string; projectKey: string | null; browsing: boolean; readOnly: boolean; onCommitted: (result: WorkflowImportResult) => void;
}) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const controller = useRef<AbortController | null>(null), epoch = useRef(0), attempt = useRef<Attempt | null>(null);
  const commit = useRef(onCommitted); commit.current = onCommitted;
  const invalidate = useCallback(() => { epoch.current++; controller.current?.abort(); controller.current = null; }, []);
  useEffect(() => {
    invalidate(); attempt.current = null; setProgress(null);
    return invalidate;
  }, [email, projectKey, browsing, readOnly, invalidate]);
  async function submit(body: Attempt) {
    if (!email || readOnly || browsing || controller.current) return;
    const current = ++epoch.current, abort = new AbortController(); controller.current = abort;
    attempt.current = body; setProgress({ done: 0, total: 0 });
    try {
      const response = await fetch("/api/canvas/workflow-import", { method: "POST", headers: { ...await authHeader(), "content-type": "application/json" }, body: JSON.stringify(body), signal: abort.signal });
      if (!response.ok) { const json = await response.json(); throw new Error(json.error || "工作流导入失败"); }
      if (!response.body) throw new Error("导入连接中断，请重试");
      const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = "", result: WorkflowImportResult | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (current !== epoch.current) { await reader.cancel(); return; }
        pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
        if (pending.length > 8 * 1024 * 1024) throw new Error("导入响应过大");
        const lines = pending.split("\n"); pending = lines.pop()!;
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line);
          if (event.type === "progress") setProgress({ done: event.done, total: event.total });
          else if (event.type === "error") throw new Error(event.error || "工作流导入失败");
          else if (event.type === "complete") result = event.result;
        }
        if (done) break;
      }
      if (!result || result.operationId !== body.operationId) throw new Error("导入连接中断，请重试");
      if (current !== epoch.current) return;
      controller.current = null; attempt.current = null; setProgress(null);
      commit.current(result);
    } catch (error) {
      if (current === epoch.current && !abort.signal.aborted) setProgress({ done: 0, total: 0, error: error instanceof Error ? error.message : "工作流导入失败" });
    } finally { if (current === epoch.current) controller.current = null; }
  }
  function paste(html: string, point: { x: number; y: number }) {
    if (!email || readOnly || browsing) return false;
    try {
      if (!readWorkflowClipboard(html)) return false;
      if (!controller.current) void submit({ operationId: browserRandomUUID(), html, projectKey, ...point });
    } catch (error) { if (!controller.current) { attempt.current = null; setProgress({ done: 0, total: 0, error: error instanceof Error ? error.message : "工作流格式不正确" }); } }
    return true;
  }
  const dismiss = () => { invalidate(); attempt.current = null; setProgress(null); };
  const status = progress && <div data-testid="workflow-import-status" role={progress.error ? "alert" : "status"} className="absolute left-1/2 top-28 z-40 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg">
    {!progress.error && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-500" />}
    <span className="min-w-0">{progress.error || (progress.total ? `正在同步素材 ${progress.done}/${progress.total}` : "正在读取工作流")}</span>
    {progress.error && attempt.current && <button type="button" className="shrink-0 rounded-lg p-1.5 hover:bg-slate-100" aria-label="重试导入" onClick={() => void submit(attempt.current!)}><RotateCcw className="h-4 w-4" /></button>}
    <button type="button" className="shrink-0 rounded-lg p-1.5 hover:bg-slate-100" aria-label={progress.error ? "关闭导入提示" : "取消导入"} onClick={dismiss}><X className="h-4 w-4" /></button>
  </div>;
  return { paste, status };
}
