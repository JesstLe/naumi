# 嵌套视频协议迁移：TokenDance / TFRouter / CompShare

日期：2026-11-14。实施基线：204d8fd9c975eca1e3f435417be6c25bfa257f9c。全目标ACTIVE。

## 模块与职责

本批补齐19个已注册wire Profile的原生编译布局，不建立模型名称白名单，不调用旧create codec包装成新编译器。

| 家族 | 实际布局 |
| --- | --- |
| TokenDance（8） | seedance、kling-text、kling-image、kling-motion、kling-omni、wan3、happyhorse、minimax |
| TFRouter（4） | generic、kling、kling-omni、grok |
| CompShare（7） | h3、hailuo、vidu、vidu-extend、vidu-lip-sync、wan、seedance |

`native-video`配方增加这19个layout，保留已有可选参数与plan schemaVersion4。`nested-layouts.ts`只负责共同草稿/参数编排；`nested-contract.ts`拥有窄类型和公共值操作；三个`*-layouts.ts`分别拥有真实协议字段、媒体形状与分支约束。各家族只依赖窄契约，避免运行时循环依赖。并没有用万能模板引擎代替供应商差异。

TokenDance保留不同创建路径、model_name/settings/contents、input/parameters、实际声音on/off、大小写参数和原任务prefix::id查询身份。TFRouter保留metadata、POST taskICode查询、Kling image_list/video_list，以及URL和内联Base64视频结果。CompShare保留H3独立顶层content/静音/水印、ModelVerse input/parameters、Hailuo原图data URL、Wan首尾+音频与文生尺寸、Vidu生成/参考/续写/口型同步的独立分支。

## 本批确认并修正的旧行为

1. TFRouter Kling旧分支允许两张普通图，但只序列化第一张。新编译器不伪称全部已消费：两张普通图明确返回INPUT_NOT_CONSUMED；一张图或明确首尾字段完整发送。Kling omni的普通图列表继续支持，不把缺旧标记当“不支持”。
2. TokenDance image2video旧分支按数组索引猜首尾；反向排列的明确尾/首角色可能变成两个尾帧。新编译器按明确角色发送；两张普通图不会自动变成首尾帧。单图默认意图仍由已发布binding明确指定。
3. Vidu口型同步同时提供音频和明确朗读文字时，旧路径会丢掉文字；新版返回准确参数映射诊断，不能把两项输入伪记为完整执行。
4. 没有画幅字段的分支（Hailuo、Vidu续写/口型、部分首尾帧、HappyHorse视频等），操作配方明确send=omit；若仍请求发送该参数，则报告映射缺失，不静默丢弃。UI从同一操作描述隐藏该字段，不增加另一份能力表。
5. Wan文生尺寸必须有明确sizes映射或显式size，不复制未知规格回落720p。H3 generate_audio与mute_audio冲突准确拒绝；false/0明确保留。

这些改变只进入显式发布的新执行绑定。历史create/poll/decoder代码保持，原受理任务不重写、不重新编译、不自动重发。

## 公共接口、依赖与事务归属

入口沿既有video公共preview/submit -> Resolver -> 同一Profile.prepareDraft/compile -> 原任务/预占/creation事务 -> 冻结计划物化 -> 原wire adapter/decoder -> 媒体与账务owner。

- pending Workflow只检查结构/参数，不伪造未来素材事实；最终真实素材完成后编译。
- common参数requested -> effective单次映射；具体layout只序列化有效值。MiniMax/Seedance帧实际adaptive语义与billingFacts保持一致；其他无wire字段由操作明确不发送。
- 所有媒体必须既在consumedInputIds中、又在冻结body中具有真实{$videoAsset:id}槽；虚假消费或漏图在公共compiler被拒绝。URL只在执行时按原身份签名；Hailuo读原图字节核SHA/MIME/大小，再生成data URL，不从外部客户地址抓图。
- describe投影来自同一recipe，发布阶段核对layout与查询profile/protocol；无Profile direct不能假装使用这些有独立查询身份的wire分支。
- model-config仍拥有发布修订与政策；video拥有草稿/计划/编译和物化；媒体ACL与creation沿原owner；报价、账务、幂等、UNKNOWN、租约及节点/工作流事务未另起实现。没有Route/React/DB/网络进入纯layout，也没有内部HTTP/DI/全局事件总线。

## 集中验证与证据层级

证据：`E:/Workspace/naumi/output/video-compiler-nested-20261114`。

- 纯编译189项，覆盖19布局、67个实际旧codec请求逐字段对照，以及丢第二图、反向首尾、口型文字丢失、H3声音冲突、未知参数、映射/物理尺寸、pending同facts/零字节读取等。对照不等于真实供应商付费支持证明。
- 真实应用矩阵对19布局每个已定义样例执行共同预览、正式受理、冻结映射、真实签名URL/原图字节、各家族原始创建响应与查询、结果解码/媒体持久化/血缘/账务。TFRouter generic还实际返回Base64 MP4，走原内联结果解码、ffmpeg与存储；其他分支走真实HTTP视频下载。
- 每布局集中验证错协议不发布、编译失败零任务/预占、上游明确拒绝退款、显式retry原4K、UNKNOWN不重发、取消前零create、header/body幂等、body字段冲突。带素材布局还验证当前空间撤销零发送。首个受理后改当前recipe，原任务仍发送原冻结路径；TokenDance X-App-URL、任务前缀和默认查询路径保留。
- 首个独立嵌套应用检查353项，与原任务合391项通过；补充当前权限/血缘后，最终全模块结果以VERIFICATION.txt和CHECK_RESULTS.json为准。原7参考族/direct、OpenAI/Gemini、BYOC、Agent、Workflow、结构、发布、React/Edge、Canvas、媒体、账务和完整tsc集中回归。
- 初始driver使用不存在的VideoTaskRow.taskId，修正为实际upstreamId；初始appUrl样本含query/hash，被既有发布schema准确拒绝，改用合法的本地fixture配置，不放宽产品规则。初始tsc/应用失败完整保留。Windows媒体状态写入重试仍保留原日志，结果重试未重复create；不泛化为Linux沙箱通过。
- 基线本身原292应用检查继续验证。从基线实际编译出的native4计划由修改版reader核对digest与冻结绑定不变，不自行伪造历史计划替代跨版本读取。
- 最终修改包在另一工作树解包重测；复制回滚恢复原哈希/原拒绝行为/干净状态，当前源文件保持修改。四产物、原始SHA、exact命令/输入/literal输出/exit与main整合另在VERIFICATION.txt记录。

## 未完成与下一步

本批19布局本地证明不代表生产binding已经切换。本轮生产绑定修改0、付费供应商0、部署0。57注册协议其余KIE/APIMart/APIB/Geek条件、剩余direct组合、已发布绑定显式迁移候选、P3旧门禁/fallback/整对象升级的新任务调用退出、全RFC A01–A19实际Next/API/独立应用Worker进程重启/浏览器与有授权的上游/蓝绿仍在总目标中。

不把本轮应用函数/隔离PG/本地供应商HTTP/独立媒体Worker/React证明写成整套生产系统已验收。本轮未启动NextDock服务；历史过时inputValue/contenteditable测试基线失败保持此前记录。47HOLD、103映射隔离线、共享checkout原修改保持。

补充唯一操作的自动意图：motion-control、Vidu续写、Vidu口型同步按绑定唯一操作及真实素材角色推导，旧text+media不再被迫手工切模式；显式偏好或有意义的旧mode仍优先，不被自动覆盖。describe/prepare/compile共用该逻辑，实际应用样本以缺intentPreference验证自动路径。

集中应用最终覆盖计数：新增嵌套370项、含既有所有模块共662项；加入唯一操作自动意图后继续以最终包副本结果为交付依据。基线292项通过；pure189/67对照。完整tsc错误记录中还保留测试driver对find已缩窄联合的多余text比较，删除冗余断言而非改变产品类型。
