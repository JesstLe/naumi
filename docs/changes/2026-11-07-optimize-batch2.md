# 第二批优化：响应压缩、重复下载、预取与数据库热点

背景：2026-11-07 用户决定先做不改架构的优化（见 [架构评估](2026-11-07-architecture-assessment.md)）。本批依据 47 的线上证据：11-06 全天 nginx 访问日志，以及运行 9 天累计的 `pg_stat_user_tables`，均为只读采集。

## 问题与证据

- **JSON / RSC 响应完全不压缩。**
  - 直接请求 Next（`127.0.0.1:13132`）时带上 `Accept-Encoding: gzip`，`/api/release-notes` 仍然原样返回 30019 字节。Next 只压缩页面 HTML，不压缩 App Router 的接口和 RSC 响应。
  - nginx 主配置有 `gzip on`，但 `gzip_proxied` 没开，`gzip_types` 也只有默认的 text/html。
  - 用线上真实响应按压缩级别 5 测：更新说明 30019→10883 字节，模板列表 11956→3272 字节。
- **更新说明被反复下载。**
  - `SiteVersion` 每分钟检查一次版本，窗口获得焦点或回到页面时也会检查。原来每检查一次就让 `AnnouncementButton` 重新下载约 30KB 的更新说明，哪怕版本没变。
  - 11-06 全天 7176 次，共 204MB。
- **模型列表在切回窗口时全部重拉。**
  - 每次窗口获得焦点或页面变为可见，都会把所有订阅中的功能目录重拉一遍。
  - `/api/models` 11-06 全天 2.9 万次。
- **`/enterprise` 预取过大。**
  - 侧栏“协作交付”链接默认会预取，每次 RSC 响应 731KB。11-06 共 1196 次、855MB，来源全是画布页。
  - 同期 `/api/enterprise` 只有 267 次，说明绝大多数是预取，用户并没有真的进入。
  - 731KB 具体由什么组成，需要登录态才能复现，本批未定位。
- **数据库全表扫描热点**（9 天累计）：`app_ledger` 88.5 万次、读 100 亿行（表只有 1.5 万行）；`app_release_activities` 5.1 万次、读 119 亿行（65 万行、500MB，持续增长）；`app_creation_links` 8.1 万次、读 62 亿行；`app_image_jobs` 6.7 万次（表 2.2GB）。详见下文“数据库”一节。

## 实现

- **压缩配置：** `deploy/staging/nginx-compression.conf`，下次发版时装到 47 的 `/etc/nginx/conf.d/naumi47-compression.conf`。
  - 开启 `gzip_proxied any`；`gzip_types` 包含 JSON、RSC（`text/x-component`）、JS、CSS、SVG。
  - 刻意不压缩 `text/event-stream` 和 `application/x-ndjson`，这两类流必须原样实时到达。
  - 已在 47 上用临时目录里的配置副本跑 `nginx -t` 通过，没有改动线上配置。
- **更新说明：** `site-version.tsx` 只在服务器版本和上次不同时才触发重新下载。页面加载时已经下载过当前版本，这部分照旧。
- **模型列表：** `feature-catalog-browser.ts` 在窗口获得焦点或回到页面时，60 秒内最多重拉一次。以下情况仍然立即刷新：
  - 模型确实变了：服务器返回 409 MODEL_CHANGED，触发 MODEL_CATALOG_REFRESH；
  - 切换创作空间；
  - 登录身份变化。
- **`/enterprise` 预取：** `app-rail.tsx` 中这一个链接设为 `prefetch={false}`，改成点击时才加载。其他链接不变。

## 验证（本地，未发布）

- `npx tsc --noEmit`：exit 0。
- 本地 `next build`（生产构建）：exit 0，91 个静态页全部生成。
- 新增 `node scripts/verify-refresh-throttle.mjs`：5 项 PASS。真实 Chromium + Playwright 虚拟时钟，跑真实的 SiteVersion/AnnouncementButton 和真实的浏览器模型目录。同一脚本用 `--source-root` 指向 main 原版做对照：

| 场景 | 原版 | 现在 |
|---|---|---|
| 同一版本约 5 分钟（每分钟检查 + 每分钟一次焦点） | 更新说明下载 12 次 | 1 次 |
| 版本变化后 | — | 下载 1 次 |
| 30 秒内 10 次窗口焦点 | 模型列表重拉 10 次 | 0 次 |
| 1 分钟后再次获得焦点 | — | 1 次 |

- 版本检查本身的频率不变（约 5 分钟内 11 次）。

## 数据库

### 定位与线上实测

47 没有装 pg_stat_statements，所以先按表反查代码里的查询，再在 47 上用只读事务跑 `EXPLAIN ANALYZE` 确认。

| 热点 | 代码位置 | 线上计划 / 耗时 | 原因 |
|---|---|---|---|
| 待处理图片任务 `dueImageJobs` | `image-jobs/scheduling.ts:40` | 全表扫描，**2333ms**，读约 1.9GB 快照 | 后来加的 `imagegen running` 分支不在旧部分索引 `app_image_jobs_due` 的条件里，Worker 每轮都要执行 |
| 发布状态 `releaseStatus` | `release-runtime/store.ts:221,224` | 155ms，读约 1.7 万个页面 | `state<>'finished'` 用不上旧索引；65 万行全是已结束记录，每轮都要过一遍 |
| 后台任务认领去重 | `store.ts:152` | — | 按 `admission_key` 过滤，旧索引建在 `work_key` 上 |
| 发布记录保留期清理 | `store.ts:189` | — | 只按 `finished_at` 建了索引，要先扫过 7 天的 accepted-work 才找得到要删的 request |
| 按成员汇总消耗 | `enterprise/server.ts:143` 等 | 每个成员一次全表扫描 | `app_ledger` 没有 email 索引；企业控制台每 30 秒拉一次 |
| 图片进度关联创作记录 | `saas/creation-writer.ts:252` | 全表扫描 11 万行，57ms | en_US 排序规则下 `LIKE 'image:%'` 用不上 btree 索引 |
| 任务结果回写创作记录 | `creation-writer.ts:144`，`billing/synchronous-operation.ts:89` | Hash Join + 全表扫描 11 万行，85ms | 跨 LEFT JOIN 的 `OR` 条件 |
| 失败图片任务补交付 / 父任务通知 | `imagegen/stored-delivery.ts:124`，`imagegen/dispatch.ts:147` | — | 没有以 kind 打头的索引 |

### 实现

- **索引登记表：** `src/lib/persistence/hot-path-indexes.ts`，共 8 个 `CREATE INDEX CONCURRENTLY`。部分索引的条件逐字照抄对应查询的写法，数据库才能判断这些查询可以用它。
  - 沿用仓库已有的做法（`bi/query-indexes.ts` + `scripts/ops/admin-query-indexes.ts`）：不在启动建表流程里建，因为普通建索引会锁住写入，而 `app_image_jobs` 有 2.2GB。
  - 由新运维脚本 `scripts/ops/hot-path-indexes.ts --apply/--verify` 在持有三把部署锁时执行，并逐个检查 `indisvalid`。
  - 同时生成 `scripts/migrations/20261107-hot-path-indexes.sql`（内容来自登记表）。
- **两条 `OR` 查询改写为 `UNION`：** 两段各走自己的唯一键或关联索引，结果集合与原写法相同；`recordSourceOutcomeTx` 加 `ORDER BY id`，保证行锁按固定顺序获取。
- **不做的：**
  - 不缩短发布记录的保留期。回滚守卫和 release47 运维脚本会读已结束的记录；有了部分索引后，表的大小已经不影响热点查询。
  - 不动任务快照的写法（每次保存整段 JSONB 重写），牵涉生成恢复和计费，单独评估。

### 验证（本机 PostgreSQL 16，en_US.UTF-8 排序规则，与线上一致）

- 新增 `verify-hot-path-indexes.ts`：17 项 PASS。
  - 造了接近线上规模的数据：15 万条发布记录、3 万条账务、2 万条创作记录加 11 万条关联、8000 个约 10KB 快照的图片任务。
  - 实际执行运维脚本 `--apply` 和 `--verify`，8 个索引全部有效。
  - 8 条热点查询的执行计划全部改走新索引。本机耗时：发布状态 41.9→0.07ms，账务 10.4→1.1ms，图片关联 11.7→0.03ms，失败父任务 10.1→0.12ms。
  - 两条 UNION 改写读取的是代码里提交的 SQL 原文，在 7 组参数下与原 OR 写法结果完全一致，且不再扫描整张关联表。
  - 待处理任务那条在本机数据下原本就走了别的索引，没能复现线上的 2.3 秒全表扫描。线上效果要在 47 上建好索引后用 `EXPLAIN` 确认。
- 相关数据库回归：`verify-sync-terminal-consistency`（16 项）、`verify-canvas-task-boundaries-pg`（21 项）、`verify-commercial-admin-owners-pg`（164 项）PASS。
- `verify-canvas-text-tasks-pg` 在 main 原版上同样失败，与本次无关。

### 上线步骤（需另行确认）

1. 在发版会话中、持有三把锁时执行 `scripts/ops/hot-path-indexes.ts --apply`，再执行 `--verify`。建索引不阻塞写入，`app_image_jobs` 预计需要几十秒到几分钟。
2. 部署新版本；把 `nginx-compression.conf` 装到 conf.d，`nginx -t` 后平滑 reload。
3. 上线后在 47 上重新跑 `EXPLAIN` 确认改走新索引；第二天对比 `pg_stat_user_tables` 的全表扫描次数和访问日志的流量。

## 未完成项

- 47 发布需另行确认。压缩配置和代码一起按蓝绿流程上线，发布前后对比第二天的流量。
- `/enterprise` RSC 731KB 的具体组成待复现定位。
- `app_image_jobs` 快照瘦身牵涉生成恢复和计费，单独评估。
