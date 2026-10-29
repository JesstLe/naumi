# X5 父线程修复：结果引用的 job 绑定与选择性交付解码

## 模块、基线与状态

- 父线程隔离树 `codex/capacity-audit-wave2-20261029`；修复前 `41601e1eb4fdd6fe2a3de3f80ad5302834c1f81b`，包含 X5 `36909cfb` 和最新 main 发布文档，未包含后续 tick v2、画布保存或重构线。
- 独立审查发现两个真实阻断：P1 用户 JSON `style` 携带内部 marker，payload 解码读取另一 job 的已知 checkpoint；P2 恢复入口先 hydrate 全 snapshot，无关坏 child 阻断可用最终图或 root。
- 本文是本地源码与隔离验收记录。47 仍运行上一轮固定 `e1878018 / 1793247893`；本修复未部署。

## 公共接口、依赖与归属

- `decodeImageJobValue(value, resultJobId?)`：结果解码调用方传真实 job ID；payload 不传结果读取身份。新 `$imageJobStorage` 引用缺身份、有效 SHA256 或大小时，在对象读取前拒绝。
- `readImageJobResult(url, location, maxBytes, jobId?)`：有 job ID 时在任何本地/远程 I/O 前校验对象 key 的 job hash。未带 job ID 的既有 media mirror 调用只接受其数据库目录所拥有的 key；不让用户输入走这个调用方。
- `DurableImageJobs.get`、已完成 root/child 复用、kick snapshot 均传 job ID；kick payload 保持无结果权限。原 `get(id,false)`、operation/attemptToken、租约、CAS、hold 与结算不变。
- 新 `selectStoredDeliveryCheckpoint` 为纯选择函数，保留最终图优先、root 完成状态和 UNKNOWN 判定；原 `storedDeliveryCheckpoint` 投影接口继续供旧调用方使用。
- `recoverStoredDelivery` 授权并锁定 parent/child 后先选择所需结果，再仅解码所选 URL，不遍历其余 metadata/paid children。必要对象缺失仍失败，不发送供应商请求。
- JSON generate-image 入口校验文字字段真实类型及 parentIds 字符串数组；对象型 style 在进入生成/持久 payload 前返回 400。正常文字及 multipart 入口保持。

## 复现与集中验证

证据目录：`output/capacity-audit-wave2-20261029/x5-boundaries/`。

### 精确边界检查（实际模块 + I/O seam，无 PG/网络）

```text
node scripts/verify-x5-boundaries.cjs output/capacity-audit-wave2-20261029/x5-boundaries/baseline baseline
PAYLOAD_MARKER=READ OBJECT_READS=1 JSON_STYLE=ACCEPTED
SELECTED_FINAL=UNRELATED_MISSING READS=2
SELECTED_ROOT=UNRELATED_MISSING READS=2
X5_BOUNDARIES_BASELINE=PASS CHECKS=11 NETWORK=0 DB=0 SUPPLIER_CALLS=0
exit 0

node scripts/verify-x5-boundaries.cjs . modified
PAYLOAD_MARKER=REJECTED OBJECT_READS=0 JSON_STYLE=REJECTED
SELECTED_FINAL=PASS READS=0
SELECTED_ROOT=PASS READS=1
X5_BOUNDARIES_MODIFIED=PASS CHECKS=11 NETWORK=0 DB=0 SUPPLIER_CALLS=0
exit 0
```

BASELINE 的 PASS 表示成功重现，不代表原代码安全。跨 job、缺 hash、新引用正常恢复、历史 input marker、必要对象缺失与 UNKNOWN 不读取均有对照。

### 真实隔离 PostgreSQL / 原生应用模块

复用本任务所有、已停的 `naumi-x5-result-590d9543` 本地 fixture，绑定 `127.0.0.1:55435`，不读取生产连接资料。

- `node scripts/verify-image-result-storage.cjs . modified`：`X5_MODIFIED=PASS`，exit 0。原存储、失败 inline 保留、丢租不发布/不扣款、历史读取、父子去重、私有对象、原字节/像素、账务与本地 S3/mirror 回归保持。
- `node scripts/verify-image-result-storage-native.cjs`：真实签名 Cookie 与公开 POST 对对象 style 返回原格式错误 400；历史恶意 payload 经实际 create/kick 被拒绝，另一账号作品 0、执行回调 0。可用 final/root 与坏 child 两例均恢复真实像素；必要引用缺失拒绝。`NATIVE_SELECTED_DELIVERY=PASS`、原交付 ledger 1 笔 6 积分、跨 owner GET 403/media 404，exit 0。
- 原生并发脚本本轮 `ACCEPTED_TIMEOUT=PASS ACTUAL_POSTS=1 PAID_STATE=started REPLAYS=0`；原生 route、冻结账务、并发容量、UNKNOWN、防重放均通过，exit 0。上轮 accepted-timeout `done/result=[]` 失败日志保留；未修改 transport 或放宽断言，一次本轮通过不等于解释了原波动根因。
- 原生终态回归 4 项通过；全项目 `tsc --noEmit --incremental false` exit 0。

## 原有失败与测试修正

- 初次纯模块 baseline fixture 漏复制未改的 `image-upload-policy.ts`，ENOENT；补完整同版依赖后复现通过，不登记为产品 bug。
- 原生恶意 payload 用例首次在异步 kick 尚未收尾时读取 pending，测试失败；改为沿既有有界等待检查真实 lease 释放和 error，未替生产补监听/锁/状态。原失败记录 `NATIVE_FINAL.json` 保留，最终记录 `NATIVE_VERIFIED.json`。
- `verify-image-postaccept-recovery.cjs` 基线/修改均因旧 loader 缺 `image-plan-runtime.ts` 失败；`verify-image-delivery-retry.cjs` 基线/修改均得到 error≠done。保存两版日志，不把这些套件写成全绿，不以补桩掩盖。

## 回滚和未完成项

四产物 `MODIFIED_FILE`、`DIFF_FILE`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh` 保存在上述目录。仅对固定 marker 的独立副本执行全文件 hash guard 回滚；恢复原文件与原两个缺陷，修改源码保留。原 X5 字节外置的上线前提仍有效：跨实例共享存储、真实 NAS/R2 配置与旧 reader 回滚兼容必须另行验收；没有存量批迁移或孤儿对象清理。

后续 tick v2、画布保存独立复核及 release snapshot 采集器切片各由隔离子任务处理；账务热路径、运行时、Agent/SSE、视频上传仍在持续队列。
