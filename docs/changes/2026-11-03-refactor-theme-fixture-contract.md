# Core 主题矩阵：测试 fixture 协议与主线交互同步

## 基线与真实失败

- 当前产品/源码输入 `4560c526d70a65f34d1177fe2f522eae98173a55`，main ca00b1f1；完整5696原tracked raw hashes已封存，本模块不改产品。
- 通知针对旧936fe80 Core41621196531/job125867049939；实际merge source56eddbf，完整build与SDK准备已通过，core78PASS/1FAIL/158NOT_RUN。失败case `canvas-theme-matrix` 原30,000ms等待generation-placeholder超时，旧四组主题sample此前均到达。
- 远端377文件artifact已下载重开，ZIP SHA256 `e903eaeb28f308b4bd3ebdfb94076c9ff54a13b466c12b57747503dca15ec334`。ERROR body记录“提示词保存回执不完整”“提示词正在读取，请稍后重试”，pageErrors为空。旧artifact没有API轨迹，原imagegen POST次数保留UNKNOWN，不据推断标零。
- 当前4560完整源副本用原脚本、原预算真实执行，先在文字模型button定位处超时：主线默认正文模式，而模型在AI写作模式；原失败与截图归 `output/pr8-core-936fe80-audit-20261103/current-original`，不冒充旧180相同失败。

## 责任边界与实现

主题测试要测真实组件的色彩、对比、焦点、主题持久化、生成中/错误/恢复态，不应因HTTP fixture遗漏保存协议阻断原生成入口。

- 原serve-regeneration代理对未实现的image-prompts返回generic200，缺少document/revision。实际ImagePromptClient拒绝该回执，ready保持false，生成前flush拒绝。产品保存门禁正确，不通过绕过flush或伪造已保存状态修测试。
- 将canvas-mapping-ui-fixture中已经存在的图片提示词协议抽到专属 `canvas-image-prompt-fixture.cjs`。owner只拥有fixture document/revision、operation replay/fingerprint/CAS、文档/引用/项目校验与原save gate；getArtworks延迟读取，避免主题account首次赋值及后续group变化捕获旧列表。各调用方保留HTTP/Playwright adapter，不泛化鉴权、计费或生产存储。
- commonFixture原handle/prompts接口与其他端点不变；主题仅拦image-prompts接该owner，不扩大修改基础proxy。
- 主题动作显式切AI写作后检查文字模型；OCR从更多处理menuitem进入；文字故障态在AI写作要求中CtrlEnter，不把正文快捷保存改成购买。
- 原主题组合、对比阈值、断言、超时和无重试合同保留；RESULT/ERROR增加真实prompt fixture请求状态用于定位，不吞错误、重放任务或增加真实供应商请求。

## 验证与证据

新增source-root窄oracle使用实际主题route callback、原serve fallback、ImagePromptClient及准备/提交门禁；基线用真实缺失receipt失败，不以新增export缺失伪造失败。fixture owner抽取前后对原mapping接口投影需要EXACT。

完整Next主题矩阵、共享fixture组合回归、类型/lint、正式selected与四产物回滚的最终命令/输入/字面结果，以 `output/pr8-core-theme-fixture-20261103/VERIFICATION.txt` / `DELIVERY.json` 为准。初始旧远端与当前入口失败分别保留绑定；局部通过不重标完整core245或后续登记数。

## 集中模块验证

- 完整Next/ReactFlow/Edge最终4主题组合、98检查（含原locale检查）全部PASS，0 violations/pageErrors/hydration/external/supplier，原预算与gestureRetries=0保留。
- 首个适配候选在OCR菜单accessible name包含hint处超时，保留原记录；最终用原data-action=edit-text且验证可见文字，仍走真实menuitem。
- 后续98项完整候选只GENERATING_ACTION_DISABLED为false：旧产品standard模式原ACK后即释放，不能把后台job持续执行等同提交锁。保留此原断言，在同一原POST进入fixture gate且尚未continue/ACK的确定窗口与placeholder并行等待（均30秒），测disabled；release同一request后验证原200回执、按钮enabled、原operationId一致、fixture恰好1次原提交。未修改产品background合同或增加第二POST；finally只abort仍被hold的请求。
- 原初完整98/1、preACK版98/0、最后补进入gate barrier的98/0分别留证，不用最终PASS重写失败。
- source-root实际client/实际route/原consumer窄oracle：旧missing receipt→ready false→creation port0；修改typed receipt→原flush成功→creation port1。这里creation是显式外部port，不是实际付费或HTTP证明。默认固定mapping合同CONTRACT；额外显式旧源差分才标EXACT。
- 非增量tsc5606输入exit0/hash稳定；5代码路径最终lint0error/0warning；首次oracle局部module变量触发Next规则的失败保留，仅将该loader变量及引用alpha重命名为loadedModule，没有suppression或业务改变。runner31场景/430检查PASS。

## 未完成项

本模块正式selected/四产物与当前新头CI继续收口；整体重构ACTIVE，未合main、未部署、47 HOLD。R04、同case页面及当前完整固定Web/Worker/runtime/performance门槛独立，不以fixture或SCC结果关闭。
