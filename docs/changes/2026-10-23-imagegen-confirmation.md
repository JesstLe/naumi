# Imagegen预览提交误拦修复

基线origin/main1871f84d；独立worktree/branch codex/imagegen-confirmation47-20261023。

## 已确认原因
POST /api/imagegen经通用withModelRequest读取顶层resolution/ratio，实际参数在parameters，错误冻结1K/1:1；plan自己按正确4K报价但business-billing又优先外层scope原选1K。预览提交报价不一致并被confirmation阻断，上游尚未调用。

## 实现边界
仅精确/api/imagegen由domain负责模型解析/能力/冻结，保留外部BI、creation、continuation和route鉴权/来源/rate-limit；其他路由原样。显式effectiveResolution报价合同的原选事实优先于外层scope，未带合同的历史冻结原样。
原确认校验未删除，单图与batch冲突使用409 IMAGEGEN_PLAN_CHANGED。画布只在accepted=false明确未受理且该code时刷新一次；同价格版本变更不烦扰确认，新价格重新确认；同operationId，unknown/已受理/网络错误不重提，第二次变化停止。

## 验收进度
原版副本真实复现：4K预览12积分、提交400且accepted=false，父/子/账本/供应商POST均0。修改态原HTTP handlers+独立PG通过：1K6/2K8/4K12、variants2共24、恶意外层1K不覆盖4K12、requested4K→effective2K仍12，实际解码6张1024/2048/4096 PNG，5子计费操作/5消费流水共62积分，未受理冲突零创建、旧回执零重POST；批次错误确认409且无batch行。
40项客户端、imagegen contract/HTTP/recovery、46分辨率检查、最终全量tsc0通过。旧HTTP fixture缺AbortSignal及期待自动poll的问题仅修测试，不改实际client轮询语义。独立只读审查无阻塞；按建议去掉错误文案中未经证明的“尚未受理”。
8原文件hash/4新增文件副本可执行ROLLBACK.sh真实回退，并重跑原错误复现；正式worktree保持修复态。真实本机T3浏览器执行客户端函数（接口替身）验证一次同ID重规划/无额外确认/4K12保留；snapshot工具两次超时，图像为实际DOM结果复渲染，已打开检查，不称生产画布截图。供应商真实调用0，不以mock证明生产完成。

## 发布边界
本轮修复授权不撤销用户先不要上线；无SSH、47锁/候选/配置publication/重启/切流。不改共享18项未提交。
