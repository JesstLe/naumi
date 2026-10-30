# 即梦／香蕉：自适应画幅与编辑能力合同修复

## 用户规则修正（同日后续，优先于下文首版方案）

用户明确：**显式选择比例就优先按该比例；供应商不支持时回退最接近的可用比例，最后才考虑auto；自适应就是跟随参考图比例，不是模型自由选画幅。** 两像素偏差不是拦截理由。

首版 `b2fad3c3` / main `82a7aa73` 只允许自动输入使用native-auto，并仍拒绝显式不支持的比例，未完全落实这条规则。该版本只合main，没有部署/配置发布；本节记录向前修正，不把首版称最终解决。

- 新增所属模块 `model-config/frame-fallback.ts`：优先原目标比例；枚举不支持时按 `abs(log(candidateAspect/targetAspect))` 排序，从当前已发布、启用且满足编辑/质量/分辨率的通道中选最近值。旧Reverse Hub使用同一距离定义。最后才使用明确发布的native-auto；fallback只在新计划发生，无新供应商POST。
- 原图941×1672自动→目标941:1672→最近9:16；显式16:9不被竖版参考图覆盖；显式9:21→Gemini已有1:2、当前Seedream候选9:16。精确可执行比例始终优先。原生auto末选也附带原参考/用户目标画幅，不让模型无目标自由选。
- `frameChoice`保存target/effective/source/method。报价保留原target与原选档，`effectiveRatio`单独编译实际wire；绑定、恢复、适配器按已冻结的有效值，不重新读取今天的比例列表。没有裁剪、拉伸或为比例差异重发收费请求。
- 蒙版需要原像素坐标、显式像素及已接受任务仍保留各自合同；它们不是普通比例选择的字符串回退。
- 父主矩阵修正版41项通过；首版82a在同一候选配置下23通过/18不满足新契约，exit1。18为断言差异，不是18个生产缺陷。实际冻结/报价/提交接线专项31项通过，实际执行`freezeBusinessQuote`与原生billing quote，不只返回手写报价；历史82a的native-auto成功与3065的原始拦截分别记录。
- 补充复现并修正方向别名二次路由：某通道只支持16:9时，原1:1报价冻结square别名，旧绑定却随回退比例改成landscape。可信内部step的已报价模型身份现在保持不变，实际wire仍16:9；reference/explicit两例均复验，初次失败证据保留。

### 为什么以前能用

1. **旧即梦确实有跟图最近比例。** 固定 `7c84453` 的 `reverseHubImageRequest()` 读参考图宽高并从8比例中按上述公式选最近值；941×1672会选9:16。`2026-10-12-jimeng-provider-onboarding.md:9`明确记录这个合同。当时显式不支持的比例仍会拒绝，本轮把用户新规则补到显式路径，不捏造旧版已全部实现。
2. **旧香蕉不是今天的APIB枚举链。** 固定 `b6d226e` 的 `new-api-image.ts::generateNewApiImage()` 走Prompt Hubs `/chat/completions`，引用图为image_url，配置size/resolution并补比例提示，无APIMart比例列表预检。`2026-10-10-multi-supplier-channels.md`记录生图/单参考编辑六次真实200；`2026-10-10-supplier-fallback-fix.md`记录Prompt Hubs Banana2参考编辑与唯一-6结算。
3. 后续 `a7a1b74b`（10/13）把未verified且无单项声明的edit变unknown；10/15文档已经记录一次香蕉新能力门槛误拦。`ac96076b`（10/17）又提前把auto精确GCD化；`bc6af06d`（10/27）加入APIMart枚举compiler拒绝。换到v152的APIB-only路径后，旧就近适配与编辑能力没有完整迁移，加上Seedream旧2px HOLD，导致现在的本地计划拒绝。
4. 旧成功记录不等于所有历史参数均实测；本轮没有核实APIB-only切换的具体操作者，不能由Git作者名推断。截图对应问题是本地拒绝，不是本次供应商响应参数错误。

修正版证据：`output/capacity-audit-wave2-20261029/x6-frame-rule-20261030/`。旧首版证据保留在下文目录，分别标识。

## 模块与职责

- 基线 main：`3065cf964e53ccac9865ab8b26d7da6359dcec94`。目标为用户截图中的 `941×1672 / medium / 1K / 3张 / 换成红色` 编辑入口，不将轮询修复等同于参数准入修复。
- 先前只读现场为 Web `b79c8c39 / 1793281629`、模型 v152、计费 v8。原图尺寸来自实际原对象读取；此文件不把该历史观察称为当前在线重新核验。
- `imagegen` 拥有用户画幅选择、输入权限、计划及报价身份；`model-config` 拥有已发布通道参数和冻结 wire 编译；APIMart 适配器仍负责原任务唯一 POST、查询/下载。此次不改变账务、租约、重试次数、像素处理或供应商凭据。

## 已确认根因与来源

1. Canvas 把“自适应”解析为原图精确 `941:1672`，APIB 枚举合同没有该值，compiler 先拒绝，最后误显示通用无通道。删除 compiler 校验并不能接通 admission、映射和冻结执行。
2. Banana 2 原配置 `edit=true / verified=false`、缺 `imagegen.edit`；目录按 bool 显示支持，而计划认为 unknown。
3. 即梦六比例来自 2026-10-20 的旧像素 HOLD：1K 9:16 实际表为736×1312，短边偏差2px。当前输出层已改为记录提示并保留完整图，旧配置未跟进。此次只恢复有来源的16:9/9:16，不扩全局精度容差。

来源：
- `docs/providers/evidence/apib-seedream-20261020/seedream-5-0-pro.md:601–651`，明确 `size=auto`、9:16和原生像素表；原文与摘要 hash 保存在 `docs/providers/apib-seedream-20261020.json`。
- `https://docs.apimart.ai/en/api-reference/images/gemini-3-pro/generation.md`，size与image_urls章节。
- `https://docs.apimart.ai/en/api-reference/images/gemini-3.1-flash/generation.md`，size与image_urls章节；2026-10-30只读GET核对。
- 上述为关联公开参数文档，**不是当前 APIB 付费运行验收**。原生auto不承诺返回原图的精确比例。

## 实现与迁移状态

- 新增可选 `apimartImages.automaticRatio={enabled,source,checkedAt}`。旧配置无字段时保持原拒绝；`false`保持关闭；缺发送字段拒绝发布/编译。只有显式发布的合同才能发送 `size=auto`，不按模型名字猜能力。
- 首版Canvas保留 `ratioMode=automatic` 与原图比例，曾在不支持时选择native-auto；**已被顶部用户规则修正取代**，新计划使用`frameChoice`，显式与自适应都先找最近可用比例。原图传输、蒙版及历史恢复保持。
- 请求绑定保留服务端冻结的auto，不将其变为1:1；逐通道参数计划、报价、nonce与原任务恢复继续复用。原4K→实际2K的既有分辨率映射与原选档报价保持。
- 普通公开模型目录的编辑能力与计划使用同一已发布能力口径；未知编辑和比例错误分别返回 `IMAGEGEN_EDIT_UNSUPPORTED` / `IMAGEGEN_RATIO_UNSUPPORTED`，不公开供应商排除详情。
- `repair-x6-automatic-parameters-policy.ts` 生成精确三个APIB来源的窄配置候选：三项auto声明、Flash缺失edit声明、Seedream已识别六比例历史HOLD的两个比例与四个尺寸。保留人工false/unsupported/unknown、禁用、verified=false、参考数量、quality/价格/路由等其余字段。
- 选择性配置逆变换 `rollbackX6AutomaticParameters()` 先完整检查所有改动字段，再返回副本；后续无关label保持，后续同字段修改拒绝覆盖。
- `scripts/ops/repair-x6-automatic-parameters.ts` 提供 PLAN/APPLY；发布复用 draft revision / expectedVersion / router publication，原publish ID在APPLY开始前落盘，unknown只核对同ID，不再次发布。该操作入口本轮**没有对生产执行**。

## 集中验证与证据层级

主测试：`node scripts/verify-x6-automatic-parameters.cjs`。

- 真实 plan、simulator、compiler、Canvas提交函数、异步适配器、Sharp及loopback HTTP；配置/权限/报价/账本存储为明确fixture。
- 覆盖三模型原图自动、显式3:4/不支持比例、旧版重计划、同原图精确画幅、Seedream9:16、4K映射、mask、目录编辑一致性、人工false、配置副本回滚、实际wire、同task恢复及丢ACK不重发。
- 专项 `verify-x6-frozen-auto.cjs` 使用此前脱敏v152完整快照：真实plan→quote保存/恢复→签名旧版本→withModelRequest→executor.resolve/describe→adapter参数，15项；另覆盖旧v152 3:4冻结报价及UNKNOWN零重放。repo/SQL为fixture，没有真实PG验收。
- 原生参数计划25项、分辨率46项、能力回归均通过。全项目TypeScript集中通过。具体最终结果、命令、退出码及准备失败保留在四产物的VERIFICATION。
- 首次主测试4项失败来自测试环境TextEncoder缺失和错误的fixture数组索引，不是产品反例；修正脚手架后重新跑原/改两版。所有本地HTTP已关闭，无真实供应商生成。

## 发布顺序与未完成项

1. main固定提交后，Web和Worker先更新到支持新schema的同版；旧实例/未知排空债按现有发布生命周期处理。
2. 在目标站受保护目录运行 `node --conditions react-server --import tsx scripts/ops/repair-x6-automatic-parameters.ts PLAN <absolute-evidence-dir>`；核对当前版本/digest、窄delta和供应商文档。
3. 同一发布窗口运行 `... APPLY <same-dir> <expectedVersion> <expectedDigest>`；明确核对applied、实际配置及计费未变。配置回退通过选择性逆变换生成新候选，再走同一CAS发布，非整库恢复。
4. 用真实认证的原图只读plan核对，再按明确生成验收安排取得实际供应商结果、私有作品和一次结算证据。

**源码/本地验证、main整合、程序部署、模型配置发布、真实付费出图是五个不同状态。** 本轮没有线上改配置、部署、付费调用或重放历史任务。修正版也对旧客户端传来的数值比例作最近可用比例解析；新页面额外保留“参考图/显式”来源标记。精确自定义Seedream像素合同、其他工具旧专用入口和所有线上历史X6报告不在本次“已通过”结论中。

证据目录：`output/capacity-audit-wave2-20261029/x6-auto-fix-20261030/`。MODIFIED_FILE保留修改；ROLLBACK只恢复有marker的独立副本。
