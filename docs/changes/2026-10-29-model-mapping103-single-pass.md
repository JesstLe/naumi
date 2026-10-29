# 模型映射 103 独立验证线：单次参数翻译

## 固定边界

- 用户指定独立分支 `codex/model-mapping-103-20261029`；基线 `c328f01c5a1854bce271fa53e64d324986df9329`。
- 只允许 main 合入此分支，禁止反向合 main、cherry-pick 或补丁复制进生产整合。分支持续保留，仅103测试发布，47维持现状。
- 103允许本分支固定SHA发布；数据/媒体/历史任务保留，仍按目标锁、备份、蓝绿、回滚与实际版本验收。

## 模块与职责

首模块只修应用内APIMart新参数计划中semantic quality与wire quality混用导致的二次映射。复用既有image-parameter-plan，不新增价格系统或通用框架。

## 公共接口、依赖与状态归属

`apimartExecutionParameters`读取服务端冻结的原始选择及明确阶段输入；参数编译器拥有raw→wire翻译；适配器传输拥有供应商受理身份；报价和账务模块继续拥有客户价格/预扣/结算。旧冻结任务和成本preset兼容语义保留，未知受理继续原ID恢复。

## 本次实现与迁移状态

- 已创建独立worktree，正在固化隔离规则。
- 产品修复、集中回归、固定构建、103发布及全链路验收待完成。
- 已确认缺陷：合法high→medium/medium→low映射中，quote.effectiveParameters的wire medium被重新当raw choice，最终发low而非medium。

## 验证与证据层级

本阶段仅规则/源文件检查；不将此前纯函数复现当本分支完整HTTP/PG/SDK验收。任务证据记录于ignored `output/model-mapping103-20261029/`。

## 未完成项与下一步

先补非幂等映射及报价/原ID恢复对照，再完成最小修复；103实时基线、同事占用和收费测试边界单独核对。现无本任务服务器动作或供应商调用。

## 同步与计数

功能模块计数0；开工已fetch main，固定c328f01c。文档修改不计功能迭代/发布。共享根AGENTS其他人重写未带入本分支。
