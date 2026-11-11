# 整合分支新复核与最终保护修复

最新补充：应用条件已34/34、55份证据，实际103当前核心c05固定镜像及原版种子在恢复副本中往返e997通过，S01闭合；现已只读连通103，仍无持锁/切流/发布。本批只改验收工具，生产业务候选保持e997。新增验收工具首个Native review因helper启动失败未实际读源，不算通过；逐行源码包Node只读补审另行记录。详见[固定兼容与发布缺口](2026-10-17-canvas-video-rollback.md)。

## 范围与当前状态

按用户最新要求，每轮先fetch origin/main并核对交接；2026-10-17本轮重新拉取后，主线与任务分支均e997b290b39fc9df63e4c3b6387fa008b7b0e18d，无落后。共享E盘checkout仍在同事分支，不切换、不重置。当前33/34应用审核；S01、固定Linux兼容回滚及103发布待完成。下文各阶段数字及“无SSH”仅适用于当时。

Native新上下文完整分支复核84197（会话01a14769-140a-7083-bc90-82bfc6e6c2a2）以6048ae7为base实际审4094967，终态exit0且有四项发现；shell helper失败后实际使用只读Node读取源码，不是空审阅。完整回执whole-branch-review-4094967.txt保留。exit0不能当无问题。

## 四项修复

1. P1安装器：Compose要求独立MEDIA_WORKER_SECRET，但install.sh及.env.example缺失。安装器补缺失/空/旧占位值生成，已存在有效值保持；不重用SETTINGS_SECRET/VIDEO_WORKER_SECRET。
2. P2 Worker包装：新runner的旧版控制分支动态import video-worker-legacy.mjs，Dockerfile未复制。补入固定runtime镜像；必须在新真实镜像中启动该分支验收，源码存在不能算运行通过。
3. P2混合引用：single_image中音频可以在图片前，旧逻辑错误改refs[0]角色。按已验证的imageIndices[0]分配首帧，音频顺序/角色保持。
4. P2播放清单：私有远程存储默认redirect时，HLS/DASH被排除重定向后仍没进入proxy。已就登记remote_ready的manifest走鉴权代理；二进制segment继续原签名重定向，逐文件授权和相对同源地址保持。

当前集中验收：verify-installer-worker-secrets.py在真实Linux bash中执行原安装器密钥区块，缺失/空/占位/有效四场景及二次执行字节保持通过，三密钥独立；没有运行完整安装器或Compose。本机Docker未安装compose插件，不能写Compose实际插值通过。

完整TypeScript、video-fusion-contract通过，新增音频在前/图片在后的实际归一化断言。verify-video-fusion-manifest-access.ts使用真实应用media route、独立PostgreSQL schema、验签隔离S3对象服务：remote-ready无镜像HLS/DASH原字节、content-type、Cookie/Vary/私有缓存、匿名401/其他账号404且网络调用0、Range206、故障503/私有镜像回退、二进制仍307全部通过；此为清单交付回归，不冒称真实视频生成/播放器质量。日志checkpoint-a/manifest-access-app.log。

四项完整源码包只读补审3041已exit0，结论No actionable findings in this correction scope；明确真实镜像旧Worker入口和完整Linux验收待补。先前candidate-4094967只有源码包，尚未构建，已被本轮必要产品修正取代，不可发布。

## 浏览器保护与测试适配

4094967稳定生图四尺寸及Agent三尺寸/原链重启已通过，原证据保持。管理计费浏览器完整15项首轮12通过/3失败：两项使用原生select API操作已升级的自定义模型选择器；另一项Assistant重试未发出预期请求，原因待独立复验，不能归为已修复。首轮billing-ui-4094967-initial-failure.log及Playwright error-context保留。

自定义模型选择器现在通过真实combobox/option操作，兼容只有一个已选模型时禁用的正常状态，并继续核对实际任务/HTTP冻结的模型身份。对应更新settings/history/creation/advanced-settings与billing-ui用例，不改应用UI来迎合旧测试。三个原失败用例集中补验全部通过（35.6秒）：工作台视频重试、画布视频重试、Assistant流中断原身份/完整对话重试；最后一项未改功能便通过，首轮原因未独立确认。合并首轮12项及本次3项作为各自范围证据，不冒称同一轮15项全绿或CI绿。后续完整画布实际应用回归尚未终态。

首轮执行后半期间开始修改contract/manifest源码，开发HMR可能影响后续测试；保留此执行因素。当前补验使用本批固定未再改动的应用源码，依据实际结果判断剩余问题，不把首轮失败直接作产品或测试结论。

## 固定e997候选与后续集中验收

四项修正及测试适配已普通原子合main/任务分支到e997b290b39fc9df63e4c3b6387fa008b7b0e18d。固定1792200281，源码包89919180字节、SHA256 3e0aa23a2bc9a1b0541f8b41da194e97ac3ba805abbad0d90e2fa432f358710c。本机Ubuntu/Docker顺序构建三版本，3500MiB/2304MiB堆/1.5CPU/单构建线程，正式配置/DB/媒体不进入构建。

普通镜像实际已完成，ID sha256:9fea589fed46a283fe8601d2771d0517077ce176708bdc9ff9e7226693c20f1e。真实固定image、非root、network none/read-only/cap-drop ALL启动原video-worker.mjs兼容分支：私有控制匿名401、暂停0请求、恢复恰好1次真实隔离App tick、排空drained、SIGTERM exit0、供应商0，packaged-legacy-ui-result.json已保存。此前镜像漏装问题实际闭合；桌面/企业构建及完整Linux/回滚另验。完整分支审阅+四项修复补审+相应修复验收闭合，wholeBranchReview在e997产品范围passed。

最新真实Canvas浏览器canvas-browser-4d3e1dcd完成设置/引用/前尾互换/多镜头元素/摄影/切换模型/英文/390只读，以及实际Worker生成、原视频播放/下载/Range、彩色放大预览、真实抽帧及重载无重建。completion-d63db153完成空白创建文生、原图创建图生、真实目录故障→loading→retry、全文保持/不串图片目录、1366/1600/390设置边界；50个实际私有引用原生顺序及超限预扣前拒绝同时通过。workbench-86f4dc30完成GUI三任务×两视频、完整历史/重载、显式发送、幂等无重复收费，以及图文视频实际混合布局无覆盖。

Windows交互保护中发现旧内联textarea及底部缩放手柄已分别移动到Dock、被Dock覆盖。验收定位更新至真实Dock只读输入和可见顶部缩放手柄，并用elementFromPoint确认真实可命中；保留锁定不拖/不存/不生成、真实尺寸持久化与全文/素材不丢的断言。补模拟macOS身份下实际Chrome Backspace、Meta+Z、Shift+Meta+Z及原节点身份恢复；该集中补验仍进行中，实体Mac/Safari未测。

对比核对已逐行检查24个固定源版本、实操步骤/结果/限制、每份原证据文件SHA和Naumi对应应用证据；六段参考生成对照及在线入口版本未知/CAPTCHA、参考工作台历史缺失均保留。comparison-audit-20261017.json通过，对比门槛表示有明确边界的完整对照记录完成，原站失败和正式供应商0保持。未声称原站所有流程成功或在线付费生成质量通过。

## 最新集中验收与运行边界

Windows交互canvas-interactions-3a68f5e4通过真实两窗口冲突、跨项目剪贴板、锁定、实际尺寸持久化及账号隔离；模拟Mac身份的Chrome独立运行canvas-interactions-d5d81a7f通过Backspace/Meta撤销重做及原节点身份、全文和素材保护，实体Mac/Safari未测。protection-20261017.json复核实际浏览器回执、SHA及四尺寸/桌面截图后通过，S02闭合，当前33/34、50份注册证据。首轮失败记录保留。

e997固定普通/桌面/企业三镜像均构建完成，版本1792200281。568514950字节发布镜像包SHA256为59885f5f967715e97ceeab6f78f45d7b23e4d62ee87edd6dc07ab14b3443921a；三种实际启动/version/assetPrefix/UID1001/匿名拒绝/媒体运行时检查通过。完整包、逐镜像ID及smoke-20261017.json位于外部candidate-e997b290b39fc9df63e4c3b6387fa008b7b0e18d目录。旧6689镜像不作为本轮发布候选。

Linux SDK仅为验收工具：执行的是上述普通镜像导出的/fixed-app/server.js，业务应用production、UID1001、实际PostgreSQL16.15、Go Router、独立对象服务和Worker；容器network none且DB仅共享本隔离网络空间，不使用正式数据库或供应商。两个Omni transformation实际HTTP任务通过。随后tasks、workflow-freeze及results三模块集中终态exit0：并发创建一次、结算一次、排队取消不提交、未知状态保留、完整重试、BYOC零费用；实际发布新模型/计费配置及App重启后阶段冻结/全文保持；Gemini/Gemini-native/重复URI全部结果字节、旧主结果sourceIndex=-1、部分下载恢复及单次结算通过。

Linux BYOC首轮因production默认SSRF规则拒绝模拟127.0.0.1端点而失败；只在此network none隔离验收应用中显式启用现有USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK=true后完整重跑通过，正式应用策略未改。SDK业务媒体Worker采用既有fixture模式；不能据此宣称内核沙箱或真实付费视频质量通过。实际固定镜像内核沙箱另验。证据外部linux-fixture-20261017/run-3KvuXpFJ、run-64g7sHmN、run-JUdEJkhQ、run-A5S9CdJC及原始日志保留。

103只读基线刷新第一次连接在SSH banner握手失败，远程脚本未执行，未取得实时版本/锁状态；没有占部署锁或发布。不得用旧快照替代当前运行基线。

固定普通镜像内核沙箱集中验收终态exit0：真实launcher完成抽帧、裁剪及进度后取消；绕过JS参数验证直接调用launcher后，内核拒绝已证实可达的HTTP地址且服务命中0，宿主文件、/proc及另一任务输入均拒绝，合法媒体原SHA保持。运行容器network none/read-only、仅最小chroot/降权相关capabilities，无正式DB/配置/媒体挂载，精确清理自身测试容器。sandbox-20261017.json记录实际固定image ID与sourceCommit。此项通过，最终兼容回滚门槛仍pending。

当前Linux四模块原回执、批次日志SHA及三镜像smoke已收敛到工作树output/canvas-video-fusion-20261013/checkpoint-d/linux-e997b29/summary.json；独立媒体沙箱回执同目录sandbox.json。TypeScript与新增mjs语法检查通过。当前新增修改仅验收脚本/证据索引/文档，业务候选仍固定e997，不把后续文档提交SHA冒充镜像源码。
