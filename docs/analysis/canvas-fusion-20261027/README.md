# 旧画布视频融合分支在当前 main 中的代码与能力盘点

日期：2026-10-27。任务：先固定用户确认的融合原则，再把旧分支已经进入当前主线的代码和能力列全，为下一轮产品方向提供依据。**本轮只有文档和只读源码分析，没有实现新功能、运行供应商任务或发布服务器。**

## 0. 接手先读

**“融合”是学会上游怎样完成创作任务，再用 Naumi 的画布逻辑、状态与样式实现同等能力；不是把上游界面、参数表、节点字段或编辑器原封不动搬进来。**

- 用户确认的长期原则：[CANVAS_CAPABILITY_ADAPTATION.md](../../CANVAS_CAPABILITY_ADAPTATION.md)。`AGENTS.md` 已加入必读入口。
- 先看本页结论与调用链，再读 [43项能力矩阵](CAPABILITIES.md)。
- 设计字段和交互时看 [参数分类与后续方向](DIRECTION.md)。
- 查具体代码看 [全量文件台账](FILES.md) 和 [HTTP/Agent/协议/公开符号索引](INTERFACES.md)。
- 机器可读数据：[inventory.json](inventory.json)、[commits.json](commits.json)、[capabilities.json](capabilities.json)、[interfaces.json](interfaces.json)。
- 文档核验方式与结果：[VERIFICATION.md](VERIFICATION.md)。

## 1. 固定版本与范围口径

| 对象 | 本轮固定版本 |
|---|---|
| 旧融合分支 | `codex/canvas-video-fusion-20261013` |
| 旧分支头 | `6dd5d51b379ad5b6fe1ed1244c08d239f30c59b5`，2026-10-17 |
| 该任务开工主线 | `3f1aa4a158cfbf47cdfef5e663bc2200ce6fa61e` |
| 本轮检查的 main | `4e15e71a2d56ba8518340c04a256cf920b978e41` |
| 原设计的 infinite-canvas 来源 | `tigerowo/infinite-canvas@68b37db04b9083c3ff0af67ffe362f85d04d1f9f` |
| 原设计的 Toonflow 来源 | `HBAI-Ltd/Toonflow-app@ae9e5f1ac4f37713b902fed7fa5ca87819b324ae` |

开工核对main为`305e1c72`，合并前刷新并整合到上述`4e15e71a`（同期图片提示词优化入口调整）。已重建本报告；43项能力锚点涉及的80份源码与本次新主线一致。

Git 祖先检查 exit 0，`MAIN..FUSION` 独有提交数为 **0**：旧分支已完整包含在上述 main 历史中，**无需把旧分支再合一次**。

但“提交已合入”不代表“所有旧代码字节仍原样保留”，也不代表“当前线上所有能力已验证”。本轮分三层核对：

1. **历史快照全量**：开工基线→旧分支头的全部净文件差异，避免遗漏。
2. **当前源码能力**：逐项跟随当前 UI/工具→API→领域服务→任务/媒体链，保留原34项能力矩阵，补充基础设施和后续能力。
3. **当前运行证据**：本轮未启动应用/上游、未调用模型/DB/媒体Worker；相应状态是未重验，不从旧文档继承PASS。

### 为什么不能把全部分支差异都称为“视频融合原创”？

此分支期间持续同步主线。区间内有 **1,041 个可达提交**；沿 first-parent 有 **188 个提交**，其中 **134 个非合并提交**。first-parent 也可能包含快进吸收的其他工作，因此它是溯源线索，不是作者/任务归属的绝对证明。

全量差异包括独立管理、企业、图像、运维等同期工作。本报告保留所有文件，但只将具备具体视频/画布调用链的项目写入融合能力矩阵，其他工作不冒充两个上游带来的能力。

## 2. 全量代码统计

### 2.1 旧分支净差异在当前 main 的去向

| 状态 | 文件数 | 含义 |
|---|---:|---|
| Git blob 完全相同 | 994 | 文件内容与旧分支头一致；不等于运行时已验收 |
| main 后续修改 | 238 | 同路径存在且内容已演进；应以当前实现为基线 |
| main 已移除 | 1 | `src/lib/imagegen/canvas-receipts.ts` |
| **合计** | **1,233** | 全部列入 FILES.md / inventory.json |

其中 **526 个路径属于 `src/`**。直接视频目录的旧分支净变化为 **126 个文件**；当前同口径目录有 **147 个文件**，其中 **130 个在旧分支快照中已有，17 个是之后新增**。126和130不矛盾：还有4个旧分支已有但相对开工基线没有净变化的文件。

唯一移除文件由主线 `c7f051a7`（2026-10-21，`fix(imagegen): remove queue and review holds from generation flow`）删除，关联 `src/lib/imagegen/canvas-client.ts` 的调用精简；它是图像生成排队/待核查处理的后续改动，不是视频导演台被删。没有发现同blob移至另一路径，故只记录删除，不猜测改名。

### 2.2 所有差异按目录职责分组

| 分组 | 文件数 |
|---|---:|
| 视频领域与任务媒体 | 47 |
| 视频供应商适配 | 23 |
| 画布视频界面 | 27 |
| 视频HTTP入口 | 27 |
| 独立视频工作台 | 2 |
| 画布与工作流共享集成 | 59 |
| Agent共享集成 | 15 |
| 计费共享集成 | 9 |
| 模型/供应商管理共享集成 | 66 |
| 数据库/媒体共享集成 | 23 |
| 其他应用代码（不默认归因于视频融合） | 228 |
| 验证与运维脚本 | 412 |
| 文档 | 173 |
| 来源与许可 | 10 |
| 构建部署及其他资源 | 112 |

分类按路径职责生成，不把“共享集成”自动视为此分支独创；精确路径、基线/旧分支/main blob、first-parent触及提交都在全量JSON。

## 3. 已经形成的核心能力，不应再从零造

### A. 视频节点与混合画布

- 可以新建空白视频节点，也可从现有素材进入。
- 节点有项目归属、位置尺寸、配置、引用、revision、当前任务/结果和软删除状态。
- 图文视频混合选择、复制、历史、恢复与只读行为已经有集成点。
- 已有紧凑视频创作栏、高级设置、模型选择、引用素材、结果工具栏及历史选择。

**代码入口**：`src/components/canvas/canvas-client.tsx`、`src/components/canvas/video/`、`src/lib/canvas/video-node-{schema,service,repository}.ts`。逐项见 V01、V17、S02、X01。

### B. 生成参数与正式引用

- 视频能力目录、模型/模式相关的合法时长/分辨率/比例，音频、水印、负面词和受控模型选项。
- 文本/图片/视频/音频有序引用，首尾帧职责、交换、元素分组和运动参考。
- 双套编号编译、真实文字读取、素材归属校验和供应商可读材料准备。
- 摄影机/镜头/焦距/光圈预设及其提示词编译。

**判断重点**：摄影设置是生成提示词指导，不等于3D空间机位；元素组不是正式角色/场景节点。逐项见 V02—V11。

### C. 视频制作逻辑与 Agent

- 正式剧本和逐字片段资产、可编辑镜头、分镜时长及依赖。
- 单片段多镜头与多个独立视频任务的区分。
- 连续镜头/硬切/同机位、前传意图、编辑保持项、对白与声音职责的制作规则。
- 实际注册 **27个视频Agent工具**；读取/保存/生成/查询/取消/恢复共用节点与任务服务。
- DAG制作链、变量/媒体绑定、各阶段参数/报价冻结、前序真实结果依赖、关闭页面后的恢复。

**证据分层**：工具调用和校验有代码；`VIDEO_PRODUCTION_PROMPT` 的创作规则已注入，但“模型能稳定按规则完成剧情/对白/画面质量”属于另外的真实内容验收。逐项见 V12—V16。

### D. 媒体处理与结果复用

- 视频/音频播放器，播放进度、音量、放大/全屏、下载。
- 首/当前/尾帧、抽音轨、音画分离、精确裁剪、拼接。
- 原生FFmpeg/FFprobe、多输入/多输出、辅助文件及媒体包。
- 持久媒体job、取消、输出真实核验、作品/存储发布与下游复用。

**判断重点**：这些底层足以供原生音频节点/剪辑操作复用，但现有播放时间轴不是多轨编辑器。执行依赖已配置的媒体Worker；本轮未探测其线上状态。逐项见 V19—V23、X03。

### E. 后台可靠性与供应商适配

- 持久任务先建档/预扣、操作幂等、节点revision、未知受理状态、轮询租约与恢复。
- 原始请求/能力/报价/工作流配方冻结，完整视频/图片/音频结果与结算。
- 取消请求与确认取消分离；保留已接受任务与历史结果。
- 旧矩阵8组协议能力对应 **44个旧profile**；当前增加到 **53个profile**。这不是53个可用模型的承诺。
- 托管渠道与自备ComfyUI均有接线；BYOC平台计费处理为0积分，不代表外部自备算力免费。

**原则**：继续复用这些体系，不引入上游的浏览器直连密钥、独立任务状态和另一套存储。逐项见 P01—P08、S01、X02。

## 4. 实际执行链与状态归属

### 4.1 画布单节点生成

```text
CanvasClient / VideoCompactComposer / VideoSettingsFields
  → useVideoNodes 保存配置与有序输入
  → /api/canvas/video-nodes 及 /[id] → saveVideoNode / saveVideoNodeTx
  → /api/canvas/video-nodes/[id]/generate
  → submitCanvasVideo（身份、revision、幂等、解析真实前序产物）
  → createVideoGeneration → createValidatedVideo
  → compileVideoPrompt / compileVideoCamera / normalizeVideoInput
  → authorizeVideoReferences / materializeVideoReferences
  → 模型与报价冻结 → createVideoTaskWithReservation + associateVideoTaskTx
  → submitQueuedVideoTask → provider / wire codec
  → pollAndSettle / recoverDueVideoTasks
  → collectVideoResultAssets → completeVideoResultSet → completeVideoTask
  → useVideoTasks / 节点显示结果 / 历史与作品
```

保存配置与收费生成是两件事。前端得到taskId不等于视频完成；下游使用正式媒体，不拿待生成占位地址作输入。

### 4.2 多节点制作链

```text
已保存视频节点及连线输入
  → Agent run_video_workflow / /api/canvas/video-workflows
  → buildCanvasVideoWorkflow（把选中节点之间的引用变成真实依赖）
  → validateVideoWorkflow（重复、缺失、自引用、环检查）
  → freezeVideoWorkflow（各阶段请求、文字、能力、报价和配方）
  → scheduleVideoWorkflow / resumeVideoWorkflow
  → dependencyReference 等待真实前序结果
  → 创建各阶段视频任务 → Worker恢复 / 查询 / 取消
```

独立镜头与真实连续依赖分开；此调度层并没有多轨剪辑的轨道、片段时间区间、转场和混音数据模型。

### 4.3 媒体处理

```text
VideoPlayer / MediaActionsDialog / Agent process_video
  → useMediaJobs → /api/video/media-jobs
  → createMediaJob（素材身份、请求摘要、报价与持久记录）
  → presetMediaCommand / nativeMediaArgs / 虚拟素材路径
  → mediaWorkerRequest → scripts/video-media-worker.mjs
  → 输出探测/哈希/清单 → publish → 正式作品与媒体
  → 原项目/来源关联 / 重新选择作为引用
```

**待调整的交互**：当前MediaActionsDialog能直接展示FFmpeg参数/输出/辅助文件JSON；表达力已有，但不等于符合普通创作用户的界面。应复用引擎、重做常用操作表达。

### 4.4 独立工作台

`/video → VideoStudioSession → 共用设置与生成服务 → 结果留工作台 → sendVideoTaskToCanvas → 指定项目`。不能因工作台生成成功就自动把结果塞进当前画布。

### 4.5 数据归属

| 状态/数据 | 当前拥有者 |
|---|---|
| 画布视频节点/项目/复制与操作身份 | `canvas/video-node-*`，`app_canvas_video_*` |
| 视频任务、结果、上游ID与轮询状态 | `video/service`、数据库视频任务/结果接口；`app_video_tasks`/`app_video_results` |
| 制作链计划与阶段 | `video/workflow*`，`app_video_workflow_runs`/`app_video_workflow_run_nodes` |
| 剧本/片段来源 | `video/script-assets` 的操作记录及正式画布文字节点 |
| 媒体处理job与探测 | `video/media-jobs`，`app_video_media_jobs`/`app_video_media_probes` |
| 模型能力、路由与价格 | `model-config`/`billing`；视频层冻结使用，不另建一套管理员配置 |
| 正式作品/媒体和父级关系 | 既有 `app_artworks`、媒体注册/存储模块，视频与媒体结果调用它们 |
| 3D产品工程 | 独立 `studio3d` 的当前账号浏览器IndexedDB；不能冒充云端画布节点 |

## 5. 当前菜单8项：哪些已具备，哪些只是相近底层

| 项目 | 当前Naumi | 可复用基础 | 真正缺口/需决定事项 |
|---|---|---|---|
| 文本 | 已有节点及生成/引用 | 正式文字、剧本/片段、连线、Agent | 后续角色/场景的描述是否复用文字节点；避免重复编辑 |
| 图片 | 已有节点及生成/编辑 | 作品/媒体、素材角色、引用、历史 | 作为角色/场景/导演台输出锚点继续使用 |
| 视频 | 已有原生节点和较完整链路 | 本报告V/P/S能力 | 引用表达、模式/参数呈现、复杂制作链的用户操作仍需统一 |
| 角色 | 菜单禁用，无对应独立创建链 | 元素组、参考图片、正式剧本素材规则 | 角色身份、变体、资产复用和下游职责，不能只改菜单启用 |
| 场景 | 菜单禁用，无对应独立创建链 | 图片/文字、参考与镜头背景描述 | 场景资产/状态与普通图片的关系，空间/全景用途按实际需求设计 |
| 3D导演台 | 菜单禁用；旧视频融合未纳入3D编辑器 | 上游Director3D成熟流程；独立产品3D的局部底层 | 以Naumi原生节点实现角色/场景/机位→预览→输出回画布，非iframe换皮 |
| 音频 | 菜单禁用；已有导入/播放/引用/提取链 | VideoPlayer audio、媒体job、资产、声音职责 | 独立音频节点的创建/编辑/连线；配音/生成模型是另一项待接能力 |
| 多轨编辑器 | 菜单禁用，未找到原生轨道编辑链 | 裁剪/拼接/FFmpeg、多产物、任务调度 | 轨道/片段/时间/混音/转场工程与交互；播放器时间轴不能替代 |

原设计第128行曾把Director3D编辑器列为视频融合外围，不意味着以后永远排除，也不意味着今天已有完整Naumi导演台。产品3D的 `/studio3d` 是另一条分支的成果。

## 6. 后续主线已新增的东西要保留

当前视频目录有17个旧分支之后新增文件，全部列在 [FILES.md](FILES.md) 第二节，归纳为：

1. 画布节点2/4份批量：batch路由、`canvas-batch.ts`/client。
2. 参数面板、模式规格解析与视频提示词优化。
3. 协调连接池、创建工作空间绑定。
4. 引用媒体令牌/解析和静态图片探测。
5. APIB/Geek专用及documented适配（共9个新增profile）。

这些都不是“旧分支还没合并”的问题。后续以当前main继续开发，不回灌旧快照覆盖它们。

## 7. 当前最值得讨论的方向

1. **先把已有视频体验原生化，而不是继续堆参数。** 统一引用与@、模型参数和模式选择，保留后台闭环。
2. **把底层能力与节点产品形态拆开判断。** 音频/角色/场景有可复用基础，但独立节点不是简单开一个按钮。
3. **导演台先明确完整创作闭环。** 研究上游角色/场景/机位流程，设计Naumi内输入、操作、工程保存和图/视频输出关系；不直接嵌入旧编辑器。
4. **多轨最后明确工程模型。** 复用已存在的媒体处理，单独设计轨道编辑体验；不把通用JSON表单当成成品。

具体候选切片、字段处置与验收范围见 [DIRECTION.md](DIRECTION.md)。这是供用户定方向的建议，不表示已启动这些功能开发。

## 8. 历史验证与本轮证据边界

- 原进度文档末期记载34/34固定矩阵材料、真实隔离运行/回滚等；同时仍区分候选暂存、正式发布和真实供应商质量。该记录有版本和环境边界，不直接套到当前main。
- 本轮核查了固定Git对象、当前源调用链和对应测试入口；43项矩阵含130个源码锚点，接口索引含29个路由、27个Agent工具及561个公开符号。
- 不以文件名 `verified`、旧截图或测试脚本存在宣称当前可用；未连接生产、未运行收费视频或媒体任务、未启动上游界面。
- 分支同期其他变更完整保留在台账，未以“全部视频融合原创”夸大范围。

## 9. 后续更新与复现

本轮生成器仅从固定Git对象读取并写入本目录的分析文档/JSON：

```powershell
python docs/analysis/canvas-fusion-20261027/build_inventory.py
python docs/analysis/canvas-fusion-20261027/build_capabilities.py
python docs/analysis/canvas-fusion-20261027/build_interfaces.py
python docs/analysis/canvas-fusion-20261027/verify.py
```

`MAIN` 固定不随远端漂移；更新盘点时必须显式修改固定SHA并重建/重读能力链，不把机械行号更新当成重新审阅。业务模块的后续实施记录应回链到长期原则与本次矩阵。
