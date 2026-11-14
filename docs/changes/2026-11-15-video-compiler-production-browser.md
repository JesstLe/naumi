# 视频编译架构：固定生产包的实际画布与分镜浏览器

## 模块与职责

产品固定来源 main `d4b6a58bf037bf1be5e2e303de8ad97e5b32e0e7`。本片继续验收RFC A08/A10/A19，重新构建包含分镜上下文和画布恢复修复的完整生产镜像；旧 `dcbb9494` 镜像不再代表这些修复。

## 公共接口、依赖方向、数据与状态归属

- 生产验收driver使用镜像原有standalone Web、独立application Worker和原生media sandbox，产品文件不被测试bundle替换。
- `VIDEO_PROCESS_BROWSER_PORT` 仅是测试driver显式参数，要求production-package和storyboard-session；独立容器将此Web端口发布到宿主127.0.0.1，其他Worker/控制/媒体端口仍不发布。
- `video-compiler-fixture-pg-relay.mjs` 是测试连接传输：容器内部127.0.0.1:5432转向既有本机fixture PG的15579端口，保留原local DB断言；只允许fixture库，不能指定任意数据库/主机。
- Windows真实Edge从共享session目录读取既有cookie/项目/节点身份，通过实际HTTP编辑，原file RPC控制独立Worker。commands目录由session文件所在目录派生，不把Linux绝对路径当成Windows路径。
- 生产session不执行development的Canvas API预热；首次访问证据与故障后恢复分开，不以再次访问冒充首次冷启动。

## 实现与验证记录

精确固定输入、构建/进程/浏览器原始输出、镜像及包哈希和回滚在 `E:/Workspace/naumi/output/video-compiler-production-browser-20261115`。构建保持原lint/types/Worker依赖检查；构建警告不写成零警告。

### 已发现并修正的测试装配问题

1. 第一轮完整进程组合通过至Storyboard会话，实际Canvas2与分镜5项通过后，Linux→Windows共享目录的结果文件被读到尚未写完的JSON，报Unexpected end of JSON input。只将session/receipt发布改为同目录临时文件加rename；命令前缀的原parse重试保留。显式abort经原finally回收13子进程/schema/pool，不以进程中断冒充业务通过。
2. 解包副本新增Workbench验收时，原浏览器helper假设最初任务总在第一页。组合矩阵产生超过真实30行分页上限，实际页面提供“加载更多”，目标在下一页；HTTP全部成功且pageerror0。helper现在点击原页面/历史对话框的分页按钮读取指定历史任务，不增加产品列表上限或把目标换成较新的任务。
3. 共享预览两次返回The browser is not producing screenshot frames，标签关闭后改用实际本机Edge；没有将空截图算验收。

## 未完成项与下一步

当前新增的是验收传输，不是架构功能替身。付费调用0、生产配置写入0、部署0，47 HOLD与103实验分支隔离保持。生产浏览器和完整分镜应取得实际输出后再登记通过；全部启用绑定、combined supervisor活动中断、历史v2/新v3混合、新旧Web/Worker双槽及授权上游/目标站仍在全量退出清单。


## 最终固定镜像与独立副本结果

- 产品来源 `d4b6a58bf037bf1be5e2e303de8ad97e5b32e0e7`，版号 `1794680841`，Next BUILD_ID `luEbVgReznI3NJn3ZFcVb`。
- 镜像 `naumi:video-compiler-production-d4b6a58b-20261115`，实际 image ID `sha256:958898f78482ed151e320c7ec013d8546552098ba437440f7c1984a6ba49beeb`；OCI config `sha256:e3afcf6bfa941a3fa6eb6e8e49b7bcc1e2142a1ad7fb945d5e80008dec0b8719`。
- 原Dockerfile完整生产构建exit0；574个tracked Worker输入逐一匹配固定git archive，Worker SHA `e880f3c1cc80d9a4bb2664bcaf0564194f7b05c405a4d71d6092bddfde09233a`。Linux Worker49、核心137、完整tsc通过；三项错误端口/缺owned session/暗中混用browser反控均在DB初始化前退出1。
- 最终解包副本 `final-runtime/run-d0266373-4c53-42ec-9ddc-7abb5a0cf8e7` 的两个实际命令均exit0：生产底座15＋预算10＋Agent6＋RunningHub/AutoDL10＋Workflow13＋ComfyUI8＝62；同一活进程接工作台4＋画布恢复2＋完整分镜10＝16，总78项。
- 工作台实际翻页找到原始历史任务、参数4K而非wire2k、复用参考角色/当前17报价及390px通过；桥接DB快照验证这些操作没有新增任务、供应商POST或账务。画布首次未预热读取、显式account故障后原按钮恢复通过；完整分镜覆盖拆合/17确认/审片/采用/clean fork/陈旧版本409/真实成片/仅一镜返工。
- 该轮22笔364 fixture积分、21次托管JSON创建/25次成片下载；Storyboard新增3任务51积分。fixture成片报价0不代表产品合成普遍免费。Web/应用Worker实际UID1001、媒体UID0/sandbox=true且无DB/settingssecret环境，版本与产品包一致。
- 所有浏览器pageerror0、成功HTTP替换0、React状态注入0；13子进程退出、随机schema删除、pools关闭、relay sockets关闭、容器自动移除。原始失败/abort及相应完整清理回执继续保留，不拼成绿色首轮。
- 真实副本回滚恢复原文件哈希/原不存在状态，显式浏览器端口probe恢复基线FAIL/exit1；原生产入口底座15项仍exit0。修复源和ZIP仍为修改版。没有DB/media回灌或未知任务重放。

这是固定生产包在本机fixture的执行与UI证据，不是目标站上线或真实付费上游。development瞬态脚本解析根因仍未证实；生产首次已测成功不推导所有启动条件均已覆盖。完整三媒体生产UI、更多结构化组合/高级音频、combined活动中断、绑定清单、混合版本/双槽和真实上游仍按全量清单推进。
