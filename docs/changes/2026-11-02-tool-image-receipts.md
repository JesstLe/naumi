# 工具截图反馈：结果回执与零扣费失败语义

## 范围与基线

- 基线 `ca63c76fa0f8c87ae404ad500ca65f71b064e62e`，父任务独立工作区 `E:/Workspace/naumi-release47-main-20261101-r1`，本切片只改同步账务回执和集中验证。
- 截图涉及去水印、抠头像、抠图、变清晰、印花提取等。截图中的“扣费已完成”首先是页面文字，不直接当作账本扣款证明。
- 本切片不修改供应商选择、报价、价格、前端提交、生产数据库或发布配置；不重发供应商请求。变清晰缺专用后端配置、前端截断响应、报价参数及文字工具由父任务其他切片处理。

## 两个实际缺陷

### 1. `settled` 被误当成“成功且扣费”

`settlementFor` 对已知失败 `{state:'failed',items:[]}`、失败费率 0 的结果返回 `state:'settle',charge:0`。原 `settleLocked` 正确把账务收尾为 `settled`，但同步 wrapper 未保存失败响应；同操作回放只见 `settled + result_response=null`，便显示“扣费已完成，结果需要恢复”。

父线程两次生产只读观察的材料为 `LIVE_READONLY.json`、`LIVE_SETTLEMENT_READONLY.json`。后者确认 53 条相应工具记录有 `settlement_result.state=failed` 且 `charged_credits=0`：抠图 40、去水印 2、抠头像 1、印花提取 1、换色 3、风格 1、变清晰 5。另有抠图 7 条真实成功；侵权检测及复刻各一条仍为 hold/unknown，不归为失败。该聚合未把每张截图强行绑定到某个具体任务，也未写生产数据。

### 2. 真实成功输出也存在不可恢复窗口

去水印、抠头像、印花提取、风格转换、变清晰、换色及复刻等路由，在保存作品后调用成功结算，再构造 HTTP 响应。wrapper 在收到响应后才保存回执；原先超过 262144 字符的内联图还会被跳过。另有 route 吞掉 `addArtworks` 异常后继续结算。

因此，“失败零扣费被错误描述”和“真实成功输出丢回执”是不同问题。本轮分别用有证据的失败回执和精确作品恢复处理，不相互推断。

## 实现与公共接口

### 已知失败：`synchronous-failure-receipt.ts`

- 已知失败路径在**同一账务事务**内写入有界错误回执并调用原 `settleTx`。仅存 HTTP 状态、已经向用户公开的错误文字（最多 1200 字符）和受限错误码；不存任意供应商响应或图片。
- 原请求回放先保留 owner、request fingerprint 和 frozen workspace/tenant 检查。只有原 scope 有记录、账务实际为 settled、`settlement_result.state=failed` 且 items 中没有 succeeded/unknown，才返回明确失败终态。
- 返回 `ok:false / status:'failed' / terminal:true / operationId:'tool-原id' / chargedCredits:实际值`。零扣费才标 `billingOutcome:not_charged`；正数失败费用按原值报告。既有免费成功的 0 积分不会被当成失败。
- 历史只有失败证明而没有错误文字时，明确提示“历史失败原因未留存”，不编造供应商错误。缺原归属、UNKNOWN、hold/manual、矛盾结算结果或单独一个失败 marker，继续为待核查，不重放请求。

### 成功单图：`tool-image-receipt.ts`

- 精确限定七个同步单图工具：`tool.dewatermark/avatar/extract/style/upscale/recolor/replicate`；现有 cutout 专用成功回执保持。
- 在公共 `settleSynchronous` 成功结算前查询原作品，要求同 owner、精确 operation ref、对应工具 operation、`server-route` 证据、completed、未删除、唯一结果。不按时间、名称、URL 相似性或最近一张猜测。
- 账务只保存紧凑指针（工具、作品 ID、输出 URL 的 SHA-256）。图片字节由作品/媒体模块拥有；查询最多两行用来检出歧义，结算前不传出大图片字段。
- 已结算原请求读取该作品恢复输出；新指针及旧有小结果的输出 SHA 不符时，不用后来替换的图片冒充原输出。同一 handler 已建立的指针不被最后一次 response checkpoint 改绑。
- 未查到已保存作品就不进入成功扣款；没有真实保存证明时，错误文案也不会写“结果已保留”。调用方已有事务时复用其 client，不增加嵌套 pool checkout。

## 集中验证

新脚本 `scripts/verify-tool-image-receipts.cjs` 执行完整 TS 模块、实际 PostgreSQL SQL/事务和真实 `settlementFor` 规则。钱包写入、鉴权、供应商及配置边界是明确 fixture；真实去水印 Route、实际 PNG 和落库失败/丢响应反例经过完整处理器。没有生产供应商或外网请求。

实际运行环境：独占 PostgreSQL 16 容器，绑定 `127.0.0.1:54969`，数据库 `tool_image_receipts_fixture`。每次使用独立 schema 并在 finally 删除，父验收后删除本任务容器；不复用生产数据库。

```text
NODE_PATH=E:/Workspace/naumi-creation-media-release-prep-20261026/node_modules
TOOL_RECEIPTS_TEST_DATABASE=postgres://postgres:fixture-only@127.0.0.1:54969/tool_image_receipts_fixture

node scripts/verify-tool-image-receipts.cjs --source-root E:/Workspace/naumi-creation-media-release-prep-20261026 --baseline --output-root E:/Workspace/naumi/output/tool-screenshot-fixes-20261102/receipts/baseline-atomic
TOOL_IMAGE_RECEIPTS=REPRODUCED CASES=13 NETWORK=0 PAID_SUPPLIER_CALLS=0 REPLAY_ACTIONS=0 EXIT=1

node scripts/verify-tool-image-receipts.cjs --source-root E:/Workspace/naumi-release47-main-20261101-r1 --output-root E:/Workspace/naumi/output/tool-screenshot-fixes-20261102/receipts/modified-stable
TOOL_IMAGE_RECEIPTS=PASS CASES=43 NETWORK=0 PAID_SUPPLIER_CALLS=0 REPLAY_ACTIONS=0 EXIT=0
```

最终 modified 实际 `RESULT.json` 已重新打开，43 项通过；覆盖：七工具精确恢复、早结算后断响应、大图、作品落库失败、重复回放不扣款、owner/tenant/fingerprint、缺归属、删除/多结果/错误证据/错误工具/未知状态、后改字节、原小回执、免费成功、失败费率、旧 failed0、cutout failed0、侵权/复刻 UNKNOWN、失败证明与结算的同事务回滚。

旧抠图回执脚本仅补 fixture 表里的真实 `settlement_result` 列与显式 INSERT 列表；未改断言，原完整 cutout Route **16 项 PASS**。

原始前序 11/13 项 baseline、28/31/32/40/41 项增量验证结果分别保留，不覆盖旧报告。`[dewatermark] addArtworks failed: fixture-artwork-write-failed` 是明确注入的反例日志，不伪装成无错误运行。

## 交接

- 本切片没有 Git 提交/合并、SSH、生产写入或发布。父负责全部截图切片整合、类型校验、集中回归、四制品及真实副本回滚。
- 失败回放只投影已有财务与结果证据；前端只有在原 operationId 精确匹配的明确 terminal failure 后释放本地提交意图，不自动 POST。
- 已有未知付费结果仍归原任务/供应商证据链处理；本修复不会把 UNKNOWN 清成 failed，不补扣、不自行退款。

### 父整合追加

- 第一次已知失败财务事务提交后，即返回身份绑定的 `terminal/status/chargedCredits`，不要求用户再点一次才获知失败。后续原请求回放保持同样语义；重放财务结果不从本次猜测生成证明。
- 两个成功恢复分支追加 `replayed:true`，并在完成原身份与作品核验后读取当前 `getUser`；读取失败只返回 null。六个单图客户端透传 replay，ToolWorkspace 在 replay 且无 user 时不再次 `consumeCredits`，防止本地余额显示二扣。
- 父集中复跑：图回执 **43 项 PASS**；原 cutout **17 项 PASS**（新增用户余额读取失败时仍恢复图、无再次结算）。前端完整 ToolWorkspace 覆盖 replay 有／无权威 user、普通新结果和实际配置不可用状态。
- 旧 cutout fixture 最初漏注入新 `getUser`，以及父一次误用测试数据库环境变量名均保留失败日志；修正 fixture 装配后通过，没有修改原有失败／越权／未知态断言。
