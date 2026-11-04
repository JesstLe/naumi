# Fleet：中央确认后的业务心跳协商

## 本轮状态

最新 review `5774043683` 覆盖 `9b427783`，提出两条 outside-diff Major。本切片实现第一条：connector 只在中央确认协议支持后广告业务能力。**第二条“保留业务行阻塞旧中央派发器”尚未修复，发布继续 HOLD。** 不以本次协商或原 source-copy rollback 作为生产回退兼容性证明。

## 模块、接口与依赖归属

- `local-status.ts` 只采集实际本地 Web 的 source/version/storage，不判断远端中央能力；正常、unknown 与坏 slots 分支均不含 business。
- `business-support.ts` 是窄协议 helper，提供 `signFleetBusinessSupport(instanceId, nonce, token)` 和 `verifyFleetBusinessSupport(...)`。它只依赖 crypto/schema，不拥有数据库、部署或业务状态。
- `server.connectorExchange` 在原实例认证、时间/nonce 检查之后，为普通成功 poll 响应附加 `businessSupport`，绑定本次请求 nonce 和 instance；撤权控制的空响应不附加确认，保持该 tick 到此结束。ACK 分支不改。
- `connector.connectorTick` 负责协议协商；独立 `scripts/fleet-connector.ts` runner 通过 `business:true` 声明本地实现支持业务操作。原带 business 的调用入参仍被当成本地能力意图，不直接照抄到第一份网络心跳。
- 账务、钱包、源业务查询、command/lease/receipt 的 owner 与事务边界保持不变。

## 行为与反向兼容

1. 每个 tick 都先剥掉 `status.business`，发旧 strict schema 可接受的正常 poll。没有支持缓存，也没有新增端点、schema 猜测或版本号启发式。
2. 新中央返回明确的 `businessSupport={version:1,instanceId,nonce,signature}`。signature 使用既有实例 token，HMAC-SHA256 domain 为 `fleet-business-support:v1:`，正文固定为 `JSON.stringify([instanceId,nonce])`。严格 schema 与恒时签名比较拒绝错误形状、额外字段、错 token/instance/nonce、篡改及其他 poll 的重放。
3. 首响应若包含控制命令，继续原签名验证、执行及 ACK，不因协商增加第二 poll。旧中央没有确认字段，新 connector 仍按旧心跳正常运行；这里的控制兼容证明限定为没有 retained business 队头的场景。
4. 仅当首响应无命令、本地声明支持且确认有效时，才发第二份带 `business:1` 的 poll。只有本 tick 实际完成该业务广告后才允许执行返回的业务命令。未经协商的业务命令在 apply 前拒绝。
5. 中央可能在两份 poll 之间降级。第二 poll 若明确返回 HTTP 400，只再发一次旧格式 poll；所有请求使用不同 nonce。网络错误、401/403、429、503 等保持原未知/重试语义，不触发该降级重试，不重放已收到的控制命令。
6. 新响应只是向旧 connector 增加一个可忽略字段，原 command 签名、lease 验证、ACK 幂等、grant 撤销、控制优先、90 秒 freshness 和类内 FIFO 不变。

确认只证明该受认证中央对本次 poll 支持新协议，**不证明它的 image 是生产允许回退的目标**。新的确认字段不清理旧 query、不终结未知结果、不调整任何积分。

## CI 结果与本地作者证据

新增正式 `scripts/verify-fleet-business-heartbeat-negotiation.mjs`，接入现有 fleet-business CI。专项执行实际 connectorTick/localFleetStatus 函数和实际合同/crypto，在有限 transport/apply/本地版本采集边界验证旧中央、新中央、nonce/instance/token 错误、跨 tick 降级、首控制命令、第二 poll 400 与其他错误。证据明确不冒充真实 HTTP/PG。

**CI 配置的上传目标（仅实际运行并产生文件后）**：现有 workflow 的 `fleet-business-read-${{ github.sha }}` artifact 上传专项实际生成的 `output/fleet-business-heartbeat-negotiation-20261105/tests/MODIFIED_RESULT.json`。该 JSON 包含本次实际源码 hash/origin、逐项断言、场景及结果。它不是完整的作者本地 baseline/rollback 封装，也不能证明 CI 没有执行的步骤通过。CI 若因账号门禁未启动，就没有该次运行的生成产物；此路径不是已存在的远端下载链接。

集中真实 PG/HTTP protocol 另覆盖新中央与新 connector 的正常查询、控制优先、source 只读、lost ACK、lease/幂等及物理连接关闭；全库类型和真实本地 TLS 单独检查。**下面是作者本地交付归档，不是 workflow 已上传或会自动生成的文件**：baseline、modified、实际恢复副本、后续编辑零写守卫、所有字面输出/退出状态及四份产物的复开记录保存在本地工作树的

`output/fleet-business-heartbeat-negotiation-20261105/final/VERIFICATION.txt`

同目录的 `COMMANDS.json` 也只属于该作者本地归档。CI upload 配置没有承诺这两个本地文件；远端审阅应引用前述实际上传的 `MODIFIED_RESULT.json` 和 Actions 日志，不应把本地路径当成远端 artifact 链接。原 MODIFIED_RESULT 上传保持不变。

提交 `1933112a` 的本地集中结果：专项原版 79 项中 39 项失败、exit 1；修改版 79/79、exit 0；真实 PG/HTTP protocol 最终 144/144（其中 control-priority 23/23、freshness 20/20）、exit 0；真实本地 TLS 8/8、exit 0；全库 tsc stdout/stderr 空、exit 0。原 preparation 原命令仍输出 `PREPARATION_ONLY:ROOT_FILL_AND_REVIEW_REQUIRED`、exit 78。这是固定提交的作者本地结果；后续 [兼容探测状态修复](2026-11-05-fleet-business-probe-status.md) 的新增断言与结果另记。GitHub 账号执行门禁未解除时，本地验证不替代当前提交的远端 CI。

集中回归的首次 PG/HTTP 执行真实发现两项 control-priority 断言失败：撤权控制的空响应附带确认，导致同一个 tick 再领到了后面的业务读，原先下一 tick 才领取的行为被改变。修正只移除了该撤权分支的确认字段，保留原零命令响应与 grant 检查，未放宽既有测试。首次 `MODIFIED_PG` exit 1 的完整输出继续保留，成功复测另记 `MODIFIED_PG_RETEST`，不覆盖失败记录。

## 第二条 Major：实施设计已核对，尚未实现

旧 `268076b` 不认识 business.query，也不认识任何未来新增 flag，因此只在 remoteResult 查开关或让租约到期都不能防止旧 dispatcher 读到它。旧 generic GET 还可能读取已终态的业务结果，故 gate 需要检查任意 retained business 行，不只 queued/leased。

后续最窄闭环必须一次交付：**低层 producer enforcement + 真正发布 controller 的发行/回退拒绝 + 同 DB race 与 controller 回归**。不能先造一个无人发行或只靠手填 SHA 的 permit 来把测试变绿。

- `server.enqueueCommand` 的业务 INSERT 前，在同事务、instance/id row lock 之前取得共享业务 admission 锁并验证发行者。generic Fleet POST 也直达此入口，上层检查不足。poll 派发与原 lease 业务 ACK 的冻结/排空合同也须统一；合法晚 ACK 仍保持原身份和第一份终态。
- Fleet 专用 adapter 在候选创建前明确 candidate/public 的 command DB 关系。共享库候选在默认关闭态下验收 UI/控制，不提前持久化 remote business 行。
- 现有 `mapping.Release.switch` 已先切入口、排空旧 Web/worker、retire 并验证 stop/restart=no。必须在该流程完成后再次核对全部共享 DB consumer/旧路由闭包，才由真实 controller 签发当前 RID/image/DB 绑定的业务 admission，然后进行 remote business 的生产验收。
- 回退前在原 host 双锁、lifecycle 锁内，取得 DB 排他锁，等待在途共享业务事务结束；关闭新 producer 并读取完整 retained-state。冻结后不再新入队，但已接受命令不被改身份或删行。存在业务行时，在第一个旧 image start/resume/路由回写前拒绝 `268076b` 目标，保留兼容中央和原始状态。
- DB 锁只覆盖 admission/冻结/状态检查，不跨 Docker stop、网络等待或浏览器操作长期持有。所有 producer 与实际旧 consumer 控制入口必须纳入同一闭包，不能只核对两个已知容器名。
- 可复用 `release_runtime_recovery.py` 的签名、原子发行和 boot 身份工具，但既有 startup activation 本身不含业务回退证明。新 fleet RID 的 launcher pattern、adapter 和完整 ops bundle 也必须实际验证。

仍缺的正式证据包括：上述 producer/issuer 实现、实际 immutable recovery image、该 image 的 retained-state PG/HTTP 两顺序矩阵、真实共享 DB consumer/路由/排空闭包，以及所有 cutback 入口首写前的 gate 接线证明。既有 preparation 继续保留 `PREPARATION_ONLY=True`、exit 78；本轮没有 SSH、发布、permit 发行、清队列、DB 恢复或任务重放。

## Git 与交付层级

基线为 `9b4277834c966680a3fb1500bee912f06fd65469`。开工 fresh fetch 的 main 为 `ca00b1f125fff1077277c3a3b0cbf5b7df4b34f3`，`HEAD...origin/main=394/0`。本轮只提交这一兼容性切片，不合整条重构线到 main，不发布 103/47，不将第二条 Major 标为已解决。
