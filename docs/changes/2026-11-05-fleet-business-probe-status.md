# Fleet：兼容探测不再丢失业务能力元数据

## 模块、接口与归属

本切片回应 review `5774451262` 的三项意见，基线为 `1933112a82900e6fff9235f22f8045b5b1b6f39f`。

- connector 的兼容探测保持旧 JSON status 格式，只在已声明本地支持业务时，用 `x-naumi-fleet-business-probe: 1` header 标识 probe。旧 strict central 不解析该 header，原 body 仍可接受。
- 中央在原认证与 instance row lock 内读取旧 status，只有 probe header 精确等于 1、旧 business=1 且 source/version 都与本次一致时，才保留 business 元数据。其他字段全部来自当前 status，不复制旧 nas/storage 等值。
- 派发的 SQL 参数仍取当前 `body.status.business===1`，不使用保留后的 status。因而 probe 保留元数据并不允许新业务命令在确认前派发。
- 未广告过的实例、无 probe 的真实旧 connector、无效 header、source/version 变化均不继承旧能力。真正带 business=1 的新广告仍可建立状态。

这不是永久能力缓存，也没有改变 HMAC 确认、source reader、业务事务、lease/ACK 或控制优先合同。首 poll 有控制命令时仍仅执行原控制与 ACK，不增加第二 poll；撤权控制的空响应仍结束该 tick。

## 正式回归与证据层级

扩展既有 heartbeat verifier，加载并执行实际 connectorExchange、connectorTick、localFleetStatus 及真实合同/HMAC，有限 transaction/transport/apply 只作为边界。矩阵检查 probe 保留、首次 probe 不创建能力、真实旧 heartbeat 清除能力、错误 header、source/version 改变、只保留 business 而不保留旧字段，以及派发 boolean 仍取 wire status。

既有真实 PG/HTTP control-priority 模块新增一个场景：实际 connector 先完成签名协商，再在首兼容 poll 执行 ban 控制，随后检查实际 app_fleet_instances 状态和 actual business-central 视图仍为 pending；无 probe 的旧 heartbeat 必须清除能力，且不能派发已排队业务读。这里只修改隔离 fixture 的预期 banned 字段，不执行收费操作。

基线/修改/副本恢复的精确命令、输入、字面 stdout/stderr、退出状态、原始 hash 与四产物复开结果记录在作者本地：

`output/fleet-business-probe-status-20261105/final/VERIFICATION.txt`

该目录是本地交付，不声称其 VERIFICATION/COMMANDS 被 CI 生成或上传。远端 CI 继续上传 workflow 实际生成的 heartbeat `tests/MODIFIED_RESULT.json`，内容为当前提交的逐项断言、实际源码来源/hash 和结果；原 upload 未移除。完整 PG/HTTP 与类型结果以实际执行日志为准，不把有限边界矩阵当成真实 PG/HTTP。

本地集中实测：原 `1933112a` 专项 114 项中 4 项失败、exit 1；修改版 114/114、exit 0；真实 PG/HTTP 151/151（控制优先 30/30、时效 20/20）、exit 0；原 enqueue-clock 32/32、exit 0；全库 tsc stdout/stderr 空、exit 0；原 preparation 输出 `PREPARATION_ONLY:ROOT_FILL_AND_REVIEW_REQUIRED`、exit 78。clock 首次调用误传不支持的 `--output-dir` 导致 CLI exit 1，该 stderr 保留；更正命令后通过，未改动 clock 检查脚本，原轮次 raw result 也按原字节恢复。副本 rollback/原行为恢复和零写守卫的实际结果单列在上述验证文件，不冒充生产 rollback。

## 发布与剩余项

协议文档已在 rollout guidance 前明确 **PREPARATION ONLY / HOLD**，保留 `PREPARATION_ONLY=True`。发布前仍须完成 producer admission、全部共享 DB legacy-consumer 隔离、retained-state 回退行为与实际 image 证明。签名 businessSupport 与本次元数据保留都不满足该 gate，也没有关闭之前保留业务行的 Major。

本轮没有实现或发行生产 permit，没有 SSH、清理队列、DB 恢复、重放任务、合 main 或发布 103/47。Git 开工 fresh main 为 `ca00b1f125fff1077277c3a3b0cbf5b7df4b34f3`，`HEAD...origin/main=395/0`；主线无未包含提交。
