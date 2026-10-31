# 重构工作区：当前交付快照

## 当前候选与最近完整验收

| 字段 | 值 |
|---|---|
| 工作目录 | `E:/Workspace/naumi-refactor-20261024` |
| 分支 | `codex/core-refactor-20261024` |
| 最近完整业务验收 applicationSource | `82729161200f166fe587b98bceb756a44999840c` |
| 最新主线核对 | `e2f562556ea6e71370619686e1fc8d4c634ef5e7`，本轮已 fetch，无新增待合提交 |
| 最近完整验收 Web/Worker 镜像 | `sha256:1a96d11fa5513cc72a4288ac232199355134b85b81ea7672ce282295a57a62a2` |
| 版本 | `1793454597` |
| 全项目 | **ACTIVE，未合回 main，未部署；47 HOLD** |

当前 **R8Y 报价意图 owner 候选**已实现，源码固定与完整验收记录以 `output/refactor-r8y-20261031/IMPLEMENTATION_SOURCE.json` 和本轮报告为准；完整208项尚待执行。最近完整206/runtime177/browser92仍归上表827应用，不用它们给新产品代码代验。

本轮先复现同意图8并发产生8份报价/两个价格，现有主键原子冲突与原身份叶模块将其收敛为1份；原预览同一行3读→1读，首次await前完整快照防调用者迟到改价。19用例50检查及normal对照通过。真实原价入口5笔62 fixture积分/5次loopback PNG结算通过；另4个已受理batch item只验证排队合同，未冒充交付。

模块明细：[R8Y报价意图](changes/2026-11-01-refactor-r8y-quote-intent.md)。无新schema/事务/锁/用户确认，历史随机quote和子任务ID保留。此前R8X测量和文档归档仍在原目录，不覆盖失败/OPEN。

## 最近已完成的同源验收（827，非新候选代验）

| 验收层级 | 观察到的结果 | 权威证据 |
|---|---|---|
| 完整 core | 206 PASS / 0 FAIL / 0 NOT_RUN；0 reuse | `output/refactor-r8w-20261031/core-fixed/REPORT.json` |
| 固定 Linux 原生全链 | 7 个原生入口通过；原案例正文与交互保持 | R8W SDK/core 报告 |
| 完整镜像 runtime | 177 checks PASS | `output/refactor-r8w-20261031/runtime/RUNTIME_RESULT.json` |
| 产品双浏览器 | 92 checks PASS；7 次交付、7 笔消费、42 fixture 积分；确认弹窗 0 | R8W browser 报告及父 `INPUT.json` |
| 450 秒受控混合 | 165 图 + 12 媒体，业务不变量 PASS；非生产容量结论 | `output/refactor-r8w-20261031/mixed/MIXED_RESULT.json` |
| 依赖与类型 | 四类 SCC=0、生产 lib→app=0、runtime→scripts=0；类型/lint exit 0 | R8W architecture/type/lint 原始报告 |
| 当前同机配对性能 | 5 轮、10 栈，已测；prepare p95 超 10% 调查阈值，保持 OPEN | [R8X 测量记录](changes/2026-10-31-refactor-r8x-current-performance.md) |
| 远端 CI | 当前 applicationSource job 未启动，steps=0；账户支付/支出限制 | [实际 run](https://github.com/JesstLe/naumi/actions/runs/41209582369) |

上述不是生产/真实供应商质量或 10 万活跃容量证明。2 条 release fixture 反向边、1 条 dist 未解析边单列，不冒充生产依赖或漏报。

## 文档职责

- [架构与职责](REFACTOR_ARCHITECTURE.md)：稳定边界、公共接口和数据归属，不复制逐轮运行流水。
- [迁移合同与模块索引](architecture/REFACTOR_MIGRATION.md)：R0—R6 路线、兼容条件、集中验证方式。
- [整体退出审计](architecture/REFACTOR_EXIT_AUDIT.md)：每个整体要求的当前证据与未完成项。
- [最近业务验收边界](changes/2026-10-31-refactor-r8w-fixed-native-acceptance.md)：固定 Linux SDK、父 PG 和原生案例。
- 各轮具体命令、失败、raw hash、回滚归 `docs/changes/` 和对应 ignored `output/`，不把旧候选描述为当前。

## 下一步

1. 固定并执行R8Y完整208/同镜像runtime/browser及同条件性能；继续定位页面负载→报价准备阶段的尾延迟差异；保留原 5 轮结果与 10% 阈值，不用 API-only 正常结果覆盖它。
2. 补有效远端 CI 与最终 main 普通整合；不把未启动 job 写成代码失败或通过，不强推共享分支。
3. 容量、历史传输/供应商问题与生产验收沿各自台账推进，不因重构本地通过自动关闭。

**候选分支超过 48 小时尚未合 main。** 原因仍是整体退出未达到：性能调查、有效 CI、最终 main 整版与生产验收分层开放。独立工作树和原任务身份保留，不删除未合并分支。

起始主线 `905c8c635e41ff3f4443d43db9776d1db3aab469`；用户要求保留的质量/Canvas 修复 `9fc284514aeaed740cdf55cc49b611445676b517` 已纳入后续整合。重构不新增积分确认或用户业务限额，不改原任务/冻结报价/UNKNOWN，测试按完整模块集中执行。

## 历史入口

[收敛前的完整工作区流水](https://github.com/JesstLe/naumi/blob/82729161200f166fe587b98bceb756a44999840c/docs/REFACTOR_WORKSPACE.md)保留在 Git；各模块记录由迁移索引定位。本文只维护一个当前快照。
