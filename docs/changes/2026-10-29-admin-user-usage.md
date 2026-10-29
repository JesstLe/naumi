# 老板视角：用户用量与产出效率

## 范围与状态

- 基线 `cb1d2f4932e402a75511485173027ed049ed342e`，独立任务工作区 `naumi-admin-operations-20261029`。
- 本模块只提供查询；不改历史业务数据，不提交模型请求，不新增定时汇总，不回填猜测的历史归属。
- 用户后续明确去掉失败与等待耗时，因此本页面/API **没有失败率、失败数、等待、延迟或耗时指标**。原业务历史明细状态不删除。
- 本地模块与真实隔离 PostgreSQL 验证完成；完整后台页面、最终 main 整合和本地用户验收由父任务集中完成。没有执行生产部署。

## 职责与接口

| 文件 | 职责 |
|---|---|
| `src/lib/bi/usage-contracts.ts` | 日期/排序/分页验证、响应类型、公开指标公式 |
| `src/lib/bi/usage-repository.ts` | 日期与账号收窄、源表独立事实汇总、用户/趋势/覆盖率 |
| `src/app/api/admin/bi/usage/route.ts` | 平台 `biAuthorize`、访问审计、私有 no-store 响应 |
| `src/app/api/enterprise/usage/route.ts` | 企业账号鉴权、`enterpriseRead` 同事务可见范围校验与查询 |

平台入口：`GET /api/admin/bi/usage`。

企业入口：`GET /api/enterprise/usage?enterpriseId=<uuid>`。

共同参数：`from`、`to`（北京时间自然日，含头含尾）、`email`、`q`、`page`、`size`、`sort`；平台另支持 `tenantId`。每次最多 366 天、每页最多 100 人。历史不截成最近 30 天，默认只是近 30 天，用户可以换成更早的年度窗口。

平台鉴权与企业鉴权不互相替代。47 dedicated 站仍使用企业入口，不为了该统计开放 `/api/admin/*`。企业请求只从实时 `scope.visible`（老板另含企业 owner）取得账号集合，在 **相同 PostgreSQL repeatable-read 事务**中执行。客户端传 `allowedEmails` 不生效，指定越界账号直接 403；无可见成员时返回空集而非全站。

## 指标口径

- **生成任务**：原 `app_image_jobs`、`app_canvas_image_tasks`、`app_video_tasks` 的期间提交数；同账号且有精确父关联的 imagegen generate 子任务不重复计数。
- **生成交付**：期间实际保存完成态、非空图片或视频引用的作品，且有明确生成来源或同账号任务关联。上传、导入、复制另列；来源缺证据的历史作品列为待归因，不凭 origin/page/title 猜生成。后来删除的作品仍是历史已保存产出，另有删除数。
- **实际消费**：账本 `consume` 负值绝对金额，不拿报价/预占充当消费。明确的“管理员调整积分”或 `credits.adjust` 账务操作关联的扣减另列 `administrativeDebits`，不计使用量或活跃。退款单列，净消耗 = 消费 − 退款。
- **活跃人日**：任务提交、作品保存、模型调用或实际消费发生日，按每人北京时间日期去重，再对人求和。管理员赠送/扣减/退款不是用户活跃；不是在线工时。
- **每活跃人日产出**：生成交付数 ÷ 活跃人日；分母零时为 `null`。不根据此值判断员工质量、采纳率、节省工时或绩效。
- **每份产出积分**：期间消费 ÷ 期间交付；消费和交付属于各自事件发生时间，并非严格逐作品成本，也不折算人民币。
- **模型调用与 Token**：全部调用数单列，仅输入输出 Token 都有记录的样本累加 Token；`tokenSamples=0` 时 `inputTokens/outputTokens=null`，真实记录 0 保留为 0。
- **企业归属**：筛选/展示按账号当前归属。企业视图是“当前可见成员的历史账号用量”，不回写或冒充历史任务冻结 tenant。
- **历史起点**：响应 `coverage.historyFrom` 是本次日期窗口内的首条记录，UI应显示“本期首条记录”，不是全站最早数据日期。

## 历史读取与性能

- 不依赖新 `app_creation_records` 才展示旧业务，原任务、作品、账本、调用均直接进入汇总；已删除账号的原账本/任务仍按原 email保留，无账号资料时 name 为空、role 为 unknown。
- 每个源表先应用日期、账号、关键字、当前企业及服务器授权列表，再汇总。账本不与原始作品/任务直接多对多 join，避免消费和产出倍增；分页只作用于用户表，summary/daily 保持完整筛选集。
- **从不读取 `app_image_jobs.payload`**。旧 generate payload 可能包含参考图大字节；用于去重的近期关系只读 creation 标量元数据。有旧无关系子任务的账号，才读取该账号 `kind=imagegen` 父快照的 `children` 小对象，以精确 jobId 与 owner 关联，覆盖跨查询日期的父任务。generate 的 snapshot 也不读取。
- PostgreSQL 采用一条事实聚合 SQL，父查询读事务设置 15 秒 statement timeout；企业事务沿用原 `enterpriseRead` 20 秒超时。超时不会返回看似完整的零值统计。
- 可选历史表不存在时，`coverage.sources.available=false`，Token 与效率按缺失规则处理；未创作的已注册账号仍可见。
- 未运行全量生产数据压测或部署索引；不将本地 13 项 fixture 结果描述为生产规模性能验收。

## 集中验证

```powershell
$env:ADMIN_USAGE_FIXTURE_DATABASE_URL='postgresql://postgres@127.0.0.1:61053/usage_fixture'
node scripts/verify-admin-usage-pg.cjs E:/Workspace/naumi/output/admin-operations-20261029/usage/pg-final-v2
node scripts/verify-admin-usage-routes.cjs E:/Workspace/naumi/output/admin-operations-20261029/usage/routes-final
```

真实 PostgreSQL 全模块：`ADMIN_USAGE_PG=PASS CHECKS=13 REAL_SQL=1 SUPPLIER_CALLS=0 EXIT=0`。

覆盖北京时间边界、空历史、父子去重与跨 owner、生成/上传/导入/缺证据/删除区分、账本避免倍增、管理员调账不计消费、活跃人日、Token缺失与真实0、分页总数、企业过滤、服务器可见集合、已删除账号历史、跨日期父子、大payload完全不入查询、可选表缺失。

真实整 route 模块（鉴权/事务/仓储为明确边界 fixture）：`ADMIN_USAGE_ROUTES=PASS CHECKS=8 NETWORK=0 SUPPLIER_CALLS=0 EXIT=0`。

覆盖平台匿名拒绝、非法查询、私有审计、企业匿名/缺企业、无岗位数据权/跨企业拒绝、忽略客户端成员集合、同事务依赖、越界账号、老板精确 owner。权限实现仍是原 `enterpriseRead`；此处 route 测试不冒充整站真实会话验收。

首次真 PG 发现未写 `AS day` 以及内层同名 SQL alias 导致关键词过滤误关联，均修复后再集中复测；r1/r2 失败报告保留，不改断言迎合产品。最终原始 JSON、加载源码 SHA 位于上方证据路径。

## 后续与交接

- 父任务负责完整页面真实账号/权限验收、TypeScript、制品/副本回滚、main 合并与本地预览。
- 报价/供应商真实质量、活跃工时、采纳率、时间节省没有既有可靠采集，本模块不虚构这些数值。
- 不改变线上用户、账务、任务或企业配置；伽罗授权由父任务单独执行。

## 真实数据规模暴露的查询优化（本轮追加）

父任务用新 `readUserUsage` 纯查询模块在 47 开启 `REPEATABLE READ READ ONLY`、15 秒 statement timeout 执行近 30 天用量，首次真实执行超时，记录在 `live-galuo/LIVE_USAGE_READONLY.json`。这项失败不被小型 fixture PASS 覆盖。

父取得的 `EXPLAIN (FORMAT JSON)` **没有 ANALYZE，没有执行聚合**。原始 stdout 尾部被进程退出截断，但前部完整给出三个明确热区：

- `candidate_images` 逐行关联检查 materialized legacy child 列表，计划 cost 12,901,796；
- 账本每行重复查询管理员调整操作，计划 cost 3,431,321；
- 作品分类 CASE 被内联到多项指标，重复执行证据查询，计划 cost 720,122。

本次修正保留全部统计与权限语义，不增加超时、不修改线上索引：

1. 一次构建 `known_child_links`、`unlinked_child_owners`、`legacy_parent_candidates`、`child_links`，最终用唯一键 left join 排除子任务；移除逐任务 CTE 扫描。
2. 作品先按窗口提取窄字段，再一次联合生成来源证据，`classified_artworks AS MATERIALIZED` 只计算一次分类。
3. `admin_adjustment_keys` 一次读取同账号/账本 ID 的去重键集合；`classified_ledger` 只计算一次管理员扣款标记。
4. 所有图片 payload 仍完全不读取；旧 fallback 只读取 imagegen 父 children，没有引入 generate 大快照。

放大真实 PostgreSQL fixture 在原边界用例之外追加 194 账号、20,000 图片任务、20,000 作品、12,000 流水与 40,000 调用；generate payload 含约 480 MB 逻辑参考字节（可压缩合成数据，不冒充真实生产 TOAST/磁盘体量）。全部旧指标/隔离断言保持。

```powershell
$env:ADMIN_USAGE_FIXTURE_DATABASE_URL='postgresql://postgres@127.0.0.1:61053/usage_fixture'
$env:ADMIN_USAGE_BASELINE_BUNDLE='E:/Workspace/naumi/output/admin-operations-20261029/usage/before-optimization/usage-bundle.json'
node scripts/verify-admin-usage-pg.cjs E:/Workspace/naumi/output/admin-operations-20261029/usage/pg-optimized-scale-r1 --scale
node scripts/verify-admin-usage-routes.cjs E:/Workspace/naumi/output/admin-operations-20261029/usage/routes-optimized
```

实测输出：

```text
SCALE_QUERY_MS=888 EXECUTION_MS=982.27
ADMIN_USAGE_PG=PASS CHECKS=14 REAL_SQL=1 SUPPLIER_CALLS=0 EXIT=0
ADMIN_USAGE_ROUTES=PASS CHECKS=8 NETWORK=0 SUPPLIER_CALLS=0 EXIT=0
```

相同大样本数据库，旧查询只做 EXPLAIN（不执行），cost **26,039,591.27**；新查询 EXPLAIN ANALYZE，cost **63,205.01**，实际执行 **982.27 ms**。计划断言所有 CTE Scan 的 Actual Loops 不超过 5，避免旧相关子查询随记录数反复扫描。该数值属于本地隔离 SQL 性能证据，父任务将重新打包优化后的源码进行真实 47 只读复核，最终线上只读时间另记，不提前宣称真实验收已通过。

证据：`usage/pg-optimized-scale-r1/RESULT.json`、`SCALE.json` 与 `usage/routes-optimized/RESULT.json`。无生产 SQL 写入、无网络供应商调用、无后台服务启动。


### 父任务真实 47 只读复核（优化后）

父重新打包当前源码后，实际近 30 天查询通过：`LIVE_READONLY_PASS`，exit `0`，`durationMs=9358`，`readOnly=on`、隔离级别 `repeatable read`。查询覆盖 203 个账号、10,293 个逻辑任务、16,574 份保存作品（其中 9,690 份生成交付、5,481 份上传、606 份导入／复制、797 份来源待归因）、45,103 次模型调用；具体筛选和指标见 `live-galuo/LIVE_USAGE_READONLY.json`。未执行schema/索引/业务写入，supplierCalls=0。

**生产实测约 9.36 秒，不是本地样本的不足 1 秒。**原超时记录保留为 `LIVE_USAGE_READONLY-before-optimization.json`，旧编译模块另外固定在 `usage/before-optimization/usage-bundle.json`，不会因父更新 live bundle 覆盖比较基线。代码自 `F6E239EF…` 起保持稳定，交父集中整合。

