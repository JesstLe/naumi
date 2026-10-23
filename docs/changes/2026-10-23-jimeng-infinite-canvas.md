# 无限画布交互借鉴

## 目的与基线

按用户要求实际体验即梦新版节点画布及旧版图片编辑画布，将有用的操作方式落到Naumi，而非只交概念报告。界面保持浅色，图标、文案、预设由项目独立实现，不复制第三方品牌资源。

工作分支`codex/jimeng-infinite-canvas-20261023`，基线`d7461ee734f886bbaa2649c92e4a4fa1f0de1992`。共享根18处未提交修改不动；另一线程负责生图限制清理及47发布，本任务不修改生成、计费、供应商、幂等、恢复或Worker执行语义，不并行发布。

## 实际调研与能力矩阵

原始证据留忽略目录`E:/Workspace/naumi/output/jimeng-canvas-research-20261023`，包含新版生成参数、节点搜索、Agent并排、配色和资产库截图。浏览为已登录会话的独立研究标签，未上传或执行付费生成。

| 观察到的操作 | Naumi处理 |
| --- | --- |
| 点阵画布、工具区与视图区分离 | 保留已有浅色画布及视图工具，不复制深色皮肤 |
| 就地生成器、模型/比例/清晰度/数量、可见价格 | 复用已有composer-shell与模型能力目录，不硬编码第三方档位或价格 |
| 参考素材、编号引用、提示词关联 | 复用已有ImageReferenceComposer，不改变提交输入合同 |
| 节点前后续接、复制、撤销、导入、下载 | 复用已有连线/创建/历史/ZIP操作；不建另一条生成链 |
| 节点搜索、分类、定位与计数 | 本轮新增画布大纲；只索引当前画布，查询名称/提示词/内容，类型筛选、定位、选择结果 |
| 缩放、适配画布/选区、小地图、连线显示 | 复用已有缩放/小地图，补适配选中项入口与200%档位；连线仅hidden，逻辑拓扑保持 |
| 多节点快速整理 | 本轮新增选区六向对齐、等距分布，沿用原坐标事务与单步撤销；不触碰未选节点 |
| 相机/配色/风格预设 | 本轮新增原创配色/风格/镜头提示词库，仅显式追加到当前草稿，不改模型、参数或价格、不触发生成 |
| Agent并排、收起、引用 | 复用已有CanvasAssistantPanel与选中引用 |
| 资产搜索与分类 | 复用现有历史导入、项目与媒体库；本轮不复制第三方用户资产 |
| 旧版固定尺寸画板、独立输出域 | 仍需专门模块；现有分组/工作流组框不冒充完整画板 |
| 单图变体历史切换 | 仍需专门模块；现有项目vN不是单节点版本；已有视频多产物选择保持 |
| 音频/时间线/主体/导演台的完整执行能力 | 不以新增空按钮冒充完成；按Naumi已有能力显示，后续另接实际执行合同 |

## 当前实现

- 新`navigator.ts`纯索引与筛选，`CanvasNavigator`浅色大纲面板；搜索当前节点，支持类型计数、查询结果多选、Shift扩选、锁定/执行状态及视图定位。
- `canvas-client.tsx`仅薄接线大纲、选区几何及创意预设；复用`applyArtworkSelection`、React Flow `fitView`、`applyHistory(move-many)`与`pushUndo`。
- 选区布局持久化先于本地应用/撤销；只读、锁定、临时节点、特殊工作流组框不参与移动。原scope变化则不追加撤销。
- 预设仅在用户选择并应用后追加提示词，不执行报价/请求。原草稿与引用仍由已有imageDraft持有。

## 验证进度

集中验证首轮暴露“提交后视频refresh失败丢失undo”及测试环境问题，原始失败保存在`INTEGRATION_FIRST_FAILURE.json`，未用后续成功覆盖。第二轮87/87通过后，独立只读复审发现三项P2，已窄修并进入最终补验：

- 含视频的新move-many操作（包括撤销）在组装revision前刷新；缓存的未知提交保留原operationId和载荷，禁止重新绑定。
- 连线关闭使用hidden呈现，保留React Flow逻辑边，避免影响全图整理拓扑。
- 新对齐调用取真实measured/style/data节点边界，不复用旧布局helper的媒体标签避让留白。
- 实际浏览发现全量预设卡片高度被压缩，补grid-auto-rows:max-content，桌面名称与色条恢复可见；390px面板374px宽，镜头卡双列、名称可见。

纯helper已完成选区23组（64组seeded选区）、大纲22检查、创意预设26项。类型检查、原scope history11项、生图Canvas138/1208回归通过。最终追加回归与副本rollback以`output/jimeng-canvas-20261023/VERIFICATION.txt`为准。

真实React组件fixture已在本机Chrome extension实际操作：暖沙搜索2项、文本类型1项并定位、Shift多选、锁定禁用、顶部对齐/水平分布/撤销、配色搜索蓝色2项ArrowUp双向绕回、零结果空态、风格与镜头切换、预设追加不覆盖提示词；生成按钮禁用，connect-src none。此为真实新增组件＋ReactFlow＋本地代码合成场景，不冒充完整登录Canvas/生产验收。截图已保存并打开检查。

Windows C盘worktree通过E盘依赖junction构建遇到Next font路径跨盘解析失败；共享依赖文件实际存在，未修改。以相同源码复制至E盘隔离目录、同依赖junction，构建exit0，但Windows standalone复制带EPERM symlink告警，不作为Linux可部署制品。最后源码增量构建另行落盘。

## 提交与后续交接

第一模块提交`697bfbb2`；合入最新origin/main `cd64d1ffd4eda66afcbe7817fc9016203c92be4a`后为`a59d9b5a`。该main增量仅历史benchmark文档和脚本，与本模块业务源码无冲突。最终修正与文档再选择性提交，实际remote SHA记录在验收证据。

完整画板/独立输出、图片单节点变体、音频时间线/主体执行仍为后续；现有分组、项目vN与预设提示词不冒充这些功能。

## Git与发布

本轮按导航、布局、预设完成3个模块，合并前已fetch并普通整合最新main，计数归零。只选择性提交任务文件并push任务分支；不合main、不SSH、不持47三锁、不建候选、不上线。公开更新说明仅在有真实发布版号时绑定，本地未发布功能不冒称已发布。


## 最终交付检查

- 新增组件的桌面与390px交互截图：`output/jimeng-canvas-20261023/canvas-layout.png`、`canvas-palette-library.png`、`canvas-mobile.png`，均已实际打开检查。
- 预览源entry与CSS随Git保存到`scripts/fixtures/canvas-jimeng`，集成脚本可从干净checkout重新生成真实组件预览，不依赖历史output目录。
- 最新只读复审`blocker=none`，原三项P2全部关闭；最终生图138/1208及scoped history11回归exit0，类型检查exit0。
- 最终业务源码的E盘隔离构建exit0；保留Windows standalone EPERM symlink告警，不称Linux镜像或线上验收。
- 原始失败日志、全部测试stdout/stderr/exit、任务路径hash、独立副本回滚均留专用output，不向Git提交第三方私有历史截图或构建缓存。
