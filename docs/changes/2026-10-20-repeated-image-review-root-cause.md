# 2026-10-20 青眉重复待确认：后端根因与修复

## 线上观察（只读47；北京时间）
- 14:58运行source56aa3233/build1792471620，Web/Worker同image38e64646；模型配置v125，程序未部署上一轮77be79ec/9f749045。
- 青眉14:55:56即梦job-da3d8379 -> Hub34434ef7：14:56:02 missing_artifact/reconciling；bridge同ID、operationimage.edit、statefailed、account存在、accepted缺失；原生同时间日志-2009即梦积分不足。账号聚合只有1个启用账号，205成功/19失败；余额字段NULL，不伪称实时准确余额数值。
- 青眉14:55:22及14:50:07 GPT另有platform-images ETIMEDOUT，APIB预提交失败；14:48:56另有HTTP400。它们不是同一额度错误，不混称全部修复。
- 青眉11:56另有旧隔离GPT任务needs_attention。这张截图无任务ID，仅凭用户花名和相同项目无法唯一证明箭头所指占位是哪笔；可确认本账号新即梦额度故障及旧隔离并存。
- Hub21笔missing_artifact来自今日09:44后；SQL最初SQLite datetime比较日期分隔符格式不一致，不能称“最近4小时21笔”。需ISO规范统计修正。可钧2笔明确同失败/无nativeid。

## 根因
原生执行器FailureBody把业务错误用HTTP200/{code:-2009,message,data}返回。Hub只查error/ok=false，然后extractMedia找不到data而误判missing_artifact，任务进reconciling。App只见核查态，前端为防重复付费留住原回执，出现长期待确认。网站用户积分与执行器账号额度独立。

## 双仓本地修复
- Hub独立codex/jimeng-quota-receipt-20261020，基线4560034：仅本机冻结原生即梦、精确负码-2009、加密bridge同task/operation/account、failed且无accepted原生ID才记jimeng_quota_not_submitted；HTTP回执显式submission_status=not_submitted。其他负码/已受理/证据缺失继续核查；不改旧记录。
- 本App reverse-hub-images只消费经taskId/operationId/model核对的新failed+exactcode+submission_status且upstream_task_id===null，返回有限文案与not_charged，现有结算/通道层按明确未受理结束或使用允许的同模型备用。历史missing_artifact不变、已受理不重放、不伪造供应商费用0。
- 原生账号补充额度/更换健康通道是独立配置运维问题，本轮不改余额/配置、不发布、不重放。

## 验收
Hub原生envelope/加密bridge和Queue/SQLite、本App真实adapter合成回执基线-修改-副本回退，既有幂等GET/蒙版/核查等回归及tsc。证据output/repeated-image-review-20261020与Hub独立output/jimeng-quota-receipt-20261020。
本轮功能迭代计数3，已fetch origin/main3f940b86（无新增），三模块计数归0；未合main、不发布。
