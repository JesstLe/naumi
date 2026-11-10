# VV-05 P2：确切候选的抽样视觉辅助审片

## 模块与职责

开工基线`c6c81d48df095930dae842e281324b4344036d85`，无冲突同步首页主线`3a043c6b84308bd542d3358831296fabcc478b2c`；独立分支`codex/storyboard-assisted-review-20261110`。本模块推进剩余PRD的P2视觉检查；不是整片质量认证，语音检查／TTS／ASR及真实供应商质量仍保留。103统一发布由首页集成线程负责，本模块不创建候选、不持远端锁、不上传或切流。

用户在确切候选的“辅助审片”内指定1至5个递增时间点，先显式抽帧，再显式运行检查。空输入默认起点、中点及近结尾。抽帧由原媒体Worker生成；模型只读取已验证抽帧，不接收浏览器自报图片。结果保留可见观察、证据帧、具体时间、不确定性和建议，禁止`passed`／评分字段。只在用户选择“记为人工批注”后写入原take.annotations；既有采用、粗剪、原稿和生成参数不变。

## 公共接口、依赖方向、状态与事务

- `POST /api/canvas/storyboards/review-frames`：明确project／plan历史revision／node／task／artwork、operationId及samples；校验正式任务归属、继承回执、项目空间、实际解码时长和原片SHA。通过原`createMediaJob`提交单个标准FFmpeg任务，多输出PNG；复用媒体报价／冻结／预扣／Worker／存储／结算／原编号防重。
- `POST /api/canvas/storyboards/review`：要求同一候选、已完成frameJobId及完全相同samples。媒体owner返回冻结配方、原输入SHA和输出SHA；服务端读取实际私有PNG并再次核对字节，使用原`canvas.text-generate`模型用途／视觉绑定及计费，不新增收费规则或直调供应商通道。原任务生成意图与方案历史意图作为不可信待检查数据，不能变成系统指令。
- 原`withBillingRequest`拥有幂等操作、预扣、usage、结果checkpoint和结算；原`withBiRequest`选择实际模型并记录调用；最大重试0。模型格式异常不标合格，已调用但结果／费用待核对时保留原hold／manual，不制造退款或新调用。
- `GET /api/canvas/storyboards/review?target=原source&operationId=原编号`只读已结算回执。账务owner的`readSynchronousReceipt`校验actor和当前真实scope，再由分镜owner核对源plan／revision／node／task／artwork和原片SHA；不执行模型。
- take只保存`assistedReviews:[{operationId,source}]`引用，不能自报模型报告；原方案图事务／revision CAS验证报告与确切候选，独立分叉可沿精确继承来源保存引用，不能借祖先关系引用未来任务。
- 新增`app_storyboard_review_frames`和`app_storyboard_review_requests`只保存不可变来源链接和请求摘要。它们不保存第二套执行状态、计费或重试逻辑；媒体任务及billing operation仍是唯一状态owner。媒体已受理后链接写入中断时，原操作重试只补链接，不重提媒体。
- 原费用服务读取上述链接及实际账务，包含尚未人工保存报告引用的抽帧、成功检查、失败／待核查检查，新增review阶段；同一抽帧只计一次。复制方案将历史检查作为继承复用，不再次计作新方案消费。

## 网页、Agent与恢复

- 网页浅色、帧缩略图与时间定位、已结算检查费用、独立人工批注。抽帧和检查分别保留原完整请求；401、响应丢失和重开不换业务编号。空间／账号／项目／候选分区，异步返回不写到已切走的候选。
- 新工具`prepare_video_review_frames`、`review_video_storyboard_take`、`get_video_review_receipt`复用同一HTTP owner。收费写操作进入原权限目录、Agent预检与Gateway预算；只读令牌不暴露收费写工具。MCP指引同步，不把工具数量当验收。
- 调查实际发现并修复同级人工／辅助面板使用相同React key引发的重复人工输入；改为`manual:`／`assist:`命名，原人工审片12项重新通过。
- 视觉不可用不阻止人工审片。模型仅检查实际抽样静帧，声音明确`not-checked`；不从几个时间点断言完整动作、身份或对白合格。

可复用Agent指令：

```text
读取当前方案和确切候选身份。用户已要求辅助审片时，prepare_video_review_frames传原plan/revision/node/task/artwork和samples秒数。
沿原media job核对，完成后review_video_storyboard_take传相同source/samples和frame_job_id，保留稳定operation_id。
get_video_review_receipt读取原回执，向用户展示证据帧、时间、不确定性和未检查声音；不声称整片合格。
用户选择后才save_video_storyboard保存take.assistedReviews引用或人工annotations，原adoptedArtworkId和其他镜头保持。
未知沿原操作核对，不新建同内容调用，不自动返工。
```

## 集中验证与证据层级

证据根：`E:/Workspace/naumi-task-evidence/storyboard-assisted-review-20261110/`，准确命令／输入／字面输出／exit见`VERIFICATION.txt`。

- 纯规则22项：严格请求、时序／数量、冻结FFmpeg配方、模型输出拒绝passed／score／无不确定性、实际帧索引和时间映射、原采用保持、真实Agent schema与路径允许表。
- 实际Next App／独立PG／媒体Worker／私有存储／账务完整分镜集中回归149项通过（原133＋新16）；独立17项定向验证包含同操作并发两请求只调用一次模型。
- 新模块实际收费fixture：一次媒体job抽出3张真实PNG并核对存储哈希、3积分一笔；一次有效检查2积分、同编号重放无新调用；无效模型结果保留待核查预扣，不自动重试；真实CLI检查2积分并保留业务operationId，实际MCP只读取得同一回执；零预算令牌拒绝2积分调用。真正供应商调用0，不是商业模型质量验收。
- 实际React／浏览器9项：打开不调用、401原抽帧恢复、模型响应丢失原操作恢复、原片时间定位、明确转人工批注、候选隔离、390px／桌面、新上下文读服务端回执、视觉不可用人工仍可用。HTTP为受控fixture，不冒充线上完整画布。
- 原人工审片12项、费用UI9项及审片规则26／费用规则17项回归通过。TypeScript与ESLint结果单独留存；图片使用认证私有媒体原生img，保留既有性能规则提示。
- 原失败留证：路径正则未转义、跨账号隐藏资源实际404（不是预期403）、余额按总额减已用计算（不是只看credits_used）、测试bundle引入未替换process环境、相同React key；均按实际原因修正，不降低业务断言。

## 未完成与下一步

P2抽样视觉接入已有本地证据；真实视觉模型质量、语音辅助检查和VV-06产品TTS／ASR未关闭。VV-01继续既定120 Naumi积分、最多5视频／2媒体的试片范围；本模块没有占用该真实预算。VV-02线上验收等待首页线程唯一103发布回执；当前新模块不默认加入其已固定`3a043c6b／1794310315`镜像。47暂停、映射验证线隔离保持。

回退演练只还原证据目录独立副本的程序／文档；不回灌数据库／媒体，不重放已受理或未知付费任务。新增来源表是扩展式元数据，程序回退保留它们及原账务回执。


## 后继语音检查模块

已继续接入确切原片声音／原稿对照、实际ASR、时间证据及人工批注／原回执恢复，见[语音辅助交付](2026-11-10-storyboard-audio-review.md)。上文语音尚未接入为该视觉模块交付时的历史状态；真实视觉／语音质量及新模块固定Linux／完整画布／生产层仍待验。


## 后继固定Linux完整Canvas验收

语音12项及视觉6项已与原完整创作13项在同一固定53cee2ae生产App贯通，共31项，桌面／390px和原回执恢复取得真实浏览器证据。详见[原生辅助审片验收](2026-11-10-storyboard-audio-review-native.md)。上文固定Linux／完整画布待验为本模块交付时的历史状态；真实商业质量及生产验收仍待完成。
