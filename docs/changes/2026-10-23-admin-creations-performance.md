# 创作记录主页面查询性能

## 范围与基线

- 用户要求继续优化左侧「创作记录」`/admin/creations`，不是 BI 对话列表。
- 工作树 `E:/Workspace/naumi-admin-creations-performance-20261023`，分支 `codex/admin-creations-performance-20261023`。
- 起点 `9ae4edff57efdaf34d1418ae58fcc12e1c4c1582`，开工刷新 origin/main。
- 产品代码只改 `src/lib/saas/creations.ts`；不动 writer、schema、状态写入、计费、企业授权、UI 或共享 checkout 中 18 个未提交文件。
- 历史归属未确认入口继续走 `legacy-creations.ts` 和已有 BI 优化，本轮没有改其契约。

## 实测定位

47 只读盘点：当次 1697 条创作、919 条根记录、9971 条关联、7978 条素材，具备可选视频工作流表。记录会随真实用户操作增长，后续测量不假装同一静态数据集。

旧 `listCreations` 针对总数、列表、汇总、排行执行四条 SQL。每条都包裹完整 recordSelect，汇总/排行重复逐根递归创作树和账务去重，列表在排序分页前执行大量相同关联。旧 count 的无用投影可被 PG 裁剪，不将 count 错记为全部账务计算。

7 天筛选、20 条首页，首次只读 SQL 采样：count 51.332ms、page 2410.172ms、aggregate 1702.981ms、memberUsage 1429.347ms。第二次同一只读事务重测：58.323 / 2310.881 / 1707.253 / 1050.202ms。

## 实现

1. `recordSelect(tx, includeBilling=true)` 保留详情原默认路径；列表只取原有实时状态，不做逐根账务聚合。
2. `status_records AS MATERIALIZED` 保存权限/日期/关键词/账号/来源/状态过滤后的轻量根记录。状态优先级保持：工作流节点 → 图像 result/status → 视频 → 创作记录。
3. `families` 一次批量递归每条根的后代，始终要求相同 actor 与 tenant（含 null 语义）。不把别的企业/账号后代计入本根。
4. `operations` 按 `root_id + operation` 去重，同一笔账务关联根与多个孩子只算一次。只有所有关联操作均 settled/released 才显示实扣；未结保持 null，无账务且显式 no-charge 才为 0。
5. `creation_facts` 只存 ID、账号、时间、实时状态、准确实扣，供总数、汇总、成员排行和分页复用。一次数据 SQL 返回完整页面契约，不把权限检查/事务初始化算成零查询。
6. 当前页再回表取标题所需 request_snapshot 和缩略图；不把全部 parameters/model/request JSON 存入全量统计物化集。
7. 保留总数、全结果汇总/Top10、原排序和空页契约。企业范围仍先由原 enterpriseRead 事务计算，未替换为历史或跨用户缓存。

## 验收进度

- 新增 `scripts/verify-creations-query-performance.ts`，真实本机独立 PG16：600 根、1200 子记录及跨租户/账号、深层后代等专门样本；随机 schema 结束即清理。
- 最终 150 组合、1804 条记录响应等价：平台/企业老板/经理，全部状态、关键词转义、成员/来源/企业/日期筛选、分页/深页/空页；真实角色拒绝、root+child 重复账务去重、可选工作流表不存在/存在及节点状态变化；另有同账号不同租户子记录、不同账号子记录、孙级后代及混合 settled/reserved/released 状态切换，确认未知保持 null、去重和实扣准确。
- 最终集中样本中位数：列表2510.91→22.13ms，深页2975.28→28.56ms，失败筛选2717.21→23.06ms，关键词205.00→21.90ms，企业417.31→18.27ms（baseline/modified交替5轮）。逐轮原始时间和 EXPLAIN 均保留，非延迟保证。
- 现场新批量 SQL 首测224.624ms、复测155.608ms。仅 SQL，不冒称公网 HTTP 或上线用户体验已验收。
- 现场同一只读快照对 939 个根的总数、全量汇总、成员排行和当前页（含标题快照/状态/计费/缩略图字段）比较：`LIVE_FULL_EQUIVALENCE|939|939|t`，未导出用户内容。
- 既有 `verify-saas-creations.ts`：真实鉴权、跨企业、离职/暂停、当前下属、脱敏、false/0、未知null、计费去重、后代素材、分页、视频Range、媒体撤权与恢复证据全部 PASS，供应商调用0。
- 新脚本首次把无管理/记录权限普通员工当作合法读者，原代码即拒绝；已将其改为明确的403拒绝断言。首次既有测试缺少 SETTINGS_SECRET，使用显式独立fixture secret后通过；不修改业务保护逻辑。
- 完整 Next15.5.27 production build exit0（既有 lint warnings 保留），最终 TypeScript exit0。
- 附加 `verify-saas-creation-writers.ts` 在 cancelImagegenBatch 触发 `IMAGEGEN_SCOPE_CONFLICT`/409，exit1；在纯基线9ae4edff的独立detached worktree与全新隔离库复跑得到完全相同失败，exit1。本轮没有修改写入/取消逻辑，不把这项已有失败记为PASS或扩大成整套回归全绿。
- 原 SHA256 `72ee58abc61a2bb239453655d4d337fa3065b83b2ff475931e9f518823b8237c`；修改 SHA256 `e69456a13a5aa0c331f9f35e8d32b428f37c967080f03998afe74a0e72bb1662`。独立修改副本执行可执行ROLLBACK.sh恢复原hash，再跑150组/1804记录全部PASS，列表恢复四次查询/约2.67秒原行为；任务源码和MODIFIED_FILE.ts保留修改态。
- 修改版首页实际计划 `Recursive Union` 一次遍历1801个可达记录，分页回表20条；不再对每条根分别递归。没有新增索引或在线DDL。

## 发布与回滚

- 已向现有47线程通知文件范围，无并行候选/构建/部署锁/切流/重启/索引或数据修改。
- 原字节、修改副本、diff、可执行回滚脚本、逐条命令输入/结果放在 `E:/Workspace/naumi/output/admin-creations-performance-20261023/`；回滚只恢复源码副本，不回灌数据库，不重放付费任务。
- 完成后推固定任务 SHA 给现有47发布负责人整合，按既有三锁蓝绿流程验收；代码提交不等于上线。
- 本轮功能模块计数1；开工和提交前刷新main均为9ae4edff，无新增main业务差异，保留所有他人工作树改动。最终提交SHA及远端回执记录在VERIFICATION中。
