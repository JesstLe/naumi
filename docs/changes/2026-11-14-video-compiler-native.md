# 原生视频编译与字节传输切片

日期：2026-11-14。基线：76519248c09607b936dd8803a0b10f3fb16626f4（已普通同步同事画布批量占位修复）。

## 模块与职责

`native-video` Profile 将真实输入、已发布语义映射编译为三种原生布局：

| layout | 创建请求 | 图片处理 | 查询/结果归属 |
| --- | --- | --- | --- |
| openai-videos | multipart /v1/videos，文字请求同样 multipart | input_reference 原始文件 | 既有 openai-videos wire adapter |
| gemini | JSON /v1beta/models/{model}:predictLongRunning | inlineData 原始字节，普通图 referenceImages，首尾帧 image/lastFrame | 既有 Gemini operation 查询和多结果处理 |
| openai-legacy | 无 videoProfile；文字 JSON、图片 multipart | input_reference 原始文件 | 既有无 Profile OpenAI 查询/content 路径 |

不按型号、旧 modes/limits、verified 或 Smoke 记录判断。操作、参数和尺寸来自明确发布的 binding；物理组合仍归对应协议实现。OpenAI 最多一张输入图、无尾帧；Gemini 普通图最多三张，不能与首尾帧混用。两张普通图片不自动转首尾帧。新增型号不需要改型号名单。

原 OpenAI-compatible codec 在方图请求中固定写 1024x1024、未知规格回落 720p。新版不复制这些隐式调整：`sizes[effectiveResolution][effectiveAspectRatio]` 明确提供物理宽高；缺映射给结构化诊断。显式 width/height 也须完整正整数。无 Profile OpenAI 保留其 resolution 直接作为 size 的既有形态；管理员通过语义 mapping 明确该值。

## 公共接口、依赖与状态/事务归属

- `createNativeVideoProfile()`：同一 describe/prepareDraft/compile 服务预览、正式提交与延迟工作流。prepare 不伪造未来素材事实。
- `nativeVideoRecipeSchema`：模型配置发布 binding 的第三个 discriminant；核心参数使用 `send=semantic`，requested -> effective 单次映射，物理字段归协议。可选原生参数用实际 wireField；false/0、明确 omit 保留，未知或未消费字段准确报告。
- `MaterializedVideoWireRequest`：执行期 JSON/FormData，与可持久化 JSON `VideoWireTemplate` 严格区分。FormData/字节/Base64/签名 URL/密钥不写冻结模板。
- `materializeNativeVideoPlan()`：验证 schemaVersion4/摘要，按原身份读取字节；对存储键、SHA256、长度、MIME、尺寸、归属资产 ID、时长逐项比较，实际字节再核验 SHA。缓存只复用同身份同版本输入，不选择模型、不重新映射、不创建任务。
- 应用物化先复用现有 creation/素材访问检查，原始字节从受保护存储读取，不从客户端地址或外部图片 URL 获取。12MiB 限制沿原图片读取边界，不是后台描述性数量限制。
- `wire-adapter.createCompiled` 发送物化后的 JSON/FormData；无 Profile OpenAI 新增 createCompiled。历史 create/poll/content、受理恢复和显式 retry 旧语义未改。
- 执行计划 schemaVersion4 专用于 native-video；原1普通JSON、2结构化、3工作流 reader 继续保留。task.parameters.version 仍为3，两者不是同一字段。
- 参数/草稿/计划归 video；binding/policy/发布版本归 model-config；媒体鉴权归现有媒体/creation；报价、预占、账务、租约、UNKNOWN继续由原任务事务和执行 owner 管理。纯 Profile 不导入 Route/React/DB/供应商网络，不引入 DI/内部HTTP/全局事件总线。

## 发布、迁移和回滚

发布校验要求 native layout 与查询 profile 一致。`openai-legacy` 只允许供应商协议 openai-videos 且没有 videoProfile；不是“任意未知协议放行”。binding 和原查询/连接配置一起冻结；接受后更新当前 recipe 不影响原任务。新编译失败不退回旧 create，也不发送双请求。

本切片只在本地隔离数据库发布测试绑定。生产绑定写入0、付费上游0、服务器发布0。其他55个注册协议的完整分支迁移与另一条 direct 无 Profile 路径仍在总目标中，不把 JSON recipe 的可表达性当作逐协议迁移证据。先前Workflow三协议切片的本地证明保持，但生产绑定迁移仍为0。47HOLD及103独立映射实验线隔离保持。

回滚脚本只对哈希匹配的任务文件恢复，先检查所有原件/目标，不回灌DB或媒体，不重放受理不明任务。只在另一个复制工作树实际演练，主线不执行回滚。原1/2/3 reader以及旧v2任务集中回归；包含native4任务的真实发布回退必须保留兼容reader或先排空，不把旧镜像能读取新计划当作已验证。

## 集中验证与证据层级

证据目录：`E:/Workspace/naumi/output/video-compiler-native-20261114`。

- 同一发布输入：baseline拒绝 `NATIVE_PUBLISHED=REJECTED PROFILE=native-video`，修改版接受 `NATIVE_PUBLISHED=ACCEPTED PROFILE=native-video`。它只证明配置分支差异，不代表付费模型成功。
- 纯原生域32项：实际既有OpenAI/Gemini codec字段对照、尺寸显式映射、普通图/首尾顺序、真实数量和字节限制、未知型号、显式政策、false/omit、未消费参数/结构、延迟准备、字节/事实变化、摘要/版本损坏拒绝。
- 真实隔离PG/应用函数/本地供应商HTTP/独立媒体Worker/ffmpeg链路：三布局各11项，新增33项；连同原任务/BYOC/结构/Agent/Workflow共147项。涵盖预览零任务/预占/账务/供应商请求，preview/submit同摘要，修改当前binding不改变原请求，真实 multipart 文件SHA/Gemini内联SHA，text传输，失败退款，显式重试原4K，UNKNOWN不重提，header/body幂等，结果/血缘/单次账务。
- 核心137、结构32、工作流Profile30、发布/预览61及真实React/Edge预览20、结构/BYOC编辑8、Storyboard6集中回归。Canvas提交、Dock样式/结果连续性、媒体、冻结来源和账务事务检查日志一并交付。
- 完整tsc、修改包副本重新验证、复制回滚原始哈希/原行为/git diff核对见 VERIFICATION.txt 与 CHECK_RESULTS.json。
- 初始失败保留：Gemini对照对象含undefined（真实JSON序列化不会发送）、延迟准备driver误含scope、误在通用模型目录查视频专用投影；修正driver而非产品放宽。初始成功141项在增加body幂等及字段冲突保护后变147项；最终包验证作为交付依据。后续审查移除隐式方图1024降档，改为binding显式尺寸映射。

本地应用函数和独立媒体Worker证明不等于完整Next服务、独立应用Worker进程重启或生产供应商证明。全部57+2协议条件规则、P3旧门禁调用退出、RFC A01-A19完整应用/重启/浏览器、真实上游/蓝绿仍继续，总目标ACTIVE。

补充真实Next回归：启动本工作树隔离Next dev＋现有受控API fixture，`verify-video-dock-continuity.cjs`实际通过生成前保存、生成4结果、重载/参数/引用/锁定/导入结果连续性。不是生产或真实供应商验收。旧`verify-canvas-video-dock.cjs`初次缺服务ECONNREFUSED；启动fixture后在inputValue读取富文本节点处失败，按旧textarea假设运行的脚本保留为过时driver失败，不将其写成PASS。新版连续性测试正确读取contenteditable。Next生成的tsconfig include/排版仅在本任务工作树恢复原字节，不纳入产品补丁。

基线76519248的真实Next Dock旧driver也在同一inputValue/富文本节点位置失败，确认不是本切片新增回归。新增冻结发送的body幂等字段冲突检查：幂等字段与原请求字段同名时，发送前明确失败并沿原退款规则处理，不覆盖模型、图片或Gemini参数。
