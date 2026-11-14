# 视频参考协议族与 direct 冻结执行迁移

日期：2026-11-14。基线 `136cd1067f317343bc2c1a1a21dbf253bcb17438`。总目标继续ACTIVE。

## 模块与职责

本批在已集成的native-video编译契约上，补齐7个实际注册wire布局：Grok2API、CogVideoX3、Agnes、Agnes2.5、Ark、MiniMax、METASO；并接通无videoProfile的direct adapter，明确验证Ark、MiniMax、Gemini三个协议组合。没有按模型名称推测或恢复旧modes/limits/verified许可。

| 布局 | 创建请求与素材形态 | 保留的协议差异 |
| --- | --- | --- |
| grok2api | /v1/videos/generations，image.url或reference_images | 图片data URL；不发送adaptive画幅；尾帧/视频/音频没有此布局字段 |
| cogvideox3 | 同上，image_url标量或数组 | 图片data URL，最多两图；quality/size/duration/with_audio/seed；独立async-result查询 |
| agnes | /v1/videos，image或extra_body.image | 图片data URL，最多七图；帧数、帧率与明确宽高；video_回执采用agnesapi查询 |
| agnes-v25 | /v1/videos，keyframe/reference/text | 图片、视频、音频URL；首尾帧与混合参考互斥；seconds字符串/size大写 |
| ark | /contents/generations/tasks | 按输入顺序的content数组、媒体真实角色、generate_audio/watermark/typed options |
| minimax / metaso | /v2/video_generation | 原H3 content结构；帧模式实际ratio=adaptive；音频需图或视频；独立task查询响应 |

`profiles/reference-layouts.ts`归video协议领域，负责以上实际结构与分支，不调用旧create codec，不用假URL或假媒体事实。纯测试导入既有codec只做真实wire等价对照。

旧Agnes会对目标帧数取整和封顶，可能将请求时长静默缩短。新binding用`frameSchedules[effectiveDuration]`明确发布frameRate/numFrames，并核对`(numFrames-1)/frameRate`与有效时长精确一致、numFrames在9..441且1mod8。缺映射不猜、不截短；例如19秒可明确映射16fps/305帧。报价、预览、最终请求使用相同有效时长。尺寸同样沿既有明确`sizes`映射，不复制旧未知规格降到720p或方图1024的规则。

普通图片顺序保留；两张普通图片仍是reference。Cog/Agnes明确首尾帧数组按角色排序，修正旧codec只能按数组位置解释的歧义；其他content协议保留数组顺序与显式角色。MiniMax/METASO首尾帧真实ratio为adaptive，requested画幅保留，effective与billingFacts反映实际发送值。

## 公共接口、依赖方向与事务归属

- native recipe新增布局、可选`queryTransport:'direct'`、可选精确frameSchedules，以及各操作真实媒体字节/时长限制；旧配方字段、版本1及计划schemaVersion4继续读取。已有OpenAI/Gemini配方不重写，原任务物化不重新compile。
- `createNativeVideoProfile`复用既有参数单次映射、可信素材事实、intent解析和完整输入消费。`prepareDraft`与compile共用结构/参数逻辑，未来素材不虚构duration/bytes。
- 内联图片沿既有12MiB读取边界物化，SHA/长度/MIME/真实尺寸/身份仍逐项核对。Gemini槽填inlineData对象，Grok/Cog/Agnes槽填data URL；URL协议复用原签名物化，只刷新原资产地址。
- `nativeVideoQueryMatches`同时供发布校验和冻结绑定使用。direct仅允许明确配置且已有对应真实decoder的Ark/MiniMax/Gemini组合；profile与direct混用、协议不匹配或未知组合拒绝发布。METASO仍用其wire decoder，不假装旧direct的默认/videos解码器与H3相同。
- direct adapter新增createCompiled，发送已冻结JSON，沿用原base拼接、鉴权、两种幂等header、错误分类、query/content/下载。body幂等字段撞原字段时发送前失败；旧create/requestBody/poll/content分支未删未改，历史任务不重新解释。
- video拥有草稿/计划/物化；model-config拥有发布binding/连接/政策；素材归原媒体与creation；报价、事务、预占、账务、租约和UNKNOWN继续由原owner处理。没有内部HTTP、DI容器或跨模块直写。

## 验证命令与证据层级

证据目录：`E:/Workspace/naumi/output/video-compiler-families-20261114`，完整命令/输入/literal输出/exit/原始哈希与复制回滚统一记入VERIFICATION.txt。

- `verify-video-reference-layouts.ts`：64项；7布局实际旧codec普通输入wire逐字段对照；普通图顺序、明确首尾、false/0、参数单次映射、政策、未知型号、延迟准备、实际素材时长、帧数与账务时长一致、真实媒体数量/组合、内联字节改变与direct配对。
- `verify-video-compiled-task.ts --families --native --byoc --structured --agent --workflow`：隔离真实PG/应用入口/供应商HTTP/独立媒体Worker/真实ffmpeg。7wire＋3direct分别验证预览零受理/账务/供应商副作用、相同digest、冻结配置不漂移、实际data URL/inlineData字节SHA、URL媒体全消费、各自真实默认query路径与响应、结果入库/血缘/账务、text、失败退款、retry原值、UNKNOWN不重提、取消、header/body幂等、错协议发布拒绝、幂等字段冲突和权限撤销零发送。真实WAV、前序MP4、PNG混合输入逐一走Resolver。
- 原OpenAI/Gemini/无Profile OpenAI、BYOC、结构、Agent、Workflow链路集中回归；完整tsc、发布/预览、核心/媒体/账务与React消费者按受影响模块集中检查。
- 初始tsc仅测试driver中两种物化返回类型联合推断失败；明确其共同path/body断言接口后重跑，不放宽产品类型。初次应用253项与后续增加边界后的最终结果分别保留，不把早轮数值充当最终。
- 修改包在另一基线工作树重新解包验证；rollback只在复制工作树恢复原文件/哈希，当前代码保留修改。包、补丁、原始哈希、可执行回滚脚本和验证记录实际重新打开检查。

## 迁移与未完成项

本地绑定发布测试不等于生产配置迁移；本轮生产绑定修改0、付费调用0、部署0。direct执行入口已接通，不代表它原来每个protocol/requestBody组合均已迁移：APIMart/KIE/工作流旧direct分支及其剩余格式仍须按真实调用单列审查，绝不泛化为“任意无Profile都支持”。57个注册wire中其他协议的全部条件、已发布绑定切换、P3旧门禁/fallback/整对象升级的新任务调用退出、RFC A01–A19完整Next/App/独立应用Worker/restart、真实供应商与蓝绿验收仍在目标内。

旧plan1/2/3、native plan4、旧v2任务和已受理stage继续保留，不改写生产历史。47HOLD、103模型映射实验线隔离和共享checkout原有修改保持；普通main整合与线上运行版本分别记录。完整应用/付费/发布验收不由本地HTTP成功推定。

最终集中应用结果：新增参考族/direct145项，连同原链路292项通过；纯参考布局64项，原native32项。基线136cd106旧应用147项通过；从基线真正编译并保存的native4计划由修改版严格reader读取，digest/绑定不变，不用修改版自行构造计划冒充历史兼容。具体原始结果与后续包副本、回滚结果仍以VERIFICATION.txt为准。
