# 2026-10-29 X5：paid result 图字节外置（首个完整切片）

## 模块与职责、基线

- 工作树：`C:/Users/13357/.t3/worktrees/naumi/t3-590d9543`，工具准备的 `t3/x5-result-storage` 分支，开工干净。未创建/切换 checkout，未修改共享树、总 ledger 或 A/D 编号。
- 基线 HEAD 与首次 fetch 的 origin/main：`c63ceb1392e1918f8ed9ddfee7389ec2d677a4dd`。收尾 fetch：`a65a65d02b0fc5fd46a0eafa5f0f015559446c1c`，只增加 X4 parser/验收/文档，没有本切片同文件修改；未自行合并。
- 范围：`durable-image-jobs` 的存储表示、独立 `image-job-codec`、现有 storage 的窄接口、原结果恢复识别与内部对象访问隔离。repository、lease/fencing、计费、model-config、sharp/postprocess 实现未修改。
- 本次只做本地代码、独占 PG、local/S3 HTTP fixture；没有 SSH、生产写入、生产压力/故障注入、供应商调用、部署/切流/重启。47 HOLD 保持；45 笔手术及 created_at 在线索引仍挂账。

## 先证实：不是所有 snapshot 都有内联图片

`node scripts/verify-image-result-storage.cjs output/capacity-x5-20261029/baseline baseline`，exit 0，`X5_BASELINE=REPRODUCED` 表示复现原表示，非修复通过。

输入：程序生成真实 **768×512、RGB PNG，1,182,147 字节**；SHA-256 `8732747a86d89e92b6685855cae4ba346ed44681d6cc24ee2f483caf5de5ad66`。压缩级别 0 只是制造稳定的大字节样本，不改产品图像质量；真实像素逐字节比较。root 含一份 url + 一份 b64_json；root+child 样本含两个 child，第一个 url+b64、第二个 url，root 收集两 child 返回值。

- 基线 root：snapshot JSON UTF-8 **3,152,658** 字节，字符串内联。
- 基线 root+child：**4,729,715** 字节；child 已外置，但汇总 root 重新存字符串。
- 基线纯 Buffer root：**346** 字节，已经外置，未谎报为新增能力。
- 修改 root：**910** 字节；root+child：**2,609** 字节；Buffer root：**518** 字节（增加位置/hash/长度元数据）。
- 相同 job / 同内容多种表示和重复保存映射同一 key；root 样本只有一个 **1,182,147** 字节对象。子级与 root 的操作身份没有提升或重编号。
- 这些值是 `Buffer.byteLength(JSON.stringify(snapshot))`，**不是 PG 行/TOAST/表尺寸、RSS、延迟、吞吐或生产量化**；没有复用历史 GLM 数值冒充本轮结果。

## 公共接口、依赖方向、状态与事务归属

`DurableImageJobs` → `image-job-codec` → 现有 `storage` → local / S3 / R2 adapter；lease、paid intent、CAS 和账务仍在现有执行器/repository。

1. `get(id,false)` 仍返回原存储形态，供 CAS 和用户 GET 投影。`get(id,true)` / 内部恢复 decode 还原 SDK 所需 data URL / b64_json / Buffer；没有将用户 GET 改成 hydrate。
2. `create/set/patch` 的 snapshot 编码只解释 `paidOperations.*.result` 与其原 children.result 中的 url/b64_json/Buffer；prompt/revised_prompt、无效编码字符串、普通 metadata 及已存 marker 保持原值。Payload/input Buffer 的历史存储形式保持，恢复后保留弱引用复用缓存。
3. `encodeImageJobResult` 使用原 `dataUrlToBytes`，不新增大正则、不改 X4 helper。key 为 `image-job-results/<sha256(job-id)>/<sha256(bytes)>.bin`，引用保存 `sha256` / `size` / `$imageJobStorage`，decode 复核内容。不同任务不会共享对象 key。
4. `writeImageJobResult` / `readImageJobResult` 是新增窄接口：私有 remote 配置沿用现有 remote-first、local mirror、catalog retry；禁用缩略图生成。旧公共 remote 配置的内部 checkpoint **只落本站现有 local storage**，不向公共 bucket 写付费结果、不返回公网 URL；位置标记允许之后按原位置读取。
5. 内部 `image-job-results/` 不是可展示媒体：`/media` 无条件 404（包括旧公共媒体配置、Windows 大小写变体）；`canReadMedia` 拒绝；通用 `readManagedObject` 拒绝。只有已授权业务恢复入口调用内部 decoder；最终 artwork 仍用原媒体目录/归属/授权与画布约定。媒体路由同时拒绝单独 `.` 路径段，避免归一化绕过该命名空间。
6. 所有对象上传在 job DB 事务外，编码后仍走原 `context.lease.assertActive()` 和 `repository.saveImageJob`。失租后对象可以成为未引用孤儿，旧 owner 不强制发布/扣款、不清 UNKNOWN，不自行清对象。
7. 上传或登记失败：**不发布悬空引用，也不丢付费结果**。在原 checkpoint 存带 sha/size 的 `$imageJobInlineBuffer` 及有界 `storageFailure=CHECKPOINT_UPLOAD_FAILED`，原 operation/attemptToken/state/children 保留；普通 metadata patch 不自动重传或重提供应商。内部读取可恢复原字节。
8. `storedDeliveryCheckpoint` 与 `storedDeliveryState` 识别新 marker；poll SQL 只判断轻量证据，不下载图。真正的 `recoverStoredDelivery` 在原 owner/parent/child/lease 检查后 decode，再走原处理、作品、结算和回执路径。损坏/缺失引用不伪装成功，也不授权 POST。
9. X2 稳定接口保持：kick 唯一执行入口；get(false)、set/patch fencing、holdImageJobBilling(id,token)、assertImageJobLease / ImageJobLeaseLostError、原收费身份均未改。

## 集中验证及证据层级

证据根：`output/capacity-x5-20261029/`（ignored，保留实际输入图、日志、baseline/modified/rollback 副本）。

### A. 真实 PG + 真实存储实现 + 明确控制 seam

命令：

```text
node scripts/verify-image-result-storage.cjs output/capacity-x5-20261029/baseline baseline
node scripts/verify-image-result-storage.cjs . modified
```

- 独占容器：`naumi-x5-result-590d9543`，label `naumi.fixture.owner=t3-590d9543`，PostgreSQL 16 Alpine，绑定 `127.0.0.1:55435`；仅本任务库 `naumi_x5_isolated` 与 `naumi_x5_native`。测试账号口令仅 fixture，不读继承 DATABASE_URL/.env/生产凭据。
- 使用指定依赖的只读 junction：React 19.3.0 / pg 8.20.0；没有向共享依赖执行安装或写入。
- 真实 repository / paidOperation / gateway / billing、真实 PG、真实原子 local 文件写读、本地 HTTP 回调；release/activity/model 配置与无关 creation evidence 明确是 fixture seam。PG pool Client 原样使用，不替生产补 error listener。
- root/child data URL、base64、Buffer；新 OS 进程恢复；原 token；重复保存幂等 key；成功 sibling + UNKNOWN 不 POST；历史内联及旧三种 marker；历史 JSON Buffer decode；内容损坏拒绝；上传失败保留；上传后失租拒绝发布/扣费；轻量 recovery proof、跨 owner 与原 GET 投影均通过。
- 本地 S3 HTTP fixture 使用现有签名 adapter：remote PUT/GET、重复内容 key、远端失败后的 durable mirror、公共 remote 配置零 PUT / 内部路径 404，通过；不冒称真实 R2/生产 NAS 验收。
- `UPLOAD_DB_TRANSACTIONS=0` 是上传期间采样本 fixture pool 无 idle-in-transaction，并结合源码入口顺序；不是全站任意 I/O 无事务的证明。

### B. 原生应用、实际签名 Cookie、原恢复入口

```text
node scripts/verify-image-result-storage-native.cjs
```

runner 只给子进程明确 local-only 环境；TS 不加载 .env。真实 db schema、原生模块、真实 HTTP callback、真实作品写入、真实 signed Cookie/auth/media handler、实际原账务，不用上述 VM 的业务 mock。

字面结果（exit 0）：

```text
NATIVE_RESTART=PASS ORIGINAL_BYTES=MATCH
NATIVE_RECOVERY=PASS SNAPSHOT_BYTES=681 OBJECT_BYTES=788300 HTTP_POSTS=1 RECOVERY_POSTS=0 LEDGER=1 DELTA=-6 GET_BYTES=325 CROSS_OWNER_JOB=403 CROSS_OWNER_MEDIA=404
NATIVE_EXIT_STATUS=0
```

这里是另一张 **512×512 RGB PNG / 788,300 字节**；正常业务 checkpoint 后人工模拟本 fixture 交付中断，原生恢复只读原结果。父/子最终回执、作品、字节/hash、原 token、重复恢复仅一笔账验证通过；未做完整 Next 服务器/浏览器或生产容量验收。

### C. 原有模块回归

```text
node scripts/verify-image-result-storage-native.cjs scripts/verify-image-concurrency-convergence.ts
node scripts/verify-image-result-storage-native.cjs scripts/verify-image-terminal-failure.ts
node scripts/verify-image-result-storage-native.cjs scripts/verify-billing-rules.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
```

全部 exit 0。并发测试含真实 route/HTTP/billing、预算前零 POST、accepted timeout、UNKNOWN 不重放、过期 lease CAS、BYOK、批调度；终态 4 项；动态/冻结计价与部分成功规则通过。日志分别为 `NATIVE-CONCURRENCY.log` / `TERMINAL.log` / `BILLING.log` / `TSC.log`。

X2 验收仅把脚本副本的固定 fixture root、端口、库名、测试用户名改为本任务独占目标，未改产品模块/断言；副本保留于 output。运行：

```powershell
$env:NAUMI_X2_TEST_DATABASE_URL='postgresql://x5_fixture:x5_fixture_only@127.0.0.1:55435/naumi_x5_isolated'
node output/capacity-x5-20261029/verify-image-job-lease.cjs . modified
node output/capacity-x5-20261029/verify-image-heartbeat-connection.cjs src/lib/image-job-repository.ts modified
```

exit 0，`X2_MODIFIED=PASS` 与 `HEARTBEAT_CONNECTION_MODIFIED=PASS CHILD_EXIT=0 SUPPLIER_CALLS=0`。心跳专测使用真实借出 Client、真实 fixture backend 断开，测试不替生产加 listener；280 秒 wall-clock 未重跑，不冒认前批证据。

### 保留失败与明确未覆盖

- `FAIL-harness-dynamic-import.log`：首版 VM 使用 esbuild 留下动态 import，真实存储调用未运行；改 TypeScript CommonJS 加载器后重测。未把此失败当产品缺陷。
- `FAIL-fixture-release-cooldown.log`：fixture 忽略原 10 秒 release backoff；仅对本库无 lease_token 行过期 backoff，增加 callback 确实执行断言，未改业务限制。
- `FAIL-fixture-encoding.log`：编辑脚本用平台编码读中文断言造成 mojibake；固定 UTF-8 后重测。
- `FAIL-proof-sql-parenthesis.log`：新增 proof SQL 首次真实 PG 测试暴露少括号，已修并通过正常/畸形值用例。
- `FAIL-fixture-quote-types.log`：新 native fixture 的 BillingFacts/FeatureTariff 缺必填字段；补真实字段后全项目 tsc exit 0，未弱化类型/计价。
- 前批 enterprise 401≠404、扩展 review 的 PUBLISH_STALE_DRAFT_BASE 仍保留父台账状态；本轮没跑完整扩展 review，不宣称其已解决。

## 回滚、产物与父线程接口

四个实际产物均重开核验：

- `output/capacity-x5-20261029/MODIFIED_FILE`：明确路径/原 hash/修改 hash 的 manifest，修改文件副本在相邻 `modified/`。
- `output/capacity-x5-20261029/DIFF_FILE`：本任务完整差异。
- `output/capacity-x5-20261029/VERIFICATION.txt`：BASELINE / MODIFIED / ROLLBACK 的完整命令、输入、字面输出、退出状态及恢复行为。
- `output/capacity-x5-20261029/ROLLBACK.sh`：可执行，仅固定 `rollback-copy` 且 marker/hash 全部匹配才操作。后来编辑 guard 被实际测试拒绝；再还原该 fixture 编辑后回滚，通过相同 baseline 复现原 inline 行为。主源码和 `modified/` 保持修复。

这不是生产回滚脚本：新 `$imageJobStorage` / `$imageJobInlineBuffer` 需要兼容 reader，发布前必须明确回滚镜像保留该读取能力；不能把本地副本回滚等同新对象/新失败 marker 可由所有旧镜像正确恢复。没有迁移/删除生产存量或替旧任务新建收费身份。

父线程建议：将 X5/B1/B2 的 **paid result root 外置子项** 记为“隔离实测修复，待串行合并，未部署”；Buffer/child 原来已外置，避免把它们算作本次从零新增。调用接口未改变，增加 codec/storage 内部接口与媒体命名空间保护是本切片必需链路。

未完成项：历史存量显式迁移（先记录原 job/operation/attemptToken/content hash 并可重读、失败留证）、孤儿对象引用审计/保留期、其他字段/最终 upload 失败后仍内联的历史/降级结果、内部 hydrate 的重复下载/瞬时内存、真正 R2/NAS/多实例共享媒体及容量验收。无自动迁移/清理；不为追求 snapshot 纯引用删除付费原字节。图片/媒体并发另需像素/RSS 核算，不在此切片调大。

收尾：只提交明确任务路径，不 push、不合并 main、不 PR、不发布。停止本任务容器/关闭 HTTP server 与连接池，保留 ignored 证据；不停止或清理其他容器/库。固定提交完整 SHA 由最终交接返回。
