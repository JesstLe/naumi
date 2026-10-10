# 节点工具栏文案精简（2026-10-10）

## 状态与边界
- 分支：`codex/canvas-toolbar-copy`；基线：`c4b67ec8aaf62333f4ea0be2257aed18d308d2cd`。
- 完成：19项工具栏提示中英文同步精简，裁剪/替换两个悬停标题缩短。
- 仅提交分支，由其他 agent 统一合并发布；本轮未发布，也未操作新旧服务器。

## 改动原则
- 用短句表达动作或结果，删除“不是……”“不会……”以及操作流程解释。
- 抠图：`移除背景，输出透明图`；AI增强：`AI增强，生成新图`；换视角：`生成新视角`；生成文案图：`生成营销文案图`。
- 裁剪：`裁剪为新版本`；替换：`替换为新版本`。
- 保留确认弹窗中的版本保存信息；按钮标签、入口数量、布局、事件处理、生成参数、计费与供应商路由均未改。

## 验收
- `scripts/verify-canvas-toolbar-copy.mjs`：原始长文案复现、新文案长度/否定解释检查通过；AST检查字典仅19项提示变更，CanvasClient除两处title外一致。
- 工具栏整合回归、TypeScript `--noEmit`、`git diff --check`通过。
- 浏览器加载真实CanvasActionMenu与字典的独立组件预览，核对抠图title以及菜单3项短提示，截图通过。
- 预览不连接数据库/模型，不是完整画布或线上验收；本轮未运行完整生产构建。
- 源码副本回滚恢复原文件hash与原始长提示；实际任务分支保留新文案。
- 证据：`E:\Workspace\naumi\output\canvas-toolbar-copy-20261010`。

## 接手
```text
阅读AGENTS.md、docs/AGENT_COLLABORATION.md以及本文。
fetch origin/main，整合codex/canvas-toolbar-copy的提交；不要覆盖其他agent修改。
本任务仅文案调整，合并后验收节点工具栏悬停提示和更多菜单。
按统一发布流程部署新机；本任务未授权回传旧机。
```
