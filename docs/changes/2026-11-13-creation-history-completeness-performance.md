# 创作记录历史覆盖与首屏性能修复（2026-11-13）

## 问题与现场复现

用户反馈新版后台记录从几万条变成7000多条，且读取慢。本次核验的是47专属企业站的真实入口，
不是被专属站按规则关闭的 `/api/admin/creations`。

- 开发基线：`3ca18e7781e384b51138c0c413217edb6c7d2b86`，独立任务分支/worktree。
- 现场运行：`8019d68eef1ae4b841c666c9ddd3c546790c26a9`。
- `/api/enterprise/creations?view=unified&tenantId=...`：HTTP200，7408条，约4156ms；
  `period=all`，确非默认7天或某个账号筛选导致。
- 同一授权范围的旧历史端口实测仍有3万多条，约224ms；旧端口统计原始父/子执行，不能
  与归并后的根创作直接等同。但这不解释本次全部差额，确有历史被误排除。

同一只读数据库快照（北京时间12:42:21）：

| 口径 | 数量 |
| --- | ---: |
| 原始图片/编辑/视频执行记录 | 36726 |
| 原统一列表根创作 | 7408 |
| 修正后的根创作 | 19882 |
| 补回的历史根创作 | 12474 |
| 修正后已确认企业根创作 | 756 |
| 修正后历史根创作 | 19126 |

这些是该时刻同一可见范围的数据，不是删除/回填或重放出来的新任务。后续正常创作会改变数量。

## 根因与责任

上次统一实现用“任何台账已有原来源”排除历史候选，但企业主列表只接受当前 tenant 的台账。
因此，历史任务已经写入个人台账时，会从历史候选消失，又进不了企业主列表。47存在大量这样的
旧记录。此为统一实现的覆盖缺陷，不应以父子去重解释掉。

性能问题在于列表请求先计算全部候选的递归账务、逐行历史账本聚合、状态汇总和成员排行，再分页。
实际记录浏览器不消费这些全局统计。现场旧查询11,107次逐行账本聚合，并有大量TOAST读取和临时写入。

## 模块与职责

- `creation-unified-query.ts`：在明确企业历史读取范围内保留个人台账来源；已确认其他企业来源仍排除。
  提供轻量键投影与选中页事实投影，复用同一筛选、同一全局排序及计数。
- `creations.ts`：新增 `listUnifiedCreationPage`。先选精简键和精确总数，仅为当前页读取实时状态、
  参数、缩略图、费用及必要诊断；不使用跨请求授权缓存。完整统计端口保持兼容。
- `creation-contracts.ts` / `creation-http.ts`：`view=unified&projection=list` 显式使用轻量列表契约
  `CreationListPage`，不包含未请求的summary/memberUsage；不伪造0或把未知费用改成0。
- `creation-history-link.ts` / `legacy-creations.ts`：通过原任务ID/原账号找回个人台账的真实事件、
  素材、参数、账务及分页。历史入口不剥离已确认的其他企业归属；没有现代台账的安装保留旧读路径。
- `CreationBrowser`：使用轻量投影，数量显示“次创作”；历史标签保留原始归属，不重建第二套列表。

### 公共接口、依赖、状态与授权

Route鉴权→企业实时层级授权→创作读模型→持有原事务的数据库查询。列表不穿透写入模块，
不改任务、账务、媒体或归属。个人历史的访问条件与旧已授权任务历史保持一致：当前可见成员、
精确来源任务和原账号；不扩展到任意个人文字/Agent台账或其他企业记录。

个人记录仍是 `scope_kind=personal, tenant_id=null`。恢复完整详情不是把旧记录重新归属企业。
直接canonical详情/媒体与旧历史深链均再次验证活跃成员权限；撤权后立即失效。企业输出继续过滤
executionPlans、技术信息和内部事件文案。根记录与父子执行继续区分，同一原始来源不重复列根。

无数据库回填、删除、全量物化视图、新服务或缓存失效系统；无新增生产索引/环境变量。

## 集中验证与证据层级

证据目录：`E:/Workspace/naumi/output/creation-history-completeness-20261113`。

### 真实47，只读验证

- 当前API复现：`python -X utf8 output/creation-history-completeness-20261113/api-enterprise.py`。
- 旧历史口径：`python -X utf8 output/creation-history-completeness-20261113/api-legacy.py`。
- 同快照对账：`python -X utf8 output/creation-history-completeness-20261113/run.py reconcile.py`。
- 原数据SQL对照：`python -X utf8 output/creation-history-completeness-20261113/run.py explain.py`。
  旧SQL约3889ms，新SQL约839ms；这是EXPLAIN ANALYZE样本，不是新版本公网API/SLO验收。
  新查询原数据总数及20行分页实际返回通过；应用尚未替换。
- 全程直接SQL为REPEATABLE READ READ ONLY，带超时。没有生成提交、配置修改、服务重启或任务重放。

### 独立本地PostgreSQL与组件

- `verify-creation-history-completeness.ts`：31项检查，包含真实鉴权Route、个人历史恢复、完整详情/
  事件分页/素材、原归属保留、企业安全投影、同账号其他企业拒绝、个人非历史文字拒绝、立即撤权、
  精确筛选/空页/稳定分页及轻量/完整投影一致性。36,700原任务+28,700台账样本：基线8700根，
  修正22700根，父子不重复；供应商调用0，原记录读时不变。另有前台账兼容分支检查使用I/O fixture。
- 既有 `verify-unified-creations.ts`：46项通过；reader/writer集成回归通过。
- 实际 `CreationBrowser` Chromium组件fixture：10项通过，确认请求projection=list，1440/390无溢出。
- 完整TypeScript与Next构建通过；已有lint warnings保留。界面fixture并非生产浏览器验收。

原reader首次运行缺测试进程SETTINGS_SECRET，前置失败记录保留。补齐独立fixture环境变量、使用新
测试数据库后回归通过；没有为通过测试放宽产品鉴权。原SQL大参数对账曾遇到系统argv大小上限，
已改标准输入传递SQL，保留初始记录；未改变查询授权或数据库只读属性。

## 回滚、Git与未完成项

保留本切片原始字节、SHA256及四件套：MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、
可执行ROLLBACK.sh。脚本核对全部修改哈希后仅恢复本切片；副本回滚后再次复现8700/22700基线遗漏。
修改包保持新状态。最终命令/输入/字面输出/退出码、Git SHA及重新打开核验见VERIFICATION.txt。

本轮交付到main，不替换47/103运行应用，不迁移历史归属。47上线后应核验实际企业管理记录接口：
新页面projection=list、实时精确总数、历史详情/媒体/撤权、首屏及筛选耗时；使用当时数据库数量，
不把本次快照数字硬编码为固定总数。不重放旧任务，不把只读SQL样本称为已上线加速。
