# 103直接更新前保留既有单次质量映射

## 模块与职责

`model-config/apimart-preset.ts`负责从冻结阶段、报价及已有operation解析参数；`image-plan-runtime.ts`读取冻结逐通道计划。质量的语义选择属于原冻结阶段，不由可能已映射的wire别名重新决定。

## 调研与实现

103前次固定运行源码`26ecb4f62f6f73c6917fe93d840b6e3630a756d9`包含`43ef3d6f`的单次映射修复，但本轮main尚未包含这两处。直接发布原main会重新出现`high -> medium -> low`二次映射。

本次只补回版本化非preset计划的semantic quality优先：冻结facts先于operation和quote.effectiveParameters中的wire质量；未版本化任务及preset保持旧解释。父本轮新增的原图目标/有效比例、nearest选择、冻结比例优先顺序完整保留，没有改供应商、报价金额、路由或已受理任务状态。

## 集中验证

- 原源码：真实adapter选择/编译复现`USER_QUALITY=high FROZEN_WIRE=medium ACTUAL_WIRE=low`，5检查，exit0表示反例复现。
- 迁入原`verify-apimart-single-pass.ts`，并增加直接runtime无selected及nearest画幅+非幂等quality的组合回归。
- 原生参数计划25、父X6比例41、父真实冻结链31均通过，exit0；实际模块/loopback层，真实供应商0。
- 未运行全项目构建或真实PG；父固定main镜像构建和103端测独立负责。证据在`output/release103-frame-20261030/preserve-single-pass/`。

## 迁移与后续

此次为保留103既有线上行为的窄整合，不作为新增用户功能。父统一提交、合main后构建；旧任务原冻结合同保持。没有本子任务SSH、部署、配置publication或付费调用。
