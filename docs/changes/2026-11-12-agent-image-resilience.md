# 2026-11-12 画布 Agent 侧边栏原图破图修复（瞬态失败韧性 + legacy 原图描述符修复）

模块与职责：
- `src/components/cached-image.tsx`（前端受管图片组件）：blob 租约展示、reset/invalidate 事件响应、授权失败语义。
- `src/lib/browser-image-cache.ts`（浏览器图片缓存）：descriptor 批量授权、IDB 字节缓存、direct media 兜底。
- `src/lib/media/representation.ts`（媒体表示解析）：原始/变体表示选择与 legacy 目录修复。
- `src/lib/media-assets.ts`（媒体资产目录）：`importLegacyMedia` 目录行注册。

公共接口、依赖方向、数据/状态/事务归属：
- 新增导出 `ImageCacheUnavailable extends Error`（browser-image-cache.ts），语义为「descriptor 与直连 media 均失败的可恢复故障」，与 `ImageCacheDenied`（授权决定，永久语义）区分；`readBrowserImage` 的 instanceof 分支不受影响（非 Denied 继续走 /api/download 兜底，行为增强）。
- CachedImage 获取失败分类处理：`ImageCacheDenied` → 维持原 denied 图标语义；其余错误（网络/5xx/429/Unavailable）→ 有界重试（800ms、4s 两次），耗尽后保持空白帧（不画永久破图）；会话 reset 事件清零重试预算并触发重取。
- `resolveMediaRepresentation`：无 variant 的原始图分支补齐与变体分支一致的 `importLegacyMedia` 兜底（legacyOptional 语义保留：GET 字节路由严格抛错、manifest 可选吞错返回 null）。
- `importLegacyMedia`：按字节真实来源登记 `remote_ready`（本地镜像 stat 失败 → true）。此前硬编码 false 会毒化远程来源的目录行（后续 `readManagedObject` 对 remote_ready=false 且无本地镜像的行严格抛错），使原始图永久不可解析。
- 依赖方向不变：组件 → cache 库；manifest 路由 → representation → media-assets；无反向依赖。

本次实现与迁移状态：
- 背景：画布 Agent 侧边栏原图在点击其他位置（工作空间/账号等会话事件）后强制重授权，凡 descriptor null（legacy/远程原图无目录行）或重取瞬态失败，一律被画成永久破图图标且不再自愈；而同一资产的缩略图（f790dfd3 起画布各处已切 variant）因变体分支有 legacy 兜底而正常显示。
- 服务端：原始图 descriptor 修复（representation 原始分支 legacy import + importLegacyMedia 真实 remote_ready）。
- 客户端：瞬态故障不再永久破图（有界重试 → 空白 → 下一会话事件自愈）；真授权拒绝语义保持。
- 迁移状态：已实现，全部验证通过，随本次合并进入 main；无数据迁移（目录行由 importLegacyMedia 按需自建）。

验证命令、结果及证据层级：
- `node scripts/verify-agent-image-resilience.mjs`（新增，真实 CachedImage + 无头 Edge + 回环 fixture）：5 checks PASS —— descriptor 故障直连兜底快速恢复、descriptor+media 双失败重试预算耗尽保持空白（非破图）、会话事件自愈、真拒绝 denied 语义保持、focus revalidate 行为保持（52d0878e 不回退）。
- `node scripts/verify-media-original-repair.mjs`（新增，esbuild 模块级）：8 checks PASS —— 原始分支触发 legacy import、有行不重导入、GET 严格语义保留、可选模式吞错、变体解析不变、本地镜像登记 local-first、远程来源登记 remote_ready（毒化修复）、已有行短路。
- 既有回归：`node scripts/verify-browser-image-focus.mjs . modified` 21 checks PASS；`npx tsx --require ./scripts/enterprise-integration-test-preload.cjs scripts/verify-canvas-image-stability.mjs`（fixture Postgres 55479 + MEDIA_PRIVATE=1）14 checks PASS。
- 类型：`npx tsc --noEmit` 通过。
- 变异验证 4/4 捕获：还原 catch 无条件 setDenied（t2 失败）、Unavailable 改回 Denied（t2 失败）、删除原始分支 import（s1 失败）、删除 remote_ready 判定（套件报错）。
- `scripts/verify-browser-image-cache.ts`：API 层断言（401/403、跨账号拒绝、legacy 缩略图 webp、public 隔离）全部通过；整套浏览器步骤被本机预存环境问题阻塞 —— next dev 编译 middleware 时 `node:child_process`（sharp → model-config/seedream-preflight 导入链）UnhandledSchemeError 导致路由 404，导入链与本次文件无关，非本任务回归，留待独立任务处理 dev 环境或改用生产构建跑门禁。

未完成项与下一步：
- 本机 next dev 的 sharp/middleware 编译问题独立排查（影响 verify-browser-image-cache.ts、verify-image-cache-scoped-media.ts 的完整浏览器步骤）。
- descriptor null 的负结果无记忆化：真正不存在的 key 每次授权会尝试一次 legacy import（与变体分支既有行为一致）；若线上日志显示异常放大再收敛。
- 观测：发布后关注 `/api/media/image-cache` 中原图 descriptor null 是否清零、用户侧破图反馈是否消失。

2026-11-17 补核：坏缓存被清除后，如果下载成功且返回的 Blob 仍无法解码，`CachedImage` 会发出一次普通图片错误，不再按网络异常重取，也不会把坏字节标成未授权。超时、5xx、授权边界和直读超大图片的有界恢复保持不变。真实 Edge/IndexedDB 回归 14 项通过，新增精确核对只有一次媒体修复请求；原先的瞬时故障回归也通过 5 项。无生产请求或供应商调用；尚未上线。
