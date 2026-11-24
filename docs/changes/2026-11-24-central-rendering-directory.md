# 设计侧 rendering 目录兼容（源码阶段，启用 HOLD）

## 责任与基线

- 中央负责目录契约及现有中央选择器兼容；消费 owner 自行实现团队显示、任务与人员视图。运营侧保持。
- 在既有干净中央专用 worktree `E:/Workspace/naumi-central-identity-20261118` 新建短分支 `codex/central-rendering-20261124`，基于刷新后的 `origin/main=71ed16b1c7bb24831abef154ec626e00422ecd62`。原 `codex/central-oidc-resume-20261119` 分支保留；共享 `E:/Workspace/naumi` 的分支、dirty 和用户文件未操作。
- 本轮只做源码、集中小范围资格/权限回归、文档和普通 Git 整合。**没有 SSH、生产 DB/名册写入、线上投影调用、账号/密码/技能/产品角色变更、部署、timer 或 Nginx 操作。** 本文不以此前运行回执冒充当前状态；正式旧 SSE 排空待办保持。

## 实现

实施提交：`35a18dc0a8fcc12dfe747cedb869d5f6a48c7a38`（5 个源码/测试文件）。本交接文档另作纯文档提交；源码合 main 不改变下述 HOLD。

1. `src/lib/enterprise/identity/contracts.ts` 在原四个 stable code 后追加 `rendering`；旧 code 与顺序保持，UI 去向未确认时保留 `ui`。
2. `managedGroups` / `reviewGroups` 的容量使用固定设计目录长度（当前 5），仍要求枚举有效、无重复，并保留职务约束。扩容量不是给任何实际人员添加管理或专业审核范围。
3. 人类标签：`ecommerce-senior` → 电商设计组，`ecommerce-production` → 美工组，新增 `rendering` → 渲染组。`packaging`、`ui`、运营、管理原标签不变。
4. 既有 `IdentityManager` 从同一 `GROUPS` / `DESIGN_GROUPS` / `groupLabels` 派生归属及管理/审核选择器，无新增平行目录或成员迁移。
5. 资格规则不变：组织归属不生成 `skills`，管理范围不生成 `reviewGroups` 或 `reviewer`；`canTakeDesignTasks`、grade、每日容量与角色依然分别校验。普通主管不会因此获得中央身份管理权限。
6. **冻结历史 202 人 provision 的原四组授权模板**：旧脚本曾用当前 `DESIGN_GROUPS` 构造所有主管范围；直接扩目录会令未来重跑旧批准计划时误加 rendering。现在由 `APPROVED_ROSTER_DESIGN_GROUPS` 保存当时四组，保留原批准名单约束，不把扩目录当作新授权。本轮不运行该 CLI，也不把它当作新的人员迁移工具。
7. 不更改投影实现、字段或 schemaVersion；协议仍为 1，旧四类组织资料仍可解析。只有未来经授权的普通组织事务提交新值后，才可能产生实际 rendering 投影。

## 孙疆业务确认与未来 before / after（未执行）

用户经消费 owner 转达确认“渲染是孙疆、”；最新收窄说明优先：只确认渲染主管组织分工，不确认专业签审资格。其他渲染人员未知；UI 去向待确认。

| 字段 | before 来源/值 | 拟 after（消费与中央兼容门禁通过后另行普通维护） |
|---|---|---|
| 人员绑定 | canonical email、subjectId、组织 version、实际 homeGroup 尚未由中央读回，UNKNOWN | 精确匹配既有中央身份，不新建/重绑、不猜邮箱 |
| title | 消费 owner 报告 `design_supervisor`，提交前再核当前版本 | 保持原 title |
| homeGroup | UNKNOWN，未来按中央读回 | `rendering` |
| managedGroups | 消费 owner 报告原四组；未来按中央读回 | 原集合保留，显式去重追加 `rendering`，不撤销共同管理 |
| reviewGroups | 消费 owner 报告 `[]`，未来按中央读回 | **原样保持**，不追加 rendering |
| skills | 消费 owner 报告 `[]`，未来按中央读回 | **原样保持**，不推断“建模渲染” |
| product roles / canTakeDesignTasks / grade / dailyCapacity | 未来按中央版本读回 | 全部保持；不增加 reviewer 或其他能力 |
| 原生账号/密码、企业/人员/team ID、其他人员 scopes | 既有值 | 全部保持 |

这张表是待审普通变更方案，不是迁移数据、可执行 plan 或已提交回执。确认后的写入必须使用最新 expectedVersion、正常企业 owner/有权 administrator 和审计原因；仅变归属/managedGroups 时省略可选 productConfiguration，并读回 roles/skills/reviewGroups 确认保持。

## 启用门禁（必须依序）

1. 消费新 Web **以及完整 CLI** 接受 `rendering`、五项管理/审核范围，并继续接受旧四类及 schemaVersion 1。
2. 消费新 Web 实际上线、**周期任务实际运行镜像已切换到新完整 CLI**，真实周期链回执通过。镜像只构建完成不算过门禁。
3. 另行授权中央固定版本蓝绿发布；保留密钥、名册和历史生命周期待办，三锁、自然排空、监督闭窗照常。本源码合 main 不授权本步。
4. 正常中央目录精确读回孙疆既有身份、全部 before 字段与 version，业务确认具体变更；只对已确认目标执行普通组织事务。其他名单与 UI 去向未知时保持不动。
5. 验证新投影、消费实际 apply/ACK 和人员字段保持；旧完整 CLI 未退役前不得开始推 rendering。

**当前状态：SOURCE_READY / CENTRAL_DEPLOY_HOLD / LIVE_ORGANIZATION_WRITE_HOLD。** 不通过改消费缓存、绕过旧 CLI 校验、重跑原 202 名册或直接 SQL 来跳过门禁。

## 集中验证记录

- 真实旧契约副本：`rendering` 设计师被拒，`RENDERING_GROUP_REJECTED` / exit 1（预期基线）。
- `node_modules/.bin/tsx scripts/verify-central-rendering-groups.ts`：`CENTRAL_RENDERING_GROUPS_PASS checks=23 live_writes=0 deployment=HOLD` / exit 0。包含旧四类、rendering 空技能、五管理/审核范围显式校验、重复/未知拒绝、职务角色边界、运营不变、历史名册冻结及 schemaVersion 1。
- `node_modules/.bin/tsx scripts/verify-central-roster-identity.ts`：原 7 项身份匹配回归通过 / exit 0。
- `node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --types node scripts/verify-central-rendering-groups.ts`：定向类型检查 exit 0。
- 独立本机空数据库 `NAUMI_VERIFY_ISOLATED_DB=1`、loopback 随机端口、专用本轮 PostgreSQL16 容器，运行 `tsx --conditions react-server scripts/verify-central-identity.ts`：`CENTRAL_IDENTITY_PASS checks=15 live_writes=0 provider_calls=0` / exit 0。这里确有隔离 fixture 写入及模拟投影，不是线上写入/投影。新增验证 rendering v1 投影保留 subject/账号/产品 grant/空 skills，及五管理范围不授中央身份管理或专业 reviewer；原权限/CSRF/审计/幂等/撤销回归保留。fixture 已 `docker stop --timeout -1` 优雅停止，restart=no、OOM=false。
- `npm run build:identity`：`IDENTITY_PROVISION_BUNDLE_CREATED` / exit 0。仅本地完整 provision CLI 源码打包校验，产物移至 `E:/tmp/central-rendering-groups-20261124`，不是可发布固定镜像或线上候选。
- `node E:/tmp/central-rendering-groups-20261124/probe.cjs .../MODIFIED_FILE.ts`：同一 rendering+空技能输入 `RENDERING_GROUP_ACCEPTED` / exit 0。原源码 hash 已保存。
- executable `ROLLBACK.sh` 只允许命名的另一份 `ROLLBACK_TEST.ts`，hash-guard 恢复后 `SOURCE_COPY_RESTORED_MODIFIED_AND_LIVE_UNCHANGED` / exit 0；再跑同 probe 恢复 `RENDERING_GROUP_REJECTED` / exit 1。修改制品及任务源码保留新行为；无生产/数据回滚。
- 四份实际重开制品位于 `E:/tmp/central-rendering-groups-20261124/{MODIFIED_FILE.ts,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`；原始哈希、精确命令/输入/字面输出/exit 和隔离 PG 完整记录一并保留。
- 开工及提交前刷新 main，基线均 `71ed16b1c7bb24831abef154ec626e00422ecd62`；直连 GitHub TLS 握手失败后通过既有本地回环代理按原证书校验成功刷新，没有修改全局 Git 配置或关闭 TLS 验证。
- 本轮功能模块计数 1；成功发布/服务器维护计数不增加。远端同步/主线整合结果由随后的 Git 文档提交与交付回执记录。
- 不运行全站 Next 构建、生产账号流、远端投影或大范围业务 125/264 测试。
