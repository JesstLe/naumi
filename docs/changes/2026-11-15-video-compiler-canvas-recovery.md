# 视频编译验收：画布项目读取失败后的恢复

## 模块与职责

基线 main `19b9c8835687a27aeaf82d704847dec76f836857`；独立工作树及分支 `codex/video-compiler-canvas-cold-start-20261115`。本片处理实际分镜验收遇到的画布读取失败后恢复，不改变视频编译/计费/素材权限规则。

## 调研结论与已确认问题

1. `?project=` 由导航 owner 发起作品和文字文档刷新，成功后记录 `requestedProjectReady`。初始刷新失败后，实际“重试同步作品”只调用作品文档 retry，不更新导航凭证。因此数据可以恢复，原项目仍无法打开。实际 React hook 加实际 Canvas JSX 重试控件在基线稳定输出 `READY=false ACTIVE=null`，不是把超时直接归因为缓存。
2. 文字文档 `load()` 用 `false` 表示失败；组合刷新原本只等待 Promise，错误地把 false 当作成功。现在由薄组合入口检查结果，文档仍拥有具体错误和恢复状态。
3. 原导航凭证按字符串请求键存储；同一 owner 的项目 A→B→A 可以重用已经完成的 A 凭证。现在每轮请求使用身份 token，账号/工作空间/项目变化及其 ABA 都需要本轮读取；晚到结果和旧重试闭包不得开启新视图。
4. 旧 `verify-storyboard-independent-ui.cjs` 实际基线错误为 `process is not defined`，不是产品编辑器没有方案。独立 esbuild 页面没有 Next 的 NEXT_PUBLIC 环境内联。只补齐该受控构建的空环境对象（认证及品牌公开参数采用原默认值），不修改产品 Supabase 实现、不伪造读写响应。

## 公共接口、依赖方向、状态归属

- `useCanvasProjectNavigation.retryRequestedProject()` 重用既有文档刷新端口；同一请求并发重试共享一次读取。成功凭证绑定当前 owner、工作空间 revision 和请求 token，失败不产生凭证，没有后台轮询或无界自动重试。
- Canvas 的作品/文字错误按钮，在项目读取尚未完成时调用同一导航恢复入口；普通已加载项目仍使用原文档的定向恢复。ID 同步不扩成账号全表读取。
- 导航只管理视图和本轮刷新凭证；作品/文字文档继续拥有数据、读票据、错误、草稿、冲突和历史。未放松账户/工作空间隔离、素材归属、403清图或任务冻结。

## 验证与证据层级

原始命令和回执保存在 `E:/Workspace/naumi/output/video-compiler-canvas-cold-start-20261115`，最终四产物的 `VERIFICATION.txt` 记录固定文件哈希、基线/修改/副本/回滚结果。

新增用例注册到既有 `refactor-cases.mjs`，沿用runner的独立证据目录与客户端React条件；runner自测33case/465检查通过。新增实际 React/实际 Canvas 组合读取及按钮回归覆盖失败不授权、原项目重试、账号/项目/工作空间 ABA、退休命令/晚完成、文字 false 及并发重试。实际 Next 驱动分别覆盖首次 fresh context 和显式中断 account GET 后点击原按钮恢复；只有故障输入中断请求，成功响应不替换、React状态不注入。完整分镜十项另行运行并由原桥接 finally 关闭子进程与隔离 schema。

## 未完成项与下一步

初始 development 首次浏览曾仅出现“加载画布…”及 `Invalid or unexpected token`；后续未替换网络的新 context 实际成功。该瞬态的具体脚本/字节根因仍未证实，不用本片恢复修复、暖路由或更长等待宣称其已消除。当前验收不替代新的固定生产镜像、生产浏览器、combined supervisor 活动中断、新旧版本双槽、实际付费上游或目标站发布。

总目标 ACTIVE；47 HOLD、103实验分支隔离保持，生产配置写入0、付费0、部署0。


最终独立副本 `copy-runtime/run-76459d7d-e27b-4929-ac97-c287a0ba5161`：14项实际进程底座、2项实际Canvas读取/故障按钮恢复、10项完整分镜，均退出0；实际Next/隔离PG/独立Worker/真实解码，5子进程退出、随机schema删除、pool关闭，浏览器错误0。Storyboard新增3任务/51 fixture积分，累计6笔92 fixture积分。副本首轮仍有脚本解析错误，次轮有account 20秒abort；失败原回执保留，最后稳定路由fresh context两项与完整分镜通过不升级为冷启动根因已修复。未借延长20秒产品超时或削弱缓存scope规避问题。

原项目重试和项目ABA均有独立基线失败、修改成功及最终原字节回滚重现；原导航30项回滚仍通过。原导航30/Assistant17case95/作品26case49/缓存20/核心137/完整tsc及独立版UI6项通过。四产物保留8路径，包清单同时核对Git基线存在性，新增文件回滚删除、修改文件逐字恢复；工作源及修改ZIP仍为修复版。
