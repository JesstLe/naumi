# 47 全系统一身份中心：实施记录

## 目标与本轮实际范围

用户已批准：47无限画布企业后台统一维护Naumi全系账号、组织与产品授权，设计协作作为消费方。舒隽与舒靖不是同一个人；舒隽、曲飞为普通UI设计师，中央账号待建立。确认名单目标202人，不等于删除或替换源站其他账号。

独立工作树 `E:/Workspace/naumi-central-identity-20261118`，分支 `codex/central-identity-20261118`，开工main `62ed1ba767195b3e5939da59545deb7d86bce13f`。共享checkout的用户修改保持原样；未借用103独立验证线。

本轮先完成中央后端模块，不把它称为统一登录、管理界面或跨产品上线完成。

## 已实现模块及职责

- `src/lib/enterprise/identity/contracts.ts`：独立的组织职务、本人归属、四组调度范围、专业审核范围和产品角色合同。职务不直接变成平台user/admin。
- `schema.ts`：稳定subject映射、企业组织投影、产品授权、审计回执与outbox；不修改原账号/业务主键，不存密码。
- `service.ts`：复用现有企业授权事务和锁序；CAS、幂等、特权保护、降岗收回不相容产品授权、同事务写审计与事件。
- `consumer-config.ts`：专用服务凭据绑定一个企业和一个产品，中央只存服务token的SHA配置；不使用账号密码哈希同步。
- `/api/enterprise/identity`：企业登录身份下的组织与产品授权查询/修改；POST要求Origin并使用既有同源检查。
- `/api/enterprise/identity/projection`：服务端凭据限定的design-ops完整授权投影；含账号启停、成员停用/到期、撤销时间、原生账号管理版本，以及组织/产品授权版本。
- `scripts/verify-central-identity.ts`：真实隔离PostgreSQL、领域方法和实际Next Route合同。已登记现有refactor-cases，不引入第二套测试runner。

依赖方向是Route→身份领域→现有企业事务与数据库，不让消费者直接写源库；当前模块不触碰计费、供应商、任务或NAS实现。

## 保护规则

- 最高管理身份仅绑定现有企业负责人。普通站点管理员维护普通人员；自身、负责人、其他管理员、总监和原有特权账号的身份/产品授权受负责人保护。
- 普通UI设计师没有管理员、主管、审核或跨组调度权限。
- 设计主管可管理四组，但审核能力必须有对应reviewGroups；并不自动增加系统权限。
- 原账号禁用、成员停用、根入口授权暂停或企业授权关闭会体现在当前投影中；不依赖历史事件一直不更新的副本。
- 历史操作重放是回执，不是当前值保证：返回currentVersion和currentStateMatchesReceipt供独立核对。
- 并发组织修改通过expectedVersion互斥，副作用及事件/审计同一事务提交；事务失败不留新增subject或半个grant。

## 开关与配置

新入口默认关闭，现有业务不改变。测试/未来部署需显式配置：

```text
NAUMI_IDENTITY_AUTHORITY_ENABLED=1
NAUMI_ENTERPRISE_DEPLOYMENT_MODE=dedicated
NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID=SOURCE_INSTANCE_ID
NAUMI_ENTERPRISE_ALLOWED_IDS=ENTERPRISE_ID
NAUMI_IDENTITY_CONSUMERS=[{"productId":"design-ops","enterpriseId":"ENTERPRISE_ID","tokenSha256":"SHA256_OF_SERVER_TOKEN"}]
```

服务token只进入受保护配置，不进入源码、日志或普通用户浏览器。当前仅登记第一个消费产品design-ops，不声称未知产品自动接通。

## 当前验证

- 开工基线 `scripts/verify-enterprise-hierarchy.ts` 实际通过；保护原企业层级、跨企业403、专业范围、原角色/密码/积分和历史账户行为。
- 新中央模块在独立数据库实际验证稳定ID、幂等与冲突、管理员保护、普通UI设计师拒绝提权、限定产品投影、账号/成员撤销、降岗收权、并发CAS、审计与outbox原子性、企业暂停、实际路由cookie/Origin/缓存、历史回执不冒充当前值。
- 再次运行既有企业层级回归通过；类型检查结果与原始输出保存在任务output中。最终字面命令、hash与副本回退以本轮VERIFICATION为准。
- 无UI修改；真实管理界面与浏览器旅程尚未实施/验收。无生产账号、密码、组织、积分写入，无付费生成调用。

## 47 当前发布状态（本轮只读核对）

- 当前固定企业 `1095114e-6b57-429e-a954-7d663907e0c9`，负责人为北方对应原生账号；源企业成员206（负责人另计），这是源企业现状，不用本次202人名单裁剪其他成员。
- 生命周期revision2325，activeRelease为 `release47-canvas-fixes-20261116-r2`，phase=`ONLINE_OLD_MEDIA_CLEANUP_PENDING`、releaseCompleted=false。
- 旧Web仍保留未结算的media-variant UNKNOWN与media-mirror Promise；旧实例仍服务历史媒体。本任务未终止、清空、重分类这些原记录，也未叠加候选实例。
- 本轮没有构建/部署新的47镜像，没有执行新schema、建号或组织赋权。新源代码通过不等于线上功能已启用。

## 剩余工作与下一模块

1. 在无限画布现有企业界面增加中央组织/范围/产品授权编辑，不再让各产品各自维护权限。
2. 设计协作消费方的subject映射、多组调度/审核权限、角色撤销与同步状态，含保护旧制作/审核/文件ID的实际数据库验证。
3. 账号生命周期与outbox完整联动、消费方ACK/重试/乱序/全量对账；当前可实时读取原生状态，但尚未实现全套下发worker。
4. 标准统一登录与首次设密/邀请；当前服务投影不是OIDC，不复制密码不代表已实现SSO。
5. 两名UI人员从中央正式建号，再按202人批准名单逐项预演和下发，不把fixture当真实成员。
6. 独立复核、真实浏览器与移动验收；main整合/发布继续核对最新主线及47自然排空条件，不强制结束原任务。

功能模块计数：已完成中央后端切片1个；整个统一身份项目未完成。

## 已提交切片与证据

中央后端实现提交 `e5bae085050e16db989c66edb6094b7b72668d58` 已推送。本模块13组验证、既有企业层级回归、全源类型检查均通过；注册runner的定向分组为1通过/0失败，按既有规则整体标记PARTIAL且exit2，不宣称全仓core通过。独立源码副本逐hash恢复原registry并移除8个新增文件，原企业回归再次通过；修改源码保持不变。

四件文件已重开核验：`output/central-identity-20261118/MODIFIED_FILE.tar.gz`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。结构化结果见同目录文档中的 `2026-11-18-central-identity-evidence.json`。该源码切片没有对应生产部署，也没有新建两个真实账号。
