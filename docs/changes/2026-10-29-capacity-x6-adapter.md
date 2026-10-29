# X6 / A56 / D38 与 A12：图片异步适配器查询期限、恢复与资源收尾

## 当前交付

- 基线与开工 `fetch origin main`：`c328f01c5a1854bce271fa53e64d324986df9329`；工具准备的独立 worktree `C:/Users/13357/.t3/worktrees/naumi/t3-b9568d0d`，分支 `t3/x6-image-polling-fix`，开工工作树干净。
- 编号沿用总账顶部映射：GLM 原 A26 / D11 是 **X6 / A56 / D38**；轮询为 **A12**。未另编编号，未修改总账。
- 本次修改生产源码只有 `src/lib/model-config/apimart-preset.ts`；增加 `scripts/verify-capacity-x6-adapter.ts` 和本文。`apimart-image-parameters.ts`、`seedream-preflight.ts`、billing/runtime/canvas 均未修改。
- 已有 `a361b8aa` Gemini 异步 `output_format` 修复和 `recordSupplierAdapterFailure` 在基线存在。基线的 Gemini Pro/Flash、Seedream Pro/Flash、GPT 合成生成、编辑和原 task 恢复均成功；不是重新修复旧 PNG 默认字段，也没有证实全部“无结果”共用一个原因。
- 源码与本地合成供应商/独占 PG 验证完成；交父串行整合。未 push、合共享 main、建 PR、部署或调用付费供应商。47 暂缓发布及45笔外部手术报告的证据门禁保持。

## 模块与职责、公共接口及归属

`apimartImagesFetch(scope, options, overrides)` 负责受控上传、唯一付费生成 POST、原 task 查询、下载/解码及供应商接收输出数。输入是既有冻结 `ModelExecutionScope` 和 operation；`apimartExecutionParameters` 使用 frozen/requested、有效报价及单图参数，保留语义质量与 wire alias 的区别。

依赖方向仍是入口/执行器 → 适配器 → transport、supplier ledger、参数策略。报价/计费由 billing 拥有；任务 lease/checkpoint/重试预算由 durable jobs 拥有；作品/媒体/父子回执由原交付模块拥有。本次没有新增表、跨模块事务、独立调度器或全局重试。

实际控制流核对：

1. 请求/报价与冻结执行上下文先完成能力和映射校验；`executionFetch` 进入该适配器，真实参数异常由既有 local rejection 分支映射，非匿名吞错。
2. `apimartExecutionParameters` → `apimartImageParameters` 在 `supplierLedger.begin` **之前**。本地不支持的参数可以产生零 supplier_calls；新测试以实际参数函数/真实 PG 验证这一点，零行不证明供应商提交过或“静默死”。
3. Seedream 专项 preflight 在 ledger.begin 后、CAS marker 和上传前执行；原 `ModelConfigError` 直接保留。模型计数失败没有上传或 paid POST，且可能只有未绑定 billing_unit 的空参数行。
4. CAS marker 冻结 requestHash/参数，上传在唯一 paid POST 之前。上传失败可明确标记未提交；生成请求丢 ACK、非法 JSON、缺 task id 仍是 UNKNOWN，不删除 marker，不自动 POST。
5. 已知 task id 只查原任务；receipt/cost 和实际模型差异保留；下载/像素接受写 `acceptedOutputs`，不等于用户已交付或已结算。failed task 保留费用证据，partial 仅交付解码成功的输出。
6. 原生链路验证继续经过 durable checkpoint → 受控保存中断 → 原交付恢复 → 作品/用户查询/私有媒体 → 原报价一次结算。该链路没有复写为适配器专属账务实现。

## 复现与实现

### A12 查询生命周期

基线只在进入 while 前检查截止时间，真实 HTTP GET 的响应头/响应体可以一直挂起，末次固定2秒等待也不受剩余期限约束。100ms 查询预算在测试 watchdog 450ms 时才退出；80ms 预算等待约2秒。短暂503 GET立即变为 Pending，耗用外层恢复而非继续查原任务。

修复：

- 每次 GET 使用原 request AbortSignal 与 **本轮剩余查询期限**组合，覆盖响应头和响应体；读查询加 `cache: no-store`。
- 无进展时用2秒基数指数退避，封顶8秒，乘0.8–1.0抖动；状态改变或数值进度增长时回到快查询。`pollMs` 测试覆盖保持不变。
- 等待裁剪到剩余期限，abort/正常完成均清理监听器和定时器。
- 只重试原 task 的只读 GET：408/429/500/502/503/504 及有限连接/流中断错误。400、回执身份/格式错误和外部 abort 不授权重试提交；所有查询仍落在原期限内。
- `Math.min(240000, c.timeoutMs)` 和外层 `supplierQueryResumes` 上限均不变。这里是**查询阶段**期限，不冒称覆盖提交、数据库等待、下载或全部任务壁钟时间。

固定60秒无进度合成队列（抖动随机数固定0.5）中，基线30 GET，修复10 GET；两者模拟时钟都终止在60000ms。对应100个同条件在途任务是3000与1000 GET/分钟的合成外推，不是生产RPS、容量或服务等级验收。

### X6 下载错误边界

基线遇到非2xx下载响应直接抛错后尝试读同一URL，未取消失败响应体。新测试以可观察取消回调的响应流复现 `cancelled=0`；修复先取消该响应体，再沿原有最多两次下载逻辑继续。修复为 `cancelled=1`，没有新增付费请求或放大原下载次数/单次30秒预算。

没有按模型名猜 Gemini 精确像素；未修改公开映射、能力、图片质量、Seedream 限制或上下架状态。

## 集中验证：命令、输入、原始结果与证据层级

证据根目录 `C:/Users/13357/.t3/worktrees/naumi/t3-b9568d0d/output/capacity-x6-adapter`，下称 `$E`。测试 runner 使用大小写无关系统环境白名单（保留 SYSTEMROOT），仅注入合成凭据及回环 PG；未读取 `.env`。Python 均使用 `-X utf8`。

开工可用物理内存9307636 KiB；依赖安装为本 worktree 的 `npm ci --ignore-scripts --offline --no-audit --no-fund`（728 packages，exit0），没有修改共享依赖。唯一 PG fixture 限制256MiB/1CPU，绑定回环动态端口51205；完整 ID、label、资源上限和最终清理结果保留于证据。

统一执行形式：`node output/capacity-x6-adapter/run.mjs LABEL SCRIPT [APIMART_SOURCE_FILE]`。实际子命令为 `D:/DEV/NodeJS/node.exe --conditions=react-server --import=tsx SCRIPT`，精确合成输入、stdout、stderr、exit 见每个 LABEL 的 `COMMAND.json` / `OUTPUT.txt`；完整原文汇入 `VERIFICATION.txt`。

| 验证 | 命令 / 输入 | literal output/result | exit |
|---|---|---|---|
| BASELINE | `node output/capacity-x6-adapter/run.mjs BASELINE_ACCEPTANCE scripts/verify-capacity-x6-adapter.ts output/capacity-x6-adapter/BASELINE_FILE/apimart-preset.ts` | `X6_ADAPTER=FAIL CASES=21 FAILED=6 REAL_SUPPLIER_CALLS=0` | 1（预期反例） |
| MODIFIED | `node output/capacity-x6-adapter/run.mjs MODIFIED_ACCEPTANCE scripts/verify-capacity-x6-adapter.ts` | `X6_ADAPTER=PASS CASES=21 FAILED=0 REAL_SUPPLIER_CALLS=0` | 0 |
| 格式回归 | `node output/capacity-x6-adapter/run.mjs REGRESSION_FORMAT scripts/verify-apimart-response-format.ts` | `APIMART_RESPONSE_FORMAT=PASS CASES=8 FAILED=0 REAL_SUPPLIER_CALLS=0` | 0 |
| 异步核心 | `node output/capacity-x6-adapter/run.mjs REGRESSION_ASYNC scripts/verify-apimart-async-images.ts` | `PASS APIMart async images: 53 checks;`（完整后缀见原文） | 0 |
| 冻结参数PG | `node output/capacity-x6-adapter/run.mjs REGRESSION_PLAN_PG scripts/verify-image-parameter-plan-pg.ts` | `IMAGE_PARAMETER_PLAN_PG=PASS CHECKS=16 FROZEN_ROUNDTRIP=PASS OLD_VERSION=UNCHANGED DISCOVERY=0 SUPPLIER_CALLS=0` | 0 |
| 参数计划 | `node output/capacity-x6-adapter/run.mjs REGRESSION_PLAN scripts/verify-image-parameter-plan.ts` | `IMAGE_PARAMETER_PLAN=PASS CHECKS=25 LOOPBACK_POSTS=1 REAL_SUPPLIER_CALLS=0 AUTO_QUOTE=CONSISTENT OLD_TASK=UNCHANGED` | 0 |
| 受理身份PG | `node output/capacity-x6-adapter/run.mjs REGRESSION_POSTACCEPT scripts/verify-image-postaccept-postgres.cjs` | `IMAGE_POSTACCEPT_POSTGRES=PASS CHECKS=18 REAL_POSTGRES=1 HTTP_CALLS=0 SUPPLIER_CALLS=0` | 0 |
| 既有账务 | `node output/capacity-x6-adapter/run.mjs REGRESSION_BILLING scripts/verify-billing-async-tasks.ts` | `PASS video and canvas freeze metering/quotes and settle once` | 0 |
| 定向类型 | `node output/capacity-x6-adapter/run.mjs TYPECHECK_FINAL output/capacity-x6-adapter/typecheck.mjs` | `X6_TYPECHECK=PASS CHANGED_DIAGNOSTICS=0 TRANSITIVE_DIAGNOSTICS=0 FULL_PROJECT=NOT_RUN` | 0 |

21项包含五个 wire 模型的 generate/edit、多参考图、原task恢复；明确 not_charged、上传失败及后续原操作重试、preflight/参数拒绝、丢ACK/非法JSON/缺task、partial/实际模型差异/failed、媒体流取消、503/400、头/体挂起、期限/退避/abort，及两模型家族的原生checkpoint/媒体/结算。原生测试中报价、nonce、operation、done checkpoint token 保持，重复恢复 ledger 仍为一笔 `-6`，另一账号 job403/media404，生成POST每任务1次。

### 既有 Seedream 脚本的准确状态

- 原 `verify-apib-seedream.ts:26` 仍断言通用适配器无条件补 `output_format='png'`。未改该文件；原源码副本与修复源码均得到 `undefined !== 'png'`，exit1，发生在供应商fixture断言。不是本次新增业务回归。
- `CURRENT_SEEDREAM_CONTRACT` 使用**独立测试副本**，只把该旧默认字段断言改为 `undefined`，其余测试不改：`APIB_SEEDREAM=PASS; CHECKS=42; SOURCES=5; PUBLIC_MODELS=4; STANDBY=1; COMBINATIONS=210; PIXEL_CONFLICTS=11; ... REAL_PROVIDER_CALLS=0`，exit0。该副本及差异留证，不冒称原脚本已绿。
- 对上述本地产生的计划运行 `verify-seedream-partial-hold.mjs`：`PARTIAL_ROLLBACK_COPY=PASS FULL_55_INVERSE=PASS KEEP_PRO_11=PASS HOLD_INDEPENDENT_44=PASS LATER_LABEL_WEIGHT=PRESERVED SUPPLIER_CALLS=0`；`PARTIAL_CONFLICT_DEPENDENCY=PASS NO_OVERWRITE=true`，exit0。没有读取历史生产计划或执行发布。
- 早期fixture启动曾因测试secret不足32字符失败，保留 `BOOT_FAILURE`；一次原生验证把私有媒体配置放在模块导入后，默认公开配置导致404断言失败，保留 `BASELINE_FINAL`/`MODIFIED_FINAL`。将fixture配置移至导入前后，两源码原生路径均通过，未改媒体模块。早期类型输入还引用缺失的 next-env.d.ts，修正为实际两个root文件后0诊断。这些准备错误不计入业务缺陷。

## 四产物与副本回滚

- `MODIFIED_FILE`：`$E/MODIFIED_FILE/`（生产源码、测试、本文的修复副本）。生产文件原 SHA256 `b5bc091988c3f6196ca835d2c34e76299f0e788e89933bf8c867580c6d694421`；修复 SHA256 `7e375a3766318d40bbbecbaf1260d08efce2a39d120ab1ecdbd74b3a29b0f59c`。
- `DIFF_FILE`：`$E/DIFF_FILE.patch`。
- `VERIFICATION.txt`：`$E/VERIFICATION.txt`，包含全部准确命令、合成输入、字面输出、退出码、hash、回滚与清理状态。
- 可执行 `ROLLBACK.sh`：`$E/ROLLBACK.sh`。传入带本包copy标记的独立目录；验证manifest、所有原/改hash和全部目标路径后才写入；任务新增测试/文档也在全量guard内。任何一项漂移为exit3且0部分写入。

ROLLBACK准确执行：`D:/DEV/Git/bin/bash.exe output/capacity-x6-adapter/ROLLBACK.sh output/capacity-x6-adapter/ROLLBACK_COPY`；成功输出 `ROLLBACK=PASS FILES=3 BASELINE_BYTES=RESTORED ADDED_FILES=REMOVED`，exit0。随后 `node output/capacity-x6-adapter/run.mjs ROLLBACK scripts/verify-capacity-x6-adapter.ts output/capacity-x6-adapter/ROLLBACK_COPY/src/lib/model-config/apimart-preset.ts` 恢复原 `X6_ADAPTER=FAIL CASES=21 FAILED=6 REAL_SUPPLIER_CALLS=0`、exit1。恢复的是基线行为，不是修复测试通过；工作源码与 MODIFIED_FILE 留在修复状态。

## 未完成项与下一步

1. 父串行整合固定task-only提交，最后提交SHA/清洁工作树与资源退出见交付回执。
2. 本地证据证实上述适配器缺口；用户报告的每笔线上即梦/香蕉无结果仍需真实运行版本、冻结配置/原异常、原task/call关系及供应商状态对应。未取线上数据，未将“零supplier_calls”或用户汇报替代根因证明。
3. 当前公开配置能力、精确像素与报价映射保持，未放宽契约。基线能成功的核心路径按成功保留，不以新增编号或调大等待凑修复。
4. 原始Seedream回归脚本的旧格式断言由父协调更新；保留本次一处兼容副本证据。全项目构建、真实认证浏览器/供应商质量、多实例与生产峰值容量不属于本地通过结论，发布门禁继续独立。

## 父线程复核与增量修正

父从main `c328f01c`普通合入固定子提交`e326374b`，原21项断言保留，新增4项：数值进度增长重置退避、持续503预算/原task保持、真实GET socket reset后仅重查、回执ID错配不重发。实际原版25项9失败，子候选25项1失败。

新增失败不是线上Gemini不可用的新归因：`parseReceiptJson`为保持金额精度，将所有JSON数值词法值保留为字符串，因此子候选`typeof progress === 'number'`永不接受真实数值JSON进度。父仅对progress这个调度提示读取非空有限非负数字字符串；不改金额解析、回执ID、总期限或operation。原21项均通过且父25项最终全过；该小修沿用A12，不另凑生产事故编号。

父测试使用实际模块、独占小PG/loopback HTTP；VM只替换待对照的两个实际函数源码和定时器，其他依赖实际加载。无进度/增长/持续503场景用明确标记的虚拟时钟，头/体挂起和GET socket reset用真实HTTP/原生计时。原生checkpoint→保存中断→作品/私有媒体/单笔账本路径仍执行，不能据此声称生产配置或供应商质量验收。

父六组既有回归保持：异步53、格式8、冻结参数PG16、参数计划25、受理身份PG18、异步账务均exit0；原Seedream脚本仍是同一旧output_format断言exit1，未修改断言。父首次完整tsc因启动器继承1.5GiB堆而exit134，原stderr保留；最终集中复验使用4GiB堆，exit0、stdout/stderr均空，不将原资源失败抹去。

父首次准备脚本把Windows绝对路径用于ESM动态import，引发`ERR_UNSUPPORTED_ESM_URL_SCHEME`，尚未进入测试矩阵；精确核对自有Node命令行后终止它，父fixture按完整ID清理。修正为相对模块路径后重跑，原准备失败记录保留，不计为产品缺陷。

父证据根 `output/capacity-audit-wave2-20261029/x6-parent/`：原/改hash、25项完整输出、所有原生子命令/exit、copy-only恢复与全量guard、资源记录及四产物。父只回滚标记副本，源码与MODIFIED_FILE留修复；本地成功不关闭A56的线上报告，每笔原任务仍待实际版本/冻结配置/原异常/原task证据核对。
