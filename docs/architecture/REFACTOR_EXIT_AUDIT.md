# 整体退出审计

当前完整应用验收源码：f7441ed0f9ae077f5d3f6fafb0f7c70b6d585567。完整App/SDK、core209、runtime177、产品浏览器92与450秒混合均为同固定源实际重跑，未复用旧208绿灯。**wholeGoal=ACTIVE；mainMerged=false；deployed=false；47 HOLD。**

| 要求 | 当前证据 | 判定 |
|---|---|---|
| 入口认证/权益规则唯一归属 | 实际native cookie/HTTP/PG/planner/quote20用例33检查，入口内2/2→1/1，跨actor/无context/下一调用与请求重新校验 | 本轮PASS；无跨请求权限缓存 |
| 报价/任务/权限/取消/UNKNOWN | 同固定源core209/0/0/0reuse，原价/显式false/任务恢复按case边界验证 | 当前完整本地PASS，历史事故独立保留 |
| 模块依赖方向 | 当前四类SCC=0；生产lib→app0、runtime→scripts0；2release fixture与1dist例外单列 | 结构PASS，不替代行为验收 |
| 原生业务链 | 七个入口同源固定Linux SDK，完整App/Worker字节EXACT | PASS |
| 完整运行与产品页面 | 同镜像runtime177，双context浏览器92/180秒，routeMocks0 | PASS，隔离上游不代表真实供应商质量 |
| 当前配对性能 | 原方法/同3e90固定基线，5轮/10栈，源码/lock/runtime实核一致，冷样本保留 | **本轮当前候选采样无超过原10%调查阈值的指标** |
| 历史性能观测 | R8X827 +17.98%、R8Yf0b +10.57%原日志保留；诊断与验收分开 | 原观测与唯一根因未证实状态独立保留，不改阈值、不重写旧数据 |
| 持续/生产容量与10万模型 | 同源450秒calibration业务不变量PASS；生产到达率/长稳/规格/公平性未等价证明 | OPEN，见[100k台账](../PRODUCT_READINESS_100K.md) |
| 有效远端CI | 本次push后按实际head刷新；旧b4e步骤0账户付款/支出限制不是本候选CI证据 | OPEN，实际状态见本轮DELIVERY |
| 最终main普通整合/固定版 | 独立分支，main刷新记录见本轮证据 | OPEN；候选push不等于main整合 |
| 生产发布/线上验收 | 本轮无SSH/部署锁/生产操作，47 HOLD | 未执行，按明确发布任务独立验收 |
| 历史供应商/结果持久化/ZIP socket | 原benchmark仍有OPEN/PARTIAL | 独立保留，不以本轮成功样本自动关闭 |

下一步：按真实超差继续定位；有效CI后main普通整合与固定版验收；容量/历史/生产分别闭环。仍有必需待办时整体保持ACTIVE。
**分支超过48小时，原因仍为整体退出尚未达到。**
[当前工作区](../REFACTOR_WORKSPACE.md) · [R8Z模块](../changes/2026-11-01-refactor-r8z-ingress-ownership.md) · [R8Y原观测](../changes/2026-11-01-refactor-r8y-quote-intent.md)

本轮汇总门槛满足不代表每轮都变快：对照基线跨期p95有明显漂移，paired第2轮p50仍回退；p50沿原driver nearest-rank估计。不能把汇总约49%的降幅归因为本次改动的确定收益。逐轮原值/旧原始观测与归因不确定性均保留在PAIRED_VARIANCE_ASSESSMENT.json。

## 尚待迁移的同类入口

静态AST盘点59个creation/receipt wrapper调用，本轮只有图片plan入口消费新actor参数；另有7个零参callback经本地handler直接认证的迁移候选（主图片提交/回执、取消、输入、批次回执/下载）。这不是运行事故证明，也不是已完成迁移；下一模块逐入口保留来源、身份、scope、UNKNOWN和原回执协议迁移验证。详见本轮INGRESS_MIGRATION_INVENTORY.json。
