# 画布文字节点：正文、AI 写作与下游生成

## 模块与职责

基线 `af877f1507061d5c92702f67785c29438c5f8bbe`，任务分支 `codex/text-node-ux-20261103`。

文字节点首先是可直接编辑和复用的内容。用户无需调用模型即可保存文字。AI 写作是显式动作，只输出文字；生成图片沿用既有图片节点/任务管线，不替换文字节点，也不因连线或编辑自动执行。

最新主线已经具备普通无产品图生图与商品模式，本次复用，不重建任务、计费、存储或引用系统。

## 公共接口、依赖与数据归属

- `canvasTextContent` 统一正文读取。已有正文优先；历史 idle prompt-only 节点兼容读取；completed/failed 节点的空正文具有明确语义，不回退到旧写作指令。
- `useTextNodeAutosave` 仅负责 650ms 合并保存与显式 flush，调用原有文字节点串行持久化接口；节点、权限、历史仍由画布所属模块管理。
- `/api/canvas/text-generate` 接受独立 `prompt`（写作要求）、`content`（原文）、`sourceIds` 与 `projectKey`。仅显式“生成文字”调用；旧 prompt-only 请求保留兼容。
- 图片输入规划、视频文字读取/脚本摘录使用同一个正文规则。引用不等于执行；下游模型配置与账务仍归原生成模块。
- 无数据表迁移，不复制供应商调用、报价、任务恢复及未知受理状态规则。

## 实现与迁移状态

- 空白节点直接可写；卡片与创作栏正文同步，手写内容进入可用状态。
- 创作栏分为“正文 / AI 写作”，要求与正文分开保存；修改正文不重置展开态，清空不会恢复旧提示词。
- “生成文字”标明输出类型；生成中仍可阅读原文，失败保留正文，成功可撤销；用户标题保留。
- 生图面板展示实际输入预览，复用普通/商品模式及原有图片任务通道。正文为空时拒绝错误输入，而不是把“请润色”用作生图提示词。
- 不含 AI 指令的纯内容节点不被批量运行当作文字生成任务。
- 文字引用在服务端按账号与项目读取，不把文字 ID 当成视觉图片，不增加自动收费调用。

## 验证命令、结果及证据层级

- `node scripts/verify-canvas-text-node-ux.cjs --baseline --source-root <BASELINE>`：本次旧版空白节点不可编辑、Dock输入未保存两项缺陷复现，预期 exit 1。
- `node scripts/verify-canvas-text-node-ux.cjs --source-root <任务源码>`：真实 Next/React CanvasClient 的 17 项浏览器流程通过，exit 0；全部业务 API 为本机 HTTP 边界 fixture，无外网、无真实供应商调用。
- `node scripts/verify-canvas-text-autosave.cjs ...`：真实 React Hook 12 项通过，含合并保存、取消、写屏障、owner A/B/A、退出和卸载恢复，exit 0。
- `node scripts/verify-canvas-text-prompt-feedback.cjs ...`：实际 Route + OpenAI SDK + loopback HTTP 33 项通过；正文与指令、同项目文字/图片引用、能力门禁、旧商品配方、SSE/截断/错误均覆盖，exit 0。
- `node scripts/verify-canvas-text-reference-model.cjs`：真实 model request 模块 7 项通过，文字引用不误判视觉输入，图片和产品仍受原视觉能力判断，exit 0。
- `node node_modules/tsx/dist/cli.mjs scripts/verify-canvas-text-generation-input.ts`：12 项通过；`verify-canvas-text-content.ts`：12 项；`verify-canvas-text-image-inputs.ts`：67 项；`verify-canvas-text-edit-history.ts`：PASS。
- `node scripts/verify-canvas-text-node-ux-pg.cjs ...`：真实 CRUD/history SQL、隔离 PostgreSQL，baseline 12 项、modified 13 项通过；所有权、清空、正文/指令、撤销、事务失败、并发操作幂等及删除恢复得到验证。本任务临时容器已按唯一标签核对后停止删除，剩余 0。
- 全项目 `node node_modules/typescript/bin/tsc --noEmit --incremental false`：exit 0。定向 ESLint：0 errors（旧 Canvas Hook warnings 单独留档）。
- 浏览器检查 1440 桌面与 390 移动端正文、AI 写作和图片预览；内容、显式生成按钮无裁切。

### 独立复核与集中测试修复

复核发现并修复：@引用使用旧快照覆盖输入、待发自动保存绕过删除/历史写屏障、键盘生成后续写丢撤销基线、保存未确认时退出保护、生成与删除竞争、关联文字落库前被读取、结果保存期间编辑反馈不一致。浏览器又捕捉到 `displayNodes` memo 和 `nodesSig` 两层遗漏 busy 字段，补齐后原断言通过；失败尝试均保留，不以复跑绿覆盖历史错误。

证据目录：`E:/Workspace/naumi-text-node-ux-evidence-20261103`。保留原始源码 zip、SHA256、修改包、差异、基线与修改后报告以及副本回滚。

## 未完成项与下一步

- 源码及本地集中验收完成；副本回滚、最终合并提交与远端 SHA 记入证据目录 `VERIFICATION.txt`。
- 证据中分别保留 UI fixture、真实 Route/SDK loopback、真实隔离 PG 三个层级；没有真实供应商质量或生产全链路验收结论。
- 本任务不执行服务器发布；代码整合、隔离测试与线上验收分别记录。
