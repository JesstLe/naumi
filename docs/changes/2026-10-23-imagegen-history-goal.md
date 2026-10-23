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

这只是取回原字节；不表示现有产品能自动把started转换为done，也不表示原员工已经拿图。原图解码、冻结处理合同、存储/作品/父回执与结算的本地continuation由独立verifier继续补证。完整员工原始请求exact replay仍0，22笔外部额度仍OPEN。

## 待封版

等待原结果本地续交模块；本轮固定Linux构建进行中。随后统一四件材料、副本真实回退/恢复行为、commit/push与现场清理。历史两笔生产状态不写，47发布HOLD。
