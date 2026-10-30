# 即梦／香蕉：自适应画幅与编辑能力合同修复

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
- Canvas 新请求保留 `ratioMode=automatic` 与从原图得到的比例，不把优化后的上传尺寸当原图。服务端优先已支持的精确画幅；只有新自动请求找不到可执行精确画幅时，才选择已发布native-auto，并在计划保留 `automaticFrame.sourceRatio`、显示实际模式。显式比例、像素、蒙版、抠图及历史重计划不改变；不裁剪、不拉伸、不降低原图规格。
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

**源码/本地验证、main整合、程序部署、模型配置发布、真实付费出图是五个不同状态。** 本轮没有线上改配置、部署、付费调用或重放历史任务。旧客户端若已将auto解析成数值且无新标记，仍按原显式比例处理；更新页面后使用新合同。精确自定义Seedream像素合同、其他工具旧专用入口和所有线上历史X6报告不在本次“已通过”结论中。

证据目录：`output/capacity-audit-wave2-20261029/x6-auto-fix-20261030/`。MODIFIED_FILE保留修改；ROLLBACK只恢复有marker的独立副本。
