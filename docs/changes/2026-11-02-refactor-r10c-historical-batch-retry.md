# R10C：历史回执的重试证据与批次观察身份

## 真实反例与边界

基线`099255606e0706b26215b038ac65b76f80fff4cd`，5398原始文件完整冻结。不是认定线上存在这些历史行：fixture先走真实创建handler／PG／租约／供应HTTP及钱包，等待原父子任务终态，再只恢复升级前派生的`NOT_ACCEPTED`父回执标签；原paid identity、供应阶段、账本和预占保持。另有明确声明的旧unindexed形状和缺失审计输入。

原九场景完整复现：无证明403／缺审计／实际接收后socket丢失均因旧标签自动购买下一次，2POST并新增一笔6积分；明确未收费和有身份的旧unindexed对照正常2POST／6积分。受控两个真实tick在第一个批次FOR UPDATE前交错，旧tick用第一轮结果覆盖第二轮子任务，attempts2→3、POST3、账本两笔共12积分，批次回执却只汇总6。它是本机实际并发反例，不冒称线上事故唯一根因。

## 模块职责与公共接口

`imagegen/retry-eligibility.ts`归生成应用模块，不拥有阶段表、供应调度或钱包写入。

- `hasProvenImagegenRejection(paidOperations)`拥有原paid attempt／unit结构归集，复用model-config的只读明确证据接口。新父任务分类与旧回执消费共用它，不复制供应判定。
- `canRetryImagegen(operationId,owner)`重新绑定原父任务、owner／当前scope、失败回执身份、原子任务、真实结算和结果状态，再核对原明确证据。历史NOT_ACCEPTED标签或投影0积分本身不授权购买；缺数据／未证实／读取失败返回未证实，不调用planner、供应、结算或任何writer。
- `dispatch.ts`只消费共享拒绝接口；删除上轮内联归集，外部接口和现行新任务错误提示保持。
- `batch.ts`在取得批次锁之前读取原identity的eligibility，不在持锁期间跨模块借查询连接。原事务重新检查`child_operation_id + attempts + submitted`，只消费同一轮观察；取消、原最大次数和并发额度仍由原批次owner负责，不加新限额或任务系统。

没有修改原回执来制造授权，没有更改报价、供应wire、客户释放或原账本。修复不依赖清空历史任务、恢复积分确认或新增人工审批。

## 验证矩阵

九条原任务链覆盖：无证明403；审计不存在；明确未收费；旧unindexed明确未收费；供应接收后真实socket丢失；已有原产物／真实6积分但父投影过时；原maxAttempts=1；明确证据读取失败；并发陈旧tick。

原九条完整基线已复现；首次候选九条PASS，无证明／缺证据／UNKNOWN／读取失败均停在原1POST、0consume、0预占；明确未收费两类仍2POST且恰一笔6积分；并发3POST／2consume→2POST／1consume，新子ID／attempts／lease保持。原paid状态不改。后续加固接口负例（其他owner、其他scope、缺任务、非法attempt结构）和原完整generation组以最终VERIFICATION／DELIVERY为准。

已有产物guard案例刻意制造过时父投影，实际原图字节和原6积分保持，当前结果仍可能failed；该用例只证明没有额外购买，不冒称修复了这种合成父回执的产物展示。首个baseline尝试错期待succeeded的失败保留，后续完整基线明确核对本案例实际合同。

受控并发的唯一屏障是fixture在真实批次SELECT FOR UPDATE执行前暂停第一个调用；第二个调用沿原函数、原PG锁和真实供应推进。没有替换批次实现或缩短／扩大产品时限。新的stage读取故障只注入明确SQL端口，原证据仍保留。

## 原入口与集中验收

旧scope-receipt仍是receipt-only，新增owner作为禁止执行sentinel；parent-completion加载实际新模块及原窄端口，原业务断言不删改。新verifier接入原generation目录及逐case证据端口，225登记不是完整225已通过。

固定完整应用构建、generation整组、原102浏览器、最终tsc/lint、源码桥接和四产物以本轮VERIFICATION／DELIVERY实际记录，不预记未执行结果。回滚只在显式独立副本，完整hashguard在首写之前，验证旧九场景及陈旧tick3POST行为恢复，实际工作区保留修复。

## 整体退出

本切片收敛R10B末尾的历史拒绝标签消费问题，以及同一owner内的陈旧观察事务漏洞；不等于其他故障矩阵／语义耦合审阅／当前同源225CI／候选合main已完成。整体ACTIVE，本线程部署0；分支超48小时的原因仍为整体退出和有效同源CI未闭合。main的独立47发布证据保持，不将本重构宣称已发布。

## 原顺序生成组与夹具质量

固定`6f38575b5ee804cd1a8f3bff88dc97df54db979e`的generation原顺序22子命令单次全部PASS／exit0、0FAIL、0NOT_RUN、0reuse；局部scope顶层仍PARTIAL／exit2，不修改退出合同或宣称完整225通过。新九场景中接口的其他owner／其他scope／缺失任务／非法attempt结构负例一并实际执行。

定向lint发现旧scope-receipt夹具原有的局部变量名module违反Next lint规则；对099原始Git blob经stdin lint已复现同一问题。只把局部绑定改名loadedModule、保留VM的module属性及全部断言，不关闭规则。该更名发生在完整22运行之后，后续单独复验原23项，最终源码桥接与质量记录不将旧组执行源改标为新head。

## 固定完整应用与最终质量

完整生产Dockerfile实际构建源`db3a5b9f3805c772ed62497fb9b7eb865dc1b6c6`，5401文件，image`sha256:ff9c49a5d5d7cac142e12a41ba9be3c6c5f9aee62d9c5ffef1811b7d50d8911b`，Web／Worker／media同镜像包探测通过。该镜像原102浏览器单次全部PASS，8consume／48积分、routeMocks0、重载付费POST0、原断网及供应失败UI保持；本轮历史批次／并发反例由独立的真实PG原函数九场景证明，不谎称这102项包含新批次UI场景。

全项目非增量tsc及定向lint最终exit0，5110编译器输入及4配置绑定；scope变量更名后原23项单独复验PASS，runner真实子进程20场景369检查PASS。两旧verifier原194个断言调用AST（仅规范CRLF）全部保留，删除0。

应用执行源db3a、generation组执行源6f385、最终文档源分开绑定，最终源码只桥接原scope局部绑定更名及文档，不将22局部组改标为完整225／新head执行。自有full-image容器／网络／PG tmpfs已清理；独立PG留至副本回滚后按CID／label／无其他连接核对清理，最终文件哈希、旧九场景恢复及资源状态归VERIFICATION／DELIVERY。
