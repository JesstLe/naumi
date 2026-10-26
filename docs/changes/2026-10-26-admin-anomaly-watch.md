# 后台定时异常巡检与离线修复

## 任务约定

- 每15分钟检查47后台真实只读GET，并交叉核对任务、父子回执、作品及冻结历史；不部署、不改生产任务、不重投供应商请求。
- 原始记录只留 ignored output；提交的 benchmark 使用稳定伪名和结构化证据，不包含账号、提示词、凭据或媒体内容。
- 复用 `docs/benchmarks/imagegen-history-20261023.json` 与既有 runner，新增观察账本；captured、reproduced、fixed-locally、deployed 独立记录。历史原样本与其OPEN状态保留。
- 工作树 `E:/Workspace/naumi-admin-anomaly-watch-20261026`，分支 `codex/admin-anomaly-watch-20261026`。开工刷新origin/main为905c8c63；现场程序已更新为af22c6e5，独立分支快进到该实际已发布源码，保留前一轮质量/报价修复。共享主目录18项改动不动。

## 首轮事实与进展

- 2026-10-26，运行Web/Worker同image45b272fc，版本1792808190，source af22c6e5。后台 legacy/new GET均200。
- 首次500条采样截断，明确记录partial；扩为有限2000条并优先非终态。采集器首次读取video错误列，修为真实artwork_id/resultAssets；失败材料保留。
- 已观察到父imagegen仍pending而同owner子generate已done/billing_settled且作品存在；部分父记录十几小时不推进。
- 现场 `durable-image / recovery-dispatch-scan` 在2026-10-24 07:10:50 UTC记录UNKNOWN。源码用同一固定admission_key运行所有未来扫描，UNKNOWN阻断后续整个扫描，不只原任务。原UNKNOWN保持事实，修复拟将协调扫描与付费任务身份隔离；具体任务自己的UNKNOWN/租约/防重放保持。
- legacy筛选把统一queued直传给原pending，succeeded只映射done而漏completed；将以真实PG fixture验证列表/详情/过滤一致性后最小修复。

## 尚待收口

巡检去重账本、benchmark接入、定向修复、集中回归、副本回滚与定时器启用。这里只记录当前进展，不标记已完成或已部署。
