# BYOC 完整草稿传递与 Agent 分镜保存（2026-11-15）

## 模块与职责

基线 main `93a53324ef2ce765108edc8a3432b6e523540965`；本切片分支 `codex/video-byoc-ingress-20261115`。只解决已确认的输入丢失和保存门禁，不扩展新供应商协议，不把已有编译诊断改成默认放行。

- 基线 BYOC 预览投影漏传 intentPreference/shots/elements/camera，Canvas、Workbench、Agent 也各自构造不完整请求。已有结构可以被静默丢弃，导致预览与执行检查的并非完整草稿。
- Agent `plan_video_storyboard` 读取目录旧 `definition.supportsMultiShot`，但新目录由 executable Profile 投影，不再提供该旧字段。正确执行绑定仍会在保存前被挡；保存时还重复比较旧顶层 durationSeconds，忽略新参数容器。

## 公共接口、依赖方向与状态归属

`video/byoc-draft.ts` 统一完整输入投影；UI/Canvas/Agent → 公共 preview/submit → 原可信 Input Resolver → 原 Workflow Profile compiler → 原任务、资产与账务事务。该模块不读取能力元数据、不调用网络或DB。ComfyUI Route 与 BYOC 严格schema显式接收原有意图、镜头/元素、摄影/尺寸及 providerOptions，再传到同一编译入口。实际协议缺映射仍准确拒绝，素材归属和真实媒体解析不变。

Workbench 保留既有 envelope 字段顺序及 reference 投影，未新增字段时 JSON 字节保持，以免破坏本地原操作回执键。Canvas、Agent有原生有序输入时不再重复发送参考；静态 references 保留。旧 mode 不被伪造成 workflow 意图，显式 intentPreference 不静默清除；用户可点击“按工作流输入槽执行”只解除偏好，其余参数和素材不变，中英标签齐备。

保存分镜不查询目录、不判断可执行能力、不提前收费；保留完整镜头与新参数容器。重复ID、不适用的阶段依赖、真实剧本所属项目和原Route的身份/CAS/字段检查仍在。生成和预览继续通过统一编译器：无结构映射诊断，明确发布映射后同一保存草稿可编译，不改旧能力元数据。

## 本次实现与迁移状态

以上入口均已接入；不增加模型名推断、fallback能力或第二个校验器。已有BYOC工作流计划格式3、旧v2与旧阶段读取保持。显式未知参数仍由严格schema拒绝，实际协议限制仍由compiler诊断。

## 集中验证命令与证据层级

- `node --conditions=react-server --import tsx scripts/verify-video-byoc-ingress.ts`：完整字段、false/0、原操作JSON字节、准确compiler反控及自定义camera槽正控。
- `node --conditions=react-server --import tsx scripts/verify-agent-video-drafts.ts`：保存不读目录、不启动生成，重复ID/阶段依赖/剧本项目与跨项目反控；AST核对该工具无旧supportsMultiShot/modes/limits裁决。
- `node --conditions=react-server --import tsx scripts/verify-video-compiled-task.ts --byoc --agent --structured --workflow --server-exit`：150项实际隔离PG/Route/Agent/本地供应商HTTP/独立媒体Worker/ffmpeg；含BYOC各入口六组完整草稿诊断和零task/reservation/creation/ledger/上传/生成负控、分镜真实保存/预览与显式映射正控；原任务恢复、UNKNOWN、旧阶段/任务和账务断言保持。
- Workflow Profile30、核心137、UI调用图和执行就绪、真实React事件控制及完整tsc集中核对。React事件验证不是浏览器验收；Route直调不是完整Next服务/应用Worker重启。
- 完整基线探针、源与独立解包副本、命令/输入/literal输出/exit、原SHA和hash-guard复制回滚见 `E:/Workspace/naumi/output/video-byoc-ingress-20261115/VERIFICATION.txt`。初次组合测试复用了另一个发布actor留下的旧fixture草稿，正确触发PUBLISH_STALE_DRAFT_BASE；现复用本套件原发布actor并保持原owner CAS，不改产品发布规则。原失败日志保留。

## 未完成项与下一步

本切片未构建新完整生产包，也未执行目标站配置迁移/付费供应商/发布。实际启用绑定与env-only审计、全部高级家族、真实授权上游、浏览器/RSC连续性与真实站点蓝绿验收仍开放。总目标ACTIVE，不以150项或main合并代替RFC A01–A19整体退出。47 HOLD和103隔离线保持；生产配置写入/付费/部署0。四产物及主线普通整合以VERIFICATION.txt、INTEGRATION.json为准。
