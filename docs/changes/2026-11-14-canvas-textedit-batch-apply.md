# 在线改字面板：批量应用（2026-11-14）

## 模块与职责
- `src/lib/canvas/image-text-editor.ts`：在线改字编辑器（外部 store，拥有草稿、保留计费提交身份、任务观测）。本次新增批量编排。
- `src/components/canvas/image-text-panel.tsx`：纯展示面板。本次新增底部批量按钮与批量进行中的禁用/进度呈现。
- `src/components/canvas/canvas-client.tsx`：仅接线（`applyAllOcrSegments` 包装器 + 新 prop）。

## 公共接口、依赖方向
- `CanvasImageTextState` 新增 `batch:{done,total}|null`。
- `editor.apply(segment,context,opts?)` 返回值由 `Promise<void>` 改为 `Promise<boolean>`（true=已受理入队）；新增可选 `opts.silent`（批量时抑制逐条 toast）。
- 新增 `editor.applyAll(context)`：过滤"已编辑且与原文不同"的草稿，按单条同款保留提交路径**顺序**提交；首条失败即停，剩余草稿保持可编辑可重试；完成/中断发一条汇总通知。面板关闭或切换作品时静默中止（不弹误导性通知）。
- 面板 prop 新增 `onApplyAll`；`onApply` 返回类型放宽为 `Promise<unknown>`。

## 本次实现与迁移状态
- 用户诉求：改字草稿不必逐条点"应用"，面板底部提供"批量应用（N）"。
- 批量语义＝逐条独立改字任务（与单条一致：每条按原图生成、结果落在原图右侧、计费身份幂等），不是合成一张全改图。
- 单条"应用"按钮保留；批量进行中：草稿输入、单条应用、模型选择、批量按钮全部禁用；顶部进度条复用为"正在批量提交改字任务（i/N）"。
- 防御：`edit` 在批量期间拒绝写入草稿；`applyAll` 重入保护（`state.batch`）；循环每轮校验 `current()` 且作品未切换，防止把草稿提交到新打开的作品上。

## 验证命令、结果及证据层级
- `tsc --noEmit`：三个改动文件 0 错误（仓库存在基线噪声：sharp/three 类型、canvas-action-menu ref，均为未触碰文件的既有错误）。
- `next lint`（三文件）：0 新增问题；canvas-client 6 条既有 exhaustive-deps 警告不位于本次改动行。
- 证据层级：静态检查通过；未做浏览器端到端（该面板为付费生成入口，按约定不在本地真实付费验证）。

## 未完成项与下一步
- 可选后续：把 `createCanvasImageTextEditor` 纳入 jsdom 单测（仓库目前无 test runner，需先引入基建，本次不扩scope）。
