# R8X：当前固定候选配对性能与交付文档收敛

## 模块与职责

当前应用 `82729161200f166fe587b98bceb756a44999840c`；对照为 R8D 完整镜像源码 `3e90ff3595e2b347fcf907121cd64103aa635169`，不是早期4478依赖镜像。本轮不改产品代码、参数、价格、任务/钱包、Worker、依赖或CI；只测量固定镜像并收敛4份文档的当前/历史职责。

原4份总文档把R8U旧失败留作“当前状态”，并多次复制历史流水。现在工作区拥有一个当前快照，架构拥有稳定职责和保留设计，迁移拥有合同与模块索引，退出审计拥有未完成门槛；历史在Git固定源和原模块文档继续可读。原稳定架构4—12节和迁移原则/验收合同保留，不以旧设计目录示意冒充当前文件树。

## 配对输入与验证命令

两侧实际 Node24.22.2 / ABI137 / React19.3.0 / Next15.5.28 / glibc2.36、package/lock逐字节匹配。当前完整5328文件与新建精确基线5247文件全hash一致；旧R8E基线副本6个非产品文档/脚本漂移单列，产品未漂移。新副本从原Git对象补回原字节，旧目录没有覆盖。

```powershell
python -X utf8 scripts/benchmark-refactor-performance.py --candidate-manifest output/refactor-r8w-20261031/image/BUILD_RESULT.json --baseline-manifest output/refactor-r8d-20261030/image/BUILD_RESULT.json --baseline-source output/refactor-r8x-20261031/baseline --out output/refactor-r8x-20261031/paired --private-media 1 --mode paired --rounds 5 --repeats 3
```

字面结果，exit 0：

```text
REFACTOR_PAIRED_PERFORMANCE=MEASURED ROUNDS=5 STACKS=10 REAL_HTTP=1 REAL_PG=1 PAID_SUBMITS=0
```

同机5轮交替10栈；每侧15页/150准备/300读取；320节点、12张相同1024px图片、1440×1000、4倍CPU、5Mbps/80ms、私有媒体1。真实登录/PG/HTTP，route mock0；没有付费提交、供应商调用或扣款。已有40个容器ID保留；10轮40个自有容器/10网络清理通过。

## 原阈值不变的实测

| 指标 | 对照 | 当前候选 | 变化 | 判定 |
|---|---|---|---|---|
| 页面可见就绪 p95 | 7958.06 ms | 7204.63 ms | -9.47% | 本次未超阈值 |
| 暖页可见就绪 p95 | 7112.01 ms | 5726.79 ms | -19.48% | 本次未超阈值 |
| 实验室会话INP p95 | 1896.00 ms | 704.00 ms | -62.87% | 本次未超阈值 |
| 全部交互延迟 p95 | 1296.00 ms | 568.00 ms | -56.17% | 本次未超阈值 |
| 平移主线程任务 p95 | 5061.25 ms | 3972.51 ms | -21.51% | 本次未超阈值 |
| 报价准备HTTP p95 | 20.09 ms | 23.70 ms | +17.98% | OPEN，超10%调查阈值 |
| 读取HTTP p95 | 19.38 ms | 20.56 ms | +6.09% | 本次未超阈值 |
| 采样RSS峰值 p95 | 411.76 MiB | 414.79 MiB | +0.74% | 本次未超阈值 |
| 事件循环 p95 | 10.55 ms | 10.59 ms | +0.39% | 本次未超阈值 |

原10%只作为调查阈值，未调高、未删除超差项。15页/侧、5冷10暖、实验室EventTiming不是field INP；RSS采样漏掉20ms内峰值，VmHWM含启动。本地受控负载不是生产/十万活跃容量证明。主测量权威文件：`output/refactor-r8x-20261031/PERFORMANCE_COMPARISON.json`。

## prepare尾延迟定向诊断

6个直接准备/报价/创建上下文owner字节相同，esbuild闭包343→345输入的差异为已有调度/工作信号相关模块；仅静态证据，不据此认定执行中完全无影响。

复用同父runner/夹具/镜像，以ignored诊断driver与同侧observer执行2轮4栈、每侧400 prepare/400 read，另40预热；实际请求关联SQL/Pool等待。每请求23条SQL、SQL类与数量完全相同；热态prepare p95 15.49→15.02ms（-2.98%），SQL耗时总和p95约7.464→7.465ms，pool checkout总和p95约0.335→0.328ms。SQL总和可能重叠，不冒称排他CPU。

API-only不是原页面负载，**原+17.98%超差仍OPEN**，没有把它宣判成噪声或修改规则凑绿。父runner进度标签沿旧格式硬编码READS60/PREPARES30，实际诊断driver日志和数组证明每栈200/200，报告按实际数组计数。该诊断16自有容器/4网络清理通过。下一步定位页面→prepare的热态/缓存/调度时序，保留原日志。

## 公共接口、数据与回退

产品接口和数据/事务归属未变；只改`REFACTOR_WORKSPACE`、`REFACTOR_ARCHITECTURE`、`REFACTOR_MIGRATION`、`REFACTOR_EXIT_AUDIT`并新增本文。所有应用/脚本/构建/依赖原始hash保持；业务206/runtime177/browser92/450秒结果仍只归827应用源码，不重复执行。

文档baseline→modified→独立副本rollback、完整源码包/字节patch/可执行回滚与后续编辑零写入guard的实际命令、literal、exit和hash由本轮`VERIFICATION.txt`及`DELIVERY.json`记录。回滚仅恢复本轮4份旧文档并移除本文，不撤回产品重构，不回灌DB或重放任务。

## 当前未完成

当前prepare页面负载尾延迟、有效远端CI（现job因账户支付/支出限制steps=0）、最终main整合、生产容量/历史事故及部署分别保留OPEN。main已刷新e2f56255，无新增待合；47 HOLD。本轮不操作生产、不派子代理、不重跑同源完整业务suite，不把测量/文档交付当整个重构完成。
