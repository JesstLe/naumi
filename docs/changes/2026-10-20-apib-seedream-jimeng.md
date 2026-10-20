# APIB Seedream 接入即梦：精确型号、来源契约与部署前置

## 授权与文件边界

用户要求给现有即梦配置 APIB，参数对齐；进一步明确 `seedream-5-0-pro` 为现有即梦5.0 Pro同型号备用，另外4.0/4.5/5.0 Flash/5.0 Lite作为独立型号，不将五型当Pro等价。

独立分支 `codex/apib-seedream-20261020`，基线 origin/main `038b840bed7dbfea86e230ce6b919918cb43189a`，不覆盖共享checkout的admin/team/canvas-action-menu改动。协调确认只本任务修改 apimart-preset.ts、runtime.ts catalog展示和新增精确wire preflight；不改simulate、billing、plan、dispatch、canvas、全局比例容差或裁切。通用requested/effective分辨率回退由统一线程独立模块负责，未借配置绕过其流程。

## 新鲜基线与来源

统一窗口提供 `E:/Workspace/naumi/output/seedream-config-handoff-20261020-r2/`，2026-10-20 11:31:14北京时间47单个PG REPEATABLE READ READ ONLY采样。model123/digest `b2a690938f291c005c814876ba05161539f76ab066094424fb13c11219b8607d`、billing8；当时pending/unknown publication0、三锁holder0不是锁预约。PRIVATE_MODEL/BILLING只留忽略目录校验，脱敏结构不是生产整包输入。正式窗口必须三锁内刷新运行代码/模型/计费/在途publication再CAS。

参数文档来自10/19已下载APIB关联APIMart公开原文，本轮逐个重读与SHA核验。10/20尝试公开文档刷新均TLS握手失败，记录于忽略目录 PUBLIC_DOCS.json，不声称原文当天重新采集成功。原文固定在 `docs/providers/evidence/apib-seedream-20261020/`，完整observations、具体像素、checkedAt/sha256位于契约 `docs/providers/apib-seedream-20261020.json`。这是来源契约，不是APIB账户实际付费交付证据。采购价未知，verified=false，不写人工价/metadata。

## 精确候选

- 原 `jimeng-image-5.0-pro` target仍为local-jimeng-50-pro，wire仍jimeng/jimeng-image-5.0-pro，原primary所有字段不改。原display1K/2K/4K、8比例、medium/标准、maxRefs10保持。
- 原无supplierRouting：新增priority策略，原primary priority1/weight1，APIB同型备用priority2/weight1。若以后已存在策略，只追加maxPriority+1备用，不改已有mode/weight/priority。不是把直连target改成混合pool。
- 独立公模：`jimeng-image-4.0`、`jimeng-image-4.5`、`jimeng-image-5.0-flash`、`jimeng-image-5.0-lite`，显示“即梦”系列，wire分别四个精确seedream ID；复制已授权21工具/画布范围但defaultFor为空，不更换默认。
- 5个upstream均保持globalverified=false，generate/edit按来源声明，medium标准且不发送不受支持的quality。capabilities.imagegen.edit明确记录文档来源/日期，不冒称收费核验。
- 4.0：显示/映射1K/2K/4K，原8比例；4.5：2K/4K，原8比例；Flash/Pro：1K/2K，wire原值，不复制ReverseHub1K→1.5k；Lite：2K/4K。1.5K/3K只保留来源观察，不自动映射成已有显示档。
- 所有新来源参考≤10，单个supplier POST n1。前台1–4张沿现有handler拆分为多个n1，数量不冒称模型native grouped4。4.x/Lite来源refs+n≤15，10refs+n1在边界内。
- mask/transparent/preserveIdentity/textAccuracy不开放新承诺，不继承GPT16refs。应用蒙版合成和供应商原生mask分开，未知能力不冒称支持。

### 像素与比例门禁

Pro/Flash公开1K表16:9=1312×736、9:16=736×1312，短边偏差2px超过当前1.01px容差。这两个备用比例先HOLD：执行白名单6比例，原Pro主通道仍8比例/4K，未缩减。Lite2K16:9/9:16与4K4:3/3:4/16:9/9:16/21:9共7项公开矩阵冲突，跨两档一致的执行白名单暂为1:1、3:2、2:3。完整比例与原始像素观察保留，LOCAL_PLAN.conflicts记录实际request/expectedPixels/imageRatioMismatch和ADAPTER_RATIO_UNSUPPORTED，不改全局容差、不裁切伪装。

### 分辨率回退合作契约

用户另授权通用分辨率回退：requested4K无4K可用来源时，effective取最高已支持档，报价/冻结/实际生成同档，不先失败付费、不自动放大成假4K。该模块由统一线程 `codex/image-resolution-fallback-20261020` 负责。

本任务APIMart adapter只补构参优先级：新非preset先从明确冻结facts或operation取有效档，quote.effectiveParameters最高；quote.requestedParameters仅原选审计。旧preset/无新effective合同的历史任务保留旧优先级。不新增Worker必需schema字段。精确wire能力列表仍仅Pro/Flash1K/2K；外层负责4K→2K，adapter不直接把4K字面偷改2K。比例/参考/mask等门禁不受分辨率回退豁免。

## 精确型号预检及历史恢复

新增 `seedream-preflight.ts` 只匹配5个精确wire ID，其他型号直接返回。原文MB未定义二进制，采用保守十进制10MB=10,000,000bytes、30MB=30,000,000bytes；拒绝10MB+1，非10MiB。generic adapter现有20MiB限制若更严仍保留，不能把30MB文档上限称当前30MB全部可用。

4.x/Lite：PNG/JPEG、≤10MB、≤36,000,000总像素、两边>14、宽高比闭区间[1/3,3]。Pro/Flash按来源≤30MB/36MP、两边>14、[1/16,16]；generic更窄MIME/字节边界保持。比例用整数交叉乘法，等端点允许，+1px越界拒绝。4.0提示词≤1000字符按Unicode code point(Array.from)计数；不是UTF16单元/用户可见字素，emoji1000通过1001拒绝；供应商未说明其内部字符算法，保留该未知不冒称实测。

接线位置：原adapter读取持久ledger previous后，仅无parameters且无task_id的新提交执行；在上传/paid POST/claim前拒绝。已有task回执或unknownmarker不跑新preflight，不清marker、不换任务、不重提。旧通用校验保留，本补丁不追溯重解释历史付费输入。

catalog只对启用的精确5wire、apimart-images且独立公模使用自身ratios fallback；已有provider.options.imageRatios、GPT preset、管理员显式option.parameters.ratios优先；有supplierRouting的Pro不被窄备用收缩；disabled/model非匹配/protocol非匹配不扩大显示。catalog是展示，真实helper/adapter独立验收。

## 计费与回滚

原21feature均无型号覆盖规则，复用通用quality-resolution费率；不改billing8、不新增采购价。统一线程提供252原始quote对照，本模块另对5个真实公模的11有效档×21features=231对照（1K6/2K8/4K12示例工具），requested/authorized/reserve/tariff逐项相同。后续管理员规则或billing版本变更则重新CAS审核。

候选55项delta：5个来源各10个字段，4个公模新增，1个Pro供应通道初始化。只对实际delta选择性逆转，不整库restore；原主通道后来权重/mode/priority、无关label/计费保留。新增公模或自有字段被改/新增依赖时HOLD不覆盖。

## 测试与状态

`scripts/verify-apib-seedream.ts`：210参数组合，11像素冲突、catalog四独立/Pro混合/disabled/非型号/非协议/admin优先、MB/36MP/比例端点/Unicode、真实adapter零上传零提交负向、有效2K原选4K实际wire、已接受任务仅查询、unknown不重提、隔离PG publication/同ID恢复/重复/选择性回滚。异步57回归、contract回归、既有即梦endpoint回归集中运行。旧即梦endpoint测试scope缺parameterMap导致既有TypeError，本次仅fixture补空对象，不改产品NewAPI处理器。

运行支持前置：本preflight+catalog+effective构参及合作通用回退代码须真正蓝绿部署、真实鉴权只读plan验收，再独立配置publication。5d不先APPLY。运维bundle包含管理逻辑不等于App已部署。统一生产唯一执行人仍da1fb6c5-ffa9-4da4-97eb-d71dc858b418；本任务SSH0/锁0/生成0/生产写入0，收费验收与巡检PAUSED，生产publication未创建。

实际集中命令/输入/输出/退出码、baseline/modified/rollback、SHA及bundle见忽略目录output/apib-seedream-20261020/VERIFICATION.txt。本模块功能计数1；开工/提交前刷新origin/main，未改共享分支，未触发生产发布/清理计数。

### 本次集中实测回执

2026-10-20本地集中验证：Seedream39项/210参数组合、11像素冲突、231真实quote对照通过；真实adapter requested4K/effective2K wire验证通过；输入负向0上传/0提交；历史receipt仅GET、unknown不重提。APIMart57项及16参考传输回归通过（仅证明GPT既有路径不受影响，不外推即梦16refs），旧即梦endpoint和contract通过；全量tsc无诊断exit0。

source副本回滚已对3个既有文件原SHA恢复、13新增文件只在副本删除，原工作区保留改后状态；重新运行基线source断言及既有即梦回归通过。新增source事务测试中的baseline PASS表示确认旧源码未接入Seedream专用门禁/catalog，不是旧产品已支持这些新参数。

运维交付采用仅delta recipe：bundle的PLAN不携带完整private/redacted配置，三锁内运行PLAN才从实时model/billing重建MATERIALIZED_PLAN与ORIGINAL快照；重建后的candidateDigest必须等于审核值，否则停止。禁止把脱敏全文写回数据库。证明包含已运行Web/Worker代码hash与App镜像仍由统一线程真正采集，bundle里打包新helper不冒充程序上线。

独立原文原始SHA/配置digest/源码与Git增量SHA、完整命令输入输出exit以及四制品路径在VERIFICATION.txt/HANDOFF.json。生产APPLY/真实公网plan/程序蓝绿尚未在本线程执行，不将本地完成称为线上可用。
