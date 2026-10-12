import assert from "node:assert/strict";
import { agentActivityLabel, agentToolLabel, agentToolSummary, agentElapsedLabel } from "../src/lib/canvas/agent-activity";
import { agentOrbState, type AgentOrbStep } from "../src/lib/canvas/agent-orb";

const step = (tool: string, status: AgentOrbStep["status"] = "running"): AgentOrbStep => ({id:tool,tool,label:agentToolLabel(tool),status});
const generation = step("generate_image"), credits = step("get_balance", "done");
assert.equal(agentActivityLabel(true, "running", []), "正在处理请求");
assert.equal(agentActivityLabel(true, "running", [], false, true), "正在回复");
assert.equal(agentActivityLabel(true, "running", [generation], false, true), "正在生成图片");
assert.equal(agentActivityLabel(true, "running", [credits, generation]), "正在生成图片");
assert.equal(agentActivityLabel(true, "running", [credits, generation], true), "Generating image");
assert.equal(agentOrbState(true, "running", [credits, generation]), "working");
assert.equal(agentActivityLabel(true, "running", [step("generate_image", "done"), step("verify_image_output")]), "正在检查生成结果");
assert.equal(agentActivityLabel(true, "running", [step("generate_image", "done")]), "正在处理后续步骤");
assert.equal(agentActivityLabel(true, "running", [step("generate_image", "error"), step("recolor_product")]), "正在替换颜色");
assert.equal(agentActivityLabel(true, "running", [step("search_templates")]), "正在查找模板");
assert.equal(agentOrbState(true, "running", [step("search_templates")]), "searching");
for (const [outcome, label] of [["done", "已完成"], ["error", "未完成"], ["stopped", "已停止"], ["idle", "Agent"]]) {
  assert.equal(agentActivityLabel(false, outcome, [generation]), label, "Terminal status wins over stale running tool");
}
assert.equal(agentToolLabel("private_unknown_tool"), "执行工具");
assert.equal(agentToolSummary("工具执行完成"), undefined);
assert.equal(agentToolSummary("已生成 1 张图片"), "已生成 1 张图片");
assert.equal(agentElapsedLabel(300000), "已等待 5:00");
assert.equal(agentElapsedLabel(-1000), "已等待 0:00");
assert.equal(agentElapsedLabel(61000, true), "Waiting 1:01");
console.log("AGENT_ACTIVITY=PASS generation->verification->follow-up, retry, search, terminal, public labels, elapsed time; provider calls=0");
