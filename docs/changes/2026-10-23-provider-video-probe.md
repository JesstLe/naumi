# 47 APIB / Geek 视频能力实测

## 范围与协作

用户于 2026-10-23 要求：通知后台线程实现供应商余额面板，并实测 47 当前 APIB、Geek 支持的视频模型。

- 「Naumi · 管理后台与积分定价」已接收余额面板需求，负责复用 `origin/codex/provider-health-20261021` 的余额/运维基础、集成及其原任务发布验收。
- 本任务只读当前配置，并向这两家供应商提交独立合成素材测试；不修改客户积分、业务任务、路由、供应商启停或发布配置。
- 目录可见、请求受理、终态成功、实际视频文件核验分别记录。未确认或失败不得标为支持；未知受理请求不重投。
- 使用当前密钥仅在 47 服务端内存解密，密钥不导出。结果签名链接、原始回执及素材保存在私有证据目录；本文件不含秘密。

## 已核对基线

2026-10-23（北京时间），在线 Web / Worker 为 `naumi47-*-nas-upload-20261022`，同 Image ID 前缀 `600320c4d08b`；Web `SOURCE_COMMIT=0a572167448a91a5a9e2cfc4c73a3b557eb6406c`，模型配置版本 `134`。

- APIB 当前 `/v1/models` 返回 319 项；APIB 图片、视频两项配置均可读取目录，视频项仍为禁用状态。
- Geek 当前 `/v1/models` 返回 263 项；当前图片通道有凭据，尚无已登记的视频执行通道。
- 目录包含计费/分辨率别名，不能直接把数量当作视频模型数量或能力证明。
- APIB 正式资料由其 `/api/status` 指向 APIMart 文档；仅向 `api.apib.ai` 发送 APIB 凭据。
- Geek 正式资料：<https://docs.geeknow.ai/api-reference/videos/model-matrix>。

## 实测结论

截至 2026-10-23 02:47:14 +08:00，APIB **46 个精确ID**、Geek **24 个精确ID**真实出片并通过文件核验。共提交 85 次独立探针；历史失败保留，不算新增可用型号。
成功文件均已下载、记录 SHA256、用 ffprobe 核对视频流/尺寸/时长，并完成全片解码的数量为 **70/70**。另抽查8张视频帧，画面符合合成红色木方测试场景。
这证明当前47凭据在本次所列参数及模式下可以出片；一次样例不覆盖其他分辨率、所有模式、并发或长期稳定性。没有启用线上视频通道，也没有修改业务任务、报价、积分、路由或配置版本。

### 尚未取得终态

| 供应商 | 型号 | 状态 |
|---|---|---|
| APIB | `wan2.7` | processing |

仅继续查询这些原任务，不重新提交。

### APIB：已核验型号

| 精确模型ID | 已测模式 | 实际发送规格 | 实际输出 | 音轨 |
|---|---|---|---|---|
| `MiniMax-H3` | 文生 | `duration=4, resolution="768P"` | 1344×768 / 4.459s | 有 |
| `MiniMax-H3-Max` | 文生 | `duration=5, resolution="480P"` | 832×480 / 5.184s | 有 |
| `MiniMax-H3-Regeneration` | 重生成 | `依赖原成功任务；未另设规格` | 2560×1440 / 4.459s | 有 |
| `MiniMax-Hailuo-02` | 文生 | `duration=10, resolution="768p"` | 1366×768 / 10.125s | 无 |
| `MiniMax-Hailuo-2.3` | 文生 | `duration=6, resolution="768p"` | 1366×768 / 5.875s | 无 |
| `MiniMax-Hailuo-2.3-Fast` | 图生/参考图 | `duration=6, resolution="768p"` | 1152×768 / 5.875s | 无 |
| `flux-3-video` | 文生 | `duration=5, resolution="hd"` | 1280×704 / 5.042s | 有 |
| `gemini-omni-1.1-flash` | 文生 | `resolution="360p"` | 640×360 / 10.027s | 有 |
| `gemini-omni-flash-preview` | 文生 | `resolution="720p"` | 1280×720 / 10.027s | 有 |
| `grok-imagine-video` | 文生 | `duration=1, resolution="480p", aspect_ratio="16:9"` | 848×480 / 1.042s | 有 |
| `grok-imagine-video-1.5` | 文生 | `duration=1, resolution="480p", aspect_ratio="16:9"` | 848×480 / 1.042s | 有 |
| `happyhorse-1.0` | 文生 | `duration=3, resolution="720P"` | 1280×720 / 3.163s | 有 |
| `happyhorse-1.1` | 文生 | `duration=3, resolution="720P"` | 1280×720 / 3.163s | 有 |
| `kling-3.0-turbo` | 文生 | `duration=3, resolution="720p"` | 1280×720 / 3.042s | 有 |
| `kling-v2-6` | 文生 | `duration=5, mode="std", audio=false` | 1280×720 / 5.042s | 无 |
| `kling-v3` | 文生 | `duration=3, mode="std", audio=false` | 1280×720 / 3.042s | 无 |
| `kling-v3-omni` | 文生 | `duration=3, mode="std", audio=false` | 1280×720 / 3.042s | 无 |
| `kling-v4` | 文生 | `duration=3, resolution="720p"` | 1280×720 / 3.042s | 有 |
| `kling-video-o1` | 文生 | `duration=5, mode="std"` | 1280×720 / 5.042s | 无 |
| `pixverse-v6` | 文生 | `duration=1, resolution="360p", audio=false` | 640×360 / 1.042s | 无 |
| `seedance-1-0-pro-fast` | 文生 | `duration=2, resolution="480p"` | 864×480 / 2.042s | 无 |
| `seedance-1-0-pro-quality` | 文生 | `duration=2, resolution="480p"` | 864×480 / 2.042s | 无 |
| `seedance-1-5-pro` | 文生 | `duration=4, resolution="480p", audio=false` | 864×496 / 4.042s | 无 |
| `seedance-2.0` | 文生 | `duration=4, resolution="480p"` | 864×496 / 4.096s | 有 |
| `seedance-2.0-fast` | 文生 | `duration=4, resolution="480p"` | 864×496 / 4.096s | 有 |
| `seedance-2.0-mini` | 文生 | `duration=4, resolution="480p"` | 864×496 / 4.096s | 有 |
| `seedance-2.5` | 文生 | `duration=4, resolution="480p"` | 854×480 / 4.064s | 有 |
| `skyreels-v4-fast` | 文生 | `duration=3, resolution="480p"` | 864×480 / 3.021s | 有 |
| `skyreels-v4-std` | 文生 | `duration=3, resolution="480p"` | 864×480 / 3.021s | 有 |
| `veo3.1-fast` | 文生 | `duration=8, resolution="720p"` | 1280×720 / 8s | 有 |
| `veo3.1-fast-official` | 文生 | `duration=4, resolution="720p", generate_audio=false` | 1280×720 / 4s | 无 |
| `veo3.1-lite` | 文生 | `duration=8, resolution="720p"` | 1280×720 / 8s | 有 |
| `veo3.1-quality` | 文生 | `duration=8, resolution="720p"` | 1280×720 / 8s | 有 |
| `veo3.1-quality-official` | 文生 | `duration=4, resolution="720p", generate_audio=false` | 1280×720 / 4s | 无 |
| `viduq3` | 图生/参考图 | `duration=3, resolution="540p"` | 960×528 / 3.042s | 有 |
| `viduq3-mix` | 图生/参考图 | `duration=1, resolution="720p"` | 1280×720 / 1.042s | 有 |
| `viduq3-pro` | 文生 | `duration=1, resolution="540p"` | 960×528 / 1.042s | 有 |
| `viduq3-turbo` | 文生 | `duration=1, resolution="540p"` | 960×528 / 1.042s | 有 |
| `viduq4-preview` | 图生/参考图 | `duration=3, resolution="540p"` | 880×586 / 3.042s | 有 |
| `wan2.5-preview` | 文生 | `duration=5, resolution="480p", audio=true` | 832×480 / 5.042s | 有 |
| `wan2.6` | 文生 | `duration=5, resolution="720p"` | 1280×720 / 5.008s | 有 |
| `wan2.6-i2v-flash` | 图生/参考图 | `duration=2, resolution="720p", audio=false` | 1176×784 / 2s | 无 |
| `wan2.7-r2v` | 图生/参考图 | `duration=2, resolution="720P"` | 1280×720 / 2.02s | 有 |
| `wan2.7-videoedit` | 视频编辑 | `duration=2, resolution="720P"` | 1264×728 / 2s | 有 |
| `wan3.0-video` | 文生 | `duration=2, resolution="480P"` | 854×480 / 2.02s | 有 |
| `wan3.0-video-prime` | 文生 | `duration=2, resolution="480P"` | 854×480 / 2.02s | 有 |

### Geek：已核验型号

| 精确模型ID | 已测模式 | 实际发送规格 | 实际输出 | 音轨 |
|---|---|---|---|---|
| `Hailuo-2.3` | 文生 | `seconds="6", resolution="768P"` | 1366×768 / 5.875s | 无 |
| `Hailuo-2.3-fast` | 图生/参考图 | `seconds="6", resolution="768P"` | 1152×768 / 5.875s | 无 |
| `MiniMax-H3` | 文生 | `resolution="768P", duration=1, ratio="16:9"` | 1344×768 / 1.625s | 有 |
| `hailuo-02-768p` | 文生 | `seconds="6", resolution="768P"` | 1366×768 / 5.875s | 无 |
| `hunyuan-1.5-720p` | 文生 | `resolution="720P"` | 1280×720 / 5.042s | 无 |
| `kling-1.6-720p` | 文生 | `seconds="5", resolution="720P", aspect_ratio="16:9", audio_generation="Disabled"` | 1280×720 / 5.042s | 无 |
| `kling-2.0-720p` | 文生 | `seconds="5", resolution="720P", aspect_ratio="16:9", audio_generation="Disabled"` | 1280×720 / 5.042s | 无 |
| `kling-2.1-720p` | 文生 | `seconds="5", resolution="720P", aspect_ratio="16:9", audio_generation="Disabled"` | 1280×720 / 5.042s | 无 |
| `kling-2.5-720p` | 文生 | `seconds="5", resolution="720P", aspect_ratio="16:9", audio_generation="Disabled"` | 1280×720 / 5.042s | 无 |
| `kling-2.6-mute-720p` | 文生 | `seconds="5", resolution="720P", aspect_ratio="16:9", audio_generation="Disabled"` | 1280×720 / 5.042s | 无 |
| `kling-3.0-720p-mute` | 文生 | `seconds="5", resolution="720P", aspect_ratio="16:9", audio_generation="Disabled"` | 1280×720 / 5.042s | 无 |
| `kling-3.0-omni-720p-noref-mute` | 文生 | `seconds="5", resolution="720P", aspect_ratio="16:9", audio_generation="Disabled"` | 1280×720 / 5.042s | 无 |
| `kling-3.0-omni-720p-ref-mute` | 图生/参考图 | `seconds="5", resolution="720P", aspect_ratio="16:9", audio_generation="Disabled"` | 1280×720 / 5.042s | 无 |
| `kling-o1-720p` | 文生 | `seconds="5", resolution="720P", aspect_ratio="16:9", audio_generation="Disabled"` | 1280×720 / 5.042s | 无 |
| `mingmou-1.0-720p` | 文生 | `resolution="720P"` | 1366×768 / 5.875s | 无 |
| `mini-2.0` | 文生 | `duration=4, ratio="16:9", resolution="480p"` | 864×496 / 4.096s | 有 |
| `vidu-q2-720p` | 文生 | `seconds="1", resolution="720P", aspect_ratio="16:9"` | 1280×720 / 1.042s | 无 |
| `vidu-q2-pro-720p` | 文生 | `seconds="1", resolution="720P", aspect_ratio="16:9"` | 1280×720 / 1.042s | 无 |
| `vidu-q2-pro-reference-720p` | 图生/参考图 | `seconds="1", resolution="720P", aspect_ratio="16:9"` | 1280×720 / 1.042s | 无 |
| `vidu-q2-reference-720p` | 图生/参考图 | `seconds="1", resolution="720P", aspect_ratio="16:9"` | 1280×720 / 1.042s | 无 |
| `vidu-q2-turbo-720p` | 文生 | `seconds="1", resolution="720P", aspect_ratio="16:9"` | 1280×720 / 1.042s | 无 |
| `vidu-q3-pro-720p` | 文生 | `seconds="1", resolution="720P", aspect_ratio="16:9"` | 1280×720 / 1.042s | 有 |
| `vidu-q3-turbo-720p` | 文生 | `seconds="1", resolution="720P", aspect_ratio="16:9"` | 1280×720 / 1.042s | 有 |
| `wan3.0-video` | 文生 | `seconds=2, size="480P", aspect_ratio="16x9"` | 854×480 / 2.02s | 有 |

### 失败及受理不明的请求

| 供应商 | 型号 | 本次模式 | 结论 |
|---|---|---|---|
| APIB | `MiniMax-Hailuo-02` | 文生 | 512p仅在带首帧时支持；独立768p/10s文生验证成功 |
| APIB | `grok-imagine-video` | 文生 | 缺省auto比例失败；独立显式16:9验证成功 |
| Geek | `Hailuo-2.3-fast` | 文生 | Fast型号不支持纯文生；独立图生验证另列 |
| Geek | `doubao-seedance-1-5-pro_1080p` | 文生 | 提交超时/上游连接超时；受理/扣费不明，未重投 |
| Geek | `doubao-seedance-1-5-pro_480p` | 文生 | 提交超时/上游连接超时；受理/扣费不明，未重投 |
| Geek | `doubao-seedance-1-5-pro_720p` | 文生 | 提交超时/上游连接超时；受理/扣费不明，未重投 |
| Geek | `doubao-seedance-2-0-260128` | 文生 | 提交超时/上游连接超时；受理/扣费不明，未重投 |
| Geek | `grok-imagine-video-1.5-preview` | 文生 | 无可用渠道；未取得任务ID |
| Geek | `manxue-2.0` | 文生 | 无可用渠道；未取得任务ID |
| Geek | `manxue-2.5` | 图生/参考图 | 上游502；受理/扣费不明，未重投 |
| Geek | `sv-1.0-lite-480p` | 文生 | 组合型号解析失败：ModelName SV is invalid |
| Geek | `sv-1.0-pro-480p` | 文生 | 组合型号解析失败：ModelName SV is invalid |
| Geek | `sv-1.0-pro-fast-480p` | 文生 | 组合型号解析失败：ModelName SV is invalid |
| Geek | `sv-1.5-pro-480p-mute` | 文生 | 组合型号解析失败：ModelName SV is invalid |

APIB最初两条参数失败的任务均为供应商终态失败，回执 `cost=0`、`credits_cost=0`；改参数后的请求使用新的独立操作ID，原任务未重放。Geek无ID超时、502或其他错误均保留原请求指纹/时间/操作ID；没有将HTTP错误当成未扣费证明。正式资料未提供按操作ID恢复Seedance任务的只读接口。

### 未下结论的目录项

- APIB：`seedance-2.0-face`、`seedance-2.0-fast-face`、两个旧 `grok-imagine-*-video-apimart`、`wan2.6-i2v`、两个 `ltx-2.3-*-video` 精确ID缺少可确认的现行调用契约，未猜测提交。两个Kling motion-control需要合规的人物动作参考素材，本次未构造此类素材，未标为可用。两个当前文档ID `gemini-omni-1.1-flash-ext`、`grok-imagine-1.5-video-ext` 不在当前密钥目录。
- Geek：当前目录的分辨率、音频、offpeak、历史版本别名很多；本次只确认表中精确ID，不能外推其他SKU。`wan2.6-t2v/i2v` 裸ID、Pixverse、wand-vega、video-ultra、aicc及部分manxue别名未找到精确正式契约，继续标为未知。Sora、Veo等文档中的型号不在当前密钥目录，没有冒充已支持。

## 接口及参数差异

- APIB创建：`POST https://api.apib.ai/v1/videos/generations`；受理后保存 `data[0].task_id`。真实可用查询统一为 `GET /v1/tasks/{task_id}`。Kling V4关联文档的另一查询路径实际报错，按供应商错误指引修正轮询原任务后成功，没有重发创建。
- Geek创建：`POST https://www.geeknow.top/v1/videos`；查询 `GET /v1/videos/{task_id}`。响应可能采用普通status/video_url、H3 task/content或Wan output结构，分别归一化。Seedance1.5按正式multipart契约发送；本次三档均未取得任务ID。
- APIB合成首帧上传 `POST /v1/uploads/images` 实测200并返回HTTPS URL；未发送用户素材。返回存储链接的下载请求不携带供应商Bearer。
- Grok应显式传支持的比例；Hailuo02的512p只可用于带首帧的模式；Hailuo2.3 Fast应按图生处理。规格桶不保证像素完全相等，例如Vidu 540p样例为960×528，Seedance部分480p样例为864×496；后台应保留实际输出尺寸。

## 余额面板交接

「Naumi · 管理后台与积分定价」已确认接收并负责实现，复用既有 `origin/codex/provider-health-20261021@d06ec139` 基础。已把正式路径、精确origin、当前回执、单位边界和视频调用差异交给该线程。本任务没有将“已交接”写成“已上线”。
- APIB `GET https://api.apib.ai/v1/user/balance` 实测200，顶层 `success/remain_balance/used_balance` 是账户级信息；响应没有currency/unit。APIB公开站点配置的USD仅是展示提示，面板不能根据供应商名称/协议自动确认结算单位。
- Geek同路径404。其 `GET /api/usage/token/` 实测200，当前密钥 `unlimited_quota=true`；负数剩余额度与subscription的100000000占位值不能叫账户资金余额。应明确显示密钥不限额、账户余额未知。
- 余额请求需由服务端发起，缓存/手动刷新，显示采集时间和错误/未知状态；金额失败不能回填0，不把密钥或原始响应送到浏览器。

## 费用与证据

APIB各任务当前回执 `cost` 合计 **11.037970**、`credits_cost` 合计 **110.379700**；这里按原字段记录，未在回执给出单位时不擅自写美元。若仍有在途任务，此合计尚非终态结算。Geek任务回执没有逐次成本；聚合账户用量含其他在线业务，不能当本次净消费。
私有持久化原始回执/视频：47 `/opt/naumi-staging/data/scratch-skills-curation47/isolated-provider-probes/provider-video-probe-20261023/`，目录0700、回执/视频0600。原始签名URL只保留在私有回执内。
本地证据：独立worktree `output/provider-video-probe-20261023/`，包括公开契约快照、请求计划、逐轮安全摘要、最终JSONL/CSV、8帧联系表和2个合成示例MP4。供应商密钥未离开47。
本任务基线为 `origin/main@7b1e970c84006c2fb76f8c1748e96da128e12982`，独立分支 `codex/provider-video-probe-20261023`。仅提交本报告，不合并/发布产品。

## 正式资料

- [APIB状态/文档关联](https://api.apib.ai/api/status)、[APIMart视频与任务契约](https://docs.apimart.ai/en/api-reference/tasks/status.md)、[素材上传](https://docs.apimart.ai/en/api-reference/uploads/images.md)。
- [账户级余额及单位](https://docs.apimart.ai/en/api-reference/account/user-balance.md)。
- [Geek视频矩阵](https://docs.geeknow.ai/api-reference/videos/model-matrix)、[国产视频统一协议](https://docs.geeknow.ai/api-reference/videos/aigc/generation)、[账户接口](https://docs.geeknow.ai/api-reference/account/billing)。
