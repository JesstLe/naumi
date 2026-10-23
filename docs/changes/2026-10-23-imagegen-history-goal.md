# 历史生图失败持续闭环

## 当前目标与约定

用户要求统计历史失败，用相同机制和原材料在新调整上再测。47维持配置、合并后暂缓发布；本轮不创建线上候选、不切流、不重启、不写生产账务、不重放未知付费POST。

## 已完成模块

- `a1628cf1`：channel-fetch原有HTTP失败分支保留有限拒绝诊断，早退前按既有策略恰好记录一次health。无not_charged时不新增fallback、不清pin。
- `d64512ed`：quota baseline/modified/rollback机制回归；原403 A1B0，后续全新operation因cooldown A0B1；原pin及未知供应费用保持。
- `d86c9509`：最小本地case取证CLI与11个集中测试；捕获包与真正重放分开，不自动关闭历史问题。
- 历史runner可选`--case`只核验/索引包，不执行请求，不改变exact=0。

## 实际集中结果

`output/imagegen-history-goal-20261023/benchmark-modified/REPORT.json`：10/10输出断言符合，结论PARTIAL/预设exit2，不是全历史修复。此前9/10 ERROR原日志保留。全仓tsc、限定ESLint、channel live guards、case capture11tests均exit0。

原sunjiang诊断基线exit1；修后7场景exit0。修后首次运行在旧CORRUPT状态断言处exit1，已保留日志；只同步已有failed终止合同并增强started/预占/no replay断言，独立只读复审remainingP1/P2=0。

## 精确两笔未交付原任务

本轮只读SQL确认精确两parent/child关联、同owner、原模型135/计费8，child error、paid started无result，无images/交付checkpoint，各预占12、客户实际扣费0。裸child无pin，child:image:0原pin存在。

本轮原供应商task GET各1次均200/completed、ID匹配；原输出URL的SHA与原supplier output hash相同。原图GET各1次均200，4018782字节及3989857字节，已私有落盘。下载不携带供应商Authorization、不跟重定向、TLS与公网DNS pinning校验。原account凭据纯内存解密并验证accountIdentity相符，未调用应用ensureSchema/ledger/恢复GET。

这只是取回原字节；不表示现有产品能自动把started转换为done，也不表示原员工已经拿图。独立verifier已完整解码两原图，并以原135/8冻结合同完成真实本地存储/作品/父子回执/结算。原started无result仍拒绝且各12预占保持；仅在隔离库显式证据导入done+原图后各succeeded/结算12一次，重复两次同artwork零新账本，wrongowner/lease/混合unknown均拒绝。原/最终SHA相同。完整员工原始请求exact replay仍0，22笔外部额度仍OPEN。

## 待封版

原结果续交测试模块已整合`810214ce`。新固定Linux image `sha256:73698597e358e6972aed0c18f3d9c8f43effd84aa7f70c51a62ae6a2ba86d03a`绑定产品源`d86c9509`/build`1792744593`，91/91构建与离线Web/Worker bundle核对exit0；后续增量只测试/文档，`git diff --exit-code d86c9509 -- src`为空/exit0。最终镜像容量未测，不替代47双槽准入。四件材料、副本真实回退、最终集中结果与Git远端证明统一见本轮VERIFICATION。历史两笔生产状态不写，47发布HOLD。

## 原图本地续交实证

|样本|真实尺寸|原/最终SHA256|账务|
|---|---|---|---|
|1|1536×2048|790a2ae28ddba485fab56fd850d6b95b352cd68a2d33de54e550df4b418b2939|本地结算12，一笔−12，预占0|
|2|2048×2048|69161dd9522c04d65ea1efa25fc1319666c20d98e8db49479be9c250562f0d33|本地结算12，一笔−12，预占0|

子模块集中baseline/continue均exit0；未复制员工原图、prompt、signedURL或原配置进Git。原图私有保留，不作为公开效果图发布。

## 封版取证绑定修正

第二轮benchmark运行期间父更新了catalog的两图取证说明。旧runner保存时重新读取live文件hash，但scenarios仍为启动时快照，造成报告hash/内容错绑；原REPORT和10项真实结果保持，不覆盖。`FINAL_BENCHMARK_BINDING.json`逐字节校验scenarios与启动commit c9f0f17的catalog一致并单列正确SHA；不改测试结论。runner现只在启动读取一次manifest bytes及SHA，后续save复用，避免并行文档更新再次错绑。增量以纯内存真实runner保存路径验证，不再重复执行整套PG矩阵。
