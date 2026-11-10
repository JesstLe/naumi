# APIB Image 2.6 接入准备

## 状态与来源

本轮用户要求“apib中已增加image2.6家族群，查看情况，并准备适配”。本模块完成实时目录核查、关联公开文档/报价留档、严格追加的离线禁用态候选和真实参数编译器验证。**未发布模型配置、未改现役出图代码、未启用新模型、未做供应商收费生成。**

- 分支：`codex/apib-image26-preparation-20261110`。
- 刷新 main 基线：`b678fa7042f4f528608ad96a62f476f398ef8a9d`。
- 47 实时配置基线：v153，digest `6715ff299048d3919b485708cec40d841ecae5e2cd92c9a7b330aba4829d2b62`。
- 2026-11-10 10:19 BJT，使用47现有APIB凭据仅在原供应商域名 GET `/v1/models`，HTTP200、319个目录项。密钥未输出、未落入源码/证据，也未发送给关联文档域名。
- 精确出现：`gpt-image-2.6-ext`、`gpt-image-2.6-flare`、`gpt-image-2.6-sunburst`、`mai-image-2.6`、`mai-image-2.6-flash`。
- GPT 三型号和 Microsoft MAI 两型号分别归家族；目录出现和 `supported_endpoint_types` 不是出图验收。
- APIB `/api/status` 指向 APIMart 关联文档。三页2.6文档和五份逐模型公开报价均GET200，逐URL/时间/完整body/hash保存在证据目录；文档是关联契约，不冒充APIB真实运行证明。

## 模块职责及数据归属

- `docs/providers/apib-image26-preparation-20261110.json`：精确型号、文档hash、保留门禁、独立能力/参数候选。
- `scripts/lib/apib-image26-preparation.mjs`：纯追加变换；校验输入版本、真实配置digest、目录来源及精确ID；保留当前已启用provider原字节。无网络、数据库、凭据解密、发布或执行入口。
- `scripts/prepare-apib-image26.mjs`：本地CLI，只输出新证据目录。候选只追加5个 `enabled=false / verified=false` upstream，不增加公开家族、不改路由/绑定/权重/采购/客户积分售价。
- 两个 `verify-apib-image26-*.ts`：调用原产品schema、参数编译器和adapter参数序列化，验证增量及恢复状态。
- 运行时仍归原 `apimartImagesFetch`、冻结参数计划、supplier ledger、作品/父子回执及账务模块。本次没有复制adapter、另建执行器或改变事务归属。

## 已准备的契约

### GPT-Image-2.6 Flare / Sunburst

- 复用上传→`POST /v1/images/generations`→原`task_id`查询的异步协议。
- 分辨率发送小写 `1k/2k/4k`；5个显式质量档位、15个命名比例和45项文档尺寸；最多16参考、单次1～4张。
- 蒙版/透明有文档依据，但仍未做本次APIB付费验证。输出只准备PNG/JPEG/WebP，不把GIF/SVG塞进静态图片交付链路。
- 文档允许精确像素，但当前 `supportsExactImageSize()`不含2.6；本模块未放宽它。任意尺寸、markup、complexity、GIF/SVG继续列为后续功能，不声明已支持。
- 不把`auto`质量当`low`：文档声明按max预占、按实际层级结算。本轮候选保留显式质量，避免自动套旧售价。

### GPT-Image-2.6 Ext

- 独立wire ID，显式固定 `version=flare`；未来若开放Sunburst，应保持独立版本选择/冻结，不静默改变历史通道。
- 1K/2K/4K；**n只能1**；10命名比例/auto，**不接任意像素**。
- 按version×resolution逐图计价，不套token型号采购规则；质量不改变其文档逐图价。
- 没有把标准型号的mask/透明能力复制给Ext。SVG页面枚举与“尚不支持”提示冲突，记录冲突，不开放。

### MAI-Image-2.6 / Flash

- 独立MAI家族，单次1张，只准备1K/2K，明确不支持4K；不发送quality。
- 文档最多5参考，但编辑会忽略尺寸/分辨率，由上游决定输出，故候选 `edit=false`，参考编辑继续held。
- 仅准备文档有明确尺寸表的13比例、26尺寸；修正成对比例表解析，未为其他整数比例猜像素。
- 部分32px网格输出不严格等于名义比例，现有交付比例验证不含MAI；必须完成独立边界验收后启用，未修改现役全局比例规则。
- web grounding、任意像素和参考编辑不算本轮已完成能力。

## 价格与冻结历史

- 五份报价的精确model_name均匹配。标准GPT和MAI返回有明确 `usd_per_million_tokens` 单位的token rates；Ext返回version_resolution价格观察，未在该JSON显式给出币种/计量单位。
- 公开effective_rates/default组/会员折扣不证明当前密钥实际结算组，预占表也不等于最终消耗。原始来源留档，不写procurement或客户售价，不拷贝2.5价格表。
- 新模型不挂回旧`gpt-image-2`公开身份，不篡改已受理任务。旧task继续使用原modelVersion、wire ID、报价与参数计划，不再次提交供应商。

## 集中验证

所有测试只使用本地数据/loopback，真实供应商POST及生产写入为0。

```powershell
node --import tsx --conditions=react-server scripts/verify-apib-image26-preparation.ts E:/Workspace/naumi/output/apib-image26-preparation-20261110
node --import tsx --conditions=react-server scripts/verify-apimart-async-contract.ts
node --import tsx --conditions=react-server scripts/verify-apimart-single-pass.ts
node --import tsx --conditions=react-server scripts/verify-image-parameter-plan.ts
```

包含新旧配置schema、严格追加、幂等、版本/digest/内容篡改、目录/ID/碰撞、旧字段保全、每型号真实映射及全命名尺寸、Ext数量/版本、MAI omit/4K/编辑门禁、未知比例拒绝，以及相邻一次映射/旧任务/原报价保全。最终结果以证据目录 `PREPARATION_TESTS_FINAL.json`为准。

基线/候选/独立副本回滚由 `verify-apib-image26-config.ts`核验。基线`NOT_PREPARED`预期exit1表示原配置尚无新型号，不称线上故障。候选仍禁用；回滚只恢复本地独立CONFIG副本，绝不回灌数据库。

本轮没有完整PG/HTTP/真实媒体存储/付费交付验收；Docker Desktop探针返回engine HTTP500，不将现有fixture证明充当本轮真实PG通过。类型检查结果、原始失败及纠正、四制品命令/字面输出/退出码保存在证据。

## 未完成与下一步

1. 明确客户公开家族入口、积分售价及采购规则；本模块未发布这些值。
2. 获得具体收费验收批次后，先做GPT Flare一张文生图和一张参考编辑，贯穿真实字节下载/作品保存/父子回执/账务；再覆盖Sunburst和Ext，不因超时重发未知请求。
3. MAI单独完成32网格交付比例、编辑尺寸及quality缺省的原生端到端验收；不能用GPT验收替代。
4. 只在固定精确型号/规格通过后，以新鲜live版本/CAS按原版本化发布协议启用；不改旧默认、不批量替换2.5。

证据根：`E:/Workspace/naumi/output/apib-image26-preparation-20261110/`。此记录不是生产启用通知。
