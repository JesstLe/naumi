# X4：大字符串解析审计与 New API URL 线性扫描

## 工作树、基线与结论

- 独立工具工作树：`C:/Users/13357/.t3/worktrees/naumi/t3-d18a0f13`，分支 `t3/linear-image-parsing`；初始 `git status --short` 为空。
- HEAD / 开工 `git fetch origin main` 后的 origin/main：`c63ceb1392e1918f8ed9ddfee7389ec2d677a4dd`。沿用工具提供的分支，没有创建、切换或合并 checkout。
- 已读 AGENTS、AGENT_COLLABORATION、capacity-audit 第七章末与 `2026-10-28-dataurl-decoder.md`。总 ledger 和 A/D 编号由父线程维护，本文仅提交 X4 建议。
- **本轮未证实两处 supplier / reverse-hub 简单 Base64 字符类爆栈。** Node `v24.19.0` 下，原模式在 1、8、44 MiB 正向、尾部非法、Unicode 空白输入上均正常返回；真实函数处理 4,202,552 字符 PNG 也通过。保留两处源码，不用无故更换解析器制造语义漂移，不把旧 data URL 事故归因于这些模式。
- **已证实并修复：`new-api-image.ts::extractImageUrl` 的 Markdown URL 搜索二次方扫描。** 未闭合 `![` 让 `[^\]]*` 从每个起点重试；缺右括号的重复候选也有同类退化。1 MiB 输入在原函数子进程超过 5 秒，在真实 HTTP → JSON → `generateNewApiImage` 超过 10 秒。此项是 CPU 同步阻塞，不是已观察到的 RangeError 或生产事故。

## 模块与职责

公共接口、依赖方向、数据/状态/事务归属：

- 修改仅限现有 New API 响应转换内部函数 `extractImageUrl(content: string): string`，不增加导出接口、通用解析平台或新依赖。
- New API 转换器仍先识别原有 inline data URL，再选择最后一张完整 Markdown 图片；没有 Markdown 图片时取最后一个裸 HTTP(S) URL。
- Markdown 分支改为单次向前状态扫描，记录 label / URL 起止偏移；裸 URL 分支沿用线性字符类，但不再 `Array.from` 保存全部匹配。时间 O(n)，解析状态 O(1)，返回字符串和既有 JSON/响应本体的内存并非 O(1)。
- `/\s/` 只检查单个 code unit，保持 ECMAScript Unicode 空白规则；畸形/嵌套 Markdown 的优先级和旧贪婪匹配由差分用例约束。
- 原 `storage.dataUrlToBytes` 是 data URL 唯一既有格式契约，本轮直接调用验证，不复制第二套 MIME/Base64 规则。未修改原生 storage、durable-image-jobs、imagegen/sharp、计费、operation、attemptToken 或 fencing。
- 来源校验、鉴权、重定向拒绝、48 MiB 响应上限、32 MiB 图片/下载上限、MIME、像素验证和错误阶段全部保持。没有放宽限制或改变图片质量。

## 集中验证：本轮实测

依赖只读复用 `C:/Users/13357/.t3/worktrees/naumi/t3-18c8ab7e/node_modules` junction；React 19.3.0、pg 8.20.0、sharp 0.34.5，没有 install 或写共享依赖。所有执行应用模块的子进程使用环境白名单，不加载 `.env`，没有 DB 连接。HTTP 只在本任务拥有的 loopback 随机端口；Hub ledger 使用原有 override seam 的内存 fixture，**不是 PG 事务验收**。没有给生产对象补 error listener 或替换生产解析函数。

### 主验证命令

工作目录均为本工作树：

```powershell
# BASELINE：修改前运行，原始失败日志保留
node scripts/verify-capacity-x4.cjs
# MODIFIED：源码修改后，同一脚本；最终执行也记录在 modified-final.log
node scripts/verify-capacity-x4.cjs
# 仅恢复带 marker/hash guard 的独立副本
& D:/DEV/Git/bin/bash.exe -lc './output/capacity-x4-linear-parsing/ROLLBACK.sh "$PWD/output/capacity-x4-linear-parsing/rollback-copy"'
# ROLLBACK：对恢复副本再次执行原业务函数与真实 HTTP 测试
node scripts/verify-capacity-x4.cjs --source-root output/capacity-x4-linear-parsing/rollback-copy
```

输入：1/8/44 MiB Base64 字符串、非法尾部、padding 位置、所有 ECMAScript 空白及旧兼容边界；1 MiB 重复 `![` / `![x](https://`；1024×1024 RGB PNG、本地 JSON/远程图片/Hub artifact；空输入、超限、data URL、授权头、未知结果错误分类。

- BASELINE：`URL_COMPATIBILITY=PASS CASES=12066 SEED=19508`、`SUPPLIER_REGEX=PASS CHECKS=46 STACK_FAILURES=0`、`X4_HTTP=PASS` / checks 66；两个函数压力子进程 `ETIMEDOUT` / `SIGTERM` / exitStatus null，一个真实 HTTP 子进程同样超时；总输出 `X4=FAIL FAILED_GROUPS=3`，**exit 1**。
- MODIFIED：同一组兼容/真实函数检查通过，`X4=PASS FAILED_GROUPS=0`，**exit 0**。最终一轮 1 MiB 两种函数输入分别约 4 ms / 13 ms；真实 HTTP 转换 `X4_HTTP_STRESS=PASS`、68.759 ms、PNG 3,151,914 字节、原 RGB 像素逐字节一致。这些是本机合成样本，不是生产吞吐或容量上限。
- ROLLBACK 脚本：`ROLLBACK=RESTORED ORIGINAL_SHA256=fb49d9d74a3b4ad8c599b4391c6b420ac4c68cc5dc6a7ebd5afae123f458292c`，**exit 0**；副本再次输出 `X4=FAIL FAILED_GROUPS=3`，**exit 1**，恢复三个原超时；正常 66 项 HTTP 仍通过。
- 后来编辑保护：guard-copy 附加注释后执行脚本，`ROLLBACK_GUARD=LATER_EDIT_PRESERVED`，**exit 73**，副本 hash 未变。脚本只允许 evidence 目录中的两个指定 fixture，拒绝源码目标；marker、原件 hash、当前修改 hash、realpath 一起检查。
- PNG SHA-256：`841e40ddce12d7c93df1208a4cf4007b0e9ee1987683ef56ceaef2bb779c0200`。基线、修改、副本回滚均验证原字节、PNG 元数据和实际 1024×1024 RGB；Hub 一次 fixture POST 后六次原任务 GET，错误继续是原 operation 的 `ImageOperationPending`，不变成重提许可。

### 组合回归

命令均由 ignored `regressions.cjs` 在白名单环境下执行；逐条命令、stdout、stderr、exit status 见 `regressions.json` 和 VERIFICATION：

- `node node_modules/typescript/bin/tsc --noEmit --incremental false`：exit 0，stdout/stderr 空。
- `node --conditions=react-server --import tsx scripts/verify-reverse-hub-images.ts`：`REVERSE_HUB_IMAGES=PASS durable replay, GET recovery, conflict, real mask pixels, pending/failure, native metadata`，exit 0。
- `node --conditions=react-server --import tsx scripts/verify-jimeng-image-adapter.ts`：`PASS Jimeng image endpoint, frozen ratio/resolution, references and single submission`，exit 0。
- `node scripts/verify-image-result-download-retry.cjs`：`IMAGE_RESULT_GET_RETRY=PASS CHECKS=14 MAX_GETS=2 SAME_URL=1 ONE_TIMEOUT_BUDGET=1 GENERATION_POSTS=0 EXACT_RESPONSE_DIAGNOSTIC=1`，exit 0。
- `node scripts/verify-dataurl-decoding.cjs --output-root output/capacity-x4-linear-parsing/dataurl-regression`：`DATAURL_DECODER=PASS CASES=41 REPRODUCED=0 FAILED=0 EXTERNAL_NETWORK=0 EXIT=0`，exit 0。
- **既有失败保留**：`node scripts/verify-image-postaccept-diagnostics.cjs`：`Error: unexpected dependency ../model-config/local-image-rejection`，exit 1。在恢复基线副本加 `--source-root output/capacity-x4-linear-parsing/rollback-copy` 再现同错 exit 1；未改加载器或生产鉴权。因此组合回归汇总 exit 1，不写成全绿。

## 证据与回滚产物

ignored 根：`C:/Users/13357/.t3/worktrees/naumi/t3-d18a0f13/output/capacity-x4-linear-parsing/`。

1. `MODIFIED_FILE`：修改后 `src/lib/new-api-image.ts` 完整字节；SHA-256 `6a59abda3ac88477eff9091a96860feb1691a492d5676619c4794b9fbf163598`。
2. `DIFF_FILE`：该业务源码的完整 diff。
3. `VERIFICATION.txt`：基线、修改、回滚、保护、回归的完整命令/输入/字面输出/退出状态；另保留所有原日志。
4. `ROLLBACK.sh`：实际 `chmod +x` / `test -x` 并执行的 copy-only 脚本；不回写源码。

`ORIGINAL_FILE` 与 `HASHES.json` 保留原 hash；完成时重新读取以上四产物并核对 hash。源码保持修改，工作树和 X5/storage 文件不由回滚脚本操作。

## 顺查与父线程后续建议

- `all-string-regex-inventory.txt` 保存 src 中 `.test/.exec/.match/.matchAll` 调用点，`regex-inventory.txt` 保存 Base64/data URL 子集；这是静态索引，不是全仓正则动态安全证明。
- 简单 Base64 正则没有本轮爆栈证据，保留而不统一机械替换。reverse-hub 后续通用验证可能重复扫描/解码，本轮未修改其 trusted-response marker 或声称已消除重复像素工作。
- `video/media.ts::auxiliaryMediaBytes` 原函数在 8 MiB 直接调用时确有 `RangeError: Maximum call stack size exceeded`；但现有公开 schema 将辅助文件限制为 **512 KiB**，本轮 512 KiB 正向/尾非法均正常。因此只记录边界外函数弱点，不报成可达的生产事故，不修改视频模块。
- `agent/harness.ts` 的 Markdown 替换有类似重复起点结构，列为后续真实调用链/输入上限审计候选；没有在本切片用源码形状直接宣布事故。studio3d、agent/canvas、tfrouter、供应账单 JSON 等调用点已列索引，不把静态扫到等同已修复。
- 给 X5 的接口建议仍是既有 `storage.dataUrlToBytes`，返回 `{ bytes, contentType } | null`；它比 supplier b64_json 的旧宽松空白/padding 契约严格，禁止将两者互换。本轮没有新增共享 helper，也没有要求 X5 修改文件。
- 待父线程审查后串行普通 merge；本子任务仅固定提交，未 push、merge main、PR 或发布。47 HOLD、无 SSH/业务写/付费调用保持；45 笔手术和在线索引继续挂账。没有本轮 PG/生产压力/故障注入/完整生产构建验收。
- 正常测试通过 `finally` 关闭自己创建的 HTTP server；原缺陷子进程由外层 deadline 终止，进程结束释放该进程持有的 loopback socket；没有容器、DB 或共享服务需要停止。证据保留给父线程。
