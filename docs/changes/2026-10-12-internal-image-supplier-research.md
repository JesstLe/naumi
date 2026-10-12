# 公司内部生图网站供应商接入调研

日期：2026-10-12。状态：完成登录、只读接口观察和 Naumi 当前主线契约对照；尚未接入或发布，未提交生图任务。

## 1. 实际发现

- 入口：`http://192.168.221.75:7880/login`，页面版本 v1.3。给定账号登录成功，未选择记住密码；账号、密码和会话凭据不进入本文或目录快照。
- 网站提供参考图工作台、聊天生图和单图生成。当前生图通过上游 API 执行，页面配置没有证明它运行本地模型或 ComfyUI。
- 认证后的 `GET /api/settings` 返回 200，共有 9 个模板，只有 `geek` 启用。当前适配器 `geeknow`、地址 `https://api.geeknow.ai/v1`、模型标识 `gpt-image-2.5-sunburst`。其余模板是禁用的历史配置，不是当前可用供应通道。
- 普通账号 `settings_editable=false`，模型商下拉框禁用并显示“服务器自动分配”。模板切换和上游密钥由公司服务端管理。
- 页面提供 quality=`high/medium/low/auto`、resolution=`1k/2k/4k` 和 11 个比例。单图客户端将数量限制在 1–20；这些都是客户端选项，不是供应商真实能力或服务端数量上限证明。
- 所有显式 `supported_models/resolutions/qualities/ratios` 列表为空或缺失：完整供应商目录、实际密钥可访问目录、最大参考图数量、真实像素与采购报价均为未知。不要把空列表解释为“不支持”，也不要从模型名推断能力。
- 配置声明 global_api_concurrency=50、default_user_concurrency=30、concurrency=2、timeout=900；不是压测结果或本账号当前实时容量证明。首轮接入建议仅 1 个并发、每次 1 张。

本机认证外请求 `/api/auth/status` 返回 401；浏览器登录后 `/api/settings`、`/api/chat-image/state`、`/api/single/tasks` 均观察到 200。单图任务列表为空，聊天状态没有消息，因此没有历史成功图片作为生成验收证据。

## 2. 可以利用的原生接口

最适合供应商桥接的是**单图生成**，无需经过聊天任务理解模型，也不依赖产品文件夹结构。

| 接口 | 用途 | 证据等级 |
|---|---|---|
| `POST /api/auth/login` | 提交现有配置的认证服务地址、账号、密码、remember=false | 浏览器实际登录成功；不归档凭据 |
| `GET /api/settings` | 读取当前模板及参数设置 | 认证后 200，去凭据快照已保存 |
| `POST /api/single/start` | 提交 prompt、quality、resolution、ratio、count、images | 单图页面实际脚本契约；未执行生成 |
| `GET /api/single/status?id=<task_id>` | 查询指定任务 | 页面轮询契约；未查询新生成任务 |
| `GET /api/single/tasks` | 获取当前账号任务列表 | 认证后 200，tasks=[] |
| `GET /api/image?path=<output_path>` | 下载服务端生成文件 | 页面图片下载契约；本轮无生成文件下载 |

页面提交的消息形状如下，图片使用 Data URL；这是接口契约示例，不是已执行请求：

```json
{
  "prompt": "测试提示词",
  "quality": "high",
  "resolution": "1k",
  "ratio": "1:1",
  "count": 1,
  "images": []
}
```

客户端要求提交响应包含 `task_id`。状态使用 `running/done/partial/failed`，图片位于 `results[].output_url/output_path`，失败位于 `failures[]`；等待时约每 2 秒轮询一次。上述非空响应字段和状态来自页面实现，仍需后续真实任务核验。

另有 `/api/workbench/start/items/edit` 和 `/api/chat-image/send/state/confirm` 等接口。工作台依赖服务端目录/参考图路径；聊天接口额外涉及任务规划和会话，因此不作为初版通道入口。

## 3. 路线比较与推荐

| 路线 | 如何接入 | 适用场景 | 额外条件 |
|---|---|---|---|
| A. 上游 API 直连 | 公司管理员提供专用上游 API 凭据，Naumi 对接 GeekNow | 只需要相同模型、不要求复用公司网站账号额度；链路最短 | 获取正式接口说明并核验 `geeknow` 自定义适配器与 OpenAI 图片协议的差异、报价、参考图和参数映射 |
| B. 公司生图 API 桥接 | 内网桥接器调用现有单图接口，向 Naumi 暴露受鉴权的标准图片 API | **需要沿用公司网站账号、模板自动分配和公司侧额度时推荐** | 建立公司内网至香港的私有网络路径，维护账号会话、任务映射、图片回传与幂等 |
| C. 给公司服务增加标准 API | 网站维护方在服务端增加 API 凭据和标准图片/异步任务接口 | 公司服务长期作为正式供应商，且有维护方配合 | 增加服务账号、可查询模型/参数/报价与用量、幂等提交和稳定任务标识 |
| D. 浏览器自动化 | 模拟点击、上传、等待和下载 | 页面无原生可用接口时的临时方案 | 当前已有清晰 API；相比接口桥接更脆弱，不选作正式执行通道 |

直连和桥接都不等于“把登录页 URL 填进 Naumi 供应商”。Naumi 当前图片请求使用 `/images/generations` 或 `/images/edits`，而公司服务使用账号会话与 `/api/single/start` 的异步任务协议，两者有明显契约差异。

桥接架构：`Naumi 香港 App/Worker → 私有网络 → 公司内网桥接器 → 7880 单图 API → 当前公司配置的上游`。

香港业务服务器当前位于 `179.236.104.112`；`192.168.221.75` 是私网地址。是否已有跨网路由本轮未从香港实测。桥接可以通过现有私网、WireGuard/Tailscale 或公司端主动建立的受保护隧道实现；不把公司整个工作台直接暴露公网。网络建通后，Naumi 对桥接器的私有 origin 还需要明确加入服务端 `MODEL_CONFIG_TRUSTED_ORIGINS`，该允许列表不替代路由。

## 4. 桥接器最小模块与 Naumi 对接点

1. **认证模块**：使用公司批准的专用服务账号、现有授权服务器配置和正常登录流程，维护内存/加密会话，失效后正常刷新。保留已有设备绑定机制，不变更或绕过绑定。账号密码不能当作 Naumi 的供应商 Bearer API key；桥接器使用独立认证。
2. **输入转换**：对外承接 OpenAI 风格 generations JSON 和 edits multipart；把 Naumi 的 1K/2K/4K 映射为小写分辨率、把比例映射为 ratio、n 映射为 count，参考图文件转 Data URL。先验证 1 张文生图和 1 张参考图编辑，不引入公司聊天规划层。
3. **持久任务映射**：在付费提交前保存 Naumi 任务/操作 ID 与请求摘要，提交后保存公司 task_id。恢复时只查询原 task_id；提交超时后进入“提交结果未知”并对账，不能自动再提交。公司接口目前没有已证明的幂等键；桥接器本地映射不能消除“上游受理但本地未记录”的窗口，需维护方支持或人工确认。
4. **结果回传**：轮询原任务；桥接器在认证会话内下载图片，校验图片字节，再返回 `data[].b64_json` 或 Naumi 可认证访问的媒体结果。不要把公司局域网 URL、Windows 文件路径或浏览器 cookie 交给用户客户端。partial 结果按真实交付张数处理。
5. **队列与超时**：明确超时不等于上游失败，不把“已提交”当“生成成功”。公司默认等待 900 秒，Naumi 存在独立请求/路由/任务超时；需要集中对齐，不能只修改供应商 timeoutMs。长任务优先纳入已有 Worker 任务状态和恢复机制。
6. **账务与元数据**：复用 Naumi 现有积分预占/结算/退款和供应商成本收据，分别记录公司账号成本和客户售价；首期成本未知，不写 0、不抄 APIMart 或官方模型参考价格。模板变更记录修订，冻结已发布执行映射。

当前主线基线 `1506166cf29de6c79270cf229b033fa2dcfd5fd3`，源码对照：

- `src/lib/model-config/schema.ts`：没有 `geeknow` 或公司网站专用协议；私网/HTTP 需明确 origin 允许列表。
- `src/lib/model-config/clients.ts`：现有图片 generations/edits 编码和参数转换入口；不能未经实测直接把 GeekNow 认定为 OpenAI-compatible。
- `src/lib/model-config/channel-image-response.ts`：供应通道成功要求实际可解码图片，不接受只有 task_id 或 HTTP 200 的空成功。
- `src/lib/model-config/resolution-policy.ts`：可冻结小写 resolution 与 ratio 的平面参数映射，映射值需以后续接口核验为准。
- `src/lib/supplier-models/{types,discovery,repository}.ts`：资料、来源和修订机制；公开资料、账号可见目录与实测状态需分开，管理员显式配置优先。
- `src/lib/supplier-cost/` 与现有图片任务/Worker：采购成本与客户结算分离，接入不复制新的扣费系统。

## 5. 验收顺序和未完成项

建议一次完成桥接模块后集中验收：网络可达 → 服务账号正常登录 → 单张文生图 → 单参考图编辑 → 分辨率/比例像素核验 → 任务恢复/失效会话/失败和部分成功 → 真实图片入库 → 账务幂等/成本证据 → 发布及回滚。多模型和高并发在单模型闭环后推进。

尚未实施：桥接代码、网络打通、公司服务账号、GeekNow 正式协议核验、完整模型目录/报价采集、真实出图、Naumi 元数据库写入、供应商配置发布及线上验收。本轮只保存调研目录，不覆盖管理员资料、不新增扣费或更改公司侧配置。

证据保留在本机忽略目录 `E:/Workspace/naumi/output/internal-image-supplier-research-20261012/`：

- `catalog.redacted.json`：白名单过滤后的设置模板、来源和采集时间。
- `single-client.js.txt`：单图页面公开客户端脚本，非后端源代码。
- `single-workbench.jpg`：登录后单图页面。

对应去凭据模板目录也随本文存入 `docs/research/internal-image-supplier-catalog-20261012.json`。该目录是配置观察，不是完整模型目录或实测成功证明。本轮未取用网站保存的上游密钥，也未保存原始认证响应。
