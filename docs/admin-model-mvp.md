# 管理后台 MVP：模型连接

入口 `/admin/mvp`，位于管理导航最上方。第一版只改变后台；用户侧页面和模型选择策略不变。

## 模型映射

列表使用与 `/api/models` 相同的生效目录、功能可见性和管理员默认模型策略，再按现有用户侧图片家族规则折叠。展示当前前端名称、配置别名、实际 wire model ID、上游来源及使用功能。个人自带密钥模型由用户自行管理，不进入站点后台。

简单切换保持公开 ID、别名、售价及功能绑定，更新实际目标；同一公开 ID 或图片家族在多个功能使用时一起生效。家族切换同时更新其比例分支；启用的条件路由和失败回退会明确提示并关闭，避免发布后仍调用旧目标。已接受任务继续使用冻结版本。备选开放启用、凭据已配置且满足既有输入与规格记录的已接入模型；旧接入能力未核验时明确标注，仍由完整配置校验决定能否发布到对应功能。

APIMart 专用默认预设涉及模型专属能力证据、原生参数矩阵及成本，快捷页面不能复制旧模型证据给新模型；此类变更转至完整配置中心。目录发现与管理员能力声明均不代表付费出图验收通过。

## 上游来源

填写名称、URL、协议和凭据，发布来源后自动读取标准模型目录；重新进入页面时按现有缓存有效期刷新。保留目录错误、未支持协议、空目录、旧缓存和截断状态。支持当前 OpenAI 图片/文字/视频、New API 图片、APIMart 图片的快捷接入；其他协议使用完整配置中心。

目录模型需管理员根据文档或测试结果确认类型和能力后才能添加，再进入兼容目标列表；不会猜测成本、能力或修改当前前端模型。HTTPS/localhost 使用现有 RSA-OAEP；HTTP 兼容现有系统设置的服务端加密保存流程，HTTP 本身不提供传输加密。明文凭据不进入草稿、浏览器存储、日志或返回值。发布重试只保留凭据引用。

## 发布与验收

复用既有模型配置校验、Router 准备/激活、版本冲突和任务冻结流程。MVP 每次发布使用独立操作草稿，不覆盖完整配置中心未发布草稿；同操作串行处理，结果未知时保留原编号供重试核对。所有页面和接口保留管理员权限及同站修改校验。

本地隔离 PostgreSQL 下：

- `npm run verify:admin-mvp`：真实目标切换、新旧任务版本、草稿保留、结果未知恢复、凭据加密、目录发现、版本冲突、权限检查。
- `npm run verify:admin-mvp-ui`：浏览器映射、切换与刷新恢复、RSA 接入/自动目录、模型登记、搜索、类型过滤、手机布局及普通用户拒绝。
- `npm run verify:provider-catalog`、`npm run verify:model-publication`、`npm run verify:image-model-family-routing` 和 `npx tsc --noEmit`。

隔离测试不调用真实模型，不改变真实上游配置。新机发布遵循固定镜像、先备份、准备回滚、保留现有数据库/媒体/配置和线上验收的约定。

## 本轮分支核对

2026-10-09 拉取主线至 `d0bd81f`。`canvas-dock-collision`、`image-job-stopping-release`、`supplier-cost-reconciliation` 的功能已在主线；`bi-model-configuration`、`billing-module-design`、`staging-media-handoff` 仅保留额外发布交接记录。`image25-output-price-table` 的成本表、`pricing-page-preview` 的价格预览未合入且与本 MVP 无关，本轮不合并。

## APIMart 接入修正

真实新机直连 APIMart 时 DNS 解析异常且连接超时；同机现有代理可取得用户已保存来源的 376 个模型 ID。模型传输新增服务端显式 `MODEL_CONFIG_PROXY_URL` / `MODEL_CONFIG_PROXY_ORIGINS`，只对精确批准的 HTTPS origin 走 CONNECT 代理，其余目标继续原 DNS 绑定与内网拒绝。代理端看不到 TLS 内的供应商 Authorization。手动刷新目录可绕过旧失败缓存。

APIMart URL 接受根地址或 `/v1`；新来源规范化为根地址，Router 适配器亦去掉末尾 `/v1`，避免生成路径重复。多个同地址账户可以作为独立来源保存。固定 Router 源码 `b3fc8dd61e62c564ac2ba2a08cf943f7c391970c` 保存在验收源码包中；Go 全量测试通过。API 与已明确批准的媒体来源使用独立 `NAUMI_MODEL_PROXY_URL` / `NAUMI_MODEL_PROXY_ORIGINS`，其他媒体仍校验公网地址。`scripts/verify-model-proxy.ts` 验证来源隔离、CONNECT 和密钥边界。
