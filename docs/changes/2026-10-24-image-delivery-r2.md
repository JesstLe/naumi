# R2：正常生成与原结果恢复共用本地交付

## 基线与范围

- 工作区：`E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
- 完整源码基线：`2a6b70a38b8cee4030858f0b75feae2ed4319164`。R1A/R1B、质量回退及 Canvas 定价修复保留。
- 本轮实现交付 owner，不重做供应商执行、报价、钱包、租约或发布系统。没有合 main 或部署。
- 对照使用完整基线树；唯一注入是本轮 verifier。不是只投影两个源文件的 A/B。

## 实际职责迁移

| owner | 职责 | 调用者 / 删除内容 |
|---|---|---|
| `imagegen/complete-image-delivery.ts` | 原结果读取、冻结后处理、尺寸/透明/比例结果、媒体保存、原图检查点、作品血缘、原任务结算 | `generation-runtime.runJob` 与 `stored-delivery.recoverStoredDelivery` 均实际调用；两处逐图处理/存储/作品/结算副本删除 |
| `imagegen/finish-stored-image.ts` | 纯本地像素处理：显式 frame 与旧 2K/4K 放大；不调用供应商 | 原恢复 helper 被正常执行复用；`generation-output.ts` 四个旧输出函数整文件删除。离线历史原字节 verifier 的纯 post 比较入口仍保留 |
| `imagegen/delivery-billing.ts` | 只读账务投影，区分实际 charge、任务 settled 标志、billing operation 状态 | 父正常/失败/旧回执、恢复、旧 generate-image 轮询共享；不以调用 settle 成功或 charge=0 推断结算完成 |
| `media-postprocess.ts` | 原阶段 ID、base、policy、lease、attempt 和回执 | 恢复不再绕过阶段直接 transform；新摘要使用稳定 JSON，旧摘要用相同策略+原字节证明兼容，旧记录不重写 |

`runJob` 保留供应商获取与原 bounded retry；恢复入口保留 child 级 coordination lock、历史过滤、终态/lease 检查和父子最终回执事务。共享交付用 `JOBS.patch/settleResults` 复用原执行 token；恢复仍使用无有效 lease 的原任务，不构造另一个收费 operation。

这不是新 workflow/DSL、全局管理器、事件总线，也不是给两个旧实现套相同名字的 wrapper。

## 已修正的真实行为

1. **处理失败不再宣称完成。** 原恢复的 transform catch 只追加 warning，`complete` 仍为 true。现在持久化 `deliveryComplete:false`，父结果为 `partial`；正常 keep-base 也采用相同口径。原始图片继续交付。正常 hold 阶段沿原重试/等待规则；终态恢复只保留底图，不宣称 hold 阶段成功。
2. **账务 manual/hold 不再冒充 confirmed。** 父/子读取真实结算标志和 operation state；图片仍能成功交付，账务单独显示 `unavailable`。只读回执可反映后台结算后的事实，不改变原收费请求。
3. **最终回执保留原结果证据。** 原 `JOBS.set` 覆盖 paidOperations；新版最终使用 patch，保留原 pin、字节、createdAt 和失败阶段。已交付 done 任务的原始 checkpoint 不自动成为重新恢复理由，不改变透明错误等业务结论。
4. **原阶段 JSONB 顺序兼容。** 新旧入口共用 stage 后暴露旧 `JSON.stringify(policy)` 摘要依赖属性顺序的问题。新摘要稳定；旧记录只有 owner、parent、modelVersion、完整 policy 和原 base bytes 都相同才复用。不同内容/账号/版本/策略仍不匹配。旧摘要验证的媒体读取在占用事务连接之前进行。
5. **副本不覆盖用户作品。** 固定 `art-<job>-<index>`，旧未处理作品保留标题、编辑/坐标；必要时生成确定性 `-delivery` 派生。恢复最终回执失败后继续沿派生 ID，不退回旧低清图。`addArtworksTx` 增加内部 preserve 冲突模式，仅交付调用；其他既有调用的 revive 行为不变。
6. **保留故障降级而不是增加创作拦截。** 媒体保存失效仍保留 inline 原字节和警告；optional source preview 失败不阻断交付。新存储 key 为 job + 内容摘要，已有媒体地址/旧任务可读。不要求用户再确认价格或规格。
7. **旧轮询识别 partial 终态。** 原父回执 partial 被旧 GET 映射为 pending；现在返回 done + operationStatus=partial，交付已有图片而不无限轮询。

仍保留完整 frozen quote、真实余额事务检查、owner/scope、显式取消、未知受理不重 POST、原 job/ledger ID、原输入权限、删除作品不复活和同任务一次结算。没有更改客户价格或后台运营配置。

## 集中验证

主 verifier：`scripts/verify-image-delivery-continuation.ts`。真实调用 runJob、recoverStoredDelivery、runPostprocess、父回执、旧 GET 与 PG；只在 SQL/本地写入边界注入失败。所有输入是本轮生成的本地 PNG/任务，不导入或重放线上历史业务。

| 检查 | 结果 / 边界 |
|---|---|
| 完整基线对照 | 64 检查，exit 0；复现 POST_COMPLETE=FALSE_POSITIVE、RAW_CHECKPOINT=LOST、MANUAL_BILLING=CONFIRMED。这是旧缺陷复现，不是旧业务正确 |
| 修改后主 verifier | 73 检查，exit 0；PARTIAL、RETAINED、UNAVAILABLE；6 类 SQL/存储故障、2 种 post failure，原字节一致、阶段/consume 无重放，供应商 HTTP 0 |
| 真实完整交付 | `verify-image-delivery-completion.ts` 27 检查；2K/4K、旧部分作品派生、原账单、parent/child done、unknown 拒绝、重复恢复、patch 队列故障恢复 |
| 真实 routes | `verify-image-delivery-routes.ts` 33 检查；大 PNG、原回执只读、归属/lease/deleted、旧配置缺失 partial、并发、原账务。1 次 loopback 供应商，外部 0 |
| pool | 5 路同时恢复，query pool waiting=0，重复作品/消费 0 |
| 实际生成执行 | 原透明/蒙版/后处理入口 suite 通过；保留透明不符合时的原失败+产物语义 |
| 大图与像素 | 22 检查；输入 12MiB/输出 64MiB，原 hash；no-silent-crop 与 exact ratio 62 检查通过 |
| R1B 回归 | 45 检查；model read=1、synthetic Request=0、旧报价 3/current 17、旧 plan 交付 |
| 旧 receipt 防重 | `verify-image-generation-receipts.ts` 22 检查通过，原 multipart、并发、unknown 不重 POST |
| 抠图/同步账务 | 49 检查通过。query fixture 原仅写 creditsUsed=3、没有账本；已改为真实预占/结算 3，保留原期望，不用假快照覆盖实际账务 |
| 结构兼容 | 37 检查：legacy fingerprint/parser 一致；provider/prompt 函数保持原样，两入口调用共享交付 |

`verify-image-delivery-retry.cjs` 仅验证 outer retry，明确 CONTINUATION=STUB；真实 SQL/存储行为由上述 73 项覆盖，不把 stub 当作完整交付证明。

类型、lint、精确命令/exit/全部 literal、源码 hash、副本回滚行为，以 `output/refactor-r2-20261024/VERIFICATION.txt` 为最终记录。旧 ratio/no-crop 的数组测试 adapter 只调用实际像素 owner，不复制业务算法。

### 留存的失败与未扩大的结论

- fixture 准备阶段失败：首版 verifier 括号、测试 router token 长度、原始 checkpoint 缺 gradient、SQL 注入误读非 snapshot 参数、parent fixture 缺 paidOperationVersion。原日志保留；修正的是测试设置，不改生产预期来伪造通过。
- Windows PowerShell 5 将 native stderr 当 terminating error，改用 PowerShell 7；只清理已核实无客户端的本轮遗留随机 schema。
- 首次 modified 真正发现 stage JSON 属性顺序问题，已按上述第 4 项修正。
- 一处 verifier 可选类型标注及旧 query fixture 的假账务设置已修正；不把较早成功日志冒充最终源码运行。
- **未通过的旧脚本仍单列：** `verify-imagegen-receipts.ts`（注意不是 `verify-image-generation-receipts.ts`）在完整基线与新版均于 batch 规划处报 `IMAGEGEN_NO_CHANNEL / exit 1`，尚未走到后续部分流水线断言。本轮不把它写成通过，不以修改模型路由实现迎合它。该旧 fixture/planner 场景列入最终候选兼容债务。
- 未运行真实历史原图导入 CLI，它要求单独的来源文件/hash 与固定数据库；本轮 synthetic byte 回归不冒充历史生产问题闭环。
- 未运行 production build、实际浏览器、线上压测、容量或部署验收。正常全像素读取与账务投影查询的性能后续在固定候选测量，文件变少不等于吞吐提升。

## 副本回滚与后续

原始完整归档 `BASELINE_SOURCE.tar` SHA256：`26c619490b12287973a6c0e2b32f994a2924e3b20746b4fff78114387bbd6770`。
交付四件：`MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`，目录均为 `output/refactor-r2-20261024/`。回滚只验证独立副本并恢复该副本旧源码；当前工作树保持新实现。已有数据库、媒体和历史报价不回灌、不迁移。

结构复扫：生产业务 lib→app 仍为 0（两条 release fixture 另记）；最大静态 SCC 60、video 20 不变，含动态导入的图片恢复分量由 10 文件增至 12 文件。新 owner 的持久化仍依赖现有 DurableImageJobs/DB，尚未完成 R4 的基础依赖剥离，不以目录或行数变化宣称全仓低耦合。

本轮是 R2 模块闭合，不是整体项目完成。下一阶段 R3 Canvas 拆 document/history/persistence 与 generation controller；R4 数据 owner/控制执行面/热 DDL、R5 Worker/codec、R6 外围及完整 UI/性能验收仍在迁移台账中。
