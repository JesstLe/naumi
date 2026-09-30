# 金山文档画布需求闭环记录

更新日期：2026-09-30
需求来源：`https://www.kdocs.cn/l/cjohaKOi3nz3`（《无线画布修改建议-第一版》）

## 目标

以当前 Naumi 原生 Next.js、PostgreSQL、React Flow、账号、积分、媒体存储和作品血缘为基础，完成需求文档中未标记“已完成”的项目；已经存在的能力以真实代码和回归结果为准，不重复建设第二套画布。

## 完成状态

| 编号 | 原始需求 | 当前处理方向 | 状态 |
| --- | --- | --- | --- |
| P1-2 | 重命名和图片选中样式参考稿定 AI | 双击重命名、蓝色选中框与缩放控制点 | 已完成 |
| P2-1 | 文字识别报错、不准确、反应较慢 | PaddleOCR 超时/重试、嵌套结果归一化、置信度过滤、去重、阅读顺序与视觉模型兜底 | 已完成 |
| P2-2 | 改字功能参考稿定 AI；识别整图全部文字并逐项修改 | 整图预览、全部文字框、当前段联动高亮、逐项编辑和后台任务 | 已完成 |
| P2-3 | 图片或文件可单个、批量复制粘贴进画布 | Explorer/Finder 单张和批量文件、空 MIME 图片、去重与批量上传 | 已完成 |
| P2-4 | 右键可批量选中对象操作 | Ctrl/Command + 右键切换选择，菜单加入/移出批量选择 | 已完成 |
| P2-5 | 多图选中后可批量运行，生成图片或文本 | 批量生图、批量反推/生文和独立失败反馈 | 已完成 |
| P2-6 | 多图生成一张 | 合并生成节点、`parentIds`、连线和统一生成入口 | 已完成 |
| C-3 | 添加节点按钮继续放大 | 移动端 40px、桌面 48px，区别于普通工具 | 已完成 |
| C-5~8 | 导入图片自适应、缩放、按需显示功能、标题大小及双击编辑 | 原尺寸导入、等比缩放、按选择显形、标题重命名 | 已完成 |
| C-9 | 图片在线改字 | 与 P2-1/P2-2 共用持久后台改字任务 | 已完成 |
| C-10 | 节点连接增加文字生成、图形生成 | 连接菜单、`sourceIds/targetIds`、图片和文字血缘持久化 | 已完成 |
| C-Mac | macOS M/Intel、跨端视觉与交互一致 | Windows/macOS Chrome UA、Command/Ctrl、响应式 Dock 和 ClipboardItem 路径 | 代码与自动化完成；实体 Mac 外部验收 |
| C-15 | 连接线更粗 | 默认 4px、选中 5px，并保留透明命中区 | 已完成 |
| C-16 | 编辑框默认更大并按文本自适应 | 默认约五到七行，内容增长后内部滚动，可手动放大 | 已完成 |
| C-19 | 修改图生成期间可以关闭面板继续其他任务 | PostgreSQL 持久任务、Worker、占位恢复、幂等计费和失败退款 | 已完成 |

## 已明确不重复实现

需求文档中已经标记完成，且当前代码已有对应能力的项目继续纳入回归但不另建实现：模型目录、图片比例文案、提示词编辑、文字撤回、Delete 删除、画布首页、批量导入成组、文字生成节点、模型选择、连接线按 Delete 删除、黑白画布、`@` 选图和图片连接文字节点。

## 实现约束

- 保留现有 `@`、连线、`sourceIds`、`targetIds`、`parentId/parentIds` 和项目分组。
- 图片/文字/视频/音频节点继续使用同一 React Flow 画布。
- UI 使用克制的浅色专业工作台，不使用紫色渐变、光晕、玻璃卡片或无业务价值文案。
- 生产账号验收使用只读脚本，禁止运行会清理项目或作品的破坏性脚本。
- 测试集中在模块完成后执行，避免每次小改动都进行全量构建。

## 验收记录

- `node scripts/canvas-native-size-smoke.mjs`：`MODIFIED_RESULT=PASS ... checks=7`。
- `node scripts/canvas-text-node-smoke.mjs`：`MODIFIED_RESULT=PASS ... checks=12`。
- `node scripts/canvas-batch-upload-smoke.mjs`：`MODIFIED_RESULT=PASS checks=22`。
- `node scripts/canvas-text-multiselect-smoke.mjs`：`CANVAS_TEXT_MULTISELECT_RESULT=PASS ... checks=19`。
- `node scripts/canvas-background-task-recovery-contract.mjs`：`PASS checks=7`，包含 `videoAttention=stopped-actionable`。
- OCR、持久图片任务、视频 Provider、视频 PostgreSQL、发布 Compose、TypeScript、Lint、Build 与回滚证据见同轮事务目录和 `docs/CANVAS_STATUS.md`。
- 2026-09-30 部署前生产只读基线仍为旧版本：Windows/macOS 的 `1093×614` 图片工具条布局为 6/8；本地候选已修复，需部署后重跑 8/8。
- 实体 Mac Safari/Chrome 的 Command、触控板惯性、Finder ClipboardItem 和 Retina 属于外部设备验收边界，不以 UA 自动化冒充真机结果。
