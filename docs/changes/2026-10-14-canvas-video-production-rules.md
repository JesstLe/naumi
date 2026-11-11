# 画布视频制作规则融合

规则基线：外部参考实现的画布 Agent 技能（script、video-single-shot、video-multi-shot、video-extension、video-editing、audio）。本文记录规则实现，不能作为真实模型质量或完整34项验收证据。

此前 `src/lib/video/production-prompt.ts` 只有通用约束。本批按实际Naumi工具、统一cap、有序引用、可编辑节点和持久制作链重写细分规则，继续从 `AGENT_SYSTEM_PROMPT` 接入正常Pi调用，没有添加前端宣传文字或默认收费动作。

| 上游行为 | 接入后的实际约束 |
|---|---|
| 剧本分类、时长与逐字片段 | 完整剧本/概念/广告/问答分别处理，总成片与单段时长分开；现有文字通过 list_video_text_nodes/get_video_text 完整读取；逐字连续切片、自然剧情边界、所有片段顺序覆盖；写作/分析意图不自动生成 |
| 正式资产与持续性变体 | 核对角色、服装/伤势/年龄等持续状态、产品标准/状态、地点昼夜/天气、道具与说话人；只使用本人真实资产，不把未设定外观说成剧本事实；下一阶段缺素材则真实等待 |
| 单镜头 | 摄影风格/实际秒数/场景/各引用职责/动作起止/单一运镜/声音/用户排除项；首尾按cap使用真实first_frame/last_frame角色，不能照搬上游无专用字段 |
| 多镜头 | 时间线/效果及数量/密度恢复/叙事或能量弧；时长无空洞重叠且等于实际duration；结构化shots仅在cap声明时发送，其余完整prompt或独立节点；每段特有资产由set_video_references维护 |
| 分镜拼图 | 真实面板正文和顺序，整图为序列参考，不当首帧、不擅自裁切/跳格；最终视频不渲染网格/编号/版面；台词或面板容纳不了则合法延长、自然拆分或等用户明确子集 |
| 硬切与同机位 | 默认同世界新角度硬切，正式图锁定身份/空间/光线；仅稳定落点、一镜到底必需且超长、用户明确要求三类用同机位；不猜停稳、不复制前段帧/动作 |
| 前传、中间状态与备选 | 前传是导向来源开场的叙事片段，不宣称反向API；中间状态须真实目标帧/媒体job完成后图生；平行分支保留来源但不称线性后续 |
| 连续链 | 真实前序成功与直接必要来源，节点DAG/冻结整链预算/Worker等前序产物；规划占位身份不当正式URL；关闭SSE/重启恢复原操作；修改与取消保留已完成段 |
| Restyle/Partial/Replace/Replot | 明确各自变化/保持条款，替换必须有正式目标图和目标位置；复杂组合默认串行等真实新结果，明确一次实验授权可依cap试验；不支持时不改文生冒充编辑 |
| 台词、音色与最终朗读 | 逐字本段台词、说话人绑定与一次/无回声/不重复；音色只锚timbre，最终朗读锚正文和时序；原生generateAudio与独立音频资产分开，未开放音频生成工具不编造接口；静音保留原文和后期需求但不称已配音 |
| 修订与结果 | 局部只改受影响片段，读取最新revision；结构变化新分支留旧版本；真实结果检查cap/参考/运镜/对白，不无限重试或承诺像素级/身份/音色质量 |

上游工具名、固定秒数、音频默认voice、假定模型名、原生音频生成接口没有直接塞入Naumi契约。文本来源支持当前完整读取和片段可编辑保存；上游首次主剧本文字节点/项目自动标题、独立音色样本生成并非本批新增接口，不能据本规则文档声称这些独立子系统已经实现。

浏览器Agent verifier增加正常供应商实际 system message 包含硬切/同机位/替换/拼图/音色规则的断言。该断言只证明规则进入真实模型请求；scripted供应商不证明LLM能够正确遵守每个创作子意图。真实文字模型策略、完整V12—V14行为矩阵仍须后续集中验收，真实视频API质量仍因额度缺失用原始素材模拟。

实际规则注入及原节点链浏览器回归PASS：checkpoint-c/agent-browser-bf739115-8044-48b0-bc9b-d6ddf5c03530/result.json。V12—V14还须核查工具专用mode与支持video-reference的上游语义差异，并验证各编辑/续写/前传分支的真实素材与请求，而非只有system字符串断言。

本批同时整合 origin/main `3ab2418` 到独立分支，合并SHA `1eba865`，仅一处canvas-client import冲突，视频imports与CanvasPerformanceProbe都保留。npm ci新增fake-indexeddb测试依赖，TypeScript及主线render-layer-order/text-edit-history检查通过；受影响的真实Chrome画布/Agent回归结果另记界面模块。开发不持103部署锁，未发布本轮融合。

## 第八批：已声明视频参考的实际续写/编辑路径

核查确认实际差异：此前extend_video/edit_video只接受专用extend/video_edit模式，而参考实现部分续写、前传及编辑使用正式视频参考与提示词表达意图。现在保留节点或工作台明确保存的reference模式，要求存在kind=video/role=source_video正式引用，并从真实公开目录读取该模型definition.modes明确含reference、limits.videos为已维护正数。没有视频、只有图片、视频角色未指定来源、数量明确0或未知时拒绝。后续真实生成API继续检查本人资产、真实完成状态、完整输入限制、revision和冻结配置；没有改为text模式、没有根据名称猜能力或放宽源媒体权限。既有专用模式继续由原服务契约验证。

恢复原操作先查询持久任务，再验证新提交模式；已有工作台操作不因当前目录改变而重新创建。视频源码不接受模型提供的伪造完成状态、占位媒体或隐式模式转换。托管公开模型保持相同public model ID与现有managed-video目录别名匹配规则。

新增隔离fixture选项referenceModels，显式配置仅reference的视频模型、视频上限0模型及视频上限null模型，默认其他fixture不启用。verify-video-fusion-production.ts经真实App/PG/Router/私有媒体/Worker与原生Ark HTTP验证7个已保存方案：restyle、partial、replace、replot、硬切、同机位、前传；每个使用完整对白及有序video/image/audio/text本人素材，实际wire为reference_video/image/audio，冻结mode仍reference、节点原文与author文字逐字保持。另测2种专用模式及1个工作台reference编辑，共10任务/10次创建；重复工具调用与真实App重启后恢复不重提；工作台projectKey为空且所有真实作品origin=workbench。

7个拒绝分支同时核对公开错误原因、任务数/供应商创建/余额保持：text冒充编辑、图片reference冒充视频编辑、视频未指定source_video、能力0、能力未知、其他账号节点、未生成的来源节点。原素材SHA保持。最终PASS：checkpoint-c/production-3710100e-9123-4a62-9aad-6c0cb68b7aa4/result.json，session15543中第一项正常完成。此前完整用例亦PASS97fceef1。

初测纠正两个验证器假定：既有执行normalizer去除prompt边界空白，保存节点/原文素材仍逐字保留，执行wire以正常化后的完整对白核对；工作台边界检查实际projectKey与作品origin，不猜sourceId必须为null。未更改产品文字保存、normalizer或工作台挂载策略。

这些子意图文字由用例编写，测试证明真实素材/模式/任务/原生请求/恢复链路，不能证明真实LLM理解全部子意图或付费视频的视觉编辑质量。完整C还需生图保护、BYOC/媒体更多GUI以及剩余原文/拼图等规则行为对照；D完整矩阵/演示站或固定本地上游/分支复核/完整固定App及蓝绿回滚/103发布保持待完成。
