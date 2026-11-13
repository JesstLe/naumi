# 47 视频节点输入、预检与协议链路排查

## 模块与职责

用户反映图生视频/多模式被前置预检拦截。本轮沿用47，执行实时只读目录/节点聚合核验和真实源码受控复现；没有发布配置、改节点、提交生成或连接103。

当前程序4c2ea711/build1794545779；模型配置v154。源码审阅基线main337a0aca（与线上应用源码的差异仅运维模块/文档）。共享checkout未修改。

## 公共接口与调用链

- 输入：Canvas compileCanvasLink→attachVideoInputs，同一模型的模式/输入原子进入history；composer picker/upload/mention也走同一helper。
- 草稿：VideoSettingsDialog→validateVideoSettings→previewCanvasInputs→normalizeVideoInput；invalid会直接禁用生成按钮。
- 服务端：submitCanvasVideo重读原节点revision、项目/媒体归属和前序完成结果→createVideoGeneration→冻结模型能力normalizeVideoInput→buildVideoCreate→报价/预占→供应商。没有用前端检查代替服务端身份、媒体和冻结语义。
- 结果：displayResultId优先于lastResultId，前序真正未完成仍阻断，完成结果可经同一节点连接成为下一节点的reference。

## 已确认问题

### P1：47能力配置仍是最小smoke，不是完整图生/首尾/多参考定义

21个启用模型中18个modes仅text，limits.images/videos/audios为0，首尾支持为false。Seedance2.0/Fast、Kling等因此即使接入可用图片也不会承接成图生模式，前端报告“文生视频不能带媒体参考”。这不是它们上游都不支持，而是本站已发布能力没有同步。

按本轮实时目录，图生模式入口只接受Wan2.6Flash一个模型；单图片输入在前端可通过3个模型，但接当前协议仅2个能编译。该数字是受控素材+真实源码校验，不是付费上游成功率或声称其他所有真实输入都失败。

### P1：能力声明与实际执行profile不一致

所有21个现行profile仍是旧apimart-apib-*。Seedance2.5虽列出single_image/reference等模式，supportsFirstFrame/LastFrame却false，图生入口因此仍不可用。它的混合参考输入可以通过前端，但旧codec只接受旧文生组合，明确抛VIDEO_PROFILE_INPUT_UNSUPPORTED：“apimart-apib-seedance: 视频模式不属于已核验组合”。仅修改UI开关或删前端校验会把错误后移。

main已有与精确型号对应的apib-video-v2/v3/v4能力和协议；以这些有来源定义作受控正控，21个单图片组合均通过前端与对应wire编译，首尾和Seedance2.5混合参考正控也通过。该证据不等于已发布或付费成片测试。

### P1：旧节点保存了text+媒体的矛盾状态

线上只读聚合：40个未删除视频节点中8个保存mode=text且带媒体输入；7个为Seedance2.0Fast，1个为Kling4.0。没有读取/公开用户提示词和媒体内容。

即使将cap替换成正确的图生能力，旧config.mode=text+图片仍复现“文生视频不能带媒体参考”。此前11月6日修复覆盖新连线的模式承接，不批量重写历史节点；打开旧草稿也刻意不自动改写。需要独立兼容旧草稿，不只是再次更新目录。

### P2：现有完整能力升级器不认识已完成的字段级修复

makeVideoFamilyCapabilityUpgradePlan对整个capabilities.video对象做smoke/已知发布对象匹配。因果对照：同一个Seedance1.0Fast的v153原投影可生成升级计划；v154仅增加合法时长范围后，原完整升级入口报VIDEO_FAMILY_CAPABILITY_UPGRADE_CONFLICT：“管理员已改动此字段，不匹配原始或已发布版本”。这是上次字段级时长修复与既有整对象升级规则的兼容缺口，原报错保留。

不能强行忽略所有管理员改动。应识别已审定的字段级来源/逐字段增量，遇到真正自定义值仍保留冲突；最终能力、limits、条件参数和profile一起形成可审查的版本化发布。

## 已检查但不列为已确诊的结果侧缺陷

受控检查确认：选中历史结果优先、最新结果回退、完成视频接下一节点、待完成素材提示均保持；正确能力与协议下，完成视频参考的前端和wire编译通过。本轮没有真实线上成片→第二次付费生成，因此不宣称结果侧全链路线上验收，也不将其凭空列为已确认bug。

## 集中复现命令与证据

`node output/video-node-preflight47-audit-20261113/audit.cjs E:/Workspace/naumi/output/video-node-preflight47-audit-20261113`

输出：modelVersion154，models21，textOnly18，uiSingleImage1，oneImageFrontPass3，oneImageWirePass2，documentedOneImageFrontPass21，documentedOneImageWirePass21，codeChecks93，productionWrites0，paidProviderCalls0。exit0。

对照输入来自本轮实时目录和只读配置投影；素材为受控HTTPS URL/媒体元数据，不冒称真实素材所有权或线上供应商验收。完整cases/错误和输入在REPRODUCTION.json及LIVE_PROJECTION.json；关键源码副本保留于source/，可在任务工作树清理后继续复现。

## 修复切片与验收顺序

1. 受限升级计划：兼容已发布v154合法字段改动；依据精确上游定义核对modes、limits、首尾/混合引用、modeParameters及profile作为一致的执行契约。保留价格、通道、凭据、默认选择和已接受任务。
2. 配置发布：管理模块独立草稿、预检、版本CAS、Router激活及新版本冻结；不是直接改active_version，也不把模式能力和codec分两次发布。
3. 旧草稿兼容：只在编辑/明确保存或新生成的草稿上按同一素材语义恢复可用模式，不批量改历史任务；普通两张图片不擅自解释成首尾帧，不自动换模型、不丢素材。
4. UI和提交检查统一读取同一发布契约。真正未完成素材、无归属、格式不支持和已接受/未知任务防重放保持；不笼统删除全部预检。
5. 应用整链路集中验收：图片/首尾/多参考→原生保存/刷新→预检/协议→异步回执→结果落原节点→选中结果/再连下一节点。受控供应商与真实付费验收分别记录。

## 未完成项

本轮完成排查，没有修改线上配置或8个原节点，没有发布程序。上列修复切片尚未实施。只有“时长v154已修复”仍成立，不能把它写成整个视频创作能力已完成。
