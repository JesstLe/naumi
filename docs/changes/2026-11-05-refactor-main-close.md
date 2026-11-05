# 重构主体合 main：最新画布增量适配

## 范围与固定输入

用户本轮授权将重构主体正常合入 main。输入：重构 PR #8 `268076b7fb4900509817af7321ad34a85698c86c`；main `3fea9f3a32a2eed2099195d1d2ada8b578613a8a`；共同祖先 `ca00b1f125fff1077277c3a3b0cbf5b7df4b34f3`。独立工作树 `E:/Workspace/naumi-refactor-main-close-20261105`，未切换或覆盖共享 checkout。

main 独有两提交新增文本记事本与图片提示词复用；唯一文本冲突在 CanvasClient，但按职责将行为迁入既有 owner，不以 ours/theirs 整体覆盖。PR #11 为重构之后的独立业务增量，不属于本候选。

## 模块、接口与状态归属

- 正文润色：`text-task-request` 生成实际调用指令，polish 保留节点独立 AI 写作要求；`text-composer` 明确正文按钮。任务/UNKNOWN/重试/历史继续由 text task owner 持有。
- 直接文字输入：main 的 `linked-image-text` / `prepare-linked-image-text` 解析和冻结同项目明确连线。`image-composer` 展示相同解析结果，草稿只存补充说明；原 `executeCanvasImageCreation` / `runCanvasBlankImage` 执行，不复制计费/任务系统。
- 保存 ACK：text document 暴露按 ID 的 `flush(ids)`、`hasUnsaved(id)`，复用原队列及草稿；无参数 flush 保持原行为。不因生成一个图片而保存无关文档。
- 专用文字生图：text image owner 等待所有 recipe 来源 ACK 后重读，拒绝新增未确认来源；传 `frozenTextPrompt`，不重复拼接普通直接连线正文。
- 准备期和 scope：临时准备标记阻止同 pending 重入、删除、换连线与上传；ACK 后重新核验账号/工作区/项目、节点存在、输入关系、锁和保存状态，再交给原任务 owner。
- 图片草稿：版本选择、撤销/重做不将历史 provenance 反灌草稿；上传 ACK 将 pending 草稿/引用迁移到真实作品 ID，已有目标草稿优先，作品历史不改。

## 验证与证据层级

基线旧固定提交的 core/verify CI 成功仅作历史基线。新候选必须使用自己的 source SHA/digest；不复用旧 SDK manifest 冒充新候选通过。

实施期模块 baseline 与回归、main 新增纯函数/真实 Canvas 接线、TypeScript、完整 Next/Chromium 受影响画布验收，集中执行并记录实际命令与退出码。正式 core 采用 `verify-refactor-image.mjs` -> `verify-native-application.py prepare` -> `verify-refactor.mjs`；verify 工作流的运行结果独立记录，不把 core 通过写成所有 CI 通过。

当前已执行：TypeScript 全量 noEmit 通过；编排器 33 cases / 447 checks；图片创作 54 checks（含新增准备期 ABA）；文本任务 34 cases / 234 checks；文字生图 72 cases / 275 checks（原 trace 精确比较）；图片导入 19 cases / 102 checks；图片任务 47 cases / 177 checks；main owner 7 cases / 44 checks；文本 document 22 cases / 68 checks。新解析/准备/输入分别 17/15/16，节点草稿 62，Route + 真实 SDK loopback 38，main 真实函数语义 28 均通过。

实际 Next + Chromium：正文/提示词复用 17、后台任务 10、像素 Dock 18、缩放 14、紧凑 Dock 24、文字 UX 17，合计 100 checks 通过。实际图片已解码，页面错误 0；HTTP/报价/保存/供应商回执为明确本地 fixture。首轮 fixture 使用旧单体恢复按钮及旧 history 无 canonical artwork receipt，已按真实重构任务恢复与服务端回执契约适配，保留失败记录；没有删除业务断言或据此更改产品。

正式 core catalogue 加入 4 个新主线检查，现为 255 cases；正式同源构建/core 和 verify 仍需在固定候选上执行，以下 artifact 记录最终结果。

最终命令、literal 输出、回滚副本与远端合并回执保存在工作树 `output/refactor-main-close/`，封存四份产物为 `MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、`ROLLBACK.sh`。本文件为候选实施记录，不预先宣称这些验收全部通过或远端已经合并。

## 发布与后续分支

main 名称/历史保持；合并后它即包含已验收重构代码的新开发基线，无需把重构分支改名为 main。PR #11 单独保留，生产 HOLD 不解除。不自动部署 47/103，不改线上配置/数据，不调用付费供应商。仍被 PR #11 或他人工作树使用的重构分支不删；后续变更从最新 main 开短分支。
