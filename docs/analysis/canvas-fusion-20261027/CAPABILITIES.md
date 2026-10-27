# 当前 main 能力逐项矩阵

固定主线：`305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea`。V01—V24/P01—P08/S01—S02完整保留原34项，X01—X03补充基础设施，L01—L06区分后续与独立模块。

证据级别：本轮沿当前源码核对入口、规则与调用，不是当前供应商/DB/浏览器的运行验收。每项测试文件只是后续集中验收入口，不把历史通过结果继承为本轮PASS。

| ID | 能力 | 当前状态摘要 |
|---|---|---|
| [V01](#v01) | 文生/图生与空白视频节点 | 画布创建、原生创作栏和节点提交链路存在；是否可用取决于账号权限及实际视频模型目录。 |
| [V02](#v02) | 首帧、尾帧及三种首尾规则 | first_frame/last_frame 角色、frames_required/first_optional/last_optional 模式及首尾交换界面存在。 |
| [V03](#v03) | 文字、图片、视频、音频混合引用 | 四类有序输入与三类媒体引用存在；数量、时长和文件规格由模型能力约束，历史30/10/10不是所有模型统一配置。 |
| [V04](#v04) | 引用顺序与提示词编号 | numberVideoInputs/compileVideoPrompt 同时支持 {{ref N}} 和图片N/视频N/音频N；不存在的编号抛错。当前创作栏仍写入原始 {{ref N}}。 |
| [V05](#v05) | 视频模型目录与切换 | 公开目录、冻结能力、CanvasModelSelect、加载错误/重试与 defaults/reconcile 已有；真实已发布目录本轮未读取。 |
| [V06](#v06) | 时长、分辨率、画幅与精确尺寸 | durationResolutionMap、比例、精确宽高、按模式规格及后续新增自动时长/分辨率比例关联均有源码。 |
| [V07](#v07) | 声音、水印、负面词及可选模型参数 | 三态声音/水印、负面词及 providerOptions 类型/范围/omit 规则存在；部分高级控件直接以技术 key 作标签。 |
| [V08](#v08) | 摄影机、镜头、焦距、光圈 | CameraSettings、预设资料、compileVideoCamera 链路存在；本质是提示词指导，不是3D相机模拟器。 |
| [V09](#v09) | 单片段多镜头与结构化分镜 | ShotEditor、shots 契约、Kling 等分支适配已有；只有模型声明支持才显示/接受结构化分镜。 |
| [V10](#v10) | 元素分组与角色/物体参考 | ElementEditor 和 elements 请求链存在，但它是某次视频生成的元素组，不是画布独立角色资产节点。 |
| [V11](#v11) | 运动参考与角色朝向 | motion_control 模式及 KIE/APIMart/TokenDance 分支存在，不能认为所有视频模型都支持。 |
| [V12](#v12) | 剧本资产、逐字片段与分镜拼图 | script-assets、plan_video_script/plan_video_storyboard、原稿哈希和UTF-16连续区间校验存在；制作规则已注入Agent。规则文本存在不证明模型每次严格执行。 |
| [V13](#v13) | 连续镜头、续写、硬切和同机位 | extend_video、制作规则、DAG调度和真实前序媒体绑定存在；前传是叙事规则，不代表供应商具备反向延展接口。 |
| [V14](#v14) | 视频风格/局部/替换/剧情编辑 | edit_video 及生产规则存在；source_video 和合法模式校验保留，旧结果不被覆盖。 |
| [V15](#v15) | Agent查询、配置、生成、停止和恢复 | 视频工具在 creative-tool-catalog 与 canvas-video-tools 注册，和画布节点服务/任务复用；不是仅提示词声明。 |
| [V16](#v16) | 批量、串并行制作链与配置冻结 | canvas-workflow、workflow-freeze 和 workflow 的创建/恢复/取消存在；API/Agent有入口，未把它等同于完整可视化多轨编辑器。 |
| [V17](#v17) | 进度、错误、刷新恢复与历史 | queued/processing/needs_attention 等状态及 use-video-tasks/history、Worker和冻结历史草稿存在；未知受理不自动另建收费任务。 |
| [V18](#v18) | 取消生成与真实终态 | requestVideoCancellation/beginVideoTaskSubmission/sendPendingVideoCancellation 存在；已发取消请求不等于供应商已停止。 |
| [V19](#v19) | 视频/音频导入与播放器 | VideoPlayer 支持 video/audio，assets 管理导入和复用；这不等于独立音频生成编辑节点。 |
| [V20](#v20) | 首帧、当前帧、尾帧抽取 | 播放器 actions、媒体预设、job 发布与画布接收链存在；实际执行依赖已配置媒体Worker。 |
| [V21](#v21) | 音轨提取、音画分离与精确裁剪 | extract_audio/separate/trim 预设、界面与多产物发布存在；无音轨/非法时间等处理须按具体媒体验收。 |
| [V22](#v22) | FFmpeg/FFprobe、拼接和多输出 | concat/ffmpeg/ffprobe、asset/output虚拟路径、辅助文件、媒体包和取消都有实现；当前普通媒体对话框暴露JSON参数数组。 |
| [V23](#v23) | 生成产物、派生素材与再次引用 | 完整 resultAssets、媒体产物、父级血缘、不可变历史和引用授权链存在；不应只保留首个视频。 |
| [V24](#v24) | 独立视频工作台与画布发送边界 | VideoStudioSession 复用节点设置/播放器/媒体job；sendVideoTaskToCanvas 保存发送记录，重复发送有稳定身份。 |
| [P01](#p01) | OpenAI兼容/Grok2API/CogVideoX/Agnes | 源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。 |
| [P02](#p02) | Ark / Seedance | 源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。 |
| [P03](#p03) | KIE / APIMart / Kling等分支 | 源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。 |
| [P04](#p04) | Gemini / Veo、MiniMax / METASO | 源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。 |
| [P05](#p05) | AutoDL / RunningHub / ComfyUI工作流 | 源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。BYOC另有账号工作流映射及加密配方；输入槽不是普通节点字段。 |
| [P06](#p06) | TokenDance路由族 | 源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。 |
| [P07](#p07) | Toonflow tfRouter | 源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。 |
| [P08](#p08) | Compshare / ModelVerse / H3 | 源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。 |
| [S01](#s01) | 身份、私有媒体、报价/执行冻结和幂等 | 节点归属、引用解析、冻结模型、操作身份及预扣关联均有代码；本轮只读源码，不宣称真实余额/供应商验收。 |
| [S02](#s02) | 保留既有画布生图与交互 | 当前CanvasClient仍是混合节点集成入口；历史有保护测试脚本，但旧34/34记录不代表当前所有交互重新验收。 |
| [X01](#x01) | 持久节点、项目、版本与复制/撤销基础 | video-node schema/service/repository、操作去重、发送记录与混合节点接口存在。 |
| [X02](#x02) | 冻结历史配方与完整产物 | 视频图片音频多产物、工作流配方加密和摘要、displayResultId选择和历史草稿还原存在。 |
| [X03](#x03) | 媒体Worker、资源边界与回收 | media.ts、video-media-worker及media-engine实现存在；MEDIA_WORKER配置是执行前提。旧分支包含大文件哈希OOM修复和发布材料，但不代表当前在线配置。 |
| [L01](#l01) | 后续新增：单视频节点2/4份批量生成 | canvas-batch和batch路由为旧分支之后新增；当前菜单/创作栏数量为1/2/4，不等同于旧工作台1—6批量。 |
| [L02](#l02) | 后续新增：统一参数面板与视频提示词优化 | parameter-panel/options、prompt-optimizer/assist属于旧分支之后；目录按mode/resolution取值，优化校验引用标记。 |
| [L03](#l03) | 后续新增：视频协调池、工作空间与引用读取 | coordination-pool、workflow-creation、reference-media/token、static-image-probe均是旧分支之后的增强。 |
| [L04](#l04) | 后续新增：APIB / Geek专用适配 | apib-verified/documented、geek-verified/documented/h3文件和注册项存在；文件名verified不是本轮真实验证证明。 |
| [L05](#l05) | 相关但独立：3D产品工作台 | 当前main有/studio3d及Three.js引擎；旧视频融合分支没有该模块。产品瓶罐/包装用途不同于角色场景机位导演台。 |
| [L06](#l06) | 当前节点菜单及5项禁用占位 | character/scene/stage-3d/audio/multitrack仍disabled，不能因已有相近底层能力直接解除禁用。 |

<a id="v01"></a>
## V01 · 文生/图生与空白视频节点

**操作/执行链**：添加视频节点或从选中素材进入→保存节点配置→生成→持久 taskId→结果挂回原节点。

**当前源码结论**：画布创建、原生创作栏和节点提交链路存在；是否可用取决于账号权限及实际视频模型目录。

**按Naumi原生逻辑的方向**：复用节点与创作栏；入口围绕文字或已选素材，不另建一套上游画布。

**源码锚点**：
- [src/components/canvas/canvas-client.tsx:7347](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/canvas-client.tsx#L7347) — `function createCanvasNode`；main后续修改。
- [src/lib/video/node-submission.ts:13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/node-submission.ts#L13) — `export async function submitCanvasVideo`；main后续修改。
- [src/app/api/canvas/video-nodes/[id]/generate/route.ts:15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/[id]/generate/route.ts#L15) — `export async function POST`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-canvas.ts`、`scripts/verify-video-fusion-creation.mjs`。

<a id="v02"></a>
## V02 · 首帧、尾帧及三种首尾规则

**操作/执行链**：选择图片引用→指定首/尾职责或交换→依据模式校验→映射到供应商请求。

**当前源码结论**：first_frame/last_frame 角色、frames_required/first_optional/last_optional 模式及首尾交换界面存在。

**按Naumi原生逻辑的方向**：保留首尾的真实含义；与原画布连线/引用统一表达，不让用户同时维护重复列表。

**源码锚点**：
- [src/components/canvas/video/reference-list.tsx:29](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/reference-list.tsx#L29) — `交换首尾帧`；main相同。
- [src/lib/video/client-settings.ts:48](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L48) — `export function videoModeRoles`；main后续修改。
- [src/lib/video/contract.ts:56](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/contract.ts#L56) — `export function normalizeVideoInput`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-reference-boundaries.ts`。

<a id="v03"></a>
## V03 · 文字、图片、视频、音频混合引用

**操作/执行链**：从画布/素材库/本地导入→选择并排序→归属与真实媒体核验→提交。

**当前源码结论**：四类有序输入与三类媒体引用存在；数量、时长和文件规格由模型能力约束，历史30/10/10不是所有模型统一配置。

**按Naumi原生逻辑的方向**：继续复用正式素材身份，简化引用操作；不把上游计数或字段当固定产品限制。

**源码锚点**：
- [src/lib/video/references.ts:19](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/references.ts#L19) — `export const orderedInputSchema`；main相同。
- [src/lib/video/reference-materialization.ts:15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-materialization.ts#L15) — `export async function authorizeVideoReferences`；main后续修改。
- [src/components/canvas/video/settings-fields.tsx:78](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/settings-fields.tsx#L78) — `上传视频参考素材`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-reference-limits.ts`。

<a id="v04"></a>
## V04 · 引用顺序与提示词编号

**操作/执行链**：保存输入顺序→完整 ref 编号与各媒体分类编号→编译提示词→绑定实际素材。

**当前源码结论**：numberVideoInputs/compileVideoPrompt 同时支持 {{ref N}} 和图片N/视频N/音频N；不存在的编号抛错。当前创作栏仍写入原始 {{ref N}}。

**按Naumi原生逻辑的方向**：保留稳定身份、顺序和角色；普通用户层统一为 Naumi 的 @/素材标签，编译器内部负责协议编号。不能直接批量替换旧提示词。

**源码锚点**：
- [src/lib/video/references.ts:24](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/references.ts#L24) — `export function numberVideoInputs`；main相同。
- [src/lib/video/prompt.ts:3](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/prompt.ts#L3) — `export function compileVideoPrompt`；main相同。
- [src/components/canvas/video/compact-composer.tsx:34](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/compact-composer.tsx#L34) — `{{ref ${index}}}`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-reference-order.ts`、`scripts/verify-video-fusion-reference-edges.ts`。

<a id="v05"></a>
## V05 · 视频模型目录与切换

**操作/执行链**：读取托管/兼容目录→选默认模型→取能力→切换时协调已有配置→提交时再校验。

**当前源码结论**：公开目录、冻结能力、CanvasModelSelect、加载错误/重试与 defaults/reconcile 已有；真实已发布目录本轮未读取。

**按Naumi原生逻辑的方向**：模型目录继续是唯一参数来源；同一模型在主创作栏和高级设置保持一致。

**源码锚点**：
- [src/app/api/video/catalog/route.ts:21](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/catalog/route.ts#L21) — `export async function GET`；main相同。
- [src/lib/video/client-settings.ts:59](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-settings.ts#L59) — `export function reconcileVideoSettings`；main后续修改。
- [src/components/canvas/video/use-video-catalog.ts:7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-catalog.ts#L7) — `useVideoCatalog`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-client-settings.ts`。

<a id="v06"></a>
## V06 · 时长、分辨率、画幅与精确尺寸

**操作/执行链**：从模型/模式获取合法组合→选择时长规格→协调互斥项→服务端二次验证。

**当前源码结论**：durationResolutionMap、比例、精确宽高、按模式规格及后续新增自动时长/分辨率比例关联均有源码。

**按Naumi原生逻辑的方向**：保留真正影响输出的参数；常用项集中，协议差异由适配层处理。

**源码锚点**：
- [src/lib/video/capability-schema.ts:24](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/capability-schema.ts#L24) — `export const videoDefinitionSchema`；main后续修改。
- [src/lib/video/parameter-options.ts:4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/parameter-options.ts#L4) — `export`；不在历史分支净差异内，另核来源。
- [src/components/canvas/video/parameter-panel.tsx:8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/parameter-panel.tsx#L8) — `export function VideoParameterPanel`；不在历史分支净差异内，另核来源。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-client-settings.ts`。

<a id="v07"></a>
## V07 · 声音、水印、负面词及可选模型参数

**操作/执行链**：能力声明→生成类型化控件→保留未发送/false/0→规范化→协议字段映射。

**当前源码结论**：三态声音/水印、负面词及 providerOptions 类型/范围/omit 规则存在；部分高级控件直接以技术 key 作标签。

**按Naumi原生逻辑的方向**：用户能理解的业务控制项保留；供应商 key 收入映射层/管理员界面，不机械照搬到创作界面。

**源码锚点**：
- [src/components/canvas/video/settings-panel.tsx:43](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/settings-panel.tsx#L43) — `Object.entries(cap.providerOptions`；main后续修改。
- [src/lib/video/contract.ts:47](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/contract.ts#L47) — `omittedProviderOptions`；main后续修改。
- [src/lib/video/providers/wire.ts:79](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L79) — `export function selectWireOptions`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-contract.ts`、`scripts/verify-video-fusion-advanced-settings.ts`。

<a id="v08"></a>
## V08 · 摄影机、镜头、焦距、光圈

**操作/执行链**：开启摄影→选预设或自由参数→保存配置→编译为摄影描述加入视频提示词。

**当前源码结论**：CameraSettings、预设资料、compileVideoCamera 链路存在；本质是提示词指导，不是3D相机模拟器。

**按Naumi原生逻辑的方向**：摄影参数按镜头创作组织；与3D导演台机位区分，未来通过明确导出的镜头信息连接。

**源码锚点**：
- [src/components/canvas/video/camera-settings.tsx:9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/camera-settings.tsx#L9) — `export function CameraSettings`；main相同。
- [src/lib/video/camera.ts:5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/camera.ts#L5) — `export function compileVideoCamera`；main相同。
- [src/lib/video/submission.ts:62](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/submission.ts#L62) — `const cameraPrompt=compileVideoCamera`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-settings.mjs`。

<a id="v09"></a>
## V09 · 单片段多镜头与结构化分镜

**操作/执行链**：添加/排序镜头→编辑文字与每镜秒数→校验总时长→支持的协议发送 shots/multi_prompt。

**当前源码结论**：ShotEditor、shots 契约、Kling 等分支适配已有；只有模型声明支持才显示/接受结构化分镜。

**按Naumi原生逻辑的方向**：区分一个模型任务内的多镜头与多个视频节点；用我们的文字/镜头节点组织，避免用户误把两者当同一开关。

**源码锚点**：
- [src/components/canvas/video/shot-editor.tsx:6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/shot-editor.tsx#L6) — `export function ShotEditor`；main相同。
- [src/lib/video/contract.ts:44](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/contract.ts#L44) — `shots`；main后续修改。
- [src/lib/video/providers/protocols/kie.ts:25](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/kie.ts#L25) — `multi_prompt`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-script-multishot.ts`。

<a id="v10"></a>
## V10 · 元素分组与角色/物体参考

**操作/执行链**：命名元素→描述→绑定多份参考→按模型限制和协议发送。

**当前源码结论**：ElementEditor 和 elements 请求链存在，但它是某次视频生成的元素组，不是画布独立角色资产节点。

**按Naumi原生逻辑的方向**：作为未来角色/场景节点的可复用底层；素材身份、不同状态和复用规则需单独设计。

**源码锚点**：
- [src/components/canvas/video/element-editor.tsx:7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/element-editor.tsx#L7) — `export function ElementEditor`；main相同。
- [src/lib/video/contract.ts:44](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/contract.ts#L44) — `elements`；main后续修改。
- [src/lib/video/providers/protocols/apimart.ts:16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/apimart.ts#L16) — `elements`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-advanced-settings.ts`。

<a id="v11"></a>
## V11 · 运动参考与角色朝向

**操作/执行链**：选择角色图片和动作视频→设朝向/质量等合法选项→运动控制协议生成。

**当前源码结论**：motion_control 模式及 KIE/APIMart/TokenDance 分支存在，不能认为所有视频模型都支持。

**按Naumi原生逻辑的方向**：用参考素材职责表达动作来源；朝向作为必要业务控制，不暴露原始供应商字段名。

**源码锚点**：
- [src/components/canvas/video/settings-panel.tsx:45](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/settings-panel.tsx#L45) — `characterOrientation`；main后续修改。
- [src/lib/video/providers/protocols/kie.ts:9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/kie.ts#L9) — `motion`；main相同。
- [src/lib/video/providers/protocols/tokendance.ts:10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tokendance.ts#L10) — `tokendance-kling-motion`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-ic-protocols.ts`。

<a id="v12"></a>
## V12 · 剧本资产、逐字片段与分镜拼图

**操作/执行链**：保存正式原稿→按连续原文拆片段→保存可编辑镜头→绑定局部素材→形成视频计划。

**当前源码结论**：script-assets、plan_video_script/plan_video_storyboard、原稿哈希和UTF-16连续区间校验存在；制作规则已注入Agent。规则文本存在不证明模型每次严格执行。

**按Naumi原生逻辑的方向**：复用文字节点和现有Agent；补清晰的原稿→片段→视频关系，不要求用户操作字符下标。

**源码锚点**：
- [src/lib/video/script-assets.ts:36](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/script-assets.ts#L36) — `export async function saveVideoScriptAsset`；main相同。
- [src/lib/agent/canvas-video-tools.ts:82](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L82) — `tool("plan_video_storyboard"`；main相同。
- [src/lib/video/production-prompt.ts:18](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/production-prompt.ts#L18) — `完整剧本默认原样保留`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-script.ts`、`scripts/verify-video-fusion-mosaic.ts`。

<a id="v13"></a>
## V13 · 连续镜头、续写、硬切和同机位

**操作/执行链**：确认真实前序结果→选择叙事关系→保存依赖→冻结各阶段→Worker等待产物后继续。

**当前源码结论**：extend_video、制作规则、DAG调度和真实前序媒体绑定存在；前传是叙事规则，不代表供应商具备反向延展接口。

**按Naumi原生逻辑的方向**：复用画布连线和任务状态表达依赖；不另建和画布割裂的调度页面。

**源码锚点**：
- [src/lib/agent/canvas-video-tools.ts:106](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L106) — `tool("extend_video"`；main相同。
- [src/lib/video/workflow.ts:103](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow.ts#L103) — `async function dependencyReference`；main后续修改。
- [src/lib/video/production-prompt.ts:43](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/production-prompt.ts#L43) — `连续镜头、硬切、同机位`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-continuity.ts`、`scripts/verify-video-fusion-production.ts`。

<a id="v14"></a>
## V14 · 视频风格/局部/替换/剧情编辑

**操作/执行链**：读取真实来源视频→描述修改与保持项→绑定目标素材→用编辑或支持视频参考的模式生成新结果。

**当前源码结论**：edit_video 及生产规则存在；source_video 和合法模式校验保留，旧结果不被覆盖。

**按Naumi原生逻辑的方向**：围绕用户选中的视频和想改的内容提供原生编辑；复用生成任务，不新增平行编辑后端。

**源码锚点**：
- [src/lib/agent/canvas-video-tools.ts:107](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L107) — `tool("edit_video"`；main相同。
- [src/lib/video/production-prompt.ts:52](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/production-prompt.ts#L52) — `视频编辑：`；main相同。
- [src/lib/video/contract.ts:113](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/contract.ts#L113) — `video_edit`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-production.ts`。

<a id="v15"></a>
## V15 · Agent查询、配置、生成、停止和恢复

**操作/执行链**：读取实际节点/模型→保存配置或计划→按授权启动→返回taskId/runId→查询/取消/恢复。

**当前源码结论**：视频工具在 creative-tool-catalog 与 canvas-video-tools 注册，和画布节点服务/任务复用；不是仅提示词声明。

**按Naumi原生逻辑的方向**：让Agent操作与用户手工操作同一份节点，聊天完成不冒充视频完成。

**源码锚点**：
- [src/lib/agent/creative-tool-catalog.ts:6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/creative-tool-catalog.ts#L6) — `video:`；main相同。
- [src/lib/agent/canvas-video-tools.ts:74](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L74) — `tool("get_video_config"`；main相同。
- [src/lib/agent/naumi-tools.ts:89](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/naumi-tools.ts#L89) — `${VIDEO_PRODUCTION_PROMPT}`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-agent.ts`、`scripts/verify-video-fusion-agent-sse.ts`。

<a id="v16"></a>
## V16 · 批量、串并行制作链与配置冻结

**操作/执行链**：从已保存视频节点构建图→检查重复/缺失/环→冻结参数和报价→按真实依赖执行→持久恢复。

**当前源码结论**：canvas-workflow、workflow-freeze 和 workflow 的创建/恢复/取消存在；API/Agent有入口，未把它等同于完整可视化多轨编辑器。

**按Naumi原生逻辑的方向**：选择节点/连线就是编排依据；配置继承、等待原因和恢复状态应回到画布。

**源码锚点**：
- [src/lib/video/canvas-workflow.ts:14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-workflow.ts#L14) — `export async function buildCanvasVideoWorkflow`；main后续修改。
- [src/lib/video/workflow.ts:50](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow.ts#L50) — `export function validateVideoWorkflow`；main后续修改。
- [src/lib/video/workflow-freeze.ts:32](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-freeze.ts#L32) — `export async function freezeVideoWorkflow`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-mixed-dag.ts`、`scripts/verify-video-fusion-workflow-freeze.ts`。

<a id="v17"></a>
## V17 · 进度、错误、刷新恢复与历史

**操作/执行链**：提交写入持久任务→前端读状态/后台恢复→终态结算→历史查看/复用/显式重试。

**当前源码结论**：queued/processing/needs_attention 等状态及 use-video-tasks/history、Worker和冻结历史草稿存在；未知受理不自动另建收费任务。

**按Naumi原生逻辑的方向**：保留可靠后台，前端集中显示当前节点状态和可操作下一步；不再加一套浏览器轮询存储体系。

**源码锚点**：
- [src/lib/video/service.ts:559](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/service.ts#L559) — `export async function recoverDueVideoTasks`；main后续修改。
- [src/lib/video/worker.ts:56](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/worker.ts#L56) — `export async function scanVideoWorkerOnce`；main相同。
- [src/components/canvas/video/use-video-history.ts:15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/use-video-history.ts#L15) — `export function useVideoHistory`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-history-recovery.ts`、`scripts/verify-video-fusion-submission-retry.ts`。

<a id="v18"></a>
## V18 · 取消生成与真实终态

**操作/执行链**：记录取消意图→未提交则本地取消→已提交请求上游取消→查询确认终态及费用。

**当前源码结论**：requestVideoCancellation/beginVideoTaskSubmission/sendPendingVideoCancellation 存在；已发取消请求不等于供应商已停止。

**按Naumi原生逻辑的方向**：保留两阶段语义，用简洁的取消中/已停止反馈，不以隐藏节点代替停止任务。

**源码锚点**：
- [src/lib/video/cancellation.ts:20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/cancellation.ts#L20) — `export async function requestVideoCancellation`；main后续修改。
- [src/lib/video/cancellation.ts:59](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/cancellation.ts#L59) — `export async function sendPendingVideoCancellation`；main后续修改。
- [src/app/api/video/tasks/[id]/cancel/route.ts:7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/cancel/route.ts#L7) — `POST`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-cancellation.ts`。

<a id="v19"></a>
## V19 · 视频/音频导入与播放器

**操作/执行链**：导入媒体或接收结果→正式作品身份→节点播放/时间/音量/全屏/下载。

**当前源码结论**：VideoPlayer 支持 video/audio，assets 管理导入和复用；这不等于独立音频生成编辑节点。

**按Naumi原生逻辑的方向**：复用播放器和资产导入；独立音频节点只补真正缺少的创建、编辑与连线语义。

**源码锚点**：
- [src/components/canvas/video/player.tsx:20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/player.tsx#L20) — `export function VideoPlayer`；main相同。
- [src/lib/video/assets.ts:16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/assets.ts#L16) — `export async function importVideoAsset`；main相同。
- [src/components/canvas/canvas-client.tsx:1162](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/canvas-client.tsx#L1162) — `function VideoNodeSurface`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-player.ts`。

<a id="v20"></a>
## V20 · 首帧、当前帧、尾帧抽取

**操作/执行链**：播放器选择时间→持久媒体job→FFmpeg抽帧→新图片作品→原项目与来源关联。

**当前源码结论**：播放器 actions、媒体预设、job 发布与画布接收链存在；实际执行依赖已配置媒体Worker。

**按Naumi原生逻辑的方向**：保留原生一键抽帧，作为视频编辑/3D预演结果继续创作的公共能力。

**源码锚点**：
- [src/components/canvas/video/player.tsx:8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/player.tsx#L8) — `action: "frame"`；main相同。
- [src/lib/video/media-jobs.ts:82](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-jobs.ts#L82) — `export async function createMediaJob`；main后续修改。
- [scripts/video-fusion/media-engine.mjs:79](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/scripts/video-fusion/media-engine.mjs#L79) — `presetMediaCommand`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-derived-media.ts`。

<a id="v21"></a>
## V21 · 音轨提取、音画分离与精确裁剪

**操作/执行链**：选择来源→时间区间或分离动作→媒体job→保留所有新产物→继续引用。

**当前源码结论**：extract_audio/separate/trim 预设、界面与多产物发布存在；无音轨/非法时间等处理须按具体媒体验收。

**按Naumi原生逻辑的方向**：保留这些常用动作；不要因想做音频节点或剪辑器而重写现有媒体处理后端。

**源码锚点**：
- [src/components/canvas/video/media-actions.tsx:40](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/media-actions.tsx#L40) — `id: "extract_audio"`；main相同。
- [src/lib/video/media-job-schema.ts:6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-job-schema.ts#L6) — `extract_audio`；main相同。
- [scripts/video-fusion/media-engine.mjs:79](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/scripts/video-fusion/media-engine.mjs#L79) — `presetMediaCommand`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-media-interface.ts`。

<a id="v22"></a>
## V22 · FFmpeg/FFprobe、拼接和多输出

**操作/执行链**：选择有序素材→命令或预设→隔离Worker→核验完整输出→发布/复用。

**当前源码结论**：concat/ffmpeg/ffprobe、asset/output虚拟路径、辅助文件、媒体包和取消都有实现；当前普通媒体对话框暴露JSON参数数组。

**按Naumi原生逻辑的方向**：引擎复用；常用操作用可视化业务参数表达。原生JSON应属于专家/Agent层，不拿它代替普通用户的多轨剪辑。

**源码锚点**：
- [src/components/canvas/video/media-actions.tsx:141](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/media-actions.tsx#L141) — `参数数组 JSON`；main相同。
- [src/lib/agent/canvas-video-tools.ts:110](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/agent/canvas-video-tools.ts#L110) — `tool("process_video"`；main相同。
- [scripts/video-fusion/media-engine.mjs:56](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/scripts/video-fusion/media-engine.mjs#L56) — `nativeMediaArgs`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-native-media.ts`。

<a id="v23"></a>
## V23 · 生成产物、派生素材与再次引用

**操作/执行链**：生成→保存全部产物→抽帧/裁剪等派生→以真实身份作为下游输入。

**当前源码结论**：完整 resultAssets、媒体产物、父级血缘、不可变历史和引用授权链存在；不应只保留首个视频。

**按Naumi原生逻辑的方向**：统一作品/素材选择和连线，使角色、场景、音频、导演台输出都走同一条资产链。

**源码锚点**：
- [src/lib/video/result-assets.ts:70](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/result-assets.ts#L70) — `export async function collectVideoResultAssets`；main相同。
- [src/lib/video/result-completion.ts:7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/result-completion.ts#L7) — `export async function completeVideoResultSet`；main相同。
- [src/lib/video/reference-materialization.ts:15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-materialization.ts#L15) — `export async function authorizeVideoReferences`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-derived-media.ts`、`scripts/verify-video-fusion-results.ts`。

<a id="v24"></a>
## V24 · 独立视频工作台与画布发送边界

**操作/执行链**：在/video生成→结果留工作台→用户选择项目并发送→幂等创建画布结果。

**当前源码结论**：VideoStudioSession 复用节点设置/播放器/媒体job；sendVideoTaskToCanvas 保存发送记录，重复发送有稳定身份。

**按Naumi原生逻辑的方向**：保留工作台入口但不自动灌满画布；与原生节点共用能力，不维护另一套参数逻辑。

**源码锚点**：
- [src/components/video/video-studio-session.tsx:36](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/video/video-studio-session.tsx#L36) — `function VideoStudioSession`；main相同。
- [src/lib/canvas/video-node-service.ts:110](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-service.ts#L110) — `export async function sendVideoTaskToCanvas`；main后续修改。
- [src/app/api/video/tasks/[id]/send-to-canvas/route.ts:10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/video/tasks/[id]/send-to-canvas/route.ts#L10) — `POST`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-workbench.ts`。

<a id="p01"></a>
## P01 · OpenAI兼容/Grok2API/CogVideoX/Agnes

**操作/执行链**：规范请求→选择wire profile→创建/轮询/结果解码→统一任务与产物。

**当前源码结论**：源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。

**按Naumi原生逻辑的方向**：继续留在供应商适配层。用户以模型和创作需求为主，不照搬协议路径/技术字段到画布。

**源码锚点**：
- [src/lib/video/providers/protocols/openai-compatible.ts:54](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/openai-compatible.ts#L54) — `openAICompatibleCodec`；main相同。
- [src/lib/video/providers/protocols/index.ts:20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/index.ts#L20) — `export function installVideoWireCodecs`；main后续修改。
- [src/lib/video/providers/wire.ts:16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L16) — `export function buildVideoCreate`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-wire.ts`、`scripts/verify-video-fusion-protocol-coverage.mjs`。

<a id="p02"></a>
## P02 · Ark / Seedance

**操作/执行链**：规范请求→选择wire profile→创建/轮询/结果解码→统一任务与产物。

**当前源码结论**：源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。

**按Naumi原生逻辑的方向**：继续留在供应商适配层。用户以模型和创作需求为主，不照搬协议路径/技术字段到画布。

**源码锚点**：
- [src/lib/video/providers/protocols/ark.ts:15](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/ark.ts#L15) — `arkCodec`；main相同。
- [src/lib/video/providers/protocols/index.ts:20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/index.ts#L20) — `export function installVideoWireCodecs`；main后续修改。
- [src/lib/video/providers/wire.ts:16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L16) — `export function buildVideoCreate`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-wire.ts`、`scripts/verify-video-fusion-protocol-coverage.mjs`。

<a id="p03"></a>
## P03 · KIE / APIMart / Kling等分支

**操作/执行链**：规范请求→选择wire profile→创建/轮询/结果解码→统一任务与产物。

**当前源码结论**：源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。

**按Naumi原生逻辑的方向**：继续留在供应商适配层。用户以模型和创作需求为主，不照搬协议路径/技术字段到画布。

**源码锚点**：
- [src/lib/video/providers/protocols/kie.ts:68](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/kie.ts#L68) — `kieCodec`；main相同。
- [src/lib/video/providers/protocols/index.ts:20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/index.ts#L20) — `export function installVideoWireCodecs`；main后续修改。
- [src/lib/video/providers/wire.ts:16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L16) — `export function buildVideoCreate`；main后续修改。
- [src/lib/video/providers/protocols/apimart.ts:42](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/apimart.ts#L42) — `apimartCodec`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-wire.ts`、`scripts/verify-video-fusion-protocol-coverage.mjs`。

<a id="p04"></a>
## P04 · Gemini / Veo、MiniMax / METASO

**操作/执行链**：规范请求→选择wire profile→创建/轮询/结果解码→统一任务与产物。

**当前源码结论**：源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。

**按Naumi原生逻辑的方向**：继续留在供应商适配层。用户以模型和创作需求为主，不照搬协议路径/技术字段到画布。

**源码锚点**：
- [src/lib/video/providers/protocols/gemini.ts:34](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/gemini.ts#L34) — `geminiCodec`；main相同。
- [src/lib/video/providers/protocols/index.ts:20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/index.ts#L20) — `export function installVideoWireCodecs`；main后续修改。
- [src/lib/video/providers/wire.ts:16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L16) — `export function buildVideoCreate`；main后续修改。
- [src/lib/video/providers/protocols/minimax.ts:16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/minimax.ts#L16) — `minimaxCodec`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-wire.ts`、`scripts/verify-video-fusion-protocol-coverage.mjs`。

<a id="p05"></a>
## P05 · AutoDL / RunningHub / ComfyUI工作流

**操作/执行链**：规范请求→选择wire profile→创建/轮询/结果解码→统一任务与产物。

**当前源码结论**：源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。BYOC另有账号工作流映射及加密配方；输入槽不是普通节点字段。

**按Naumi原生逻辑的方向**：继续留在供应商适配层。用户以模型和创作需求为主，不照搬协议路径/技术字段到画布。

**源码锚点**：
- [src/lib/video/providers/protocols/comfyui.ts:32](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/comfyui.ts#L32) — `comfyUICodec`；main相同。
- [src/lib/video/providers/protocols/index.ts:20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/index.ts#L20) — `export function installVideoWireCodecs`；main后续修改。
- [src/lib/video/providers/wire.ts:16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L16) — `export function buildVideoCreate`；main后续修改。
- [src/lib/video/byoc.ts:46](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/byoc.ts#L46) — `export async function submitByocComfyVideo`；main相同。
- [src/components/canvas/video/byoc-settings.tsx:9](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/byoc-settings.tsx#L9) — `export function VideoByocSettings`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-wire.ts`、`scripts/verify-video-fusion-protocol-coverage.mjs`。

<a id="p06"></a>
## P06 · TokenDance路由族

**操作/执行链**：规范请求→选择wire profile→创建/轮询/结果解码→统一任务与产物。

**当前源码结论**：源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。

**按Naumi原生逻辑的方向**：继续留在供应商适配层。用户以模型和创作需求为主，不照搬协议路径/技术字段到画布。

**源码锚点**：
- [src/lib/video/providers/protocols/tokendance.ts:16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tokendance.ts#L16) — `TOKEN_DANCE_PROFILES`；main相同。
- [src/lib/video/providers/protocols/index.ts:20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/index.ts#L20) — `export function installVideoWireCodecs`；main后续修改。
- [src/lib/video/providers/wire.ts:16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L16) — `export function buildVideoCreate`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-wire.ts`、`scripts/verify-video-fusion-protocol-coverage.mjs`。

<a id="p07"></a>
## P07 · Toonflow tfRouter

**操作/执行链**：规范请求→选择wire profile→创建/轮询/结果解码→统一任务与产物。

**当前源码结论**：源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。

**按Naumi原生逻辑的方向**：继续留在供应商适配层。用户以模型和创作需求为主，不照搬协议路径/技术字段到画布。

**源码锚点**：
- [src/lib/video/providers/protocols/tfrouter.ts:4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/tfrouter.ts#L4) — `TF_ROUTER_PROFILES`；main相同。
- [src/lib/video/providers/protocols/index.ts:20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/index.ts#L20) — `export function installVideoWireCodecs`；main后续修改。
- [src/lib/video/providers/wire.ts:16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L16) — `export function buildVideoCreate`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-wire.ts`、`scripts/verify-video-fusion-protocol-coverage.mjs`。

<a id="p08"></a>
## P08 · Compshare / ModelVerse / H3

**操作/执行链**：规范请求→选择wire profile→创建/轮询/结果解码→统一任务与产物。

**当前源码结论**：源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。

**按Naumi原生逻辑的方向**：继续留在供应商适配层。用户以模型和创作需求为主，不照搬协议路径/技术字段到画布。

**源码锚点**：
- [src/lib/video/providers/protocols/compshare.ts:5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/compshare.ts#L5) — `COMPSHARE_PROFILES`；main相同。
- [src/lib/video/providers/protocols/index.ts:20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/index.ts#L20) — `export function installVideoWireCodecs`；main后续修改。
- [src/lib/video/providers/wire.ts:16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/wire.ts#L16) — `export function buildVideoCreate`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-wire.ts`、`scripts/verify-video-fusion-protocol-coverage.mjs`。

<a id="s01"></a>
## S01 · 身份、私有媒体、报价/执行冻结和幂等

**操作/执行链**：验证本人项目/素材→冻结模型/参数/报价→事务预扣与节点关联→真实终态结算。

**当前源码结论**：节点归属、引用解析、冻结模型、操作身份及预扣关联均有代码；本轮只读源码，不宣称真实余额/供应商验收。

**按Naumi原生逻辑的方向**：继续使用Naumi公共能力，不引入上游账号、浏览器明文凭据或独立计费体系。

**源码锚点**：
- [src/lib/video/submission.ts:4](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/submission.ts#L4) — `createVideoTaskWithReservation`；main后续修改。
- [src/lib/video/frozen-capability.ts:20](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/frozen-capability.ts#L20) — `freezeManagedVideoCapability`；main相同。
- [src/lib/canvas/video-node-service.ts:37](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-service.ts#L37) — `export async function authorizeNodeInputs`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-safety.mjs`、`scripts/verify-video-fusion-manifest-access.ts`。

<a id="s02"></a>
## S02 · 保留既有画布生图与交互

**操作/执行链**：新增视频能力与图片/文字/选择/拖动/缩放/快捷键共存→集中保护回归。

**当前源码结论**：当前CanvasClient仍是混合节点集成入口；历史有保护测试脚本，但旧34/34记录不代表当前所有交互重新验收。

**按Naumi原生逻辑的方向**：按能力完整切片开发；复用原有画布结构和撤销/选择逻辑，避免再加独立画布。

**源码锚点**：
- [src/components/canvas/canvas-client.tsx:1588](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/canvas-client.tsx#L1588) — `export function CanvasClient`；main后续修改。
- [src/components/canvas/node-menu-items.ts:7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/node-menu-items.ts#L7) — `export function canvasNodeMenuItems`；不在历史分支净差异内，另核来源。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-protection.mjs`、`scripts/verify-video-fusion-readonly.ts`。

<a id="x01"></a>
## X01 · 持久节点、项目、版本与复制/撤销基础

**操作/执行链**：节点创建/保存→revision冲突控制→项目归属→复制/软删除→历史恢复。

**当前源码结论**：video-node schema/service/repository、操作去重、发送记录与混合节点接口存在。

**按Naumi原生逻辑的方向**：为新增角色/场景/导演台节点设计时复用公共项目、身份和历史语义，不复制视频专属schema当万能节点。

**源码锚点**：
- [src/lib/canvas/video-node-schema.ts:17](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-schema.ts#L17) — `export const videoNodeWriteSchema`；main后续修改。
- [src/lib/canvas/video-node-repository.ts:32](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-repository.ts#L32) — `export async function saveVideoNodeTx`；main相同。
- [src/lib/canvas/video-node-service.ts:78](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/canvas/video-node-service.ts#L78) — `export async function copyVideoNodes`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-node-operations.ts`。

<a id="x02"></a>
## X02 · 冻结历史配方与完整产物

**操作/执行链**：结果核验→所有媒体入库→公开脱密快照→历史选结果/复用参数→用户决定是否重新生成。

**当前源码结论**：视频图片音频多产物、工作流配方加密和摘要、displayResultId选择和历史草稿还原存在。

**按Naumi原生逻辑的方向**：统一结果选用与再编辑交互；旧结果及用户后续编辑分别保留。

**源码锚点**：
- [src/lib/video/task-snapshot.ts:11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/task-snapshot.ts#L11) — `export function publicVideoTaskSnapshot`；main相同。
- [src/lib/video/workflow-source.ts:10](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-source.ts#L10) — `export async function readOwnedVideoWorkflow`；main相同。
- [src/lib/video/client-history.ts:7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/client-history.ts#L7) — `videoHistoryDraft`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-history-assets.ts`。

<a id="x03"></a>
## X03 · 媒体Worker、资源边界与回收

**操作/执行链**：素材授权与落盘→媒体Worker认证/隔离执行→分块哈希和输出清单→发布后清理。

**当前源码结论**：media.ts、video-media-worker及media-engine实现存在；MEDIA_WORKER配置是执行前提。旧分支包含大文件哈希OOM修复和发布材料，但不代表当前在线配置。

**按Naumi原生逻辑的方向**：保留底层处理服务，不用浏览器长任务替代。新增UI只通过现有媒体任务契约调用。

**源码锚点**：
- [src/lib/video/media.ts:13](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media.ts#L13) — `export function mediaWorkerConfigured`；main相同。
- [src/lib/video/media-jobs.ts:156](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/media-jobs.ts#L156) — `async function publish`；main后续修改。
- [scripts/video-fusion/media-engine.mjs:3](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/scripts/video-fusion/media-engine.mjs#L3) — `createReadStream`；main相同。

**已有测试入口（本轮未执行）**：`scripts/verify-video-fusion-native-media.ts`。

<a id="l01"></a>
## L01 · 后续新增：单视频节点2/4份批量生成

**操作/执行链**：选择数量→保存批次意图/复制节点→分别提交→重载恢复原批次。

**当前源码结论**：canvas-batch和batch路由为旧分支之后新增；当前菜单/创作栏数量为1/2/4，不等同于旧工作台1—6批量。

**按Naumi原生逻辑的方向**：保留并核对两种批量交互的一致性，禁止按旧分支覆盖它。

**源码锚点**：
- [src/lib/video/canvas-batch.ts:43](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-batch.ts#L43) — `export async function submitCanvasVideoBatch`；不在历史分支净差异内，另核来源。
- [src/lib/video/canvas-batch-client.ts:21](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/canvas-batch-client.ts#L21) — `generateCanvasVideoBatch`；不在历史分支净差异内，另核来源。
- [src/app/api/canvas/video-nodes/[id]/batch/route.ts:31](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/api/canvas/video-nodes/[id]/batch/route.ts#L31) — `POST`；不在历史分支净差异内，另核来源。

**已有测试入口（本轮未执行）**：`scripts/verify-video-node-controls.ts`。

<a id="l02"></a>
## L02 · 后续新增：统一参数面板与视频提示词优化

**操作/执行链**：紧凑创作栏选择参数/优化提示词→校验引用不变→用户应用结果→沿原生成链执行。

**当前源码结论**：parameter-panel/options、prompt-optimizer/assist属于旧分支之后；目录按mode/resolution取值，优化校验引用标记。

**按Naumi原生逻辑的方向**：作为后续原生交互基线，不回退旧的大表单；保持参数业务含义和引用身份。

**源码锚点**：
- [src/components/canvas/video/parameter-panel.tsx:8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/parameter-panel.tsx#L8) — `export function VideoParameterPanel`；不在历史分支净差异内，另核来源。
- [src/lib/video/prompt-assist.ts:6](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/prompt-assist.ts#L6) — `export function validateVideoOptimizedPrompt`；不在历史分支净差异内，另核来源。
- [src/components/canvas/video/compact-composer.tsx:68](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/video/compact-composer.tsx#L68) — `<VideoPromptOptimizer`；main后续修改。

**已有测试入口（本轮未执行）**：`scripts/verify-video-node-controls.ts`。

<a id="l03"></a>
## L03 · 后续新增：视频协调池、工作空间与引用读取

**操作/执行链**：创建/恢复锁与业务连接分离→绑定当前工作空间→验证引用媒体令牌/静态图片。

**当前源码结论**：coordination-pool、workflow-creation、reference-media/token、static-image-probe均是旧分支之后的增强。

**按Naumi原生逻辑的方向**：属于可靠性与资产隔离实现，继续复用，普通UI不增加同义开关。

**源码锚点**：
- [src/lib/video/coordination-pool.ts:37](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/coordination-pool.ts#L37) — `acquireVideoCoordinationLock`；不在历史分支净差异内，另核来源。
- [src/lib/video/workflow-creation.ts:17](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/workflow-creation.ts#L17) — `bindWorkflowCreationProject`；不在历史分支净差异内，另核来源。
- [src/lib/video/reference-media.ts:11](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/reference-media.ts#L11) — `export`；不在历史分支净差异内，另核来源。

**已有测试入口（本轮未执行）**：`scripts/verify-video-coordination-pool.cjs`。

<a id="l04"></a>
## L04 · 后续新增：APIB / Geek专用适配

**操作/执行链**：基于明确profile选择后续供应商适配→统一wire执行。

**当前源码结论**：apib-verified/documented、geek-verified/documented/h3文件和注册项存在；文件名verified不是本轮真实验证证明。

**按Naumi原生逻辑的方向**：保留当前已接适配，统一收敛在供应商层，不重新搬旧分支的协议全集覆盖主线。

**源码锚点**：
- [src/lib/video/providers/protocols/index.ts:14](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/index.ts#L14) — `APIB_VERIFIED_PROFILES`；main后续修改。
- [src/lib/video/providers/protocols/apib-documented.ts:49](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/apib-documented.ts#L49) — `apibDocumentedCodec`；不在历史分支净差异内，另核来源。
- [src/lib/video/providers/protocols/geek-h3-documented.ts:16](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/video/providers/protocols/geek-h3-documented.ts#L16) — `geekH3DocumentedCodec`；不在历史分支净差异内，另核来源。

<a id="l05"></a>
## L05 · 相关但独立：3D产品工作台

**操作/执行链**：选产品模板或导入模型→材质/贴图/灯光/相机→导出PNG/GLB→浏览器保存工程。

**当前源码结论**：当前main有/studio3d及Three.js引擎；旧视频融合分支没有该模块。产品瓶罐/包装用途不同于角色场景机位导演台。

**按Naumi原生逻辑的方向**：可复用适合的几何/渲染经验；不要把入口跳转或改名当作导演台完成。云端画布回传另行设计。

**源码锚点**：
- [src/app/studio3d/page.tsx:5](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/app/studio3d/page.tsx#L5) — `export default function Studio3dPage`；不在历史分支净差异内，另核来源。
- [src/lib/studio3d/engine.ts:8](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/studio3d/engine.ts#L8) — `export class StudioEngine`；不在历史分支净差异内，另核来源。
- [src/lib/studio3d/project.ts:68](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/lib/studio3d/project.ts#L68) — `template: z.enum`；不在历史分支净差异内，另核来源。

**已有测试入口（本轮未执行）**：`scripts/verify-studio3d.ts`。

<a id="l06"></a>
## L06 · 当前节点菜单及5项禁用占位

**操作/执行链**：空白右键/工具栏加号→同一8项清单→文本/图片/视频创建；5项保留不可选状态。

**当前源码结论**：character/scene/stage-3d/audio/multitrack仍disabled，不能因已有相近底层能力直接解除禁用。

**按Naumi原生逻辑的方向**：后续逐项做原生业务闭环，验收后再启用；不把菜单是否可点当成底层能力盘点结论。

**源码锚点**：
- [src/components/canvas/node-menu-items.ts:7](https://github.com/JesstLe/naumi/blob/305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea/src/components/canvas/node-menu-items.ts#L7) — `export function canvasNodeMenuItems`；不在历史分支净差异内，另核来源。

**已有测试入口（本轮未执行）**：`scripts/verify-canvas-node-menu.cjs`。
