# 普通用户页面与功能权限

## 范围与实现

- 本轮只控制普通用户，不添加后台子管理员角色；配置入口 `/admin/feature-access`，复用既有管理员二次密码鉴权。
- 权限目录取自 `tool-meta`，覆盖工作台、工具中心、画布、作品、模板、Agent、团队页面、ComfyUI 与全部工作台工具。按账号保存，可默认开放或自定义（支持全部关闭）。未配置账号保留原行为。
- Node middleware 在页面/API分发前读取真实登录身份及当前数据库权限。不信任请求中的邮箱、角色、来源标记、路径头或模型输出。静态资源和基础账号/积分接口不受功能门禁影响。
- `/api/account` 未授权作品/画布时仅保留账号数据，不返回作品列表。原有资源所有权、团队入口、账户封禁/到期及媒体鉴权不变。该模块不是团队内容分享/资源级ACL。
- `app_feature_access` 持久化权限；事务内用户行锁、版本冲突409、请求UUID幂等与审计表记录前后变化。保存不触碰积分、密码、作品、团队表。
- 导航、工具卡片、工作台Agent输入/模板/最近作品、画布Agent入口使用同一权限目录。浏览器按账号隔离，切账号丢弃旧权限，聚焦和30秒刷新；服务端每次请求读取，无跨请求权限缓存。
- Agent新回合、计费预检前及工具执行前检查当前权限。已经接收/扣费的后台任务继续完成；只有既有Worker固定路由及签名秘密可走恢复通道。保存权限不取消已运行任务、不退款、不删除成果。
- 共享生图原语供AI生图/批量/裂变/融图复用，因此拥有其中任一能力可调用 `/api/generate-image`；画布专用图片任务额外要求画布与AI生图。页面入口权限与底层共享原语不同，不根据客户端伪造origin授予权限。Agent另按实际工具名称检查。
- Agent和模板原来重定向工作台，本轮保留独立可用入口，避免开放Agent/模板但关闭工作台时循环拒绝。

## 验证与状态

- 开工main基线：`ee351d92598c03facc18f2145adde015d602217b`；独立分支 `codex/user-feature-access-20261013`，共享checkout未切换/修改。
- 基线管理员鉴权回归通过。模块集中验证脚本 `scripts/verify-feature-access.ts` 覆盖默认兼容、空权限、管理员二次密码、CSRF、页面/接口直访、编码路径、伪造header、Agent工具绕行、冲突/重试、重启、审计、账号积分不变和Worker恢复。测试用独立本地Postgres，无供应商消费。
- 本地真实HTTP与1440px/390px浏览器验收通过：后台勾选保存、菜单/页脚/工具卡过滤、拒绝页面跳转、受限API与伪造middleware header返回403、聚焦撤权、无水平溢出与页面异常。全部测试无供应商消费。
- 第一轮UI发现页脚仍有受限入口、Next rewrite覆盖403，已分别统一过滤页脚与改为307跳转拒绝页。API保留403。
- 集中回归发现增加异步授权后中止窗口可能重启待执行回合；用promptGeneration封闭取消竞态，原画布Agent取消/恢复/计费回归通过。ACL扩展DDL放入核心schema初始化，避免工具执行事务内延迟创建外键。
- 旧网络/工具覆盖fixture原来透传假Cookie，本轮改为隔离DB真实签名身份；素材fixture提供独立本地媒体，继续验证重定向、SSRF、参数与适配器，无线上供应商调用。
- 最终正式构建通过（Next15.5.27/React19.3.0）；Node middleware的functions配置确认runtime为nodejs，原有lint警告保持。正式构建运行13080，真实浏览器1440/390px后台保存、菜单过滤、接口403、直接页面307、聚焦撤权及独立Agent/模板/单工具权限验收通过，客户端异常与横向溢出均为0。截图已重新检查为浅色布局。
- 完整Agent Harness 14模块全部exit0，包含画布取消/恢复、技能、工具覆盖、计费、SSRF与会话隔离；管理员与团队生命周期回归exit0。使用独立本地Postgres和fixture供应商，真实供应商消费0。
- 最终复核补齐画布text-edit服务端生图权限，以及无权限时隐藏图片/空节点生成Dock、文字转图片弹层、在线改字/扩图/标注入口、右键生成入口及Agent小球。OCR识别、文字生成与本地编辑属于画布现有能力；此轮不单独拆分这些画布子权限。
- 当前尚未发布103，不连接废弃120/旧101/香港。原有自动发布授权不覆盖最新连续可用门槛；React19任务的“当前无人使用、直接上线”仅该轮例外。本轮完成代码与本地正式构建验收，交由符合发布手册的候选流程上线，不使用旧直接停App流程。
- 没有功能权限组/批量分配/后台角色分工，留待下一迭代。开工后完成1个功能模块，整合远端main后计数归零；同步记录见下节。

## Git与独立副本回滚证据

- 开工基线 `ee351d92598c03facc18f2145adde015d602217b`，合并前刷新远端main到 `3f1aa4a158cfbf47cdfef5e663bc2200ce6fa61e`（React19实际发布交接）。任务选择性提交后普通合并，无共享checkout切分支或覆盖。其他尚未合入分支为视频/生图设计、独立UI预览及四条历史回滚，本轮不混入权限实现，不执行main/服务器整合发布。
- 证据目录：`C:/Users/13357/.codex/worktrees/user-feature-access-20261013/naumi/output/user-feature-access`。
- 四件套：`MODIFIED_FILE.ts`（已修改middleware副本）、`DIFF_FILE.patch`（完整任务差异）、`VERIFICATION.txt`、可执行`ROLLBACK.sh`。manifest记录36个源码/测试文件前后SHA256，`originals`和`BASELINE_SOURCE.zip`保存原始字节。
- `python output/user-feature-access/verify-phase.py BASELINE`，输入独立旧代码副本与本地feature_rollback库、签名用户POST /api/retouch：`BASELINE=PASS ADMIN_ACCESS=PASS MIDDLEWARE=200`，exit0。
- `python output/user-feature-access/verify-phase.py MODIFIED`，输入同一独立副本加本任务代码、显式空权限用户：`MODIFIED=PASS FEATURE_ACCESS=PASS MIDDLEWARE=403`，exit0。
- `python output/user-feature-access/verify-phase.py ROLLBACK`，输入独立修改副本、原始hash清单：`ROLLBACK=PASS ADMIN_ACCESS=PASS MIDDLEWARE=200 HASHES=36 WORKTREE=MODIFIED DATABASE=UNCHANGED`，exit0。
- 回滚脚本预检所有任务文件hash，不覆盖其他修改，只恢复清单内文件或移除本任务新增文件；36项原始hash全部恢复，管理员鉴权保持，旧middleware行为回到200。本任务工作区源码仍是修改状态；数据库及权限/审计表不回灌。该源码副本演练不是线上旧镜像门禁回滚验收。

## 回滚与交接

- 新表为扩展DDL，代码回退不得回灌旧数据库或删除权限/审计记录。
- 旧镜像不识别权限，直接退旧版本会恢复受限能力。存在自定义权限时必须先保持支持门禁的网关/镜像或阻断相关业务入口，再退应用；不能以“页面不显示”替代接口拒绝。
- 发布仍遵守103连续可用发布手册。蓝绿/在途会话路由尚未工程化，现有直接重建不能当作本轮连续发布验收。

### 接手提示

```text
继续 codex/user-feature-access-20261013。先刷新main，保护其他agent现场。
读取本交接与 RELEASE_RUNBOOK，复核普通用户权限、管理员二次密码、Agent工具检查及媒体所有权。
使用隔离DB运行 verify-feature-access 与管理员/团队回归、页面/API/browser验证。
发布只针对103；旧版本回滚先保留功能门禁；不要回灌积分/作品数据库，不连接120。
```
