# 固定Toonflow原生工具与供应商对照

源码固定ae9e5f1ac4f37713b902fed7fa5ca87819b324ae；没有修改原始工具、供应商源码或开启MCP。实操分为原生工具API与原生供应商API，不将它们写成浏览器操作、真实LLM策略或付费视频效果通过。正式模型调用0；原文、媒体均为本任务原创测试内容，原项目及业务数据保留。

## 原生FFmpeg工具（V22）

直接使用固定源码`packages/tools/ffmpeg/src/index.ts`的createTools及正式宿主createAgentToolContext/createWorkspaceFfmpeg。现有测试项目下新建唯一assets/native-comparison目录，输入仍为此前真实GUI上传的4秒原创MP4；原始SHA在前后均为77f0fd394ba0aa1d5efad1dda63f932f5f314561847bd2f5482cff2aae85a40c。

整批通过：原生codecs/encoders/formats/filters查询，FFprobe完整参数数组；视频+WAV两输入、MP4+PNG两输出；四帧原生screenshots、160×90帧序列2秒；xstack四格320×180；两段原视频concat8秒；真实原生进程start后Abort并等待error/end；工作区之外路径拒绝。九份产物都有长度/SHA及原生FFprobe证据，原文件保持。

最终a71123 exit0，证据`reference/toonAe9e5f/native-tools-092e3873-b883-4c50-9038-8d37dde4bef8/{result.json,calls.json}`，执行辅助`reference/verify-toon-native-tools.ts`（忽略目录）。Naumi对应native-media-da433d9b及codecs补批e8ae9f93证明真实持久job/Worker、多输出/权限/取消与查询；上游直接调用没有Naumi的持久job及计费，不能混用范围。

两次初始失败保留：54776cd3把独立availableDecoders当上游方法，真实schema拒绝；原API只有codecs/encoders/formats/filters四类，Naumi额外支持解码器查询不反向冒充上游已有方法。b9dff918把滤镜表非空当成功前提；当前本机FFmpeg输出两列标志，原生fluent查询解析返回空表。保留真实0，不修改上游解析器或伪造数据；实际xstack执行成功，不能声称完整滤镜目录已列出。codecs666、encoders243、formats418、filters0。

## 原生供应商及取消（V01/V02/V03/V06/V07/V18补证）

固定`tfRouter.ts`原封不动经正式loadMediaProviderSource VM loader执行；使用官方可注入fetch transport，只捕获原生URL/body并返回隔离响应，严格校验唯一原源、POST路径与本批虚构认证值，没有任何网络fallback或正式API调用。捕获路径为/v1/video/generateVideo及/v1/video/getVideoStatus，taskICode查询保持；不是在源码中替换endpoint。

七分支实际通过：text、图片/视频/音频混合、单尾帧、双帧、Kling、Omni、Grok。完整三行正文及逐字对白、4秒/720p、false音频、各原生角色和metadata检查，模型的模拟返回选4秒静音原创MP4，不拿有声素材冒充关闭声音的结果。原生解析得到完整base64媒体数组，输出SHA与原创静音文件一致；源码及有声输入、静音输出原始文件SHA前后保持。

失败返回fixture-only source failure，原宿主错误处理完整显示原因。取消在原代码已经接受taskID并进行processing轮询后发生，原等待真实抛AbortError，create仅1次，供应商cancel请求0。只能说明调用方停止等待，不能说原供应商任务已取消；Naumi对此保留请求停止/真实已取消/不支持取消仍完成结算的持久区别，已有cancellation-df69fed2应用证据。

最终f25049 exit0，证据`reference/toonAe9e5f/provider-native-355f4f6d-66df-4b63-872b-d2c35c54613d/{result.json,native-calls.json}`；首次989d869e用有声模拟产物验证了接口，但不满足音频关闭的素材一致性，保留为早期范围，最终批明确改静音素材。辅助`reference/verify-toon-provider-native.ts`。这些属于原生供应商API补证，不扩充已有浏览器观察或真实视频质量结论。

## 剩余

comparison登记上述证据；V12/V13策略对照、V14/V16/V23/V24及停止按钮/其他高级项仍需继续。应用正式矩阵保持30/34，新增V12/V13应用证据保留待上游条件闭合。整分支复核、固定Linux/回滚、103发布与最终交接未完成。本批无SSH、部署锁、发布或维护次数增加。

## 原制作规则运行时与来源纠正

V12拼图保护、V13续写/前传、V14局部编辑的详细规则来源主要是固定 infinite-canvas，而不是原 comparison 行笼统标注的 Toonflow。使用保存的真实独立项目上下文（8节点/4边、实际原创视频来源ID），直接调用未修改的 buildCanvasAgentSkillPrompt：拼图、连续链、编辑三个意图都实际选择对应完整规则，并保留真实来源上下文。拼图全图序列参考/不作开场帧、完整面板正文/对白、时间严格等于总时长；续写直接前序/硬切/同机位/向前补拍；编辑真实成功视频及保持项/不冒充重建，均逐项核对运行时返回正文。

证据 `reference/ic-68b37db-20261014/native-skills-fc36ba91-0d9d-42f5-a3dd-d2cbdb7022d9/{result.json,mosaic.txt,continuity.txt,editing.txt}`。这是实际原规则选择器执行，未调用LLM或生成视频，也不是浏览器已完成故事制作。Bun直接执行的两次前置核对未通过：其本次 String.raw 转译返回字面 Unicode 转义，无法与源码中的中文正文逐字比较；保留失败目录，改 Node/tsx 执行原文件后全断言通过，没有修改原规则或降低正文断言。

Toonflow 使用原 skillOperator plugin 与 createAgentToolContext，执行实际 list、完整 read workflow/canvas/v118workflow 和本次 videoProduction/shotCraft/videoPromptCraft，越界 `../../settings.json` 被拒绝；没有启用写入、MCP或正式模型。证据 `reference/toonAe9e5f/native-skills-2afe3dd0-9e4b-4253-afdd-c4c6dc4aab28/result.json` 及完整读取回执。此范围是原制作指南可供运行时读取，不能称真实LLM已按指南创作或阶段调度通过。

## 原IC工作台两任务与当前限制

正式用户配置接口只为独立虚构账号追加隔离 OpenAI 渠道，地址 127.0.0.1:15375/v1、虚构密钥；原正式业务环境没有读写。浏览器工作台输入三行原创镜头/两句对白，6秒、1280×720、720p、数量2，点击一次开始。实际 Go 原接口产生两任务，隔离供应商各收到1次create和2次poll并返回 completed；原 `/api/v1/videos/:id` 两任务均 completed/100，原 request_body 保存完整三行正文和确认规格。

页面先停在35%，随后主动刷新同页显示全部成果0；原账号 generation-logs/videos 与 video-tasks 实际返回 code0/空数组，原画布仍8节点/4边。保存 `reference/ic-workbench-task-snapshot.json`、mock-calls、workbench-after-reload-empty-dom 和截图。**不把这批记为结果持久化、历史恢复、发送或幂等通过，根因尚未确认。** 没有重复提交补造成功。mock 的multipart捕获器只截取首行，不能拿它误判原请求丢对白；原Go request_body才是全文证据。Naumi 对应自己的 workbench-d024905a 应用验收已证明三任务各两结果、完整历史与显式发送幂等，两者范围分开。

## Toonflow真实派生结果再引用

原浏览器已有项目中打开“提及节点输出或素材”，先选择原4秒视频，再选择实际1–3秒裁剪的2秒视频输出；消息草稿呈现两个独立的画布/节点/输出引用。DOM与 `screenshots/reuse-derived-video-mention.png` 已保存；没有发送消息、调用LLM或视频供应商。前批真实媒体探针证明两个对应文件可读及派生产物规格。此范围证明原UI能再引用真实派生输出，不扩大为整套生成链闭环已运行。

本轮 comparison 新增真实观察和限制，正式应用矩阵仍30/34；V12/V13不因规则选择器单独通过而提前关闭。完整上游对比、最终保护验收、整分支复核、Linux候选/回滚与103发布继续进行。没有SSH或部署锁。
