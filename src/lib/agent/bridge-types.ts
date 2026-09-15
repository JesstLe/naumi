// ---------------------------------------------------------------------------
// AgentBackend 桥接契约 —— 解耦业务工具与具体 Agent 底座。
//
// 设计原则:
//   1. 业务工具(NaumiTool)只依赖本文件的 NaumiToolDef,不依赖任何底座类型;
//   2. 换底座 = 新增一个 XxxBridge 实现 + env 切 AGENT_BACKEND,业务零改动;
//   3. 事件协议统一:所有底座的进度差异在 Bridge 内部抹平,对外只发
//      HubAgentEvent(plan/tool_start/tool_end/assistant/agent_start/agent_end/error)。
// ---------------------------------------------------------------------------

export type HubAgentEvent = {
  type:
    | "agent_start"
    | "agent_end"
    | "plan"
    | "tool_start"
    | "tool_end"
    | "assistant";
  data: Record<string, unknown>;
};

/** 业务工具定义:底座无关。TypeBox schema 编译期即可转任意底座格式。 */
export type NaumiToolDef = {
  name: string;
  description: string;
  /** TypeBox 参数 schema(JSON Schema 兼容) */
  parameters: object;
  /** 执行入口。abortSignal 必须被尊重;onProgress 用于长任务中间播报。 */
  execute: (args: Record<string, unknown>, ctx: ToolExecContext) => Promise<ToolExecResult>;
  /** 是否写操作(写操作禁止自动重试) */
  write?: boolean;
  /** 超时预算 */
  timeoutMs?: number;
};

export type ToolExecContext = {
  signal: AbortSignal;
  /** 长任务中间进度(onUpdate 语义) */
  onProgress?: (text: string) => void;
};

export type ToolExecResult = {
  /** 给 LLM 的完整结果(内部文本) */
  text: string;
  /** 给前端的公开摘要(绝不回退到 text) */
  publicSummary: string;
  /** 业务附带数据(URL 等),不直接下发前端 */
  data?: Record<string, unknown>;
};

/** 桥接后的会话句柄。 */
export type AgentSession = {
  sessionId: string;
  /** 运行中? */
  isRunning: () => boolean;
  /** 发起任务。onEvent 持续收事件直至 agent_end。 */
  run: (message: string, onEvent: (e: HubAgentEvent) => void) => Promise<{ reply: string }>;
  /** 插话修正(运行中注入;底座不支持时抛 NotSupportedError) */
  steer: (message: string) => Promise<void>;
  /** 中止 */
  abort: () => Promise<void>;
  /** 最近一条 assistant 回复 */
  lastReply: () => string;
  /** 上下文消息数(遥测用) */
  turns: () => number;
};

export type AgentBridge = {
  readonly name: string;
  createSession(opts: {
    sessionId: string;
    systemPrompt: string;
    tools: NaumiToolDef[];
    history: { role: string; content: string }[];
    /** 工具执行前拦截(积分预检等)。返回 string = 拦截并以此为由拒绝。 */
    beforeToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<string | undefined>;
    /** 会话所属用户(计费/鉴权上下文) */
    email: string;
    /** 凭证 getter(工具内部调用业务 API 时透传) */
    getCred: () => { cookie: string; authorization: string };
  }): Promise<AgentSession>;
};

/** 底座不支持某能力时抛此错误,上层降级处理。 */
export class NotSupportedError extends Error {
  constructor(feature: string) {
    super(`当前底座不支持: ${feature}`);
    this.name = "NotSupportedError";
  }
}
