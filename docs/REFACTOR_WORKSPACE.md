# 重构工作区：当前交付快照

## 当前推进：R9B 历史生成入口

[R9B 模块](changes/2026-11-01-refactor-r9b-legacy-generation-ingress.md)将历史generate-image的intent、BI、model、opaque quote、signed versions和领域actor/quote port贯穿同一个服务端身份。完整1efb基线5335raw文件与修改版实际native HMAC/HTTP/PG各38场景79检查，正常结果投影EXACT；旧提交4～7次认证、父轮询2次，修改后均1次，health仍0次（不含middleware）。保留原价6/当前17、真实预占和余额不足、丢失ACK后503→原intent409待核查、同编号并发一任务；没有新表、价格确认或跨请求缓存。

7个产品文件完成显式参数迁移；全项目5092实际类型输入/tsc exit0、lint exit0。集中受影响回归与副本封装继续执行；最后完整应用验收仍是R8Z，不把本模块通过扩展为完整211目录或当前App/Worker通过。

## 上一模块：R9A 图片入口身份归属

[R9A 模块](changes/2026-11-01-refactor-r9a-image-ingress-routes.md)已迁移其余 5 个图片路由文件的 7 个处理器，并把主提交 BI 包装的身份来源统一到入口。完整 fe9d 基线与修改版实际 HTTP/native cookie/PG 对照各 39 场景、90 检查，正常响应/授权/原字节投影 EXACT；认证 SQL 从 `2/3/2/2/2/2/2` 变为 `1/1/1/1/1/1/1`。该计数不含 middleware。7 个产品文件变更，其他 2134 个原 src/services 文件 raw hash 不变，不改领域/钱包/供应商/schema。

R9A固定验证源码 `9a52ba65b77e729ea724fceff66283c5f020e678`：pricing 11/11 脚本通过、0失败、0未运行、0复用；runner 因部分目录返回 **PARTIAL/exit2**。R9A时目录210项，其他199项未在该轮重新执行。该轮5091实际类型输入一致/tsc exit0、lint exit0/37既有warning、四类SCC=0。独立副本恢复5333原始哈希及39/90原行为，later-edit首写前拒绝/零写。归档1efb与该验证源仅文档更新；不是R9B源码执行结果。

第三功能模块后已刷新 origin/main `e2f562556ea6e71370619686e1fc8d4c634ef5e7` 并执行普通整合（已包含，源码不变），modulesSinceSync 3→0；没有修改或推送 main。当前封装与实际命令归 `output/refactor-r9a-20261101`。

## 最近完整应用验收（R8Z）

| 字段 | 值 |
|---|---|
| 工作目录 | E:/Workspace/naumi-refactor-20261024 |
| 分支 | codex/core-refactor-20261024 |
| 当前完整应用验收 applicationSource | f7441ed0f9ae077f5d3f6fafb0f7c70b6d585567 |
| 文档归档 source | 以本轮DELIVERY.json为准；仅文档raw-source bridge，不冒称文档SHA重跑业务 |
| 完整源码 | 5333文件；本轮11路径：5产品、2验证/目录、4文档；原5331文件 |
| App/Worker固定镜像 | sha256:5934e621d6fdad7aa36149eea14dd306c62d080af846759146ed8f32adaddce6 |
| 固定版本 | 1793474041 |
| SDK | 同完整源码、完整App字节EXACT，七个原生入口 |
| 完整核心目录 | **209 PASS / 0 FAIL / 0 NOT_RUN / 0 reuse** |
| 同镜像运行 / 产品浏览器 | **177检查 / 92检查**，180秒、2context、routeMocks=0 |
| 混合业务 | 450秒calibration：165图片＋12媒体，177consume/1014fixture积分，业务不变量PASS |
| 类型与结构 | tsc exit0；5090实际类型输入；lint exit0/37既有warning；四类SCC=0 |
| 同机配对性能 | 5轮/10栈、每侧15页面/150prepare/300read；本轮当前候选采样无超过原10%调查阈值的指标 |
| GitHub | [PR8](https://github.com/JesstLe/naumi/pull/8)，draft；本次head实际CI见本轮证据 |
| 整体目标 | **ACTIVE；mainMerged=false；deployed=false；47 HOLD** |

## 本轮职责收敛

[R8Z入口归属](changes/2026-11-01-refactor-r8z-ingress-ownership.md)让HTTP入口传递已认证actor，当前权益检查返回actor-bound决定，plan/原报价同actor复用；跨actor/no-context仍读自己的policy，每次调用/下一请求重新检查，无全局或跨请求缓存。实际原生cookie/HTTP/PG/planner/quote原/新20用例33检查，入口内auth/policy2/2→1/1，正常公开/授权轨迹EXACT。此数字不是完整App包含middleware的认证总次数。

产品只改5文件，其他2136原产品raw hash一致；无新表、事务锁、业务限额或价格确认。原任务/报价ID、原价、输入归属、钱包与UNKNOWN保持。R8Y唯一报价意图的职责和兼容合同继续保留。

| 指标 | 3e90完整基线 | 当前f7441ed0完整镜像 | 变化 |
|---|---:|---:|---:|
| 可视就绪 p95 | 7834.70 ms | 7796.28 ms | -0.49% |
| 实验交互估计 p95 | 1744.00 ms | 928.00 ms | -46.79% |
| 报价准备 p95 | 37.69 ms | 19.05 ms | -49.46% |
| 只读请求 p95 | 23.20 ms | 19.26 ms | -16.96% |
| Web采样RSS p95 | 411.41 MiB | 414.84 MiB | +0.83% |

测量口径：同机/Edge、相同package/lock与实际Node24.22.2/React19.3.0/Next15.5.28/glibc2.36，320节点/12张相同1024px图片、4xCPU/5Mbps/80ms、privateMedia1。仍含冷样本；不是线上INP或10万活跃容量证明。旧R8X827的prepare +17.98%与R8Yf0b的+10.57%原始观测继续保留；本次新候选结果不重写旧结果，不宣称已证明旧差异唯一根因。

## 文档职责与下一步

- [架构与职责](REFACTOR_ARCHITECTURE.md)：稳定边界、公共接口、数据归属。
- [迁移合同](architecture/REFACTOR_MIGRATION.md)：阶段方法、兼容条件、模块索引。
- [整体退出审计](architecture/REFACTOR_EXIT_AUDIT.md)：各项当前证据与未完成项。
- 实际命令、失败、source/hash、原/新对照、binary补丁与独立副本回滚归output/refactor-r8z-20261101，以VERIFICATION.txt和DELIVERY.json为准。

1. 当前性能判定：本轮当前候选采样无超过原10%调查阈值的指标；保留原10%阈值与冷样本，历史归因未完成项独立记录。
2. 有效远端CI后进行最终main普通整合与固定整版验收；本地PASS/候选push不是CI通过或部署。
3. 生产容量、历史供应商/持久化/传输问题及生产验收沿独立台账，不以本轮模块通过自动关闭。

**候选分支超过48小时尚未合main。** 整体退出仍有有效CI、最终main整版及独立容量/历史/生产门槛。保留独立工作树和未整合分支，不处理他人资源；47 HOLD未解除。

本轮汇总门槛满足不代表每轮都变快：对照基线跨期p95有明显漂移，paired第2轮p50仍回退；p50沿原driver nearest-rank估计。不能把汇总约49%的降幅归因为本次改动的确定收益。逐轮原值/旧原始观测与归因不确定性均保留在PAIRED_VARIANCE_ASSESSMENT.json。

## 入口迁移边界

R8Z/R9A直接候选已由R9B历史轮询迁移收口；相同本地AST方法的59个creation/receipt wrapper现在9个消费actor、本地直接认证候选0。该盘点不覆盖所有跨文件适配，不能证明全部59个入口只认证一次。R9B还贯穿了不在该wrapper统计中的历史POST完整链；其余quote/canvas/领域适配继续按实际原生HTTP/PG证据核查，不按静态数字自动关闭。
