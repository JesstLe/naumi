# Flash 比例目录纠正

## 模块与职责

本切片只维护一次性的模型配置转换与原生 CAS 发布入口，不改线上镜像、账务、供应商重试或已接受任务。`repairX6FlashRatios` 是纯复制转换；运维入口通过既有 model administration 的 draft/revision/publication 发布，数据库与配置版本仍归该模块所有。

## 现场证据与实现

103 的 v116 配置中，Flash 的比例表含 `1:2/2:1`，与既有 GPT 专用表完全一致。2026-10-30 实际 GET `https://api.apib.ai/api/status` 返回的 `docs_link` 为 `https://docs.apimart.ai/`；其精确 Flash 文档 `https://docs.apimart.ai/en/api-reference/images/gemini-3.1-flash/generation.md` 的 size 枚举不含这两个值。

第一次真实 Flash 试验的 `9:21` 因此选到 `1:2`，供应商 submit HTTP400，无 task ID。现有有限错误证据未指出具体 parameter，因此不把此400直接当成供应商确认比例字段错误。原 operation `3927df36-5682-44a6-a4b7-c0d2df070a56` 保留原 failed / supplier unknown,pending、用户扣款0与释放6积分状态；不重发、不篡改为未受理。

新增转换仅匹配精确 APIB Flash 身份、协议、原12项列表，移除 `1:2/2:1`。原禁用或后续管理员改过的列表不覆盖；质量、分辨率映射、旧尺寸表、报价及其他通道保持。`9:21` 在纠正后现有列表中的最近值为 `9:16`。不增加新的超长比例。

## 公共接口与验证

- `scripts/repair-x6-flash-ratios-policy.ts`：纯转换与全字段预检的选择性反向转换。
- `scripts/ops/repair-x6-flash-ratios.ts`：PLAN/APPLY，expected version/digest，写前唯一 publication marker，billing digest 不变。
- `scripts/verify-x6-flash-ratios.cjs`：集中规则、真实最近比例函数、保留项与副本回滚检查。

源码测试及四产物在 `output/release103-frame-20261030/flash-ratios/`。线上 publication 和独立新操作验收以 [本轮发布记录](2026-10-30-release103-frame.md) 的最终记录为准；本文件的来源纠正不单独构成真实供应商成功结论。配置工具发布不需重构建已固定的程序镜像。
