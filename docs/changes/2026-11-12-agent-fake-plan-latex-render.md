# 移除伪造任务安排 + 会话消息 LaTeX 渲染

日期：2026-11-12
分支：`codex/agent-plan-latex-20261112`（基于 origin/main `92ad921a`）
用户反馈：① 每轮对话开头固定出现「整理结果…」+「任务安排」模板块，与实际请求无关；② LaTeX 公式渲染失败（模型把公式塞进代码块，前端原样展示）。

## 模块与职责

### 问题一：伪造任务安排（agent 任务编排）
- 根因：`src/app/api/agent/route.ts` 每次提交消息无条件 `appendSessionEvent(session,"plan",{items:buildTaskPlan(...)})`；`recovery.ts` 的 `buildTaskPlan` 是关键词启发式，未命中即拼「确认任务要求、商品图和积分条件 → …」通用模板——对非出图请求内容错误且暴露内部业务词。真实工具调用本就以独立步骤（tool_start/tool_end）呈现，假 plan 零信息量、发出即「已完成」。
- 修复（方案 A）：删除该合成事件与 `buildTaskPlan` 函数；`verify-agent-creation-controls.ts` 对应断言改为「route 源码不再含合成 plan 发射」并保留「历史 plan 事件仍可回放」检查（`workbench-activity.ts` 的 plan reducer 不动，历史会话回放兼容）。
- 连带：plan 恒存在曾导致 pending spinner 恒显示「整理结果…」；现在首工具前恢复「正在处理…」语义，无需改 UI。

### 问题二：LaTeX 渲染（home 前端渲染管线）
- 根因：`creation-message.tsx` 用裸 `react-markdown@10`，无 math 插件；系统提示词也未告知公式语法约定，模型按通用习惯把公式放进代码块。
- 修复：新增依赖 `remark-math@6.0.1`、`rehype-katex@7.0.1`、`katex@0.16.47`；`creation-message.tsx` 挂 `remarkMath`/`rehypeKatex` 插件并引入 katex.css；`AGENT_SYSTEM_PROMPT` 工作规则新增第 9 条「数学公式用 LaTeX 直接写（$行内$、$$独立块$$），不要放代码块」。

## 公共接口与依赖方向
- Route→recovery 依赖收敛（classifyAgentFailure 保留）；plan 事件协议对前端保持只读兼容（历史回放）。
- 渲染管线：creation-message → react-markdown → remark-math/rehype-katex；KaTeX 字体随 Next CSS 管线打包。

## 验证命令、结果及证据层级
- `node scripts/verify-agent-math-render.cjs`（新增）→ `{"checks":12,"failed":0}`：真实 creation-message.tsx 经 esbuild（react/react-dom external 用同一实例）+ `react-dom/server` 静态渲染。覆盖：行内公式 KaTeX 渲染且无残留 `$...$`、独立块 katex-display、代码块内公式不渲染（提示词约束的兜底验证）、站内 media 图片语法与图片工具不受影响、非法公式不崩且有可见回退、用户消息不经 katex 管线。
- `npx tsx --require ./scripts/enterprise-integration-test-preload.cjs scripts/verify-agent-creation-controls.ts` → 24 checks 全过（含新增 synthetic-plan-emission-removed、historical-plan-events-still-replay）。
- 变异验证：移除 math 插件 → math 套件 4 项失败；还原 route 合成 plan 发射 → creation-controls 套件断言命中；两次还原均字节级一致。
- `npx tsc --noEmit` 触及文件无新增错误；`npx eslint`（5 个源文件）干净。
- 已知既有问题（非本次引入）：`scripts/verify-agent-chain-fixes.cjs` 在原始 origin/main 上即于 `:81:2` 断言失败（A05/A06 workbenchRoute 提取路径），本次改动前后行为一致，未处理。
- 证据层级：组件级/模块级回归 + 变异；未含真实浏览器目测与真实模型对话验证。

## 未完成项与下一步
- 提示词规则随下次发布生效；未发布前旧前端收到 `$...$` 仍显示原文，属预期过渡。
- KaTeX 在暗色主题下的显示色随 `currentColor`，未单独目测；发布验收时顺带覆盖。
- `verify-agent-chain-fixes.cjs` 的既有断言失败另起任务排查。
