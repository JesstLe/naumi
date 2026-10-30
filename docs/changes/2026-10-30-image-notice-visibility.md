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


## 最终集中验证与103上线

- 实现提交 `1bcaa3e1`，固定构建 main `2cf4644e8c98a2a4872d95f9373925c658969a40`，版本 `1793339880`。2026-10-30北京时间14:09切换、14:13验收收尾。Web/Worker同镜像 `sha256:bfb17d1b8da07f2b41944da190fcf9004d8e50d65e325229f7992c94713b5ff5`；旧实例均exited/restart=no。
- 专项原版56项中30通过、26未满足新隐藏合同（exit1）；修改版和独立修改副本56/56（exit0）；copy-only回滚恢复4个原文件、移除3新增文件（exit0），相同矩阵恢复30/56（exit1）及相同26项差异。later-edit/source-root guard exit73、WRITES0。源码和modified归档保持修改。
- C/D/E/F的24条完整文案逐字保持，A/B九类隐藏。真实源码Canvas初次plan、409后的新plan、原图runGen和空白节点generatePend展示函数均集中验证。HTTP/auth/storage/React setter为fixture。
- 完整TypeScript `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --incremental false`：stdout/stderr为空、exit0；生产构建130.63秒、exit0。network-none真实镜像首页/Canvas/37资源、版本、公开说明、Worker/media通过。
- 实际已编译Next静态模块另行执行38项通过（不是重新编译源码替代）。线上同一新容器内，用三笔原成功任务的原生GET实际返回warnings作为输入，实际chunk过滤后分别0/0/0条可见提示。C/D/E/F保留合同通过；这属于实际编译产物＋线上原回执验收，不冒充真实浏览器点击生成。
- 原来即梦/香蕉Pro/香蕉2三笔成功仍各单笔6积分，第四笔旧失败仍0积分且supplier UNKNOWN/pending保留。4个父任务payload/snapshot hash、4笔账务、3条账本、4个供应商记录和reservation0前后逐字段一致。模型117及digest保持，pending publication0。本次没有生成POST或新增扣款。
- Nginx新版静态资源全部逐HTTP/hash核对通过：507个；保留3967个旧静态文件，总3975个。DB健康、真实认证及公开版本/说明通过。
- canonical revision254，activeDirect103ReleaseId=release103-notices-20261030，phase=COMPLETE；两锁实际非阻塞acquire/release验证FREE。原数据库/媒体未回灌，47等其他站点未操作。

### 保留的旧测试与准备偏差

既有`verify-canvas-generation-failure.cjs`和`verify-canvas-review-state.cjs`在baseline/modified都因旧fixture缺`isNodeLocked`而exit1，未进入本轮提示逻辑，未计通过；`INHERITED_HARNESS.json`保留四轮原始日志。新增专项使用当前实际函数和明确依赖完成56项。

编译产物探针准备期误取React依赖闭包、stdin crypto命名冲突均已修正脚手架且保留失败日志，最终实际编译模块38项通过。产品源码未因此再改。

### 产物与续用

- 源码四产物：`output/image-notice-visibility-20261030/MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行`ROLLBACK.sh`。归档保存实施提交的文档快照；本节为部署后增量，不反写历史验证包。
- 发布与实际编译探针：`output/release103-notices-20261030/VERIFICATION.txt`及`remote-evidence/FINAL_ACCEPTANCE.json`、`FINAL_STATUS.json`、`COMPILED_NOTICE.json`，均下载重开。
- 这次只改变显示。旧服务端诊断字符串仍保留，旧前端标签页需重新加载新版前端后生效；无需重新生成已有图片。
