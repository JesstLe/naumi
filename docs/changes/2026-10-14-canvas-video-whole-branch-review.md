# 视频融合整分支复核与最终保护

按批准计划Task16，在首次固定候选构建之前使用一次全新上下文 `codex review --base 6048ae7` 审查完整分支5bae420，包含产品、协议、媒体、数据库与发布代码；不是只审最后一个文档提交。review会话01a13acf-c871-7241-b499-c7b67974908f、进程90213最终exit0；初始shell helper不可用，原review改用只读Node工具完成实际源码/差异检查。完整回执保存在本任务外部checkpoint-d/whole-branch-review-5bae420.txt。exit0表示审阅已完成，**不代表没有问题**。

## 四项结论与处理

| 问题 | 修复 | 当前行为证据 |
|---|---|---|
| P1 生图parent在running状态中断，过期后不进入Worker恢复清单 | 只为imagegen kind增加过期running候选；活动租约及其他终态规则保持 | 独立PG实际过期parent被选中，不经浏览器GET；原child ID保留，第二次claim拒绝；不是一次真实断电演练 |
| P2 Gemini多个返回视频仅保存首个 | 校验完整generatedSamples/generatedVideos数组，为所有合法URI返回resultAssets；任何无效项保留等待核查 | Gemini真实App/PG/Router/Worker两个不同SHA视频、独立作品/私有读取/跨账号拒绝/重启与一次结算PASS；results-753524a3-dc8a-4f97-8931-dc2b2aee2b25.json |
| P2 非画布生图后处理错误标为canvas来源 | local edit保持默认canvas；imagegen显式传冻结entry，workbench/agent产物记录各自来源及creation_provenance、独立group且不继承画布位置，不重写历史 | 独立PG/R2故障实际后处理workbench及agent、来源字段、parent ID、MIME/幂等/原图保护、独立group/空位置追加复测PASS |
| P2 桌面batchshot跳出到普通站 | 桌面专用native route及重定向；原HTML内部路径和browser bridge/auth/quote/settings/image/download使用desktop API代理；共享链接保留桌面入口 | 实际Chrome三个native视图及API路径、四尺寸生图保护38215 exit0，14次隔离图像调用/付费0；共享链接最后调整后desktop-only 83488 exit0，生成调用0 |

Gemini返回URI两种形态按原固定适配器兼容，完整数组处理参考[Google官方Veo接口说明](https://ai.google.dev/gemini-api/docs/veo?hl=en)（采集2026-10-14）。测试模型的numberOfVideos=2是隔离配置声明，不把其可用数量当所有Veo型号通用能力。真实付费视频API与视频内容质量仍未测。

源码修复后完整TypeScript、JS语法与diff检查已通过。Gemini专项87314 exit0；生图PG/R2及过期parent补证run-image-review-regression exit0，日志checkpoint-d/image-review-regression.log。Agent三尺寸181c28fb完整Chrome/真实Agent/持久依赖/重启/原对白及两次视频提交保持PASS，paidVideoApiCalls0，新增三尺寸面板/模型/输入/发送按钮均可见且边界在视口内。

桌面UI首批失败是验收脚本把Suspense流式重定向固定断言为307，而原页面返回200并嵌入正确目标；保留desktop-initial-streaming-redirect/{failure.log,next.log}，本批未提交任何供应商请求。改为核验HTTP/流式目标并让真实浏览器从desktop/batchshot完成导航，而非只读取目标页。第二批正在运行，不以“修过断言”冒充成功。

## 固定候选与剩余

仅导出了审阅前5bae420固定源码包，87169591字节/SHA256 0684352539b8f9dafaf96a379adcc891c9a0edcef8cc09b1c1d01237110df0f0；buildStarted=false。这份包已因以上产品修复成为前置快照，不能作为最终发布候选。实际Linux Docker可用、当前无容器、4GiB内存，WSL根盘约2%占用；未启动构建、未清其他任务镜像。

四项修复必须完成受影响验收并补审修复差异，然后提交新的clean40位SHA重新导出/构建。V12/V13最终对比、S01/S02最终候选保护、固定Linux运行/兼容回滚、103持锁发布和线上验收仍未完成。当前本目标未连接103或占部署锁，不将代码/审阅/模拟验证当作上线。

## 后续兼容补审与真实回归

未提交差异review进程5976终态exit0，但因runner不可用未实际读取代码，回执明确non-approval placeholder，不计通过。随后只读完整源码/差异审阅包实际完成复核，原包SHA256 5ececa473fe55498962f2a8174728a03f9070e621efcc2d5e416de8c26847fa0。三项Gemini兼容发现分别处理：

- 保留首视频在resultUrl的旧sourceIndex -1；旧一项清单只在冻结Gemini配置、原首项kind/identity/index完全相同的条件下追加缺项，原saved对象保持。
- 兼容旧原生protocol=gemini且videoProfile空/缺失的冻结快照，显式冲突profile继续拒绝。旧direct适配器也使用完整响应解码，映射已声明参数，次产物下载保持Google鉴权/跨源不泄漏；未知参数和高级项在预扣前拒绝。
- 对[A,A]重复URI样本，用仅原解码器写入的resultAssetsExcludePrimary标识保留独立首项，不能因URL相同吞首项或改旧编号。其他供应商维持原去重行为。

现代+原生路径47514集中PASS；补参数预扣前拒绝58224 PASS，最终证据results-4317d487-3484-44a7-ab73-6d62f8ef2fa0.json（两路径各2视频、不同SHA、旧首项/字节保持、重启/一次结算/false未映射预扣前拒绝）。重复URI实际App/PG/Router/Worker恢复38230 PASS，results-8ca34c19-0100-4e6c-9669-49b6d1a5ecaa.json（2视频产物、相同SHA、旧首项-1保持、跨账号拒绝、一次结算）。均正式视频调用0。

本批确实用独立fixture从实际保存的首视频构造旧单项清单；没有人工写入成功任务或生成结果来冒充实际Worker恢复。首项及SHA来自真实第一次下载/落存储，缺项在App重启后通过正式采集链补齐。初次duplicate专项同时发现测试别名未收窄的TypeScript错误，实际App已PASS；只修类型分支后完整tsc/diff重新PASS，不重复已绿的业务请求。三项补审回执均保留，最后重复URI修复的只读补审正在运行，尚未将整分支门槛记为通过。

最后只读重复URI补审3792终态exit0，gemini-duplicate-review-verdict.txt为“No actionable findings in this correction's scope”。完整分支首次复核和所有有证据的后续问题均已逐项解决并验收，wholeBranchReview门槛闭合；这是各次实际范围的合并结论，不把最后一个窄补审独自当全分支审查。现代/原生/重复URI完整应用证据分别登记为geminiResults与geminiDuplicate，总注册43份、应用完整审核仍30/34。新的部署代码若有改动，继续审其实际差异。

四尺寸生图最终全流程、桌面三页/作用域API/共享链接和Agent三尺寸截图均已查看；没有把Agent最后空白新对话界面当完整历史截图，历史恢复由本批较早的实际读取/断言证明。第一版桌面截图共享链接仍普通batchshot，仅作其原范围；desktop-only最后截图才证明桌面共享入口。固定Linux构建、旧镜像兼容回滚及正式103发布尚未执行，不能将这些门槛改为passed。
