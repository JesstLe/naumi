# 后台 CRUD 与历史接入补齐

## 基线、职责与状态

- 基线 `cb1d2f4932e402a75511485173027ed049ed342e`。本模块在父任务独立工作树 `E:/Workspace/naumi-admin-operations-20261029` 修改，不覆盖共享管理 UI 草稿。
- 平台 BI 维护原用户/流水/作品/业务任务查询；企业成员模块维护独立企业站的原生员工账号。身份、企业归属、积分和审计继续归属已有业务模块。
- 47 是 dedicated 企业站：`/api/admin/*` 的平台后台关闭，实际管理入口复用 EnterpriseConsole。不能只在平台页面做完后称 47 已接入。
- 当前是源码和本地回归交付；父负责完整 Next 页面、本地验收实例、Git 状态及服务器权限变更。本子模块无生产写入或发布。

## 实际确认的缺口及修复

1. **花名账号创建/管理被邮箱校验拒绝**：原 BI `z.email()` 拒绝中文原生标识。新增公共 `accountIdentifierSchema`，沿登录 `loginIdentifierToEmail` 规则归一化；只允许合法真实邮箱或原生花名，不更改鉴权。
2. **企业成员显示“未登记”**：原 BI 只读管理员手填 `app_bi_account_profiles`。用户列表、企业筛选、企业数现在优先使用真实 `app_enterprise_members`/owner 关联；手填运营标签另列，不能替代真实成员关系。当前归属仅用于账号目录及过滤，不回写旧任务的历史企业归属。
3. **从用量页跳用户/流水丢筛选**：原 Dashboard 忽略 URL `email/from/to`。现在初始化、查询、下钻、前进后退、清除账号和保存用户均同步 URL；普通导航保留日期和账号，切换分类清理旧任务 ID。
4. **旧业务记录只见近期、编号不易查**：增加非概览页面“全部历史”分页选择；operations 支持 `id + source + email` 精确查询，编号绕过日期但不绕过账号/授权来源。SQL 保留先选页键再展开 JSON，并设置 20 秒 statement/5 秒 lock timeout。概览趋势仍有 366 天上限，避免无限时间序列。
5. **企业站缺账号维护入口**：新增 `/api/enterprise/members` 和 `EnterpriseMemberManager`，创建花名账号、编辑显示名/手机/对应关系、密码重置、积分调整。创建、企业关联、精确初始积分、审计同一事务；不额外加注册赠送。
6. **岗位只有新增/编辑，无删除**：原企业命令增加 `delete-role`，只允许负责人删除没有任何成员引用的岗位；版本 CAS、同操作重试及审计保留。引用中的岗位不能删。

## 企业成员公共接口

`EnterpriseMemberManager({snapshot, member?, onSaved})`：不传 `member` 为新增；传成员为资料/密码/积分管理。父页面仅在 `dedicated && snapshot.actor.owner` 挂载，admin 账号行不展示编辑。

POST `/api/enterprise/members`：

- 公共：`id` UUID、`enterpriseId`、`email`（邮箱或花名）、`action`、`reason`。
- `create`：`name/phone/note/password/initialCredits/months?/roleId/supervisorEmail/employment/expiresAt`。
- `profile`：`expectedVersion/expectedUserVersion/name/phone/note`。
- `reset-password`：上述双版本及新 `password`。
- `adjust`：上述双版本及非零整数 `delta`、可选 `months`。

企业实际 scope、当前负责人授权、岗位和组织、席位、目标用户权限、成员版本及用户版本在同一事务内复核。仅 dedicated 单企业原生账号开放；共享企业老板没有修改全站账号密码/钱包的入口。原生站点 admin 仍只管理钉定企业，不通过平台 cookie 扩权。返回的 `phone/note` 仅限 dedicated 负责人，普通下级管理者及共享企业不暴露全站备注。

积分复用 `BillingRuntime.service.adjustTx`，不直接改钱包批次总额；负数受余额与预留保护。密码只落 salted hash，旧会话撤销，审计不记密码。超时结果不确定时表单保留原操作 ID 和请求体，只重试同一命令。

**删除语义**：成员账号采用已有“暂停身份 / 恢复身份”；平台账号采用停用/解封。没有新加物理账号删除，不删除作品、账本、原付费任务或原会话证据。岗位删除只删无引用的配置行，操作审计保留。

## 侧栏与子页面覆盖矩阵

以下为源码/数据来源盘点，不冒充每个页面的本轮 GUI 验收。

| 一级/子页 | 数据来源及现有操作 | 本轮状态/删除语义 |
|---|---|---|
| 运营概览 | 平台租户汇总、BI 账本/作品/业务表；日期筛选与下钻 | 保留真实数据；实际企业数补齐，统计分析由 usage 模块扩展 |
| 用户 / 用户用量 | `app_users`、真实企业成员、积分批次/流水、作品 | 花名 CRUD、真实归属和 URL 筛选已补；用量页面由父及 usage 模块负责 |
| 用户 / 功能权限 | `app_feature_access`、policy 版本与审计 | 现有读取/保存/CAS保留；默认/自定义策略，不删除账号 |
| 租户 / 租户列表 | 企业、权益和授权 | 现有创建/编辑/启停/详情保留；企业停用不抹历史 |
| 租户 / 既有团队 | 旧团队、子账号和授权 | 现有范围内操作；已升级企业引导企业管理，不能绕过企业范围 |
| 租户 / 入口授权 | `app_team_access_grants` | 现有发放/续期/暂停/恢复/撤销，审计保留 |
| 租户详情 / 概览 | 企业资料、有效成员与权益 | 保留 |
| 租户详情 / 成员 | 企业成员、岗位、上级、有效期 | 平台原成员维护保留；dedicated新增账号/资料/密码/积分入口 |
| 租户详情 / 权益 | 席位/功能权益/授权期限 | 现有预览、版本保存保留 |
| 租户详情 / 创作 | 冻结 creation scope + 事件/产物/账务关联 | 原数据读；没有可靠旧关联时不猜归属 |
| 租户详情 / 用量账务 | 企业范围账本/用量 | 现有专用范围API保留 |
| 租户详情 / 审计 | tenant commands/enterprise audit | 只读，不人工伪改或删除 |
| 创作 / 统一创作 | `app_creation_records/assets/links/events` | 现有新协议全链路；不把无记录旧任务伪造为新 creation |
| 创作 / 历史业务任务 | image jobs、canvas tasks、video tasks UNION | 全历史分页和精确 ID/source 查询补齐 |
| 创作 / 图片 | 全部 `app_artworks` 及来源、输入关联 | 全历史/回收站、原图详情、来源下钻保留；原删除走作品业务路径 |
| 创作 / 对话 | agent sessions/genchat sessions | 原历史分页；仅显示可读消息，不导出内部工具凭据 |
| 创作 / 调用审计 | `app_bi_model_calls`/链路记录 | 只读；采集前缺失调用不会倒填为零或伪造记录 |
| 套餐账务 / 账务配置 | 冻结计费配置及发布版本 | 原草稿/校验/发布/CAS保留 |
| 套餐账务 / 钱包与充值 | products/prices/costs/rules/credits/history/operations | 七深层标签保留；积分变动走账务服务，历史流水不硬删 |
| 套餐账务 / 充值订单 | `app_orders` | 全历史分页、状态筛选；真实与模拟支付分开，不直接篡改支付事实 |
| 套餐账务 / 积分流水 | `app_ledger` | 全历史分页、用户下钻；消费/退款/赠送/调整独立 |
| 套餐账务 / 价格表 | 当前模型展示及计价映射 | 原编辑/校验/发布保留 |
| 套餐账务 / 采购对账 | supplier cost ledger、采购/余额记录 | 原管理接口保留；不在本任务触发供应商请求 |
| 套餐账务 / 定价测算 | 当前计费规则与试算 | 试算不等于真实扣款，不制造订单 |
| 模型供应商 / 模型管理 | 已有模型配置及供应商模型资料 | 原新增/编辑/启停/移除及冻结发布路径保留 |
| 模型供应商 / 供应商模型库 | 元数据/人工配置 | 原读取编辑优先级保留；不凭本轮刷新覆盖人工参数 |
| 模型供应商 / 供应商余额 | 成本账户与余额快照 | 数据/API保留；新读数缺失不冒充实时余额 |
| 模型供应商 / 完整配置 | 模型配置版本、凭据引用 | 原保存/校验/发布/版本保留，凭据不进导出 |
| 模型供应商 / 健康巡检 | 原健康事件 | 既有显示，未运行生产探测 |
| 模型供应商 / 质量审计 | 图片成本/质量证据 | 历史只读；审计覆盖率不是全部请求成功率 |
| 运行健康 | 服务/任务/活动/Worker回执 | 只读观察，不以列表CRUD删除 UNKNOWN 或重放任务 |
| 系统审计 / 站点接口 | 原settings管理接口 | 原保存/验证保留，不改部署绑定 |
| 系统审计 / 管理日志 | BI/tenant/enterprise管理审计 | 只读，追加新成员账号命令审计 |
| 系统审计 / 访问记录 | `app_bi_access_log` | 全历史分页；日志启用前数据真实缺失 |
| 部署管理 | fleet/站点治理 | 原权限/API保留，不因本地后台开发执行发布 |
| dedicated / 成员与岗位 | 真实企业scope、成员账号、岗位与上级 | 本轮账号维护与无引用岗位删除已接；暂停/恢复保留数据 |

## 集中验证

独占 PostgreSQL 容器由父维护，测试库 `crud_fixture` 中每次新建独立随机 schema，执行后只清本测试 schema。

```powershell
$env:NAUMI_VERIFY_ISOLATED_DB='1'
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:61053/crud_fixture'
$env:CRUD_EVIDENCE_ROOT='E:/Workspace/naumi/output/admin-operations-20261029/crud'
node --conditions=react-server --import tsx scripts/verify-admin-crud-history.ts
node --conditions=react-server --import tsx scripts/verify-bi-management.ts
```

- 原始管理模块从基线 Git 字节加载：中文花名校验失败真实复现。
- 新验证覆盖原生账号、权限/跨站/跨企业、精确初始积分、重复/并发操作、CAS冲突、密码/会话、组织失败原子回滚、实际企业归属、旧任务分页、精确查询授权、岗位删除及审计。
- 原 `verify-bi-management.ts` 的所有已有断言通过，未放宽余额/预留/最后管理员/本人/CAS/密码红线。
- 首轮失败是 fixture 缺 `app_image_jobs.metered` 非空字段，产品创建路径未改；补齐该输入后通过。原失败日志保留。
- 最终计数、完整 stdout、源码 hash、完整 Next GUI 和回滚证据以父封存 `VERIFICATION.txt` 为准。

## 剩余边界

- 本轮没有搬迁/写入历史业务记录；旧任务从原表读，旧 scope 缺证据保持“历史归属未确认”。
- 不把调用日志启用前的缺失 Token/细节伪造为完整数据；旧有未记录原因不能凭空补写。
- 不是所有表都需要人工增删改：账本、已接受任务、运行锁、支付事实和审计必须通过领域操作，保留原事实。
- 完整页面验收、平台与 dedicated 两入口、47 伽罗权限与本地镜像数据覆盖率由父统一登记。

父集中补修：空手机号以NULL保存，19项真PG回归通过；表单固定初始版本，待确认命令上报父容器保护外部关闭/导航；完整Next的旧稿409、丢回执同ID单次积分与实际新增编辑通过。
