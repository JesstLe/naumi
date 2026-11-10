# VV-06 持久声音操作与句级采用

日期：2026-11-10。开工基线：main `97c9f5ff47405aee0a201ef5c8298916f672983f`。集中整合前同步至`511063d1d66f28f1ad80eae50eafbb8254317f71`（仅同事103发布交付文档变化，完整保留）；本模块原始哈希／回滚基于同步后的511063d1。
阶段：产品代码／本地正式链路；真实商业语音质量、新模块固定Linux与线上验收未完成。

## 模块与职责

- `audio/operation-*`负责确切已保存工程／句子与已核验来源、原计费操作的私有输出检查点、解码及原结果恢复。`dialogue-adoption.ts`是纯句级变更规则；`adoption-service.ts`编排现有时间线owner与不可变采用链接。
- 两张新增表只有来源／采用关系，没有第二套队列、任务状态、余额或账务；billing仍拥有受理／并发、防重、hold/manual、结果检查点及最终结算。媒体owner仍负责完整解码，时间线owner仍负责graph锁／CAS、材料与原稿验证、工程历史。
- 复用既有音频编辑／导入录音路径；它们不冒充生成配音。实际声音生成使用此前独立audio模型执行器，模型／音色／格式必须由管理员发布。

## 公共接口、依赖方向、数据／状态／事务归属

- `POST /api/canvas/audio-operations/speech|transcribe`：稳定operationId，target精确绑定projectKey/timelineId/revision/lineId/textSha256。TTS读取服务端已保存台词，不接外部URL／任意替换文本。ASR要求自有、完整解码、sourceSha256一致的作品；真实字节通过multipart发送。
- `GET /api/canvas/audio-operations?projectKey&operationId`：同空间／项目／操作者读取原状态、音频私有结果或原转写。`GET .../catalog`只列有明确价格且开放的通道。`POST .../quote`是正式报价，不执行模型。
- `POST .../recover`：只消费原私有检查点，不选当前模型／凭据、不重发供应商。无检查点的UNKNOWN保持核查。已保存原文和处理字节在恢复中不从当前工程重算。
- `POST .../adopt`：采用操作ID与声音业务ID分开。`keep`保留时序；`fit-audio`只改该句至实际声音时长；`source-segment`只允许对应当前绑定原音频及确切SHA的真实分句。ASR只改subtitleText／显式时序，不改text/source/audioText。自动时间仍标draft，由人校对。
- 新billing公共接口`completeAudioCheckpoint`验证原scope、检查点CAS、原fingerprint和冻结quote，使用既有settleTx；作品、真实probe、原结果与扣款同事务。媒体ACL注册也参与该事务，故障回滚不产生半作品、提前可读的原始检查点或第二笔消费。提交的图像质量／文字模型默认值不参与音频原请求身份；显式audio modelId仍冻结。
- 私有存储写入先于解码／作品／结算。写入或检查点持久化前中断可能没有可证恢复输出，此时保持UNKNOWN／hold而不是推测成功、退款或自动重发。恢复后的复制／导出继续走现有媒体ACL。

## 本次实现与迁移状态

- 多轨编辑器增加浅色“配音与转写”面板：选择已保存句子、真实声音通道／音色／格式、源音频，生成与采用分开。完整原请求和采用参数按账号／空间／项目／工程保存，401、失联及重开后恢复原编号。未解决的原操作保留，不自动清空后新建收费任务。
- 6个Agent工具：`list_dialogue_audio_models`、`generate_dialogue_speech`、`transcribe_dialogue_audio`、`get_dialogue_audio_operation`、`recover_dialogue_audio_operation`、`adopt_dialogue_audio_operation`。沿既有权限、写工具分类、内网路径、正式报价、令牌预算、CLI／MCP目录及指南。
- 时间线采用回执与不可变链接同事务；同原ID恢复历史结果，不用当前工程重算。原生动作owner登记撤销历史、接受新revision；不覆盖原已采用成片或受理中的冻结导出。
- 费用owner通过原音频来源链接及billing公开证据计入配音／转写，已消费、未知hold、释放与业务失败分开。financial settled不等于生成成功，0积分也不证明成功。

## 验证命令、结果及证据层级

证据根：`E:/Workspace/naumi-task-evidence/storyboard-speech-operations-20261110`。

- `node --conditions=react-server --import tsx scripts/verify-audio-operations-application.ts <证据根>/APP`：30项实际Next App／隔离PG／私有S3兼容存储／媒体Worker／账务／随附CLI／MCP。覆盖未配价无调用、私有文件／匿名／跨账号／跨空间、原请求／并发、单句采用、实际ASR、真实媒体drain及App重启、作品与结算事务故障、采用链接事务故障、受理未知不重发、已知拒绝不假成功、零预算拦截及原账务费用证据；最终精确项数见APP-release-ready.txt／APP/RESULT.json。
- `node --conditions=react-server --import tsx scripts/verify-audio-operations.ts`：24组纯规则与Agent工具／路径契约，无网络。
- `node scripts/verify-audio-operations-ui.cjs <证据根>/UI`：7组真实React／Edge浏览器，401原参数、刷新不收费、失联采用原ID、ASR不自动改稿、账号空间分区、桌面／390px；HTTP为受控fixture，独立于上述正式App验证。截图已实际生成并打开检查。
- 原声音底层61项、原对白27／UI9、费用17／UI9、原生动作38、原生文档106、原生编辑器会话25、动态报价及完整TSC／ESLint集中回归。结果和原命令收录四件套。
- 本地TTS 3积分／ASR 2积分是原生产账务代码在隔离PG的fixture定价；供应商响应使用留存录音／受控转写文本。真实商业模型调用0，不宣称声线、台词准确率、双语质量或商业费用已验收。

## 103实际回执与本轮只读核对

- 已读取用户回传`E:/Workspace/naumi/output/creation-home-integration-20261110/deploy103-r3/final-receipts/FINAL_STATUS.json`：r3 COMPLETE；commit3a043c6b／1794310315；Web／Worker同c4c998ae…，旧对停止restart=no，任务／配置保全，锁释放。原浏览器保存事件捕获失败与后来旧生产前端→当前API200／精确读回是不同证据，原失败保留。
- 本轮直接公网`/api/version`与`/api/health`读取200、版本匹配；经本机代理的初次403另存，不冒充目标站离线。`LIVE_READONLY.json`记录两条路径。
- 本模块及40106850辅助审片、97c9f5ff声音底层均不在r3固定镜像中；本线程没有创建候选／持发布锁／切流／入账，47未连接，真实试片120积分不扩展。

## 未完成项与下一步

1. 真实可用语音通道配置、中文／英文／双说话人生成与转写质量；台词朗读／字幕对应、发音、噪声、时序和声线须听实际输出验收。
2. 新增声音模块的完整原生画布浏览器链、新固定Linux App和获准后蓝绿生产验收；组件UI和本地HTTP测试不替代这层。
3. 使用当前103 r3开展VV-01真实视频试片及VV-02线上创作／费用回执；正常专用账户与实际余额前置，沿原120积分／最多5视频和2媒体，不自动入账／重放。
4. VV-05语音辅助审片仍需有证据的原片声音／参考台词对照，不因ASR接通就标“对白通过”。

持续目标与VV-06保持未完成，按PRD原范围继续。
