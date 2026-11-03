# Dock 单滚动、引用选图与展开收起

## 范围与基线

- 用户截图反馈：长提示词出现内外两条滚动条；`@` 多图列表被底部参数栏挡住；右上展开按钮没有改变行内编辑区域。
- main 基线：`78a1366216a60c27dfd22ae1405fb2aef8f4d7e3`；分支 `codex/dock-reference-layout-20261103`。
- 只调整容器布局和交互。不改节点身份、正文 wire、持久化、引用角色、生成参数、报价或已受理任务。延续本线程只合 main、不更新 103、不公开本批说明的决定。

## 模块与职责

- `CanvasComposerShell` / CSS：固定头尾；图片/视频只有正文 body 纵向滚动。展开前后保持滚动位置，鼠标切换按钮不夺编辑焦点。
- `canvasDockLayout`：媒体展开具有真实 `height` 和 `maxHeight`，使用画布安全区域，保留节点工具条，不操作 ReactFlow 缩放或节点坐标。
- CanvasClient / VideoSettingsDialog：媒体展开状态绑定当前账号/项目/节点，已有文字编辑展开保持独立。移除给 contenteditable 套用旧 textarea 高度/overflow 的两段逻辑。
- `ReferenceMentionPanel`：图片与视频复用 body portal，当前光标行/可见编辑区定位，空间不足向上展开；多列缩略图，只滚面板，不拉动 Dock。

## 实施与集中验证

- 已完成原生 image、pending、video 展开接线；文字 controlled 展开逻辑保持。展开只变 Dock，完整 Canvas 中实际 viewport 样式和节点坐标保持原值。
- `node scripts/verify-dock-reference-layout.cjs BASELINE`：原3个滚动容器、展开高度差0、候选裁切反例复现，exit0。
- `node scripts/verify-dock-reference-layout.cjs MODIFIED`：12组真实React/Chromium/CSS module/layout通过，exit0。覆盖60行正文、16图、桌面4列、上翻/下翻、390px与低高度、键盘末项、候选单独滚动、IME、外点关闭、resize、焦点及选区保留。
- 同一1440×1000输入下Dock高度310→790px、正文可视区213→693px，只有body一个纵向滚动容器；16张候选可同时显示。不是容量指标。
- `node scripts/verify-inline-node-references-e2e.mjs DOCK_FINAL`：7组完整CanvasClient/ReactFlow＋真实登录/PG/上传/复制共享通过；新增原生展开、唯一scroll和不改变viewport/node的断言。所有fixture自有PG/browser/服务已清理。框架导航等仍沿既有测试适配，不等同于生产Next SSR。
- 原引用编辑22组、私有缩略图8组、实际React→原提交适配器回归均通过；没有更换引用对象或wire。
- 原碰撞布局2625组、默认/文字/只读/窄屏几何1920组保持原结果。
- 完整 `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`：stdout/stderr为空，exit0。
- 原hash、准确命令、literal stdout/stderr/exit、回滚和全量预检记录在四产物中；副本回滚后恢复原3滚动/展开无效/候选裁切行为，工作源码保持修复。

没有服务器更新、模型请求或公开说明变更。首次基线测试的光标脚手架修正已在测试文档记录，产品行为没有为测试放宽。

## 保持事项

- 私有缩略图继续 `CachedImage` 授权缓存；键盘/IME、稳定 key、失效引用和原提交编译保持。
- Portal 不保存业务状态，不新建图片、任务或网络供应商请求。
- 四产物及截图归档于 `E:/Workspace/naumi-task-evidence/dock-reference-layout-20261103/`；仅独立副本回滚，活动源码保留修改。
