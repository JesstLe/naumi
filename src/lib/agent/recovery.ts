import { AgentStreamInterruption } from "./stream-recovery";

export type AgentFailure = {
  code:
    | "ABORTED"
    | "AUTH"
    | "CREDITS"
    | "NETWORK"
    | "TIMEOUT"
    | "VALIDATION"
    | "PROVIDER"
    | "UNKNOWN"
    | "OUTPUT_LENGTH"
    | "STREAM_INTERRUPTED";
  message: string;
  recoverable: boolean;
  action: string;
  canContinue?: boolean;
};

export function classifyAgentFailure(error: unknown): AgentFailure {
  if (error instanceof AgentStreamInterruption) return { code: error.code, message: error.message, recoverable: true, action: error.partial ? "继续输出" : "重试", canContinue: error.partial };
  const raw = error instanceof Error ? error.message : String(error || "执行失败");
  const message = raw.slice(0, 500);
  const lower = message.toLowerCase();
  if (/abort|中止|取消|已停止/.test(lower)) {
    return { code: "ABORTED", message: "任务已停止", recoverable: true, action: "可调整要求后重新执行" };
  }
  if (/401|403|登录|鉴权|authorization|cookie|invalid[ _-]token|expired[ _-]token|api[ _-]key/.test(lower)) {
    return { code: "AUTH", message: "登录状态已失效", recoverable: true, action: "请重新登录后继续当前会话" };
  }
  if (/余额|积分|credit|quota/.test(lower)) {
    return { code: "CREDITS", message: "积分不足，收费工具未执行", recoverable: true, action: "补充积分或缩小生成数量" };
  }
  if (/timeout|timed out|超时/.test(lower)) {
    return { code: "TIMEOUT", message: "任务等待超时", recoverable: true, action: "先到作品库检查是否已有结果；确认没有后再重试" };
  }
  if (/fetch|network|econn|socket|网络/.test(lower)) {
    return { code: "NETWORK", message: "网络连接中断", recoverable: true, action: "只读步骤可自动恢复；收费步骤请先检查作品库再决定是否重试" };
  }
  if (/400|参数|格式|validation|invalid/.test(lower)) {
    return { code: "VALIDATION", message: "任务参数不完整或格式不正确", recoverable: true, action: "补充商品图或修改任务要求" };
  }
  if (/model|provider|模型|上游|接口/.test(lower)) {
    return { code: "PROVIDER", message: "模型服务暂时不可用", recoverable: true, action: "稍后重试；收费工具不会自动重复提交" };
  }
  return { code: "UNKNOWN", message: "任务执行失败", recoverable: false, action: "保留当前轨迹并联系管理员排查" };
}

export function buildTaskPlan(message: string, textStrategy = false): string[] {
  if (textStrategy) return ["核对简报事实与待确认项", "制定信息层级与差异化创意方向", "交付推荐策略、产品线规则与验证动作"];
  const text = message.toLowerCase();
  const plan = ["确认任务要求、商品图和积分条件"];
  if (/模板|参考/.test(text)) plan.push("检索适合的站内模板或参考作品");
  if (/精修|retouch/.test(text)) plan.push("调用商品精修工具并保留主体细节");
  if (/换色|颜色|recolor/.test(text)) plan.push("生成指定颜色版本");
  if (/复刻|爆款|replicate/.test(text)) plan.push("按参考图复刻视觉风格");
  if (/套图|13张|十三张|suite/.test(text)) plan.push("生成完整电商套图");
  if (/a\+|详情|aplus/.test(text)) plan.push("规划并生成 A+ 详情页模块");
  if (/生成|出图|图片|图像/.test(text) && plan.length === 1) plan.push("调用匹配的图片生成工具");
  if (plan.length > 1) plan.push("用视觉模型检查主体完整性、文字和版式，再汇总交付");
  else plan.push("直接回答并说明可执行的下一步");
  return plan;
}
