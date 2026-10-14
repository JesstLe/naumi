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
