# 视频参数自动发现与同源契约

## 目标与边界

用户同意将供应商资料发现、参数标准化、有效执行契约和视频面板接通。同协议供应商复用传输适配器，参数差异作为数据，不按模型名称推断能力。先交付视频完整切片，不改图片业务、不调用付费模型、不修改线上配置、不发布47；103隔离分支不触碰。

基线：origin/main `9984606af663e14f200c076dd3d5256c684d327c`。工作区：`E:/Workspace/naumi-video-parameter-discovery-20261116`，分支 `codex/video-parameter-discovery-20261116`。共享checkout原有27项改动保留。

## 调研与实施决策

1. 现有 `/models` 发现保留 sourceMetadata；supplier-models 能采集部分公开目录，且供应商视频资料已有版本表。但新版 native-video 执行绑定跳过这些资料；UI投影因此没有枚举/范围。
2. 复用供应商视频资料表，将可执行参数片段纳入已有资料版本；支持明确的结构化视频参数目录和逐型号请求Schema。未给出的参数保持未知。
3. 在模型新版本冻结时合成参数片段到既有执行recipe。管理员显式values、映射、omit、默认值继续优先；源数据不修改凭据、地址、售价、路由和操作列表。冻结缓存、历史任务和计划摘要保持原语义。
4. 数据驱动的参数条件由同一个纯函数用于UI和编译。支持意图、媒体类型/角色/数量、参数值条件；不引入新的模型能力否决表。
5. 已核验的21型号公开资料只作带URL/hash/时间/实际host的初始资料包；后续结构化发现优先。普通自然语言文档的AI抽取属于候选资料生产，不在用户生成路径临时调用模型；无付费调用授权时不启用自动付费抽取/穷举测试。
6. 撤掉三档分辨率、八画幅、1–15秒的臆测兜底。缺枚举显示可编辑字段；缺上下限显示数字输入。旧草稿不自动重写，非法旧值与合法选项分开显示。

## 模块、接口与归属

- video/parameter-contract：规范结构、条件选择与有效参数域；纯领域逻辑，无数据库/HTTP/React依赖。
- supplier-models：采集与来源版本；维护原文/摘要，不拥有模型售价或发布决策。
- frozen-capability：新模型版本合成并冻结；后续资料刷新不影响已冻结版本。
- ui-projection/ui-draft：公开契约投影与当前素材条件选择，无wire字段和密钥。
- native/json profile：仍负责现有真实协议；参数规则只在原有映射入口执行一次。

## 验收计划

逐型号源资料覆盖；未知供应商的结构化目录；条件组合；显式false/0/omit；人工映射不被二次映射；同版本冻结不变；新版本采用新来源；旧任务可读；UI合法选项与实际编译一致；历史非法值保留；真实React浏览器交互与浅色视觉；补丁副本回滚复测。

## 修改前基线

`node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-video-native-profile.ts`：exit0，32 cases。
`... scripts/verify-video-execution-migration.ts`：exit0，79 cases。
`... scripts/verify-video-ui-gate-exit.ts`：exit0，18 cases。
`... scripts/verify-video-published-execution.ts`：首次exit1，缺少该脚本强制要求的隔离PG环境；记录为测试启动条件缺失，不当作业务回归。后续使用现有隔离数据库runner执行。

## 已实现

- 新增版本化参数资料：支持规范 `videoParameters`、逐型号 `requestSchema`、现有 `videoDefinition` / `video_capabilities` 结构；同一原生协议的绑定复用现有执行器。
- 供应商连接表单和connect API支持可选 `parameterCatalogPath`，只读取同源明确路径，不向文档发送API Key；模型列表与参数目录分别采集。
- 新模型配置版本发布时合成到唯一冻结recipe；旧版本的冻结行优先读取，刷新来源不会改变旧任务。显式mapping、人工条件、枚举/范围、false/0/omit及默认值保护。
- 条件匹配使用意图、完整输入（含内联引用与元素引用）及参数值；UI与原生/JSON编译共用选择器。来源不提供transport/wire/default写入权限；参数条件保持原有core semantic约束。
- 真实来源绑定完整endpoint；同host换路径也隔离。来源URL与成功解码资料成对记录。预算超限保留原recipe并记录冲突，相邻等价条件合并不改变last-match顺序。
- 已核对的21型号作为明确绑定api.apib.ai及标准API路径的初始资料包，保留URL、原文SHA256、时间、行号与文档冲突，不按型号名称猜测能力。
- 去掉统一建议档位；枚举显示真实按钮，离散时长只停合法档；缺完整范围用数字输入；旧值单独显示且不写回成合法项。输入改变只改变可见参数，不改节点和素材角色。

## 使用结构化目录

连接供应商时设置参数目录路径，例如 `/metadata/video.json`。目录格式：

```json
{"version":"r1","models":[{"id":"upstream-model-id","modality":"video","videoParameters":{"version":1,"parameters":{"resolution":{"type":"string","values":["720p","1080p"]},"durationSeconds":{"type":"integer","minimum":3,"maximum":15}},"conditions":[{"when":{"inputs":[{"kind":"video","minimum":1}]},"parameters":{"durationSeconds":{"type":"integer","maximum":10}}}]}}]}
```

也支持该型号的 `requestSchema.properties`（type/enum/minimum/maximum，非标准字段用x-naumi-semantic指定语义）；不是任意OpenAPI自动遍历。资料刷新进入供应商元数据库，按既有模型配置发布流程产生新版本后生效；不在用户每次生成时联网发现，也不热改已冻结版本。

## 集中验证与独立审查

- 初始共享依赖是React18，与main要求的React19不符。测试切换到已有、声明依赖与本main一致的只读依赖目录，没有安装/修改共享依赖。原始SHA独立副本使用相同依赖复核。
- 原始SHA类型检查、native32、migration79、compiler-core137、published-execution57、ui-draft18通过。原始provider-catalog测试的fixture把/api/pricing计成/models，实际复现2!=1；本次只拆开fixture的两类计数，保留原queries==1，并新增metadataQueries==1，未降低断言。
- 最近集中验证：`node scripts/verify-refactor.mjs --group video-parameter-discovery --expected-sha <固定SHA> --out <本工作树output路径>`。9/9入口通过、failed0/notRun0；其中domain80例、21型号/392默认场景选项编译，真实HTTP+PG11例（3来源版本、2冻结模型版本），真实React+Edge11例。
- runner对非core组按原设计标PARTIAL/exit2，表示不是全仓core验收；每个所选子测试均exit0。不修改runner规则伪装全仓通过。
- 浏览器1280/390截图已打开检查，浅色布局、合法档位、非法旧值、输入条件切换、只读和新供应商表单通过。证据为实际生产React控件的隔离浏览器，不是完整Next/ReactFlow站点旅程。
- 独立Reviewer逐项复现并复核优先级、核心wire边界、条件恢复、模式级资料、endpoint、实际出处、预算/顺序问题；最终本切片无剩余阻断，要求固定SHA再复跑后合main。

## 尚未交付的整体目标

1. 普通网页文档的自动AI提取、通用OpenAPI遍历和型号关联。当前初始文档包来自本线程真实核对，不宣称自动网页抽取已上线。
2. 任意新型号自动生成执行绑定。已有协议配方可复用，本切片不会根据名字或未经发布的文档自动创造传输映射。
3. Wan3按真实素材时长进一步收缩面板上限；最终编译器已有真实素材约束，但此类媒体事实尚未全部投影到UI。
4. -1自动时长的完整预占/结算与原生编译器接通。初始资料包明确记录而不自动开放；没有更改账务规则。
5. 全部操作/素材组合、完整站点E2E、生产付费验收、服务器部署。本切片不冒充整体自动适配目标全部完成。

## 发布与回滚

本次仅合main，不连接47/103、不修改生产模型版本和售价、不发布。现有已冻结模型版本不会因代码更新自动采用新资料；后续有明确授权的发布需采用新的模型配置版本。

新recipe含parameterConditions，旧镜像的严格reader不认识这一新增结构。未来蓝绿/回滚时需保留能消费新契约的Worker排空新任务；不能仅回退镜像并声称新任务恢复兼容。此次源码补丁只在独立副本回滚，并验证恢复原源码哈希与旧UI行为；不回灌业务数据库或媒体，不重放任务。

最终SHA、固定提交集中验证、补丁包、原始哈希与副本回滚字面结果记录在 `E:/Workspace/naumi/output/video-parameter-discovery-20261116/VERIFICATION.txt`。
