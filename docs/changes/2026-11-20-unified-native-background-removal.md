# 统一普通图像编辑与原生去背景

## 目标与根因
轻云希望提高分辨率、删除下方文字、把背景改为红色，末尾“方便我抠图”表达后续目的。旧 parser 将该词直接当成当前去背景命令，plan 切到隐藏 cutout 模型；cutout 又跳过参考图自动比例解析，导致通道拒绝 auto。用户明确选择：不再维护新 cutout 路径，让当前生图模型直接去背景。

## 基线与工作区
- 基线：531a0bb27a354888e7eec7fe109ec4747cebabc8。
- 隔离分支：codex/unified-image-cutout-20261120；共享 checkout 的 admin UI 未提交内容保持原样。
- 两份工程规范在本 worktree 缺失，实际从 E:/Workspace/naumi/docs/engineering 只读读取；未把它们或用户 admin UI 混入提交。
- 默认站点/发布规则的用户给定文本与 Git 入口存在差异，本切片只完成代码和隔离验收，不操作站点。

## 模块与职责
- background-intent / intent：区分后续目的与当前移除；显式替换底色与否定保留分开；真实 backgroundRemoval 事实独立于可覆盖的风格 useCase。显式去背景用途与红底冲突会拒绝。
- plan：新请求只有一个普通 generate/edit 步骤，保持当前模型、参考图、质量/分辨率、原报价和受理身份；不追加隐藏模型或额外去背景收费。不支持真实透明的通道明确提示，不偷偷换模型。
- Canvas：快捷去背景与 Dock 走 runGen/既有占位、进度、回执与落图；read-only、锁、功能授权保留。
- 工具页：image.generate 模型目录与价格，workbench entry 复用现有 submitCanvasImagegen；tool-image-edit 只负责编排原任务轮询，不拥有另一个报价/任务系统。
- delivery / dispatch：去背景要求可见主体及至少 ceil(totalPixels/1000) 完全透明像素；普通半透明图原契约保持。失败保留已受理的原图、账务、检查点，不当成未受理再次收费。
- 历史 cutout operation、adapter、旧 API 和冻结回执继续只作兼容，不再供新入口选路。

## 公共接口与状态归属
- Intent 新增可选 backgroundRemoval，执行 helper 统一供权限、分类和交付使用；旧无字段计划按原 operation/useCase 兼容。
- submitCanvasImagegen scope 可选 entry（默认 canvas）；workbench 响应携 replayed，canvas 原响应不变。
- runToolImageEdit 使用原 owner/workspace/project receipt；未知受理、404、partial、needs_attention 不再 POST。
- 确认 failed/cancelled 且无产物时，下一次用户点击才能重查原任务并释放同 scope 回执，再创建新 identity；不自动新购。账号/工作空间变化仅清 UI retry 引用，旧回执保留。
- 模型能力、报价、任务、账务、持久化仍归原有模块；没有迁移数据库或供应商配置。

## 回归与证据
外部证据目录：E:/Workspace/naumi/output/unified-cutout-20261120。
- 修改前 intent、hidden-cutout、postprocess PASS，原链路输出 TRANSPARENT=generate+cutout。
- 新意图、真实规划/选模/报价、能力、合同、像素及调用方集中验证；hidden-cutout 38 项覆盖显式/自动 useCase 绕过与拒绝不支持透明通道。
- requote/recovery 126 项：同 flight、未知受理、原 identity、失去 ACK、工具成功/replay、显式终态重试和跨 scope。
- 真实隔离 PostgreSQL：durable parent claim failure 恢复、单步 native edit、一次报价结算、batch 原回执不重提；opaque 结果拒绝、保留原图且不自动重购。
- 原 cutout receipt 17 项兼容 PASS；parent completion 25 项，loader 装配新增真实 intent 模块，未削弱断言。
- 实际 Next UI + Edge 浏览器 25 项 PASS，1440/390：轻云红底、快捷/Dock、工具页、拒绝伪透明和显式重试。API/供应商为 loopback fixture，非线上验收。工具页 history aside 仅增加 min-h-0，修复历史列表撑高 grid 后 footer 遮挡重试按钮；17条历史实际视觉检查与鼠标点击恢复通过。
- 独立 Reviewer 代码级 PASS；审查发现的 useCase 绕过、失败重试与跨 scope ref 均已关闭。最终命令/退出码及源码散列以 VERIFICATION.txt 和集中 runner REPORT.json 为准。

## 保留行为、风险与未执行
原定价冻结、幂等、防重放、普通半透明输出、旧任务恢复、节点版本/落点保持。没有线上付费调用、没有发布、没有修改生产配置。Alpha 最低门槛不证明主体语义保真；生成式编辑可能重绘细节。历史兼容代码的删除需另有旧客户端/未完成任务退出证据，本次不删除。

## 回滚
四件套保存仅本任务文件的原字节及 SHA256，ROLLBACK.sh 只允许带标记的副本并核对修改哈希；副本回滚后重跑旧测试，真实工作区保持新行为。程序回滚不回灌数据库、媒体或重放付费任务。
