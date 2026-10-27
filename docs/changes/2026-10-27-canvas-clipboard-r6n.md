# R6N：Canvas 剪贴板会话与协议

基线 `967c065cbb9211df7c1799b3d2a103c105377ffd`；独立工作树 `E:/Workspace/naumi-refactor-20261024`；原 4585 文件 hash/完整归档在 `output/refactor-r6n-20261027/`。

## 实际职责收拢

- `node-clipboard.ts` 拥有原 custom MIME、HTML marker、标题转义和持久选择记录规则；24 组原 wire/HTML 字节合同保持，原 200 项结构校验未加码。
- `clipboard-browser.ts` 只拥有 ClipboardItem、HTTP/权限失败回退和 PNG 转码，释放实际 bitmap；会话失效或后续复制取代旧尝试时不继续异步回退、不弹成功提示。
- `useCanvasClipboard` 唯一持有单图/混合选择、复制意图以及 copy/paste/storage 监听。账号/工作空间切换同步替换内存；个人原 key 不改，新租户记录带明确 workspace 并隔离。旧 owner-only 记录继续交原复制 API 做权限核验，不因这次迁移抹掉历史复制能力。
- 新 tab marker 会读取新记录而不是永远被旧内存挡住；storage 事件同步当前 tab；单图和选择复制的 intent 都会过期，避免后续普通网页复制被接管。
- workflow→image files→internal node 的原粘贴次序保持；输入/助手/modal/只读/加载/浏览状态保持；文件、工作流和节点变更分别调用原 importer、node operations 与 history，不新增 writer/生成/账务框架。
- 真实产品发现混合工具条依赖 `text-` 前缀，而已有 HTTP/text repository 接受不带前缀的合法 ID。改为按实际 text records 判断混合选择及文字批次；保留 `r6c-text` 原测试 ID，不改夹具掩盖缺陷。

## 固定源码与集中验收

被测应用提交 `a8a3707948d7b5a9f15768590c66e77eda0859fc`；最终仅文档提交分层绑定。

| 边界 | 实际结果 |
| --- | --- |
| 原源码控制 | 22 组、123 检查，24 组协议字节；复现旧 EMAIL_ONLY、NEWER_TAB=IGNORED、EXPIRED_INTENT=TAKES_OVER、OBSOLETE_FALLBACK=WRITES、BITMAP=OPEN；exit 0 是旧行为复现，不是缺陷关闭 |
| 新版实际 React/Edge | 相同 22 组、124 检查、24 组字节保持；ACCOUNT_WORKSPACE、READ、NATIVE、NONE、CLOSED；真实 DataTransfer/ClipboardEvent 与图片解码，OS clipboard transport/业务落地端口明确控制；exit 0 |
| 模型原规则与真实类型 | 44 检查，原结构判定和旧 200 边界保持；合法非 text- 前缀混合选择旧 false→新 true；无 IO |
| 结构 | Canvas 6083→5868 行，11 个内联函数由三个新 owner 取代；153 非目标原函数声明保持，除 Canvas 外原 src/services 1859 文件 hash 保持，新 writer=0；静态及类型擦除后全部 SCC=0 |
| 类型/相邻 | 全项目 tsc exit 0；lint 0 error，原 warning 8→7，原 readGenericNodeClip warning 随 owner 移除；输入3948/3925矩阵、原交互34/92、edge、palette15、工作流粘贴与runner12/75通过 |
| required core | 固定应用/source digest，34/34，failed=0、notRun=0；clipboard static 接入原 runner，不另建框架 |
| 完整 Linux 包 | 原生产 Dockerfile、完整 Web/Worker/媒体包，固定镜像 `sha256:f523d6b327b3097b504b91073fc4ba05f3b2dd1f6f9c97735e5f72d2cfb5eb32`；源码 digest `7f373283a678ffb6aba6be33931cae0becebaf4ea540879b43f9654de3ce2dad` |
| 同镜像真实产品浏览器 | 27 组，包括本轮6组：真实文字菜单复制、刷新原marker粘贴、原ID undo/redo、实际混合工具条、同一历史步骤恢复图片/文字、原PG记录与账务保持；只2次有意copy POST，undo/redo不再POST copy，无额外supplier/consume；OS clipboard write被页内transport记录，未改操作者剪贴板，未mock业务HTTP |
| 混合业务 | 同轮原双浏览器图片/文字冲突、两图两笔12积分/确认0/异常0；配置60秒混合读取，5轮；报告99.4949216秒从soak起点算起，包含后续剪贴板阶段，不当作99秒纯读取压测 |
| 完整运行 | 同固定Linux Web/Worker、真实PG/登录/原价/交付账务/Canvas CAS/工作台/FFmpeg/排空125检查通过；原6/current17、UNKNOWN不重放，POSIX排空exit0 |

这是本轮局部职责的完整候选验收，不是10万用户容量或生产验收。

## 原始失败与清理

- `MODIFIED.log` exit1：浏览器fixture未给既有CDN模块的 Next-public env，导致 `process is not defined`；补空CDN define，未因此改产品。
- `BROWSER_IMAGE.log` exit1：调用命令误用node执行Python入口，未启动运行夹具；改正确解释器。
- `BROWSER_IMAGE_FIXED.log` exit1：前三组真实复制/刷新/undo-redo已过，混合工具条缺失；页面截图确有两个已选节点，根因为实际代码按ID前缀猜类型。未改原ID，已修产品并在sealed完整包6组通过。
- 旧 `CORE_COMPAT` 是收到该页面发现后有意停止的自有旧版本验证，不记绿；PID/命令与停止输出、原report保留，最终固定源码的 `CORE_SEALED` 独立通过。对停止可能遗留的自有随机测试schema，仅在无其它连接、精确自有PG身份核对后按最终枚举处理，见CLEANUP；原停止回执不改写为PASS。
- 旧 d6a44194、5e929085 镜像/结果仅作阶段证据，最终以 a8a37079 sealed 为准。Windows dev解析债务沿上轮继续，本轮未重跑、不冒充关闭。
- 自有PG、两轮运行夹具容器/网络/连接均以 `CLEANUP.json` 为准；其他资源不操作。

## 交付与后续

四产物、完整4585原hash与独立副本回滚、恢复后123项旧行为、补丁精确应用、最终Git/远端匹配见 `VERIFICATION.txt` 与 `DELIVERY.json`。实际工作树保留新版。

本轮是上次main同步后的第2模块；开工fetch固定 main `bc6af06d5ba27b316efd5c3571f31b891b85fa9c` 还有12条未整合提交（参数计划、Agent会话/执行证据、提示词优化），未把它们写成已包含。下一模块前先普通整合这批main并迁到真实owner，之后继续收拢Canvas选择事实/外围会话；整体active，不合main、不部署。

🔴 长线分支超过48小时：用户明确要求独立工作树持续整体重构、最终交付完整重构版本；目前仍为未完成整体验收的长任务，而非已完成的短期生产修复分支。已按迭代持续整合main，最终合回/发布仍单独验证，不以模块完成冒充整体完成。
