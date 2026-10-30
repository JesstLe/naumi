# 图片生成提示显示取舍：隐藏 A/B，保留 C/D/E/F

## 用户决定与模块职责

用户逐项确认：A1–A6（比例、尺寸、自适应、分辨率调整）和 B1–B3（蒙版、生成后抠图、透明背景步骤/积分说明）全部不显示；C（完成/恢复）、D（部分结果/处理或同步异常）、E（恢复状态）、F（失败/进度）保留。

本次仅调整 imagegen 的展示策略与 Canvas 通知入口，不改变模型参数、质量、比例匹配、原图字节、冻结计划、报价、结算、任务状态或恢复执行。服务端原诊断/历史 warnings 保留，不迁移或批量修改已有任务。

## 公共接口、依赖方向与实现

- `imagegen/notice-visibility.ts::userVisibleImageWarnings(unknown): string[]` 为无 I/O 的展示规则，只识别获批准隐藏的完整 A/B 文案。旧快照可将多条提示拼成一个字符串，按完整文案与提示分隔边界剔除，保留相邻 C/D/E/F 文案和未知提示。
- `output-advisory.ts::imageOutputWarningText` 在原有最多3条/每条240字的展示截断之前过滤，防止 A/B 占据名额而遮住保留项。Canvas 的原图生成和空白节点生成两个成功入口共同生效。
- `canvas-client.ts::submitCanvasImagegen` 初始计划与明确未受理409后的新计划使用相同过滤，过滤为空时不弹空提示；删除 B3 的独立透明步骤说明，不改变透明输出流程。
- `imageRatioWarning`、`legacyRatioWarning`、`imageOutputNotice` 与历史成功回执投影原语义保持。尤其旧比例错误的识别仍用于恢复已付款的完整图片，不能通过删除识别函数制造假失败。
- 真实失败、透明输出失败、部分交付、计费/节点历史同步异常及恢复面板均原样保留。

## 验证与迁移状态

集中验收入口：`node scripts/verify-image-notice-visibility.cjs`；专项覆盖原版反例、A/B九类、C/D/E/F、旧串接提示、真实 Canvas 提交/成功展示函数及明确409刷新路径。外部I/O为fixture；不发真实供应商请求。

既有 advisory 与 Canvas failure/review 回归、完整 TypeScript 和生产构建按最终记录补齐。旧 advisory 测试中已经过时的 `result.warnings` 静态断言改为实际两个 `pj.warnings` 调用点，并将原“必须显示比例提示”期望改为用户新要求；内部诊断/旧错误识别断言保留。

四产物、原改hash、精确命令/输入/stdout/stderr/exit与副本回滚证据保存在 `output/image-notice-visibility-20261030/`。发布状态以本文件后续终态和实际运行版本为准。
