# SaaS 租户与成员身份数据层

日期：2026-10-22；模块 M01；分支 `codex/saas-tenant-core-20261022`；基线 `be4dbac6`。本文件为子模块交接，整体进度由主实施文档归并。

## 已实现

- 复用 `app_account_teams.id` 为租户 ID，扩展真实权益表和幂等命令审计表；授权期支持明确 null，席位支持明确 null，功能策略保留 false。
- 平台租户列表/详情/创建/版本更新/命令结果查询、总览统计；数据库缺少创作证据表时创作/费用显示未知，不能以成员 email 历史推断资产。确认创作按顶层记录计数，已结算费用按实际 billing operation 去重。
- 创建事务校验有效已有负责人；既有团队须显式复用；有旧成员须走既有组织初始化流程；不凭邮箱隐式合并企业。不创建账户密码、不扣款。
- 平台已有账号加入、移除企业身份命令，版本与幂等审计、席位/跨企业/组织循环/最后所有者保护。移除仅暂停身份并记离开时间，保留企业资产和账号。
- 企业成员增加 `membership_status`、`membership_expires_at`、`joined_at`、`left_at`；企业 status/expiry/organization 不再更新 `app_users`。全站密码重置在企业服务端明确拒绝。
- 每次读取重新校验企业、全局账号、成员身份与期限。数据 `visible` 集合仅有效下级；组织管理 `manageable` 集合独立，暂停成员可恢复。所有者组织列表可见暂停身份；旧按成员 email 读取的历史内容不因离职扩大。确认企业资产的所有者读取由主实施的 creation 服务以 tenant ID 判断。
- 企业快照返回真实 entitlement 与当前范围标签；账号状态和身份状态独立。

## 路由与契约

共享运行时校验/类型：`src/lib/saas/tenant-contracts.ts`。

| 路由 | 行为 |
| --- | --- |
| GET/POST `/api/admin/tenants` | 列表/创建；GET `commandId` 查询原命令结果 |
| GET/PATCH `/api/admin/tenants/[id]` | 详情/完整权益资料更新，expectedVersion 与原因必填 |
| POST `/api/admin/tenants/[id]/members` | attach/remove 已有账号身份；不修改全站账号 |
| GET `/api/admin/saas-overview` | 平台指标、上海自然日趋势与租户摘要 |

管理响应为 private/no-store，企业端不调用这些平台 API。API 对无权限返回 403，对未知对象返回 404，对版本/归属/席位冲突返回 409，对未知服务结果返回 503 并保留同 commandId 核对。

## 验证

真实 PostgreSQL 16 隔离库，监听 127.0.0.1:55439；全部测试账号为 `*.fixture`，未连接服务器或生产库，供应商调用 0。执行 `NAUMI_VERIFY_ISOLATED_DB=1 DATABASE_URL=<本地fixture库> tsx --conditions react-server scripts/verify-saas-tenants.ts`。

集中断言通过：鉴权、同源拒绝、创建重放、命令复用冲突、负责人重复冲突、分页、无效日期、资料 CAS、席位收缩保护、false/null、加入/移除幂等与最后所有者、暂停/恢复身份、全局账号所有安全字段不变、个人会话继续有效、撤权身份拒绝、离职旧兼容内容拒绝、跨企业拒绝、企业暂停、未知指标、顶层创作去重、实际扣款 operation 去重及私有缓存头。

创作统计测试使用显式最小契约 fixture 表；并非完整创作引擎或供应商证据。完整 creation-schema、Worker、媒体和浏览器验证须在主实施整合后集中执行。

`git diff --check` 通过。对本模块 8 个入口及其传递依赖执行 TypeScript 5.5 Compiler API 检查，`TARGETED_DIAGNOSTICS=0`；为适配本模块空依赖 junction，解析器仅在本模块路径无模块时回退主实施 node_modules，结果不等同于正式整仓检查。正式整仓类型/构建、浏览器、同尺寸视觉、生产只读与发布均未由本模块执行，不能称已上线。共享工作区初始 node_modules 为空；主实施安装依赖后本模块通过 NODE_PATH 复用其 tsx。删除本模块空 junction 的动作被自动审批拦截，未绕过，保留现状。

## 兼容与剩余

- 只增量扩展，保留旧表/字段与 email 唯一约束；V1 不默默开放跨企业多归属。不自动回填未知历史归属，不删除媒体或财务。
- 旧 activateEnterprise 的新初始化不再改写全局账号期限；已有历史全局期限保留，未自动重写历史。现有针对旧全局副作用的验收脚本需按新身份语义更新，不能把其旧断言当新合同。
- 席位/功能权益的创作接受检查由主实施贯穿 writer/Worker；成员身份读取服务已提供实时约束，但单个本模块不能证明全链路完成。
- 回滚不得使用忽略 membership 状态/私有媒体权限的旧程序。没有完成蓝绿及排空回执，本模块状态仅为代码完成和隔离数据层验收通过。
- 功能同步计数：本子任务 1 个完整模块；开工刷新由主实施执行。整体累计满 3 模块时由主实施统一 fetch/整合，不在子任务擅自合 main。
