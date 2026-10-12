import type { AgentBridge } from "./bridge-types";
import { PiBridge } from "./bridges/pi-bridge";
import { CodexBridge } from "./bridges/codex-bridge";
import { HarnessError } from "./harness";

// ---------------------------------------------------------------------------
// 桥接注册器:按 AGENT_BACKEND env 选择底座,默认 pi。
// 新增底座 = 新增 bridges/xxx-bridge.ts 实现 AgentBridge + 在此注册。
// 路由与 runtime 只认 AgentBridge 接口,不 import 具体底座。
// ---------------------------------------------------------------------------

let cached: AgentBridge | null = null;

export function getAgentBridge(): AgentBridge {
  if (cached) return cached;
  const backend = (process.env.AGENT_BACKEND || "pi").trim().toLowerCase();
  switch (backend) {
    case "pi":
      cached = new PiBridge();
      return cached;
    case "codex":
      cached = new CodexBridge();
      return cached;
    default: throw new HarnessError("BACKEND_DISABLED",503);
    // 未来底座在此注册:
    // case "omp": cached = new OmpBridge(); return cached;
  }
}

export function currentBackendName(): string {
  return (process.env.AGENT_BACKEND || "pi").trim().toLowerCase();
}
