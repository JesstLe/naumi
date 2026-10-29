# 画布保存与传输容量审计：视频节点保存队列

## 1. 基线、职责与状态

- 收尾再次 `git fetch origin main`，origin/main 仍为 `e18780188d02ac92c901b8cf5648b4554aef14e8`，没有合并未知分支。
- 本任务工作树：`C:/Users/13357/.t3/worktrees/naumi/t3-400f2da1`；工具已准备的分支 `t3/canvas-autosave-transport-audit`，没有另建 checkout。
- 开工 HEAD、fetch 后 origin/main：`e18780188d02ac92c901b8cf5648b4554aef14e8`，开工工作树干净。已读 AGENTS、AGENT_COLLABORATION、容量总账第七章末及 CANVAS_CAPABILITY_ADAPTATION。
- 本记录只为父线程提供独立切片；不分配 A/D 编号，不修改总 ledger。固定提交交父线程串行审查、普通 merge；本任务不 push/main merge/PR。
- 47 HOLD 保持。本轮没有 SSH、部署、切流、Worker 重启、生产业务写、UNKNOWN 清理、供应商请求或生产压力注入；45 笔手术与在线索引仍是总账待办。
- 本次实现归属：`useVideoNodes` 的保存调度、生命周期与失败草稿；不是所有画布节点的统一保存重构。没有修改 X5 durable/storage、X3 tick/worker-runtime、imagegen pixels/postprocess/chroma、价格或供应商配置。

## 2. 真实保存入口盘点（源码事实）

### 2.1 不是统一的定时全画布 POST

| 入口与定位 | 触发、默认值 | 数据/ACK/退化与用户症状 |
|---|---|---|
| `canvas-client.tsx:7805` 的 `persistTextNode`；调用 `commitTextNodeContent`、`resizeTextNode`、`updateTextReference`、拖动结束、生成完成、重命名等 | 文字输入 `changeTextNodeContent` 更新 React；失焦提交；高度估算差值至少 28px 时也提交；无网络保存防抖 | 每次单个文字节点完整 JSON，不是整画布；每 id Promise 串行。20s timeout；失败返回 null、保留内存 map，显示重试。无自动有界重试。成功只检查 HTTP JSON，未校验 `persisted`；`persisted:false` 退化响应可能清掉 dirty。此项只记录，未修。 |
| `canvas-client.tsx:2679-2699` 文字本地 fallback effect | 每次 `textNodes` 变化，包括受控输入 | **对该账号所有文字节点全量 `JSON.stringify` + 同步 localStorage.setItem**；没有 debounce。超过 quota 静默 best-effort。服务器 GET persisted=true 时优先服务器，不把本地未确认编辑自动合入。不是每键全画布网络上传，但有主线程序列化风险。 |
| `POST /api/canvas/text-nodes` → `db.ts:2432 upsertCanvasTextNode` | 写单节点；content 后端截 20000、前端编辑截 12000，属于原规则 | 原 `ON CONFLICT(id) ... WHERE email=EXCLUDED.email` 保留 owner；**没有 expectedRevision/CAS/nonce**。updatedAt 是时间戳，不是本切片新增的版本协议；多标签最后写覆盖风险仍开放。 |
| `canvas-client.tsx:2088,3919-3920,5265` → `useVideoNodes.save` | 视频提示词失焦、尺寸/位置结束、重命名、设置显式保存；本来不是周期自动提交 | 单节点 patch JSON；config/inputs 若提供则完整字段值，不是 JSON Patch。逐节点串行；原版每次执行新 UUID，无相同尾请求合并、无失败队列/journal。此次完整修复。 |
| `VideoSettingsDialog:17-137` | 设置改动仅本地；保存/生成按钮才写；dock 卸载缓存最多 64 个 draft | dirty baseline 用 title/config/inputs JSON；局部 position-only revision 可 rebase，配置冲突不自动覆盖；原 dock 缓存是 JS Map，刷新丢失。**本切片恢复的是已调用 save 的编辑，不是尚未点保存的 composer 输入。** |
| `useCharacterNodes/useSceneNodes/useAudioNodes/useTimelineNodes/useDirectorNodes` | 保存动作即时发；同节点 Promise 队列；focus/visibility 读取；Director 具体 hook 保持原有实现 | expectedRevision + operationId；部分 hook 的 attempts 按 fingerprint 内存复用。未将视频队列机械推广，避免多模块范围膨胀。 |
| Character/Scene/Director editor 草稿 effect | 标称 300ms timer；cleanup 也调用 cache，依赖更新会立即写旧 effect 当前 ref | sessionStorage 存完整项目、revision；可能并非真正 300ms trailing debounce。Audio/Timeline 在 draft effect 直接序列化。只作下一切片定位，未量化为实测缺陷。 |
| `useImageNodeDraft` → `ImageNodeDraftStore` | 输入字段变化立即本地写；key 包含 actor/owner/project/node | 图片提示词/比例/引用 token 的 sessionStorage 草稿；不写 artwork，也不调用供应商。内存 fallback、key 隔离已有，保留。 |
| `canvas-client.tsx:3112-3232` 图片尺寸/坐标/位置缓存 | resize/drag end、初始化位置专用 API；sessionStorage positions 最后 4000 项 | 不是图片像素或节点内容每帧上传；位置缓存按账号+项目。既有 4000 缓存截断不是本任务新增节点限制。 |
| `runHistoryOperation` → `/api/canvas/history` → `saveCanvasHistory` | undo/redo/批量操作，先 flush 相关保存队列；20s timeout | operationId + operations；历史事务拥有各节点写入/锁和恢复。HTTP `{ok:true,persisted:dbEnabled}` 不是通用 revision ACK。本次全局 `flush()` 在存在未确认视频编辑时继续拒绝历史覆盖。 |

### 2.2 服务端归属、事务与协议保持

- `video-node-schema.ts:16-23`：`id / expectedRevision / operationId`，config 和 inputs 仍用原 schema；Route `POST /api/canvas/video-nodes` / `PATCH /[id]` 使用原 512KiB bounded body、同站校验、authenticatedEmail、withCreationRoute。
- `video-node-service.ts:53-70`：解析、项目授权、实际 creation project 绑定、引用授权；原事务调用 `saveVideoNodeTx`，COMMIT 后才返回 node。未增加第二连接、自调用 HTTP 或前端“假 patch”。
- `video-node-repository.ts:31-70`：原 graph/op/node advisory transaction locks、owner 查询、input digest、operation 回执，重复 operation 读旧 result；同 expectedRevision 并发只有一方成功；项目迁移拒绝；数据库实际 revision 每次写递增。此次 **没有改 SQL 或锁**。
- `mergeVideoNodeSnapshots`：低 revision 不回退，same revision 仍比较完整 snapshot（允许既有锁/结果字段事实），不因本轮优化丢数据。

## 3. 已复现并修复的切片

### 3.1 原实现实测

使用真实 React 19.3 hook（esbuild 编译）、独立 headless Chromium、loopback HTTP、独立临时 PostgreSQL16 容器，真实仓储函数与 SQL，不给测试路径额外加锁/监听/重试：

1. 同一 12000 ASCII 字符 prompt、20 个未完成的相同 `save`：20 次请求、请求 body 合计 242391 bytes，真实 revision 1→21；20 个调用得到不同 ACK。
2. 数据库提交成功后 HTTP fixture 返回一次 503：原版仅一请求，调用失败；后续人工重试新 nonce。显式 expectedRevision 原样重试会发生 CAS 冲突；不是付费任务，也没有重放生成。
3. 保存失败后 Promise 被队列删除，原 `flush()` 返回成功，未确认状态没有全局屏障。10 个排队不同编辑遇同一失败发出 10 次请求。
4. 卸载只停 polling timer，排队写仍发送；切 workspace 不进入旧 identity guard；旧 owner 请求完成虽然 merge 被挡，save Promise 仍可 fulfilled。

### 3.2 实现

- 新 `src/lib/canvas/video-node-save-queue.ts`，只拥有视频节点的调度/未确认意图。`save(id, patch)`、`flush()`、`flush(id)`、`retryPending()`、`dispose()` 为窄接口；DB/route/供应商不依赖此客户端模块。
- 仅**相邻且尚未完成的同 id、完整相同 patch**复用同一 Promise；A→B→A 三次不同意图保持三次真实写，不用 debounce 丢中间编辑，不把已完成的相同输入永久当无操作。
- 每次意图冻结内容与基准 revision；请求体只构建一次，重试原 URL/method/body/nonce。瞬时网络异常、408/502/503/504 最多追加两次（500ms、1500ms）；每次 20s 超时。401/403/409/422 等不自动重试，500 保留未确认状态但不自动放大。
- 前一失败会阻断已排队的后续意图，防止每个排队编辑自动取得一份新的重试预算。用户显式恢复时先核对不确定提交的原回执，再处理后续编辑；CAS 冲突保留草稿，不静默基于较新版本覆盖。
- ACK 校验 id、projectKey（已知时）和 `revision === expectedRevision + 1`；缺 node、错误 revision、成功 HTTP 但无持久记录均不清 dirty。重放得到的旧真实回执可完成原意图，但 merge 仍不覆盖较新服务器 revision。
- `flush()` 读取完整待确认队列，失败不伪装清空；`flush(id)` 给显式保存同节点的重试通道。canvas-client 仅该调用和原“未保存/重试”条共 4 行替换，无整文件重写。
- 待确认草稿与冻结请求存 **tab-local sessionStorage，key=owner+workspace**；每意图独立项，索引只有 ID，避免每次 ACK 重新序列化所有排队的长内容。卸载/重载后显示未保存计数，通过显式“重试保存”恢复，不在 mount/online/focus 自动无限重放。相同账号另一 tab 仍由服务器 nonce/CAS 隔离；本轮没有引入 BroadcastChannel 写协调。
- 卸载 abort 保存、读取和退避 timer，移除 beforeunload listener；账号/readOnly/workspace epoch 防迟到响应。workspace 选择用现有 WORKSPACE_SELECTION 与 revision；请求冻结原 workspace header。
- 已发送的请求 abort 不代表数据库回滚：journal 在 POST 前记录原 nonce/body，重载后核对回执。未发送排队编辑保留原 baseRevision。sessionStorage quota/不可用时内存继续保留且关闭页面警示；**磁盘/浏览器存储不可用时不承诺跨进程恢复**。
- 读轮询仍为一次结束后 6000ms；没有靠调大间隔修问题。其他节点/生成任务保持原协议。

## 4. 传输与流盘点（只读边界）

| 位置 | 已确认事实 | 开放项 |
|---|---|---|
| `useVideoNodes.refresh` + GET list + repository list | 默认该 owner 所有节点 includeDeleted=1，最多 2000；每轮完整 nodes JSON，无 ETag；客户端同内容复用避免重绘但不减少网络字节。本轮 cleanup 增加 abort。 | 按项目窄读/增量读取需完整协议，不在本次伪作 JSON Patch。2000 是既有读取上限，未改。 |
| `useVideoTasks:16` / `useVideoHistory:28-30` / `useMediaJobs:25-28` | 分别 4s；活跃4s/空闲12s且每4轮列表；活跃2.5s/空闲10s且每5轮列表。均在 await 后排下一 timer，不是同一个 effect 自己 setInterval 并发堆叠。 | 旧效果停 timer 不普遍 abort in-flight HTTP；多个 hook 与 canvas-client 恢复轮询是否重复覆盖需下一切片实测。 |
| `canvas-client:3304-3442,3447-3580` | 视频/改字恢复按每80 sourceIds 分块 Promise.all；视频活跃8s/空闲15s/失败12s，改字3s/15s/10s。停止标志防渲染但没有统一 AbortController；大量块同时 HTTP。 | 真正重复订阅、请求数与大画布规模尚未量化。 |
| `canvas-image-tasks.ts:284 publicCanvasImageTask` | 公共结果挑选 id/status/progress/resultArtworkId 等及 normalized parameters，不公开 provider submission checkpoints/raw upstreamResult；不应把存储 raw data URL 直接等同这个接口返回了它。 | sourceArtwork/image 加载链需分开测。 |
| `canvas-image-tasks.ts:193-203` | storage 未启用时有 `data:image/png;base64` 原有 fallback；结果 artwork.image/source 可能是大字符串。 | 是否线上启用/实际尺寸未读取；X5 durable/storage 负责外置结果，本次不碰。 |
| `browser-data-cache.ts:8-11,121-143` / `/api/account` | account snapshot 初始/失效重读；30s fresh、5min stale、12MiB总预算、6记录；相同 key 的 in-flight 复用。canvas 不应用 stale revalidation 覆盖编辑。JSON 若含 data URL 仍占响应/解析；不能把缓存等同服务器已消除。 | 本地 cache JSON/IDB 写量及真实账户响应未做容量基准。 |
| `browser-image-cache.ts:154,210,230-244` | URL/内容 hash 媒体缓存、并行 pending 复用，identity reset abort pending/revoke object URLs；focus 验权 manifest 而非自动重下像素。 | 没有实际 R2/CDN/生产媒体验收。 |
| `imagegen/client.ts:22-30` / `imagegen-pending-recovery.tsx:36-68` | 30s 请求 timeout，固定 scope，原 operation/job 回执匹配；恢复按钮有 checking Set，未把404/timeout变为重购依据。 | 与 X5 的最终结果表示只记接口边界。 |
| `canvas-client:2143-2164,5600-5640,5715-5858` 助手 | 单 controller、epoch、切上下文/卸载 abort；fetch ReadableStream 手工 reader，不是 EventSource 自动重连；旧 epoch reader.cancel。历史恢复1s循环由 controller 检查。 | reader finally/releaseLock、服务端取消与同内容 delta/final 重传尚未故障注入；Agent harness Markdown 与 Agent session SSE 独立模块仅挂账，不扩修。 |

## 5. 集中验证与量化

入口：`node scripts/verify-canvas-save-transport.cjs MODE [hookPath] [outputPath]`。

- 真实 hook 与 `canvas-client.patchVideoNode` 函数原文进入同一个 React runner，真实 fetch/HTTP；测试 service/auth 是清楚标注的 fixture。仓储加载只替换 DB 获取与最小 schema 前置，canonicalConfig 取原函数，`saveVideoNodeTx` 为实际源码；未用额外锁/监听修饰被测路径。
- PG 是新建随机命名、带任务 label、随机 loopback 映射端口的 `postgres:16-alpine` tmpfs 容器；只停止自己创建并验证 label 的容器。Windows 子进程环境白名单按大小写无关保留 SYSTEMROOT；不加载 .env 或继承生产 DATABASE_URL。
- 23 项覆盖：同尾重复、响应已提交后丢失、快速 A/B/A、失败 dirty/manual retry、真实调用方、失败积压预算、缺 ACK、readOnly、迟到 GET、owner 切换、workspace 切换、卸载计时器、显式 CAS、跨项目冲突、离线重载、卸载重载所有队列、瞬时失败后下一编辑、跨标签冲突、draft scope、quota、浏览器真实 offline/online、真实PG并发一个赢家、持久化 reload/fixture 撤权。重载后恢复用 canvas-client 原文“重试保存”按钮点击，不仅调用内部函数。
- 最终同矩阵：BASELINE 9 pass/14 fail（新增恢复 API 缺失也计在14项，不能称14个独立线上缺陷）；MODIFIED 23 pass/0 fail；副本 ROLLBACK 恢复9/14。
- 同一20调用/12000字符样本：HTTP请求 **20→1**，body累计 **242391→12119 bytes**；包含长 prompt 的 JSON.stringify 观测 **20次/242391 bytes→3次/48499 bytes**，后者包括新增草稿与冻结请求 journal，不隐去本地恢复成本。该度量不是所有 JSON 分配量、RSS、生产 RPS 或10万用户容量。
- `tsc --noEmit --incremental false`：通过；既有 canvas-node-drafts 55项、text-edit-history、video-polling-state 通过。polling旧测试按变量名匹配源码，首次因 actorRef 改 identity 失败，保存原日志后更新当前 guard 断言；真正生命周期行为由 hook matrix 验证，未删除其数据等价断言。
- 开发中一次19项矩阵出现3项失败来自 runner 重置数据库但保留上个 case 的 sessionStorage；保留 `ITERATION-journal-fixture-contamination/`，修正为 case 间 detach+clear，**reload 测试内部仍保留存储**。
- 未执行完整 Next 生产构建、完整画布页面 GUI、真实登录/团队撤权 service E2E、实际供应商/对象存储、生产容量。fixture HTTP 403 和真实仓储 owner 隔离不写成线上鉴权验收。

## 6. 证据、回滚和未完成

Ignored 根目录：`C:/Users/13357/.t3/worktrees/naumi/t3-400f2da1/output/capacity-canvas-transport/`。

- `MODIFIED_FILE`：三份业务源码内容与 SHA 清单，保留实际修复。
- `DIFF_FILE`：明确任务路径的完整差异，包含新增 queue/验证/本文。
- `VERIFICATION.txt`：baseline/modified/rollback 确切命令、输入、字面 stdout/stderr、exit、hash 与恢复行为。
- `ROLLBACK.sh`：可执行入口，只接受该 evidence 下指定副本目录；先核验所有修改版 hash 再恢复基线两文件/移除副本新增 queue。后改 guard 失败不写任何目标。工作源码与 MODIFIED_FILE 始终保留修复。
- baseline hook SHA256：`a6468777f57228a396f36b27b75e328de0872617370cf712a353a113988ea4f1`；其他原始/最终 hash 在 manifest。测试和文档本身不以业务回滚覆盖共享代码。

未完成优先级：文字每次 state 变化全量本地序列化及 persisted=false/无CAS；其他节点保存队列/本地草稿 cleanup；节点与任务重复轮询、列表大JSON/data URL；Agent流生命周期与Markdown另立切片。前端不能独自引入增量覆盖，后续需保持真实数据库revision/nonce/事务与授权。
