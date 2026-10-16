# Worker tick Web boot 与 App preload 对齐

`workerTickWebIdentity` 原先总生成 module UUID，与 App release status/preload 的同进程 boot 不一致。现仅在 `NAUMI_RELEASE_BOOT_SOURCE=preload` 时精确采用已校验的 `NAUMI_RELEASE_BOOT_ID`，并在当前 `server` identity 明示 `bootSource=preload`；preload 标记存在但 ID 缺失/损坏则 503，不能回退猜测。

无可信 preload 标记时保留原 module UUID，明示 `bootSource=process-fallback`。未启用 release-runtime 的 fixture/legacy API继续兼容；此 fallback 只绑定该模块，不证明全进程覆盖，不得作为 App 完整排空或生命周期同 boot 证明。数据库已持久回执仍按其原 web.bootId 核验，不重写历史 boot、重跑 tick 或迁移业务数据。

验证：`tsx --conditions react-server scripts/verify-worker-tick-boot.ts`，15检查，精确等于App releaseIdentity/preload、无效preload拒绝、伪造环境ID忽略、稳定fallback、缺固定identity拒绝；无DB/供应商调用。既有隔离PG/HTTP59项与runner23单元集中复跑。仅候选代码，未操作服务器。
