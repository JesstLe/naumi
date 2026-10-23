# 历史拒绝诊断与通道健康闭环

## 目标

持续目标从cd64d1ff开始，先修历史benchmark实测第92行拒绝原因丢失，保持未知受理不重放、不制造免单证明；47维持配置、暂缓发布。

## 最小改动

仅channel-fetch.ts的既有HTTP错误分支：

- 原始响应继续在供应商账本/执行审计保留哈希和有限分类；返回SDK前换为已有固定IMAGE_* code/message/type，保留HTTP状态，不透传原文、余额或秘密。
- 不添加billing_status/not_charged，不改变现有明确免单判断，不删除原pin，不对同operation额外fallback或重POST。408/409/5xx未知结果继续Pending。
- finishExecutionStage后、ambiguous/4xx早退之前，以原本地错误排除集记录现有channel health恰好一次，删除原两个重复记录点。401/403沿现有auth阈值1/5min冷却，不新增路由预算或余额框架。
- cooldown只影响后续新请求的通道选择，原已受理pin保持原通道恢复。provider-balance只读缓存不接入本次执行准入。

## 验证边界

- cd64原样sunjiang真实PG/handler基线实际exit1，预期图片输入拒绝提示、实际通用失败，原日志位于output/imagegen-history-goal-20261023/diagnostic-baseline.txt。
- 修改态先完整执行同一7场景，包括原来第92行之后未执行的evidence/EMPTY/CORRUPT。原始断言的第二处旧状态漂移与修正依据见下节；第92/94行拒绝诊断与审计断言保留。
- quota子模块补基线/修改/独立回退、原operation A1B0、后续新operation A0B1、显式not_charged A1B1、health次数/RetryAfter/租约/pin边界。
- 两笔真实已完成未交付原任务只读SQL取证与本地续交付另记，不由供应商completed推出原图片存在，不以合成checkpoint冒充原图。

当前实现与验证进行中；完成状态、命令、字面输出、退出码、回退及真实取证另见本任务output证据，不作为已上线或外部额度已修复证明。


## 原诊断修复后暴露的旧测试状态漂移

原样7场景在拒绝诊断修复后已通过第92/94行，随后才到CORRUPT用例。旧verifier期待父状态needs_attention，但现产品父回执将内部error/needs_attention统一为failed；当前实际failed不是本次改动造成。git blame显示e282999e在10/20把旧expected从failed改成needs_attention，随后c7f051a7在10/21已将durable review改成终止error，verifier未同步。

不把此状态差异伪装产品修复。verifier按现有终止合同期待failed，同时新增断言：损坏图片0artifact/0客户扣费、子error、原paid started不改rejected/queued、供应商结果未核对时原预占仍在、重复原op零新增POST。原失败日志保留为diagnostic-modified.txt，后继集中日志另建，不覆盖原结果。

## 本模块实际结果

`diagnostic-full-modified.txt`记录真实7场景全部完成、exit0；损坏输出的原started与预占保留，重复操作零额外POST。原始基线及修后首次旧状态漂移两份exit1日志均保留。集中历史benchmark、完整类型检查、副本回退和发布状态由父封版记录统一绑定，不把模块通过升级为员工原样回放或线上恢复。
