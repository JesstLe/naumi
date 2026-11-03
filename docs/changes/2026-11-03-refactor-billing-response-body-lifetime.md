# 账务 UI：原始响应体的观察生命周期

## 输入、真实失败与边界

- 当前产品基线 `59d9cdf036ab67dcd30740ab6a529ddf05950880`（main ca00b1f1 已整合），5693 原始 tracked 文件与 raw hashes 已封存。本模块产品源码不改动。
- 触发通知是旧936fe80的Verify41621196581/job125867049801。实际CI merge输入56eddbf；完整build、18项账务回归、模型publication restore草稿合同此前均通过，账务UI为15PASS/1FAIL，后续步骤SKIPPED不记通过。
- 失败在 `billing-ui.spec.ts` 第137行的 `expect(accepted.status(), await accepted.text()).toBe(200)`；消息参数读取body时CDP抛 `Network.getResponseBody: No data found for resource with given identifier`，未执行200断言及后续quote/ledger/restore断言。该段在936/44e/4d/59d相同，不能以旧通知为由忽略。
- Playwright的“navigated away”是通用protocol-error提示；远端navigation diagnostics为[]，不据此宣称历史唯一导航根因。原artifact55文件已下载重开，ZIP SHA256 `60acb5ec0564b08be6176cfa0f92a6ef4c8e7a17b3201829f9d9304d9f6f5ac8`，首次TLS下载超时与console GBK输出失败记录保留。

## 职责与实际迭代

测试需要观察同一浏览器原响应，不需要重写产品接纳、计费、冻结报价或恢复规则。新增 `scripts/billing-response-body.ts` 只负责观察生命周期：在点击前启用Chromium有界durable response buffer、立即读取原Playwright Response.text，结果及disposer显式返回。它不route、不fetch、不fulfill、不替换原Response、不发第二次POST；status与JSON.parse只复用同一原text，finally脱离CDP session。

首个仅提前 `.then(text)` 的候选没有被宣称完成：真实Chromium四场景仍有2项即时body/即时导航协议失败，原报告留在 `oracle-modified-first`。独立enable-only诊断先启用Network durable messages（双10MiB），不预先getResponseBody，四场景导航后原Playwright首次text读取均成功，之后与同session原body逐值一致。这是本地真实协议机制证明，不是历史远端唯一根因证明。

原测试所有200、原operationId/quoteId/jobId、冻结6积分/当前8积分、单browser POST、单supplier POST、单ledger、实际PNG与发布/冲突草稿/restore断言和原预算保留。unsupported CDP或body错误继续失败，不吞错、不重购。

## 正式回归与证据层级

`verify-billing-response-body-lifetime.cjs --source-root COPY --out DIR` 用TS AST抽取指定原测试实际语句，并加载候选实际helper；基线没有helper仍执行真实旧片段，失败来自真实body协议而非missing export。四种真实loopback HTTP/Chromium场景覆盖即时/延迟body与native/direct、等待真实导航完成的click返回边界；每case仅1原browser/HTTP POST，原身份/JSON/价格一致，供应商0。时间线、失败及资源cleanup记录REPORT.json。

新case `billing-response-body-lifetime` 纳入原pricing目录，pg:false；目录244→245只代表登记。生产路径集、raw hash与mode零漂移为封装硬门；完整账务UI16、最终类型/lint、formal selected、四产物与副本回滚终态以本阶段VERIFICATION/DELIVERY及原始命令为准。

## 集中模块验证

- 当前产品59d本地完整production-mode Next build exit0；Windows standalone trace的EPERM symlink警告原样保留，不冒称固定Linux镜像。
- 原16项账务UI单次完整PASS/26.8秒，真实隔离PG与原supplier fixture；冻结价格原operation/quote/job、1次browser/supplier POST、1条6积分consume、PNG及restore均实际到达。
- 最终非增量tsc exit0，5606实际输入前后hash稳定；4路径lint exit0/0error/0warning；runner31场景/429检查PASS。
- 新真实浏览器oracle4时序PASS，原/新时序与early-only失败均保留；正式selected与四产物精确结果归VERIFICATION/DELIVERY，不以目录245当全跑。
- 独立窄审PASS：6个外部CDP/Page故障端口case（非真实browser），16case/全部timeout/其余15回调/目标capture外整段AST保持，2096 runtime字节不变；与完整UI/source桥匹配，无剩余可复现P1/P2。
- 自有PG经exact ID/name/label核对后移除；账务UI端口31089 listeners0；oracle各自browser/server已关闭，其他资源未动。

## 未完成项

四产物与新头CI及整体重构验收独立。wholeRefactor=ACTIVE，mainMerged=false，deployed=false，47 HOLD。保留旧头失败，不将本地协议fixture或局部formal PASS重标当前完整245/固定整版/生产完成。
