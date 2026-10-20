# 图片分辨率自动回退（2026-10-20）

## 用户最新规则

- 所选分辨率无法被本次合格通道满足时，在受理前采用已发布支持的最高档位；有合格4K通道时保持4K。
- **报价不变，与前端保持一致**。4K选档原价12积分，即使实际2K，报价/预扣/成功结算仍12；不因回退变8。不修改售价表。
- 原选档与实际生成档分开记录；不自动放大、不把2K产物标4K。
- 仅分辨率回退，不放宽比例、参考数量、编辑/蒙版/透明能力；未知支持不猜。
- 请求1K但只支持2K/4K时也按“最高支持”选择4K，仍按原选1K报价；不是提高用户价格。

## 模块实现

1. resolution-fallback按显式映射/原生档位、ratio与像素矩阵、enabled provider/channel、管理员限制计算支持集；实际请求再用simulateModel检验其他必要能力。外部Router/阶段路由不偷偷删除必须候选。
2. requests/execution在新受理路径固定effective facts，原requestedParameters只做审计；沿用已有optional字段，不新增Worker必需schema。
3. business-billing按原选档计价，effectiveParameters保留实际执行档。现有业务积分规则、报价确认与原任务账务不变。
4. imagegen plan保留raw fingerprint，request/steps实际档位，warnings提示；内部generation/cutout步骤带服务器内存上下文传递原计价选项，HTTP调用方不得伪造。多步骤各自校验并固定实际档位。
5. legacy generate-image固定实际p.resolution，报价冻结在billingQuote；ReverseHub优先effectiveParameters。
6. BillingEstimate展示原报价及4K→2K/报价不变；提交toast说明实际变化，不暗改所选档或前端报价。

## 恢复和边界

- 自定义精确像素不降档；已冻结Execution/版本固定旧plan不重解释、不自动重提。
- 47/103均无本次SSH/锁/配置publication/候选/切流；收费验收和自动巡检继续PAUSED。
- APIB适配器effective优先接线由既有负责人独占实现，待提交后集中合并；本模块不覆盖其runtime catalog/preflight未提交。
- 供应商真实生成质量未验收；本机HTTP/PG替身不构成供应商已verified证据。

## 进度

基线d54dcdc01312a47be747f83f720194db8b6147e5；独立codex/image-resolution-fallback-20261020。模块已实现，集中回归/四件证据/提交推送进行中；未合main、未上线。功能迭代计数本轮1，开工已fetch并合origin/main（无新增），收尾重新fetch核对。
