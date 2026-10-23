# 9f 初始镜像本机生图压力验收（测试任务，待发布 HOLD）

## 固定对象与结论

- 本任务仅新增测试脚本和本文档，无 `src/`、Dockerfile、依赖、产品权限或生产配置改动，无 SSH、外部供应商、服务器发布、浏览器操作。
- 被测 image：`sha256:1680624b3ed72ae9e25d6aa1702088ce4d64738c11c50ac06ba6a8ed80bccb62`（本机 tag `naumi:imagegen-simplify47-20261023`）。
- 被测 source：`9f049b07b4219b46ef8a5cb51bc49a4a0ad33e26`；build：`1792731828`。Web/Worker inspect 和真实 `/api/version` 均一致。
- 该 image **不是父任务最终修复候选**。以下只绑定 9f 初始镜像，不转移为最终版本的预算验收。
- 用户最后选择：**维持配置，合并后暂缓发布**。本测试无发布动作。父任务报告的主机余量与三锁 HOLD 属父任务证据，本任务未远程复测。
- 6/16 job、单 job 4 图后处理、真实 combined Worker 恢复通过本机 fixture 验收；8 图仍 `NOT_PROVEN`，详见失败边界。
- 16 job 峰距 3 GiB 硬限仅 **22,523,904 B（21.48 MiB，0.70%）**。本轮 OOM=0 不代表生产蓝绿容量充足，不降低 Web/Worker 限额。

## 输入、真实链路和预算

脚本：`scripts/verify-imagegen-fixed-image-pressure.ts`。

1. Docker VM 读取值 33,529,946,112 B、20 CPU；复用父本机 PostgreSQL `naumi-imagegen-simplify-pg-20261023`，只连接 `127.0.0.1:65433/simplify`。每组独立随机 `pressure_<32hex>` schema；未使用或清理 `simplify_fixture`。
2. host HTTP fixture 监听 `0.0.0.0:临时端口`，Docker 配置 `http://host.docker.internal:端口/v1`。仅模拟供应商/Router；真实 Next standalone、鉴权、DB lane、原 handler、输入解码、存储、parent receipt、计费均在原始固定 image 内执行。无产品 handler 替身。
3. 三张 refs 每张 4096×4096、高纹理 PNG 7,808,310 B；单次 multipart 约 23.43 MB；输出同尺寸同字节 PNG，以 base64 JSON 返回约 10.41 MB。素材 SHA256：`8000b5895e1b8a4692f186f367df74dde6ea9b8a84673b44e02b9b8260504d87`。纹理由固定随机 1024² RGB 放大四倍构成，非纯色/几 KB 图片，但不宣称覆盖所有随机 16MP、复杂透明或最大压缩熵输入。
4. 正式组 Web：`--memory 3g --memory-swap 3g`，cgroup `memory.max=3221225472`、`memory.swap.max=0`；`NODE_OPTIONS=--max-old-space-size=2688 --require=/app/scripts/release-http-observer.cjs`，真实 release runtime、固定 identity、admission=open。
5. Worker：同 image、`--memory 1g --memory-swap 1g --user 0:0`，原 `node scripts/video-worker-with-media.mjs`。真实 supervisor + uid1001 scanner + native sandbox media 进程，真实媒体启动自检；`mediaWorker.sandbox=true`、版本一致，持久 scanner/tick receipts。未启用 MEDIA_WORKER_FIXTURE_OWNER。
6. DB lane 明确 `NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE=6/16`、`..._IMAGEGEN=6/16`；独立模型配置 provider.maxConcurrent 和后台 `app_model_provider_budgets.max_concurrent` 同为 6/16。供应商首波门闩使本机 POST 重叠达到指定值，未因上游默认 4 误记 16 压测。
7. cgroup 采样在容器内 shell 中读取 `memory.current/peak/max/swap.max/events`，目标每 200 ms，正式有效组最大间隔 207–213 ms。`memory.peak` 是内核累计峰，不是 `docker stats` 或进程 RSS。原始逐点日志保留。

## 已执行有效组

单位均为字节。残余是任务完成后额外等待约 7 秒的最后采样，**不是泄漏结论/长期平台值**。

| 组 / 原始记录 | 成功 job / 最终输出 | 供应商 POST | 最大供应商重叠 / DB generate、imagegen 租约 | consume 账本 | Web memory.peak | Web 残余 | combined Worker peak / 残余 | oom / oom_kill |
|---|---:|---:|---|---|---:|---:|---:|---|
| run3 / 6 | 6/6、6/6 | 6 | 6 / 6、6 | 6 笔，各 -12 | 2,052,419,584 | 1,815,609,344 | 360,554,496 / 345,374,720 | 0 / 0 |
| run3 / 16 | 16/16、16/16 | 16 | 16 / 16、16 | 16 笔，各 -12 | 3,198,701,568 | 2,472,968,192 | 356,507,648 / 346,923,008 | 0 / 0 |
| run3 / 4 | 1/1、4/4 | 4 | 1 / 1、1 | 1 笔 -48 | 1,410,469,888 | 943,120,384 | 357,412,864 / 346,972,160 | 0 / 0 |
| run5 / worker | 1/1、1/1 | 1 | 1 / 6*、1 | 1 笔 -12 | 971,788,288 | 951,181,312 | 362,840,064 / 344,895,488 | 0 / 0 |

`*` Worker 组的 6 个 generate 租约是明确标记的测试 lane blockers，不是 6 个真实生图任务，不能拿此值声称 Worker 6 并发吞吐。

- 4 图组：同一父任务、同一 paid child 逐图 n=1 的 4 次供应商请求；4 个 PNG 原图各 7,808,310 B；真实 parent 本地 WebP 后处理生成最终 4 图，每张 1,786,734 B，保持 4096×4096。原图和最终图全部重新完整 raw 解码确认；单笔实际结算 48，无第二笔本地处理费用。
- 6/16/4 组的 consume 条数和 child 数一致；parent 无第二笔收费；billing operations 全部 settled、reserved_credits=0；app_gen_reservations 为空。
- Worker run5：先占满本 schema 的 generate lane；提交已持久化任务，供应商 POST=0；移除自有 blockers 后不以客户端 GET 驱动，原 combined scanner 经原 worker tick 恢复成功。最后才读取 HTTP parent receipt；重放同一个 accepted operation，新增供应商 POST=0，账本仍 1 笔。真实 tick phase=complete，留有 serverReceiptSha256。
- run4 同样的 Worker 恢复也通过，Web peak 971,448,320 B，combined Worker peak 357,265,408 B；run5 是最终脚本补齐 replay/精确清理后的验证。

## 未通过/未证明和前期夹具修正

- run1：真实 6 图/6 笔结算已发生，测试汇总 SELECT 错用了并不存在的 `app_artworks.width/height`，命令 exit=1，记录为汇总失败；不把修正前整体升级 PASS。原始结果与素材保留。
- run2：开启 release observer 时漏设 `NAUMI_RELEASE_ADMISSION_START`，原程序返回 `RELEASE_ADMISSION_START_REQUIRED`；未形成有效供应商压力。人工停止本测试 Node 进程、精确自有两容器/schema，保留配置失败记录，非容量/OOM 失败。
- run3 / 8：`origin=canvas,count=8` 被真实产品的 `CANVAS_PARAMETER_UNSUPPORTED` HTTP400 拒绝，POST=0；这是错误输入，不是压力容量结论。
- run3 / worker：最初 plan HTTP503 `权限服务暂时不可用`，POST=0；记录为权限/就绪预检失败，未改产品权限放行。后续真实 `/api/feature-access` 200 后 Worker 组通过。
- run4 / 8：改为非 Canvas `origin=generate,count=8` 后，HTTP response `.json()` 报 `Unexpected end of JSON input`；同期进程 stderr 有 `No number after minus sign in JSON at position 1`，supplier POST=0。旧脚本未保存该响应 HTTP 状态/原文，**接受状态、具体截断/解析原因和 8 图内存均 NOT_PROVEN**，不推断模型/容量失败，不推断不存在 accepted task。最终脚本已保留非 JSON 响应状态/headers/raw，父请求收尾后未再执行这组。
- run3/run4 整体命令观察 exit=1（含上述预检失败）；其中有效子组按独立 receipts/账本/文件/cgroup 给出局部 PASS，不改写整体 exit。
- 每个正式组是**新容器、新进程**启动，内核 memory.peak 覆盖启动及该组请求；Docker VM/page cache 未清空，不能称主机文件缓存完全冷态。
- 没有重复 warm-wave/长时间稳态/增长曲线，没有 native 视频媒体任务和生图混合执行，故 **warm sustained peak、mixed native、真实供应商延迟/吞吐、47 蓝绿资源预算、父最终镜像验收均 NOT_PROVEN**。
- 本机 combined Worker 峰 340–346 MiB 不能覆盖父方已测 653/655 MiB 冷峰，不用本轮低值定 512 MiB 预算。本任务仍按 1 GiB 硬限执行。

## 精确执行命令与证据位置

工作目录：`C:/Users/13357/.t3/worktrees/naumi/t3-b5cdab86`。

```powershell
$env:NAUMI_VERIFY_ISOLATED_DB='1'
# run3 原始正式压力组；含两组预检失败，观察 exit=1
node --conditions react-server --import tsx scripts/verify-imagegen-fixed-image-pressure.ts --cases=6,16,4,8,worker --output=output/imagegen-fixed-image-pressure-20261023/run3
# run4 非 Canvas8 + Worker；8 提交解析未证明、Worker通过，观察 exit=1
node --conditions react-server --import tsx scripts/verify-imagegen-fixed-image-pressure.ts --cases=8,worker --output=output/imagegen-fixed-image-pressure-20261023/run4
# 最终脚本 targeted Worker/replay/cleanup，exit=0
node --conditions react-server --import tsx scripts/verify-imagegen-fixed-image-pressure.ts --cases=worker --output=output/imagegen-fixed-image-pressure-20261023/run5
# baseline contract，exit=0
node --conditions react-server --import tsx scripts/verify-imagegen-contract.ts
# harness parser/image identity self-test，exit=0
node --conditions react-server --import tsx scripts/verify-imagegen-fixed-image-pressure.ts --self-test
```

脚本支持显式 `--image=sha256:... --source=<40hex> --build=<build>` 供父任务以后绑定新镜像；本轮实际只运行默认 9f image，没有构建/标记新候选。

完整证据目录：`C:/Users/13357/.t3/worktrees/naumi/t3-b5cdab86/output/imagegen-fixed-image-pressure-20261023`。

- `SUMMARY.json`：有效组和预检失败摘要。
- `run3/results.json`、`run4/results.json`、`run5/results.json`：请求/quote/POST 逐笔记录、parent receipts、每笔计费/consume、原文件路径/哈希/完整解码结果、固定容器命令及 inspect。
- 每组 `<schema>-web-cgroup.log`、`<schema>-worker-cgroup.log`：真实逐点 cgroup 日志；`<schema>-db-samples.json`：DB lane 租约采样。
- `<schema>-*-inspect.json`、`<schema>-*.log`：image/限额/无 swap、真实 native combined Worker/Next 日志。
- 各 `cleanup.json` 和根 `own-volume-cleanup.txt`：仅自有 schema/容器/匿名卷清理；父 PG 一直 running，其他 schema不动；host 临时 HTTP 已关闭。测试媒体与测量原文件保留。
- 根 `DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`：交接和仅测试文件撤回验证。回滚在另一份 baseline copy 执行，不删除当前已交付脚本，不触碰生产/数据库。

迭代同步：开工已 fetch origin/main，本测试从固定 source9f 开始；未合远端业务到此测试基线、未 merge main、未发布。父任务统一整合测试提交。
