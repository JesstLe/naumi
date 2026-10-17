# 旧生图入口比例与扩图错误收敛

## 请求与协作

用户要求继续优化尚未闭环项，保持已删除的重复面板。开工普通合最新main1b80da56至aef70601；统一线程确认generate-image/ratio/expand无HOLD，main无并行写入窗口，由本任务集中验收后普通合main。共享checkout及18项他人未提交保持。

## A：旧generate-image自动画幅

问题：旧POST在withBiRequest确定模型/报价facts之后才用第一输入尺寸推算比例，产品1500²+参考750×1000会变1:1，绑定facts与实际参数也可能分裂。

新增legacy-frame-request：在原withBillingIntent请求身份内部、withBiRequest之前，解析新multipart请求的唯一reference并读取EXIF正确尺寸，明确传3:4贯穿模型选择/校验/报价/冻结。原始请求fingerprint仍按auto原表单计算，重试匹配原回执。固定比例、显式像素、ratiogen、imagegen内部已规划上下文、Worker恢复跳过；历史已接受任务不重新解析。单图继承原图，风格/目标编辑保留target，多参考歧义400并要求明确比例；不按图片大小或提示词关键词猜参考身份，沿用旧传输合同第一target/其后reference。读图前鉴权，12MiB限额，异常画幅不静默取方图。

删除handleObservedPost在模型facts冻结后按第一图重选的逻辑。低层针对旧已冻结auto任务的兼容未删除，不更写/重放历史任务。

## B：扩图已证实的工程缺口

- 公共JSON不含mask，但内部必定构造mask；requestFacts现在提前声明needsMask，先筛掉不支持蒙版的通道，避免进入昂贵提交后才失败。
- 原catch将报价变化/积分冲突、源图读取、Sharp、本地存储和上游异常全部包装成502。现在保留BillingError原状态（如409），原图错误415，输入几何错误400，本地处理500，上游明确拒绝/无效产物502，未知受理/超时409 OPERATION_PENDING。同一账务操作重试不得重提或把未知付费状态当作明确拒绝退款。
- editImage使用稳定synchronous operationId。复用既有withBillingRequest回执与结算，不新增任务状态机或自动重试。
- 扩图背景曾fit:fill后直接覆盖整幅，原产品可能变形。现在只有新生成外围背景映射目标画幅，随后按锚点恢复原图区域每个RGBA像素；4096长边限制时源图仍按既有规则先等比缩小。9锚点保留回归，透明未填满外围不保存为完成。
- 几何在报价前校验，极端比例/零尺寸/Infinity/已有比例拒绝；输出只外扩不裁原区域。

## 集中验收

- 55项真实POST handler/Sharp/原函数requestFacts隔离矩阵：旧auto3:4且模型绑定前完成、原fingerprint、显式比例/像素、歧义、失效素材、9锚点全RGBA一致、几何、透明外围、报价409/未知409/素材415。
- 本任务独立PostgreSQL16容器，loopback随机端口、256MiB/0.5CPU/tmpfs，不复用其他PG。实际route+schema/model/billing/ledger/落盘回归14项：legacy持久3:4及原auto回执重入、扩图mask与确切像素，成功任务2笔结算、模拟失联任务hold且同ID重试供应商POST不增加。本机供应商替身3次（含一次断连），外部付费0。
- 已有imagegen-execution、imagegen-batch、billing-tools、billing-intents通过；面板删除210、规划24及全量tsc通过。日志保留故意明确拒绝/首次fixture参数漏count导致报价不一致的中间失败，不当作业务根因。
- 更新后的原Dock计费浏览器用例集中执行，结果以VERIFICATION最终记录为准。

## 边界与交付

历史用户那一次扩图502仍未找到匹配请求；本轮只证明以上缺口及修复，不把它们当历史事件根因。扩图仍同步端点，未知受理转待核查不会自动重播；完整异步扩图/供应商原生恢复是后续独立模块。未SSH/未三锁/未候选/未Worker变更/未发布47或103，不因main整合触发部署。

四产物、原始hash、baseline/modified/副本回滚及远端main实证在output/remaining-image-fixes-20261017/VERIFICATION.txt。本轮为第3个功能模块，提交后合最新main计数归零；固定最终SHA另在验证文件登记。
