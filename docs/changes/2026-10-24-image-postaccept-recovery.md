# 图片已成图后交付失败：恢复身份修复

## 本轮状态

- **15:18 后最新发布授权：**用户已明确“可以先无缝上线最新版么”，本轮47授权已更新，不再按此前暂缓发布处理。15:27真实三锁预检查发现当前same-boot 18条UNKNOWN、原扫描tick UNKNOWN及双槽RAM不足635MiB；当前结果为 `BLOCKED_BEFORE_CANDIDATE`，未部署。详见[蓝绿预检查](2026-10-24-image-postaccept-bluegreen-preflight.md)。下文HOLD均为此前收口时的历史状态。
- 基线：`3e1e402e97f098496601cb4a134743366b6f3e4b`；修改前工作树干净。
- 线上观测：47 Web/Worker 均为 `af22c6e5f149215cfd5bf862f781e95e67c88987` / `1792808190`。这不是本轮修复已经上线的声明。
- 已确认缺陷：根付费操作以整单 ID 登记，fan-out 供应操作使用 `root:image:index`；根恢复检查却只查 root，第一次 indexed Pending 可排一次查询，第二次在进入供应查询前被根身份检查阻断。
- 原始首次异常没有被旧日志保留。两张原图通过了真实 Node 环境中的图片校验；正则栈溢出未复现，不作为本轮根因。

## 实现范围

1. `image-gateway.ts` 增加请求内 `ImageIndexCheckpoint`，每张图片沿原 indexed ID 执行与恢复；没有持久跨用户共享上下文。
2. `durable-image-jobs.ts` 与 `channel-availability.ts` 修复根与子图片恢复身份。子检查点放在根 attempt 的 `children` 字典，不新增顶层 `paidOperations` 项，避免交付检查重复收集图片或误判 `allDone`。
3. 已完成子结果直接读取保存字节；已受理任务仅沿原身份查询。未知受理状态不成为另一笔生成 POST 的许可，多图不能凭第一张 pin 放行全部图片。
4. `channel-image-response.ts` 在原异常上关联固定处理阶段；`model-health/observe.ts` 记录有界内部诊断，原异常身份、cause 链及健康分类保持不变。
5. `imagegen/failure-evidence.ts` 仅输出允许的错误名称、代码和固定分类，最多四层 cause，拒绝原始 message/stack、提示词、URL 与凭据。
6. APIMart 逐图下载与像素解码通过后，复用同一 Response 的已验证标记，省去外层重复 JSON/base64/像素处理。原单图 32MiB、整包 48MiB 界限保持，不把健康成功当作已经交付。
7. 最终窄审发现并修正两项兼容边界：合法成本预设也能提供精确 accepted task 证明；原任务只读上下文在实际 transport 的所有 POST 边界检查，不再依赖是否配置 channelGuard，防止阶段路由在恢复时新建备选生成。

## 验证方法

- 原文件逐字节备份位于 `output/image-postaccept-recovery-fix-20261024/before/`，不覆盖旧备份。
- `scripts/verify-image-postaccept-recovery.cjs`：实际 TypeScript 模块/AST，外部仓储与网络为显式 fixture；覆盖原故障状态、分图检查点、原任务查询与重复结算边界。
- `scripts/verify-image-postaccept-diagnostics.cjs`：真实图片校验与 sharp，健康仓储为 fixture；验证阶段定位、cause 边界、敏感内容排除、日志异常不替换原错误。
- 集中运行前不以静态源码审阅或脚本编写完成宣称 PASS；每次运行的完整命令、stdout、stderr、exit 单独封存。
- 副本回滚只修改专用副本，产品工作树保持修复版；基线旧故障应复现，修复版应通过，恢复副本应恢复原故障。

## 真实历史任务与发布边界

- 修复前，两条历史失败分别为预占 8 / 12、实扣 0，原图存在而作品为 0。该值是补交前的故障快照，不是当前余额状态。
- 2026-10-24 12:41（Asia/Shanghai）已真实执行两单原结果补交：持三锁备份，按原 task/account/attempt/pin、冻结版本、原图 SHA 和 root token 校验，短事务补齐既有 root `done.result`；释放 child 锁后调用真实 `recoverStoredDelivery`，再分别回填父子 `recordImageStateTx`。未将 error 改回 pending，未进入生成入口。
- 实际补交回执：`ORIGINAL_REPAIR={"mode":"APPLIED","taskGets":2,"imageGets":2,"generationPosts":0,"taskStateReset":0}`，exit 0。两单均 `ok:true / complete:true`。
- 人物图原 child `job-2d385ad7-e9a1-468b-aceb-2c5359629ae0` 与主图原 child `job-05eeaf12-6e65-4166-b28a-13557511ccae` 各恢复一张 1536×2048 原图；确定性作品均 `completed` 且未删除。两父任务 `done / succeeded`，两子任务 `done / billing_settled=true / deliveryRecovery.complete=true`；四条父子 creation 均 `succeeded` 且各有一个输出证据。
- 两单沿原结算 ID 分别结算 8 / 12 积分，每单仅一条原 consume ledger，实际 `reserved_credits=0`、`RESERVATIONS=[]`。这是原任务首次完成结算，不是重复扣款。job 的历史 `reserved_cost` 8 / 12 未重写，不将其误读为当前仍有预占。
- 一次性补交脚本已处理 root 已 done、交付中断和 creation 回填中断的续跑分支。两单均证实单图、无必需后处理，原冻结 frame/resolution 与最终 1536×2048 尺寸匹配；没有用恢复函数单独的 `complete` 代替这些核对。该补交不修正其他任务或通用后处理失败边界。
- 原始 BI `unknown-result` 与 execution stage 历史状态保留，不伪造为本次重新生成成功。完整 apply、最终账务和可见记录位于忽略目录 `output/canvas-model-pricing-fix-20261024/IMAGE_POSTACCEPT_ORIGINAL_{APPLY,FINAL_READ,VISIBLE_READ}.json`。
- 服务器实时顶层仍有历史 `MIGRATED_CLEANUP_PENDING` / revision 818；当前 normal 子发布为 `COMPLETE`，所有 operation 已 ACK，runtimeRecovery 指向实际 af22c6e 进程。历史顶层状态不能直接推成新故障阻断，也不能删除重建；新发布仍需核对当前程序与原子状态绑定，不拿旧直接替换脚本当蓝绿入口。
- 最新 AGENTS 明确保留 47“维持配置、合并后暂缓发布”；本轮程序发布为 **HOLD**，不创建线上候选、切流或重启。原图补交成功与程序发布是两件事；本轮只读终检再次核实线上 Web/Worker 仍是 `af22c6e5f149215cfd5bf862f781e95e67c88987` / `1792808190`，没有把本地修复写成线上生效。

## 当前实测记录

- 基线：`BASELINE=REPRODUCED CASES=11 CHECKS=88 FAILURES=5 REAL_SUPPLIER_NETWORK=0 EVIDENCE=MOCK_AST EXIT=1`。两笔模拟旧状态均恢复在进入回调前被阻断，GET/POST 为 0。exit 1 是原故障复现，不是通过。
- 修复版：`MODIFIED=PASS CASES=11 CHECKS=142 FAILURES=0 REAL_SUPPLIER_NETWORK=0 EVIDENCE=MOCK_AST EXIT=0`。真实模块与显式 fixture；存量任务每单原 task GET=1、生成 POST=0，不当作生产 E2E。
- 真实隔离 PostgreSQL：`IMAGE_POSTACCEPT_POSTGRES=PASS CHECKS=18 REAL_POSTGRES=1 HTTP_CALLS=0 SUPPLIER_CALLS=0`，exit 0；包含上述两项边界的新增检查。
- 原 APIMart 真实隔离 PG + loopback suite：53 checks PASS，`REAL_PAID_API_CALLS=0`，exit 0；参考图传输另核 16 个文件。
- 内部异常留证：`IMAGE_POSTACCEPT_DIAGNOSTICS=PASS CHECKS=23 REAL_MODULE=1 SHARP=REAL HTTP_CALLS=0 DB_CALLS=0`，exit 0；包括实际适配器响应构造的原 48MiB 上限。
- 最终两项 P2 修正后，`node node_modules/typescript/bin/tsc --noEmit --incremental false` 再次 exit 0，stdout/stderr 均为空；`TSC_FINAL_P2.json` 记录 12:45–12:46 的真实执行，旧 `TSC.json` 保留为早期记录。
- 早期恢复 fixture 用 Hub Review `reconciling` 导致两项失败，改为普通 accepted `running` 后重跑通过；没有放宽产品 accepted 白名单。一次 PowerShell 包装引号错误导致隔离环境未注入，真实 suite 重跑通过，原失败记录保留。
- 第一版固定提交 `a1aed2dcbefd14afb716d2471743a93ed740f55d` 已推送，Linux 完整镜像构建 exit 0，91/91 静态页；仅候选，不是已上线。最终窄审的两项修正形成后续固定提交及新构建，不使用旧镜像冒充最终版。
- 第一版副本实际回滚已通过：7 原文件恢复、4 新文件删除；旧制品保留为 v1。最终第二版新增 transport，已另行封存并验收，不用 v1 替代 v2。
- 最终窄复审第二轮：指定 `channel-availability.ts`、`transport.ts` 与 PG 回归脚本只读审阅，原两项 P2 源码层关闭，新增确定性 P1=0 / P2=0。独立运行测试已覆盖公开无 channelGuard transport 入口；并未将其扩大为完整 A→422→B 运行覆盖或内层断言的单独运行证明。
- 产品修复已选择性提交并推送：`a1aed2dcbefd14afb716d2471743a93ed740f55d`、`147b9f4ec895da6571241377c6b7f9d32880c5f7`。最终产品源码固定后一提交；后续文档提交不改变该镜像源码身份。
- 最终 Linux/amd64 完整构建：固定产品提交 `147b9f4ec895da6571241377c6b7f9d32880c5f7`，候选版号 `1792815643`，镜像 `sha256:963523977e3f28fb6e6cb8e2676f85c326709e5056287c99aab0fc0d6e9f99df`；exit 0，91/91 静态页，公开更新说明校验通过。完整命令、12 个源文件 hash、镜像 inspect 和日志 hash 见 `LINUX_BUILD_V2.json`。这是本地镜像，不是已导入或已发布。
- 构建预检的首次字节断言因 PG 回归脚本 checkout CRLF / commit LF 不同而 exit 1，发生于 Docker 构建前。原记录 `LINUX_BUILD_V2_PRECHECK_FAILURE.json` 保留；最终构建逐文件核对精确 Git blob，明确记录该唯一换行差异，不修改产品或脚本来掩盖失败。旧 v1 构建上下文清理命令在执行前被拒绝，未重试删除，旧上下文/镜像/日志保留。
- 2026-10-24 12:50 后只读终检回执 `output/canvas-model-pricing-fix-20261024/IMAGE_POSTACCEPT_FINAL_OBSERVATION_R4.json` 再次确认原两单作品/回执/creation/结算闭环；线上 Web/Worker 的 ID、Image ID 和 `startedAt` 均未改变，公开版号仍 `1792808190`。本轮未部署或重启。
- 最终 v2 四制品位于 `output/image-postaccept-recovery-fix-20261024/artifacts-v2/`：`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、`ROLLBACK.sh`，均重开核对。范围 8 原文件＋4 新文件；ZIP CRC 与 12 entry hash 通过，第三份基线副本真实 patch 重放 exit 0，12 文件逐字节等于冻结修复字节。`ROLLBACK.sh` 的 chmod/test-x/bash-n 均 exit 0，真实工作区与无 marker 副本在写入前被拒绝。
- v2 专用副本真实回滚：`ROLLBACK=PASS RESTORED=8 DELETED=4`，exit 0；还原副本由同 hash relocated runner 运行 `--source-root` 得到 `MODIFIED=FAIL CASES=11 CHECKS=78 FAILURES=5 REAL_SUPPLIER_NETWORK=0 EVIDENCE=MOCK_AST EXIT=1`，fixtureError=0，恰好恢复旧五项错误。没有传 `--baseline`，所以跳过十条 baseline-only 断言，不把 78 与原 88 的差值误称测试丢失。
- 工作区及 `artifacts-v2/copies/modified` 保持修复态，父级 tests 与 v1 的 166 份受保护文件字节未变；回滚只作用于专用副本，没有回滚两条真实补交任务或生产账务。四制品完整 SHA-256、所有精确命令/输入/stdout/stderr/exit、原 hash 与复核结果见 `artifacts-v2/VERIFICATION.txt` 和 `artifacts-v2/evidence/FINAL_REOPEN.json`。
- 本轮收口状态：代码修复、定向验证、最终类型/构建、独占副本回滚及原两图补交均已有相应证据；47 程序发布保持 **HOLD／未部署**，未把这些结果扩大为全站稳定性或容量验收通过。
