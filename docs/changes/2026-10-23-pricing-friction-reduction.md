# 正常创作优先：定价误拦与无原因失败的减法范围

日期：2026-10-23；核查源码：`c94d9347c9f7cc78f01f738d29fed8835689bbcf`。初版为只读定位；同日后续已实施本地最小删减并完成集中隔离验证。当前结论以文末实施记录为准，47仍HOLD，未上线。

## 用户最新要求

优先解决正常用户被定价/积分核对拦住、直接失败但不知道原因的问题。先取消影响正常使用的过度设计；新的业务护栏等待真实运营情况和用户明确要求，不因10万活跃目标自动加二次确认、固定次数限制和人工审批。80项台账是事实/行动库存，不是新增80道关卡或全部上线前置。

正常路径应为：界面明确显示本次价格 → 用户点击提交 → 后台冻结原合同、检查真实可用余额并受理 → 返回原任务及结果。内部模型/计费版本变化、供应商采购成本核对不反复转嫁给用户；不同失败阶段单独归因。

## 先分清已改未上线与源码仍有的分支

| 对象 | 本轮已读证据 | 最小处理方向 / 当前状态 |
|---|---|---|
| 图片current版本/金额误拦 | `src/lib/billing/request.ts:6-16` 图片跳过客户端版本/金额断言；`src/lib/imagegen/quotes.ts:70-80`沿服务器原报价，不重新读取current定价。 | 已有去误拦源码。留存`docs/changes/2026-10-23-imagegen-simplify-release.md`记为47暂缓发布；本轮未刷新线上版本，不把本地修复说成用户已生效，也不重复改同一处。 |
| 自动阈值/多步骤二次确认 | `src/lib/imagegen/plan.ts:119-135` 的api-cost-plus、多步骤、单步≥100；`src/lib/imagegen/batch.ts:31`的合计≥100；`src/lib/imagegen/canvas-client.ts:90-115`调用确认弹窗。 | 先区分真实价格变更与系统自己叠加的确认；普通可见报价一次提交为意图，删除无产品要求的重复审批，不扩成全新预算框架。已在同日后续本地删除，具体证据见文末实施记录。 |
| 通用工具成本加成弹窗 | `src/lib/billing/client.tsx:147-177`成本加成每次确认；`:212-222`非图片仍有catalog版本比较。 | 普通操作按后台确定报价，成本/估算/预占/授权不要暴露为用户反复核账任务。不得用“关掉计费”或任意免费价绕过。已在同日后续本地删除，具体证据见文末实施记录。 |
| 参考工作台的另一层current拒绝 | `src/lib/reference-workbench/service.ts:115-127`仍验证客户端credits、报价到期及当前模型/计费版本；`src/lib/reference-workbench/browser.ts:34`还有确认弹窗。 | 图像路径已有原plan/quote，应核对并复用，避免底层已冻结、外层又按current拒绝。视频/自动授权路径逐类核对实际冻结合同，不一刀切清校验。已在同日后续本地删除，具体证据见文末实施记录。 |
| Agent正常创作变等待用户报价 | `src/lib/billing/agent.ts:109-126`保存pendingQuotes并按阈值/costPlus阻断；`src/lib/imagegen/agent-executor.ts:13-24`未完成分支抛普通Error。 | 普通明确创作意图不再因臆定门槛反复要求下一轮确认；保留原toolcall/operation识别和真实余额。无原因失败给可追踪阶段与原任务，不能只改一句“请重试”。已在同日后续本地删除，具体证据见文末实施记录。 |
| 已确认基础行为 | 当前已有owner/scope、服务端报价、余额事务、operation幂等、未知受理保留原task。 | 这些后台事实保留，但不等于让用户核账、重新买一次或额外审批；足额余额/合法请求应顺畅完成。 |

## benchmark有用，但判据必须以正常交付为准

本地已找到历史机制runner：`scripts/verify-imagegen-history-benchmark.cjs`及`docs/benchmarks/imagegen-history-20261023.json`。`docs/changes/2026-10-23-imagegen-history-goal.md:14-26`记录10/10断言符合但总结果PARTIAL，真实原请求精确重放0、22笔外部quota合同OPEN；两张原图本地续交不是生产已交付。这不自动对应用户所说另一线程的最新benchmark；已请求其报告路径/线程链接，未取得前不冒认。

后续直接复用已有runner/夹具，最小加入或核对以下反例，不新造benchmark平台：

1. 足额余额、合法规格、普通单图/编辑/批量，直接正常受理并最终有图；不以“成功拦住”作为业务成功。
2. 预览后管理员发布无关模型/计费新版本，原服务器报价仍按原价执行，无二次定价拒绝。
3. 维护TTL不使原报价失效，不触发自动重新购买；原operation继续原价，已受理/响应丢失只读原回执，不静默换价或多扣。
4. 供应商403/429/超时与平台保存/后处理失败分别有真实阶段；有原结果只续交本地，原图/作品/账本可核对。
5. 新增轻量负例证明：真正余额不足明确提示、外owner拒绝、同operation最多一次有效扣款、未知受理不重复POST。

测试预期必须服从用户最新产品合同：`scripts/verify-billing-review.ts:14-18`仍含“图片缺报价头应PRICE_CHANGED”的旧断言，而当前图片策略已经跳过该比较。此为静态不一致线索，初次定位未执行；后续已将缺确认/旧回显断言改为不拒绝且服务器价格不变，定向执行通过，不为旧断言恢复误拦。

## 实施边界与完成标准

先核实实际使用版本，再做具体误拦分支的最小删减，模块完成后集中验收，不推进十个包全面改造。完成必须证明同一正常请求从旧误拦变为正常交付，并且不重复扣款、不丢已接受原图。47维持配置/暂缓发布；后续仅在本地随机schema与隔离回调运行应用定向测试，无外网供应商、生产操作或build。

初版仅文档；同日后续产品修改、测试与回退见下文。初次审计明细保留在ignored `output/pricing-friction-20261023/`。


## 同日后续实施：实际删除重复价格审批（本地完成，47 HOLD）

实施基线：`84fc45effa74b15785dfaaa39cd39598b19734ca`。不关闭计费、不改客户售价、不改生产配置，不另建框架。

| 模块 | 实际删除的判断 | 保留与验证 |
|---|---|---|
| 图片与通用客户端 | api-cost-plus/多步骤/高积分/批次阈值弹窗，confirmed=true硬门槛，TTL拒绝与TTL自动重报价，catalog版本比较 | 原服务器完整报价、原operation及scope/fingerprint；显式false取消。过期报价12仍12，imagegen6仍6，不跟current150；未知受理不重POST。 |
| Agent | 跨轮确认、确认词、10分钟、32条pending、高价二次确认、current版本重确认 | 实际余额、工具权限、调用身份与原计划；固定价不再因imagePreset元数据误作成本加成。40次低价调用没有第33次误拦。 |
| 原生工作台 | 积分弹窗、confirmed/credits回显、TTL及current版本拒绝、虚构8×count积分上限和静默return | 保存plan/quote、owner/内容摘要、进行中去重、内容方案确认/取消；count=2恰好2张，无新增循环。原文字2即使current7仍扣2。 |
| 视频/媒体/助手等通用入口 | 浏览器版本/金额与服务器current比较，媒体确认，视频批次总价/版本比较 | 服务器报价、钱包事务与账本；新batch内容摘要排除价格回显，兼容原legacy摘要；节点revision、owner、素材权限保持。 |

### 集中验证（复用已有benchmark）

```powershell
$env:DATABASE_URL='postgresql://fixture:fixture-local-only@127.0.0.1:65437/naumi_pricing_fixture'
$env:NAUMI_VERIFY_ISOLATED_DB='1'
node scripts/verify-imagegen-history-benchmark.cjs --suite pricing-friction --phase compare --output output/pricing-friction-removal-20261023/benchmark-compare
```

4模块baseline/modified共8次子进程均exit0，报告`completedChecks=8 / expectedChecks=8 / valid=8`。runner字面结果：

```text
HISTORY_BENCHMARK=PARTIAL CHECKS=8 EXPECTED=8 EXACT_EMPLOYEE_REPLAYS=0 PRODUCTION_MUTATIONS=0 EXTERNAL_SUPPLIER_CALLS=0 EXIT=2
```

该命令的Node报告退出码2；本机直接PowerShell包装返回1，不能把它记成全绿exit0。PARTIAL来自原历史catalog仍OPEN/NOT_PROVEN，不是本轮8项预期失败，也不更改旧catalog掩盖问题。

核心真实`createValidatedVideo`/PG（执行scope与提交hook为fixture）：

```text
PRICING_FRICTION_CORE=PASS mode=baseline echoes=6 media=2 rich=PRICE_CHANGED poor=PRICE_CHANGED server_price=12 consume_rows=0 hook_calls=0 http=0 supplier_POST=0
PRICING_FRICTION_CORE=PASS mode=modified echoes=6 media=2 rich=ACCEPTED poor=INSUFFICIENT_CREDITS server_price=12 consume_rows=1 hook_calls=1 http=0 supplier_POST=0
```

封版修正后图片25cases/74checks；Agent58checks；工作台13groups、fixtureImages5/fixtureText3。同operation一笔消费、owner/scope、内容冲突、真实余额、明确停止、未知受理不重提均纳入定向回归。工作台图片来自本地loopback真实PNG，非供应商付费生成；没有实际GUI/线上验收。

旧scope-receipt脚本有一条断言将省略confirmed当畸形输入，已同步为省略正常、非boolean仍拒绝，并新增receipt-only断言；23/23通过。保留首次旧预期失败日志。首次集中lint发现三个新verifier的本地变量名module触发Next规则，已改名projected，不改测试语义；首次tsc的两个fixture类型错误已修，最终全项目tsc和限定lint通过。

### 回退、产物与仍未完成

原始Git archive及SHA保存在`output/pricing-friction-removal-20261023/`；所有修改打包、diff、完整命令/字面结果、独立副本回退在同目录四产物中。回退只恢复显式隔离源码副本，不回灌DB/媒体，不重放付费任务；真实工作树保留修改。各模块实现记录见同日image、agent、workbench文档。

仍未关闭：22笔供应商额度合同、2笔原结果丢失起点/线上续交、供应商403与平台保存等全部无原因失败、采购资料缺失及真正成本加成授权/待核账分支。没有以0价绕过未知成本，没有扩大到删除所有限流。旧billing-agent等脚本仍含历史“必须二次确认”的业务断言，本轮未跑全suite/build，不用这些旧断言恢复已删除门槛。后续依据真实失败请求的阶段继续定位，不新增用户侧审批。

源码完成/提交推送不代表上线；47继续HOLD，未SSH、未部署、未改配置、未调用外部供应商。本地测试PG为本轮自有容器，收尾移除，不操作其他服务。


### 封版审阅补正

首轮定向复审发现两处真实缺口，未用首轮8/8掩盖：

- 工作台显式`native_quote.confirmed:false`原会被忽略，现只对未受理preview在事务内取消；已受理任务仍返原回执，不用这个字段撤销在途任务。新增取消保持preview、无供应商调用/无消费及已接受false仍原回执断言。
- 原图报价复用原在current planner之后，现`/api/imagegen/plan`认证与schema后先读原quote、重查功能/输入权限并返回原plan，current hidden/disabled或planner失败不使原合同重新规划。新operation仍按current规划；实际执行前通道可用性不变。

原始首轮日志保持；修正后最终集中报告使用`benchmark-compare-final/`新目录，不覆盖旧`benchmark-compare/`。最终全量字面、源码指纹、回退和Git结果以根`VERIFICATION.txt`为准。各模块先前four-artifact仅对应其当时hash，不冒充封版源码；根ZIP包含本轮最终全部更改。
