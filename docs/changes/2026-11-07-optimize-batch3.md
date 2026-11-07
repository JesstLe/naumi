# 第三批优化与三批合并上线（2026-11-07）

基线：origin/main `908ab739`（已含浏览器缓存 `c2ea6eb1`、轮询 `40631eef`、第二批 `908ab739`，均未上线）。
分支 `codex/optimize-batch3-20261107`。依据为 47 的 11-06 全天 nginx 日志（98 万请求、215 个 IP）、数据库累计统计和只读查询；
11-06 白天运行的是 `20261103-r1`，r5 于 22:18 才上线。

## 指定目标（上线后在 47 实测，对比 11-06 同口径）

| # | 项目 | 11-06 基线 | 目标 |
|---|---|---|---|
| T1 | 协作成员列表 `/api/collaboration/members` | 148,060 次/天 | ≤ 30,000（-80%） |
| T1 | 视频任务 `/api/video/tasks` | 294,125 次/天 | ≤ 60,000（-80%） |
| T1 | 视频节点 `/api/canvas/video-nodes` | 141,048 次/天 | ≤ 50,000（-65%） |
| T1 | 账户接口完整视图流量 `/api/account` | 2,239 MB/天 | ≤ 200 MB |
| T1 | 更新说明 `/api/release-notes` | 7,176 次、214 MB/天 | ≤ 30 MB |
| T2 | JSON/RSC 压缩（成员列表单次） | 10,147 B | ≤ 3,000 B |
| T3 | 待处理图片任务扫描（Worker 每轮） | 2,333 ms | ≤ 50 ms（EXPLAIN） |
| T3 | 发布状态检查 | 每次读约 136 MB | ≤ 1 MB |
| T4 | 参考工作台：最重用户一次列表读取 | 116 MB | ≤ 1 MB |
| T4 | `app_reference_operations` 表 | 808 MB | ≤ 50 MB |
| T5 | 企业工作台重复打开 | 每次约 750 KB | ≤ 5 KB（304） |
| T5 | `/enterprise?_rsc=` 请求 | 1,204 次/天，895 MB | 0 |
| T6 | 原图下载（无 variant） | 1,815 次、3,061 MB/天 | ~~≤ 2,100 MB~~ 作废：用户要求清晰度优先（见“画布清晰度回调”） |
| T7 | 可观测性 | 无耗时字段、无慢 SQL | nginx 每行带 `rt=`/`urt=`；>500 ms SQL 记日志且不记参数 |
| T8 | 5xx | 节点接口 1,586、报价 45 | 一个完整工作日 0 |

## 本批实现

### 参考工作台任务记录瘦身（T4）
- 调研：提交时浏览器把参考图以 data URL 内联在请求里；`preview()` 已把它们另存为素材（plans[].inputs 只放素材编号），却仍把整份请求原样写进 `body`；单图生成的 `settings` 由整个请求派生，又在每个变体里复制一次。47 上 694 行占 808 MB；状态/产品图列表/单图任务列表每次 `SELECT *` 读出用户全部记录，最重用户 116 MB，9 天 toast 读取约 680 GB。
- 新模块 `src/lib/reference-workbench/operation-storage.ts`：`storedOperationBody` 把 `images`/`annotated_data_url` 换成 `inline_images_sha256`；`storedOperationRecord` 同时清理 plans 中 settings 的内联图；`slimStoredOperations` 逐行 `FOR UPDATE` 重写旧记录（保留 `updated_at`，plan 模式只读不加锁）。
- `preview()` 写入瘦身后的 body，settings 不再带内联图；`accept()` 两侧都按同一规则归一后比较，新旧记录都能提交，换图仍报“报价与提交内容不一致”。指纹列由原始请求计算，未改。
- 运维脚本 `scripts/ops/reference-operation-slim.ts`：`--plan` 只统计；`--apply [--vacuum-full]` 需三锁，完成后再跑一次确认 0 待改，`VACUUM FULL` 设 3 s 锁等待。**必须在新版本成为唯一 Web 之后执行**（旧代码提交时比较完整 body）。

### 企业工作台页面（T5）
- 调研：企业站 `/enterprise` 改写到 `/enterprise/workspace`，返回 2.1 MB 单文件页面（1.7 MB 内联脚本），`no-store`，每次完整下载（压缩后约 750 KB）。侧栏是 Next `Link`，点击先以 `_rsc` 取一遍整页、发现不是 RSC 再整页加载一遍；第二批关掉了预取但点击仍取两遍。
- `src/app/enterprise/workflow/route.ts`：同一构建与站点配置生成强 ETag，`Cache-Control: private, no-cache`；浏览器每次仍回源校验（登录检查照常），未变时 304 无正文；兼容代理加的 `W/`。渲染结果按文件大小/mtime/站点配置缓存在进程内。
- `src/components/app-rail.tsx`：`/enterprise` 入口改为普通 `<a>`。
- 未拆分 `preview.html`：它由几十个 `scripts/build-*.mjs` 原地改写，拆成外链脚本需要改整条构建链，收益与 ETag 相同。

### 画布原图（T6）
- 调研（含子代理只读排查）：原图主要来自 `canvas-image.tsx` 的“缩放 ≥100% 全部可见节点用原图”和“单选节点用原图”。这两条分别是 10-20 PDF 问题第 2① 条与 10-19 单选原图的已验收要求，**本批不改**，是否改为 1600px 预览图需用户决定。
- 本批只改纯浪费：角色/场景/导演节点卡片原来任何缩放都取原图，改为与图片节点同规则（<100% 用 1600px 预览，≥100% 原图，不降级）；作品选择网格、回收站、产品选择、助手结果网格与 20–48 px 小图、Agent 工具卡片、@ 引用小图、视频输入缩略图、版本列表、比例选择、视频历史预览改用 thumbnail/preview 变体。下载、标注、复制、灯箱、模型输入仍用原图。

### 可观测性（T7）
- `deploy/staging/nginx-access-log-timing.conf`：在 `nginx.conf` 中定义 `naumi_timing` 并替换默认 `access_log`（combined 前缀不变）。
- 数据库：`ALTER SYSTEM SET log_min_duration_statement='500ms'`、`log_lock_waits=on`、`log_parameter_max_length=0`（不记录参数，避免邮箱/提示词进日志），`pg_reload_conf()` 生效，无需重启。
- `pg_stat_statements` 需要 `shared_preload_libraries` 并重启数据库容器，本批不做，等维护窗口。

### 测试修复
- `scripts/verify-pricing-friction-workbench.ts`：第一批（`48d4e5a6`）给工作台浏览器桥加了存储模块导入，此测试的沙箱未同步而从那时起失败；补上两个桩。
- `scripts/verify-canvas-theme-panels.cjs`：组件新引入 `@/lib/cdn`，测试打包补 `NEXT_PUBLIC_*` 定义（Next 构建时会内联）。

## 验证（本地）
- `verify-pricing-friction-workbench.ts --mode modified`（隔离 PG + 本地供应商替身）：14 组通过，含新增：内联图只存素材+摘要、换图被拒、旧格式完整记录可提交、瘦身 196,830→6,135 字节且指纹/结果/updated_at 不变、二次执行 0 改动。
- `verify-enterprise-workspace-cache.ts`：真实 2.1 MB 产物，304/W/ETag/多值/`*`、站点配置变化 200、非企业站无注入、安全头保留、侧栏普通链接。
- 画布相关：media-representation 44、artwork-picker 19、artwork-picker-dom 7、theme-panels 23、frame-choice 13、image-stability 14、scene/character/director UI 通过。
- 画布节点/视频/助手：node-renderers 32、character/scene/director integration 39/51/34、video-mode-ui 11、video-submission 121、assistant-session 55、image-version-integration 9、native-editors-dom 9、dock-layout、render-isolation 11 通过。`verify-video-native-ui`、`verify-assistant-live-feedback`、`verify-inline-node-references-e2e` 在未改动的 main 上同样失败（失败点一致），与本批无关。
- `tsc --noEmit` 0 错误；`next build` 通过（91/91 页）。

## 上线中发现并修复
- 47 上 `app_reference_operations` 有被 `naumi_staging_history_freeze` 触发器冻结的导入历史行（`naumi_staging_guard.origin_rows`）。首次执行在第 81 行遇到冻结行报 `STAGING_IMPORTED_HISTORY_READ_ONLY`，已处理的 80 行逐行提交、其余未动。
- `slimStoredOperations` 现跳过导入历史行（存在守护表时），输出 `skippedImported`；测试增加带同类触发器的冻结行，断言跳过且原样保留。

## 47 发布（r6，2026-11-07 09:53–10:11 CST）

- 用户授权：“全部搞定 指定目标”。三锁会话 `release47-main-20261107-r6`，候选 `7f08bad0` / `1794015971`，镜像 `sha256:ef3f8135…`；前任 r5（`5872a41b`）排空后停止（restart=no），保留 r6/r5/r4/r3/r2 五轮，移除 1103-r1。lifecycle `COMPLETE`，恢复监督已绑定新对并启用。
- 03b 热点索引：8 个 `CONCURRENTLY` 共 10.8 s，全部 valid。
- 04b 网关与日志：`naumi47-compression.conf`、`naumi_timing` 日志格式（`nginx -t` 通过、reload）；PG `log_min_duration_statement=500ms`、`log_lock_waits=on`、参数不入日志（`pg_reload_conf`，未重启）。
- 06/06b 候选验收：画布节点轮询 120/120 200；`/enterprise` ETag 与 304；`view=user` 账户 231 B；工作台状态 200。**发现**：中间件 `ACCESS_HEADERS`（`private, no-store`）覆盖路由的 `private, no-cache`，浏览器不会回源校验，T5 只部分达成（`_rsc` 双取已去掉）；修复 `0f002de5` 已合入 main，随下次发布上线。
- 10/10b/10c 退役：与 r5 相同，r5 旧 Web 上有 2 条长连接；10b 的等待条件不容许共享库里新版本正在跑的图片任务，10c 在新 Worker 运行期间等长连接自然结束，再屏障+两次完整排空证明后停止，失败路径先恢复新 Worker。
- 13/13b 工作台记录：首次在冻结的导入历史行停止（见上），修复 `45b89b88` 后跳过 1 行导入历史，瘦身 193 行；表 847 MB → 12.7 MB，694 行、指纹/类型/创建时间身份一致，本地记录无内联图。
- 14/14b 公网：节点轮询 60/60 200、版本一致；JSON 响应 gzip（更新说明 30 KB → 线上 11 KB）。
- 发布后核查（只读 EXPLAIN）：待处理图片任务扫描 0.64 ms（60 个缓冲页，原 2,333 ms/约 1.9 GB）；发布状态检查 0.16 ms（7 页，原约 136 MB）；8 个索引中 7 个已被使用。切换后 >500 ms SQL 为 0。
- 初步流量（10:05 起 8 分钟，周六、4 个 IP；旧标签页仍跑旧前端，需用户刷新）：成员列表每 IP 每分钟约 55 → 5 次、单次 10,142 → 1,302 B；无 5xx。完整对比需工作日全天数据。

## 本地压测（隔离环境，T7）

r6 同一镜像，WSL Docker 内部网络（无外联），Web 按 47 限制 `--cpus=1.5 --memory=2g`，PG16 种子 20 用户/企业/视频任务/节点/图片任务，autocannon；原始数据 `output/loadtest-20261107/`。

| 接口 | c50 req/s | p99 ms |
|---|---|---|
| version / site-profile | 1,333 / 1,346 | 106 / 99 |
| models / feature-access | 1,085 / 769 | 117 / 132 |
| image-tasks / video-nodes / video-tasks | 588 / 558 / 542 | 156 / 166 / 164 |
| members | 515 | 166 |
| account view=user | 317 | 221 |
| **生产比例混合** c10 / c50 / c100 / c200 | 672 / 655 / 621 / 599 | 31 / 201 / **411** / 855 |

- 实测：单个 Web 在混合负载下约 640–670 req/s、p99<500 ms、0 错误，内存峰值 581 MiB。
- 推断：瓶颈是 Node 单线程（Web CPU 恒定约 1 核、给 1.5 核也用不满），数据库约半核；每个混合请求约 1.5 ms Web CPU + 0.75 ms DB CPU。扩容靠多开 Web 进程/实例（即架构项 A1），加 CPU 无效。规划取 450–550 req/s/实例留余量。
- 差异：种子库小（15 MB 全缓存，生产 DB 成本更高）、单一测试用户、无 nginx/TLS、模型配置走非托管路径、平台模式站点。
- 新发现：`/api/account?view=user` 每次都执行 `expireDueBatches` 的 `SELECT … FOR UPDATE` + `UPDATE app_users`（22,442 次请求对应 22,442 次更新），读接口带写；生产占比约 1%，但多人同时刷新余额时会争锁。列入下一步，需按计费链路测试规则单独处理。

## 画布清晰度回调（r6 后用户反馈“太糊”）

- 用户：“画布看起来有点糊，只有放大到一定程度才清晰……我们是设计平台，太糊了肯定不行”“请尽可能保证画布中的质量”。
- 原因：画布图片节点 <100% 缩放的分级规则（屏幕 ≤512 像素用 512px 缩略图 q76、≤1600 用 1600px 预览 q84）在分界处没有余量，变体像素与显示像素 1:1 再加有损压缩，细节和小字发软；r6 后刷新清掉了长开标签页里已加载的原图，问题更明显。本批第 3 节把面板网格/版本列表/比例对话框改成 512 缩略图也降低了这些位置的清晰度。
- 处理（`src/lib/canvas/media-loading.ts`）：画布节点不再使用 512 缩略图；1600 预览只在屏幕 ≤400 设备像素（≥4 倍过采样，缩小后与原图无差别）时使用，更大一律原图；100% 原图与单选原图规则不变，已加载的高清不降级。角色/场景/导演卡片恢复任何缩放都用原图；作品/产品/回收站/助手网格、版本列表、比例对话框、项目封面改用 1600 预览；只有 ≤48px 的小图标保留缩略图。
- 代价：原图下载会比 r6 前更多（T6 目标作废），以清晰度为先。

## 未完成与下一步
- 工作日（下周一）全天对比 T1/T2/T6/T8；旧标签页刷新后前端轮询效果才完全体现。
- T5：中间件修复 `0f002de5` 已合入 main，随下次发布上线后企业页重复打开才变 304。
- `/api/account?view=user` 读路径写库（见压测）。
- `pg_stat_statements` 需重启数据库，等维护窗口。
- 是否把“100% 缩放原图”改为预览图，等用户决定。
