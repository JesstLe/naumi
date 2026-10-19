# 47 画布精确比例修复

## 原始证据
线上 SOURCE_COMMIT=1852b21c，config117。2026-10-19 09:18—09:27 的五张作品，冻结请求3:4，实际1024×1536/2:3；原图PNG解码证实。`sizeFor`把所有竖图映射成1024×1536；无静默裁切逻辑保留返回像素，入库标签按真实像素重算，因此不是前端选项未提交。

## 契约研究与实现
- 官方 Images generate API 当前声明 GPT Image 2 / 2.5 接受 WIDTHxHEIGHT，边长16倍数；文档 https://developers.openai.com/api/reference/resources/images/methods/generate 。
- 当前供应商文档 https://docs.geeknow.ai/api-reference/images/gpt-image-2/generation 说明size传实际目标像素，有1536x1152等三档以外尺寸。
- 精确型号白名单用3:4→1152x1536，4:3→1536x1152，9:16→864x1536等；旧模型保持原契约，未知精确比例不静默降级。
- 新受理请求由服务端设置ratioContractVersion=1，写入持久payload；imagegen父plan也冻结版本，旧父任务尚未创建child时仍传递旧契约，不借重启升级旧任务。实际wireModel决定能力，不依赖前端别名。
- 新画布请求结果对比真实尺寸，一像素舍入容差；不符时原图/账务保留，沿用imagegenOutputError回执。images/error原子checkpoint，查询/恢复不重提收费调用。
- 不增加裁切、拉伸、隐式补边；不改用户提示词、前端位置、配置版本与后台未提交UI。

## 状态
独立worktree codex/canvas-exact-ratio47-20261019，基线main f4bf7935。单元62项、隔离PG+真实HTTP handler 14组合（7比例×文生图/图生图）、错误比例保留原图及已结算账务、Worker恢复零重放、旧父plan无版本恢复保持1024x1536、直接ratiogen1152x1536通过；共18次回环fixture响应，真实供应商0。原画布480组合/90原始请求拒绝/5路由、imagegen19工作流/意图测试通过，全量TypeScript通过。错误回执同正常回执过滤内部execution审计字段。完整Linux构建、回滚材料和发布状态另记最终VERIFICATION。历史MIGRATED_CLEANUP_PENDING事件保持，不能用新发布覆盖旧事件。

## 当前通道实测与发布前置
2026-10-19 10:23 使用合成参考图，真实geeknow gpt-image-2 `/images/edits`，size1152x1536、low、n1，HTTP200；原图1152x1536/1067265字节，SHA256 `ea4975ba87f852d4e208ee1766f0aeb481f8e398f1ee4753c1738baf9a9b0da5`。未重放任何用户任务，未改在线模型配置。
先前一条独立generate探针使用未接现有代理的fetch，报fetch failed、未取得供应商回执，按受理未知保留marker/receipt且不重试；不记为生成通过。edit探针按现有已批准代理配置发送；两次工具依赖初始化失败均在提交前，未增加调用。
10:30只读发布基线：7运行容器、Web/Worker仍1852b21c，MemAvailable3825MiB、Swap0、磁盘80%/14GiB；current revision74/blueGreenSuccessor COMPLETE，根历史MIGRATED_CLEANUP_PENDING保持。协作线程确认无本线程窗口/候选，但无已验证的常规后继执行器；旧controller硬编码revision40/旧槽/上一轮目录和已消费successor，不能直接重跑或删状态绕过。未持三锁/未创建47候选/未切流/未重启Worker。
