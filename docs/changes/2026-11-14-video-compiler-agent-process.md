# 视频编译器：真实 Agent 与远程工作流进程验收

## 模块与职责

- 基线：`daaf24f384eb3a650056a0ebd866f665f6b71c9e`，独立工作树 `naumi-video-compiler-integration-20261114`。
- 本切片补齐 [RFC](../architecture/2026-11-14-video-compiler-rfc.md) A10/A11/A14 的真实进程证据，不改变编译架构、产品校验、协议、售价或生产配置。
- `video-compiler-agent-process.ts`：可流式返回工具调用的本地文字供应商，以及实际 `/api/agent` 验收驱动。仅替换上游模型；运行时、Harness、报价、正式工具、签名内部 HTTP、持久任务均使用产品实现。
- `video-compiler-remote-workflow-process.ts`：RunningHub/AutoDL 的本地 HTTP 协议对端和真实 Web→独立 Worker 验收。仅发布隔离 schema 的显式 `workflow-video` recipe，不按型号推断能力。
- `verify-video-compiler-process.ts`：组装现有真实 Next dev、独立应用 Worker 生产 bundle、媒体 Worker、随机隔离 PG schema；新增 `--agent-process`、`--remote-workflow-process` 两个可选模块。

## 公共接口、依赖方向与状态归属

测试驱动只通过实际用户 HTTP 写入产品状态；数据库用于观察回执、资产、账本，及沿用主驱动已有的轮询到期/独立 Worker 控制设施。Agent 不直接调用工具或 Route 导出。远程协议不直接执行编译器或任务服务。

文字对端只实现 OpenAI 兼容 SSE，含分片 `tool_calls` 和工具结果后的终止文本。它不是 LLM 创作质量证据。运行时继续拥有 Harness 许可、报价预检和会话持久化；任务模块拥有冻结计划、原操作幂等、UNKNOWN 与账务；媒体模块负责真实字节和解码。

## 实现与迁移状态

### Agent

1. 显式管理文字通道和 `agent.text` 绑定，凭据进入隔离加密库；不使用真实 LLM。
2. 真实 `/api/agent` 提交普通图片生成、来源视频编辑和续写；旧 `mode=text`/能力0不额外否决，保留输入事实驱动。
3. 观察受理时 v3 prepared、原始4K/有效2K、当前17积分报价、供应商尚未创建；独立 Worker 落片、父子资产和单账本。
4. 同一会话新一轮重试原 operation，恢复原任务，不新建、不额外提交。
5. 缺来源视频、显式 text 携带素材、未映射参数均在正式预检阻止，任务/供应商零增量；结构化错误从实际公开回执读取。
6. 实际 SSE 模型请求、持久会话及跨用户读取拒绝分别观察。

### RunningHub / AutoDL

1. `workflow-video` 预览无任务/预占/账本/上传/供应商副作用；受理计划摘要与预览相等。
2. RunningHub 真实 multipart PNG、凭据表单、`nodeInfoList`；AutoDL 真实签名地址经 Next 素材路由读取原始PNG hash。
3. 受理后修改隔离实时工作流ID，执行仍使用原冻结工作流及凭据。
4. 独立 Worker 取得原回执后 drain/restart，再 poll 原身份、解码 MP4、落资产、结算一次。
5. prepared取消不发送；显式 retryOf 是单次新操作，原重试编号不重建。
6. 创建连接断开进入 UNKNOWN，禁止显式重试和重启重发。

### 测试构造修正

原主驱动通过替换固定位置为 `X` 构造坏签名；该位置本身为 `X` 时，请求没有变化，可能把合法200误报为鉴权失败。本次开场基线实际遇到200≠404；改为原字符为X则替换Y，否则替换X。产品 token 校验没有修改。

首次新增 Agent 驱动用了不存在的观察列 `history`，真实操作均已完成后观察SQL失败；修正为已有 `messages` 列，并从正式工具步骤读取错误码，而不是假设模型收到内部错误码。失败原始记录保留，不解释为产品回归。远程工作流驱动也曾遗漏必填 draftRevision，被产品准确拒绝422；之后按现有结构补齐。另一次把 AutoDL 的原生 raw Authorization 误写成 Bearer 断言；核对 direct/wire-adapter 后修正测试断言，产品鉴权不变。

## 验证与证据

证据根目录：`E:/Workspace/naumi/output/video-compiler-agent-process-20261114`。命令、输入、原始逐字输出、退出状态、独立解包与回滚结果由 `VERIFICATION.txt` 和 `COMMANDS.json` 记录。

集中运行：

```powershell
$env:NAUMI_VERIFY_ISOLATED_DB='1'
$env:DATABASE_URL='postgresql://postgres:video_compiler_local_fixture@127.0.0.1:15579/video_compiler_fixture'
node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-video-compiler-process.ts --projected-worker-env --agent-process --remote-workflow-process --workflow-process --byoc-process --browser --canvas-browser
```

最终独立解包组合 `copy-runtime/run-14eb3aee-d67b-4625-96c1-c479aa90c66a` 已完整通过65项：底座14、工作台4、Canvas10、Workflow13、ComfyUI BYOC8、Agent6、RunningHub/AutoDL10，exit0。真实fixture账本20笔/330积分，Agent新增3笔51、远程协议新增4笔68；付费0。12个自有子进程均退出、两个浏览器上下文关闭、随机schema移除、pools关闭。核心137、App138、Worker44和完整TypeScript亦通过。独立回滚副本恢复六个原始路径哈希且Git干净，原14项真实进程和137项核心检查通过。源文件与修改包保持修改状态。

一次独立副本在Agent/远程协议30项通过后，工作台浏览器冷加载报 `Invalid or unexpected token`、未水合；原始BROWSER_FAILURE与退出1保留。源工作树相同Agent→工作台顺序复测24项通过，尚未据此断言冷加载原因已修复。浏览器观察器仅追加错误stack字段；最终独立副本使用新的显式 NEXT_DIST_DIR，避免沿用历史开发缓存，错误仍按原逻辑使验收失败。最终使用独立缓存的65项组合已通过，pageerror0；该结果不证明原先一次冷加载异常的原因已经修复。固定生产构建仍待独立验证。

## 未完成项与下一步

- 总目标仍 ACTIVE；本切片不是完整 RFC A01–A19 退出。
- 实际 Canvas 上传/连线/提及等价、真实 HTTP 冻结预算确认、完整 Storyboard 编辑/审片/成片、全在用及 env-only 通道审计继续。
- 固定生产 Next 构建、Linux combined supervisor 活动中断、历史v2/新v3混合 Web/Worker、排空回滚与目标站蓝绿仍单独验收。
- 本地脚本模型与视频供应商不代表付费上游质量或生产成功率。付费调用0、生产配置修改0、部署0；47 HOLD 保留。
