# 图片生成上游与中转调研

更新时间：2026-09-19

## 决策结论

Naumi 的首个隔离技术上游选择 `APIMart`，通过私有 New API 和
`naumi-router` 验证统一模型目录、路由策略、编辑能力和实际扣费。该选择不等于
生产授权；在取得 APIMart 书面商业许可前，不接入客户流量。

推荐的商业链路：

```text
Naumi 无限画布 -> 私有 New API -> naumi-router -> APIMart（隔离技术验证）
```

Naumi 应向客户交付完整的生图产品，不出售上游 API Key、账号访问权或透明转发接口。New API 负责统一模型别名和内部服务凭证，`naumi-router` 负责成本、质量、编辑能力和安全回退策略。低价中转站只有在完成书面转售授权、同提示词画质测试、真实扣费测试和故障测试后，才允许进入生产流量。

## 已确认的基准价格

### OpenAI 源头

GPT Image 2.5 Flare / Sunburst 的公开 Token 单价相同：

- 文本输入：`$5 / 1M tokens`
- 图片输入：`$8 / 1M tokens`
- 缓存图片输入：`$2 / 1M tokens`
- 图片输出：`$30 / 1M tokens`

来源：

- <https://developers.openai.com/api/docs/models/gpt-image-2.5-flare>
- <https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst>
- <https://developers.openai.com/zh-Hans/api/docs/pricing>

OpenAI 允许把 API 集成进面向终端用户的应用，但不允许出售或转移 API Key，也不允许转售账号访问权：<https://openai.com/policies/services-agreement/>。

### fal.ai

fal.ai 公布的 GPT Image 2.5 文生图 4K 单张价格：

| 质量 | 美元/张 | 按 `$1 = ¥7.10` 粗算 |
|---|---:|---:|
| low | $0.01113 | ¥0.0790 |
| medium | $0.02595 | ¥0.1842 |
| high | $0.10008 | ¥0.7106 |
| xhigh | $0.17790 | ¥1.2631 |
| max | $0.40026 | ¥2.8418 |

来源：<https://fal.ai/gpt-image-2.5>。

fal 的 API 补充条款明确覆盖将 API 集成到面向终端用户的 `Client Solution`，但不等于允许出售 fal 账号、Key 或裸 API 服务：<https://fal.ai/legal/api-services>。

### APIMart

APIMart 的公开价格：

| 模型 | 1K | 2K | 4K |
|---|---:|---:|---:|
| `gpt-image-2.5-ext` | $0.0085 | $0.014 | $0.021 |

来源：<https://apimart.ai/zh/pricing>。

其公开条款禁止未经授权的 API 转售、再分发或白标，因此不能把该价格直接当作 Naumi 的合法生产成本：<https://apimart.ai/zh/terms>。

### CUN.AI

2026-09-19 登录后页面观察：

- `gemini-3.1-flash-image-preview`：`$0.10 / 请求`
- `gemini-3-pro-image-preview`：`$0.125 / 请求`
- `gpt-image-2`：`$0.125 / 请求`
- `gpt-image-2.5-flare`：`$0.125 / 请求`
- `gpt-image-2.5-sunburst`：`$0.125 / 请求`
- 首次充值页面显示付 `¥695` 获得 `$151.50` 钱包额度，等效约 `¥4.587 / 钱包美元`

按该充值档计算：

- `$0.10 / 请求` 的现金成本约 `¥0.459 / 请求`
- `$0.125 / 请求` 的现金成本约 `¥0.573 / 请求`

因此固定按次的 CUN Image 系列不适合按 `¥0.40 / 张` 销售。按 Token 计费的三个 Gemini 图片模型仍需真实账单测试，不能用固定按次结论替代。

## ¥0.40/张的单位经济

以 fal 4K medium 为生产基准：

| 指标 | 数值 |
|---|---:|
| 售价 | ¥0.4000 |
| 上游成本 | ¥0.1842 |
| 单张毛利 | ¥0.2158 |
| 毛利率 | 53.94% |
| 10,000 张毛利 | 约 ¥2,158 |

以上未扣除支付手续费、对象存储、图片下行带宽、审核、失败重试、退款和客服成本。

APIMart 4K 的粗算成本为 `¥0.1491 / 张`，只比 fal 节省约 `¥0.0351 / 张`，即每 10,000 张约节省 `¥351`。在没有书面转售授权时，这个价差不足以覆盖封号、断供、余额损失和合规风险。

## 禾维 AI 排行榜观察

来源页面：<https://www.hvoyai.com/leaderboard?tab=gptimage2>。以下是 2026-09-19 的小范围人工观察，仅用于候选发现；按禾维 AI 的用户协议要求注明来源和时间，不用于批量再发布或替代其数据服务。

页面摘要：

- GPT Image 2 实测站点：23 个
- 页面显示平均在线率：87%
- 页面显示价格区间：`¥0.03 - ¥1.3`
- 默认排序是“精选”，列表中包含明确标记的广告项，所以默认顺序不是纯价格榜或可靠性榜。
- 页面称指标由独立 API Key 定时轮询产生，但站点条款同时说明收录、排名、价格与可用性可能延迟、不完整或不准确，不构成信誉、付款或持续运营保证。

来源与限制：

- 排行榜：<https://www.hvoyai.com/leaderboard?tab=gptimage2>
- GPT Image 2 聚合页：<https://www.hvoyai.com/models/gpt-image-2/>
- 禾维 AI 用户协议：<https://www.hvoyai.com/terms>

### 页面可见候选

| 站点/渠道 | 页面价格 | 在线率 | 延迟 | 当前判断 |
|---|---:|---:|---:|---|
| MuzeAI / `gpt-image` | ¥0.06/次 | 89% | 31s | 价格低，但未标分辨率/质量，转售授权未确认 |
| 浮生云算 / `生图非4k` | ¥0.03/次 | 86% | 25.1s | 明确非 4K，不能和 4K 商品比较 |
| 汪汪の中转站 / `gpt-image-2快速` | ¥0.03/次 | 91% | 38.5s | “快速”档，未证明等价于 4K medium |
| Lietio / `image2 4K` | ¥0.12/次 | 84% | 32s | 需要核对是否原生 4K；详情页另有“超分4k”口径 |
| 天枢 / `生图专用` | ¥0.14/次 | 91% | 29s | 规格和转售权均未确认 |
| Moe Api / `自营GPT生图-原生` | ¥0.15/次 | 89% | 40.3s | 官网声明仅面向中国大陆以外用户，且仍处配置优化期 |
| AnPin AI / `image2-图片生成` | 未展示 | 96% | 32.1s | 稳定率较高，价格未知 |
| MuskAI / `按次生图专用` | 未展示 | 100% | 21.5s | 指标好看，但价格、规格和样本量未展示 |

### 已发现的数据冲突

1. 排行榜把 Lietio 的 `image2 4K` 显示为 `¥0.12/次`；禾维 AI 的 Lietio 详情页另列 `1K ¥0.02/次`、`超分4k ¥0.05/次`、`default ¥0.08/次`。这说明渠道、抓取时间或规格口径不同，不能直接取最低值。
2. 排行榜把 Moe Api 显示为 `¥0.15/次`；其站点详情页显示 `自营生图分组 ¥0.04/次`，而 Moe 官网又声明仍在配置优化期。该候选不具备生产可用结论。
3. 汪汪排行榜显示“快速”档 `¥0.03/次`；其他公开价格页出现 1K/2K/4K 分档。必须通过实际账号模型目录与账单确认当前价格。
4. 排行榜的 `¥0.03` 最低值包含“非 4K”和“快速”商品，不能用来推翻 fal 4K medium 的成本基准。

相关详情：

- Lietio：<https://www.hvoyai.com/sites/lietiocom/>
- MuzeAI：<https://www.hvoyai.com/sites/apimuzeaitop/>
- 汪汪の中转站：<https://www.hvoyai.com/sites/apihyhawangcom/>
- Moe Api：<https://www.hvoyai.com/sites/moeapicloud/>
- Moe 官网访问资格说明：<https://moeapi.cloud/>

## 外部搜索补充：独立 API 站与中文价格目录

以下结果来自 2026-09-19 对 Google、独立模型站、TokenPlus 与 GetCheapAI 的补充搜索。价格只表示站点当前公开口径，不代表模型真实性、原生分辨率、稳定性或商业授权已经通过验证。

| 候选 | 当前公开价格 | 商业/规格信号 | 当前判断 |
|---|---:|---|---|
| reAPI GPT Image 2.5 | Flare `$0.0173/张`；Sunburst `$0.023/张` | 文档称 Standard 路由不随 1K-4K 和质量档变化；失败退款；条款禁止在不披露 reAPI 的情况下伪装成自有服务转售 | **第一实测候选**，但 Naumi 若不披露上游，必须先取得书面许可 |
| 清风 API GPT Image 2 | 4K 标准 `¥0.08/张`；4K Pro `¥0.12/张` | 文档声称输出精确到 `3840×2160` / `2160×3840`，失败退款；未找到可核验的商业转售条款 | **第一实测候选**，先索取公司主体和书面产品集成授权 |
| 云马 AI GPT Image 2 | 4K `¥0.10/张` | 文档声称支持精确 4K；商业条款未闭环 | 第二批小额实测候选 |
| Atlas Cloud GPT Image 2.5 | 模型页称文生图起价 `$0.004`、编辑 `$0.006` | 另一个价格页和 Token 计费示例与该数字不一致；条款允许有实质增值的客户产品，但禁止裸 API/薄包装转售 | 商业形态较匹配，但价格冲突解决前不充值 |
| APIMODELS GPT Image 2.5 | 4K low / medium / high：`$0.020 / $0.045 / $0.15`；GPT Image 2 Lite 4K `$0.025` | 仅成功任务收费；条款规定未经书面许可不得转售平台服务 | 技术候选；4K medium 毛利偏薄，且必须先拿书面许可 |
| Sukidata GPT Image 2 | 4K `$0.08/张` | 文档支持应用集成、幂等请求和失败退款；条款禁止出售或公开共享账号/API Key | 规格清晰，但按 `¥0.40/张` 销售会亏损，暂不采用 |
| APICLAN GPT Image 2.5 | 4K `$0.1072/张` | 公开 46 次计费样本；其 4K 实测为 `3584×2016`，不是 `3840×2160` | 成本过高，仅作为实测规格参考 |

直接来源：

- reAPI 模型文档：<https://reapi.ai/docs/gpt-image-2-5>
- reAPI 服务条款：<https://reapi.ai/terms>
- 清风 API 文档：<https://api.qingfengai.org/docs/image2>
- 云马 AI 文档：<https://yunma.ai/docs/image-gen/>
- Atlas Cloud 模型页：<https://www.atlascloud.ai/models/gpt-image-2.5>
- Atlas Cloud 可接受使用政策：<https://www.atlascloud.ai/docs/acceptable-use>
- APIMODELS GPT Image 2.5 文档：<https://apimodels.app/ko/docs/gpt-image-2-5>
- APIMODELS 服务条款：<https://apimodels.app/terms>
- Sukidata 图片 API：<https://www.sukidata.com/products/image-api>
- Sukidata 服务条款：<https://www.sukidata.com/terms>
- APICLAN GPT Image 2.5 指南：<https://apiclan.us/guides/models/gpt-image-2.5>

### 价格目录中发现但尚不能采用的线索

TokenPlus 共收录约 199 个 `gpt-image-2` 相关中转商品，其中可见 `x-llm`、`Modelsell`、`TokenShop`、`UoCode`、云枢 API、FlowBridge、iKun API 等低价条目；GetCheapAI 也收录了多家渠道。这两类目录适合发现候选，但页面明确或事实上缺少统一的真实分辨率、质量档、模型真伪、在线率、失败退款和商业授权验证，不能把最低价直接放进 Naumi 的生产成本表。

- TokenPlus：<https://www.tokenplus.app/>
- GetCheapAI：<https://www.getcheapai.com/zh-cn/provider>

### 新候选的 `¥0.40/张` 粗算

按 `$1 = ¥7.10`，且暂不计支付、存储、带宽、重试和客服成本：

| 路线 | 粗算成本 | 单张毛利 | 毛利率 |
|---|---:|---:|---:|
| reAPI Flare Standard | ¥0.1228 | ¥0.2772 | 69.29% |
| reAPI Sunburst Standard | ¥0.1633 | ¥0.2367 | 59.18% |
| 清风 4K 标准 | ¥0.0800 | ¥0.3200 | 80.00% |
| 清风 4K Pro | ¥0.1200 | ¥0.2800 | 70.00% |
| 云马 4K | ¥0.1000 | ¥0.3000 | 75.00% |
| APIMODELS 4K medium | ¥0.3195 | ¥0.0805 | 20.13% |
| Sukidata 4K | ¥0.5680 | -¥0.1680 | -42.00% |
| APICLAN 4K | ¥0.7611 | -¥0.3611 | -90.28% |

这些毛利只用于排列实测优先级。reAPI 的“所有尺寸/质量同一 Standard 价格”尤其需要验证其真实输出和质量；清风与云马则需要先补齐经营主体、上游来源和书面商业授权。

## 上线前验证门槛

候选上游只有同时满足以下条件才能接入 Naumi 的生产流量：

1. **书面商业授权**：明确允许集成进面向终端用户的收费产品；不能只依据“兼容 OpenAI API”推断允许转售。
2. **真实规格**：保存上游返回的原始图片并检查像素尺寸；原生 4K 与后处理超分必须分别标注。
3. **同提示词盲测**：至少 10 组提示词，对比文字准确性、人物/商品一致性、编辑保真、细节和可用率。
4. **真实账单**：验证 1K/2K/4K、各质量档、参考图输入、失败请求和重试的实际扣费。
5. **可靠性**：测量成功率、P50/P95 延迟、超时、429/5xx、失败退款和并发限制。
6. **数据与安全**：确认是否记录提示词、参考图和输出，是否允许删除，以及 API Key 的权限和泄露处置。
7. **供应风险**：只做小额、随用随充；默认主备双上游，不能把客户余额等价地预存到不透明中转站。

## 当前供应商分层

### 当前隔离技术验证

- `APIMart`：先验证私有 New API、Naumi Router 和无限画布的完整链路；未取得书面商业授权前不进入生产流量。

### 条件候选

- `fal.ai`：价格透明、产品集成条款较清晰，保留为备线和生产候选。
- `reAPI`：本轮最值得实测的海外候选；若 Naumi 不向客户披露 reAPI，必须先取得书面许可。
- `清风 API`：本轮最值得实测的中文候选；价格有吸引力，但主体、上游与商业授权尚未闭环。
- `云马 AI`：4K 公开价低，作为第二批验证对象。
- `Atlas Cloud`：允许有实质增值的客户产品，但公开价格口径冲突，先要求正式报价。
- `APIMODELS`：技术文档完整，但禁止未经许可转售服务，4K medium 的毛利也明显低于 fal。
- `Lietio`、`MuzeAI`、`汪汪の中转站`、`天枢`：仅作为小额验证候选；规格、上游性质和商业授权均未闭环。

### 暂不采用

- `CUN.AI` 固定按次 Image 档：按当前充值换算高于 `¥0.40/张` 的目标售价。
- `Sukidata`、`APICLAN`：4K 公开价已经高于目标售价。
- `Moe Api`：访问地区和当前营业阶段不适合作为现阶段生产上游。
- 任何标记为“非 4K”“超分 4K”但对外宣称原生 4K 的渠道。

## 下一步实验

在获得小额测试授权后，只做一次受控对比：

```text
fal 4K medium
vs.
reAPI Flare Standard
vs.
清风 4K 标准 / Pro
vs.
云马 4K
```

每个渠道使用相同 10 组提示词，保存原始响应、图片文件、像素尺寸、耗时、请求 ID 和扣费记录。测试前先取得允许接入收费终端产品的书面答复；测试完成后再决定正式主备线。在此之前，Naumi 的报价模型可继续用 fal 4K medium 做保守基准，但技术链路先用 APIMart 小额隔离验证。
