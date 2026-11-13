# 画布视频 Dock 一致性与生成前后连续性

## 模块与职责
画布展示层负责 Dock 样式、几何布局、结果与原生视频编辑器的关联。任务、冻结参数、计费、持久化与供应商执行仍由现有模块负责。本次不建立第二套生成器，不修改数据库或线上配置。

## 基线与根因
- 独立分支 codex/video-dock-style-20261113；origin/main 基线 02f76561。共享 checkout 及其未提交工作保持。
- 视频生成设置使用 CanvasComposerShell，但媒体结果手写独立面板，密度、按钮、宽度和交互不同。
- 原生视频节点 config/inputs 没有被生成操作清空；选中生成作品时落入 VideoResultDock，只剩媒体处理与继续创作，丢失原配置入口。
- 结果来源异步加载后，Dock 从媒体栏切到视频编辑器；必须把 composer owner ID 加入测量键，以重新绑定新面板的 ResizeObserver。否则带参考图时可能沿用旧高度，底部越界；本轮集中验证已发现并修复该问题。

## 公共接口、依赖方向与数据归属
- 新增纯视图函数 videoResultComposerNode(artworkId, project, nodes, tasks)。只读当前账号已加载的节点/任务，用 lastResultId/displayResultId、完成任务 artworkId/resultAssets 与 nodeId/canvas sourceId 证明来源；只接受当前项目、未删除且唯一的来源。
- 页面调用关联函数，并复用 VideoSettingsDialog。原作品选择、坐标、复制/删除/下载及媒体操作仍针对作品；保存/生成/历史针对已证明的原生节点。锁定任一端均禁用编辑。
- 导入、孤立、来源删除、跨项目、歧义结果不猜测配置，保留媒体处理栏；音频保持原生音频编辑入口。
- 节点保存继续使用既有 revision/CAS，提交使用原幂等回执、报价与持久任务；历史冻结参数不变。展示原节点当前可编辑配置，历史快照仍通过既有历史功能查看/复用。

## 实现与迁移状态
- 视频设置、视频/音频结果复用共享 compact shell/footer、620px紧凑定位、展开/收起与单滚动区域；图片/文字原有路径保持。
- 有来源的结果直接显示完整视频编辑器，保留模型、模式、时长、画幅、清晰度、引用与提示词；结果工具栏保留媒体处理并接回原节点历史。
- Fixture 添加本地任务完成回执与四结果素材，重置恢复素材和任务，避免顺序运行相互污染。仅内存边界，不访问生产与收费供应商。

## 验证与证据层级
证据根：E:/Workspace/naumi/output/video-dock-style-20261113。
- 真实 Next/React Flow + 本地 HTTP fixture：一次提交、完成后保持原编辑器、四结果重选、保存/刷新、参考图、参数、锁定、导入结果；1440×900、390×844、1000×300；均通过。付费调用0，生产写入0。
- 来源规则15例；compact布局553检查及6个短屏场景；overlay owner13检查及31原始轨迹；dock performance2640例通过。
- 图片、待生成图片、文字、原生视频、孤立视频结果三种尺寸的浏览器操作通过；音频结果390px正确打开原生音频编辑器。
- TypeScript --noEmit通过。
- 老的 verify-canvas-composers.cjs 在基线与修改版均报 ReferenceError: linkedImageText is not defined（退出1），属于旧SSR抽取fixture未跟进现有页面绑定，本次未修改该脚本，也不记为通过；用真实完整画布图片/文字检查覆盖本次视觉回归。
- 基线同一连续性脚本在 RESULT_COMPOSER 阶段失败（退出1）：结果只显示媒体栏。修改版通过（退出0）。另一个副本从修改版通过后执行 ROLLBACK.sh，7个产品源码恢复原始SHA，旧行为同阶段重新出现（预期退出1）；原修改包保持不变。
- MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、ROLLBACK.sh 为本轮包、差异、命令证据及哈希保护回滚。回滚仅产品源码，不触碰数据库/媒体/任务；测试harness保留以比较行为。

## 未完成与上线状态
本地隔离验证完成；main整合与真实线上状态分别记于交付回执。此次未连接或发布47/103，不把本地fixture通过记为线上验收。47发布保持单独确认与蓝绿流程。
