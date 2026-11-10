# VV-05 语音与视觉辅助审片：固定Linux完整Canvas验收

日期：2026-11-10。任务基线：`53cee2ae1b1d58a7a12b905f4ddcc0e5b797e5a9`。独立分支：`codex/storyboard-audio-review-native-20261110`。

## 模块与职责

补齐原片语音辅助审片在同一固定Linux生产App内的完整原生Canvas浏览器验收。沿用实际原稿／Agent拆镜、三镜生成／选片、单镜返工、粗剪编辑、声音与字幕、实际导出下载和重开13项，随后从同一候选面板进入语音检查。

## 公共接口、依赖方向、数据／状态／事务归属

- 原生产Dockerfile固定构建真实53cee2ae，SDK核验App server／BUILD_ID／独立Worker精确字节，不以开发服务器替代固定生产App。
- `verify-native-application.py`新增`storyboard-audio-review`，只读挂载原完整流程适配和新的语音审片companion。固定App不被测试脚本覆盖。
- SDK无外网／发布端口／Docker socket；父级私有PG与SDK同网络命名空间。子级只借用已核实的loopback连接，结束后父级核对自有标签／ID并停止移除临时容器，丢弃tmpfs PG。
- 模型上游使用明确fixture：实际视频测试图案及声音、实际音频multipart、受控转写候选，不证明真实语音识别率或商业质量。所有产品请求、保存、恢复、计费和下载走真实App。

## 本次实现与迁移状态

- 原完整创作13项保持原断言；仅新case开启已发布音频fixture和明确ASR2积分售价。
- 正常原生密码登录后，打开真实采用候选的语音审片；提取与ASR分别在实际服务器返回200并保存原回执后故意断开传输，不伪造任何成功响应。页面重开沿原完整请求／编号接回。
- 实际提取WAV的SHA、完整解码和跨账号拒绝；实际播放器按供应商时间定位；只有显式动作添加原批注，原稿、采用、其他镜头和已导出粗剪保持。
- 真实结算UPDATE故障后保留完整私有结果和原预扣，App重启后通过原生“仅恢复原审片”完成原结算，不调用模型。
- 异常供应商时间戳产生UNKNOWN；重开后恢复／原请求核对均不重新识别，人工批注仍可保存。
- 原费用owner核对3次提取、2次成功ASR和1次UNKNOWN；消费与hold分开，不生成新视频或重复账本。

## 验证命令、结果及证据层级

证据根：`E:/Workspace/naumi-task-evidence/storyboard-audio-review-native-20261110`。

- 固定真实生产构建：53cee2ae，version `1794322875`，Image `sha256:a1307c760c2f5437c49f2d619d7c1329a6cd1cae07b259690ae768ace504de47`。SDK `/fixed-app` 的 App／Worker 字节与原镜像一致；完整源哈希在 `FIXED_BUILD_RESULT.json` 与 `SDK/SOURCE.json`。
- 新增两个原生case：`storyboard-audio-review`先取得25项（原13＋语音12）；`storyboard-assisted-review`在同一镜像进一步贯通视觉6项，合计31项。后一case不是复用组件截图或HTTP假响应。
- 语音12项包含正常密码登录、确切采用候选、原片声音真实提取及SHA／完整解码／私有ACL，两次实际200丢响应重开恢复、原片时间定位／人工批注、真实结算UPDATE故障／App重启原检查点恢复、异常时间UNKNOWN不重发、人工审片可用、原账务成本归属。
- 视觉6项包含实际三帧提取、PNG SHA与跨账号拒绝、真实模型适配／回执保存、原帧时间定位及人工批注、App重启恢复与桌面／390px、另一候选隔离。视觉明确只看抽样静帧，语音检查另有证据，不能混称整片质量通过。
- 本轮不改产品源码，只扩展测试入口和只读适配。没有发现需修改生产代码的新缺陷。首次一次ESLint命令误在固定源目录查找新适配文件，未运行测试；改到任务工作树检查后通过，不改固定源或放宽指纹门禁。

实际集中命令：

```text
python -X utf8 E:/Workspace/naumi-storyboard-audio-review-native-20261110/scripts/verify-native-application.py run --sdk-manifest output/audio-review-native-sdk-53ce/SDK_RESULT.json --case storyboard-assisted-review --out output/assisted-review-native-flow-1
```

cwd：`E:/Workspace/naumi-storyboard-audio-review-main-20261110`，精确53cee2ae干净树。原样结果：

```text
AUDIO_REVIEW_NATIVE=PASS CHECKS=12 FULL_CANVAS=1 NORMAL_LOGIN=1 ASR_FIXTURE_CALLS=3 REAL_SUPPLIER_CALLS=0
VISUAL_REVIEW_NATIVE=PASS CHECKS=6 FULL_CANVAS=1 EXACT_FRAMES=3 REAL_SUPPLIER_CALLS=0
STORYBOARD_FLOW_NATIVE=PASS CHECKS=31 FULL_CANVAS=1 REAL_APP_PG=1 REAL_SUPPLIER_CALLS=0
NATIVE_FIXED_APPLICATION=PASS CASE=storyboard-assisted-review SOURCE=53cee2ae1b1d58a7a12b905f4ddcc0e5b797e5a9 FULL_FLOW_ASSERTIONS=1 FULL_APP=1 REAL_PG=1 EXTERNAL_NETWORK=0
NATIVE_FIXED_CLEANUP=PASS OWN_CONTAINERS_REMOVED=1 PG_TMPFS_DISCARDED=1
```

退出0。Page errors为空。同一固定53cee2ae镜像另跑原生配音／转写14项及原创作／登录／双窗口CAS／空间／素材删除／合成失败恢复19项，均exit0；对应子级和父级清理通过。测试SDK和父级PG均按实际ID／标签清理，tmpfs PG丢弃。供应商调用为受控fixture，商业调用0。

## 真实产物和收费证据

- `APPLICATION/case/audio-review/original-audio-evidence.wav`：原片实际提取、SHA核验及完整解码，不是脚本自报素材。
- `APPLICATION/case/delivered.mp4`／`delivered.srt`：同一原完整创作链实际下载并全流解码的成片和字幕。语音／视觉检查后，原工程及历史导出保持不变。
- `APPLICATION/case/audio-review/asr-actual200-lost.json`与`extraction-actual200-lost.json`：原200、完整请求、稳定业务编号。原失败传输与后来恢复成功分别留证。
- `APPLICATION/case/audio-review/RESULT.json`：3次原片声音提取、2次成功ASR增加5笔原账本，UNKNOWN保留2积分预扣；没有第5个视频任务或再次生成。语音子阶段消费13积分＋未知hold2，为隔离fixture。
- `APPLICATION/case/visual-review/RESULT.json`：1次抽帧3积分＋1次视觉检查2积分，2笔原账本，原音频报告与已采用结果保留。不是正式商业消费。
- 完整Canvas桌面截图、真实声音／视觉面板390px截图已生成并打开检查；抽样帧使用测试图案，模型回答受控，不作为真实创作品质示例。

## 未完成项与下一步

实际商业模型质量、VV-01试片、VV-02线上创作及本模块生产验收继续保留。103 r3发布回执独立，不创建候选／持远端锁／切流／入账；47不连接。真实试片120积分／最多5视频和2媒体不扩展为语音预算。
