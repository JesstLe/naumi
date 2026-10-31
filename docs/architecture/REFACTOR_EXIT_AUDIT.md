# 整体退出审计

当前完整应用验收源码：`f0b30bc5e240e4e00118beb45c307bb0603bc047`。本轮完整固定App/SDK、core208、runtime177、产品浏览器92与450秒混合校验全部实际重跑，不复用旧147或旧827绿灯。**wholeGoal=ACTIVE；mainMerged=false；deployed=false；47 HOLD。**

| 整体要求 | 当前证据 | 判定 |
|---|---|---|
| 报价唯一归属与并发保存 | 原/新19用例50检查；8→1行、3→1读、完整合同await前冻结 | 本轮本地PASS；原随机ID/子任务ID保持；未改供应商与钱包 |
| 模块依赖方向 | 当前四类SCC=0；生产lib→app=0、runtime→scripts=0；2条release fixture与1条dist边单列 | 结构PASS，不替代行为验收 |
| 原价/任务/权限/取消/UNKNOWN | 同固定源core208/0/0/0reuse；真实PG/原HTTP协议按各case边界执行 | 当前完整本地门禁PASS，历史事故独立保留 |
| 原生完整业务链 | 7个原生入口在同源固定Linux SDK；完整App/Worker字节一致 | PASS，不借旧Windows局部结果 |
| 完整运行与产品页面 | 同镜像runtime177、双context产品浏览器92/180秒；7次fixture图片交付 | PASS；隔离供应商不证明真实上游质量 |
| 新旧合同与回退互通 | 真实旧/新quote owner共享隔离PG；随机/确定性ID双向读取、原价与私有合同一致 | PASS，无付费POST/账务变更 |
| 当前配对性能 | 同3e90固定基线，5轮/10栈，源/lock/runtime实核一致 | **OPEN: prepareMs** |
| 旧R8X性能观测 | 旧827页面负载后prepare p95 +17.98%；API-only400prepare/read每侧未复现 | 原观测和未定位根因保留；本轮不改阈值、不宣称已定位旧根因 |
| 持续/生产容量与10万活跃模型 | 同源450秒calibration业务不变量PASS；生产到达率/长稳/规格/公平性未等价验证 | **OPEN**，沿[100k台账](../PRODUCT_READINESS_100K.md) |
| 有效远端CI | 本轮push后按实际head刷新；旧4d job steps=0账户支付/支出限制只是历史证据 | **OPEN**，未执行不记CI通过或代码失败 |
| 最终main普通整合/固定版验收 | 独立分支；最新main刷新记录见本轮DELIVERY | **OPEN**，候选推送不等于main整合 |
| 生产发布与线上验收 | 本轮无SSH/部署锁/生产操作，47 HOLD保持 | **未执行**，按明确发布任务单独验收 |
| 历史供应商/结果持久化/ZIP socket事故 | 原benchmark仍有OPEN/PARTIAL | **独立保留**，不以当前成功样本抹去历史根因债务 |

## 下一步与退出口径

1. 按本轮真实超差继续性能定位，保留旧结果、条件和10%阈值，不用只读/API-only正常覆盖页面负载结果。
2. 有效远端CI后准备main普通整合，按固定整合源码验证受影响链，不拼接不同SHA。
3. 生产容量、历史事故和部署继续各自闭环；仍有必需待办时保持整体ACTIVE。

**候选分支超过48小时，原因仍为整体退出未达到。** 保留自有工作树和未整合分支，不处理他人资源。

权威明细：[当前工作区](../REFACTOR_WORKSPACE.md)、[R8Y模块记录](../changes/2026-11-01-refactor-r8y-quote-intent.md)、[R8X原测量](../changes/2026-10-31-refactor-r8x-current-performance.md)。[收敛前退出流水](https://github.com/JesstLe/naumi/blob/82729161200f166fe587b98bceb756a44999840c/docs/architecture/REFACTOR_EXIT_AUDIT.md)保留在Git。
