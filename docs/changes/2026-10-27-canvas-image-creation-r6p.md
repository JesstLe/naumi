# R6P：Canvas 图像创作意图与多阶段编排

## 基线与调查

独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。基线 `fcda31d512c743a72aeb996a327ce3de14dbfe96`；4622 原文件 hash 和完整归档见 `output/refactor-r6p-20261027/BASELINE.json`、`BASELINE_SOURCE.tar`。

开工刷新并普通整合固定 main `e4369998d00f044cf5ad0150e8c7b7dbc055e12f`，4 个提交只涉及文档/AGENTS。保留本轮原生能力适配原则，未迁入上游页面、数据字段或新任务系统。

调查确认：助手会话/SSE/恢复已在 R5M 归唯一 owner；本轮保留，不重复拆。实际剩余变化理由是普通生成、三视图、重做、助手点击生成的规则与 stage 编排仍混在 Canvas 组件中。单图片任务的报价/提交/回执/位置/落图已在 R3A/R2 归原 owner，本轮继续调用，不创建平行 controller。

## 所有权与接口

- `canvas/image-creation.ts`：拥有创作意图、原提示词继承、普通/合成三视图/分图/详情分发、重做血缘和多阶段顺序。
- 仅通过四个显式端口协作：`generate`（原 image task）、`detail`（原 detail task）、`rename`（原 history/document）、`isCurrent`（原 account/project/workspace/epoch scope）。不引用 React、HTTP、计费、数据库或 Canvas 组件。
- Canvas 负责捕获编辑栏输入与组装端口，展示返回的输入错误；原占位节点、任务位置、选择和文档写入继续由原 owner 承担。
- 空白节点共用同一提示词继承函数；参考图字节/顺序/角色、用户原文、比例/分辨率/数量、血缘、operation key 与阶段 offset 保持原规则。
- 多阶段三视图在前序交付及改名 await 后继续检查原 scope；项目/账号/workspace ABA、卸载不把后续阶段受理到新上下文。已经受理的原任务仍由原 task/receipt owner 恢复。

## 状态

实现已接实际 Canvas；完整原函数对照：旧48/新49检查、34组创作输入/文件字节合同相同、9组时序中旧12次迟到后续调用→新0，选中节点变化继续原创作。原图片任务46场景176检查、文字生图输入67场景、选择批执行和并发静态合同、首轮全项目tsc、源码lint（0 errors/7 warnings）通过。

固定版本core、完整Linux实际产品控件、回滚与远端验收正在集中执行，终态以DELIVERY/VERIFICATION为准。时序夹具统计应用端口调用，不冒充线上付费重放证据。

整体目标继续 active；本轮不合 main、不部署、不接发布锁。独立重构线超过 48 小时按用户要求保留，主线已按固定输入普通同步。
