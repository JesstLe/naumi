# 2026-10-19 三类节点创作 Dock 统一

## 授权与协作

- 用户同意统一文字/图片/视频 Dock 的轻量创作外壳，不同类型保留自己的参数与生成逻辑。本轮仅本地修复，不合 main、不发布。
- origin/main 基线 f4bf7935d34d494693c6d0281657e5f442843922；独立分支 codex/canvas-unified-dock-20261019 从已完成草稿/原图分支 94589b262eff66903c0ca0cfec975e1ea49aff9d 叠加，保留 f1e2eb8a 逻辑。
- 不改共享 checkout 的 admin UI/canvas-action-menu 未提交内容；不改生成、报价、计费、供应商适配、Worker 或服务器。

## 实现进度

- 新增共用 CanvasComposerShell / CanvasComposerFooter / CanvasComposerOptions：统一浅色、标题、关闭/展开、输入区、参数/提交分区与可访问浮层。
- 文字、已有图片、空白图片、视频均接入同一外壳；正常视频入口不再进入大模态设置表单。
- 参数/引用与模型能力保持原契约；高级视频能力保留，报价与未知任务防重提保持。

## 实现细节

- 视频的普通创建、节点编辑入口一律使用 dock；完整旧 dialog 作为组件兼容路径保留，不再由 CanvasClient 正常入口调用。
- 图片风格、标记、聚焦、重试归入锚定的“更多图片参数”，不删除原回调。文字已有续写/生图操作保留。
- 视频更多参数使用共用 portal，不再替换整个输入区；不重复提示词/模型控件，保留音频、精确尺寸、负面词、分镜、摄影及自备工作流等能力条件。
- 视频的未提交草稿在本页面内按 actor/owner/project/node 隔离，最多保留64项；关闭/重新选择节点保留。此内存缓存不是云保存，刷新前需要显式保存。保存/报价/提交的原函数不变。
- 视频节点标题38px纳入overlay避让；仅改变相机安全区与浮层位置，不修改节点持久坐标。共用Dock位于Agent悬浮球之上，防止手机输入区被遮挡。
- 原图与图片提示词/比例草稿沿用父分支实现，未修改 CanvasImage、use-image-node-draft、generate-image、计费、Worker 或线上配置。

## 集中验收与边界

- 结构/源码回归：39项，共用4个外壳与4个footer；182个非UI入口命名函数（换行归一后）逐文本一致，视频 submit 原函数一致。
- 父分支节点草稿/原图模块54项；旧overlay碰撞2625组合、实时几何1920组合通过。碰撞脚本两处静态guard修正为读取已提取的dock-layout模块，未放宽动态断言。
- T3实际Next15.5.27/React19.3 CanvasClient、ReactFlow、独立无痕预览、loopback接口替身28项通过：新建视频不弹大模态、四种Dock、模型/参数浮层、音频保留、Escape焦点返回、关闭与切换草稿、保存一次、显式生成一次/停止、unknown阻断、锁定/只读、展开、390px及输入区不被悬浮球覆盖。
- 全量tsc与完整Next生产build通过（90/90页面，exit0）；保留已有非阻断lint警告，不声称全仓库零warning。独立副本回退恢复7原文件逐hash相等、移除5新增文件，恢复原视频模态行为；正式工作树保持修复态。
- 前述“生成一次”只到本机替身，真实供应商调用0、生产操作0。没有真实生产数据库/供应商/公网验收；原有鉴权、报价、账本与任务业务函数保持不变不等同于整套生产计费验收。
- 预览的SSR属性hydration提示来自本机fixture启动时注入账号/主题；最终截图交互监测无运行时异常，不将其称为已完成全站hydration修复。
- 完整构建、独立副本真回退、四产物hash与截图检查的最终结果见忽略目录 `output/canvas-unified-dock-20261019/VERIFICATION.txt`，不将旧日志或未完成步骤记作通过。
- 后续提交只进任务分支，不合main、不发布。公开更新记录不写入未上线事项；同步 origin/main 后功能计数1/3。

## 最终本机构建补充

- 功能提交：7d7b9ba6d81cd6c8c1f4d8e95b357f4f4e5d9110；本机Linux镜像 `naumi:unified-dock-20261019-local`，BUILD_VERSION=1792382271，image inspect id `sha256:8d5bf63b046aec6d5a7df1a48917abe29b7bf0a0d37a773d599181038e84dc9d`。
- 正式Dockerfile完整Linux构建、90/90页面、standalone镜像导出均exit0。本机构建产物不是47服务器候选，未上传、未运行生产容器。
- Windows Next build虽exit0/90页面，但standalone跟踪复制node_modules junction出现EPERM；没有将该目录认定为可部署制品，改用上述Linux镜像验证。第一次Docker `--network=none` 因apt缓存未命中、无包索引失败（apt100/build1），恢复正常构建网络后同一功能SHA构建成功；不涉及供应商调用。
- 本机14860/14861 fixture与本任务T3无痕页已关闭。与任务收尾/占位反馈分支7fa6da22属于同父94589b26的独立增量，本分支不夹带该未要求整合工作，也不改其生成函数。
