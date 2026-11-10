# VV-06 固定 Linux 与完整原生声音链路

日期：2026-11-10。任务基线：`ab68bcb66a0ae380198e9b6abcca707727d85c3e`。分支：`codex/storyboard-speech-native-20261110`。

## 模块与职责

本阶段补齐配音／转写产品操作的固定 Linux 与完整 Canvas 浏览器验收，不新增产品任务、计费或工程状态。不将组件独立渲染与 HTTP 分别通过冒充同一完整浏览器链。

## 公共接口、依赖方向、数据／状态／事务归属

- 生产 App／Worker 固定来自 ab68bcb6 的真实生产 Dockerfile；完整源指纹、实际版本、镜像 ID、App／Worker 字节分别核验。
- 复用 `verify-native-application.py`，新增 `speech-flow` 测试入口；测试脚本作为只读适配挂载，不覆盖固定 App。
- SDK 无外网、无发布端口、无 Docker socket；父级拥有私有 PG，子级只借用已核实的 loopback 测试连接，不清理父级数据库。供应商返回受控离线中英文录音／转写候选，所有产品登录、保存、报价、请求、恢复、采用、导出、下载走真实 App。
- 仅“采用响应丢失”步骤在真实服务端返回 200 并保存原回执之后中断传输；没有合成 HTTP 成功响应或注入 React 内部状态。

## 本次实现与迁移状态

- 正常密码登录 → 完整画布打开原生多轨 → 编辑并保存正式台词 → 读取已发布声音通道。
- 实际媒体处理 drain 后提交配音：原私有检查点及预扣保留，工程未自动采用。App 重启和页面重开后通过原编号恢复原字节，不重发供应商。
- 配音采用实际成功但响应丢失：保留失败、真实 200 原回执和采用输入，重开用原 ID 恢复，不再递增版本或扣款。
- 两个中英文句子分别生成、显式采用；第一句独立音轨跨画面切点，不改第二句、视频片段和原稿。
- 实际已拥有音频字节转写，明确选择带分句时间的格式；候选与原稿不同，采用前不改工程，显式采用后只改字幕及指定时序。
- 同一原生编辑器撤销／重做、字幕烧录、媒体导出、采用、浏览器实际下载 MP4／SRT、完整解码与重开，覆盖桌面和 390px。

## 调研与首次失败

1. 首次源指纹读取使用 Windows 默认 GBK，遇中文路径解码失败；固定 UTF-8 后开始构建。未重命名／遗漏源文件。
2. 首轮传输故障适配器在路由处理函数内提前 unroute，导致 Playwright `Route is already handled`。这是测试故障注入错误，不是产品采用失败；原始服务端 200 已保留。
3. 修正脚本时一次相对路径指向固定源而不是适配工作树，编辑没有发生；该次仍运行旧适配器，重复错误已保留。之后使用确切绝对路径修正。
4. 转写默认 `json` 不提供时间戳；测试却选择 `source-segment`，实际 UI 正确不提供该选项。测试改为用户明确选择已发布 `verbose_json`，不为测试添加伪造时间戳或更改产品默认值。
5. 完整链路确实发现产品缺陷：声音采用先更新 Canvas store，编辑器自动接收新版，再由采用回调登记撤销，导致撤销栈记录新值，点击撤销没有还原字幕。保存原失败与截图；修复为异步操作期间不抢先接收 store 回声，完成回调先保存原稿快照，busy 解除后再核对其他远端更新。采用回执、CAS 和账务规则未变。

6. 撤销修复后原断言已通过，接续测试点击保存时发现初始字幕烧录已为默认 true，勾选不会产生脏稿，保存按钮正确禁用；改为测试初始 burnIn=false 后由真实 UI 开启。测试适配变化不改固定产品镜像。
7. 独立固定验证工作树的两个新脚本被 Git checkout 转为 CRLF，导致原始字节指纹不同；按已保存 SDK 源哈希只还原这两个任务文件的换行字节，再核对暂存差异为空和工作树干净，不放宽源指纹门禁。

## 验证命令、结果及证据层级

外部证据根：`E:/Workspace/naumi-task-evidence/storyboard-speech-native-20261110`。

初始生产镜像固定 ab68bcb6；产品撤销修复后重新完整构建固定 `485005c251ae600b10c966f461a0b5debf077698`，App／Worker 及只读 SDK 字节一致。实际 version `1794319926`，Image `sha256:e85e0b49648c616c06740c4523211554e3266d164439def4894d88024c2c074b`。完整原生流程 14 项通过，page errors 0。本轮真实商业调用 0，未持远端锁、未建候选、未发布，47 未连接。

### 实际完整链路

```text
python -X utf8 E:/Workspace/naumi-storyboard-speech-native-20261110/scripts/verify-native-application.py run --sdk-manifest E:/Workspace/naumi-storyboard-speech-native-20261110/output/speech-native-sdk-4850/SDK_RESULT.json --case speech-flow --out output/speech-native-fixed-3
```

cwd：`E:/Workspace/naumi-storyboard-speech-fixed-4850-20261110`，精确485005c2干净固定树。原样结果：

```text
SPEECH_FLOW_NATIVE=PASS CHECKS=14 FULL_CANVAS=1 REAL_APP_PG=1 REAL_SUPPLIER_CALLS=0
NATIVE_FIXED_APPLICATION=PASS CASE=speech-flow SOURCE=485005c251ae600b10c966f461a0b5debf077698 FULL_FLOW_ASSERTIONS=1 FULL_APP=1 REAL_PG=1 EXTERNAL_NETWORK=0
NATIVE_FIXED_CLEANUP=PASS OWN_CONTAINERS_REMOVED=1 PG_TMPFS_DISCARDED=1
```

退出0。完整断言包括真实正常登录、原编号检查点恢复、采用成功但传输丢失恢复、中英文独立句级采用、跨切点声音、ASR候选不自动改稿、真实分句采用、撤销／重做、实际媒体导出／下载、MP4全流解码／SRT、重开与390px。

- `APPLICATION/case/delivered.mp4`：浏览器实际下载，H264／AAC，640×360；完整解码通过。`DELIVERED_PROBE.json`保存实际流信息。
- `APPLICATION/case/delivered.srt`：中文候选“爸爸，我已到站。”为1.000–2.200秒，英文“I am here.”为3.000–4.624秒，各一次。原朗读台词“爸爸，我到了。”保持在工程中；差异用于证明转写采用不改原稿。
- 桌面／390px完整画布和实际烧录帧已生成并打开核验。图像使用测试图案，声音使用已留存离线录音；不冒充模型生成质量。
- 真实隔离账务：2次配音×3＋1次转写×2＋1次导出×3＝11积分，4笔账本，视频任务0、媒体任务1；真实商业供应商调用0。
- 原声音规则24、原生动作38、原生编辑器会话25、原对白27及新控制器契约通过；真实生产构建含完整类型检查。同一固定485005c2镜像的原完整创作／恢复矩阵19项也通过（`--case storyboard-recovery`），包括正常密码登录恢复、双窗口CAS、空间隔离、素材删除、真实合成失败／仅媒体重试及下载全流解码。子级及父级清理均通过。

## 未完成项与下一步

真实可用声音通道、商业中英文／双说话人质量、103 实际线上采用／费用与完整创作验收另验；本地离线录音不能证明供应商台词准确率、发音、声线或原生视频对白质量。VV-01 原 120 积分／最多 5 视频和 2 媒体不扩展为额外声音费用。

持续目标、VV-01／VV-02／VV-05／VV-06 未因本阶段本地验收而关闭。
