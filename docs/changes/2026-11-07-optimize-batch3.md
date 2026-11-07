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
| T6 | 原图下载（无 variant） | 1,815 次、3,061 MB/天 | 小图/网格/卡片不再取原图；总量 ≤ 2,100 MB |
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

## 未完成与下一步
- 上线、执行索引与工作台瘦身、nginx/PG 日志配置，次日按上表复测。
- 本地压测：在隔离环境测单个 Web 的轮询读接口吞吐与延迟。
- 是否把“100% 缩放原图”改为预览图，等用户决定。
