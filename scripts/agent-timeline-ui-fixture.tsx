import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CanvasAssistantPanel, type CanvasAssistantLabels, type CanvasAssistantTurn } from "../src/components/canvas/canvas-assistant-panel";
import { updateAssistantTimeline, restoreAssistantTimeline } from "../src/lib/canvas/assistant-timeline";
import { reduceAgentProgress } from "../src/lib/canvas/agent-progress";
import type { AgentOrbStep } from "../src/lib/canvas/agent-orb";
const labels: CanvasAssistantLabels = { title: "画布助手", newChat: "新建对话", history: "项目对话记录", close: "关闭", back: "返回", morning: "早上好", afternoon: "下午好", evening: "晚上好", question: "需要做什么？", changeTasks: "换一组", placeholder: "输入消息", send: "发送消息", references: "查看参考图片", closeReferences: "关闭参考图片", currentImage: "当前图", upstreamImage: "参考图", thinking: "思考中", copy: "复制", copied: "已复制", emptyHistory: "暂无记录", currentChat: "当前对话", agent: "Agent", mode: "模式", retry: "重试", scrollToBottom: "回到最新" };
const fixture: any = (window as any).timelineFixture = { events: [] as any[], supplierCalls: 0, uploads: 0, copy: "" };
function App() {
  const [turns, setTurns] = useState<CanvasAssistantTurn[]>([{ id: "u", role: "user", content: "请检查当前画布并给出建议。" }, { id: "a", role: "assistant", content: "", timeline: [] }]);
  const [steps, setSteps] = useState<AgentOrbStep[]>([]), [busy, setBusy] = useState(true), [responding, setResponding] = useState(false), [input, setInput] = useState("");
  fixture.event = (event: any) => {
    fixture.events.push(event);
    setTurns(current => {
      let next = updateAssistantTimeline(current, event);
      if (event.type === "delta" || event.type === "final") next = next.map((turn, i) => i === next.length - 1 ? { ...turn, content: event.type === "final" ? event.reply : turn.content + event.text } : turn);
      return next;
    });
    setSteps(current => reduceAgentProgress(current, event));
    if (event.type === "delta") setResponding(true);
    if (event.type === "tool_start") setResponding(false);
    if (event.type === "done" || event.type === "error") { setBusy(false); setResponding(false); }
  };
  fixture.reset = () => { fixture.events = []; setTurns([{ id: "u", role: "user", content: "请检查当前画布并给出建议。" }, { id: "a", role: "assistant", content: "", timeline: [] }]); setSteps([]); setBusy(true); setResponding(false); };
  fixture.restore = (raw: any[], events: any[]) => { setTurns(restoreAssistantTimeline(raw, events)); setSteps([]); setBusy(false); setResponding(false); };
  fixture.nextTurn = () => { setTurns(current => [...current, { id: "u2", role: "user", content: "再检查一次。" }, { id: "a2", role: "assistant", content: "", timeline: [] }]); setSteps([]); setBusy(true); };
  fixture.stream = async () => {
    const response = await fetch("/stream"); const reader = response.body!.getReader(), decoder = new TextDecoder(); let buffer = "";
    for (;;) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const parts = buffer.split("\n\n"); buffer = parts.pop() || "";
      for (const part of parts) { const lines = part.split("\n"); fixture.event({ type: lines[0].slice(7), ...JSON.parse(lines[1].slice(6)) }); }
    }
  };
  return <main className="flex h-screen justify-end bg-[#f4f7fb] p-3"><CanvasAssistantPanel light anchorTitle="当前画布" contextImages={[]} turns={turns} input={input} busy={busy} error={null} costLabel="" labels={labels} tasks={[]} onInputChange={setInput} onSend={() => {}} onNewChat={fixture.reset} onRestoreChat={() => {}} onClose={() => {}} onPreview={() => {}} onCopy={async text => { fixture.copy = text; return true; }} onFeedback={() => {}} renderContent={content => <div style={{ whiteSpace: "pre-wrap" }}>{content}</div>} steps={steps} responding={responding} onStop={() => fixture.event({ type: "error" })} onUploadImages={async () => { fixture.uploads++; }} /></main>;
}
createRoot(document.getElementById("root")!).render(<App />);
