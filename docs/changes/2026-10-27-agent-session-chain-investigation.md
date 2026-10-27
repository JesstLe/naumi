# Agent 会话链路排查：历史覆盖、工具执行与验收依据

## 任务与代码同步

- 用户要求：先更新任务分支，再检查截图中的 Agent 会话链路。
- 工作树：`E:/Workspace/naumi-jimeng-capabilities-20261027`，分支 `codex/jimeng-capabilities-20261027`。
- 原 HEAD `fada4d9ecd5bf873c65bea4515f0cc8abdd9338b`；`git fetch origin main` 后 main 为 `fada2f9a94f357eec59f4359ec80295b4a05a3cd`。
- 已普通合并，合并提交 `5c92ea965eda09d524b71cb3e86984e92097a42c`，无冲突，保留图片/文字 Dock 优化。共享 root 的 18 项未提交不改。
- 收尾刷新发现 main 新增后台失败诊断，已再次普通合入 `27e5f0a40c6fb11d5c3f3439f474b1d7082253e5`；第二次合并 `646c8491c1cf67d88e6b91a8b06b9e01e89eab41`。这批现有失败诊断不覆盖下述 Agent 缓存历史问题。
- 本轮是定位与复现，不是修复上线。新增审计脚本和本记录；没有重放付费任务、修改模型配置、改生产会话或发布服务器。
- 私有证据目录：`E:/Workspace/naumi/output/agent-session-chain-20261027`；原始会话、SQL、账务和模型快照仅保留在 ignored output，不提交用户原始内容与凭据。

## 结论与严重度

### P1：新旧 Web 实例往返时，过期内存会话覆盖新历史

2026-10-27 北京时间的只读活动记录证明同一会话按如下顺序执行：

| 时间 | 执行实例 |
| --- | --- |
| 11:23 / 11:29 / 11:33 | `naumi47-web-creations-20261027-r1`，源码 `a33ed3ae` |
| 11:36 | `naumi47-web-2k-diagnostic-20261027-r1`，源码 `fada2f9a` |
| 11:37 / 11:40 / 11:45 / 11:49 | 回到旧实例 |
| 11:54 | 再回到新实例 |

创作记录保留 9 个用户轮次，而最终 `app_agent_sessions` 只有 5 个用户轮次、16 条消息、80 条事件。11:37、11:40、11:45、11:49 四轮在独立创作记录及关联产物/账本中存在，但没有保留在当前会话快照中。新实例 11:36 缓存的旧分支在 11:54 被继续使用，与实际缺失范围吻合。

源码路径：

1. `src/lib/release-runtime/http.ts` 的 `routeAgentToOwner` 允许 idle 会话的新轮次迁往当前入口，不强制回旧实例。这一设计依赖新接手者读取持久历史。
2. `src/lib/agent/runtime.ts` 的 `createRuntimeSession` 在命中本进程缓存、模型/contextStamp 一致时直接返回 existing；`getAgentSession` 位于这个提前返回之后。
3. `persistAgentSession` 把内存中的 user/assistant 文本及事件序列整体保存。
4. `src/lib/db.ts` 的 `saveAgentSession` 在冲突更新中执行 `messages=EXCLUDED.messages`、`steps=EXCLUDED.steps`，没有持久快照版本条件。

本轮审计脚本执行真实 runtime 导出函数，构造“本进程 2 条旧消息 / 持久层已有 4 条消息”的两槽 fixture：缓存复用的 DB 读取次数为 0，随后真实序列化保存把 mocked durable store 从 4 条覆盖回 2 条。它复现应用路径；现场覆盖归因另由真实实例/轮次记录支持，不把 mock 说成真实 PostgreSQL 并发测试。

待修方向：新轮次在取得归属后核对持久版本，过期实例重建；保存使用版本条件/当前所有者校验；只读历史接口不要把旧缓存刷新回库。不能通过停掉仍有任务的旧实例掩盖这一应用缺陷。

### P1：模型声称完成不等于真实工具执行

- 截图第一张图确实由 `replicate_hot` 生成，生成工具后确实执行 `verify_image_output`，90 分不是凭空的分数。
- 后续 11:33 轮次声称“两次识别失败”，但这轮只有一次模型回复，未记录识图工具调用；不是两次新识图请求确实失败的证据。
- 最后 11:54 轮次只有一次 `stop` 类型模型回复，没有生成或验收工具调用，却直接声称生成浴室场景并验收 88 分。
- 该回复中图片路径在 `app_artworks` 和 `app_media_assets` 的对应行数均为 0；没有该轮产物回执。当前证据支持“无执行依据的完成声明”，不把它报告成实际生图失败。
- `runtime.ts` 当前以模型 stop reason 与工具 error 计算创作状态；无工具、正常 stop 即为 succeeded。这表示回复结束，不证明用户要求的外部操作完成。

待修方向：完成状态和媒体展示关联实际工具回执/作品 ID；把模型文字与执行事实分开。保留 ReAct 让模型选已注册工具，不重新引入关键词意图闸门；不要基于文本关键词替用户自动重放生成。

### P2：原始要求在生成提示词和验收目标中偏离

- 用户明确给出产品替换、参考风格、卖点和 1:1 单图要求。
- 实际作品中保存的最终生成提示词额外加入“不要新增任何文字、不要中文标语、不要人物”等约束；最终回复又把未放卖点文字归因为用户要求。这些附加禁止项不是用户明确提出的条件。
- `verify_image_output` 的 schema/执行器只提交一张待验图片和模型填写的 goal；没有提交产品原图和构图参考图用于对比。
- 因此一次视觉模型的 90 分只能说明它对那张成品和给定 goal 的评估，不能证明产品身份、原版式和全部原始要求都被遵守。
- 首轮参考图识别确有上游异常：一次 `ECONNRESET`，一次约 81 秒 `ETIMEDOUT`，另一张识别成功。必须与后续没有真实调用的“识别失败”叙述区分。

待修方向：把当前原始要求随工具执行和验收一起带入，生成/验收引用明确区分产品与构图；提供真正的读图/OCR工具，不让单图质检承担所有素材理解工作。分数与逐项不满足事实同时保留，不以分数代替需求验收。

### P2：多图失败没有精确到所选模型/参数

- 截图轮次先调用两次 `generate_image`，约 31ms、98ms 即结束并报错，之后 `replicate_hot` 成功；前两次没有相应收费生成调用回执。
- 首次回复指出缺少编辑目标。当前 schema 确实要求 edit 模式至少一张 `edit-target`；本轮真实 schema 测试复现 reference+insert 被拒，edit-target+insert 被接受。
- 历史公开 tool_start 未记录完整 input_roles/明确错误码，因此不伪造两次调用的精确原参数。
- 同期 v150 配置：普通 `image.generate` 的工具默认优先指向 Nano Banana Pro，启用的 APIB 通道 `maxReferenceImages=1`；`gpt-image-2` 的 APIB 两通道允许 16 张参考，实际复刻走其中一条完成。
- `featureDefaultModel`、`routeImageModel`、`simulateModel` 的实际逻辑解释了为何“默认双图请求受参考上限限制，但换工具走 GPT 通道能成功”。它是已证实的配置/代码差异，不把缺失的原调用参数补写成事实。实际路由函数的隔离重放进一步确认：两参考时 Banana 被 REFERENCE_LIMIT 排除，GPT 两条通道保留；其余配置验证、价格与参数映射使用测试替身，因此不是完整计划/供应商实测。

待修方向：工具参数说明补全角色语义，返回结构化未提交原因和当前模型能力；由 Agent 查询并选择适用工具/模型。不要笼统对用户说“多图编辑都不支持”，也不擅自改变全局模型设置。

### P2：后台把对话、失败、账务混在一起，容易误读

- 截图中的“结果 2”是此轮所有 assistant 文本拼接，不是第二张图片；其中混有进度、失败说明与最终答复，Markdown 被当纯文本输出。
- `runtime.ts` 将 replies 全量 join，`creation-writer.ts` 写入 output/reply，`creation-browser.tsx` 将全部 output 统一编号为“结果 N”，非媒体用 `<p>` 展示。
- 截图顶部“对应任务账务：未记录”来自失败原因面板，不是整轮实际结算总额。
- 图示复刻的实际 `app_billing_operations` 为 settled、charged_credits=6、reserved_credits=0，`app_ledger` 对应 -6。整轮 family billing 也能查到这 6 分。
- 本次观察窗口该会话相关的 7 次复刻合计 42 分；这不是截图那一张图被扣 42 分，也没有据此判断为重复扣款。

待修方向：图片产物、最终答复、工具时间线分区；失败详情关联具体 toolCall/未提交原因，账务展示对应子任务和轮次汇总。历史缺失时标明证据缺口，不把“未记录”解释为零扣费。

## 验证与保留项

```powershell
node scripts/verify-agent-session-chain-audit.cjs .
```

```text
AGENT_CHAIN_AUDIT=CONFIRMED CHECKS=5 STALE_CACHE=1 NEWER_HISTORY_LOST=1 REAL_RUNTIME=1 DB_MOCK=1 SUPPLIER_CALLS=0
exit=0
```

这是“问题复现成功”，不是“问题修复通过”。脚本禁用 fetch；不读取生产凭据，不连接真实数据库，不提交供应商。

原始观察器失败保留：首次 stub 使用了错误的 import 路径；第二次 schema 输入 operationId 不是 UUID。分别修正测试 harness 后得出上述结果，没有改产品代码配合通过。

全量类型检查首次 exit 2：原依赖 junction 目标被更新为 TypeScript 5.9.3、Node 类型 24.19.2、Next 15.5.28，与锁文件 5.5.4 / 20.14.14 / 15.5.27 不一致。仅把本任务 junction 指向已有匹配锁文件的依赖目录；不修改任何共享依赖目标。原类型错误日志保留。换回锁文件匹配依赖后，全量 TypeScript exit 0，原 Dock API 27 项回归也通过。

所有远端 SQL 使用 `BEGIN READ ONLY`、有限时间窗口、statement timeout/lock timeout，并最终回滚只读事务。临时私钥副本已清理。浏览器只有访问验证页面，随后关闭；没有试猜密码或修改登录状态。

## 下一步优先顺序

1. 优先修跨实例续聊的历史版本与旧快照覆盖，并用真实隔离 PG 的两实例往返测试验收。
2. 工具回执与最终交付状态绑定，确保无工具执行不会冒出“生图完成/验收通过”。
3. 原始要求与参考图贯穿生成、验收；补读图能力与准确的模型能力反馈。
4. 后台分离对话/产物/失败/结算证据；历史按明确来源恢复，不回灌旧 DB、不重放已收费任务。

本轮尚未修复上述产品问题，未上线。已向现有发布协调线程同步跨槽证据，未要求它并行停止实例或自动重跑任务。
