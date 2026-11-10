# VV-01试片范围与固定Linux候选验证

## 模块与职责

VV-01保留实际模型的样片、费用和人工质量判断；本阶段固定输入／预算、刷新103真实现状，并为VV-02补齐当前主线固定Linux生产镜像验证。未新增产品队列、计费、状态台账或编辑器。

## 公共接口、依赖方向、数据与状态归属

- 正式分镜、采用、返工、费用及粗剪继续使用现有storyboard／video workflow／timeline业务owner与原操作回执。试片范围文件只是验收输入，不是另一套业务工程状态。
- `scripts/video-trials/scope.ts`只读实际目录及原文，调用现有能力解析／输入归一化／原文分配规则；没有账户、供应商或网络写入。
- 原`verify-native-application.py`增加`--case storyboard`，复用原固定镜像SDK、私有PG网络命名空间、清理与源指纹验证；SDK没有外网、Docker socket或发布端口。
- 当前133项分镜套件原有业务断言继续执行。对白测试的Linux输入改为带SHA256的既有Windows离线中英文录音；只读覆盖这一个测试适配及fixture目录，记录精确文件哈希。生产App、生产Worker及固定镜像的字节保持；测试适配不是供应商调用或产品TTS。

## 固定基线与本次实现

- `origin/main`刷新为`2458a4d5644ce7d669c8ba7c520e90a6e05648b5`。共享checkout原分支与改动不动，使用`codex/storyboard-real-trials-20261110`。
- [原文](../acceptance/canvas-video-vv01-20261110/original-script.txt)SHA256：`5e1dc355a62c8ffb87e210644452619955590b5951e5fc416bfa8bdbf55c214f`。
- [范围](../acceptance/canvas-video-vv01-20261110/trial-scope.json)：103、`video-apib-seedance-2-5`、4秒／480p／16:9；3个基础镜头、1次单镜返工、1次视频参考连续性；最多5次视频／2次媒体，总上限120 Naumi积分。分项视频20／媒体10只是支出上限，执行前需正式冻结报价；通用目录展示价不等于执行报价，未知采购价格不换算。
- [22条通道记录](../acceptance/canvas-video-vv01-20261110/channel-coverage.json)全部未验证。当前目录显式原生多镜头支持数0；所选型号`single_image`会转换首帧后遇`supportsFirstFrame=false`，真实输入编译复现`FRAME_UNSUPPORTED`。管理员false保持，参考图片采用明确支持的普通reference模式。
- 所有UUID只是预备的clientOperationId，不是已受理业务回执；占位参考不是正式上传素材。

## 103实况与真实提交边界

- 实际Web／Worker均`268076b7fb4900509817af7321ad34a85698c86c`、版号`1793743896`；模型v117／计费v8。分镜与Agent令牌接口404，多轨接口200。
- 专用测试用户可用积分0。正式`/api/video/generate`零余额预检一次返回HTTP402：`{"error":"可用积分不足","code":"INSUFFICIENT_CREDITS"}`。前后任务均0、账本均2，实际供应商调用0。
- 既有管理员会话两份均403；受保护密码输入未收到。未伪造会话、重置密码、直写余额、关闭计费或借用其他用户额度。
- GitHub当前SHA的core／image／Docker三个任务因账户支付／支出门槛未启动，不是业务测试失败，也未记录远端CI绿。没有重复派发。

## 完整Linux生产镜像与运行验证

- 从精确git archive构建，原tar SHA256`a980fe407c4a1de9322246069e50c4c795b876faf52f2b83dabb16084e79c674`；全部5994源文件与独立干净验证树逐字节一致，源digest`ea5f7734069120804abd1f9487a90e65f5842450a1c4601d77634c5891660040`。
- 完整生产镜像`naumi:vv01-candidate-2458a4d5-20261110`，Image ID`sha256:66d82b1e0423a3e6007584298b4679baaed422c8307ff575bf129787124d813f`，构建版号`1794303182`，完整Next standalone／Worker打包／FFmpeg沙箱及中文字体构建exit0。
- 为接入既有固定镜像SDK仅添加source digest标签，所有RootFS层未变；标签镜像`sha256:63df2346cc6d709ceee330c813943bb01a556e3456b4b0843019a5a5d48e22ac`。SDK的server／buildId／Worker探针对照一致，SDK Image ID`sha256:61f5de4571bac0b4ea294707b60a84d86d4f85f70f53c79031f6b7f39acbab25`。
- 实际生产launcher抽帧、裁剪、进度后取消、输入SHA拒绝、内核网络／主机／跨任务拒绝通过；同生产镜像的`/app/services/media-worker/engine.mjs`烧录中文字幕“爸爸，我到了。”，H264／AAC、完整解码通过，1280×720实际帧打开核验，无方框缺字。
- 首次自建沙箱容器将整个/tmp设为noexec，实际exec拒绝；修正为生产已有的专用`/tmp/naumi-media-sandbox`exec挂载，产品代码没有放宽。固定分镜回归首轮512MiB临时盘低于既有750MiB准入要求，调整本测试为1536MiB；第二轮定位原Windows专属录音测试，新增上述真实fixture导入适配。失败日志均保留。

## 集中验证与回滚

测试与回滚精确命令／输入／字面输出／退出码、原始哈希及四项产物由本地`E:/Workspace/naumi-task-evidence/storyboard-real-trials-20261110/VERIFICATION.txt`记录。范围14项含负数／小数预算、重试、UUID冲突、未发布型号、原文与对白重复；TypeScript与定向lint分别验收。

固定Linux完整分镜回归已通过133项：真实生产App／PG／Worker／存储／账务、实际CLI/MCP、独立版本、时间码返工、对白素材／字幕／导出、成本与结构恢复均通过，真实供应商调用0。控制器退出0，原业务断言保留；SDK与PG均已按自有ID清理、临时PG数据丢弃，源指纹保持。证据：干净验证树`output/vv01-fixed-storyboard-portable/RESULT.json`、`case/RESULT.json`和`CLEANUP.json`。这不是整个画布体验或真实模型质量通过。

精确命令：`python -X utf8 E:/Workspace/naumi-storyboard-real-trials-20261110/scripts/verify-native-application.py run --sdk-manifest output/vv01-native-sdk/SDK_RESULT.json --case storyboard --out output/vv01-fixed-storyboard-portable`，cwd为固定2458a4d5干净验证树。完整生产App字节按SDK探针对照，只有测试对白适配和已哈希的录音fixture以只读挂载注入，并在INPUT/RESULT中显式记录；没有把修改过的测试文件伪装成原镜像源码。

回滚只在证据目录COPIES下的独立副本演练；归还本任务新增试片范围／测试能力到原缺失状态，不动活动修改副本、数据库、媒体或线上任务。后续人工修改与活动源码路径均拒绝写入。

### VV-02可先推进的固定画布入口验证

同一固定生产App镜像的原生导演完整画布链路通过：真实WebGL、场景／角色／相机关键帧、保存重载、混合复制／删除／恢复、丢响应原操作查询、PNG／WebM正式素材、真实节点视频HTTP／PG与pageerror0；真实付费调用0。另一个原生多轨完整画布链路通过：导入／编辑／保存、真实预览与导出像素测量、旧导出采用历史、结果手柄／视频引用和图生命周期；fixture媒体账务3笔，真实付费调用0。两轮自有SDK／PG均已清理。它们补充VV-02局部真实生产构建／浏览器证据，不代替原稿到成片全部流程、全部恢复矩阵或线上验收。

## 未完成项与下一步

1. 正常管理员登录后通过正式入账接口为专用测试账户提供最多120积分；保留操作和账本回执，不自动充值。
2. 在具备当前正式分镜入口的环境继续。固定候选未部署；103发布须另按当前蓝绿锁、实际版本／资源、备份、排空与回滚验收，47暂停保持。
3. 原文→正式素材／方案→生成→采用旧版→返工→粗剪／导出；逐条保留任务、报价／结算、产物及六维人工质量意见。未知受理查询原任务，不重放。
4. VV-05视觉／语音辅助检查、VV-06产品级TTS／ASR与真实通道、VV-02完整画布体验及生产验收仍保留。VV-01不因本阶段验证而关闭，持续目标保持active。

## 可复用续跑指令

```text
读取本记录和docs/prd/2026-11-10-canvas-video-execution.md。
刷新103实际版本、目录、计费和专用账户余额；核对试片原文哈希和120积分总上限。
正式分镜存在且正常入账可用后，先提交01并保留原操作与报价，再用其正式owned素材提交02/03。
只重做02的新候选，原采用不变；连续性与旧采用合成分别记录。
逐个核验原任务、结算、可播放完整产物及identity/action/dialogue/camera/visual/audio；未知不重提。
只按实样关闭VV-01，继续VV-02完整体验；不将fixture、本地构建、Git和线上混为一层。
```
