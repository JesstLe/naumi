# R9O：计费浏览器验收跟随真实模块边界

## 模块与职责

继续整体重构的主线整合收尾。基线 `983e257f7a699c53e5f31d3e34c13eb1b836a3d5` 的 5,358 个源码文件按原始字节冻结；本轮不修改产品模块。原账务、任务、报价、权限与 UNKNOWN 的状态归属保持不变，浏览器驱动只拥有隔离夹具、真实应用进程、验收与证据。

## 观察与原始失败

远端同 SHA 的 Core 已 SUCCESS，Image 完整构建、账务事务组、business routing、注册模型组已通过，在 Billing admin browser acceptance 步骤失败。远端 job/annotations 已留存；日志 blob 的 TLS EOF/ECONNRESET 仍保留，未取得远端内部唯一失败栈。

本机以该 SHA 的完整 Web/Worker 构建、真实生产 standalone、固定 Chromium 和随机 schema PG，实际运行原始 15 项：7 PASS / 8 FAIL / exit 1。原输出与页面 error-context 均保留，不改写历史失败。

- 后台导航已经分为主分类和模块功能；旧验收仍找“数据概览”“接口与站点设置”等旧主导航。
- `section=wallet` 现在明确打开充值商品；业务定价测试必须进入 `section=prices`，不能因此把产品钱包重新改回定价页。
- Canvas 视频采用实际可访问的 region dock，旧用例仍找 modal dialog。
- 助手已返回 partial 文本时不恢复待发送草稿，避免把已执行请求当新任务；旧用例同时要求 partial 和可重新发送。原意图无文本失败的显式重试仍需保持同 turn/body/operation。
- 原“current 改价后提交应 409 并改用 8 积分”的断言违背冻结服务器报价合同。本次首次基线因更早的定价入口错误未到达此断言，不能称已在该运行中复现其 409 差异。

## 实现与依赖

1. 保留原 15 个业务目标，按当前可访问入口测试管理导航、钱包、价格、发布冲突、恢复及访问验证。只修用例与夹具，不恢复旧业务限制。
2. 原改价用例加强为真实浏览器原报价 6 / current 8 的实际提交→PG 任务→loopback 供应商真实 PNG→原任务 GET→作品/媒体→一次 6 积分账本；仍覆盖管理员冲突草稿与版本恢复。原 90 秒用例时限不变，不用 mocked 200 代替付费任务链。
3. 新增独占 loopback supplier，由现有 UI 驱动拥有并清理。它不代理外网，只记录方法、路径、模型与数量，不记录密钥、提示词或图片正文。使用异步子进程以保持供应商 HTTP 服务能响应，不新增产品执行器。
4. 无文本错误的三次显式重试保留同一身份断言。新增 partial 场景：保留 partial、输入为空、重试禁用、只用原 session 的 GET 历史恢复，POST 总数为 1。
5. 驱动留存应用 stdout/stderr、Playwright JSON、失败截图和原始退出码；工作流 always 上传明确证据路径，不上传含签名 cookie 的 `ui-fixture.json`。原超时、重试数和单 worker 预算不提高。

## 验证与退出条件

完整 modified 浏览器模块、类型/lint、独立副本回滚及源码 hash 校验完成后，在本节补实际结果。完整新 head CI、main 普通整合与线上状态分别验收；当前未合 main、未部署，47 HOLD，整体目标 ACTIVE。

初次本地完整构建的 Web/Worker 编译已通过，但原 SDK 的 node_modules 软链接位于 Next tracing root 外，package verifier 正确拒绝 pg；该夹具布局失败原样保留。改用物理 node_modules 的同预算完整构建与包校验已 PASS，没有改生产打包规则。

本轮浏览器辅助驱动第一次因 `baseline` 同时被用作原源码副本和结果目录而在启动前退出 1；原源码未改、PG/浏览器未启动。结果目录改为 `baseline-run`，不通过覆盖原始副本解决。

首次 modified 的 16 项得到 13 PASS / 3 FAIL：钱包链接同时出现在两个导航内导致 strict locator 冲突、自动比例故意只提供 display price 而非 executable quote、新增历史案例使用了旧按钮名称。按实际导航作用域、用户明确的 1:1 比例和“项目对话记录”按钮修正，没有伪造 quote ID。

第二次完整 16 项均 PASS，但 driver **exit 1**：原 cleanup 未先删除 owner 绑定的真实报价，删除 synthetic account 时触发 23503。外层隔离 schema/容器仍完成清理；这次记录不写成整模块通过。修正只让夹具按子记录→账号的顺序清理，生产外键不改。JSON reporter 路径同时明确到 cwd 的 output，避免配置目录相对解析导致 CI 漏收。

## 最终本机模块结果

最终单次完整 modified：**16 PASS / 0 FAIL / 0 SKIP / 0 FLAKY，driver exit 0**，实际 app、PG、Chromium、loopback supplier；随机 schema、应用与夹具连接、UI/PG 容器和内部网络均完成清理。JSON reporter、应用日志、supplier 摘要与冻结原价证明均实际读回。

原价证明：原 6 / current 8 / 结算 6；browser paid POST 1、supplier image POST 1、consume 1、native dialog 0；原任务 GET、PG 的 `billing_settled`、作品行与媒体 PNG（1024×1024 / 5353 字节 / SHA-256 `b04e44f8f7123ad9b6a95afeb8c4f75b63c29d58cd896e803f5a4ef282ef96e8`）一致。partial 新案例实际沿原 session 读取历史，POST 仍只有 1。

最终集中非增量全项目 TypeScript 与本模块 lint 均 exit 0。2,142 个产品文件原始 SHA 全部与基线一致。本轮只改 5 个既有验证/工作流文件，新增 supplier 夹具与本记录；不把本机通过代替新 head CI、main 合并或上线。四件产物、完整命令与独立副本回滚的最终回执在 `output/refactor-r9o-20261101/VERIFICATION.txt` 中逐项记录。
