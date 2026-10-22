# Agent：移除关键词意图硬门禁

## 用户要求与依据
用户明确要求删掉关键词判断，不再补词或另加分类器。孙疆3原会话15条消息/72条事件证实四轮编辑均有图且模型选择generate_image，但被INTENT_REQUIRED终止。线上源码对“去掉其中的杂质，使画面干净通透，分子少一点”“在产品的底部和周围加入牛奶的元素”均复现误拦。

## 实现
- 删除AgentHarness.creativeIntent、requestedWriteCapabilities及其整套工具关键词映射、每轮writeCapabilities/consentTargets状态和check里的INTENT_REQUIRED硬拒绝。
- runtime只向harness.begin传当轮输入与中止函数；报价确认依旧由原billing precheck验证具体工具参数、待报价、用户下一轮确认、版本与时效。未以“允许所有”函数或新分类器替代删除。
- 已注册工具按模型选择执行，模型负责自然语言与否定理解；Harness仍保留工具注册、严格参数Schema、凭证/输出保护、执行许可、重复调用、次数/时限和中止。
- 功能权限、素材归属、预算/余额、真实报价确认与生图执行模块不改。public-status仅保留旧持久历史INTENT_REQUIRED文案兼容；当前执行不再发出该代码。
- 更新旧测试中已废弃的“正则识别否定/按词开放工具”预期；明确分析/否定遵循由模型负责，不再伪称正则提供保证。新增原话与已注册工具无关键词依赖的执行验证。

## 集中验收
- 原话专项：基线两句均INTENT_REQUIRED；删除后88项通过，7类已注册工具不靠关键词，未知工具/非法参数/无permit/重放/预算/终止仍拒绝。
- 原Harness104项、流式/脱敏/历史356项、独立报价确认、桥接、网络15项通过。
- 真实Canvas handler+独立本机PG+回环模型/图像协议通过：两句原话generate_image交付2张；另一次4分报价确认后执行1次，同operation重放不增加请求；总本机图像POST3次、账本扣费3笔。模型输出fixture受控，不冒充真实模型理解质量或供应商图片质量。
- 旧INTENT_REQUIRED断言改为ARGUMENT_INVALID，证明真实输入Schema拒绝及final/history原因一致仍有效。旧历史文案继续可读。
- 初次新integration fixture漏ratio/resolution触发工具Schema拒绝，补全合法fixture后通过；初次tsc新测试start类型推断TS7022，补number注解后复核。旧日志保留，不改产品Schema来迁就测试。
- 视频整套和旧runtime全链未重跑，不把更新的测试预期冒充完整视频验收；新真实Canvas链覆盖本次runtime改动。原用户任务不重放，外部供应商调用0。

## 协作与交付
独立codex/agent-remove-keyword-gate-20261021，基线53a32a0d。不动共享checkout、canvas-client或其他未提交，已通知47线程文件范围，不并行创建候选/占发布锁。代码提交推送不等于线上发布。

## 最终验证与同步
- 全量TypeScript最终exit0；原文件独立副本回滚实际恢复9个raw哈希、移除2个新增文件，复测两句原话重新得到INTENT_REQUIRED，开发源码保持删除状态。
- 本模块完成后累计功能迭代3/3，按约定已fetch origin/main并核对仍53a32a0d，与本分支基线一致，整合无需新增变更，计数归零。文档/证据不计一次功能迭代。
- 四产物位于E:/Workspace/naumi/output/agent-remove-keyword-gate-20261021。只本地测试与分支交付，发布状态等待47负责人实际回执。
