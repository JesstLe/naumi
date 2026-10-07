# APIMart 默认生图预设（2026-10-07）

## 交付状态与核验

代码基线 `172a4e444b779e233f9ff0441fae4894928348f6`，分支 `codex/supplier-cost-reconciliation`。本版复用 PostgreSQL 模型草稿/不可变发布版本、供应商调用账本、积分钱包事务、预占、Agent 工具桥和现有画布任务恢复。

**生产默认实际模型尚未确认，未部署、未启用预设。** 本次 SSH 只读检查曾取得 `MemAvailable: 74208 kB`；Docker 查询无响应后 SSH 断开，再次只读查询超时。没有修改生产配置、数据库、媒体或 NAS。生产准确模型必须从当前生效配置及该账户可用模型目录核对，不能把历史环境变量、相似名称或官方示例当作生产事实。

已检查官方文档（不是生产 ID 证据）：

- [原生 GPT Image 2.5](https://docs.apimart.ai/en/api-reference/images/gpt-image-2.5/generation.md)：文档列出 `gpt-image-2.5-flare` / `gpt-image-2.5-sunburst`；`quality`、小写 `resolution: 1k/2k/4k`、比例 `size`；参考图用公开 URL，支持 PNG Data URL 蒙版及透明背景。
- EXT 文档列出 `gpt-image-2.5-ext`，配合已核验的 `version`，分辨率大写 `1K/2K/4K`，不传 quality。
- 上传：`POST /v1/uploads/images`，multipart `file`，读取顶层 `url`；生成提交兼容 `data.id` / 单项 `data[0].task_id`，查询原任务 `GET /v1/tasks/{id}`。官方能力与真实账户授权仍需分别核对。
- 4K 是档位：原生文档正方形为 2880×2880、16:9 为 3840×2160，不等同所有边长 4096。模型能力须维护核验像素矩阵。

## 管理员操作

入口：`/admin/billing` → **APIMart 默认预设**。

1. 点击“建立默认预设（倍率 1.5）”。仅创建关闭的草稿，不猜上游 ID，不填零成本；已有预设不会被初始化、重启或重复迁移覆盖。
2. 从已有上游目录选择准确的 APIMart 图片模型，供应商密钥沿用服务端凭据库。填写当前默认模型与能力核验来源，再确认核验标记。
3. 维护公开 ID/名称（默认 `gpt-image2.5` / 灵动2.5）、原默认公开 ID、quality 传递/过滤、需要时的 version、蒙版能力、分辨率/比例映射和像素矩阵。
4. 设置完整 API 采购成本或输入/输出/缓存/图片输入 token 价格、估算用量、USD 换算凭据、积分兑换/舍入、每张用户授权售价上限、倍率。未知成本不允许作为零发布；按张/次包价与 token 价互斥。
5. “保存草稿” → “校验并预览发布差异” → 填原因 → “确认发布”。只有后端权限/能力/价格校验及 Router 配置准备、激活确认完成后，才更换生效指针。失败保留上一版本。
6. 发布记录可回滚到之前版本；关闭预设不会改写原绑定或原功能价格。新任务用新版本；在途任务用已保存的模型、参数、采购价、倍率、换算及授权快照。

默认入口按服务器 `image.generate` / `image.edit` 用途统一选择预设：普通生图、套图/A+、工具箱使用默认图片编辑的功能、画布生图/改字/扩图/批注，以及 Agent 的内部工具请求。独立 Replicate 超分、独立抠图处理器、文字/视频、显式非默认模型、BYOK 不被错误改成 APIMart。

## 执行与参数

- `灵动2.5`、`gpt-image2.5` 及被纳入的原默认公开 ID 在服务端归一化到同一个已核验上游，公开 ID 与供应商 wire ID 分开。
- low → low；medium、high、xhigh、max、auto（含兼容“超高”输入）→ medium。前端目录保留质量档；请求参数与有效参数单独存储、报价/结算使用有效规格。
- 不支持 quality 时省略该 wire 参数，不隐藏前端质量档。
- 原生支持的分辨率、比例使用管理员核验格式传递，并验收返回像素。矩阵缺失的组合及不支持的档位只给提示词约束，不自动放大伪装成原生 4K。
- 预设使用应用服务内的持久 APIMart 适配器；未改忽略目录中的 Go Router 源码。旧版本任务保留原 Router 路径。发布机制仍按现有 Router 确认协议运行；不新增负载均衡或复杂路由。
- 每个稳定输出操作只允许一次付费 POST；任务 ID 保存后，恢复只 GET 原任务。受理状态不明但缺少 ID 时保留待核查，不自行重复生成。下载/像素验收后才标记计费可交付，供应商完成状态本身不等于客户交付。

## 成本及积分

1. 单任务供应商报告的总费用优先，包含已计入的输入输出，不再叠加 token。
2. 实际费用缺失时，用真实 usage × 冻结采购价估算；确认为完整按张/次包价的配置按相应计费单位估算，标“估算”。字段缺失与真实 0 区分；估算条件不齐则待核账。
3. 金额内部采用 BigInt 有理数，采购价、usage、汇率和倍率不逐步截断；最终积分按冻结规则舍入。预算汇率标折算估计，不拿账户余额差额分配给并发用户。
4. 生成前展示估算与最高授权额度，由用户确认后预占。实际售价为完整 API 成本人民币 × 冻结倍率；超过授权上限进入人工核对，不额外扣款。
5. 模拟样例：完整成本 ¥0.50 × 1.5 = ¥0.75；当前 bootstrap 基础兑换为 10 积分/人民币（不计礼包赠送），向上取整扣 8 积分。两张总价 ¥1.50 一次最终取整扣 15 积分，不先各自取整为 16。
6. 失败/未交付用户收费为 0，供应商实际收费仍留成本账本；重复回调/轮询/结算无重复扣费。费用迟到可由原任务查询补结算；确认下调可幂等返还已扣差额，确认上调只列异常，不自动追加扣费。
7. 画布和图片任务交付但费用未知时保留账务待核对及预占，不将缺失成本当作免费。补偿不再次生成。日志记录公开/实际模型、请求/有效参数、task ID、输入输出用量、成本来源、费用、倍率、最终积分和调整记录，不记录提示词、URL 或密钥。

后台利润口径是 **售价减 API 成本**；不混入固定月费用。1.5 倍为加价 50%，其他费用扣除前 API 毛利率约 33.33%；实际积分舍入可能影响计价收入。成本未齐时不显示最终利润。

## 数据迁移与接口

迁移：`scripts/migrations/20261007-apimart-default-preset.sql`，新增草稿 `app_model_image_presets`、调用参数/稳定计费单元字段、`app_billing_api_cost_reviews`；幂等增量 DDL，运行时 ensureSchema 同步创建。不可变发布版本 JSON 保存 `defaultImagePreset`，没有覆盖旧版本或初始化生产上游 ID。

复用接口：

| 接口 | 用途 |
|---|---|
| GET `/api/admin/bi/model-config` | 管理员读草稿、生效版本、计费配置 |
| PUT `/api/admin/bi/model-config/draft` | `{id, expectedRevision, config}` 保存草稿及预设 |
| POST `/api/admin/bi/model-config/validate` | 完整校验和发布差异 |
| POST `/api/admin/bi/model-config` | 既有发布协议：版本、修订、原因、幂等发布 ID |
| GET `/api/admin/bi/model-config/versions` | 历史/回滚入口，沿用既有恢复协议 |
| GET `/api/models?feature=...`、`/api/config` | 已生效模型目录，前端无需新增硬编码 |
| POST `/api/billing/quote` | 估算积分、authorizedCredits、reserveCredits、modelVersion、请求/有效参数 |
| GET `/api/admin/supplier-cost/operations/{operationId}` | 调用链、参数、费用、最终扣费和退款修订 |

提交沿用 `x-naumi-billing-version`、`x-naumi-model-version`、`x-naumi-billing-operation-id`；成本加价模式的 `x-naumi-billing-credits` 必须是用户确认的 authorizedCredits，不是仅估算值。前端确认和 Agent 确认闸已接通。

## 验收与剩余事项

仅隔离 PostgreSQL、本地 HTTP mock、模拟图片；真实收费 API 调用为 0。

- `npm run verify:apimart-preset`：别名、所有质量上限、映射/参数过滤、上传/蒙版、总价优先、usage 全维度、零/缺失/迟到费用、锁价/额度、重复结算/退款、恢复仅 GET、数据库重开、版本应用/回滚、画布待核账保留预占。
- `npm run verify:apimart-preset-entries`：真实普通生图 route 两个别名/多图、工具精修 2K、画布改字任务、Agent generate_image 桥 4K、幂等提交、总价积分舍入；实际 HTTP 都发向本地 mock。
- `npm run verify:apimart-preset-ui`：浏览器建预设/编辑/保存/应用/刷新、倍率改价、桌面/移动布局、非管理员 404、真实本地 Go Router 激活确认。
- 既有钱包、计费、工具、异步任务、模型配置/执行/发布、业务路由、供应商账本与权限回归均记录到 `output/apimart-preset-20261007/regression-test.txt`；typecheck/build 另有日志。
- 最终 `npx tsc --noEmit`、预设/真实入口回归及 `verify:model-router-contract` 均退出 0；`npm run build` 成功完成生产编译和 86 个静态页面生成。Node→Go 发布契约使用真实本地 Router 验证，不把浏览器静态界面视作发布成功。构建环境仅使用隔离数据库与 fixture 凭据，保留现有两处 canvas `<img>` lint 警告。

**剩余阻塞**：生产连接/资源恢复后，读取生效版本和准确 APIMart 上游 ID，核对账户能力及各规格完整采购价、人民币换算凭据、生产积分规则与授权上限，再填写预设并发布。不以官方文档候选、fixture 或 ¥0.50 样例作为生产默认/固定报价；付费真实能力测试需另行确认预算。

## 回滚

- 业务配置：发布记录回滚到启用预设前版本，或关闭预设并按既有流程应用。原默认绑定/功能价格未被覆盖；已经提交的任务继续沿用冻结配置。
- 程序：保留发布前固定版本镜像和配置备份，通过既有 `scripts/deploy-release.sh` 的回滚流程恢复。回滚到不识别 api-cost-plus 的旧程序之前，应先让该版本在途预设任务完成/核账，或保留新 worker 专门处理，避免丢失恢复链。
- 数据迁移为增量：回滚不 DROP 成本/费用修订表，不删除订单/媒体，不重置生产数据库。
- 本次 `output/apimart-preset-20261007/ROLLBACK.sh` 只在新建副本中还原原始代码并运行基线验收，不是生产回滚。

完整改动清单与精确命令/结果见本次 `DIFF_FILE` 和 `VERIFICATION.txt`，修改源码归档为 `MODIFIED_FILE`，原始归档 hash 单独保存。
