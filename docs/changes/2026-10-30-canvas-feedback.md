# 画布截图反馈：文字、成组、批量生成与上传

## 范围与基线

- 用户要求修复截图和交互问题，并由子代理分工后合入 main；本轮不部署服务器。
- 固定基线：`3065cf964e53ccac9865ab8b26d7da6359dcec94`。
- 独立工作树：`E:/Workspace/naumi-canvas-feedback-20261030`；共享根的未提交修改保留。
- 103 模型映射独立线及后继实验分支不合入，也不复制其补丁；本轮仅修 main 画布业务。

## 待修复与验收清单

| 编号 | 反馈 | 责任切片 | 验收 |
|---|---|---|---|
| F01 | 普通文字生成/图片反推返回空正文，入口混用 | 文字链路 | 真正文正确解析；普通写作与图片反推分开；空/截断结果不伪称成功 |
| F02 | 提示词优化仍失败 | 文字响应与优化 | 保留原输入；真实 SDK + 本地响应协议复现；不自动重放请求 |
| F03 | 在线改字有选中模型却提示无模型 | 模型目录初始化 | 首次点击等待所需目录，报价和执行选择一致 |
| F04 | 抠图已扣费但结果恢复失败 | 同步工具回执 | 原操作精确读取原结果；不重复供应商调用/扣款；无证据不猜匹配 |
| F05 | 多选成组缺整体浮层感 | 组投影 | 浅色整体底板、成组拖动、原持久身份/解组/历史保持 |
| F06 | 图片按钮默认“重新生成” | 操作按钮 | 改箭头图标，运行逻辑保持 |
| F07 | 生成3张依次覆盖原节点 | 结果落点 | 原图不变、N独立子节点/连线/占位、一次冻结报价、恢复不重新提交 |
| F08 | 点击上传不能多选，拖拽却可以 | 上传 | 文件选择器多选；首图填原空槽，其余新增，返回与撤销一致 |

## 执行与证据

子代理分别实现文字/优化、批量结果/上传、成组投影；父线程负责回执、整合、集中验收和普通合并。详细模块记录见同日期 `canvas-text-prompt-feedback`、`canvas-fanout-upload`、`canvas-group-layer` 文档。

截图仅证明用户当时的现象；源码复现、完整组件、真实本地HTTP/PG、main整合与线上部署分层记录。生产供应商调用与生产数据写入均不属于本轮修复动作。

## 当前发现：抠图回执

旧同步 wrapper 对超过 262144 字符的 JSON 不保存 `result_response`；抠图存储退回内联 PNG 时会命中。路由又在返回响应前调用结算，因此存在“账务 settled，但结果回执空”的窗口；同 operationId 重试直接返回截图中的“扣费已完成，结果需要恢复”。旧路由还吞掉作品保存错误。

修复目标：抠图作品落库后先保存紧凑回执，再进入原结算；旧已结算且无回执的操作只用同 owner、精确 operationId、服务端来源证明且唯一的未删除抠图作品还原结果，不重新供应商请求、不新增扣款。不把有结果证据的恢复扩大为所有历史故障已恢复。

## 集中验收完成

- 文字/优化：真实 OpenAI SDK + 完整 Route + 本地 HTTP，19 PASS；原源码4项复现/正控，预期exit1。
- 多图/上传核心：15 PASS（包括审阅新增的重复 partial 查单不重复历史、位置同步失败首次恢复记历史、排队上传槽禁止删除/二次上传）；完整提交/receipt模块7 PASS。
- 分组：真实 ReactFlow组件20 PASS；不是服务端持久化测试。
- 抠图：真实同步 wrapper + 完整 cutout Route + 独立 PostgreSQL16 PASS。数据库SQL真实执行，钱包/供应商/身份为明确fixture；原源码“settled无回执”真实复现exit1。
- 最终完整 Next：多图/上传5 PASS；文字/优化/OCR/成组15 PASS。批量上传的原文件经过本地HTTP真实接收和SHA比对；图片解码完成后截图。
- 相邻回归：文字输出、抠图隐藏执行模型/8能力门闩、原请求恢复、480参数组合/90 JSON及multipart拒绝/5实际Route通过。
- 最终完整 `tsc --noEmit --incremental false` exit0；不是完整Linux生产build。
- 所有运行均无真实供应商请求、无生产写入。当前修复与截图时的线上响应未逐请求关联；不把“本地可达缺陷已修”写为所有历史故障已批量恢复。

## 独立审阅及父补修

审阅未发现确定P1，报告两处P2，父已实现并定向验证：
1. partial返回A/B后反复检查原任务重复pushAddUndo：以同账号/空间/项目/jobId的已交付作品集合去重，仅第一次成功合并入历史；位置同步失败后的首次恢复仍补一次历史。
2. 批量上传第三个等待槽曾uploading=false：解码开始即标busy，所有排队槽同时busy；成功移除、失败或未开始项按当前作用域解除。不把排队项视为空闲让用户删后又复活。
3. 成功回执异常少于N张时不清除placement未完成槽。

测试过程保留：首次tsc发现map中stage被扩宽为string，补字面类型后通过；两处旧验证脚本分别落后于已有“未知结果只查原任务”行为和本次retry携带placement，现更新为更严格同operation/无再次付费POST断言；并行Node worker初始化失败及一次receipt脚本参数错误保留，串行正确命令已通过。没有放宽业务条件换取通过。

## 最终交付与部署状态

- 本轮普通合并推送main；完整commit与制品hash见证据根 `FINAL_STATUS.json` 和 `artifacts/VERIFICATION.txt`。
- 修复涉及的branch/field：`runGen/generateSelectedImage` 的 fanout/replaceNode、`CanvasFanoutPlacement.slots`、`doUploadPend` 批量busy、`CanvasGroupLayer`、`ensureFeatureModelSelection`、`normalizeChatCompletionResponse`、`checkpointSynchronousResult/readSettledCutoutReceipt`。
- 四制品 `MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh` 在 `E:/Workspace/naumi/output/canvas-feedback-20261030/artifacts/`。仅独立源码副本回滚，不恢复生产DB/媒体、不重放已接受任务。实际回滚与恢复行为在最终证据中登记。
- 本次没有部署47或103；103专用模型映射实验分支及重构分支不在本次整合中。
