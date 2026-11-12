# 后台创作记录统一（2026-11-12）

## 目标与状态

将“生成记录”和“创作详情”统一为“创作记录”：一个完整列表，一份详情。
图片作品仍是独立素材库，不再承担创作日志职责。

- 开发基线：`5f30271170933737432e025904cdd2ef4c589b3e`（origin/main）。
- 开发分支：`codex/admin-creation-detail-parity-20261112`，独立 worktree。
- 本次交付是 main 代码整合，不发布 47 / 103，不修改在线并发或模型配置。
- 不迁移历史任务归属，不修写旧台账，不重新执行生成或扣款。

## 调研结论

两处已有共享 UI，但使用不同读模型：

1. 创作台账读取 `app_creation_records/events/assets/links`，覆盖完整过程和账务。
2. 历史生成读取原任务表，保留部分更完整的原始参数，但没有完整事件。
3. 截图对应记录的 `parameters_snapshot.state=not_recorded`，实际 values 已保存
   executionPlans；旧 UI 因状态直接隐藏内容。原任务 `payload.p` 还保存比例、
   分辨率、质量、数量和用户原文。
4. 参数计划 writer 原先没有同步 state，普通受理 writer 也未收集 `payload.p`
   的公开标量参数。仅改页面标签并不能解决这些缺项。

只读现场形状证据位于任务证据目录的 `LIVE_DETAIL_SHAPES.json`。不使用今天的
模型默认值补填历史请求，不按提示词、时间接近或现有成员关系猜测任务关联。

## 模块与职责

| 模块 | 本次职责 |
| --- | --- |
| `creations.ts` / `creation-unified-query.ts` | 新旧根记录的整体筛选、计数、排序与分页；台账详情和媒体读模型 |
| `creation-history-identity.ts` / `creation-history-link.ts` | 保持历史 ID 编码；按原来源 ID、原账号及明确 tenant 精确关联 |
| `legacy-creations.ts` / `legacy-creation-family.ts` | 未登记历史任务的原始事实、持久父子关系、结果与已确认费用；兼容旧链接 |
| `creation-parameters.ts` / `creation-request-evidence.ts` | 公开参数白名单；精确读取冻结请求；不导入 writer，不访问当前模型配置 |
| `creation-writer.ts` | 新受理保存原文及公开参数；写入参数计划时同步 recorded 状态 |
| `creation-http.ts` / enterprise history | 协议、鉴权及公开投影，复用授权事务 |
| `CreationBrowser` / enterprise console | 单一入口、统一详情、筛选、分页、响应式与历史书签 |

公共接口、依赖方向与归属：

- `listUnifiedCreations(reader, filters)` 是统一读接口；旧 `listCreations` 保持兼容。
- HTTP 通过 `view=unified` 显式采用新读模型；无日期默认全部日期。
- 新旧候选在同一授权事务与单条 SQL 内 UNION 后统一排序、计数和分页，
  不在前端拼接两份独立分页。
- 已登记的原任务和台账子任务不重复进入根列表；未登记的编排父子任务依照
  持久 `children.jobId` 折叠，读取子任务时再次核对原账号。
- 台账、任务、账务仍由原模块拥有；本次读模型不修改这些表的写入规则。
- 企业沿用当前层级可见成员授权；历史个人任务仍标记 `legacy_unconfirmed`，
  不重新声明为企业资产。平台指定 tenant 时只显示已确认 tenant 的台账。
- 旧历史 ID 能精确关联时复用台账的事件、素材、子任务、账务及各自分页。
  无关联时保留原记录，事件缺失仍是缺失，不生成虚假时间线。
- 企业不输出内部 executionPlans、技术详情和内部事件文案；权限撤销立即生效。
- 同一 billing operation 只统计一次；费用未知保留 null，不把未知当免费。
- 新增 helper 均为单向依赖，读模块不反向依赖 writer。

## UI 实现与迁移

- 企业后台原“生成记录 / 图片作品 / 创作详情”收敛为“创作记录 / 图片作品”。
- 平台创作记录不再提供“新创作 / 历史生成”分流。
- `recordView=tasks/confirmed` 旧书签统一落入记录视图，旧详情和媒体 URL 保留。
- 详情保留生成结果、原始输入、处理后输入、原始要求、公开参数、实际发送参数
  （平台）、执行事件、子任务和费用结算。
- 旧 parameters 状态与已有内容不一致时，读时显示已有事实；旧表不回写。
- 执行事件改为可换行纵向日志，避免横向条目文字重叠；手机端参数区不裁切模型名。
- 普通录入和前进后退继续复用 URL 查询状态；筛选改变时清除过期详情分页。

## 集中验证

证据根目录：`E:/Workspace/naumi/output/admin-creation-detail-parity-20261112`。
本地 PostgreSQL 为本任务独立 native fixture，监听 loopback 65457，非生产数据。

| 验证 | 命令 | 结果与层级 |
| --- | --- | --- |
| 基线复现 | `node --conditions=react-server --import tsx scripts/verify-unified-creations.ts --baseline` | 原实现隐藏已有参数、遗漏来源字段；真实 PG，exit 0 表示复现成功 |
| 统一链路 | `node --conditions=react-server --import tsx scripts/verify-unified-creations.ts` | 46 项真实 PG/鉴权 Route 检查；零供应商调用、旧快照零回写 |
| 原 reader | `node --conditions=react-server --import tsx scripts/verify-saas-creations.ts` | 企业范围、撤权、媒体、UUID、分页、账务与失败投影通过 |
| 原 writer | `node --conditions=react-server --import tsx scripts/verify-saas-creation-writers.ts` | writer/幂等/付费调用不重提等回归通过 |
| 素材去重 | `node --conditions=react-server --import tsx scripts/verify-creation-asset-view.ts --output-root <evidence>/asset-view --source-root <worktree>` | 16 项真实 PG 检查通过 |
| UI | `node scripts/verify-unified-creations-ui.mjs <evidence>/ui` | 10 项实际组件 Chromium 检查；1440/390、零 pageerror；I/O 和登录为 fixture |
| 类型 | `npx tsc --noEmit --pretty false` | exit 0 |
| 构建 | `npm run build` | 完整 Next 构建 exit 0；保留既有 lint warnings，不等同线上验收 |

统一链路还包括 2000 条原任务 + 1000 条台账（含 500 子任务）的全局分页与
状态计数样本，最终 1500 根记录。该样本不是生产容量证明。

原 reader 测试校正了 UTC 固定日期和过时的企业历史接口 400 预期；当前 main
已支持此授权接口，本次同时断言暂停成员、其他企业仍不出现，不放宽权限。

## 回滚与交付

任务证据目录保留 `BASELINE/` 原始字节、`BASELINE_HASHES.json`、修改前后清单，
以及四件套 `MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、`ROLLBACK.sh`。
回滚脚本先核对全部文件哈希，遇到后续改动立即退出；只恢复本切片旧文件并删除
本切片新增文件，不改数据库、媒体或线上实例。副本执行回滚并重新跑基线复现。
最终命令、字面输出、退出码、main SHA 和重新打开核验记录见 `VERIFICATION.txt`。

## 未完成项与下一步

- 本次不创建发布候选、不切流，线上界面仍以实际部署版本为准。
- 后续发布时从 main 固定版本构建，重新核验在线基线、站点暂停决定及蓝绿流程，
  再用真实管理员会话验收受影响的记录，不重放历史付费任务。
- 历史上确实没有保存的事件或参数仍保持未知，本次不伪造恢复。
