# 统一视频编译架构 RFC 交付

## 模块与职责
视频模块执行语义与编译；模型配置模块拥有已发布绑定/显式政策；媒体模块拥有可信素材；计费/任务/画布资产保持各自状态与事务。本轮为纯文档交付。

## 公共接口、依赖方向、数据/状态/事务归属
[统一RFC](../architecture/2026-11-14-video-compiler-rfc.md)定义Profile.describe/compile、统一compileVideoRequest、CompiledVideoPlan、ModelBinding/ExecutionPolicy/CapabilityEvidence与Resolver接口职责；入口->应用用例->纯Profile规则/既有I/O适配，领域不依赖React/Route/DB。不拆现有计费事务。

## 实现与迁移状态
- RFC替代旧v2作为后续实施依据；旧执行文档及三份变更记录标为历史；整合main并行v3 4962cb29，全文保留，冲突裁定归RFC§15。
- 范围覆盖Canvas/Workbench/Workflow与批次/Agent/Storyboard/BYOC、所有已注册协议族以及无videoProfile的direct/openai路径。
- 旧capabilities.video不自动转显式政策，保留未知与明确禁用区别；同协议型号允许配置扩展，不由静态型号表二次否决。
- 补未来依赖阶段编译、短期签名地址物化、版本化计划、历史恢复/显式重试、同源预览与19项验收标准。
- 审阅基线4b499960，整合基线4962cb29；产品源码修改0、线上配置/节点/任务修改0、供应商调用0、发布0。RFC接口均为目标规格，并非本轮实现。

## 验证与证据层级
完成源码调用清单、文档链接/行号/围栏/决策一致性检查与git diff --check。具体命令结果存任务证据目录E:/Workspace/naumi/output/video-compiler-rfc-20261114。未执行业务构建、迁移或上游E2E；文档合main不等于实现或上线，不增加功能/发布计数。

## 未完成与下一步
按RFC P0建立核心；P1所有入口、P2所有协议/绑定、P3清场、P4应用与真实上游分层验收均待实施。共享checkout及103隔离实验线不动；本轮不发布47/103。
