# R5A — Worker应用用例归属与图片恢复去HTTP回跳

## 基线与目标

独立工作区`E:/Workspace/naumi-refactor-20261024`，分支`codex/core-refactor-20261024`。完整基线`5dd0ff9d3fd5f0a087d5b805086eb212020acb0d`，4274个原文件的字节与SHA256在`output/refactor-r5a-20261026/BASELINE_SOURCE.tar`及`BASELINE.json`。

R5目标仍是同版本独立Worker直接运行共享应用用例、保留租约/恢复/排空，不把HTTP tick换壳后仍交Web执行。实际源码显示，旧tick内顺序执行7类恢复，而durable-image恢复再向Web的generate-image/suite/aplus/imagegen进行HTTP POST；套图和A+整条管线仍在route。先完成这些应用用例所有权，R5B再接独立进程及发布角色，媒体运行时迁移随后继续。

## 实现

- 套图22个声明、A+29个声明原样迁入`src/lib/suite/runtime.ts`与`src/lib/aplus/runtime.ts`。原模型调用、重试、母图审核、局部结果、保存和结算函数体保持。对应route从780→221行、1072→374行，只保留请求解析、身份/权限与响应适配、原提交/查询语义。
- `DurableImageJobs`和编码/解码/执行context等真实实现归`src/lib/image-jobs/runtime.ts`。Worker鉴权归`worker/authorization.ts`。旧`durable-image-jobs.ts`仅同函数/类兼容出口，生产named消费者直接绑定owner，不经兼容门面反向加载恢复链。
- `worker/image-recovery.ts`保持原due查询、4路并发dispatcher、原ID、原数据库租约和冻结scope/bundle恢复，按四种kind直接调用原kick/resume函数，不再合成HTTP请求；batch与stored-delivery续交保留。
- `worker/scan.ts`持有原tick扫描顺序与计数字段。HTTP tick只保留原鉴权、UUID受理/查询与回执恢复。未改变tick回执表、幂等、unknown或发布控制协议。
- 本轮没有改独立Node scanner启动入口；生产tick仍由原调用者触发。共享应用用例是R5B真实前置，不把本轮写成重型任务已全部离开Web。

## 验收与证据

使用本轮自有回环PG，四类原任务恢复、实际产品handler、原已生成PNG和真实账务，不使用供应商替身返回新的生成结果。complete-checkout旧版与新版分别进冷子进程。

- PG五组：正常恢复、Web503、实际tick五并发、冻结原价和release实际后台活动/排空。旧版129检查、新版156检查，均exit0。正常旧版恢复HTTP4次→新版0次；Web503时旧版四任务仍pending、consume0，新版四类恢复完成、三笔consume合计18。原活跃lease不动，原scope保留，重复扫描不新增账务，unknown paid checkpoint不执行回调。冻结合同单价6/current17仍每笔扣6，完整原quote与版本保留；排空时原回调可观测、business token与release记录一致、新claim0，完成后active/unknown0。
- 实际Next15.5.27完整源码copy、六个实际handler定向build/start/HTTP验收：旧34/新37检查均exit0，恢复回跳4→0、三笔consume共18不变。fixture跳过内置类型/lint，另由全项目tsc及20个变更代码文件eslint集中检查；不是完整产品build、浏览器、standalone或镜像验收。
- 58个迁移声明/类/helper与7069个非目标生产声明保持；扫描顺序/计数字段token一致。12文件恢复动态环已拆开，新6个owner不入环、scan可达HTTP route0、兼容门面生产消费者0（一个src下历史test helper保留兼容验证）。最大20环及媒体src→scripts依赖不变。
- 相邻批次20个旧脚本：15个直接exit0；固定DB的middleware在规定的本轮自有55438/release_fixture环境补验24检查exit0；Windows不支持的drain/handoff在隔离Linux中补验通过，同时packaged入口和23个runtime unit通过。Linux使用固定缓存基础镜像、只读挂载逐字节核对的原脚本；原始输出的base-image SOURCE_COMMIT不代表本轮候选。
- 原`verify-image-job-stopping.ts`完整旧源码与新版均先输出首项PASS，再因cleanup引用未初始化的`app_supplier_call_outputs`报42P01且不退出：新runner240秒/旧对照30秒分别终止，原错误保留，不将此脚本记绿。unknown无重放由本轮矩阵及已通过concurrency回归分别覆盖。`verify-worker-legacy.mjs`要求指定早于当前协议的旧runner，本轮误以无参回归执行的exit1保留，不伪造旧runner或声称历史缺陷用例已通过。
- 首次fixture失败保留：PG尚未ready；旧`reserved_cost`是历史原字段而非在途计数，改断言实际reservation行；冻结quote fixture遗漏paidFen等必填facts；printer把相同token的对象换行误判，改token对照。均未改生产行为。副本回滚/patch/提交以`VERIFICATION.txt`、`DELIVERY.json`最终实际证据为准。

## 继续事项

R5B接同版本独立Worker的进程运行、明确执行身份、原受理/unknown回执与关闭时等待实际任务，不复制扫描器或重放未知付费请求。媒体引擎仍在`scripts/video-fusion`，后续迁真实runtime并校正Docker COPY/tracing。原剩余依赖环、外围UI/CAS及R6完整产品build/CI/容量验收继续。当前为main同步后第1模块，不合入main、不部署、不接管其他线程发布锁。
