# 浏览器本地存储治理：额度、旧数据与页面兜底

## 问题与证据边界

用户反馈“缓存多了页面加载不出来，还有其他异常”。本轮只读核查 47 线上与 main 源码（基线 1e2889f5），未改动服务器。

已排除：
- HTTP 缓存：47 所有页面返回 `cache-control: private, no-store`；`/_next/static/` 由 nginx 指向历次构建的合集目录（r5 含 5374 个文件），发版后旧页面仍能取到旧 JS/CSS。
- 画布图片 IndexedDB（128MB/400 项/7 天）和作品数据缓存（12MB/6 条）都有上限，10-30 两轮已修复事务卡死与坏图自愈，本轮不重复。

已确认的根因（源码证据）：
1. **全站没有错误兜底页**：`src/app` 下没有 `error.tsx` / `global-error.tsx`。任何一次渲染异常都会让整站白屏，只有画布有自己的错误边界。
2. **批量工作台在站内运行时，和主站共用约 5M 字符的 localStorage 额度，且提示词记录只增不减**：
   - 在“默认提示词”输入框里每敲一个字，就把整段提示词写进当前项目每张参考图名下，再把整个对象重写一遍（`syncDefaultPromptToCards`）。
   - 切换项目时旧记录不删。
   - 额度写满以后，问题会扩散到多处：
     - 工作台启动时的版本键 `setItem` 抛异常，启动函数中断，页面空白。
     - 主站视频生成的回执写入 `use-video-generation.ts` 在提交前就抛异常，视频生成整体失败。
     - 计费意图、生成回执等只能留在内存里，刷新后丢失。
3. **工作台图片历史无上限，而且打开页面要等全部历史图片处理完才显示**：
   - `workbench-history.js` 把参考图、产品图、所有版本原图（单张最大 32MB）都存进 IndexedDB，按设计永不删除，还申请了持久存储。
   - `loadRefs` 会等 `remember()` 把每张图逐个读出来或下载、再全分辨率解码完，然后才 `render()`。历史越多，首屏越慢。
   - 47 实测：43 个用户，单用户最多 92 张生成图；单项目最多 65 张素材加 33 个版本。
4. **旧数据或损坏数据读回来不做校验**：
   - 登录缓存 `naumi:user:<email>` 会在服务器确认之前先渲染，字段缺失就在 `user.email.toLowerCase()` / `user.name.trim()` 处崩溃。这段代码在根布局里，所以整站白屏，而且每次刷新都一样。
   - 模板页 SWR 缓存不校验 `templates/tags/title` 的类型，同样在渲染时崩溃。
   - 3D 工作室只要有一个旧格式工程，`projectSchema.parse` 就会让整个工程列表读取失败。
   - 工作台项目列表里的 `null` 元素会中断启动。
5. **浏览器禁用存储时的根组件异常**：`text-model-context` 和 `authHeader()` 读取 localStorage 没有 try/catch，浏览器禁止存储访问时，所有页面或所有请求都会失败。
6. **小量泄漏**：融合/变体工具的输入指针 `naumi:tool-generation-receipt:v1:input:*` 在任务结束后仍然保留。

未能取得用户浏览器现场，所以无法断定某一次投诉具体是哪一条触发的。以上都是源码和线上数据层面的确定缺陷，并且都已用测试复现。

## 模块与职责

```text
模块与职责：
- browser-storage/recovery：可重建缓存的清单与清理（两个缓存库 + 模板缓存/缓存账号标记）；识别发版后过期资源错误，并做受保护的单次自动刷新。
- browser-storage/local：写满额度时先释放可丢的空间再重试（setLocalItem / resilientLocalStorage）；仍放不下照常抛错，需要防重放的回执保持写不进就不提交。
- browser-storage/hygiene：每次加载在空闲时执行一次，清理孤立的生成回执指针、裁剪超额的工作台提示词记录。
- reference-workbench/local-prompts：工作台提示词对象的格式与 30 万字符上限（纯函数，保留最新条目）。
- components/page-recovery + app/error + app/global-error：全站兜底页，提供“重试 / 清理缓存并刷新”；资源过期时自动刷新一次，60 秒内不重复。
公共接口、依赖方向、数据/状态/事务归属：
- 永不清理：计费意图、各类任务回执、草稿、偏好、登录副本（无数据库模式下它就是账号本身，只做读取校验）、3D 工程、工作台本机模板与版本清单。
- local.ts 只依赖 local-prompts 纯函数，不引入 React 或应用代码，工作台桥接脚本可以直接打包它；hygiene 是组合层，依赖 `tool-generation-receipt-keys`。这是从 tool-generation-receipt 拆出的回执键规则和清理函数，不依赖其他模块，因此根布局不会加载工具客户端；各模块仍只管自己的键。
- 工作台图片 IndexedDB 由 workbench-history 自己管理上限（512MiB / 3000 张，从最早保存的开始淘汰，当前项目和模板不淘汰）。
本次实现与迁移状态：见下节；不迁移数据格式，不改版本号，现有提示词和工程原样可读。
验证命令、结果及证据层级：见“验证”。
未完成项与下一步：见末节。
```

## 实现

- **全站兜底**：新增 `app/error.tsx` 和 `app/global-error.tsx`，共用 `PageRecovery`。
  - global-error 不依赖布局 CSS，全部用内联样式；语言取 `<html lang>`，再看 `naumi_locale` Cookie。
  - 遇到 `ChunkLoadError` 这类资源过期错误时自动刷新一次（sessionStorage 记录时间，60 秒内不重复，避免刷新死循环）。
  - “清理缓存并刷新”只删除 `naumi-image-bytes-v1`、`naumi-business-cache-v1` 两个库和缓存标记。库被其他标签页占用时最多等 2 秒；删除请求会在对方关闭连接后自动完成。
- **额度保护**：
  - 视频生成、素材导入、重试、媒体任务、画布视频和工作流的回执写入，统一改走 `setLocalItem` / `resilientLocalStorage`。
  - 额度满时先删模板缓存，再把工作台提示词裁到 10 万字符，然后重试；还是放不下就按原样抛错。
  - `workflow-runs` / `comfy-workflow` 的 storage 参数类型收窄为只需 getItem、setItem、removeItem，只改类型。
- **工作台提示词**：
  - 编辑和同步时先删键再写入，让最新的条目排在最后。
  - 写入合并为 400ms 一次，`pagehide` 时立即写盘。
  - 桥接层写入时套上 30 万字符上限；写入失败不中断页面，状态栏会提示“部分未保存到本机”。
  - 页面启动时先裁剪已经超额的旧数据，主站每次加载也会做一次。
- **工作台图片历史**：
  - `remember()` 先用一个只读事务找出本机已有的图片。缺的图以 4 路并发下载，最多等 1.5 秒就先显示；来不及的图换成本页面自己的图片地址（desktop 部署保留 `/desktop` 前缀）。
  - 桥接层显示图片时也走 `WorkbenchHistory.localUrl`，和正在进行的下载共用同一个任务，每张图只下载一次。
  - 下载失败的图 60 秒内不再请求。
  - 淘汰节流执行：保存 8 秒后执行，单次最多扫描一遍。
  - 继续申请持久存储，因为本机模板只存在这里；图片副本有了上限，不会再无限占盘。
- **读取校验**：
  - 登录缓存按字段校验，不合格就删除，改等服务器确认。
  - 模板缓存逐条校验字段类型。
  - 3D 工程逐条 `safeParse`，坏的一条跳过但不删除。
  - 工作台项目列表过滤掉非对象元素。
  - 文本模型和生图模型偏好的读写都包上 try/catch；用户自填的文本模型仍然保留。
- **孤立指针**：生成回执完成时一并删除仍指向本任务的输入指针（其他标签页已改指的不删）。hygiene 会清理历史遗留的孤立指针和对应的最新索引。

## 验证（本地，未发布）

- `npx tsc --noEmit` exit 0。
- `npx tsx scripts/verify-browser-storage-hygiene.ts`：11 项 PASS。
  - 用模拟 5M 额度和 fake-indexeddb 验证：提示词上限保留最新条目；额度满时释放后写入成功；无可释放空间时回执仍按原样失败；非额度错误原样抛出。
  - hygiene 只删孤立指针；恢复只删缓存，草稿、回执、偏好、用户库都保留；被占用的库不会卡住恢复；能识别过期资源错误。
- `node scripts/verify-workbench-history-cache.mjs`：14 项 PASS（Chromium 真实 IndexedDB，loopback）。
  - 4 秒慢图下首屏不到 3 秒就显示；显示路径和缓存共用下载，每张图只请求 1 次。
  - 新标签页重开时零图片请求，直接用本机副本；404 图片在重试窗口内只请求 1 次。
  - 种入 3010 条旧图片后，总数降到 3000 以内，从最早的开始淘汰，当前项目和本机模板保留。
  - 同一脚本在 main 原版上第 1 项失败：首屏等了 4026ms，正好是全部下载完的时间，原问题复现。
- `node scripts/verify-page-recovery.mjs`：11 项 PASS（真实 PageRecovery 组件 + React）。
  - 普通错误不自动刷新，“重试”调用 reset。
  - “清理缓存并刷新”只删 4 个缓存键和 2 个缓存库，计费意图、回执、草稿、偏好、登录副本、3D 库和工作台库都保留，并刷新一次。
  - 过期资源只自动刷新一次，不会循环。
- 既有回归：
  - `verify-workbench-assets.mjs`：709 项 PASS，与 main 基线相同。改动过程中曾因直接显示服务器地址缺少 `/desktop` 前缀而失败，已修复。
  - `verify-browser-cache-resilience.cjs` 14/14 PASS，`verify-browser-cache-efficiency.cjs` 13/13 PASS。
- 本地 `next build`（生产构建）exit 0：编译成功，91 个静态页全部生成。
- 以上三个新脚本已登记到 `scripts/verification/refactor-cases.mjs`，归入 foundation 组。

证据层级：源码测试、真实浏览器 fixture 和本地构建都已通过；**尚未在 47 发布，也没有用户浏览器的线上证据**。

## 未完成项与下一步

- 发布到 47 需另行确认后按蓝绿流程进行。发布后，用户下次打开站点时，旧的超额提示词记录会被自动裁剪，不需要用户手动清缓存。
- 计费意图 `naumi:billing-intent:*` 在网络中断时会按设计保留，用于防重复扣费。它没有时间戳，本轮不做过期清理（单条约 100 字符，不构成额度风险）。
- 画布单标签页的位置缓存（sessionStorage，每个项目最多 4000 条）已有 try/catch，本轮未调整。
