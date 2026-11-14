# 视频意图执行文档 v2：编译即能力（2026-11-14）

> 历史文档交付记录。后续架构与实施范围由[统一视频编译 RFC](../architecture/2026-11-14-video-compiler-rfc.md)取代；下文描述当时方案，不作为当前开工指令。

模块与职责：视频请求能力判断链路（video 契约/编译、canvas 视频草稿、模型能力数据）。本轮为纯文档交付，未修改业务代码、线上配置或生成任务。

公共接口、依赖方向、数据/状态/事务归属：不涉及（无代码变更）。

本次实现与迁移状态：

- `docs/superpowers/plans/2026-11-14-video-intent-execution.md` 由 v1（调和多闸门）重写为 v2 击毙版：**能力声明（modes/limits/帧标志/时长分辨率矩阵）作为执行闸门的类别整体删除，逐型号输入空间（`video-family-capabilities.json`，回执来源，32 条）＋wire codec 编译器成为唯一能力判断点**；管理端只能收紧、不能发明能力；模式降级为编译产出标签＋UI 偏好（`config.mode` 永不执法，reconcile/attach 写入口删除）。
- 七项删除清单（D1-D7，含前端预检执法、契约层能力对照段逐分支处置、`resolveVideoCapability` admin 优先翻转、旧核验 codec 退出新任务路由、`fallbackCapability` 造能力、整对象模板升级器）；四类物理校验明确保留。
- 关键新事实（本轮核对）：`apib-documented.ts:13` 在 codec 内对同一输入做第三次 `normalizeVideoInput`——v2 收敛为结构校验一次＋编译（含 space-fit）一次；新增 dry-run 编译预览端点与提交共用同一函数，UI 不再复制判断。
- 对 47 的影响：恢复图生只需 P0（编译器统一）+P1（UI）+P2（仅切 profile 路由 legacy→v2/v3），**"补齐 21 型号能力配置并发布"任务消失**。
- 五轮审校完成并修正：编译签名收紧参数归属（InputSpace 构建处生效）、F3 补充（text 偏好＋媒体视同未给偏好，消除与"报错不降级"的自相矛盾）、D3 逐分支处置（结构类保留/比对类迁移/事实类换源）、V3 补 FRAME_* 语义迁移断言、V7 改为门禁内新增快照断言（不虚指既有测试）、V1 范围补 F3。
- v1→v2 对照表随文；v1 中仍成立的决策表/纯函数推导/两张普通图≠首尾帧/历史冻结不动全部保留。

验证命令、结果及证据层级：纯规则/文档修改；执行了内容、引用与差异核验——file:line 锚点按 origin/main 9430289a 逐条 grep 复核（apib-documented.ts:13、model-definition.ts:16-20、contract.ts:80/97/100-158、capabilities.ts:119-140、submission.ts:74/80/88、node-submission.ts:44-48 等），json 条目数 32 经 node 实数。未运行业务构建，不构成功能迭代或发布计数。

未完成项与下一步：按 v2 §11 顺序实施（P0 编译器统一+V1-V7 门禁 → P1 UI → P2 47 切 profile 发布 → P3 清场）；V9 线上验收留待发布轮次。
