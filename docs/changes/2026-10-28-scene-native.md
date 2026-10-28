# 原生场景节点：流程核对与实施接续

## 用户目标与当前状态

遵循[融合原则](../CANVAS_CAPABILITY_ADAPTATION.md)及[持续目标](2026-10-27-canvas-assets-roadmap.md)：角色模块之后，实现场景基础身份、日夜等明确状态、参考素材及原生视频/导演台复用。场景节点不是导演工程中的一个方体，也不把普通场景照片自动冒充360全景或可编辑三维几何。

角色模块已验收并合入main（代码交付d726369f，最终回执3f3ac34c）。场景已从此main完成原生模型、API/持久化、卡片与状态编辑器、视频引用、导演背景及混合生命周期。本地完整应用和相邻模块集中回归已取得实际结果；Git交付与独立副本回滚分别记录于下文及证据目录，不等同服务器发布。

## 上游真实流程

固定来源 `HBAI-Ltd/Toonflow-app@ae9e5f1ac4f37713b902fed7fa5ca87819b324ae`：

- `packages/skills/v118workflow/references/baseAssets.md`：先识别唯一地点，描述空间、光照、固定陈设与色调；同一地点的日夜变化先登记变化需求，不重建另一个基础地点；跨集复用。
- `references/knowledge/assetDesign.md`：场景布局与地标连续，光源具有实际来源；变化只影响指定时段/天气，不偷偷改空间骨架。通常为单幅主视图，只有对应设计分支才使用同中心点的四方向资料，四格资料也不是360全景。
- `references/deriveAssets.md`：状态变体保留父身份与实际父图，明确保持项/变化项，镜头使用明确选定的版本。
- `references/generateAssets.md`：场景设定与图片生成分开，使用模型实际能力和真实参考输入；任务成功后查看真实产物再选用，保留候选，不默认覆盖所有镜头。

四份固定原文件与SHA256：`E:/Workspace/naumi/output/canvas-scene-native-20261028/source-manifest.json`。读取使用已有固定Git对象，没有改动上游checkout或将解压目录冒充固定版本。

## Naumi已有能力及真实缺口

- 复用已有角色模块验证过的正式图片上传/选择、图片创作草稿、稳定有序引用、服务端展开/冻结、任务/计费、私有媒体、原子历史、共享项目归属与CAS保存。
- `director/project.ts` / `director-node-service.ts` 已有工程、机位/实体/关键帧、`panoramaArtworkId`与图片/视频回画布；当前没有独立场景身份/状态，图片背景也没有明确区分普通2D与全景。
- 视频及制作链已有普通文字+图片输入；场景属于创作身份，新增live alias应在提交边界展开为现有wire，而不是增加供应商字段。
- 不新增素材后台、账号、存储桶、任务调度器或另一套视频提交。

## 选定的原生操作

1. 添加场景→填写地点名/空间设定→维护白天、夜晚等明确状态及实际参考图片；同一地点的状态保留稳定ID。
2. 场景→视频连线或@引用，视频各自选择状态，不依赖全局“当前状态”；同地点切状态保持@身份，换地点明确改变引用。生成时从服务端读取并冻结状态/参考图，旧任务不随主记录编辑改变。
3. 图片→场景用于绑定实际参考图；生成场景图复用已有图片创作栏，预填当前状态和父参考，不另造调用流程或自动覆盖选用结果。
4. 场景→导演台应用明确状态的背景/参考快照，保留已有机位、实体与关键帧。普通图片明确作为2D背景；只有显式选择全景时才作全景映射，不推断三维几何。
5. 导演工程保存本次应用的场景ID、状态ID、来源revision和所选图片快照；后续场景编辑/删除不静默改写已有导演工程和输出。重新选用状态是一次明确可撤销的工程修改。
6. 场景支持项目刷新/深链、移动、属性/锁、混合复制删除与撤销；复制同时选中图片/视频/导演时重映射相应引用，失败整步回滚。

## 职责、依赖与实施顺序

- 场景领域：地点/状态纯模型及引用投影，不依赖React、DB或供应商；保持与角色业务身份的区别，不引入万能资产平台。
- 场景持久化：沿共享画布项目/graph事务，保存revision与operation；HTTP只做解析/鉴权/错误映射，图片归属与最终状态校验在对应保存事务内完成。
- 画布编排：新hook与轻量卡片/编辑器持有模块交互；CanvasClient只接公开回调与混合历史，不将场景业务规则堆回大组件。
- 视频提交：前端预览与服务端共用已出现的展开/编号规则；前端提示不替代服务端真实读取、权限和模型限制，已受理任务重放先于可变场景读取。
- 导演渲染：仅补具体2D/全景背景行为与应用快照，沿原工程/输出事务，不把资产引用变成单独付费任务。

先做模型/保存/引用与编辑入口，再完成导演背景/快照、混合生命周期，按整个模块集中验收后普通合main并推送。音频与多轨目标保持，服务器暂缓发布。

## 模块完成所需证据

- 实际菜单新建、状态/参考图片编辑、保存刷新、390px/英文/只读；图片创作草稿与选用回绑定。
- 真实连线/@及不同视频使用同地点不同状态；仅场景引用的模型校验按展开后的真实图片工作。
- 真实Next/独立PG/Worker/私有媒体/账务，忽略伪造客户端定义、并发CAS、跨账号/项目边界、失败不扣费及已受理重放。
- 混合图片/场景/视频/导演复制重映射，删除恢复顺序无关，任何最终依赖错误整步回滚。
- 导演2D与全景实际渲染可区分，应用状态不改机位/实体，图片/视频产物回原画布；场景后续修改不改旧导演/视频/制作链快照。
- 记录模拟供应商与真实付费/线上边界，刷新四件套并只在独立副本验证源码回滚；Git合并与服务器发布分开。


## 实现、职责及迁移状态

- 基线 `main/origin/main@3f3ac34cbed349f4cb51c0786cc174d33a627f5c`；独立分支`codex/canvas-scene-native-20261028`、工作区`E:/Workspace/naumi-canvas-scene-native-20261028`。依赖junction直接指向干净main工作区，不依赖旧角色目录。
- 原始源码归档及SHA256已保存于`E:/Workspace/naumi/output/canvas-scene-native-20261028/ORIGINAL.zip`与`baseline.json`；固定来源四文件已逐份重开核哈希。
- `scene/project.ts`拥有稳定地点/状态身份、默认状态、参考图、明确image/panorama背景、live/frozen身份和导演快照；`scene/canvas.ts`与`scene/director.ts`分别投影视频选项、显式应用背景。纯模型不依赖DB/React/供应商。背景必须属于该状态的参考图，普通图片首次绑定默认image；明确无背景不会被下一次添加参考图擅自覆盖。
- `canvas/scene-node-*`拥有`app_canvas_scene_nodes`及`app_canvas_scene_operations`写入，沿既有共享项目、graph事务锁、CAS revision与operation幂等。Route只做协议/入口鉴权/错误映射。保存优先重放已完成操作，不因后来场景/图片删除而重新执行原写入。
- `components/canvas/scene/`拥有轻量卡片、状态编辑器和hook。接入菜单、新建/深链/刷新、移动/锁/属性、英文/只读、session草稿、冲突恢复和undo/redo。图片上传与“生成参考图”继续使用原素材/图片创作栏；生成按钮只打开草稿，不自动收费、提交或覆盖选用结果。菜单8项中6项可用，音频/多轨2项继续置灰。
- 角色和场景分别读取真实身份/明确外观或状态，`canvas/visual-reference-service.ts`收集定义，`visual-references.ts`统一展开并只编号一次；前端模式/图片数预览和服务端编译共用这条纯规则。删除旧`character/references.ts`，原角色调用方全部迁入共用接口，不保留无调用兼容层。图片真实归属/类型/企业scope由`visual-images.ts`核验，不信任客户端文字、图片URL或快照。
- 场景live alias为`scene:<id>#<stateId>`，受理任务时变为`inline:scene:<id>#<stateId>@<revision>`，再按既有文字+图片wire送入视频和制作链。同地点切状态保留@身份，换地点或角色/场景互换使旧引用失效；图像数量/模式限制在实际展开后执行，不因场景引用而跳过。
- 导演工程version1新增可选`backgroundProjection`和`sceneReference`，保留`panoramaArtworkId`旧字段；旧数据缺projection继续按全景解释，新普通图片直连默认image。普通图片使用UV center-cover，全景使用等距柱状映射。场景→导演应用一次明确状态，不重建机位/实体/关键帧；后续场景编辑/删除不改变已应用背景和设定。
- 新应用导演快照在同一graph事务中重新读真实场景和图片。仅移动或其他状态变更不误拦当前选择；真正内容变化返回409。导演原始请求摘要与服务端规范化结果分开保存，已受理原请求重放先于可变依赖。历史恢复保留已冻结快照，只核验最终真实背景图片；混合复制仅在源scene revision与快照一致时改指新scene，旧历史快照不会假称属于新主记录。
- 图片/场景/视频/导演混合复制、删除及撤销重做沿既有原子事务，重映射图片、live alias、背景和适用的冻结身份；历史按最终状态核依赖，不依赖恢复顺序。项目删除包含场景；顺便修正原批量删除成功响应遗漏character计数的问题，空数组不改变旧摘要/响应。
- 角色模块目录删除命令被执行层拦截，保持已合并且干净，详见角色证据`cleanup.json`；不换方法重试，不再阻塞场景、音频、多轨开发。服务器HOLD保持。

## 集中验收与实际证据

证据目录：`E:/Workspace/naumi/output/canvas-scene-native-20261028`。原始源码归档SHA256：`7454b6621285f3e4aec40ca858a9d19f987910e3ca94c5ff815c70767fb7fbc0`。原包保持不变，基线是main `3f3ac34c`，不是中途纯模型检查点`41ed8886`。

| 命令（场景任务工作区） | 实际结果与层级 |
|---|---|
| `node scripts/verify-scene-native.cjs BASELINE <baseline>` | PASS；场景菜单禁用，独立模型/API不存在，角色/视频/导演保留 |
| `node scripts/verify-scene-native.cjs MODIFIED .` | PASS；39组规则，稳定地点/状态、明确背景、混合角色/场景一次编号、快照、真实展开后的图片限制 |
| `node scripts/verify-character-native.cjs MODIFIED .` | PASS；38组角色回归，旧角色行为及冻结语义保持 |
| `node scripts/verify-video-native-references.cjs MODIFIED .` | PASS；120种排列，命名@、稳定身份、删除失效、旧wire/事务重放保持 |
| `node scripts/verify-director-native.cjs MODIFIED .` | PASS；30组工程/关键帧/独立机位/释放/WebM等规则 |
| `node scripts/verify-scene-native-ui.cjs . <ui-final>` | PASS；实际React/CSS/Chromium、状态/默认/上传/背景、草稿冲突/undo/redo、390px/英文/只读/焦点；pageerror与外部请求均0 |
| `node scripts/verify-video-native-ui.cjs MODIFIED . <video-ui-final>` | PASS；共用预览替换后命名@、排序/删除、保存刷新、原wire、390px/英文/只读 |
| `node scripts/verify-director-native-ui.cjs . <director-ui-final>` | PASS；实际WebGL/PNG/WebM、解码运动、取消无输出、草稿/冲突、移动端及只读英文 |
| `node scripts/verify-canvas-scoped-history.cjs` | PASS；11组项目/账号隔离、异步来源及无过期提交 |
| `node scripts/verify-canvas-node-menu.cjs MODIFIED . <menu-final>` | PASS；8项、6可用/2禁用、精确回调、3种视口、键盘/只读/视频门禁 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false`；指定变更源码`eslint` | 均exit0；lint 0 errors，CanvasClient保留10条既有hooks提示，基线同文件11条，无新增提示；不改本任务外的旧hooks |
| `node --conditions=react-server --import tsx scripts/verify-scene-native-application.ts <application-second>` | PASS / exit0；真实Next/独立PostgreSQL/Worker/私有媒体/账务及完整画布交互，5个模拟供应商任务、付费0、pageerror0 |
| `node --conditions=react-server --import tsx scripts/verify-scene-native-application.ts <api-mixed-final> --api-only` | PASS / exit0；同任务场景+角色+普通图只编号一次、三张引用不擅自去重、伪造客户端设定被忽略、冻结不变/跨账号404/私有输出SHA；2个模拟供应商任务、付费0 |

完整应用覆盖菜单新建/上传/状态/保存刷新、移动/锁/复制/删除/undo/redo，真实handle场景→视频和场景→导演、命名@与每视频状态切换、生成产物私有GET/SHA与跨账号404。导演普通背景和全景实际WebGL分别验收，输出PNG及1280×720/24fps/2秒WebM并经ffprobe读取；输出免费且不改机位/实体/关键帧。服务端重建新快照、源删除后原请求重放、混合复制映射、反序恢复和失败整步回滚、两阶段制作链冻结及重放不增任务均通过。

桌面/390px、原画布连线、导演两种映射及PNG已逐张打开检查。`application-second/result.json`和`interaction-result.json`保留详细布尔断言与taskId；`director-probe.json`保留实际媒体规格。组件fixture、真实本地应用、模拟供应商与线上证据分别记录，不据此宣称真实供应商画质/额度、生产发布或容量目标完成。

### 失败与修正

第一次完整应用实际失败：跨账号场景图引用先走通用scope检查，普通Error被API映射为503而非404。`visual-images.ts`现先核真实owned图片/类型，再核企业scope，将两种已知素材不可用错误映射404；数据库/未知错误仍保留原失败，不吞故障。第一次日志和exit1完整保留，第二次同链路及新增混合API验收exit0。组件首轮输出沿用了角色标签，最终重跑已改为准确SCENE_UI/STATES/BACKGROUND_IMAGE_PANORAMA，不把旧标签当场景未测或首次即通过。

最终批次11个底层命令均已exit0并落盘，Python汇总器随后在Windows GBK stdout打印ESLint符号时exit1；原记录保留，汇总器改为显式UTF-8，独立重开11份记录确认全部命令exit0，不为汇总输出错误重跑已通过的整模块。现脚本的未来完整应用输出也改成场景/状态标签，已取得的原始成功日志与JSON不改写。

## 交付与下一步

- 类型检查、指定变更文件lint、最终命令/字面输出/exit及Git同步记录以证据目录`module-final-checks.json`、`git-delivery.json`及`VERIFICATION.txt`为准。
- 四件套为`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`与可执行`ROLLBACK.sh`。差异包含纯模型检查点和本轮完整实现，并显式记录删除旧角色文件；只在另一份源码副本正向应用patch、核修改哈希后反向回滚，开发工作区保留修改。不回灌数据库或媒体。
- 完整模块计数从角色交接的1到场景完成的2；合并前再次fetch并整合最新main，精确前后SHA及普通push回执独立记录。无服务器发布，发布/空间维护计数不增加。
- 下一完整模块为音频导入/播放/编辑/引用/结果回原画布，随后多轨工程。持续目标保持active，不以场景完成标记整个目标完成。
