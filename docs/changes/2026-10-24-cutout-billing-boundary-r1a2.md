# R1A2：抠图执行、同步账务与任务读取边界

日期：2026-10-24。工作树：`E:/Workspace/naumi-refactor-20261024`；分支：`codex/core-refactor-20261024`。

## 基线与目标

- 固定完整基线 `873c634787263294502807832b76a6f763a05158`，已包含质量回退、Canvas 报价修复及 R1A1 生图 typed 执行。
- 开工刷新 `origin/main`，仍为 `905c8c635e41ff3f4443d43db9776d1db3aab469`；没有新增主线提交需要合入。
- 本轮完成 R1A2，不把它称为全项目重构完成。采用原模块、原数据表、原 operation 与账务身份，不另建执行器。

## 已替换的实际调用

1. **抠图步骤**：`imagegen/adapters.ts → cutout-operation.ts → cutout.ts`，不再构造内部 FormData/Request，不签 cookie，不 import `app/api/cutout/route`。
2. **公开抠图 HTTP**：`app/api/cutout/route.ts` 保留原 URL、解析、登录/BI 包装，调用相同 `executeCutout`。
3. **同步账务**：`billing/synchronous-operation.ts` 唯一持有预占、回执、结算、未知/失败和流式完结逻辑；`billing/synchronous.ts` 负责 HTTP 身份和返回呈现，旧消费者通过 re-export 继续使用同一个 AsyncLocalStorage。
4. **供应商执行**：`cutout-provider.ts` 承接原 Replicate/OpenAI 实现。4 个迁出函数经去 export/注释的 TypeScript AST 打印对照一致；没有修改 fallback、透明检测和计价策略。
5. **查询与存储 owner**：`generation-query.ts` 承接旧任务查询呈现；`generation-jobs.ts` 唯一创建原 DurableImageJobs 实例，读取不再直接依赖重型执行模块。父任务查询继续沿用原恢复语义，不误称为纯只读函数。
6. **共享纯合同**：`step-intent.ts` 分离步骤意图；`billing/failure.ts` 分离错误投影。抠图不为调用一个纯 helper 而 import 整套生图执行链。

删除 `legacy-cutout-request.ts`，不是只停止导出后保留死代码。旧公开 HTTP 端点仍是有真实调用者的兼容 adapter。

## 运行中发现并修复的并发问题

完整基线的实际 PG 双请求出现 **200 / 503**：`startCreation` 先读后插入，在 `app_creation_records_source_kind_source_id_actor_email_key` 上竞争；只有一个供应商调用，但后到请求看到通用失败。

新版复用已有 `claimCreation` 的事务级按 operation 锁，不新增锁系统；钱包预占仍由原 service 决定唯一执行权。只有真正成功取得预占的调用才设置 `context.operation`，竞争失败者不把赢家的预占写成 manual。已受理重复请求返回既有 `OPERATION_PENDING`，实际双请求 **200 / 409**，生成一次、原价结算一次。

另一个边界：测试直接注入“不属于传入 actor 的 in-process creation context”，旧实现对已保存回执返回 200；typed 入口显式核对 actor 后返回 409。该用例是内部上下文误接检查，不是对公网越权事故的断言。

## 兼容项

- 原 `tool-${imagegenStepId(...)}`、multipart 字段排序、`target.png` 名称/类型/字节摘要及 CRLF 保持，旧已完成/未知回执不产生新供应商请求。
- 原冻结完整 BillingQuote、模型版本及 billing snapshot 保持；缺 full quote 的旧格式继续使用保存的版本。
- current 模型版本变化、价格从 3 改 19 后，新执行仍按已冻结 3 积分结算。**不声称禁用执行通道仍放行**：初始实验确认旧版实际执行仍执行通道停用检查，此语义没有删除。
- 素材 owner、账号不存在/封禁/过期、scope、真实余额保留。省略确认继续执行，不恢复积分回显门槛。
- HTTP 原 Response 保留：JSON/non-JSON、状态、headers 均不重建；SSE 不读取 body、不等待流结束，已完成 assistant replay 仍按原 SSE 帧返回。
- 原抠图作品父子关系、透明像素、保存与供应商状态处理保持。

## 集中验证

输入：独占 PostgreSQL 容器 `naumi-refactor-r1a2-pg-20261024`，回环端口 65439；每个 model fixture 使用随机 schema，供应商只有 loopback PNG。

### 本轮新增实际入口对照

`node node_modules/tsx/dist/cli.mjs scripts/verify-cutout-execution-boundary.ts`

- 完整基线加 `--baseline`：49 检查，exit 0，`CONCURRENT_STATUS=200/503`。
- 修改版：49 检查，exit 0，`CONCURRENT_STATUS=200/409`。
- 包含：历史已完成/unknown 回执、内容冲突、素材归属、账号状态、余额不足、完整冻结报价、current 模型/价格变化、并发一次供应商/一次结算、HTTP/typed 互认回执、asset 目标、真实父任务到抠图产物、供应商明确拒绝/未知、助手流式回执、non-JSON Response 保真及真实 GET 查询。
- 结构检查：21 检查，exit 0；旧 parser 与 12 个 provider/账务函数迁移语义一致，内部抠图 HTTP 边为 0。

### 沿用回归

- 生图实际执行、22 项生图原回执 PG、41 项旧生图边界对照：通过。
- billing intents、billing review recovery（结果保留与一次结算）：通过。
- 图片定价减阻：25 cases / 74 checks 通过。
- 原生工作台：13 groups、5 fixture images / 3 fixture text 通过；显式取消、原价、unknown 和真实余额保持。
- 交付恢复：4 故障点通过；计费覆盖 30 入口通过。
- 全项目 TypeScript 与改动 TS/TSX ESLint：exit 0。

### 原样保留的失败，不改写成全绿

- 首次集中结果 `GROUP_RESULTS.json` 为 **10 pass / 3 fail**。两条是新 verifier 派生 operation 后未同步 plan fingerprint 的 fixture 错误，修正后集中补验为 49 项通过；原报告不覆盖。
- `verify-canvas-agent-execution.ts` 在完整基线和修改版都在 61 行失败：缺 `event: artifacts`，原记录有供应商 404。该旧 fixture 只拦截内部 `/api/generate-image`，没有接现行 `/images/edits`；后半还期待已删除的跨轮积分确认。此脚本不标通过，也没有为了旧断言恢复内部 HTTP 或确认拦截。Agent 完整控件/历史场景在 R3 继续更新验收；本轮助手 SSE 的实际同步账务验证单列通过。
- 早期准备错误保留：Windows tar 非 ASCII 路径解析失败（改用同 archive 的 Python UTF-8 解包）；fixture mode 错用 cutout（实际请求为 edit + 抠图意图）；禁用唯一默认模型违反 fixture 发布格式；AST 对照源换行差异；workbench verifier 要求专用 DB 名（在本任务自有容器建相应空库，不改 verifier 的隔离判断）。
- 临时诊断只在 baseline copy 的错误投影中打印 fixture exception，结束恢复原始字节。诊断输出与正式 baseline 分开。

## 结构结果与仍未完成

- 抠图 route：445 → 59 行；generate-image route：219 → 166 行。行数只说明职责迁出，不代表性能收益。
- 最初两条生产业务 `lib → app route` 均已消除；扫描仍有 2 条 **release fixture** import，不隐藏也不混算为生产边。
- 最大静态 SCC **54 → 55**，视频 SCC 仍 20；生图动态恢复分量 **9 → 10**。职责拆分增加了文件数，尚未消除这些跨域环；R4 的 DB/配置 owner 工作仍需完成。
- `quoteForActor` 仍使用兼容 Request 载体来读取计价事实；它没有再调用 HTTP handler，该剩余职责耦合进入 R1B，不声称本轮所有 Request 均消失。
- 旧正常/恢复交付逻辑仍未统一（R2）；Canvas 巨型状态组件、DB 大出口、Worker 运行位置与 runtime/scripts 倒置仍按整体台账推进。
- 未进行完整 Web build、浏览器控件验收、线上容量测试或部署；没有将代码/fixture 通过等同线上完成。

## 四产物与回滚

`output/refactor-r1a2-20261024/`：`MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。

完整 baseline archive、原/新 SHA 清单和独立 rollback copy 同目录；rollback 只对显式副本执行，逐个校验路径/修改后 SHA 再恢复，保留当前新版工作树。精确命令、literal、退出码、回滚后旧 HTTP/200-503 行为、容器 cleanup 与 Git 结果以 VERIFICATION 为准。

功能迭代计数：2（R1A1、R1A2）。下一模块 R1B：参数/模型/报价准备收敛；阶段性提交不自动合 main 或发布。

## 可复用下一模块任务说明

```text
工作树 E:/Workspace/naumi-refactor-20261024，继续 R1B，不另造产品分叉。
先读 REFACTOR_ARCHITECTURE、REFACTOR_MIGRATION 与本记录。
固定新的 baseline，统一模型/参数/报价准备的唯一 owner；旧 HTTP、Canvas、Agent、workbench 复用。
保留质量回退与 Canvas 报价修复、原 operation/full quote、owner/scope、真实余额与一次结算。
不新增积分弹窗/运营门槛；不换框架；不回到内部 route 调用；不操作发布现场。
按完整模块集中跑旧反例和真实入口，删除被替代旧判断，记录剩余跨域环、失败原日志和回滚。
```
