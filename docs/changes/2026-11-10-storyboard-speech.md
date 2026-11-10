# VV-06 声音通道接入

日期：2026-11-10。阶段：配置／协议模块本地验证；产品端到端及真实供应验收未完成。

## 模块与职责

- `src/lib/audio/model-capabilities.ts`拥有显式声音能力契约；`model-execution.ts`拥有一次TTS／ASR协议尝试及有界响应解析。
- 模型配置owner继续拥有供应商、加密凭据、公开ID／wire model、发布及冻结版本。新增audio模态和两个用途，不伪装成视频或图片。
- 本模块没有新的任务表、余额表或独立结算状态机。现有BI observer／supplier ledger记录原operation和版本，供应成本无回执时保持pending／NULL，不推成0。

## 公共接口、依赖方向、数据／状态／事务归属

- `executeSpeech(scope, {text,voice,format,speed?,instructions?}, options?, signal?)` → 文件bytes、mime、格式、音频SHA、原文SHA和可选requestId。
- `executeTranscription(scope, {bytes,mimeType,durationSeconds,format,timestamps,language?,prompt?}, options?, signal?)` → 原转写文本、确切输入／响应SHA及实际供应时间戳。无时间戳请求返回untimed，不伪造逐词／分句，不推断说话人。
- `scope`必须由原冻结执行owner解析，单一上游、对应用途、已核验显式能力；不开放音频供应通道fallback。HTTP复用既有DNS／SSRF、凭据边界、通道关闭门禁、并发及supplier cost transport。
- 原稿／句级时间线和媒体owner只消费这些结果，不能由协议模块反向写画布／时间线／计费表。实际媒体owner必须完整解码后才创建作品、采用或结算；文件头检查只是协议证据。
- 异常携带`acceptance=not-dispatched|rejected|unknown`。已知400／401／403／404／413／415／422／429为拒绝；408／409／5xx、断流、超时、错误音频／JSON／时间戳和重定向按unknown。绝不从异常直接重放／退款。
- 新音频计费功能沿用可选默认读取：旧版本缺失时补`enabled:false`。此开关属于原计费语义，不是公共API可用性证明；下一执行owner必须要求显式收费／免费定价及对应能力，不能把未配置解释为免费模型生成。本阶段没有新增公共生成路由。

## 本次实现与迁移状态

- 管理端完整配置可编辑音色列表、输出／输入格式、单次字符／字节／时长、语速、指令、语言／prompt及实际时间戳能力；公开模型可选声音类型，模型管理增加声音筛选。
- 切换至audio清除原图片／视频参数及旧图片采购引用，保留原其他模型记录。离开audio清除音频专有能力。显式关闭仍保留管理员音色定义。
- `audio.speech`和`audio.transcribe`两个独立能力／计费用途，冻结版本保留原wire及参数。JSON与multipart各只发送一次请求；音色样本克隆、raw PCM、SSE音频尚未接入，不按目录存在就开放。
- 输入音频duration必须由媒体owner实测；无权限／未解码输入不应直接调用此底层接口。字幕采用、句级音频替换、恢复及所有入口依旧待下一完整模块。

## 官方协议依据

已读取OpenAI Docs：
- https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create
- https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create

本地证据保留原网页和采集结果。speech JSON与transcriptions multipart按正式协议；时间戳必须显式支持verbose_json及所选granularity。具体模型／音色／限额必须来自已发布管理员配置，不选取记忆中的型号，不进行真实付费调用。

## 验证命令、结果及证据层级

执行根：`E:/Workspace/naumi-storyboard-speech-20261110`；证据根：`E:/Workspace/naumi-task-evidence/storyboard-speech-20261110`。

- `node --conditions=react-server --import tsx scripts/verify-audio-model.ts`：61项；真实本地HTTP25次，自动重试0／fallback0／真实供应调用0。配置拒绝、显式false、冻结用途、JSON／multipart原字节、错误响应、截断、超时及真实时间戳覆盖。
- `$env:AUDIO_REGRESSION='1'; node --conditions=react-server --import tsx scripts/verify-audio-model-pg.ts <证据根>/PG`：10项实际隔离PG检查及3套原模型配置／执行／管理PG回归。真实加密凭据、规范化草稿、版本发布／恢复、冻结wire和能力、发布关闭后的dispatch0、supplier ledger pending、BI原operation通过。自有一次性PG容器已停止，首页线程容器保持。
- `node scripts/verify-audio-model-ui.cjs <证据根>/UI`：8项真实React／Edge headless操作，桌面及390px无溢出，pageerror0，未发模型请求；保存桌面／手机图并打开核验。
- `verify-billing-rules.ts`、`verify-video-providers.ts`（8协议48次HTTP）、`verify-storyboard-dialogue.ts`（27）、`verify-storyboard-assisted.ts`（22）通过。
- 完整`tsc --noEmit --pretty false`与改动TS／TSX的ESLint通过。没有本模块固定Linux生产构建或线上执行证据。
- 四件套及逐命令输入、literal output、exit、基线hash／copy-only回滚见证据根`VERIFICATION.txt`，打包后重新打开核验。源代码／补丁保持修改，回滚只针对独立副本，不回灌DB／媒体、不重放已受理操作。

## 未完成项与下一步

1. 复用同步billing operation与checkpoint，持久结果和原操作恢复；失败存储及结算中断不可重发供应商。
2. 真实私有音频存储、完整解码／来源权限、句级TTS采用和ASR字幕候选；保留原台词、其他音轨／视频／剪辑，不自动采用。
3. 画布UI、Agent／CLI／MCP的授权预算、跨入口恢复和费用owner归属；真实中文／英文／双说话人验收。
4. 103首页线程唯一r2发布固定3a043c6b／1794310315，本模块不进入其固定候选。等待最终回执后开展VV-01／02线上验收；原120积分不自动扩展。47不连接。

持续目标保持active，VV-06及整PRD均未标完成。


## 后继模块已接通（2026-11-10）

原“未完成项”是本底层交付时的阶段记录。持久计费检查点、私有音频完整解码、句级显式采用、UI／Agent／CLI／MCP恢复已继续实现并取得本地证据，见[持久声音操作交付](2026-11-10-storyboard-speech-operations.md)。真实商业语音质量、新增模块固定Linux及生产验收仍未完成。当前103实际r3为3a043c6b／1794310315，不包含本底层或后继模块；47未连接。
