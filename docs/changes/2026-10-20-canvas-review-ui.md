# 2026-10-20 画布待确认状态与加载动画分离

## 来源与边界
用户反馈：任务状态待确认后按钮锁住、一直转圈。本任务沿用独立 codex/kejun-image-failure-20261020，父77be79ec（SDK核查状态修复），仅本地修复与推送，不合main、不上线、不连接服务器、不重放历史任务。
开工已fetch origin/main，保持3f940b86基线。功能迭代计数2（上一轮核查信号/回执模块计1）；未满足3模块再次同步门槛。

## 根因
- generationFailureBlocks把uncertain/sync作为禁止重复提交的状态，此约束正确；但canvas-client同时用它写回generating=true并驱动Dock与去背景旋转图标。
- 失败占位本身已有静态提示，主按钮却仍用相同生成中状态禁用+Loader2，用户没有可用的主操作。

## 实现
- 新增GenerationSubmitAction，普通图片/空白图片Dock共用：正常生成中保留spinner，待确认/结果待同步改为静态CircleHelp+检查原任务（最小108px、单行，避开共用footer36px主按钮规则）。重复点击有ref锁。没有原查询回调时静态待确认，不将操作替换为付费生成。
- 所有已有failure写回generating=false，保留generationFailureBlocks、原generationOperationRef、回执ID及unknown重复提交门禁。
- 原任务回执检查GET加20s超时、已有结果恢复30s超时，超时中文提示，结束后恢复可检查状态；不延长或取消供应商任务，也不触发生成重试。
- 任务流动连线只在无failure时动画；右上角去背景spinner仅代表真实活动任务，独立cutoutBlocked保持不可重复提交/服务不可用/节点锁约束。
- prompt/选中/其他节点不受影响；未修改账单/供应通道/Worker/后端任务状态。

## 集中验收
- 实际runGen/generatePend/checkGenerationReceipt函数24场景：失败generating=false、unknown锁保留、原ID检查、账号隔离、stored delivery恢复、结果同步及比例warning。
- 既有失败反馈24/原图编辑9/恢复选择18项，既有编辑fixture补齐已存在代码依赖generationPlaceholderSize/placeGenerationPreview/rfNodes/getNodes；旧失败fixture补AbortSignal内建。非产品逻辑扩展。
- T3本机真实CanvasClient：普通图片和空白图片各提交1次合成任务后needs_attention；两次检查后总提交仍2次、原回执2个，静态review按钮可点、aria-busy=false、spinner0、progress0、edge动画0；切另一节点ready、可编辑提示词。
- 测试代理CANVAS_REVIEW_FIXTURE模式只返回本机固定回执，0供应商。首次原图代理fixture缺少/download图片响应，已修正；开发fixture注入账号导致既有hydration警告，不作为生产新bug/全站无console错误声明。
- baseline/modified/rollback命令、原始hash和四产物见output/canvas-review-ui-20261020/VERIFICATION.txt。

## 保留事项
此UI修复不解除原付费任务的受理不明状态，不表示已取回图片。原任务仍需后台逐单对账；本轮没有做生产操作。
