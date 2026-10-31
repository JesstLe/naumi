# R8U：完整候选验收与原生夹具内存预算

## 目标、基线和当前事实

持续整体重构不缩减为局部通过。本轮从 `b23aa32a6a54c6770c110343d3819d51888c55f1` 开始，完整5319个原始raw hashes和副本保存在 `output/refactor-r8u-20261031`。前一轮结构债务已关闭，本轮推进完整core，而不是继续机械提取文件。

历史R8P core-final为135PASS/1FAIL/57NOT_RUN；timeline-native-canvas先有ECONNRESET，后一次同source续跑期间明确发生主机commit耗尽和ERR_MEMORY_ALLOCATION_FAILED。历史结果不冒充当前结果，也不把内存发现当所有失败的唯一根因。

## 本轮具体修正

实际安装Next的dev启动代码在没有显式max-old-space-size时，以物理RAM一半覆盖子进程上限；本机64GB配置对应约32651MiB，不参考主机剩余commit。现有video-fusion隔离夹具的cleanEnv故意排除父NODE_OPTIONS，而dev分支原来未指定自己的预算。

只在现有harness的dev App环境指定自己的oldspace预算，避免测试工具按整机容量配置自己。初版3072MiB不足，已按下述真实失败校准到4096MiB。固定Linux生产fixture分支的环境保持，不修改生产Next配置、系统分页文件、钱包/任务/UNKNOWN或用户业务限制，不继承外部NODE_OPTIONS，不增长重试或超时。

验证使用实际harness表达式、实际安装Next内存覆盖代码和真实自有Node的v8堆上限回执；随后执行原生timeline及当前完整core。该配置不是生产容量证明，实际是否足够由完整链路结果说明，不能仅凭静态flag称通过。

## 验证与退出

实际命令、baseline/modified/rollback、完整core结果和自有资源清理完成后补录；任何FAIL/NOT_RUN保持原样。完整固定Web/Worker镜像、runtime177/产品browser92、同机性能/持续容量、有效CI和最终main验收仍OPEN；47 HOLD。夹具基础设施修正不增加产品功能模块计数。

## 首轮完整core与预算校准

首轮固定f4f7ca1d：144PASS/1FAIL/59NOT_RUN、exit1；timeline-native-canvas在真实浏览器reload时报ERR_CONNECTION_REFUSED。实际runtime日志明确记录Next内存阈值重启；原Next trace给出heapSizeLimit=3422552064、heapUsed=2746542288，超过实际框架80%阈值。这是本轮3GiB预算过小造成的引入问题，不归为旧harness故障或业务通过。原报告、日志、trace和cleanup全部保留。

4GiB校准保留实际Next重启保护，覆盖该观测负载，不移除用例、放宽业务断言、增加超时或重放供应商请求。新增控制执行实际Next重启判断表达式，确认原3GiB观测会触发、4GiB真实Node堆回执有余量；固定生产fixture环境仍EXACT。先定向执行原失败timeline完整浏览器链，再进行新的完整core。控制不替代真实链路，更不当生产容量验收。

## 第二轮结果与读取端修正

19d660ea的4GiB定向timeline真实浏览器链通过，但runtime仍有1条Next dev重启警告，不能说零重启。完整第二轮仍144PASS/1FAIL/59NOT_RUN，失败点推进到Graph lifecycle；浏览器pageErrors为空，检测端`expect.poll`回调中的原timeline列表GET因ECONNRESET立即抛出，未等到开发服务重启完成。两轮均保留FAIL，不把定向通过当整体关闭，不再继续加堆预算。

现有harness.request承担检测端HTTP边界，浏览器和真实unknown-acceptance请求不变。只对GET的ECONNRESET/ECONNREFUSED/EPIPE/UND_ERR_SOCKET，最多5次重读；使用同一个账号、URL、headers、operation ID及原90秒AbortSignal，总期限不增长。POST/PATCH/DELETE始终一次；HTTP400/402/403/404/409/429/500/503、非网络异常、JSON/响应体读取错误保持可见，不重试或伪造未受理。期限到达、持续失败仍抛出原错误，不创建新任务或重新生成。

该修正针对检测端在真实Next dev重启期间读取持久状态的生命周期，不修改产品执行语义。新增实际方法投影对照，保留所有原业务/浏览器断言。内存控制的整段harness一致性检查现在明确排除两个有意改动的owner（appEnv与单独验收的HTTP方法），不继续声称HTTP方法逐字节不变。

记录层问题也如实保留：首轮聚合stdout被第二轮ignored driver复用日志名覆盖，首轮145条原用例日志/REPORT/Next trace/cleanup/原命令均已逐hash保留；第二轮完整聚合已在实际进程退出后移到CORE_FINAL.log并修正命名。最初只按ParentPID遍历误纳入旧Docker进程的只读快照已标无效，不曾发信号或修改资源；所有后续归属核查要求创建时间关系。辅助元数据曾错误要求零Next警告，实际改记1条；首份类型输入清单未保存即被后续采集替换，原TSC日志保留，不作旧输入hash桥接。当前真实失败与这些记录问题分开，不据此洗绿。

## 修正后的局部完整链与未到达项

0ef41562的原timeline完整浏览器链（同原断言、真实App/PG/media/原引用/历史）已通过；不把保留日志中没有重读记录说成真实故障已注入。单独验证原完整门禁未到达的59项，同source全部新执行59PASS/0FAIL/0NOT_RUN、subset PARTIAL/exit2，非完整core。包括真实scene/character/director全App、原wallet/pricing/delivery、video sources、PG并发及Worker恢复，所有生产断言保持。该59项不与前两轮144拼接成当前完整通过。

HTTP方法最终23用例：原81检查/修改87检查、正常轨迹EXACT；包含实际Node fetch与真实loopback TCP断连。GET首次断连，原1次失败→新2次恢复；写入ACK丢失仍UNKNOWN、POST1次/服务端写1次、只GET原operation回执确认；持续读取失败仍最多5次后抛错、403可见、server已关闭。该loopback存储是明确控制，不冒充真实客户余额验收；真实账务来自上述既有PG脚本。内存策略9用例，原16/修改18检查，实际Next策略和真实自有Node回执通过；固定生产env EXACT。

当前代码仅改测试harness的两个职责（dev heap预算和检测端只读HTTP生命周期）及对应验证登记，没有产品src/services变更。下一次门禁包含原203项及两个新增必跑控制，共205项，必须同固定源码全新执行；完整core、固定Web/Worker镜像、runtime/browser、有效CI、性能容量、最终main验收继续OPEN。本轮基础设施修正不增加产品模块计数；已主动同步main后计数0。
