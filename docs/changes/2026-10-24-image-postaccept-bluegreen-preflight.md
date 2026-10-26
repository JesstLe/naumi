# 图片恢复修复：47 蓝绿发布前检查（2026-10-24）

## 最新授权与本轮结果

- 用户最新指令：“可以先无缝上线最新版么”。本次47发布已获授权，覆盖本会话此前暂缓发布；不是继续等待授权。
- 当前结果：`BLOCKED_BEFORE_CANDIDATE`，**程序未部署**。新阻断是当前活进程的未决观察及双槽资源不足，不是顶层历史 `MIGRATED_CLEANUP_PENDING`。
- 2026-10-24 15:27:56（Asia/Shanghai）真实三锁检查，持锁后校验 canonical/recovery manifest、Web/Worker配置pin、实际状态、服务端原tick回执与MemAvailable，再重核原字节与实例身份，最后释放三锁。
- 现场原始回执：`output/canvas-model-pricing-fix-20261024/POSTACCEPT_BLUEGREEN_LOCKED_PREFLIGHT_R1.json`；远端证据 `/opt/naumi-staging/evidence/canvas-model-pricing-20261024/postaccept-bluegreen-preflight-20261024-r1/PREFLIGHT_BLOCKED.json`。

## 固定程序与同事分支复核

- 本轮产品候选 `147b9f4ec895da6571241377c6b7f9d32880c5f7` / `1792815643`，固定Linux镜像 `sha256:963523977e3f28fb6e6cb8e2676f85c326709e5056287c99aab0fc0d6e9f99df`，已有类型、完整Linux build、定向恢复、PG、原适配器及副本回滚证据。
- `origin/main=905c8c635e41ff3f4443d43db9776d1db3aab469` 无候选遗漏；quality业务0fbdd5a8已经通过9fc28451合入。quality后继仅文档。
- 性能分支74c5ca29的模块本地完成但checkout错误被当busy返回的复审P2仍在；core-refactor cc0e7b03已完成阶段切片，但整体与最终构建验收尚未收口。本轮不临时整支混入，不把它们叫作纯研究或已部署。

## 实际阻断

1. 旧Web `unknownLeases=18`：当前boot `81d817d3-a982-4346-8061-ee00e576d6dd`，17条media-variant和1条durable-image recovery-dispatch-scan；均 `unknown/background-promise-unconfirmed`。其中扫描项不是一笔generate付费任务，不能套用job隔离。
2. Worker `paused=true / phase=UNKNOWN / unresolvedTicks=1`。原tick `69187631-fc68-413a-a987-fead0a7b66cf`，服务端同样 `phase=unknown / completed_at=null / result=null`，所以不是仅丢失响应，既有GET reconcile没有completed回执可验证。
3. 真实MemAvailable **3973 MiB**；保持现有Web 2560 + combined Worker 1024 + 主机余量1024，需要 **4608 MiB**，差 **635 MiB**。不把Swap当RAM，不把候选降回已出现OOM的2GiB来规避门槛。

15:10–15:11 Web日志有 `Error: timeout exceeded when trying to connect`；之后PG只读观测为10连接、9idle、0idle-in-transaction。17份媒体元数据均有thumbnail/preview，但这些事实不等于原unknown观察及原tick已经结案。当前live-boot不符合既有dead-boot工具，未清unknown或伪写扫描成功。

## 精确操作与保留状态

```text
python output/canvas-model-pricing-fix-20261024/remote.py --name POSTACCEPT_BLUEGREEN_LOCKED_PREFLIGHT_R1 --script output/image-postaccept-bluegreen-20261024/locked-preflight.sh --timeout 55
THREE_LOCKS=ACQUIRED
DEPLOY_PREFLIGHT=... phase=BLOCKED_BEFORE_CANDIDATE ...
THREE_LOCKS=RELEASED
EXIT_STATUS=78
```

- Web/Worker仍运行原 `af22c6e5f149215cfd5bf862f781e95e67c88987` / `1792808190`；容器ID、startedAt、image未改变。
- canonical revision仍818、原字节未改，nginx完整closure字节hash未改；只在远端专用证据目录新增报告。
- 候选创建0、切流0、旧槽停止0、Worker resume0、付费重放0、DB恢复0；未改用户账务或补交任务。
- 下一步实际缺项：处理当前same-boot观察/原扫描未决的精确收尾协议及证明派生执行归属、终止边界；补足至少当前缺口的双槽RAM余量，再重新持锁刷新现场并推进蓝绿。发布授权本身已具备，不将此结果继续标为旧HOLD。
