# 2026-10-30 企业后台读池自死锁与主画布回执轮询修复

## 模块与职责

- 故障依据：`E:/Workspace/naumi/docs/changes/2026-10-30-47-stuck-transaction-outage.md`。本轮只处理已确认的企业历史素材事务内二次借池、主画布回执单次无期限、业务池 checkout 无期限三个问题。
- 开工执行 `git fetch origin main`，从 `e470988555d18b553c56924ad64edfbe6582b75f` 建立 `codex/enterprise-pool-deadlock-20261030`，没有基于共享目录的后台 UI 分支，没有整合模型映射 103 独立验证线。
- `imagegen/input-asset-reference.ts` 拥有输入素材编号验证、owner/key 元数据查询和 URL 构造；`input-assets.ts` 保留生成链路需要的原始媒体体读取。
- `saas/legacy-creations.ts` 保留历史记录、详情和素材归属规则；`enterprise/creation-history.ts` 编排 schema 初始化与一致性鉴权事务；现有 HTTP renderer 负责事务外读取、缩放和响应媒体。
- `canvas/generation-receipt.ts` 只处理原任务回执的一次只读 GET；主画布仍拥有轮询节奏、整体截止时间、上下文退出和结果落位。
- `db/connection.ts` 只处理连接设施与池预算，不参与业务重试或账务判定。

## 公共接口、依赖方向、数据/状态/事务归属

- `LegacyReadScope={client:PoolClient;allowedEmails:readonly string[]}` 完全不变；仍先校验记录 email 位于 `allowedEmails`，再按记录 owner 查询素材 key。`legacyCreationDetail` 的 `{detail,media}`、分页编号、素材元数据和 `legacyCreationAsset` 的 `{url,mediaType,mime}` 返回结构不变。
- 新接口 `readImagegenInputAssetReference(id,owner,client?)` 只返回 `{url,mimeType}`。传入事务 client 时既不初始化 schema、也不调用 `getPool`，更不读取媒体体。独立调用仍在查询前初始化 schema，保留原编号规则、owner 小写匹配和缺失/无权限错误。
- 输入媒体读取 `readImagegenInputAsset` 复用元数据接口后继续读取最多 12 MiB 原图；buffer、mimeType、url 契约不变。
- 企业素材入口先 `ensureMediaSchema`，然后进入原 `enterpriseRead`；事务内只用 `access.client` 获取 owner/key 与受控 URL。现有 `creationAssetRoute → enterpriseMediaResponse/streamManagedMedia` 在 `enterpriseHistoryAsset` 返回（COMMIT、release）后执行，事务内不再调用原来的全量输入图 reader。
- 依赖单向：HTTP → 企业历史编排 → 历史查询/输入素材元数据 → DB/storage 基础设施。没有新增事务、数据库表、HTTP 自调用或跨模块写入。
- `readCanvasGenerationReceipt(jobId,headers)` 的 AbortController 30 秒期限同时覆盖 fetch 和 response.text；传输失败返回 null，两个原有循环继续下一轮同一 job 的 GET。原 2.5 秒节奏、6 分钟截止、账号/项目/工作空间检查、HTTP 错误、终态错误和 UNKNOWN/回执保留规则不变；替换节点的“检查原任务”GET 也复用有期限读取，不重发付费 POST。
- 业务池新增 `connectionTimeoutMillis:12000`；pg 原生超时文本 `timeout exceeded when trying to connect` 可识别，等待项由 pg 移出队列，不手写 Promise.race 遗留迟到连接。默认 business=5 不变；tick 的 checkout=3000、statement=3000、query=4000 等设置和各专用池预算均不变。没有修改数据库全局配置。

## 本次实现与迁移状态

- 三个修复模块均已落地；无需数据迁移、环境变量调整或扩大连接池。初始化输入素材 schema 移到企业鉴权事务开始前。
- 分支修改范围仅 7 个产品文件、1 个定向验证脚本和本记录。迭代计数 3 个模块，已执行集中 `git fetch origin main`，当时主线仍为 `e4709885`，同步计数归零；合并前再次刷新，最终 Git 回执见证据目录 `VERIFICATION.txt`。
- 源码与固定副本的基线、修改和复制回滚证据保存在 `C:/Users/13357/.t3/scratch/enterprise-pool-deadlock-20261030/`，独立于待删除任务 worktree。

## 验证命令、结果及证据层级

1. `node scripts/verify-enterprise-pool-deadlock.cjs <BASELINE> --baseline`：运行基线真实 legacy 查询实现，复现 `borrowed=1 bodyReads=1`，主画布 3 个原始无期限 receipt fetch，业务池 timeout 未配置、tick=3000。`BASELINE_EXPECTED_DEFECTS=PASS` 表示成功重现历史缺陷，不表示基线产品通过。
2. `node scripts/verify-enterprise-pool-deadlock.cjs`：修改后 `borrowed=0 bodyReads=0`，并发 4 个素材请求同样无二次借池；`allowedEmails` 拒绝仍为 404；owner/key 无匹配仍拒绝。
3. 同一脚本加载实际 `enterpriseRead`、企业历史入口、创建记录 HTTP orchestration 与图片 renderer，在 mock DB/auth/storage 端口下验证 records 200 → detail 200 → asset 200/image-webp；schema 在 BEGIN 前，真实媒体体读取在 COMMIT、release 后。不是线上数据库或浏览器 E2E。
4. 同一脚本从真实 Canvas AST 提取 `runGen`、`generatePend` 两个完整轮询循环，注入实际回执 helper，依次模拟 headers 挂起、body 挂起、网络异常、pending、done；每个循环 `attempts=5 aborts=2 network_errors=1 pending_then_done=PASS`。30 秒计时器在测试中加速到 5ms，终态/HTTP/截止/上下文退出仍通过，未重发 POST。
5. 同一脚本使用真实 pg 池队列及原生 12 秒计时器，仅物理 client 为内存 stub：占满 5 槽后 checkout 超时文本匹配、耗时至少 11.5 秒、waiting=0，释放后能再次借出连接。没有打开网络连接；不是实际 PostgreSQL 锁环压测。
6. `node node_modules/typescript/bin/tsc --noEmit --incremental false`：全量通过，exit 0。依赖借用已有 React 19.3.0 node_modules，不修改共享依赖目录。
7. `node node_modules/eslint/bin/eslint.js src/lib/imagegen/input-asset-reference.ts src/lib/imagegen/input-assets.ts src/lib/saas/legacy-creations.ts src/lib/enterprise/creation-history.ts src/lib/db/connection.ts src/lib/canvas/generation-receipt.ts src/components/canvas/canvas-client.tsx scripts/verify-enterprise-pool-deadlock.cjs`：exit 0，0 errors；Canvas 10 条原有 hooks warnings，未扩大本次范围修复。
8. 复制回滚：对修改快照的另一份副本运行 hash-guarded `ROLLBACK.sh`，全部目标先验 hash 后一次性恢复基线，再运行 `--baseline` 验证恢复历史行为。主修改快照保持已修复状态。另测 later-edit hash 不匹配时零写入。
9. `git diff --check` 通过；最终命令原文、输入、literal output、exit status、原始/修改 SHA256 和四项制品绝对路径统一记录在 `VERIFICATION.txt`。

## 未完成项与下一步

- 本轮没有连接任何应用服务器、没有部署、没有探测线上端点、没有修改线上配置/数据或遗留任务，供应商调用为 0；Git 合并推送仅是代码交付。
- 47 继续维持配置、暂缓发布。后续只有明确解除暂停并授权发布后，才按蓝绿与真实受影响链路验收；本轮本地/mock 证据不代替线上验收或容量证明。
- 全局 `idle_in_transaction_session_timeout`、真实 PostgreSQL 完整锁环复现、线上浏览器验收均非本轮已完成项。燕飞遗留任务状态不作任何变更，也不据本次回执超时推断“未受理”。
