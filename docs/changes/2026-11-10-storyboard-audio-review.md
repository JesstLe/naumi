# VV-05 P2 原片语音辅助审片

日期：2026-11-10。基线：`283b01d6d6da4880d12b6911bf7566a2680b88aa`。独立分支：`codex/storyboard-audio-review-20261110`。

## 模块与职责

从确切候选提取实际声音，调用已发布音频转写能力，将转写候选与服务端核实的原稿对白对照，提供原片时间定位及人工批注入口。不把转写成功、文字一致或技术检查通过称为声音质量合格。

复用既有候选归属、历史方案、独立版本来源、媒体任务、音频模型、同步计费检查点与结算。没有第二套任务／队列／余额／重试状态。声音、原稿和采用仍由原业务 owner 持有。

## 公共接口、依赖方向、数据／状态／事务归属

- `POST /api/canvas/storyboards/review-audio-source`：精确 project/plan/revision/node/task/artwork 与稳定 operationId；验证真实音轨和原片 SHA，通过原标准媒体 job 提取 `review-audio.wav`。使用实际原片时长、保留音轨时间起点并补齐尾部静音，不生成虚构的语句时间。正常媒体报价／预扣／处理／私有 ACL／结算沿用既有实现。
- `POST .../review-audio/quote`：验证完成提取的冻结配方、原输入 SHA、输出 SHA、真实音频时长及参考台词后读取正式 `audio.transcribe` 报价，不执行供应商。
- `POST .../review-audio`：明确 modelId、audioJobId、format/timestamps 和独立 operationId；ASR 发送真实 WAV multipart 字节，不传参考台词作为识别提示词，避免把期望内容诱导成识别结果。
- 参考台词只从历史方案对应的正式原稿映射读取，并核对当前文本 SHA。新检查遇原稿变更时拒绝，不能偷偷用新稿替代旧参考。原报告保存完整原文、来源 SHA、范围及说话人；读取原回执不重算当前原稿。
- 比较只表示规范化文字相同、不同或无参考，保留原始转写和台词。保留供应商真实 segment/word 时间；没有时间时保持 untimed，不推测语句位置。没有发音、声线、音质、说话人身份、口型或整片质量评分。
- 长转写完整报告写入未注册媒体 ACL 的私有 JSON；原 billing.result_response 只保存 SHA／字节／原来源和私有 key 的紧凑检查点，避免超过同步账务内联结果上限。原 billing owner 使用原 fingerprint／冻结报价及检查点 CAS 完成结算。
- `GET .../review-audio?target&operationId` 只读原操作者／空间／候选／SHA 的原报告；`POST .../review-audio/recover` 仅消费原私有结果并完成原账务。没有完整结果的未知受理保持 hold／待核查，绝不重新调用模型。已知供应商拒绝显示失败／0消费，不假成功。
- `app_storyboard_audio_reviews` 只保存不可变 extraction/transcription 来源链接和原请求摘要。执行状态、结果和金额仍只属于 media/billing。扩展表在程序回退后保留，不回灌业务数据或重放任务。

## 本次实现与迁移状态

- 确切候选选片面板增加浅色、按需展开的“语音审片”。明确提取、读取证据、选择真实转写通道／格式、正式报价和对照；原完整参数按账号／空间／项目／方案／候选保存。401、响应丢失或重开保持原编号。
- 报告显示原声音播放器、参考台词、转写差异、可定位时间及不确定性。完成后保存 `take.audioReviews` 服务端回执引用；只有用户点击“记为人工批注”才新增原 take.annotations。原稿、候选状态、采用、其他镜头和粗剪均不自动改变。
- 4 个 Agent／CLI／MCP 工具：`prepare_video_audio_review`、`review_video_storyboard_audio`、`get_video_audio_review`、`recover_video_audio_review`。写工具分类、权限目录、内部路径白名单、正式报价与每日预算、稳定嵌套业务编号全部接入。
- 费用 owner 读取原提取／转写链接及原账务；尚未保存报告引用的成功、未知 hold 和已知失败都计入原方案，继承报告算复用，不重复媒体或 ASR 消费。

## 验证命令、结果及证据层级

证据根：`E:/Workspace/naumi-task-evidence/storyboard-audio-review-20261110`。

- `node --conditions=react-server --import tsx scripts/verify-storyboard-audio-review-application.ts <证据根>/APP`：实际 Next／隔离 PG／真实媒体处理／私有存储／账务及随附 CLI／MCP **22 项**。包含真实 WAV 全流解码、原 SHA、参考不作为 prompt、无自动改稿、历史原回执／并发防重、跨账号／空间、伪造报告引用、真实结算事务故障与 App 重启原检查点恢复、untimed 不编造时间、实际原稿修改拦截新检查／历史回执保留、CSRF、异常时间戳 UNKNOWN、已知失败0、费用和零预算、实际 CLI 与 MCP。
- `node --conditions=react-server --import tsx scripts/verify-storyboard-audio-review.ts`：**27 组**纯规则／schema／配方／转写比较／真实分句或词时间批注／Agent 路径与工具契约，无网络。
- `node scripts/verify-storyboard-audio-review-ui.cjs <证据根>/UI`：实际 React／Edge 浏览器 **6 项**，401 原提取恢复、ASR 响应丢失后只读接回、实际原片定位、明确批注、候选隔离、桌面和390px。产品 HTTP 为受控 fixture，正式后端另由22项覆盖；不冒称完整原生 Canvas／固定 Linux 新模块验收。
- 原完整分镜／制作／独立／审片／对白／成本／结构／抽样视觉集中实际 App **150 项通过**。类型检查、ESLint 及受影响原 UI／规则集中结果详见四件套的原命令／输出／退出码。
- 本地提取3积分、ASR2积分是隔离 fixture 售价；实际供应商返回受控文本，商业调用0，不证明真实识别率、口型或声音质量。

## 首次失败与修正

- TypeScript 发现 Node Buffer 与 Blob 输入泛型不一致，使用显式 Uint8Array.from；已结算回执的类型通过实际 report schema 再次核验。
- 检查同步账务 checkpoint 上限后，将长报告改为私有完整字节＋紧凑指纹检查点，并以真实结算 UPDATE 故障和 App 重启验证恢复，不静默截断报告。
- UI 测试的自制视频 HTTP 最初不支持 Range，metadata 可读但 seek 返回0；适配器按真实 Range/206 契约修正，不修改产品播放逻辑或降低时间断言。
- 切换候选后 details 默认关闭，测试应显式展开新候选再检查，原回执和待核对请求没有泄漏。
- 一次回归命令误写不存在的 visual verifier 文件名；保留错误，改用现有 `verify-storyboard-assisted.ts`，不把未运行写成通过。

## 可复用 Agent 操作指令

```text
读取用户指定方案及确切候选。prepare_video_audio_review.request 传原 projectKey/planId/revision/nodeId/taskId/artworkId 和稳定 operationId。
沿原媒体 job 取得完成回执；list_dialogue_audio_models 读取真实可用 ASR 模型、格式及时间戳能力。
明确用户要求后 review_video_storyboard_audio.request 传相同原来源、audioJobId、modelId、format、timestamps 及另一稳定 operationId。
get_video_audio_review 读取原报告；未知只 recover_video_audio_review，不重新调用供应商或换编号。参考台词不作为识别提示词。
展示原音频、原稿、转写、实际时间与不确定性。文字相同也不是质量通过；只有人工明确选择才保存 audioReviews 引用或 annotations，不自动改台词、采用、粗剪或生成返工。
```

## 未完成项与下一步

本模块的固定 Linux、完整原生 Canvas 浏览器和生产验收另验；真实商业语音／视觉质量、VV-01试片及VV-02线上创作仍保持未关闭。没有持远端锁／创建候选／切流／入账；103 r3 固定镜像不包含本模块，47 未连接。原120积分、最多5视频／2媒体的真实试片预算不扩展为额外音频调用。


## 后继固定Linux完整Canvas验收

语音12项及视觉6项已与原完整创作13项在同一固定53cee2ae生产App贯通，共31项，桌面／390px和原回执恢复取得真实浏览器证据。详见[原生辅助审片验收](2026-11-10-storyboard-audio-review-native.md)。上文固定Linux／完整画布待验为本模块交付时的历史状态；真实商业质量及生产验收仍待完成。
