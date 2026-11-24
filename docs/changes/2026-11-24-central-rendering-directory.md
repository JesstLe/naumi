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

## 2026-11-24 中央发布尝试与中断恢复（覆盖上文源码阶段状态）

### 已确认业务矩阵

用户最终明确“暂时只由孙疆管理渲染组”。仅孙疆拟 `homeGroup=rendering`、原四项 managedGroups 追加 rendering；玄策/尺素及其余人员 managed/review/skills 全部保持，UI 继续保留原组。孙疆的 title、reviewGroups、skills、产品 roles、canTakeDesignTasks、grade、capacity、账号及密码均保持。**本轮尚未提交这笔普通组织事务**，没有重跑 202 人 provision、创建/重绑人员或旋转密钥。

### 已完成的固定制品与旁路

- 消费 owner 的新 Web 和完整周期 CLI 已通过真实运行门禁，私有 `CONSUMER_COMPATIBLE_READY.json` 已独立读回。正式仍 13154、QA 13155；原消费 13152/13153 的 SSE 排空债务保留。
- 中央应用固定 source `6541cf69282c6ded3e82fb5a077bd374ab1a8c2f` / buildVersion `1795504527`。本机完整 Next 编译、类型、Web/Worker/identity bundle 构建通过；6793 个归档源码输入逐字节一致。复用的是原固定媒体运行时文件，不是旧应用程序。
- 实际本机及 47 OCI index Image ID `sha256:890e937e06d9a0d73949ccab9bfdc1dc2cdbf1ed4abba2572cd22e2743dd7bda`；linux/amd64 manifest `373547f97a4c26b846273fd74085d2ef4d6725ffff011367e9c5e3511587a07e`；config `fc1d19a0aefd9f8da4cf416ce115679c6067f4bc1538e00d8e4f0f0ff5a7d1f5`。三者是内容绑定的不同层级，不声称它们字面相等。
- 新中央 Web `naumi47-web-central-rendering-20261124-r1` / 13146 和同镜像 Worker 已创建；Web admission=draining、Worker paused，未接公网。候选 discovery/JWKS/私有认证 projection 均 200、成员 204、原 signing kid/authority 保持；10 项候选入口与企业管理读取通过。
- 新完整数据库备份 954503969 B，SHA `74959c6b36f74f2419587bb14c94bccc834bd47719303bf9f5f70d1421f25518`；真实 pg_restore --list 与完整 SHA 读回通过，未执行数据库恢复。
- 发布前以全层不计复用、等量导入临时、归档解包、1.25 GiB 备份上界、静态 union 与业务增长核预算，门槛 15044118118 B；持锁实测 15464808448 B 后才导入。

### 保留的真实失败与修复

1. 原镜像 verifier 漏掉 Docker Desktop/containerd 的嵌套 OCI index，实际 docker load 已成功但旧 verifier 拒绝 index890e，操作记 UNKNOWN。没有重复 load 或替换 stage ID 凑值；在原 journal 中逐 descriptor 校验 SHA/size、平台、manifest 30 层集合，继续调用原 source/version/labels/platform 验证，并比对全部 RootFS diff_ids、完整 Image Env/Labels 与归档 config。原 UNKNOWN 通过这份实际证明 reconcile 为 ACKNOWLEDGED，原失败文件保留。
2. 原未接流候选第一次 instrumentation 启动遇 `40P01`（enterprise members/roles DDL 死锁），保留 500/超时；已证零活动、零连接、无 Nginx 引用后，仅同一个离线候选自然停止并重新启动。原 start intent O_EXCL 拒绝的尝试也保留，确认未执行 docker start 后，使用独立明确 intent 记录重试；没有重启线上槽。
3. 旧 4 秒不可变任务快照查询失败保留；集中只读重试的 statement timeout 12 秒，8 类账本/任务原始绑定覆盖通过。没有业务写或任务重放。
4. 连续探针初始 4 秒断言早于第三个串行请求完成，实际前三项均 200；后续长期探针确有 8 秒超时，不能记成 0 error。发布中断恢复时已通过本任务自己的 stop flag 自然退出探针，不对用户业务发进程信号。
5. `10-cutover` 最终真实退出 `CUTOVER_HAS_UNDRAINED_TASKS`，未执行 Nginx 切换。其后 provider 中断，原 publisher 08:19:24Z 空闲退出并释放四锁；旧 Worker 和 timer 当时仍处于发布排空/暂停状态。09:21Z 恢复时没有第二 holder/抢占：先确认原 PID 已退出、原 gateway/线上 pair 未变、unknownTicks=0，再用普通控制 resume 旧 Worker、恢复 timer。失败的恢复目录初始化尝试保留；实际恢复及后续 installed systemd postflight 均有独立回执。

### 当前真实状态：兼容与单人维护仍未上线

- canonical revision **2864**，原线上 Web/Worker 仍 source `7aece11f282d743542e3c468374a7780954158c7`、Image `35a8ace40abc8f74ac41432d0901c24a6c8b8991789e4e30cfc88cc866f59f31`。
- `runtimeRecovery.recoverySupervisionStatus=TIMER_ACTIVE_SERVICE_POSTFLIGHT_VERIFIED`；实际 installed oneshot 17:28:30–17:28:33 CST，Result=success / ExecMainStatus=0 / MainPID=0，五 readiness 全 true，旧 Worker 未暂停、unresolvedTicks=0。恢复事务已退出释放锁。
- 完整 Nginx stdout 仍 `d7cd4700a02f38a894f2d811975c5a0c0c399d326402b33a6a95b2e1c6ef6b14`，本轮未切流；消费/yvtang 文件、worker.conf、账号、权限与数据库业务数据未由中央改动。
- 新 release phase `READY_WITH_NATURAL_TASK_DRAIN_PENDING`。只读采样确认旧 fence 是当天新提交的真实任务及活动原 boot/claim，不是可按过期时间清除的“垃圾”。不取消、改写、伪造完成或重放付费任务。
- 新资源门禁再次失败：09:33:25Z 精确回收中央第六轮已确认退休的 2 个停止容器及 0ecca 镜像后，rootFree=9214500864 B，仍低于 10 GiB。既有历史 CLEANUP_PENDING / UNKNOWN、最近 5 轮、数据库、媒体与其他项对象保持；不因它们当前停止而删除。
- 前期只清过期 >7 天旧备份、已核定废弃传输包；每份都有原 SHA/age/无使用证明、更新备份可读性验证。所有清理净值是各自事务实测，不把它们相加冒充主机可用空间增长。

### 修复落地与后续门禁

- `scripts/github-release-manifest.py` 将选定 tag 的 config、唯一 linux/amd64 manifest、嵌套 OCI index 按原字节 SHA/size 绑定；保留原运行时 source/version/flavor/platform 校验。`verify-github-release.py` 的 14 项集中回归通过（含原 classic/containerd、嵌套链、篡改/错层/错平台/歧义/外来 tag/ID 拒绝）。这是发布工具修复，不是新应用镜像或本轮公网已发布。
- 真归档基线拒绝、修改接受、另一副本 hash-guard rollback 后再次拒绝均已运行；修改副本保持。四制品与逐字面命令/输出/exit 在 `E:/tmp/central-rendering-release-20261124/oci-verifier-evidence/`。
- 当前 pending 不是另一发布的空闲起点。继续前必须刷新主机空间及剩余峰值、真实任务归属/排空、canonical CAS、完整 Nginx 闭包和 main 的运行源码差异；复用同 release 的已验证候选，不叠第二候选、不恢复旧代码/旧库。
- 中央兼容实际接流并有真实 postflight 后，再刷新孙疆精确身份和 expectedVersion，以普通 mutateIdentity organization 事务仅改 home/managed（省略 productConfiguration），随后源读回、消费 apply/ACK 与字段摘要闭合。当前为 NOT_EXECUTED，不向消费发 CENTRAL_READY/FIX_LIVE。
- 本轮成功发布计数不增加；资源问题、旧任务与历史根状态保持为待办，未标 COMPLETE。

### 私有持久证据入口

47：`/opt/naumi-staging/evidence/release47-central-rendering-20261124-r1/`。重点是 `03a-import-reconciliation.json`、`04a-runtime-image-rootfs-binding.json`、`COMMAND_RESULT-10-cutover.json`、`interruption-recovery-continue1/TIMER_RESTORED.json`、`interruption-postflight/SUPERVISOR_POSTFLIGHT.json`。较早所有失败结果保留。`sun-organization.cjs` 尚未执行生产读/写；本机 7 项变更范围 guard 通过不当作线上普通维护成功。
