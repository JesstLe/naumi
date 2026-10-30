# R7R：主线行为迁入既有应用 owner

日期：2026-10-30。工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。整体重构仍 ACTIVE；本片不是最终整版交付，未合 main、未发布，47 HOLD。

## 固定来源与迁移状态

- 原始重构基线 `75ed64087b592f2a2c2f20348a75dcb3c98098f3`；上次整合 main `1ff8f39a0b2069b2f49e282efe1cbdfeb6e662de`。
- 本轮固定 incoming `d4dcea3a0c893e57ae75ce36505d71d9d4778ad0`，新增 26 提交。普通 merge，31 个文本冲突按三侧增量迁移，不恢复旧巨石、不只选择 ours 丢弃新增行为。
- 原始 5108 文件 raw SHA256、完整包、incoming git archive、三侧冲突、迁移命令及失败尝试保存在 `output/refactor-r7r-20261030/`；原材料不覆盖。
- **长分支债务：独立重构分支超过 48 小时未合 main。** 原因是整体原生场景门禁、最终完整 Linux 候选和产品验收未闭合；不能把已推分支当成主线/线上完成。本片先封固定 d4d 来源，后续继续普通整合而非强推或重置。

## 职责、接口、依赖与状态归属

| 变化原因 | owner / 公共协作端口 | 保留的不变量 |
|---|---|---|
| 多图目的地与编排 | `canvas/image-runs`、`image-creation`、`generation-fanout` | 一次付费请求、同 operation、原冻结数量/画幅；多结果不覆盖源图 |
| 占位与结果放置 | `generation-presentation.startGroup`、`image-task-controller`、`result-attachment` | slot 绑定不因乱序回执漂移；拖动可恢复；history 一次写入 |
| 多文件 pending 导入 | `canvas/image-imports.uploadPendingFiles` | 一次整批 decode、原 bytes、首个成功 root、后续最多两路；已保存只续读不再上传 |
| group / 文本控件 | group layer → `useCanvasDrag.commitMoves` → 原 history；text composer 自有 focus ref | 首次未全选也按整组拖动；scope/workspace revision 防 ABA；文字任务保持原 owner |
| 首次 OCR / prompt 优化 | `creation-request`、`prompt-optimizer-client` → `ensureFeatureModelSelection` | 等实际已发布模型，保留 workspace stale callback guard |
| 新计划画幅与参数 | `frame-fallback` → `simulation`；`image-preparation` 纯规则；`quotation` 计价 | 显式 `resolvedFrame`；原 targetRatio/effectiveRatio、质量 fallback、完整 BillingQuote/eligible 通道一起冻结 |
| 供应商文本响应 | `execution-fetch` / legacy client factory → `chatCompletionResponseFetch` | 原 supplier-cost/health 观测保留；不引入业务到 Route 的反向导入 |
| 连接与关闭代际 | `platform/db/pool`、`video/coordination-pool` | 业务/tick/video 同代预算；关闭失败仍 fenced，不开启新代 |
| worker 扫描与停止 | `video/worker`、`worker/image-recovery` | lanes 单飞、signal 及每阶段停止准入；保留 application execution 域和 direct owner 调用 |
| 抠图付费产物 | `synchronous-operation`、`cutout-receipt`、`imagegen/cutout` | 作品+紧凑 checkpoint 先于结算；settled 原回执恢复；失败不伪成功 |
| 限流 | 原业务 caller → `checkRateLimit` / async `rateLimit` → PG store/platform pool | 82 原 gate 均 await；后端故障 503，不冒充限额 429；无 DB 才允许本机模式 |
| 父子回执与 cleanup | 原 `image-jobs/runtime` / repository / dispatch / creation writer | lease/CAS/UNKNOWN 与原结算保持；有限诊断；不重放已受理付费动作 |

入口负责协议/UI和调用，不重新拥有任务、钱包或 SQL。拆分没有拆事务，没有内部 HTTP 自调用，也没有新 DI 框架。

## 本地实测（固定源码封装前）

| 验证层 | 结果与边界 |
|---|---|
| 完整旧基线 vs 新主要图片编排 | 57 场景 / 130 检查，共同轨迹 `ORIGINAL_TRACE=EXACT` |
| fanout / receipt / importer / task | owner 15 组、receipt 7、导入 15 场景/63 检查、任务 47 场景/179 检查通过 |
| 文字生图 / 本地图像编辑 | 58 场景/203 检查、23 场景/68 检查通过；HTTP/document ports 为夹具 |
| 真实隔离 PG | runtime lifecycle 11 组、critical cleanup 32 组、cutout receipt 16 组、video coordination 9 组、preparation 45 检查、main-sync 20 检查通过 |
| 共享限流 | 82 调用/65 文件/246入口断言；两 Node 进程+实际 PG 的200并发、滑窗、同 key 不同 window、backend timeout、SKIP LOCKED通过 |
| 模型/文本协议 | 自动参数/画幅 41/41；真实 SDK/Route/SSE 文本反馈 19 检查；pricing catalog client 22 组通过，无外部供应商 |
| 父任务回执 | 25/25，通过真实 runtime/repository/dispatch/creation writer；SQL/media/release-store 为确定夹具，不称实际 PG |
| 原生实际 Next/ReactFlow | fanout 5 + feedback 15 检查通过，pageerror=0、external=0；1793 个 src 文件与开发树逐 hash 一致 |
| 质量 | tsc exit0、lint exit0（39 现有 warnings）；runner 12场景/188检查，platform DB 28场景/166检查通过；四类 SCC=0 |

原生验收包含：三张独立占位/连线、一份18积分报价与一次POST、reload原回执/位置恢复、multiple chooser原bytes；优化取消/应用、文字真实错误及重试、首次OCR、分组首拖/恢复/解组。原生服务器已停止。Next跨盘依赖解析失败使用同版本C盘依赖materialization修正，8包版本8/8相同，未改产品代码绕过测试；中间失败日志保留。

父回执旧夹具三处准备错误已纠正：无target attachment让实际 owner 返回no-op、FOR SHARE读取真实fixture媒体快照、新结构诊断stage；未降低成功/失败/并发/UNKNOWN/零供应商和零结算断言。

## 同固定提交集中验收与交付协议

- `scripts/verification/refactor-cases.mjs` 是唯一回归目录，本片增加9项（含父回执/抠图恢复），总 inventory **143**。不复制新框架。
- 本片聚合选择51项受影响链，定义/命令/精确源码摘要与结果见 `output/refactor-r7r-20261030/AFFECTED_CASES.json`、`run-affected.mjs`、最终 `affected-final/REPORT.json`。subset成功仍为 **PARTIAL / exit2**，不是全143通过。结果只以实际REPORT为准。
- 四件最终材料为同目录 `MODIFIED_FILE.tar`、byte-exact `DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。最终存在、完整内容、SHA、baseline/modified/rollback命令及退出码由 `DELIVERY.json` 登记，不预先声称制作完成。
- 回滚仅独立副本，完整哈希检查和备份校验先于任何写入；later-edit必须零写入拒绝。验证原5108哈希、旧fanout缺陷行为恢复，开发树保持新版。

## 未完成项

1. R7P scene原生应用门禁仍 OPEN（历史控件准备失败/后续ECONNRESET）；本片未重做该整版场景，不以其他页面通过关闭它。
2. 同最终固定源的完整143 core与完整Linux镜像尚待执行；旧镜像不改标为本轮。GitHub账户支出/付款导致的旧CI阻塞不由本片当作消失。
3. 架构仍有2条fixture lib→app和1条toast lib→UI反向边；已有dist/worker生成产物静态未解析边不冒充业务缺失。
4. 历史cutout等价性测试的旧baseline-tree与旧X6 frozen-auto现场资料在本工作树缺失，保留未运行边界，不造旧源码/报告。
5. 继续收敛剩余热点、实际端到端产品/容量和最终main普通整合；10万活跃目标不等于达到容量。未操作生产与真实供应商。
