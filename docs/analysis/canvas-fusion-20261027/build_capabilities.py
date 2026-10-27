"""Capability/source crosswalk for the fixed main snapshot. No runtime execution."""
from pathlib import Path
import json
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
MAIN = "305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea"
FUSION = "6dd5d51b379ad5b6fe1ed1244c08d239f30c59b5"
rows = []

def add(id, title, flow, state, direction, evidence, tests=()):
    rows.append(dict(id=id, title=title, flow=flow, current_source_state=state,
                     native_direction=direction, evidence_specs=evidence, test_files=list(tests)))

add("V01", "文生/图生与空白视频节点",
    "添加视频节点或从选中素材进入→保存节点配置→生成→持久 taskId→结果挂回原节点。",
    "画布创建、原生创作栏和节点提交链路存在；是否可用取决于账号权限及实际视频模型目录。",
    "复用节点与创作栏；入口围绕文字或已选素材，不另建一套上游画布。",
    [("src/components/canvas/canvas-client.tsx", "function createCanvasNode"), ("src/lib/video/node-submission.ts", "export async function submitCanvasVideo"), ("src/app/api/canvas/video-nodes/[id]/generate/route.ts", "export async function POST")],
    ["scripts/verify-video-fusion-canvas.ts", "scripts/verify-video-fusion-creation.mjs"])
add("V02", "首帧、尾帧及三种首尾规则",
    "选择图片引用→指定首/尾职责或交换→依据模式校验→映射到供应商请求。",
    "first_frame/last_frame 角色、frames_required/first_optional/last_optional 模式及首尾交换界面存在。",
    "保留首尾的真实含义；与原画布连线/引用统一表达，不让用户同时维护重复列表。",
    [("src/components/canvas/video/reference-list.tsx", "交换首尾帧"), ("src/lib/video/client-settings.ts", "export function videoModeRoles"), ("src/lib/video/contract.ts", "export function normalizeVideoInput")],
    ["scripts/verify-video-fusion-reference-boundaries.ts"])
add("V03", "文字、图片、视频、音频混合引用",
    "从画布/素材库/本地导入→选择并排序→归属与真实媒体核验→提交。",
    "四类有序输入与三类媒体引用存在；数量、时长和文件规格由模型能力约束，历史30/10/10不是所有模型统一配置。",
    "继续复用正式素材身份，简化引用操作；不把上游计数或字段当固定产品限制。",
    [("src/lib/video/references.ts", "export const orderedInputSchema"), ("src/lib/video/reference-materialization.ts", "export async function authorizeVideoReferences"), ("src/components/canvas/video/settings-fields.tsx", "上传视频参考素材")],
    ["scripts/verify-video-fusion-reference-limits.ts"])
add("V04", "引用顺序与提示词编号",
    "保存输入顺序→完整 ref 编号与各媒体分类编号→编译提示词→绑定实际素材。",
    "numberVideoInputs/compileVideoPrompt 同时支持 {{ref N}} 和图片N/视频N/音频N；不存在的编号抛错。当前创作栏仍写入原始 {{ref N}}。",
    "保留稳定身份、顺序和角色；普通用户层统一为 Naumi 的 @/素材标签，编译器内部负责协议编号。不能直接批量替换旧提示词。",
    [("src/lib/video/references.ts", "export function numberVideoInputs"), ("src/lib/video/prompt.ts", "export function compileVideoPrompt"), ("src/components/canvas/video/compact-composer.tsx", "{{ref ${index}}}")],
    ["scripts/verify-video-fusion-reference-order.ts", "scripts/verify-video-fusion-reference-edges.ts"])
add("V05", "视频模型目录与切换",
    "读取托管/兼容目录→选默认模型→取能力→切换时协调已有配置→提交时再校验。",
    "公开目录、冻结能力、CanvasModelSelect、加载错误/重试与 defaults/reconcile 已有；真实已发布目录本轮未读取。",
    "模型目录继续是唯一参数来源；同一模型在主创作栏和高级设置保持一致。",
    [("src/app/api/video/catalog/route.ts", "export async function GET"), ("src/lib/video/client-settings.ts", "export function reconcileVideoSettings"), ("src/components/canvas/video/use-video-catalog.ts", "useVideoCatalog")],
    ["scripts/verify-video-fusion-client-settings.ts"])
add("V06", "时长、分辨率、画幅与精确尺寸",
    "从模型/模式获取合法组合→选择时长规格→协调互斥项→服务端二次验证。",
    "durationResolutionMap、比例、精确宽高、按模式规格及后续新增自动时长/分辨率比例关联均有源码。",
    "保留真正影响输出的参数；常用项集中，协议差异由适配层处理。",
    [("src/lib/video/capability-schema.ts", "export const videoDefinitionSchema"), ("src/lib/video/parameter-options.ts", "export"), ("src/components/canvas/video/parameter-panel.tsx", "export function VideoParameterPanel")],
    ["scripts/verify-video-fusion-client-settings.ts"])
add("V07", "声音、水印、负面词及可选模型参数",
    "能力声明→生成类型化控件→保留未发送/false/0→规范化→协议字段映射。",
    "三态声音/水印、负面词及 providerOptions 类型/范围/omit 规则存在；部分高级控件直接以技术 key 作标签。",
    "用户能理解的业务控制项保留；供应商 key 收入映射层/管理员界面，不机械照搬到创作界面。",
    [("src/components/canvas/video/settings-panel.tsx", "Object.entries(cap.providerOptions"), ("src/lib/video/contract.ts", "omittedProviderOptions"), ("src/lib/video/providers/wire.ts", "export function selectWireOptions")],
    ["scripts/verify-video-fusion-contract.ts", "scripts/verify-video-fusion-advanced-settings.ts"])
add("V08", "摄影机、镜头、焦距、光圈",
    "开启摄影→选预设或自由参数→保存配置→编译为摄影描述加入视频提示词。",
    "CameraSettings、预设资料、compileVideoCamera 链路存在；本质是提示词指导，不是3D相机模拟器。",
    "摄影参数按镜头创作组织；与3D导演台机位区分，未来通过明确导出的镜头信息连接。",
    [("src/components/canvas/video/camera-settings.tsx", "export function CameraSettings"), ("src/lib/video/camera.ts", "export function compileVideoCamera"), ("src/lib/video/submission.ts", "const cameraPrompt=compileVideoCamera")],
    ["scripts/verify-video-fusion-settings.mjs"])
add("V09", "单片段多镜头与结构化分镜",
    "添加/排序镜头→编辑文字与每镜秒数→校验总时长→支持的协议发送 shots/multi_prompt。",
    "ShotEditor、shots 契约、Kling 等分支适配已有；只有模型声明支持才显示/接受结构化分镜。",
    "区分一个模型任务内的多镜头与多个视频节点；用我们的文字/镜头节点组织，避免用户误把两者当同一开关。",
    [("src/components/canvas/video/shot-editor.tsx", "export function ShotEditor"), ("src/lib/video/contract.ts", "shots"), ("src/lib/video/providers/protocols/kie.ts", "multi_prompt")],
    ["scripts/verify-video-fusion-script-multishot.ts"])
add("V10", "元素分组与角色/物体参考",
    "命名元素→描述→绑定多份参考→按模型限制和协议发送。",
    "ElementEditor 和 elements 请求链存在，但它是某次视频生成的元素组，不是画布独立角色资产节点。",
    "作为未来角色/场景节点的可复用底层；素材身份、不同状态和复用规则需单独设计。",
    [("src/components/canvas/video/element-editor.tsx", "export function ElementEditor"), ("src/lib/video/contract.ts", "elements"), ("src/lib/video/providers/protocols/apimart.ts", "elements")],
    ["scripts/verify-video-fusion-advanced-settings.ts"])
add("V11", "运动参考与角色朝向",
    "选择角色图片和动作视频→设朝向/质量等合法选项→运动控制协议生成。",
    "motion_control 模式及 KIE/APIMart/TokenDance 分支存在，不能认为所有视频模型都支持。",
    "用参考素材职责表达动作来源；朝向作为必要业务控制，不暴露原始供应商字段名。",
    [("src/components/canvas/video/settings-panel.tsx", "characterOrientation"), ("src/lib/video/providers/protocols/kie.ts", "motion"), ("src/lib/video/providers/protocols/tokendance.ts", 'tokendance-kling-motion')],
    ["scripts/verify-video-fusion-ic-protocols.ts"])
add("V12", "剧本资产、逐字片段与分镜拼图",
    "保存正式原稿→按连续原文拆片段→保存可编辑镜头→绑定局部素材→形成视频计划。",
    "script-assets、plan_video_script/plan_video_storyboard、原稿哈希和UTF-16连续区间校验存在；制作规则已注入Agent。规则文本存在不证明模型每次严格执行。",
    "复用文字节点和现有Agent；补清晰的原稿→片段→视频关系，不要求用户操作字符下标。",
    [("src/lib/video/script-assets.ts", "export async function saveVideoScriptAsset"), ("src/lib/agent/canvas-video-tools.ts", 'tool("plan_video_storyboard"'), ("src/lib/video/production-prompt.ts", "完整剧本默认原样保留")],
    ["scripts/verify-video-fusion-script.ts", "scripts/verify-video-fusion-mosaic.ts"])
add("V13", "连续镜头、续写、硬切和同机位",
    "确认真实前序结果→选择叙事关系→保存依赖→冻结各阶段→Worker等待产物后继续。",
    "extend_video、制作规则、DAG调度和真实前序媒体绑定存在；前传是叙事规则，不代表供应商具备反向延展接口。",
    "复用画布连线和任务状态表达依赖；不另建和画布割裂的调度页面。",
    [("src/lib/agent/canvas-video-tools.ts", 'tool("extend_video"'), ("src/lib/video/workflow.ts", "async function dependencyReference"), ("src/lib/video/production-prompt.ts", "连续镜头、硬切、同机位")],
    ["scripts/verify-video-fusion-continuity.ts", "scripts/verify-video-fusion-production.ts"])
add("V14", "视频风格/局部/替换/剧情编辑",
    "读取真实来源视频→描述修改与保持项→绑定目标素材→用编辑或支持视频参考的模式生成新结果。",
    "edit_video 及生产规则存在；source_video 和合法模式校验保留，旧结果不被覆盖。",
    "围绕用户选中的视频和想改的内容提供原生编辑；复用生成任务，不新增平行编辑后端。",
    [("src/lib/agent/canvas-video-tools.ts", 'tool("edit_video"'), ("src/lib/video/production-prompt.ts", "视频编辑："), ("src/lib/video/contract.ts", 'video_edit')],
    ["scripts/verify-video-fusion-production.ts"])
add("V15", "Agent查询、配置、生成、停止和恢复",
    "读取实际节点/模型→保存配置或计划→按授权启动→返回taskId/runId→查询/取消/恢复。",
    "视频工具在 creative-tool-catalog 与 canvas-video-tools 注册，和画布节点服务/任务复用；不是仅提示词声明。",
    "让Agent操作与用户手工操作同一份节点，聊天完成不冒充视频完成。",
    [("src/lib/agent/creative-tool-catalog.ts", 'video:'), ("src/lib/agent/canvas-video-tools.ts", 'tool("get_video_config"'), ("src/lib/agent/naumi-tools.ts", "${VIDEO_PRODUCTION_PROMPT}")],
    ["scripts/verify-video-fusion-agent.ts", "scripts/verify-video-fusion-agent-sse.ts"])
add("V16", "批量、串并行制作链与配置冻结",
    "从已保存视频节点构建图→检查重复/缺失/环→冻结参数和报价→按真实依赖执行→持久恢复。",
    "canvas-workflow、workflow-freeze 和 workflow 的创建/恢复/取消存在；API/Agent有入口，未把它等同于完整可视化多轨编辑器。",
    "选择节点/连线就是编排依据；配置继承、等待原因和恢复状态应回到画布。",
    [("src/lib/video/canvas-workflow.ts", "export async function buildCanvasVideoWorkflow"), ("src/lib/video/workflow.ts", "export function validateVideoWorkflow"), ("src/lib/video/workflow-freeze.ts", "export async function freezeVideoWorkflow")],
    ["scripts/verify-video-fusion-mixed-dag.ts", "scripts/verify-video-fusion-workflow-freeze.ts"])
add("V17", "进度、错误、刷新恢复与历史",
    "提交写入持久任务→前端读状态/后台恢复→终态结算→历史查看/复用/显式重试。",
    "queued/processing/needs_attention 等状态及 use-video-tasks/history、Worker和冻结历史草稿存在；未知受理不自动另建收费任务。",
    "保留可靠后台，前端集中显示当前节点状态和可操作下一步；不再加一套浏览器轮询存储体系。",
    [("src/lib/video/service.ts", "export async function recoverDueVideoTasks"), ("src/lib/video/worker.ts", "export async function scanVideoWorkerOnce"), ("src/components/canvas/video/use-video-history.ts", "export function useVideoHistory")],
    ["scripts/verify-video-fusion-history-recovery.ts", "scripts/verify-video-fusion-submission-retry.ts"])
add("V18", "取消生成与真实终态",
    "记录取消意图→未提交则本地取消→已提交请求上游取消→查询确认终态及费用。",
    "requestVideoCancellation/beginVideoTaskSubmission/sendPendingVideoCancellation 存在；已发取消请求不等于供应商已停止。",
    "保留两阶段语义，用简洁的取消中/已停止反馈，不以隐藏节点代替停止任务。",
    [("src/lib/video/cancellation.ts", "export async function requestVideoCancellation"), ("src/lib/video/cancellation.ts", "export async function sendPendingVideoCancellation"), ("src/app/api/video/tasks/[id]/cancel/route.ts", "POST")],
    ["scripts/verify-video-fusion-cancellation.ts"])
add("V19", "视频/音频导入与播放器",
    "导入媒体或接收结果→正式作品身份→节点播放/时间/音量/全屏/下载。",
    "VideoPlayer 支持 video/audio，assets 管理导入和复用；这不等于独立音频生成编辑节点。",
    "复用播放器和资产导入；独立音频节点只补真正缺少的创建、编辑与连线语义。",
    [("src/components/canvas/video/player.tsx", "export function VideoPlayer"), ("src/lib/video/assets.ts", "export async function importVideoAsset"), ("src/components/canvas/canvas-client.tsx", "function VideoNodeSurface")],
    ["scripts/verify-video-fusion-player.ts"])
add("V20", "首帧、当前帧、尾帧抽取",
    "播放器选择时间→持久媒体job→FFmpeg抽帧→新图片作品→原项目与来源关联。",
    "播放器 actions、媒体预设、job 发布与画布接收链存在；实际执行依赖已配置媒体Worker。",
    "保留原生一键抽帧，作为视频编辑/3D预演结果继续创作的公共能力。",
    [("src/components/canvas/video/player.tsx", 'action: "frame"'), ("src/lib/video/media-jobs.ts", "export async function createMediaJob"), ("scripts/video-fusion/media-engine.mjs", "presetMediaCommand")],
    ["scripts/verify-video-fusion-derived-media.ts"])
add("V21", "音轨提取、音画分离与精确裁剪",
    "选择来源→时间区间或分离动作→媒体job→保留所有新产物→继续引用。",
    "extract_audio/separate/trim 预设、界面与多产物发布存在；无音轨/非法时间等处理须按具体媒体验收。",
    "保留这些常用动作；不要因想做音频节点或剪辑器而重写现有媒体处理后端。",
    [("src/components/canvas/video/media-actions.tsx", 'id: "extract_audio"'), ("src/lib/video/media-job-schema.ts", "extract_audio"), ("scripts/video-fusion/media-engine.mjs", "presetMediaCommand")],
    ["scripts/verify-video-fusion-media-interface.ts"])
add("V22", "FFmpeg/FFprobe、拼接和多输出",
    "选择有序素材→命令或预设→隔离Worker→核验完整输出→发布/复用。",
    "concat/ffmpeg/ffprobe、asset/output虚拟路径、辅助文件、媒体包和取消都有实现；当前普通媒体对话框暴露JSON参数数组。",
    "引擎复用；常用操作用可视化业务参数表达。原生JSON应属于专家/Agent层，不拿它代替普通用户的多轨剪辑。",
    [("src/components/canvas/video/media-actions.tsx", "参数数组 JSON"), ("src/lib/agent/canvas-video-tools.ts", 'tool("process_video"'), ("scripts/video-fusion/media-engine.mjs", "nativeMediaArgs")],
    ["scripts/verify-video-fusion-native-media.ts"])
add("V23", "生成产物、派生素材与再次引用",
    "生成→保存全部产物→抽帧/裁剪等派生→以真实身份作为下游输入。",
    "完整 resultAssets、媒体产物、父级血缘、不可变历史和引用授权链存在；不应只保留首个视频。",
    "统一作品/素材选择和连线，使角色、场景、音频、导演台输出都走同一条资产链。",
    [("src/lib/video/result-assets.ts", "export async function collectVideoResultAssets"), ("src/lib/video/result-completion.ts", "export async function completeVideoResultSet"), ("src/lib/video/reference-materialization.ts", "export async function authorizeVideoReferences")],
    ["scripts/verify-video-fusion-derived-media.ts", "scripts/verify-video-fusion-results.ts"])
add("V24", "独立视频工作台与画布发送边界",
    "在/video生成→结果留工作台→用户选择项目并发送→幂等创建画布结果。",
    "VideoStudioSession 复用节点设置/播放器/媒体job；sendVideoTaskToCanvas 保存发送记录，重复发送有稳定身份。",
    "保留工作台入口但不自动灌满画布；与原生节点共用能力，不维护另一套参数逻辑。",
    [("src/components/video/video-studio-session.tsx", "function VideoStudioSession"), ("src/lib/canvas/video-node-service.ts", "export async function sendVideoTaskToCanvas"), ("src/app/api/video/tasks/[id]/send-to-canvas/route.ts", "POST")],
    ["scripts/verify-video-fusion-workbench.ts"])

protocols = [
 ("P01", "OpenAI兼容/Grok2API/CogVideoX/Agnes", "openai-compatible.ts", "openAICompatibleCodec"),
 ("P02", "Ark / Seedance", "ark.ts", "arkCodec"),
 ("P03", "KIE / APIMart / Kling等分支", "kie.ts", "kieCodec"),
 ("P04", "Gemini / Veo、MiniMax / METASO", "gemini.ts", "geminiCodec"),
 ("P05", "AutoDL / RunningHub / ComfyUI工作流", "comfyui.ts", "comfyUICodec"),
 ("P06", "TokenDance路由族", "tokendance.ts", "TOKEN_DANCE_PROFILES"),
 ("P07", "Toonflow tfRouter", "tfrouter.ts", "TF_ROUTER_PROFILES"),
 ("P08", "Compshare / ModelVerse / H3", "compshare.ts", "COMPSHARE_PROFILES"),
]
for id, title, file, token in protocols:
    ev = [(f"src/lib/video/providers/protocols/{file}", token), ("src/lib/video/providers/protocols/index.ts", "export function installVideoWireCodecs"), ("src/lib/video/providers/wire.ts", "export function buildVideoCreate")]
    if id == "P03": ev.append(("src/lib/video/providers/protocols/apimart.ts", "apimartCodec"))
    if id == "P04": ev.append(("src/lib/video/providers/protocols/minimax.ts", "minimaxCodec"))
    if id == "P05": ev += [("src/lib/video/byoc.ts", "export async function submitByocComfyVideo"), ("src/components/canvas/video/byoc-settings.tsx", "export function VideoByocSettings")]
    add(id, title, "规范请求→选择wire profile→创建/轮询/结果解码→统一任务与产物。",
        "源码存在并在安装器注册；实际供应商账号、模型发布、额度、原生质量和当前路由健康未在本轮验证。" + ("BYOC另有账号工作流映射及加密配方；输入槽不是普通节点字段。" if id == "P05" else ""),
        "继续留在供应商适配层。用户以模型和创作需求为主，不照搬协议路径/技术字段到画布。",
        ev, ["scripts/verify-video-fusion-wire.ts", "scripts/verify-video-fusion-protocol-coverage.mjs"])

add("S01", "身份、私有媒体、报价/执行冻结和幂等",
    "验证本人项目/素材→冻结模型/参数/报价→事务预扣与节点关联→真实终态结算。",
    "节点归属、引用解析、冻结模型、操作身份及预扣关联均有代码；本轮只读源码，不宣称真实余额/供应商验收。",
    "继续使用Naumi公共能力，不引入上游账号、浏览器明文凭据或独立计费体系。",
    [("src/lib/video/submission.ts", "createVideoTaskWithReservation"), ("src/lib/video/frozen-capability.ts", "freezeManagedVideoCapability"), ("src/lib/canvas/video-node-service.ts", "export async function authorizeNodeInputs")],
    ["scripts/verify-video-fusion-safety.mjs", "scripts/verify-video-fusion-manifest-access.ts"])
add("S02", "保留既有画布生图与交互",
    "新增视频能力与图片/文字/选择/拖动/缩放/快捷键共存→集中保护回归。",
    "当前CanvasClient仍是混合节点集成入口；历史有保护测试脚本，但旧34/34记录不代表当前所有交互重新验收。",
    "按能力完整切片开发；复用原有画布结构和撤销/选择逻辑，避免再加独立画布。",
    [("src/components/canvas/canvas-client.tsx", "export function CanvasClient"), ("src/components/canvas/node-menu-items.ts", "export function canvasNodeMenuItems")],
    ["scripts/verify-video-fusion-protection.mjs", "scripts/verify-video-fusion-readonly.ts"])

add("X01", "持久节点、项目、版本与复制/撤销基础",
    "节点创建/保存→revision冲突控制→项目归属→复制/软删除→历史恢复。",
    "video-node schema/service/repository、操作去重、发送记录与混合节点接口存在。",
    "为新增角色/场景/导演台节点设计时复用公共项目、身份和历史语义，不复制视频专属schema当万能节点。",
    [("src/lib/canvas/video-node-schema.ts", "export const videoNodeWriteSchema"), ("src/lib/canvas/video-node-repository.ts", "export async function saveVideoNodeTx"), ("src/lib/canvas/video-node-service.ts", "export async function copyVideoNodes")],
    ["scripts/verify-video-fusion-node-operations.ts"])
add("X02", "冻结历史配方与完整产物",
    "结果核验→所有媒体入库→公开脱密快照→历史选结果/复用参数→用户决定是否重新生成。",
    "视频图片音频多产物、工作流配方加密和摘要、displayResultId选择和历史草稿还原存在。",
    "统一结果选用与再编辑交互；旧结果及用户后续编辑分别保留。",
    [("src/lib/video/task-snapshot.ts", "export function publicVideoTaskSnapshot"), ("src/lib/video/workflow-source.ts", "export async function readOwnedVideoWorkflow"), ("src/lib/video/client-history.ts", "videoHistoryDraft")],
    ["scripts/verify-video-fusion-history-assets.ts"])
add("X03", "媒体Worker、资源边界与回收",
    "素材授权与落盘→媒体Worker认证/隔离执行→分块哈希和输出清单→发布后清理。",
    "media.ts、video-media-worker及media-engine实现存在；MEDIA_WORKER配置是执行前提。旧分支包含大文件哈希OOM修复和发布材料，但不代表当前在线配置。",
    "保留底层处理服务，不用浏览器长任务替代。新增UI只通过现有媒体任务契约调用。",
    [("src/lib/video/media.ts", "export function mediaWorkerConfigured"), ("src/lib/video/media-jobs.ts", "async function publish"), ("scripts/video-fusion/media-engine.mjs", "createReadStream")],
    ["scripts/verify-video-fusion-native-media.ts"])
add("L01", "后续新增：单视频节点2/4份批量生成",
    "选择数量→保存批次意图/复制节点→分别提交→重载恢复原批次。",
    "canvas-batch和batch路由为旧分支之后新增；当前菜单/创作栏数量为1/2/4，不等同于旧工作台1—6批量。",
    "保留并核对两种批量交互的一致性，禁止按旧分支覆盖它。",
    [("src/lib/video/canvas-batch.ts", "export async function submitCanvasVideoBatch"), ("src/lib/video/canvas-batch-client.ts", "generateCanvasVideoBatch"), ("src/app/api/canvas/video-nodes/[id]/batch/route.ts", "POST")],
    ["scripts/verify-video-node-controls.ts"])
add("L02", "后续新增：统一参数面板与视频提示词优化",
    "紧凑创作栏选择参数/优化提示词→校验引用不变→用户应用结果→沿原生成链执行。",
    "parameter-panel/options、prompt-optimizer/assist属于旧分支之后；目录按mode/resolution取值，优化校验引用标记。",
    "作为后续原生交互基线，不回退旧的大表单；保持参数业务含义和引用身份。",
    [("src/components/canvas/video/parameter-panel.tsx", "export function VideoParameterPanel"), ("src/lib/video/prompt-assist.ts", "export function validateVideoOptimizedPrompt"), ("src/components/canvas/video/compact-composer.tsx", "<VideoPromptOptimizer")],
    ["scripts/verify-video-node-controls.ts"])
add("L03", "后续新增：视频协调池、工作空间与引用读取",
    "创建/恢复锁与业务连接分离→绑定当前工作空间→验证引用媒体令牌/静态图片。",
    "coordination-pool、workflow-creation、reference-media/token、static-image-probe均是旧分支之后的增强。",
    "属于可靠性与资产隔离实现，继续复用，普通UI不增加同义开关。",
    [("src/lib/video/coordination-pool.ts", "acquireVideoCoordinationLock"), ("src/lib/video/workflow-creation.ts", "bindWorkflowCreationProject"), ("src/lib/video/reference-media.ts", "export")],
    ["scripts/verify-video-coordination-pool.cjs"])
add("L04", "后续新增：APIB / Geek专用适配",
    "基于明确profile选择后续供应商适配→统一wire执行。",
    "apib-verified/documented、geek-verified/documented/h3文件和注册项存在；文件名verified不是本轮真实验证证明。",
    "保留当前已接适配，统一收敛在供应商层，不重新搬旧分支的协议全集覆盖主线。",
    [("src/lib/video/providers/protocols/index.ts", "APIB_VERIFIED_PROFILES"), ("src/lib/video/providers/protocols/apib-documented.ts", "apibDocumentedCodec"), ("src/lib/video/providers/protocols/geek-h3-documented.ts", "geekH3DocumentedCodec")])
add("L05", "相关但独立：3D产品工作台",
    "选产品模板或导入模型→材质/贴图/灯光/相机→导出PNG/GLB→浏览器保存工程。",
    "当前main有/studio3d及Three.js引擎；旧视频融合分支没有该模块。产品瓶罐/包装用途不同于角色场景机位导演台。",
    "可复用适合的几何/渲染经验；不要把入口跳转或改名当作导演台完成。云端画布回传另行设计。",
    [("src/app/studio3d/page.tsx", "export default function Studio3dPage"), ("src/lib/studio3d/engine.ts", "export class StudioEngine"), ("src/lib/studio3d/project.ts", "template: z.enum")],
    ["scripts/verify-studio3d.ts"])
add("L06", "当前节点菜单及5项禁用占位",
    "空白右键/工具栏加号→同一8项清单→文本/图片/视频创建；5项保留不可选状态。",
    "character/scene/stage-3d/audio/multitrack仍disabled，不能因已有相近底层能力直接解除禁用。",
    "后续逐项做原生业务闭环，验收后再启用；不把菜单是否可点当成底层能力盘点结论。",
    [("src/components/canvas/node-menu-items.ts", "export function canvasNodeMenuItems")],
    ["scripts/verify-canvas-node-menu.cjs"])

def git_text(ref, file):
    return subprocess.check_output(["git", "show", f"{ref}:{file}"], cwd=ROOT).decode("utf-8")

def main():
    cache = {}
    inventory = json.loads((HERE / "inventory.json").read_text(encoding="utf-8"))
    states = {x["path"]: x["main_state"] for x in inventory["files"]}
    for row in rows:
        evidence = []
        for file, token in row.pop("evidence_specs"):
            if file not in cache: cache[file] = git_text(MAIN, file).splitlines()
            matches = [i for i, line in enumerate(cache[file], 1) if token in line]
            assert matches, f"Missing anchor: {file}: {token}"
            line = matches[0]
            evidence.append({"file": file, "line": line, "anchor": token,
                             "url": f"https://github.com/JesstLe/naumi/blob/{MAIN}/{file}#L{line}",
                             "branch_file_state": states.get(file, "不在历史分支净差异内，另核来源")})
        row["evidence"] = evidence
        for file in row["test_files"]: assert (ROOT / file).is_file(), file
        row["evidence_level"] = "本轮固定main源码核查；列出的历史测试脚本本轮未执行；未核验在线供应商、数据库或浏览器行为"
    assert len(rows) == 43
    payload = {"main": MAIN, "fusion": FUSION, "capabilities": rows}
    (HERE / "capabilities.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["# 当前 main 能力逐项矩阵", "", f"固定主线：`{MAIN}`。V01—V24/P01—P08/S01—S02完整保留原34项，X01—X03补充基础设施，L01—L06区分后续与独立模块。", "",
             "证据级别：本轮沿当前源码核对入口、规则与调用，不是当前供应商/DB/浏览器的运行验收。每项测试文件只是后续集中验收入口，不把历史通过结果继承为本轮PASS。", "",
             "| ID | 能力 | 当前状态摘要 |", "|---|---|---|"]
    for row in rows: lines.append(f"| [{row['id']}](#{row['id'].lower()}) | {row['title']} | {row['current_source_state']} |")
    for row in rows:
        lines += ["", f"<a id=\"{row['id'].lower()}\"></a>", f"## {row['id']} · {row['title']}", "",
                  "**操作/执行链**：" + row["flow"], "", "**当前源码结论**：" + row["current_source_state"], "",
                  "**按Naumi原生逻辑的方向**：" + row["native_direction"], "", "**源码锚点**："]
        for e in row["evidence"]: lines.append(f"- [{e['file']}:{e['line']}]({e['url']}) — `{e['anchor']}`；{e['branch_file_state']}。")
        if row["test_files"]:
            lines += ["", "**已有测试入口（本轮未执行）**：" + "、".join(f"`{p}`" for p in row["test_files"]) + "。"]
    (HERE / "CAPABILITIES.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"CAPABILITY_CATALOG=PASS ITEMS={len(rows)} ORIGINAL_MATRIX=34 ANCHORS={sum(len(r['evidence']) for r in rows)} SOURCE_FILES={len(cache)} RUNTIME_TESTS=0")

if __name__ == "__main__":
    main()
