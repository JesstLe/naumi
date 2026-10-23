# G70：真名、花名与 Naumi 账号首次关联

## 目标和本轮结果

按用户填写的花名，在 47 的「天地合大健康」企业内查询真实账号，并直接保存到已有人员资料。本轮是本机人员归属关联，不发布或重启线上、不修改来源账号、不创建工作流权限。

2026-10-23 15:44:37 +08:00 的真实只读快照：195 个账号均可用且企业身份有效。58 个已填花名中 56 个唯一命中，2 个未命中。实际本机库保存 56 个来源账号对应，不是仅生成候选清单。

未命中项：陈加慧／杨过、付明明／壁君。另有此前未填花名的4人不在58份已填资料内，未猜测绑定。真实姓名、账号清单与完整证据仅保存在忽略目录，不写入 Git。

## 关联键与来源站

`person_profiles.person_id → (source_instance, source_enterprise, source_subject)`。

- `person_id` 沿用现有固定 ID，不重新导入人员。
- 花名只用于企业内精确查找，不模糊匹配，不跨企业搜同名绑定。
- `source_subject` 使用真实 `app_users.email` 账号键。当前源库没有额外 UUID 用户主键，不伪造 ID。
- `docs/enterprise/config/source47-identity.json` 明确登记本地逻辑来源键 `naumi47` 与 HTTPS 来源站/企业 ID 的关系。
- 线上 `NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID` 当前未配置。本地键不是“线上已配置”的证据；后续启用连接器时须核对同一登记，不能另起一个来源键使既有关系失联。
- 工作流身份、账号和权限未建立，因此 PeopleStore 的登录状态仍为 `unverified`。已关联人员不等于通过 SSO 登录验收。

来源读取检查了账号封禁/期限、企业启用，以及新版 `membership_status`/`membership_expires_at`；旧版只检查账号可用性的目录不足以代表新版企业成员有效性。读取采用有限时 `REPEATABLE READ READ ONLY` 事务，结束 ROLLBACK，来源写入为0。仅提取必要身份字段，不读密码、余额或作品正文。读取前后核对 Web 的容器 ID、StartedAt 不变。

## 最小代码修改

`PeopleStore.candidate()` 仅将“旧 source 三列全 NULL → 完整来源账号”视为首次归属补充，不要求先删原表人员关系。已有非空账号的改绑或清空仍按原规则拒绝。复用既有批量预览/确认哈希、版本检查、企业锁、账号唯一约束、幂等命令和同事务审计；无需新增表或身份平台。

`tools/link-source-people.ts` 提供本机操作命令：

```powershell
cd services/enterprise-workflow
node --import tsx tools/link-source-people.ts preview CONFIG DIRECTORY REGISTRY PLAN
node --import tsx tools/link-source-people.ts apply CONFIG DIRECTORY REGISTRY PLAN
# 仅对已经验证的本次首次绑定执行显式逆操作；普通UI仍禁止直接清空被引用账号。
node --import tsx tools/link-source-people.ts rollback CONFIG DIRECTORY REGISTRY PLAN
```

输入：受保护的本机连接配置、新鲜只读目录、来源登记及计划路径。目录正文 SHA、时间、企业、来源键和精确花名匹配全部核对。Docker 重启造成旧配置端口过期时，读取配置内指定容器的 loopback 映射，不修改原连接配置。计划和结果含人员信息，只保存在受保护目录。

预览、应用和回滚均核对原行/附件/人员关系/账号/团队/权限/订单的摘要；应用后再读真实 profile。回滚核对原命令审计、当前版本和完整来源键，全部恢复 NULL 时递增版本并追加审计，不回灌整个旧库，也不删除历史审计。

## 验收与真实本机状态

- 基线复现：已有多人原表关系的人员首次绑定返回 `UNBIND_BEFORE_ACCOUNT_CHANGE`。
- 修改后20项首次绑定检查和33项多人关系回归通过；保留非空改绑/清空拒绝、重复账号、旧版本、越权、审计失败事务回滚、命令回放等行为。
- 原人员批量导入回归 `peopleRosterChecks` 也通过：解析、同名分离、账号去重、混合更新、审计失败回滚、撤权预览、非空绑定保护和权限保持。额外只读代码审查未发现可证实的重要问题。
- TypeScript 检查退出0。
- 原源码备份和 SHA256 保留，独立源码副本实际执行 `ROLLBACK.sh`，原哈希和旧拒绝行为恢复；交付源码保持新版。
- 完整真实本机备份实际恢复到独立数据库副本：56人应用成功、重复命令回放、显式撤销成功，恢复0来源绑定/58人员，关联/权限摘要保持。首次撤销校验曾因 JSONB 对象键序误判；已改为逐字段比较并复验成功。
- 本机真实应用：58人员、56来源账号对应、2未命中；676关联字段/677成员关系保持；364原行/292附件保持；工作流账号/团队/source identities/正式订单仍为0；本次权限写入0。
- 旧原表、填写 Excel、personId、人员真名花名和启用状态均未修改。保留前后完整备份、计划、审计和重复回放证据。

私有证据目录：`E:/Workspace/naumi/output/enterprise-source-link-g70-20261023/`。包括 `人员账号对应结果.md`、`RESULT.json`、前后数据库备份、只读快照、`MODIFIED_FILE.ts`、`DIFF_FILE.patch`、`VERIFICATION.txt` 和可执行 `ROLLBACK.sh`。

## 尚未完成及下一步

本轮没有把生成记录、提示词和积分日志同步进工作流，也没有启用员工登录、团队分权或企业线上独立服务。下一模块应沿现有来源适配器，以本次稳定账号键串联生成记录和积分账务，并按企业范围核对归属；不能只凭花名关联日志或从账号目录推出历史作品归属。

## Git 同步记录

干净任务 worktree 从 `3f041b926c2726bdd17f73806555b2b9f89b0d7b` 快进至 `origin/main=d7461ee734f886bbaa2649c92e4a4fa1f0de1992` 后开发，未触共享根目录未提交工作。此次完成1个功能模块；后续累计3模块再按协作规则刷新整合，提交前仍复核远端。

提交前刷新发现远端4个供应商历史基准测试增量，至 `cd64d1ffd4eda66afcbe7817fc9016203c92be4a`；这些变更不触本模块，本任务提交后正常合并保留。
