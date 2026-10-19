# G56：47历史两事件优先结案，企业发布暂不放行

## 最新决定

2026-10-18，用户明确：**先解决这 2 项历史事件，再部署企业工作流**。

- `incidentPolicy=resolve-before-deploy`，`carryForwardAllowed=false`，需两项真实结案回执。
- 原产品仍18482的Demo；47仍为Naumi数据源与未来同机独立工作流服务部署目标。
- 不以升级资源代替事件结案；事件结案后也不自动通过容量、身份及蓝绿验收。
- 以前携带事件的发布授权和已完成发布回执只解释历史，不授权下一次企业部署。

## 本轮真实现场（2026-10-18 17:30—17:33，北京时间）

SSH只连接47；SQL使用BEGIN READ ONLY与5秒语句上限。未打印凭据、员工信息或提示词。本轮无生产修改、无供应商请求。

- canonical revision74，继任发布COMPLETE；当前完整Web/Worker运行，健康HTTP200且db.ok=true。
- 两活动与此前保留副本精确一致，原图片任务和计费行hash也一致。
- 原扫描所属旧容器确已停止，停止时间2026-10-18T04:42:24Z；没有因此改写历史排空证明。

|事件|实时证据|结案要求|本轮结果|
|---|---|---|---|
|supplier-scan旧进程观察|活动36c9a74d…仍unknown，claim_token=null，background-promise-unconfirmed；旧容器停止，查询有效租约0|持三锁，验证精确活动/boot/无归属执行，备份与CAS；追加进程观察处置回执，不把成本业务标成功|待执行经过独立验证的观察核销；未改活动状态|
|durable-image原结果未落盘|活动dab0be23…仍unknown；原job-d2c9a9c0… needs_attention、paid started、billing hold、冻结6积分、charged0、原扣费ledger0、图片0|优先从原调用恢复原图并核对哈希/归属/父任务/幂等结算；若确实取不回，明确失败及冻结积分释放方案，供应商成本单独对账|未恢复，未重试，未扣费或退款，仍未结案|

供应商调用ed92b290…：provider geeknow-images，model gpt-image-2，2026-10-17T01:29:27.054Z至01:29:58.504Z，response-received，delivered=1，output_count=1，cost_status=pending；task_id和request_id为空。原任务paidOperation无result、无gatewayIdentity；billing无result_response及settlement_result。

供应商响应/输出统计只证明曾观测到响应，不证明原图片可下载，也不证明供应商成本已结算。不能依据delivered=1直接把用户任务完成或扣6积分。当前未取得可恢复的原图字节，不能断言任何外部渠道都无法找回。

另有6条供应商成本任务（2 needs-attention、4 queued），有效租约0。它们不是6个本次历史活动，也不能因扫描观察结案而宣称这6笔对账完成。

## 本轮实现

`scripts/enterprise-production/same-host-plan.mjs`：已验证继任发布但携带两事件的分支，从等待授权的`NEXT_RELEASE_INCIDENT_DISPOSITION_REQUIRED`改为`HISTORICAL_INCIDENTS_MUST_BE_RESOLVED`，显式返回先结案策略、禁止携带、所需结案数量2。仍不把已完成继任发布误判为未完成。

集中回归验证原34项及新负例：调用方自行填carryForwardAllowed=true、resolvedIncidents=2、incidentDisposition或伪造verified回执都不放行。该预检是建议性工具，不是生产部署控制器；未安装新生产控制器、未修改在线运行环境。

本轮尚未实现接受真实结案回执的自动放行路径。后续必须独立实现校验：精确两活动ID、原快照hash、当前状态、原任务/父任务/账务结果、非过期证据、结案操作UUID和CAS。单个布尔值或人为把canonical改COMPLETE不构成证据。历史记录保留并追加独立结案记录，不改写历史排空为true。

## 后续执行顺序

1. 扫描观察：准备仅精确一行的事务化处置器、测试死boot/活租约/CAS漂移/重复执行/回滚；持三锁后核销进程观察并保存回执。不要重启旧容器或重跑扫描来假装原promise成功。
2. 图片事件：查原供应商调用/受保护运行资料中是否有原结果可恢复线索；不得重新POST生成。缺失请求ID时，按原调用时间和已保存响应摘要请求供应商核对，不按相近时间猜图。
3. 原结果仍取不回时，提出原任务及父任务失败、冻结6积分释放的精确业务处置。释放预占不是退款；供应商成本未知继续独立记录，不伪造零成本或已对账。实际账务变更前确认具体处置。
4. 两项结案后实现并验收新鲜回执门禁，再刷新47资源、版本及三锁。之后才进入企业独立服务蓝绿部署。
5. 资源路线和至少一名独立需求/验收人员仍待回复；本次决定不替代这些条件。

## 证据与接续

本轮目录：E:/Workspace/naumi/output/enterprise-incident-resolution-g56-20261018。
INSPECT.log为完整两事件/任务hash/当前容器/健康；CALLS.log为单行完整JSON的供应商扫描聚合及原调用；RECOVERY.log中的supplierScan聚合因多行JSON被截取，只使用其中完整paidRecovery记录，扫描计数以CALLS.log为准。

```text
继续G56：先读incident-resolution-g56.md、VERIFICATION.txt，再刷新47现场。
用户要求先解决两个原历史事件再部署；不携带事件继续，不重试未知付费生成。
扫描观察核销与供应商成本业务分离；原图恢复与退款/释放预占分离。
精确事务/CAS/三锁/回执验证后操作；保留线上服务和历史排空记录。
```

**状态：已落实部署前置条件并查清当前证据；两项事件均尚未结案，企业工作流未部署。**
