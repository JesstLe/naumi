# R9R：旧生成页的会话职责与异步身份

## 模块、接口与归属

独立工作树 `E:/Workspace/naumi-refactor-20261024` / `codex/core-refactor-20261024`，完整基线 `1e2df80c6812d685b01ba2be4e508d5814ff3ee9`，5362原始raw文件。整体重构ACTIVE、47 HOLD。

- `imagegen/generation-session.ts` 拥有浏览器生成会话的提交准入、原job观察、结果去重、原报价对应的视图结算投影、账号epoch与迟到响应优先级。仅消费窄transport、cache、view端口，运行时不导入React/Next/数据库/供应商，不另造任务或账务系统。共享用户/图片类型只用type import。
- `generate/use-generation-session.ts` 是React与浏览器协议adapter：绑定账号、现有`useImageJobResume`原缓存/active发现，编码原multipart，调用现有billing submit、认证和只读GET，投影会话决定。
- `GenerateClient` 保留表单、底图/模板、作品记录和展示；不再拼付费提交、执行轮询或决定异步结果归属。JSX布局/文字不变。
- `useBillingEstimate.submit` 只透传原BillingProvider已存在的pre-POST callback，报价、原operation/原intent、钱包、服务端任务与事务仍归原owner。新增可选参数不影响原两参数调用。

## 实际原/新对照

新verifier运行实际GenerateClient、实际新hook/owner、React19、Chromium、loopback HTTP与原2500ms时钟；auth、报价/账务后端、供应商和无关UI明确是fixture，不冒充真实PG扣款或供应商付费链。

最终固定基线18场景：11通过/7失败，exit1。修改版相同18场景：18通过/0失败，exit0。原正常multipart（提示词、参数、email、model、父作品优先、文件hash、quote、operation）投影一致；原模板、去重、权威钱包优先、本地无server-user兜底、明确拒绝/无job、terminal错误/403、原ID缓存和StrictMode恢复保留。

收尾复核另外发现中间版把比较用的归一化账号直接写入请求。实际owner probe复现`A@Example.test → a@example.test` / exit1，未发送供应请求。现用`account`只比较、`submitAccount`保留绑定时原值；新增浏览器场景核对原请求email不变，并执行实际`clientIntentKey`验证两种账号输入的旧/新multipart指纹相同，exit0。中间版3cc88f19与原始失败均保留，未单独push，不把它作为最终版本。

七项实际反例是：同一React更新前双击产生两个浏览器POST；账号切换后旧结果/钱包投影仍回写；延后执行的结果updater跨账号写入；billing准备期间退出账号仍派发未发送请求；unmount后仍处理旧回执；旧active列表在显式新任务完成后恢复旧任务；503直接结束观察且poll ref残留。没有据此声称线上发生重复扣费或所有历史出图失败均归因于这些反例。

现由同一会话token在header/POST前、回执body后和React updater实际执行时核对所属视图；账号切换/unmount只分离GET观察，不声称取消上游。暂时读失败只重读同job GET，绝不自动重POST；观察截止保留原任务缓存，不把UNKNOWN改为未受理。旧发现结果不能盖过已开始的显式新操作。

verifier初始两轮因fixture漏登记真实纯依赖、Next浏览器环境没有定义而未进入业务；保留原失败，不把它们记为缺陷复现。修正仅为加载实际images/quality/routing及明确空browser env，原新采用相同fixture，全部源码hash稳定、HTTP/browser/context已关闭。

## 上轮CI的独立真实失败

1e2df80c的Image完整远端SUCCESS；Core在`parent-completion`失败。检查注释实际执行源是GitHub PR合并快照`d70820f8325adc6f4fa79fb17643a527215ae0c0`，head仍1e2df80c，不能把两种SHA混写。25项全部在`UNMOCKED_IMPORT:src/lib/image-jobs/runtime.ts:@/lib/image-quality`停止。

本地原父任务脚本再次执行保留同样失败。仅给其显式依赖表登记真实纯模块`image-quality.ts`，不stub分类结果、不改产品、不删除25项父子回执/UNKNOWN/lease/账务断言；修改后25/25实际PASS、供应POST0、SETTLE_CALLS0、NETWORK0、exit0。新生成页verifier接入原core目录及每case证据端口，不写全局历史路径。

## 验证与未完成

集中非增量tsc exit0、受影响八个文件lint exit0；5096编译器输入与4配置绑定。原/新普通multipart/quote/文件hash投影EXACT，JSX展示块逐字节不变。

最终同一个现有source-bound runner单次执行三个真实child：新生成会话18场景、父任务25场景、实际PG图片报价25场景74检查，3/3 PASS、0FAIL、0NOT_RUN。后者确认原6/当前150、原价单次结算、余额不足及UNKNOWN不重POST；属于单独实际服务端链，不冒充本组件fixture的真实付费trace。最终三个child全部重新实际执行，不复用中间17场景结果。选择范围保持PARTIAL/child driver exit2、completeCore=false，其余217目录项未本轮重跑；PowerShell外层对该非零退出返回1，原值均保留。新浏览器详细报告实际落在runner的case目录，继承全局路径未使用。

原始5362 raw hash、副本恢复后的原18/父25失败行为、修改版归档及最终SHA以最终四产物和`output/refactor-r9r-final-20261101/VERIFICATION.txt`为准。`output/refactor-r9r-20261101/`保留中间17场景、准备失败及3cc88f19，不作为最终交付。模块组件边界通过不等于同一真实付费断线E2E；该退出要求仍OPEN，并继续沿原实际App/PG/Worker验收，不用mock HTTP换绿。

F02提交/观察/投影职责已迁入；F01首页会话列表/上传、F03后台发布恢复继续推进。完整新head CI、最终main整合和部署分别验收；整体目标不收缩为本轮17项，main未合、未部署。**分支超过48小时，延迟原因是整版放行/main尚未闭合。**
