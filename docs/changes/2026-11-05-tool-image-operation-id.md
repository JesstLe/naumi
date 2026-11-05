# 工具图片调用的稳定操作编号（抠图在 APIB 通道全部失败的修复，2026-11-05）

## 线上现象与证据（47，只读）

- 模型配置 v150（10-26 20:45）把抠图 `image.cutout` → 隐藏模型 `image-cutout-verified` 改到 `apib-image`（协议 `apimart-images`）的 `gpt-image-2.5-sunburst`/`-flare`。此后 `app_model_execution_stages` 中 `tool.cutout` 72 次全部 `rejected-not-charged / 400 / localFailure INVALID_REQUEST`，0 次成功；之前 geeknow 通道成功 12 次。
- 近 14 天抠图计费：64 笔 settled 0 积分（失败未扣费），12 笔 1 积分为旧通道成功；用户未被误扣。
- 同一 APIB 通道上画布生图、局部重绘、精修、复刻正常；**直接调用 `images.edit` 的工具全部 400**：抠图、去水印、换色、头像、提取、风格。
- 47 当前供应商只有 `apib-image`/`apib-video`/`apib-text` 启用，其余停用；没有 reverse-hub 通道。

## 根因

`model-config/apimart-preset.ts` 在付费提交前要求 `currentImageOperationId()`（供应商账本 attempt/幂等键与通道固定的单位），缺失即本地抛 `INVALID_REQUEST "默认APIMart调用缺少稳定操作ID"`。该上下文由 `withImageOperation()` 建立：画布生图、`image-edit.ts`（局部重绘等）都会建立，而工具路由（`imagegen/cutout-provider.ts` 的 `cutoutOpenAI` 及去水印等路由）直接调用托管 SDK 的 `images.edit`，从未建立。用户侧看到通用失败文案（抠图为“抠图服务暂时不可用”）。

## 模块与职责

- **模型执行客户端（model-config/clients.ts `modelAwareOpenAI`）**：托管图片调用的唯一入口，负责在调用供应商通道前保证存在图片操作上下文。不改各工具路由。

## 公共接口、依赖方向、数据/状态/事务归属

- 无新公开接口。托管客户端的图片方法（`images.edit/generate`）在**有托管执行范围、当前无图片操作上下文、处于同步计费操作中**时，以 `withImageOperation(publicModelId, {id: "<计费操作ID>:tool-image:<n>"})` 包裹调用；`n` 为同一计费操作内第几次图片调用（按计费上下文对象计数，WeakMap）。已有上下文（画布、`editImage`、imagegen 步骤）不覆盖；没有计费操作时行为不变。
- 依赖：model-config/clients → image-gateway（已有依赖）；对 billing/synchronous-operation 为调用时动态导入，只读其 AsyncLocalStorage，不新增静态依赖、无循环。
- 幂等与防重放：同一计费操作重复提交由既有同步计费回执重放，不再调用供应商；每个计费操作得到独立供应商单位。不改账务、报价、冻结配置或执行映射。

## 本次实现与迁移状态

- 代码：`src/lib/model-config/clients.ts`。
- 测试：新增 `scripts/verify-tool-image-operation-apib.ts`，登记为 `tool-image-operation-apib`。
- 迁移状态：已合入 main，**未发布**。47 “维持配置、合并后暂缓发布”仍有效，线上 `6eddec90` 在获授权的蓝绿发布前仍会失败。不发版的临时止血方案（把 `image.cutout` 切回非 apimart 且核验过透明输出的通道）属于 47 模型配置发布，同样需要授权，本次未执行。

## 验证命令、结果及证据层级

本机隔离 PostgreSQL 16（127.0.0.1:65442）+ 本机 HTTP APIB 夹具（上传/提交/任务查询/结果下载），`NODE_OPTIONS=--conditions=react-server`：

- `verify-tool-image-operation-apib.ts`：**基线（不含修复）复现失败**：`/api/cutout` 返回 500“抠图服务暂时不可用”，未发生供应商提交；**修复后 11 项 PASS**：真实 `/api/cutout` 路由经 APIB 适配器成功返回透明结果，1 次上传 + 1 次付费提交，供应商单位 `tool-<op>:tool-image:0`，带派生幂等键，按冻结价 settled 1 积分；同操作重放返回原回执且无新提交；新操作获得独立单位；`/api/dewatermark` 同样成功。
- 相邻回归：`verify-cutout-execution-boundary.ts` 49 项 PASS（**该用例本机不稳定**：并发断言“concurrent loser is pending”在未改动的 main `f3a67db2` 上 3 次中失败 2 次，带本修复 4 次中失败 1 次，失败点相同，与本改动无关，未计为稳定通过，需另行处理）、`verify-tool-image-receipts.cjs` 43 项 PASS、`verify-apimart-async-images.ts`、`verify-apimart-single-pass.ts`（63 项）、`verify-apimart-single-pass-pg.ts`（52 项）、`verify-image-gateway.ts`、`verify-apimart-async-contract.ts` 均 PASS。
- `tsc --noEmit` 全量 exit 0；变更文件 eslint exit 0。
- 证据层级：隔离 PG/HTTP 夹具，未调用真实 APIB、未在 47 运行新代码；换色/头像/提取/风格四个路由未单独测，依据为同一入口、同一缺陷形态（直接调用托管 `images.edit`）。

## 未完成项与下一步

1. 获授权后按蓝绿流程发布（47 磁盘余量已满足门槛），发布后核对 `tool.cutout` 等工具的执行阶段由 `rejected-not-charged/INVALID_REQUEST` 变为 `response-received`，并用自备测试图做一次真实抠图透明像素验收。
2. 抠图失败兜底文案仍为“抠图服务暂时不可用”，`cutout.ts` 的透明检测文案“请核对供应商能力”与账单“抠图 · 发丝级”标签待另行修正。
