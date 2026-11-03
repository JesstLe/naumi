# 十二张工具故障截图：逐项排查与修复

## 基线与执行归属

- 用户要求“排查图示问题，若有则修复”，输入 12 张截图。图片原文件及 SHA-256 位于 `E:/Workspace/naumi/output/tool-screenshot-fixes-20261102/INPUTS.json`，原图未修改；放大裁片仅供读图，不作为增加像素后识别到新事实。
- 初始主线 `ca63c76fa0f8c87ae404ad500ca65f71b064e62e`；开发中普通快进整合 `cc830f931a9c0d32810cd8d16764b71c54254fc8`（同事的选中图片像素尺寸显示），收尾再次快进 `d97e989da5190cafb819aa997b246bd3be420614`（该功能部署文档）。最终封存 baseline 为 d97e989d，未夹带同事文档作为本任务变更。本轮独立分支 `codex/tool-screenshot-fixes-20261102`，复用上轮已结束且干净的隔离 clone，不切换共享脏工作树。
- 103 模型映射及其继续编辑实验保持隔离，不复制其实现、不反向合入 main、不操作 103。本轮对 47 仅进行两次只读状态/聚合查询，没有生成、任务 poll、数据库写入、发布、重启或锁控制。
- 截图缺少原 operation/job、用户与时间，低分辨率错误小字部分不可辨。以下“已确认”是同类当前代码缺陷的真实复现；不冒称所有历史截图都已关联到确切原任务。

## 十二项清单

| 图号 | 工具与截图现象 | 已核实原因／处理 | 验收状态 |
|---|---|---|---|
| 01 | 去水印：服务失败，界面称扣费完成 | `settled` 被误当正数成功扣费；失败回执未保存；成功 early settlement 也缺紧凑回执 | 失败/成功两类分别修复，原 operation 精确回放 |
| 02 | AI 抠图：原生 JSON 解析错误 | BillingProvider 读到坏/截断响应后仍把原 Response 交给页面 `json()`；原失败/0 记录被误说成扣费完成 | 坏回包保留原 intent；历史明确失败按真实账务返回，原 cutout 成功恢复保留 |
| 03 | 爆款复刻：提交报错 | 共用 preset 质量重新读全局旧档位，可能覆盖冻结报价；成功回执和未知费用需分别处理 | 冻结质量修正；已有 hold/unknown 不重放、不退款推断 |
| 04 | 图裂变：Nano Banana 报“输入与原报价不符” | 报价后两层方向别名二次路由；auto 显示估价被当方形执行报价 | 两层保留服务器冻结模型；auto 走既有 deferred-frame 契约 |
| 05 | 抠头像：不可用，称扣费完成 | 与 01 的财务终态误报和成功回执窗口相同 | 共用严格回执修复，非按时间猜作品 |
| 06 | 变清晰：服务未配置 | 现役 47 未配置该 route 使用的专用超分处理器；旧目录仍允许点击，并在查配置前预占 | 目录准确 unavailable、按钮有原因，后端配置前置到报价/预占前；**专用超分服务仍待配置，未称真实超分已恢复** |
| 07 | AI 融图：Nano Banana 不可用 | 实际 ratio 未进报价、执行换方向模型；已受理后 GET 断流还可能丢失原 job | 报价身份已修；原 job 读取恢复由相应模块集中验证 |
| 08 | 产品换色：报错 | 共用 preset 质量和失败账务回执问题成立；截图没有足够信息认定是颜色值解析错误 | 不改已有效 HEX 行为，修共性执行/回执链 |
| 09 | 风格转换：报错 | 共用 preset 质量和同步工具回执问题成立 | 严格恢复原作品，晚改/删除/歧义不冒充原结果 |
| 10 | 标题生成：失败 | 页面默认 feature 模型与旧全局模型实际请求不一致；坏 JSON 早退漏写创作终态 | 所见模型进入真实 header；坏结果明确 failed 记录 |
| 11 | 侵权检测：失败 | 坏 JSON 或空对象被旧逻辑伪造低风险、走成功路径 | 验证真实结构，异常不产出低风险结论；已受理未知费用保持核对 |
| 12 | 印花提取：失败 | 共用质量、失败回执误报与大输出回执丢失窗口 | 同原 owner/scope/operation 作品恢复，未重新发供应商请求 |

## 47 只读实证：不要把账务 settled 解释成“已经扣了钱”

2026-11-02 09:29/09:35 北京时间，两次 `BEGIN ... REPEATABLE READ READ ONLY`、单句 8 秒期限查询，`transaction_read_only=on`。

- 现役仍为 `67bbcddf / 1793544987`。专用超分配置存在标志为 false；没有读取或输出凭据值。
- 过去七天所查工具中，53 笔明确 `settlement_result.state=failed` 且实际 `charged_credits=0`，均没有 result_response：抠图 40、去水印 2、头像 1、提取 1、换色 3、风格 1、超分 5。
- 这证明旧“扣费已完成”有实际误报数据，不代表这 53 笔均属于截图用户，也不代表对它们执行了退款。
- 另有侵权检测 1 笔、复刻 1 笔 `hold/unknown`，预占分别 1、10；未改状态、未重放、未把它们当已失败。
- 成功、失败、预占、客户扣款和供应商未知结果保持分开。原始聚合及命令见 `LIVE_READONLY.json`、`LIVE_SETTLEMENT_READONLY.json`。

## 分模块实现

1. [报价身份与质量](2026-11-02-tool-quote-identity.md)：`requests.ts`、generate admission、preset quality、Fuse/Variations 实际画幅报价。原 owner/tenant/model/quantity 校验未放宽。
2. [同步图工具及失败回执](2026-11-02-tool-image-receipts.md)：七工具作品保存证明、结算前紧凑 pointer、失败回执与账务同事务；真实零扣费不再称扣费完成。
3. [文本结果与标题模型](2026-11-02-tool-text-results.md)：完整结构化结果校验、标题创作终态、同一选择器模型真正进入请求。
4. 前端 POST 回包读取：`billing/client-response.ts`，只对读取阶段施加 30 秒截止。坏 JSON、HTML、空/断流回包返回可读 `OPERATION_PENDING`，保留原 intent，不重发 POST；SSE 保持流式。
5. 明确失败回执需原 `tool-${id}`、`terminal=true/status=failed`、真实非负整数 charge，才释放本地 intent。未来一次显式点击可创建新任务，不自动重提；第一次已确认失败回复与后续回放均提供该终态。
6. 成功恢复返回 `replayed:true` 与新鲜服务器用户；读取用户失败时返回 null，六个单图客户端透传 replay，ToolWorkspace 不再次乐观扣减本地显示。
7. 专用超分目录与 backend 使用同一配置存在条件。缺配置既不收费，也不把普通生成模型或插值缩放冒充专用超分。

## 证据层级与收尾

- 全模块 VM/React fixture 覆盖真实代码，外部服务是明确替身；回执 SQL/事务额外运行独立 PostgreSQL。没有用正则重写业务函数后宣称真实链路通过。
- 独立静态窄审发现两页异步回执丢失 P2，已纳入本轮继续修复；其余报价/文本切片及同步回执切片未发现新增确定 P1/P2。后续修正以最终测试/文档为准。
- 父新增完整 BillingProvider 与 ToolWorkspace 检查：坏回包保留身份、显式原身份重读、SSE、body 截止、终态失败身份匹配、回放不重复减本地显示、缺超分禁用且有原因。
- 初始测试器漏 URL、旧 cutout runner 环境变量拼错、旧 fixture 漏新 `getUser` 依赖均保留原失败日志；修测试装配后再验，不将这些作为产品缺陷或降低断言。
- 最终类型、真实页面、集中回归、源代码副本 rollback、Git main 合并状态由父在交付时补记。这里不把本地验证当作 47 上线或专用超分已恢复。

## 父集中验收完成记录

| 模块 | 最终结果 | 证据层级 |
|---|---|---|
| 报价身份／preset质量 | 16/16；既有 auto 契约 7/7 | 完整模块 VM，供应商／repo 边界 fixture |
| 同步图回执及失败费用语义 | 43/43 | 完整 wrapper/去水印 route＋实际 PostgreSQL 事务，钱包/供应商 fixture |
| 原 cutout 成功回执兼容 | 17/17 | 完整 route＋独立 PG，包含余额读取失败 |
| 文本结果和标题真实模型 | 21/21 | 完整 route／组件／实际 header 和模型选择，外围 fixture |
| POST回包、终态身份、重读余额、超分不可用 | 24/24 | 完整 BillingProvider、ToolWorkspace、models/upscale route |
| 融图／裂变原 job 读取恢复 | 28/28 | 实际两页、hook、输入hash、bounded reader，时钟/HTTP fixture |
| 其余10工具页面 | 42项交互、3种宽度、pageerror 0、横向溢出 0 | 完整本地 Next＋真实 Chromium，API为fixture |
| 融图／裂变浏览器恢复 | 4项通过、pageerror 0 | 截断GET后原ID完成、刷新只GET，最终图片实际解码 |
| TypeScript | `tsc --noEmit --incremental false` exit0 | 全项目类型检查 |

- 前端正常 JSON 若缺应有 jobId/图片，也保留原 intent，不因 HTTP 200 就释放成另一笔新生成。只读恢复和真正新建明确区分。
- 浏览器原首跑 fixture 漏 `/api/feature-access` 导致测试用户页面无授权；补齐真实权限响应结构后10工具通过。恢复测试首跑在登录水合完成前上传而触发登录弹框，改为等待实际用户按钮和工具区后通过；失败截图/日志保留，不改生产权限或掩盖 pageerror。
- 新 helper 的 TypeScript 联合返回类型曾导致4条字段类型错误；显式声明 `Record<string, unknown>` 后全项目类型检查通过。
- 代码完成后按仓库规则普通合 main；副本回滚的真实 baseline → modified → restored-copy、完整字节/补丁重放/晚改零写结果记录于四制品 `VERIFICATION.txt`，最终绝对路径以交付报告为准，不冒充生产回切。封存首跑已按预期复现前两个模块，随后因封存器尚未识别报价报告的 `modules` 键停止；新增等价路径/hash核验入口后在独立输出目录重跑，原失败目录保留。
- **尚未完成的外部事项**：专用超分配置；12张历史截图逐笔 operation 对应；本轮没有新的供应商付费生成，也没有47部署。这些均没有用本地PASS替代。
