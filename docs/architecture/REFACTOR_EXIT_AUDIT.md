# 整体退出审计

最近完整应用验收源码：`82729161200f166fe587b98bceb756a44999840c`。当前R8Y已修改报价owner，完整208与新固定镜像验收尚待；下表旧完整通过只归827，不拼成当前通过。R8X原配对prepare超差仍OPEN。**wholeGoal=ACTIVE；mainMerged=false；deployed=false；47 HOLD。**

| 整体要求 | 当前证据 | 判定 |
|---|---|---|
| R8Y新报价owner完整候选 | 原/新19用例50检查、当前原价入口5笔62 fixture积分通过；208注册 | **OPEN：固定新源完整core/runtime/browser/性能待验** |
| 规则唯一归属、模块依赖单向 | R8W 当前图：四类 SCC=0，生产 lib→app=0，runtime→scripts=0；2 条 release fixture 与1 条 dist 边单列 | 结构检查通过；不独立代替行为验收 |
| 原价/任务/权限/取消/UNKNOWN | 同固定源完整 core 206 PASS / 0 FAIL / 0 NOT_RUN / 0 reuse | 当前完整本地门禁 PASS；不是历史生产事故全部关闭 |
| 原生完整业务链 | 7 个原生入口在同源固定 Linux SDK 运行；完整 App/Worker 字节一致 | PASS；不再借用旧 Windows 局部结果 |
| 完整运行与产品页面 | 同镜像 runtime177、产品双浏览器92 | PASS；隔离 PG/供应商不是生产上游质量证明 |
| 当前同机配对性能 | R8X 5轮/10栈，源/lock/runtime 实核一致 | **OPEN：prepare p95 +17.98%，超原10%调查阈值**；其余采样指标无超差 |
| 报价准备的定向诊断 | 2轮/4栈 API-only；每侧400 prepare/400 read；23 SQL/请求、查询类完全一致；热态p95 -2.98% | 仅缩小原因范围；不覆盖页面负载下原超差，不擅认噪声或代码根因 |
| 持续/生产容量与10万活跃模型 | 同源450秒受控混合；生产到达率/长稳/规格/公平性另有台账 | **OPEN**，沿 [100k台账](../PRODUCT_READINESS_100K.md)；不将活跃数当并发 |
| 有效远端CI | 当前源 [run41209582369](https://github.com/JesstLe/naumi/actions/runs/41209582369)：job steps=0，账户支付/支出限制 | **OPEN**；未执行，不记代码失败或CI通过；仓库强制规则查询未取得有效结果 |
| 最终main普通整合/固定版验收 | 本轮已fetch main e2f56255，无新增待合；当前候选仍在独立分支 | **OPEN**；候选推送不等于合main，不强推 |
| 生产发布与线上验收 | 本轮无SSH/发布/部署锁操作，47 HOLD保持 | **未执行**，单独按明确发布任务验收 |
| 历史供应商/结果持久化/ZIP socket事故 | 原 benchmark 与各历史模块仍有 OPEN/PARTIAL | **独立保留**，后续成功样本不抹去未定位根因 |

## 下一步与退出口径

1. 定位页面负载后的 prepare 尾延迟：原5轮测量、逐栈HTTP/PG和API-only诊断分别保留；不新增用户护栏、不盲目增加Pool或降画质。
2. 取得有效远端CI后准备最终main普通整合；按固定整合源码验证受影响链，不将不同SHA结果拼成“全通过”。
3. 生产容量、历史事故和部署继续各自闭环。没有待执行项才标全项目完成，不因本轮测量或单个模块交付把 goal 设 complete。

**候选分支超过48小时，原因仍为整体退出未达到。** 当前留存自有工作树，不删除未整合分支或他人资源。

权威明细：[当前工作区](../REFACTOR_WORKSPACE.md)、[R8X测量](../changes/2026-10-31-refactor-r8x-current-performance.md)、[R8W运行边界](../changes/2026-10-31-refactor-r8w-fixed-native-acceptance.md)。[收敛前完整退出流水](https://github.com/JesstLe/naumi/blob/82729161200f166fe587b98bceb756a44999840c/docs/architecture/REFACTOR_EXIT_AUDIT.md)保留在Git。
