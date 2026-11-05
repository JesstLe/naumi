# R9P：图片网关验收区分客户释放与供应未知

## 实际边界

基线 `e8156ee2da971d5d199e5b37256b4979621b23d5`，5360 原始文件完整冻结。本轮不修改产品代码，继续关闭整体重构进入主线前的实际 Image 失败。

该 SHA 的远端完整构建、账务事务、business routing、注册模型组、R9O billing browser、business admin browser 和 pricing 均已通过；第 21 步 `verify:image-gateway` 失败。真实 job/annotations 留存，日志 blob 仍 EOF；不把本机错误冒称已下载的远端唯一内部栈。Core 原作业继续独立执行，不重启。

原脚本在真实隔离 PG/loopback supplier 下实际 exit 1：期待 `pending`，实际 `error`。只读 observer 进一步捕获原两个供应响应 200/504，以及 customerBilling=released、supplierCostStatus=pending、paidOperations.started。未改响应、身份、时钟或预算。

这是原测试尚未跟随已有客户政策：`a20f8a4f` 与 `image-job-repository.failUndeliveredImageJob` 在没有已交付结果时结束等待、释放本任务剩余预占，同时原 paid intent 保留、对账 proof 明确 supplierOutcome=unknown / supplierCost=pending。客户释放不等于供应商未扣费；也不等于允许 Worker 重放旧付费操作。不能为了旧断言恢复无限 pending。

## 本轮修改

- 原供应 504 案例改为核对真实终态、释放、零 consume、对账未知证据及原 paid attempt 保留；旧 Worker 重入要求新增供应 POST=0。
- 正常两图交付使用明确的新用户操作，保持旧失败回执不变；保留按图稳定 ID、medium 冻结参数、正常完成后的零重放与一次结算断言。
- suite/A+ multipart、质量审计、客户账务、Canvas submission crash、旧格式任务不重提等原业务目标保持。
- paid-operation guard 通过真实 `DurableImageJobs.kick` 的实际 lease 执行，不再从测试外层绕开当前租约边界。异步 callback 异常明确传回驱动，不吞失败。
- 原高质量新任务案例复制了旧完成任务的 job-owned 二进制/checkpoint 指针；现在为新的 suite/A+ 身份使用原始 fixture Buffer 和全新 pending 状态，旧任务仍需真实 settled。没有削弱跨 job 引用保护，也没有删除 xhigh/max 的 wire/账本/audit 断言。fixture 明确声明本来就在处理的 quality 字段，防止缺省能力开关把请求档正确回退成环境档。
- 将安全的 synthetic 结果/失败摘要接入现有工作流 always artifact；不保存 cookie、密钥、完整 prompt 或供应商图片正文。

## 状态与后续

基线及 observer 失败日志保留。完整 modified、类型/lint、独立副本回滚与最终字面结果在 `output/refactor-r9p-20261101/VERIFICATION.txt` 统一记录。未测试的断言不当成已通过；后续步骤首次失败按实际证据修正，不修改产品去迎合旧 fixture。

退出要求只读审计另见 `output/refactor-exit-e8156ee2-20261101/AUDIT.md`：20 项要求与九类故障五维映射仍为 PARTIAL，不将已存 checkpoint 恢复冒充首次 paid-result 写入失败。客户释放与供应未知可以同时成立，后续故障验收保留这项现行政策，不新增用户确认或运营护栏。

整体 ACTIVE；main 未合、未部署，47 HOLD。

## 本机网关结果与后续 Image 边界

网关完整原命令最终实际 PASS / exit 0：未交付客户释放、供应未知证据、旧 Worker 零重提、明确的新操作两图/12积分、suite/A+ multipart、xhigh/max 单次账务/审计、真实 lease 的 paid guard、Canvas crash 与旧格式任务均已到达。原 baseline、只读诊断、缺 fixture 能力和复制旧 job 指针造成的中间 FAIL 全部保留。

同时读取真实远端结果：`e8156ee2` 的 Core 已 terminal SUCCESS；Image 在网关之前的步骤均 PASS，后六条此前未执行。对后六条原命令的集中诊断实际为 **5 PASS / 1 FAIL**，不是原顺序 gate 通过：`credit-billing` 的 partial barrier 等第二请求、第二请求却排在被 hold 的第一请求之后，实际20秒超时。其余 global-quality/private-BI/BI-management/admin-access/single-product 均实际通过。

credit 的未完成调查只保留在 ignored evidence，不混入本模块稳定源码。调查副本修正 barrier 后已到达 partial/failure/downgrade/mixed；新 BYOK 请求仍按现行协议409，真实加密旧快照＋零价合同可验证旧任务 downgrade。随后平台 fallback 分支实际得到 `image-index-original-rejection`，尚未完成兼容根因修正；不能删除原 case、恢复公开 BYOK 或把未知提交当新购买来转绿。该候选文件、diff、原始失败与 hash 已保存，工作区 credit 脚本按首写前 hash 检查恢复为原始字节。

因此本模块只声明网关闭合，**完整 Image 和最终 main 仍 OPEN**。优先完成这个已发现的兼容问题后再集中推送，避免明知下一条失败仍重复触发两组整版 CI；不重启已终态的旧作业，也不把旧 Core SUCCESS 改标未来源码。

网关最终固定脚本再次完整 exit 0；全项目非增量 TypeScript 与定向 lint 最终 exit 0，5094 编译器输入及4配置逐字节绑定。先前脚本中 snapshot.paidOperations 的 unknown 类型读取和 callsBefore 推断问题所导致的两次 tsc exit2 已留存；修正为显式类型后验证，未改产品或业务断言。副本回滚恢复原 first failure、完整源码/补丁及后续编辑保护的实际结果由本轮 VERIFICATION/DELIVERY 记录。
