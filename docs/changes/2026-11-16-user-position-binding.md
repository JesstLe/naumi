# 用户岗位绑定与筛选

## 用户目标与边界

后台已有花名账号；按确认后的扁平岗位绑定并筛选：电商设计-资深、电商设计-美工、包装设计。确认名单去重后为48人（13/28/7），洛灵与赤羽分开。真实名单和执行计划保存在本地忽略的证据目录，不提交花名、账号或凭据。

这是平台 BI 的管理标签，**不是企业组织岗位ID或权限角色**，不改变团队、组织、权限、积分和已接受的生成任务。dedicated 企业站既有平台后台关闭策略保留；目标实例尚待用户确认，不能把平台开发当成该实例已接通。

## 模块与职责

- `src/lib/bi/positions.ts`：前后端唯一岗位枚举；空字符串表示未分组，筛选参数`unassigned`单独表示只查未分组。
- `contracts.ts` / `repository.ts`：解析筛选，数据库计数与分页使用相同条件；岗位参数只影响用户视图。
- `user-management.ts`：资料编辑可选岗位（省略保留），独立`position`命令只写岗位；复用既有事务、管理版本CAS、审计、操作指纹和同ID重放。
- `persistence/schema.ts`：增量增加`app_users.position text NOT NULL DEFAULT ''`，原行和历史字段不搬迁。
- `dashboard.tsx` / `user-manager.tsx`：岗位列、筛选、URL恢复及资料编辑选择；沿用浅色布局和原错误处理。
- `position-binding.ts`：精确花名匹配，重复名单去重，冲突岗位拒绝、缺失与重名分开，不猜测邮箱。
- `scripts/ops/bind-user-positions.ts`：只读预览→保存计划→按原操作ID执行管理命令→回读当前姓名和岗位。后续管理员改岗时，旧命令仅返回历史回执，报告MISMATCH、exit 2，不覆盖新修改。

公共接口和依赖：页面→现有管理员API→管理用例→事务/数据库；CLI复用同一管理用例，不直改用户表；岗位模块不依赖UI，管理标签不反向进入企业权限模块。

## 运行方式

环境由操作者从受保护配置注入`DATABASE_URL`、`SETTINGS_SECRET`，不要写进命令日志。预览不建表、不创建账号、不初始化业务配置；目标须已包含此增量字段。

```powershell
node --conditions=react-server --import tsx scripts/ops/bind-user-positions.ts --roster ROSTER.json --out PLAN.json
node --conditions=react-server --import tsx scripts/ops/bind-user-positions.ts --apply --plan PLAN.json --actor ADMIN_ACCOUNT
```

名单格式为`[{"name":"花名","position":"包装设计"}]`。预览文件使用排他创建，防止覆盖原操作编号。缺失/重名时exit 2，先核对原账号。应用要求实际有效平台管理员；每账号原子提交，发生中断保留已完成回执，重跑原计划，不重建ID。`already`与重放条目同样回读；VERIFIED是该次读取时点的快照，不表示永久状态。

## 基线与验收

起点`9aaafd942ef503bff4eba3e1a106d761ba590892`。共享根checkout保持原分支和全部未提交改动，已有演示站与公告不改动。当前任务在独立`codex/user-position-binding-20261116`工作树续做。

原管理回归在新隔离库exit 0；上轮共用fixture库中已设后台访问密码，原生用户cookie不足以通过后台鉴权，导致404而非预期403；保留失败历史，不修改原鉴权断言。

集中覆盖：全部原账户管理/权限/账务边界，岗位设置/保留/清空/非法值，三组与未分组、计数和分页，48人结构、精确匹配、缺失、重名、dry-run、审计、同ID重放、CAS，以及旧回执与当前岗位漂移的区分。测试记录在`output/user-position-20261116/`，原测试入口`verify-bi-management.ts`扩展，不新建重复框架；`verify-private-bi.ts`覆盖读取、CSV与原数据视图。

独立审查发现“历史回执冒充当前状态”的问题，已加入回读和漂移回归。真实Next页面与前后视觉、命令退出码、源文件哈希、源码副本回滚证据以同目录`VERIFICATION.txt`最终记录为准。

## 回滚与未完成

源码回滚仅在独立副本演练，按修改前字节恢复并重跑原行为。线上回退程序保留增量列及岗位值，不删除业务数据；若需撤销实际绑定，用审计before值+当前版本创建新position命令，不复用旧ID逆向写、不覆盖此后的人工改岗。

真实48个部门账号尚未读回/绑定，目标后台实例尚待确认；没有生产配置变更、付费调用或部署。Git整合不代表上线。
