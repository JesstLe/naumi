# R9C：公共报价与 Canvas 图片编辑的入口/用例边界

## 职责与公开接口

- 报价入口把已认证 actor 显式交给报价准备和 opaque quote 保存；server quote 的 owner/scope、自动画幅仅展示语义不变。
- `withBillingIntent` 可消费上游已经认证的 actor，并把它交给 action；省略保留旧认证，no-DB仍未解析，原fingerprint/claim/pending/response唯一归属不变。
- Canvas HTTP入口负责 Request/header、模型适配和响应；`enqueueTextEditTask` 接受 actor、任务输入及可选 `TextEditModelPreparation` 窄接口，不再接收/创建Request或解析报价回显。headless调用复用现有 `withModelOperation`。
- 保留输入校验→来源归属→模型准备→真实报价/预占的原顺序；模型准备按需调用，不提前读取quote/MAC。原owned artwork复读、共享事务、冻结ExecutionBundle、Worker lease和结果/账务owner不改。
- 删除图像路径早已无效的 assertQuotedVersion 调用，不恢复客户端金额/版本比较，不新增限额、确认、缓存或schema。

## 基线证据与调用方

完整基线eb6576ee503c57dbc7ff59f813926523b9494a65，5337raw文件，已逐文件对照并归档。真实原生HMAC、HTTP/PG、真实Worker领取、回环PNG、私有结果读回与结算基线 **29场景/59检查**；价6→current17后原合同仍执行6、供应1POST/consume1、原像素一致，UNKNOWN丢ACK无重提。

旧认证SQL：固定报价3、自动展示2、带原quote编辑5、原receipt2、普通编辑3、带intent4、quote+signed6、headless0、列表1（不含middleware）。

实际Request第三参调用方只有HTTP route和 `verify-apimart-preset-entries.ts`；后者已迁移到真实HTTP入口和真实Worker领取，不留Request兼容重载。其余两个现存headless验证调用继续使用已有actor/输入接口。

## 验证进度与未完成项

新verifier `verify-quote-canvas-edit-ingress.ts`接入既有pricing catalog，211→212。首次两次基线fixture失败分别是误读ExecutionBundle字段、直接执行queued任务而未领取lease；均修正测试准备，原日志/exit1/清理记录保留，未放宽产品。

修改版首次执行29场景59检查PASS，认证均1（headless0/原列表1保持），`APP_HTTP_REQUEST=0`；正常响应/原价/输入/来源/错误顺序/结果像素/账本投影与原版EXACT。全项目按lint→5093实际类型输入→tsc执行，lint与tsc exit0。

迁移现存APImart验证调用方同时修复已过时的Agent跨轮确认断言，改为验证已有的足额直接准备和真实typed工具执行；没有恢复旧护栏。该fixture媒体改为独占临时目录，fetch只允许自身loopback，结束关闭连接/schema/HTTP及自有媒体，不触碰历史固定目录。

受影响集中回归最终结果见下节。独立副本回滚、封装与远端状态以本轮VERIFICATION.txt和DELIVERY.json逐项实测为准。完整App/Worker最后验收仍归R8Z，不作为当前212通过。整体目标ACTIVE；main未合、部署0、47HOLD。

## 重启续接：辅助验证修正

- 原 `canvas-background-task-recovery-contract.mjs` 在完整eb65基线和d35均因查找已迁出的内联effect而失败；保留原日志，不把产品恢复逻辑搬回组件。兼容CLI现在复用视频跟随、视频提交、OCR编辑、pending展示四个现存执行验证；任务operationId/原子创建保留窄AST检查，明确它本身不是PG验收。
- `verify-model-execution.ts` 的旧fixture重复使用同一actor的v1草稿发布到v2，两边同样被 `PUBLISH_STALE_DRAFT_BASE` 拒绝。后续发布使用独立actor基于current创建草稿，并新增旧草稿仍拒绝的断言；没有加acceptStaleBase，也没有修改产品发布检查。
- 本节记录代码准备，修正后的实际运行、固定源码与交付证据另行补录；旧AFFECTED_REPORT的FAIL和所有原始失败输出保留。

辅助执行继续暴露两个旧fixture假设：OCR编辑验证未预期现有result-attachment的 `mode:initialize`；model-execution fixture只映射high，却在后段请求默认medium。前者在完整eb65脚本/产品上同样复现（原exit1保留），现按原baseline/当前owner区别断言；后者实际已完成headless Canvas处理后才失败，现补齐fixture声明的low/medium映射，保留high→hd。没有改产品参数编译或结果定位规则。初次续接失败日志保留，最终定向复测使用新目录不覆盖。

## 固定源码集中结果

- d35ca593：原/新29场景59检查；pricing13/13、0失败/未运行/复用，runner因选组PARTIAL/exit2；APImart真实HTTP/PG/claim/typed Agent入口PASS。
- ff6f21f3：辅助恢复4套均PASS（video-follow21检查；video-submission30场景121检查；OCR22场景79检查；pending实际React/2调用方8组36检查）；真实PG model-execution PASS，headless任务完成、冻结凭据、旧草稿拒绝与未知不重提均实际检查。旧AFFECTED_REPORT/REMAINING_REPORT的FAIL不改写。
- ff6f21f3：lint exit0（37既有warning）、tsc --noEmit --incremental false exit0、四类SCC0。编译器原始清单实际5089输入，额外4配置绑定后5093；原5093口径包含配置，修正见TYPE_INPUT_COUNT_CORRECTION.json，不把它当新增产品/类型错误。
- 从d35到ff6仅3个辅助脚本和本模块文档变化，全部产品、pricing verifier/catalog及APImart验证资产raw hash保持。后续封版只允许4模块文档桥接，不将旧日志冒称为新commit重跑。
- 完整eb65源码5337文件→当前5339文件，5个产品文件变化；其他2136个原src/services文件保持raw一致。完整当前212、固定App/Worker、有效远端CI、最终main与生产验收仍独立待办；最近main刷新e2f56255已包含。R9C是上次同步后第2功能模块，下个功能模块完成后同步计数达到3。

## 可复用调用合同

```ts
// Headless caller: typed model preparation, no HTTP Request dependency.
await enqueueTextEditTask(actor, input);
// HTTP adapter: preserves original headers/quote/signature in its own closure.
await enqueueTextEditTask(actor, input, (body, run) => prepareHttpModel(body, run));
```

模型执行上下文、任务/账务数据和transaction仍归各自既有owner；准备port只承担入口适配，既不拥有钱包也不创建另一套调度。
