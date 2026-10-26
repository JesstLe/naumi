# R5C — Web保存原任务，独立Worker领取与唤醒

## 固定基线与目标

目录`E:/Workspace/naumi-refactor-20261024`，分支`codex/core-refactor-20261024`，完整基线`41288c26c6146ee6613fc4edb17ea17bdf36e806`。4293个原文件实际字节及SHA256已保存至`output/refactor-r5c-20261026/BASELINE_SOURCE.tar`、`BASELINE.json`。本轮为main同步后第3模块，结束时刷新并普通整合main，保持独立分支，不合回main、不部署。

R5B已让恢复在独立进程运行，但Web首次提交、GET轮询、工作台同步仍可执行相同回调，批次恢复还通过HTTP调用Web。本轮使同一配置下这些入口只保存和读取，原Worker持原租约执行；不引入第二队列、外部任务产品、审批或用户限额。

## 实际实现

- `application/task-execution.ts`集中部署归属：`NAUMI_APPLICATION_TASK_EXECUTION=worker`时，只有direct Worker执行。原single-process/HTTP安装未配置仍local；worker模式要求DB，非法模式在显式Web启动时报错，不把任务放入非共享内存。该开关不来自请求。
- `DurableImageJobs.kick`在领取前统一分流，覆盖generate/suite/aplus/imagegen四类原任务及所有调用者。Web仍调用原保存/预占、原quote、owner/scope/fingerprint；不生成新operation。
- 原批次提交后唤醒、tick和工作台synchronize按同一归属分流；恢复批次删除HTTP Web回跳，逐项直接调用原tick并隔离单项异常。工作台内容确认/显式false/数量算法不变。
- Canvas改字保留原入库/预占并唤醒，恢复入口不在Web领取。原图续交仅在原parent JSONB记录`deliveryRecoveryRequested`，Worker沿原checkpoint/child锁/原价settlement完成，不重新生成。请求明确指定的原任务不受维护扫描的20秒延迟/7天页窗影响；历史和未知上游限制仍由原交付用例处理。
- PG `NOTIFY`只有当前schema名，无用户、任务、凭据；持久原表才是事实。独立LISTEN连接不占原query pool，断开重连；通知失败只记录，原周期scan继续。没有依赖通知成功才能受理，也没有HTTP执行回退。
- Worker保留单飞/原tick回执/UNKNOWN暂停。慢回调执行时，新通知在同一tick内按原DB lanes补扫，避免一笔长任务阻塞之后所有用户；排空或父supervisor关闭门后不补领，只等原回调完成。listener随角色关闭。
- Compose共享配置默认worker，direct scanner继承归属及原lane配置；Web旧timer保持关闭。旧HTTP tick在worker模式明确409，不返回伪完成回执。未自动修改47专用发布profile或线上环境。

## 集中验收

`scripts/image-worker-ownership-fixture.ts`对完整旧/新源码分别编译，实际调用submitGeneration、imagegen、batch GET、旧worker handlers、工作台accept、原图续交HTTP与PG/账务函数，只有供应商为本地HTTP夹具。

`scripts/verify-image-worker-ownership.mjs`使用Linux真实独立子进程、隔离PG、临时媒体。完整旧源码16检查复现Web执行/批次HTTP1；新版71检查通过：Web领取/供应调用0，独立Worker本地供应夹具7次，11笔原价consume合计66（冻结单价6/current17）。双用户、显式取消、批次/工作台各两项、原结果续交和混合unknown负例、嵌套原operation一次执行、慢任务公平、drain新任务保留、LISTEN断开重连、跨schema通知忽略，以及完全错过通知后的真实周期恢复均通过。子进程实际使用60秒定时器，通知后12秒内完成；这只是夹具内的验收上界，不是产品p95/SLO。

复用原真实Next build/start harness增加`--ownership`，完整候选源码复制、实际6个handler/PG通过20检查：新请求200/pending、current17冻结、Web lease0/consume0、旧HTTP全scan409、鉴权401。该定向Next构建不是完整产品/standalone镜像。Linux缓存镜像只供Node24/原生依赖，候选bundle与脚本挂载并hash绑定；最终Worker包2335输入、HTTP route0，仅pg/sharp外置。

相邻R5A恢复PG5/156、原tick回执59、持久化PG3/36、工作台原价/取消/真实余额13组通过；R5B真实进程恢复29/钱包锁排空32/崩溃后只读核对39均通过。Linux runtime31、combined91断言及legacy实际drain/handoff/package通过。部署策略18检查明确为实际源码+注入DB端口（含NOTIFY失败仍保留受理），不冒充真实PG。全项目tsc和19个变更代码文件lint通过。

源码对照7124个非目标声明保持，15个目标声明调整；原generation submit/runtime/dispatch、任务repository/lane、tick回执、billing、suite/aplus九个算法文件逐字节保持。DurableImageJobs15个成员除kick增加归属分流外均保持；新owner不入环，既存SCC组件集合和最大20不变。

### 保留失败与相邻债务

- 首次旧源码fixture放在`/fixture`，动态ESM sharp不解析NODE_PATH；改为`/app/fixture`以匹配原生依赖位置。工作台fixture prompt与保存plan不符、手造嵌套plan的feature/version与quote不符，均修正fixture，未松业务校验。原始exit1日志留存。
- 新测试的UUID默认参数推断、query_timeout类型、policy环境类型和Next lint保留字均修正，保留原始tsc/lint失败，不将其删成PASS。封版PowerShell先覆盖日志头再追加，避免旧失败与新结果混在同一“最终”流。
- workbench verifier硬编码DB名，第一次在本轮隔离库被拒；仅在自有PG新建其要求的`naumi_pricing_fixture`后13组通过。
- 旧`verify-pricing-friction-image.ts`前9个client场景通过，planner的旧注入端口仍指向`model-config/server`，R4读侧迁移后实际published snapshot不存在，exit1。基线自有五文件投影、相同当前依赖也同失败；不将这称完整旧源码A/B，不为旧fixture恢复first-use写入。原脚本未修改；列入R6测试端口整理。此次真实Next/完整源码PG已有独立报价/执行归属正负例，但不把该旧脚本标绿。
- R5A既存stopping fixture清理与无参legacy测试债务仍在其原记录，本轮没有改写历史结论。

最终命令、literal、退出码、独立副本回滚、4293原文件哈希和patch replay均保存在本轮四产物。副本恢复local执行/HTTP批次旧行为，实际工作树保留worker实现；Git、远端及自有夹具cleanup以DELIVERY终态为准。

## 整体仍待继续

本轮处理持久图片/批次/原生工作台/Canvas改字及已保存结果续交。视频新请求首次supplier提交、独立媒体角色与47管理式发布的配置/资源/state交接、scripts媒体runtime迁移、剩余20及小环、Canvas外围UI/CAS、完整新App镜像/CI/性能容量均继续；不将局部通过当作完整重构或生产验收。未增加用户侧核对和业务限制。
