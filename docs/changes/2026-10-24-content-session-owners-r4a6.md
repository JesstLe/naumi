# R4A6 — 模板、会话、项目、工作流及历史账务的数据归属

## 基线与实施边界

- 独立工作区：`E:/Workspace/naumi-refactor-20261024`；分支 `codex/core-refactor-20261024`。
- 完整基线：`275e34a1f02b274df9ed5de79c948bada9e8af3b`，4191 个原工作区文件的实际字节及 SHA256 已保存在 `output/refactor-r4a6-20261024/BASELINE_SOURCE.tar`、`BASELINE.json`。
- 延续模块化单体；按数据家族迁移实际消费者，旧 db 入口同函数 re-export，不引入第二套 store、执行器或业务规则。
- 本模块独立候选，不合 main、不部署；不影响另一个重构分支或发布线程。

## 实现

1. 模板记录/查询/导入/缓存持久化、URL 投影归属 `templates/`，缓存执行器继续复用原网络与存储实现。
2. Agent/Genchat 会话、项目注册、Comfy 工作流/端点、竞品 workspace 分别有自己的 repository；竞品完成事务独立于普通 CRUD。
3. 历史流水和赠额分别归属 `billing/legacy-ledger`、`billing/grants`；手机号绑定归属既有 accounts repository。
4. 本轮不修改冻结报价、单价、真实余额校验、业务开关及原 operation；Comfy 的原数量规则未新增或重设。

## 三项随边界迁移处理的实际行为

- Agent 旧单列主键兼容迁移从 CRUD 搬入已有 schema 初始化事务，按实际 relation 查询主键，在原表改为 `(email,id)`；删除旧复制/DROP/重建路径。目标是保留行、表 OID、自定义索引/trigger，并在失败时整体回滚。
- Genchat `ON CONFLICT(id)` 增加原 owner 匹配；实际 HTTP 保存冲突返回 409，存储异常返回 503，不再把失败写入返回成功或把读取故障伪装为空历史。省略业务确认的正常创作行为不变。
- 竞品完成已 COMMIT 后先 release client，再刷新余额；目标是消除五连接池在四条被占用时自等待，而不增加连接数。

## 结构与行为对照

- 82 个声明按完整数据家族迁移；36 个实际消费者文件的 89 个绑定迁出旧 db。模板 URL helper 的实际调用也改到轻量入口。
- `db.ts` 2361 → **905 行**，编译发射静态消费者 64 → **35**；13 个新增数据/URL 模块未进入任何静态或含动态 import 的依赖环。
- 最大依赖环仍为 20 个文件；视频协议 20、图片恢复 12、模型组装 8、身份/creation/billing 7 等旧环本轮未关闭。
- AST 对照：80 个迁移声明在仅规范化 import 路径、export 和已明确删除的旧 Agent 迁移调用后相同；剩余 db 的 37 个声明、39 个其他源文件的 269 个声明、3 个 URL helper 保持。两项迁移函数行为变化及 Genchat handler/schema 新行为单列，用实际 PG 验证，不藏在 AST 规范化中。

## 集中验收

输入：`DATABASE_URL=postgresql://fixture:fixture-local-only@127.0.0.1:65452/naumi_refactor_r4a6_fixture`、`NAUMI_VERIFY_ISOLATED_DB=1`、`NODE_OPTIONS=--conditions=react-server`。完整基线与新版分别加载各自 checkout，不做混合源投影。

```powershell
node --conditions=react-server --import tsx scripts/verify-content-session-owners-pg.ts --baseline --source-root output/refactor-r4a6-20261024/baseline
node --conditions=react-server --import tsx scripts/verify-content-session-owners-pg.ts
```

- BASELINE：7 部分、205 检查，exit 0。成功代表旧问题按预期复现，不代表旧行为正常。
- MODIFIED：7 部分、290 检查，exit 0。其中 **76 项是同函数兼容出口检查，214 项是运行行为检查**，不把重复出口等价当成独立业务场景。
- 模板：列表/详情字段、搜索/排序、空串/false、重复导入、管理员值保留、收藏归属、缓存 expected-image CAS、失败/reset、代理 URL 均通过；无远程下载。
- Agent：原单列主键迁为复合键，新版保留原表 OID/数据/自定义索引/trigger；多 schema 同名表不误判。新初始化在后续 billing DDL 真正报错时，连同改键一起回滚，重试成功。旧实现用 rename 名称冲突注入，实证 DROP 已提交、原数据只留在 `_new` 中；不是模拟成完整事务。
- Genchat 实际 HTTP：旧跨账号同 ID 保存返回 200 并覆盖原账号内容；新版 409 且原内容保持。真实表不可读时，旧列表/详情/保存/删除分别返回 200 空值或成功；新版统一 503/no-store。正常 owner CRUD 与认证检查保持。
- 竞品：revision/lease 竞争、错误 job、余额不足事务回滚及一次 consume 通过。真实 max=5、占4连接时，旧实现吞掉一次余额刷新连接超时，完成已提交但余额镜像仍30；新版 release-first，无超时，余额镜像24，预占清理且仅消费6。
- 项目自定义值/坏编码定向修复、Comfy 私有访问/市场深复制/原 JSON、端点 key、手机号与赠额/历史流水均通过。

相邻集中回归均 exit 0：`verify-agent-session-isolation.ts`、`verify-billing-wallet.ts`、`verify-billing-entitlements.ts`、`verify-auth-login-http.ts`（195 真实登录 handler）、`verify-task-owners-pg.ts`（3/226）、`verify-persistence-pg.ts`（6/78）、`verify-persistence-boundaries.cjs`（29/90）。最后一项有效 settings 期望复用原 R4A2 留存 JSON 并校验 SHA，不冒充重新跑了 R4A2 基线。

全项目 `node node_modules/typescript/bin/tsc --noEmit --incremental false` 与本轮 54 个源码/脚本的 `next lint --file ...` 均 exit 0。本模块未运行 full build、浏览器或容量压测。

首次基线 verifier 把详情失败的 `{session:null}` 错写成列表 `{sessions:[]}`，首次 tsc 捕获 verifier 的可选 RegExp 重载错误；已修正验证脚本并集中重跑，生产源码未为这两个 fixture 错误改语义。初次日志 `BASELINE_1.log`、`MODIFIED_1.log`、`TSC_1.log` 保留；最终以 `_2.log` 为准。

四产物、独立副本恢复及提交推送的最终字面记录见 `output/refactor-r4a6-20261024/VERIFICATION.txt`、`DELIVERY.json`；回滚仅作用于证据目录中的另一个副本，实际候选保持新版。

## 剩余整体重构

`db.ts` 仍有卡密/授权、后台用户与跨表账号迁移、订单履约及旧 reserve/refund 用例；R4B 仍需将请求触发的兼容 DDL 与 bootstrap/配置组装拆开。此次只合并 Agent 旧键迁移入口，未把全部运行 DDL 迁出热路径。R5 Worker、R6 完整构建/CI/容量及最终候选验收继续按总台账推进。

Genchat 客户端仍有不检查 `response.ok` 的历史列表/自动保存链，页面级保存失败可见性和重试尚未在本轮实现或验收；不能把本次真实 HTTP 修复扩大为端到端 UI 体验关闭。后续复用现有会话/任务身份处理，不新增积分确认或另建任务系统。

本轮是上次 main 同步后的 **第2个**完整模块；提交与远端 SHA 由 DELIVERY 记录，不合 main、不部署，整体目标继续 active。
