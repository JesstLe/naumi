# R6S：原生导演节点整合与 Canvas 视频提交编排

## 来源与目标

独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。原树 `95e08bd11520a51a0cc49791c60721f55fa397dc` 的 4671 文件及原始字节 SHA256 已完整保存并回读。主线来源固定 `2fb3e8d95232db31ac649ba372e1b732e885597c`，8 个增量提交、34 个变化路径，普通 merge 整合。

<span style="color:red">本独立分支超过 48 小时保留是用户明确要求持续整体重构；本轮不合 main、不部署、不接发布锁。</span>

## 职责与依赖

- 保留主线原生导演编辑、Three.js/WebM 编码、原节点工程与输出能力，不用主线旧 Canvas/db 单体覆盖本树。导演节点 schema 归原 canvas storage-schema，由既有 application persistence 组装；repository 保留原 SQL/事务/图锁/CAS，改为依赖实际 pool、snapshot-value、作品和创作权限 owner。
- 导演展示归 scene projection 与稳定 renderer registry；项目归 project-catalog；历史合同/命令归 history-contract/model/controller；复制、删除和项目删除归原 node operations。保留图片／文字 CAS、原回执、共享事务与混合 undo，不复制另一套 inline 逻辑。
- 导演背景连线和输出作为后续输入的转换归原 link command。剪贴板继续原身份/工作空间合同，拖动继续原单 gesture/history owner。
- `video/canvas-draft` 是编辑器与应用共用的已保存节点 draft 合同；`video/canvas-submission` 只编排单任务 receipt 查询、持久化后提交、batch 分流与刷新，不拥有节点、任务、账务或轮询状态。Canvas 保留文档 save/undo 和界面组装；batch/receipt 的原 storage key、原 body、原报价与 idempotency 保持。
- 每次视频提交使用既有视图 epoch/workspace 身份；异步保存后不继续在另一视图提交，受理后即便切走也保存原 task receipt，只停止过期视图刷新。成功 HTTP 响应缺少真实 task ID 时保留原 operation，避免把 `undefined` 当任务编号保存。

## 实施状态与验收

六个冲突路径共 27 个冲突块按 owner 解决，主线正常合入的原函数与新渲染模块保留。原完整树和中间冲突文本保存于 `output/refactor-r6s-20261027`；首次归档观察器未使用 `git ls-files -z`，遇到中文路径失败，原 partial tar 保留，修正后完整 4671 文件回读通过，没有修改产品处理该错误。

实现已进入集中验证阶段。新增原/新视频编排对照覆盖单任务/BYOC/批次、报价与 revision 回调、原 task 查询、预检拒绝/未知响应、原 body 复用、迟到受理回执及过期视图；导演采用主线规则、真实 WebGL 和完整应用 PG/媒体/后续视频测试，在本树重新运行，不引用主线留存 PASS 冒充本次通过。

最终固定源码、core、真实应用、完整 Linux 包、四产物、独立副本回滚与 Git/清理结果随实际运行补录。整体项目目标保持 active。

## 集中验证发现的实际内容身份问题

真实 PG/浏览器验收将保存条件加强为实际 PATCH 200、数据库工程名称和两个关键帧回读，而不是只看按钮短暂禁用。原页面在请求已于 426ms 成功后仍持续显示可保存：数据库 JSONB 的对象键序与 Zod 解析后的键序不同，直接 `JSON.stringify` 比较把相同工程误判为脏。

工程模块新增窄的 `directorProjectFingerprint`，只忽略对象键序，不忽略任何值或实体／关键帧数组顺序；编辑器的 dirty、缓存清理、历史去重和保存比较共用这个工程内容身份。没有改版号、放松字段验证或增加自动保存。主线原编辑器精确 blob 的真实 React/WebGL 反例已经复现；新版增加重排键序后的保存清洁、真实内容变化与数组顺序变化的回归。完整应用同时核对真实 JSONB 键序、实际保存回执和导出控件恢复。

开发模式首次浏览器发生 layout chunk 冷加载超时，原日志保留；验收器现先实际读取 SSR 与入口 JS/CSS 完整字节，再启动浏览器，不 mock 路由或静默重试失败导航。首次 warm 脚本重复变量名、首次观察器未标记画布来源，以及 Windows 原 db 兼容面换行／索引 stat 的修复均单列为准备问题；原 db 文件 SHA256 已精确恢复并刷新索引，没有恢复旧单体。

## 回归夹具的真实依赖修正

旧 history verifier 提取真实 Canvas 接线，但没有提供新增的 director document port；已绑定空 director 文档，原 67 类／184 检查全部保留，没有删旧断言。剩余原 13 项业务／Worker 入口也单独批量通过，随后仍以统一固定源重新集中验收。

集中执行中固定 54989 端口被另一个工作树的真实 Next 进程使用；未停止、复用或覆盖它。既有 ModelManagement UI lifecycle 改为每个 run 分配自己的回环临时端口，把同一 origin 同时传给原 fixture 和 11 个真实 UI checker；手工独立 fixture 的旧默认入口保持。原 runId／IPC／源码字节副本／独占目录锁和自有进程清理不变。50 项实际子进程检查验证成功、checker exit7、启动失败、超时以及已有 fixture／外部监听者不被修改。

真实 Next/PG 验收已在新分配的 63353 端口启动并取得管理登录、页面和配置 API 回执；第一轮 UI 在 5073ms 冷 API 返回前触发旧 5 秒断言，保留原失败。该脚本原来调用 `expect.configure` 却没有使用返回实例，现按其既定 45 秒等待意图使用实例，不改变页面、API、权限或业务断言。实际最终结果继续按运行记录补录，不把端口连通当整个 UI 验收通过。

## UI lifecycle 最终实测

`MODEL_UI_PORT_CURRENT_GUI_RUN.json` 已取得实际 Next／隔离 PG／浏览器的完整 `ADMIN_MODEL_MANAGEMENT_BROWSER=PASS`，exit 0；runId 为 `4f138f4b-d6dc-4a81-9cb2-36d294b110eb`，自有回环端口 62016，`CHILDREN_CLOSED=1`，供应商付费调用 0。源工作树配置不执行恢复写入；fixture 现尊重 runner 传入的短 `.next` 路径，手工默认仍保留。

此次完整复测还校正了旧验收的实际合同：从“生图模型”行打开选择器而不假设当前默认名称，仍检查管理员改名选项、家族选项、无积分菜单和实际 7→8 积分报价；分辨率弹窗与恢复按钮使用当前可见名称；旧 4K 显示圈定拒绝改为检查已实现的 requested=4K／effective=1K 报价回退，不恢复 409 拦截；网站版本检查加载 bundle 的版本、公开版本 API 及更新／离线／回滚／刷新，不再要求当前 UI 已移除的内部 commit 文案。原跨路由 operation、未知发布恢复、RSA 来源注册、工具范围、非管理员 404 和移动端无溢出断言全部保留。

各次冷启动、旧选择器及旧弹窗预期失败逐次留存，未改写为通过；最后一轮完整运行才作为本项通过证据。失败时增加自有页面 HTML／截图留证，只在错误分支执行，不吞原异常。接下来的统一 core、最终类型／结构、完整 Linux 包和回滚仍使用固定源码集中封版。

## 固定源码集中封版

应用及全部验收输入固定为 `231d6930b681fb296a0acd7ca834bcd2b25c8800`，完整字节摘要 `e28593b8cf74489e0c360b1a5d4f705e2d39522ccb356cecdd4693502773528a`。以下不是旧批次拼接，均为本次固定源实际结果：

| 层次 | 实际命令与结果 |
|---|---|
| 统一 core | `node scripts/verify-refactor.mjs --expected-sha 231d6930b681fb296a0acd7ca834bcd2b25c8800 --out output/refactor-r6s-20261027/core-delivery`；57/57，failed=0、notRun=0，exit 0 |
| 类型／lint | `node node_modules/typescript/bin/tsc --noEmit --incremental false` 及定向 64 文件 ESLint；均 exit 0，精确 lint 参数在 `LINT_DELIVERY_RUN.json` |
| 本片定向 | 视频 baseline 30 类／110 检查，新版 30／121；导演 owner 旧 5／新 34；导演纯规则 30。原实现控制只投影对应 Canvas 函数或主线编辑器叶文件，不称完整主线 A/B |
| 导演真实应用 | 原 HTTP／PG／React-WebGL／媒体／scheduler 与钱包；混合复制删除恢复、CAS 一方成功、原回执重放、PNG／WebM、真实 JSONB 内容身份通过。新视频 client 丢失已受理响应后只查原任务；单张及批次 client POST 恰好 2、模拟供应商 create 恰好 4，真实付费供应商调用 0 |
| Linux 完整包 | `node scripts/verify-refactor-image.mjs --expected-sha 231d6930b681fb296a0acd7ca834bcd2b25c8800 --out output/refactor-r6s-20261027/image-final`；正式 Dockerfile 完整 Web／Worker／原生媒体包通过 |
| 同镜像运行 | `python scripts/verify-refactor-runtime.py --image-manifest output/refactor-r6s-20261027/image-final/BUILD_RESULT.json --out output/refactor-r6s-20261027/runtime-final --suite runtime`；125 检查，实际登录、提交、原 Worker、原 6/current17、未知不重放、原生 FFmpeg 与 POSIX 排空 exit 0 |
| 同镜像产品浏览器 | 同一脚本 `--out output/refactor-r6s-20261027/browser-final --suite browser --soak-seconds 60`；36 检查、双独立登录上下文、route mocks=0、确认弹窗=0；7 份预期生成、7 笔合计 42 fixture 积分，无刷新增扣；exit 0 |

完整镜像 ID：`sha256:f79ab280bc537470c44e5593e935932c758a07ff1cb50e224dacf13aa707a119`。运行及产品浏览器各自的容器、网络、PG tmpfs 已清理，最终镜像保留。管理 GUI 与 core 的非文档输入逐文件相等；本次文档跟进不替换产品代码或验收输入，绑定见 `GUI_SOURCE_BINDING.json` 和最终 `SOURCE_BINDING.json`。

结构核验：原 `db.ts` 字节精确保持、1858 个未触及产品文件 SHA256 保持、8 个主线 repository/service 函数正文保持、139 个原 Canvas 函数保持；新增完整导演能力并移出视频编排后 Canvas 5586→5626 行。两个新增数据表来自本轮主线原生导演能力，额外表／平行任务引擎／平行计费引擎均 0。静态、全 import 及编译擦除后两类 SCC 均 0；原两条 release fixture→Route 和一条 billing client→toast 反向边继续单列。唯一未解析源码目标是构建生成的 `dist/worker/application.cjs`，完整镜像 manifest/hash 与实际 Worker 运行另有通过记录。

原始 4671 文件完整归档、精确补丁、四产物、独立副本回滚及恢复后原行为、最终提交／远端和自有 PG 清理以 `output/refactor-r6s-20261027/DELIVERY.json`、`VERIFICATION.txt` 为最终证据；所有中间失败保留，不改写成通过。本轮不合回 main、不 SSH、不发布、不操作部署锁。整体重构目标继续：Canvas 其余 UI／助手编排、剩余跨模块依赖和实际容量／最终整合尚未由本片闭合。
