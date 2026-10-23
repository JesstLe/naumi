# SaaS 视频制作链、批次与项目冻结补齐

日期：2026-10-23。实施：独立 `codex/saas-tenant-core-20261022`；未连接生产、未部署、真实供应商调用 0。

## 基线与同步

- 主实施提供已整合业务基线 `5a521e971eae81227a224a0d85237ffa289dcc01`，本分支普通合并为 `5a6f0652`。唯一 Agent runtime 冲突保留主实施的完整 textOnlyContinuation 门禁，不回退同事功能。
- 本次刷新 origin/main 为 `7b1e970c84006c2fb76f8c1748e96da128e12982`，已是基线祖先。自此基线完成本模块计数 1/3；提交文档不另计模块。
- 文件范围经主实施明确授权；不修改其 reader/UI/公共 creation schema，不编辑共享 checkout。

## 已实现

| 入口/来源 | 归属、接受和恢复证据 |
| --- | --- |
| POST `/api/video/workflows` | 创建 wrapper；workflow root 与 run.creation_scope 同事务提交；保持原 input/plan digest，不将 scope 混入 plan |
| POST `/api/canvas/video-workflows` | 同上；known-run 快路径先校验已冻结 scope；功能权益要求 canvas 与 video 同时允许 |
| workflow Worker/后台恢复 | 从持久 creation_scope 恢复；每阶段 video 子记录继承 root ID，原话取该 stage 的真实 prompt；已接受任务沿原模型/价格冻结配置执行 |
| workflow resume/confirm/cancel | 服务器读取原 run 的 actor/scope；显式跨空间 409；成员到期后仍能按接受事实恢复/收尾；不重新决定扣费账户 |
| canvas 视频 batch | 回执 creation_scope、复制 node、共享 workflow root 在同一事务落库；prepared_enc 与请求 digest 不承载 scope；复用已接受回执，不重新报价或提交 |
| 单视频 node generate | 使用服务端 node.projectKey 绑定项目；已接受同操作先比较冻结归属，不被请求 body 改写 |
| 视频 node 首次保存 | 在既有 graph lock 与保存事务内判断真正新 tree root，项目范围与 root 同事务固定；旧无归属项目拒绝企业升级 |
| 视频 node copy | 目标项目固定范围；验证源 node、引用 artwork/text 和 shots；保存 input/output video-node links 及明确零计费事实 |
| 首图生成后的真实项目 | `bindActualCreationProject` 校验 actor 拥有的物理项目，只接受精确 artwork/group/batch output link 的历史 scope 证明；header/body 不能预占不存在的项目 ID |

`withoutCreationContext` 显式退出 ALS，防止 legacy run 恢复继承调用者当前企业。legacy null scope 不补归属、不新增伪造历史 root。

输入 artwork、受控媒体及 text/video 项目在接受前校验企业范围；个人素材只有请求中明确列出的引用可进入。root 输入和子阶段原始 prompt 由真实业务请求保存，不能用根摘要替代各阶段原话。

## 读端合同

- `app_video_workflow_runs.creation_scope jsonb`，`creation_evidence_pending boolean`；`app_canvas_video_batches.creation_scope jsonb` 均由各视频模块执行 additive ALTER，旧行为不回填。
- root source/link 类型 `video-workflow`，source ID 为 run UUID；批次另有 `video-batch` link。stage `video` record 的 parent_id 指 root。嵌套 Agent 时制作链 root 自身为 Agent 子记录。
- copy 来源 `canvas-video-copy`；`video-node` input/output links；`no-charge` / `explicit-no-charge` 表示该复制操作已知零消费。
- `workflowCreationStatus` 为共用纯函数：completed/blocked/cancelled 为终态；全部完成 succeeded；部分完成且全终态 partial；无完成且 blocked 为 failed；其余全取消 cancelled；非终态中 needs_attention/needs_confirmation 为 needs_review；其他取消中为 cancel_requested，否则 running；空节点为 needs_review。
- 真正源状态在 run_nodes；副证据 SAVEPOINT 失败只记 `creation_evidence_pending=true`，保持业务检查点提交。只读恢复应取 run_nodes.result_assets 与上述状态，不把旧 queued 根记录冒充实时状态，不触发补收费或 supplier 重放。读端由主实施另行整合。

## 集中验收

`scripts/verify-saas-video-workflow-evidence.ts` 使用明确隔离的本机 PostgreSQL 数据库与临时 loopback HTTP fake；不读取生产配置。

已通过真实 Pg + fake 传输：

- 新企业视频 root 原子保存；显式切个人修改拒绝；phantom header 不落 context；真实首图 output 可建立项目归属；旧无证据 artwork 拒升级；无 header 时从可信项目继承。
- 两阶段真实接受/预占/HTTP fake 创建；root 与两个 video child 的企业、payer 及各自原话一致；成员停用后后台恢复仍沿原 scope；重复 resume 不增加 fake create。
- batch receipt 失败注入：副 node、creation root、回执均回滚，fake create 数量不增加；成功批次保存唯一顶层 root 与冻结 scope；跨空间同操作 409。
- 单节点生成读取真实 node 项目，回执重放冲突 409；copy input/output links 与跨企业 node 拒绝。
- 旧 null scope run 在其他 tenant ALS 外层恢复仍保持 null，无凭空 root。
- root evidence 更新失败注入：业务 run_node 仍 completed，pending 标志保存；没有收费重放。

最后通过库：`saas_video_workflow_fixture_20261023final`。之前 a/b 为 fake profile/multipart fixture 准备错误，c 为首轮通过；d 为补单节点用例时缺少 fixture loopback allowlist；均为隔离测试库，未触生产。最终加入媒体校验与 canvas+video 功能门禁后集中回归同样通过。旧 M04 writer 脚本的虚构 fixed-project 改为实际 tree:output-1，符合新的物理项目约束；在 `saas_creation_writers_fixture_workflow_regression_final` 完整回归通过（SDK mask、副证据故障、image checkpoint、离职 video 收尾、batch cancel、payer 不变均通过）。最终改动图含新增脚本的 targeted TypeScript diagnostics 为 0；非全量构建。

运行方式（必须新建独立空 fixture 库，不能使用主 UI fixture）：

```powershell
$env:NODE_PATH='C:/Users/Administrator/.codex/worktrees/saas-admin-20261022/naumi/node_modules'
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55439/NEW_FIXTURE_DATABASE'
$env:NAUMI_VERIFY_ISOLATED_DB='1'
node C:/Users/Administrator/.codex/worktrees/saas-admin-20261022/naumi/node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-saas-video-workflow-evidence.ts
```

未做：实际供应商视频质量、真实编码/Worker 媒体交付、生产数据验收、完整 Next 浏览器流/构建/蓝绿发布。该脚本在 fake 创建后注入明确标记的完成检查点，验证恢复关联与副证据事务；不能据此声称真实视频输出质量或整条 Worker 媒体处理已通过。主实施负责整合后的浏览器、全量类型与构建；生产由 root 协调。
