# Agent 链路修复

基线 `4b1f251d6699a4b4b14bc6480c1c08d56986268a`；任务分支 `codex/agent-chain-fixes-20261110`，独立工作树 `E:/workspace/naumi-agent-chain-fixes-20261110`。

范围：[链路审计](2026-11-10-agent-chain-audit.md) A01–A16 已完成代码修复及定向验证。原审计保留历史事实，本记录承接关闭状态。独立 P1 平台任务负责新增项目/媒体/时间线工具，本任务没有替代其实施或验收。未发布服务器，47 暂缓发布决定和发布计数保持不变。

## 会话与流式结果

模块与职责：Agent 历史契约、事件缓冲、终态判断、画布启动清理、工作台正文恢复与视觉适配。

公共接口、依赖与事务归属：事件和终态规则为无 I/O 公共模块；会话 repository 继续拥有历史写入/CAS，release-runtime 提供活动归属和同一任务启动锁的窄接口；修改/删除与活动检查共用事务连接。模型/供应商、计费和已受理任务保持原 owner。

实现与迁移：

| 审计项 | 修复 |
| --- | --- |
| A01 | 新客户端已有会话只发送本轮输入，历史由服务器恢复；兼容旧客户端长 assistant 消息和超过 100 条历史，保留请求总字节及新用户输入上限。 |
| A02 | 单调 sequence 持久化并恢复；裁剪/失效游标返回 reset/history_required，客户端回读持久历史，旧缓冲不能覆盖快照，后续回复不能替换用户原文。 |
| A03 | 画布初始持久化失败清理 running/canvasExecuting/回调，CAS 冲突返回 409，未调用模型。 |
| A04 | error、EOF、停止保留已输出正文和步骤；无 final 的 EOF 明确失败，取消客户端重复自动保存。 |
| A05–A06 | 两入口共用终态判断；length 不再假报成功，受限/待确认事实覆盖模型成功承诺；工作台持久化成功后才发 final。 |
| A07 | 通过既有归属校验读取相对/站点媒体 URL 的真实字节，缺失/无权引用返回 422，不静默丢图。 |
| A16 | 历史使用本机及全局 owner；running/unknown 拒绝修改/删除；开始执行取得活动归属后再次验证历史 CAS，防止删除后复活；旧实例退出后由当前实例读取持久历史。 |

## 网关与外部客户端

模块与职责：工具错误与产物事实、网关回执/幂等摘要/预算占用、CLI/MCP 恢复编号。

公共接口、依赖与事务归属：`tool-errors` 使用 invocation 级 AsyncLocalStorage 跟踪是否可能提交，Harness 保留净化后的 HTTP 状态/错误码/提交状态；`execution-evidence` 供站内和网关共用。网关 ledger 保留原令牌行锁与预算事务；计费模块显式返回本次预算额度，不改变后续阶段冻结报价或实际扣款账本。

| 审计项 | 修复 |
| --- | --- |
| A08 | 上传入口要求 write scope，先拒绝再解析/持久化文件。 |
| A09 | 明确 4xx 拒绝穿过 Harness 保留 submitted=false；先受理写入后轮询失败保持 unknown，并发调用不串状态。 |
| A10–A11 | failed 且 submitted=unknown 返回退出码 5；响应头前断连仍返回 operationId，CLI/MCP 用原编号查询，无自动重提。 |
| A12 | 识别 job.outputs[].url 及音频产物，排除输入素材。 |
| A13 | generate_aplus 准备阶段预算为 0；后续执行阶段沿用原冻结报价，不重复预占。 |
| A14 | verificationStatus=unavailable 返回失败回执并保留说明，creation 标记 needs_review。 |
| A15 | 幂等摘要覆盖原始 request 及租户上下文；同请求重放，不同请求 409。 |

兼容边界：历史 ledger 若使用旧摘要且含非空 request，新调用不会猜测旧语义；同编号重提可能得到 409，应通过 status 查询历史回执。无 request/无租户的旧摘要保持不变。未知受理状态不自动重提。

## 验证与证据层级

证据目录：`E:/workspace/naumi/output/agent-chain-fixes-20261110/`。仅本机隔离 PostgreSQL、独立随机 schema、loopback HTTP、受控模型/内部端点，无生产数据库或真实供应商调用。

| 命令 | 结果与范围 |
| --- | --- |
| `node scripts/verify-agent-chain-fixes.cjs` | A01–A16 全部通过；当前函数/模块回归，I/O 端口受控；含先受理后 404 与并发错误状态隔离。 |
| `node --import tsx --conditions react-server scripts/verify-agent-chain-history-pg.ts` | 18 项，真实 PG advisory lock 等待、全局 busy/unknown、跨实例历史、删除后 CAS 阻止模型调用。 |
| `node --import tsx --conditions react-server scripts/verify-agent-chain-gateway-pg.ts` | 18 项，实际 Routes、令牌、上传/归属媒体字节、幂等、并发预算、实际 CLI/MCP 子进程断连及 status 恢复；内部工具端点为 fixture。 |
| `node scripts/verify-workbench-recovery.cjs` | React 19 + Chromium 51 项；长会话、裁剪恢复及 error/EOF 保留正文/步骤，22 次 fixture PUT，0 次客户端保存 POST。 |
| `node scripts/verify-capacity-agent-streams.cjs` | 全部通过，含本机 HTTP 断连、观察者/超时/清理及 12009 个 Markdown 差分样本。 |
| `node scripts/verify-canvas-assistant-session.cjs` | 15 场景、55 检查通过。 |
| `node scripts/verify-agent-chat-attachments.cjs` | 31 检查通过；更新旧脚本模块路径与 bundler，未改变产品归属校验。 |
| `node --import tsx --conditions react-server scripts/verify-agent-session-repair.ts` | 58 检查通过；真实 PG 历史 CAS、恢复和证据。 |
| `node --import tsx --conditions react-server scripts/verify-agent-stream-recovery.ts` | 通过；12 次受控模型请求、3 次正文续写、0 次收费工具/扣款。旧 fixture 改为真实归属项目，保留产品 404 保护。 |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | 通过。 |

未完成项与下一步：本轮 16 项无剩余代码待修；真实供应商、生产双槽、生产容量及新增平台功能不在本轮验收范围。上线须按固定版本蓝绿流程执行，不把上述本机证据写成线上完成。主线整合与最终验证结果在下文记录。

## 主线整合与最终检查

功能提交 `82c2928ca3280723f4f907d74a6452d0a0292c09`；已将 `origin/main` 的 `b678fa7042f4f528608ad96a62f476f398ef8a9d` 普通合入，整合提交 `8029b67c806a2e2e7cd165175f0397c5fdd3b809`，无冲突，保留画布 dock/后台查询改动。本次完成 2 个业务模块，整合主线后计数归零；文档不计功能或发布次数。

整合后 A01–A16、画布会话 55 检查、附件 31 检查、工作台浏览器 51 项、Harness 104 项、真实 PG Agent 计费（冻结报价、稳定 operation、40 次新调用、余额拒绝、0 供应商请求）、完整 tsc 和改动源文件 ESLint 均通过。无新增生产验收结论。
