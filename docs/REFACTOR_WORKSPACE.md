# 重构工作区：当前交付快照

## 当前R8Z候选（完整验证尚待）

本轮5个产品文件收敛入口actor与本次权益决定：实际原生认证/HTTP/PG20用例33检查原/新均执行，入口auth/policy2/2→1/1，跨actor和无context读取、下一请求封禁/撤权保持。当前代码已不同于下表f0b；209注册与新镜像/core/runtime/browser/原5轮性能尚待，不借旧208代验。详见[R8Z模块记录](changes/2026-11-01-refactor-r8z-ingress-ownership.md)。

## 当前候选与完整验收

| 字段 | 值 |
|---|---|
| 工作目录 | `E:/Workspace/naumi-refactor-20261024` |
| 分支 | `codex/core-refactor-20261024` |
| 当前完整应用验收 applicationSource | `f0b30bc5e240e4e00118beb45c307bb0603bc047` |
| 文档归档 source | 以本轮 `DELIVERY.json` 为准；应用源与文档源用逐文件raw hash bridge区分 |
| 完整源码 | 5331文件；原基线5329文件；本轮12路径，其中3个产品文件 |
| App/Worker固定镜像 | `sha256:a0ed70c3199fc9a574338327af29ea0ef91a0d3595213f5dc0c1a86048b1e32d` |
| 固定版本 | `1793466316` |
| SDK | 同完整源码、完整App字节EXACT，含7个实际原生入口 |
| 完整核心目录 | **208 PASS / 0 FAIL / 0 NOT_RUN / 0 reuse** |
| 同镜像运行 / 产品浏览器 | **177检查 / 92检查**，浏览器180秒、2个context、route mocks=0 |
| 混合业务 | 450秒calibration：165图片＋12媒体、177consume/1014 fixture积分；不证明生产容量 |
| 类型与结构 | tsc exit0；5089实际类型输入；lint exit0、37既有warning；四类SCC=0 |
| 配对性能 | 5轮/10栈、每侧15页面样本/150prepare/300read；OPEN: prepareMs |
| 原/新报价互通 | 实际旧/新quote owner＋隔离PG；随机/确定性ID双向可读、完整私有合同与子任务ID保持 |
| GitHub | [PR8](https://github.com/JesstLe/naumi/pull/8)，draft；本次push后CI以本轮证据刷新，旧steps0不代验 |
| 整体目标 | **ACTIVE；mainMerged=false；deployed=false；47 HOLD** |

## 本轮职责收敛

[报价owner](changes/2026-11-01-refactor-r8y-quote-intent.md)负责唯一意图保存、完整合同冻结、原预览读取和公开投影。Route只鉴权、解析、优先请求原合同，缺失才current planner。原/新19用例50检查：并发8行→1行、内存8ID→1ID、原预览3读→1读、调用者await后篡改99→保留原6。其他2138个原产品文件raw hash不变；不新增表、事务锁、确认或业务限额。

| 指标 | 3e90完整基线 | 当前f0b完整镜像 | 变化 |
|---|---:|---:|---:|
| 页面可视就绪 p95 | 7826.55 ms | 7197.77 ms | -8.03% |
| 实验交互估计 p95 | 1992.00 ms | 752.00 ms | -62.25% |
| 报价准备 p95 | 19.19 ms | 21.22 ms | +10.57% |
| 只读请求 p95 | 21.14 ms | 19.10 ms | -9.63% |
| Web采样RSS p95 | 414.46 MiB | 413.48 MiB | -0.24% |

测量口径：同机/同Edge、同package/lock与实际Node/React/Next/glibc、320节点/12张相同1024px图片、4xCPU/5Mbps/80ms、privateMedia=1。采样实验不是线上INP或10万活跃容量证明。旧827在R8X的prepare p95 +17.98%及API-only未复现记录继续保留，不改原10%阈值，也不将本轮报价一致性修复认作旧性能差异根因。

## 文档职责

- [架构与职责](REFACTOR_ARCHITECTURE.md)：稳定边界、公共接口和数据归属。
- [迁移合同与模块索引](architecture/REFACTOR_MIGRATION.md)：工作包、兼容条件和逐轮记录。
- [整体退出审计](architecture/REFACTOR_EXIT_AUDIT.md)：整体要求、当前证据、未完成项。
- 原始命令、失败、raw hash、补丁与独立副本回滚归本轮 `output/refactor-r8y-20261031`，四产物以 `VERIFICATION.txt` / `DELIVERY.json` 为准。

## 下一步与边界

1. 性能：OPEN: prepareMs。保留原测量/阈值与逐栈日志，按实际超差定位；不新增用户护栏或盲目加Pool。
2. 取得有效远端CI后再进行最终main普通整合与同固定整版验收，不把未执行job、本地PASS、推送或Git整合写成上线。
3. 生产容量、历史供应商/传输/持久化事故和生产验收沿独立台账推进，不用局部通过自动关闭。

**候选分支超过48小时尚未合main。** 原因：整体退出尚有性能调查、有效CI和最终main整版验收；保留本任务独立工作树，不删除未合并分支。47 HOLD未解除。

起始主线 `905c8c635e41ff3f4443d43db9776d1db3aab469`；质量/Canvas修复 `9fc284514aeaed740cdf55cc49b611445676b517`已纳入。原任务身份、冻结报价、真实余额与UNKNOWN保持。

[收敛前完整流水](https://github.com/JesstLe/naumi/blob/82729161200f166fe587b98bceb756a44999840c/docs/REFACTOR_WORKSPACE.md)保留在Git；本文只维护一个当前快照。
