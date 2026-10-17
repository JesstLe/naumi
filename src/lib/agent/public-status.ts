/** Public, deterministic explanations. Never derive charging claims from model prose. */
const messages: Record<string, [string, string]> = {
  INTENT_REQUIRED: ["本轮未识别到该操作的明确指令，请直接说明需要修改的图片和目标效果。", "Describe the image and intended change explicitly before running this tool."],
  ARGUMENT_INVALID: ["工具参数不完整或格式不正确，请调整参数后再执行。", "Tool arguments are incomplete or invalid. Adjust them before continuing."],
  FEATURE_ACCESS_DENIED: ["当前账号尚未获得该功能的使用权限，请检查功能授权。", "This account does not have access to this feature."],
  TOOL_DENIED: ["该工具尚未获得执行授权，请检查工具权限。", "This tool has not been authorized."],
  REPLAY_BLOCKED: ["相同操作已受理，请先检查已有结果，避免重复提交。", "This operation was already accepted. Check its result before submitting again."],
  BUDGET_EXCEEDED: ["本轮执行已达到次数或时间上限，请先检查已有结果。", "This run reached its call or time limit. Check existing results first."],
  RUN_INACTIVE: ["本轮任务已停止，请从历史记录核对已有结果。", "This run has stopped. Check its history for existing results."],
};
export function agentRestrictionMessage(code: unknown, english = false): string | undefined {
  return typeof code === "string" ? messages[code]?.[english ? 1 : 0] : undefined;
}
