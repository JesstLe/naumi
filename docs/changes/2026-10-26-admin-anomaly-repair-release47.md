# 新异常修复与47发布准备

## 当前授权与合并

用户明确“修复，若已修复则上线”，随后要求上线前合并其他分支进度，但排除重构。旧定时任务仍只读；本交互任务负责修复与发布。保留core-refactor、modular-refactor和混入它们的试合并分支，其他人未提交内容保持。

基线777c68fe已在main；新发现同事审计文档73384aaa已ff合入本任务分支，四个旧T3 tip经git cherry均为已含等价补丁。此前两次远端fetch分别出现schannel握手与OpenSSL unexpected EOF，失败证据保留；随后两次完整fetch均exit0，origin/main=73384aaa。构建/切流前继续刷新。主目录为admin-ui-modernization分支且有他人未提交UI工作，本任务不覆盖、不代为提交。

## 现场预检

三锁只读预检：canonical revision827/status CLEANUP_PENDING，前一scope发布仍SWITCHED_CLEANUP_PENDING。实际Web0641ce2e，旧Web与旧Worker仍af22；Worker paused/UNKNOWN并指向旧Web。MemAvailable约2783MiB，低于原新增Web2560MiB＋主机余量1024MiB预算。未创建候选、未切流、未停旧槽。

## 补齐修复

- 已完成子结果的独立父回执：只处理原冻结计划中的单步普通生成/编辑，原child done、真实媒体可解码、原账务完成；按同owner、原snapshot/payload、租约及作品引用重新CAS，原子补parent/creation，不调用生成、结算、恢复供应接口，不清原UNKNOWN。有效租约、未完成/未知child、复杂后处理、跨owner或证据变化均不写入。
- 原图片下载的一次有界重读：仅同一个原结果URL、GET、同60秒预算内，首次连接重置等指定网络错误允许重读一次；不重做供应生成、不跨渠道、不跟随重定向、不对4xx/坏图进行重复读取。
- 后台原因持久化：在原供应Response与精确call id之间绑定诊断写入器，已返回2xx后发生下载、解码或空响应错误时追加白名单stage/causes/status/observedAt；不改原调用state/cost。后台显示结果读取/处理阶段与原因，不暴露原URL、密钥或原始错误消息。诊断写入失败仍保留原异常。

## 集中验收与仍未恢复的历史任务

- 原父回执真实隔离PG29项、真实sharp像素解码；原child/billing/ledger/UNKNOWN不变，过期lease、owner、并发CAS和账务未完成拒绝均覆盖。
- 同URL GET有界重读14项；父完成整模块25项、父通知SQL真实PG19项、项目scope真实PG/路由31项、后台原因真实PG39项通过。
- postaccept原诊断23项、恢复11组142断言、PG18项、SaaS creation与完整TypeScript通过。
- 新补supplier-cost整模块及真实collector→health validator→诊断落库回归通过：3个独立call分别记录download-image/decode-pixels/read-response，原URL与密钥未落诊断；原图仅2次loopback GET、生成响应为fixture、客户账务不变。不是线上供应调用。
- 基线777归档仍复现“原child完成但parent queued”及“首次GET reset即中止”；原始日志不改。独立副本回滚命令及结果见同目录VERIFICATION.txt。
- 此前六场景审计记录的三个旧合同测试失败继续保留，见2026-10-26-image-delivery-acceptance-audit.md；不将局部通过写成全项目测试全绿。

历史12个完成child的parent只有部署后重新读取并通过真实原媒体/账务校验才可收尾；本轮尚未写线上原任务。6个未发送供应的排队child仍需Worker交接，扫描修复不等于Worker已恢复。2个下载失败任务没有可用本地像素/原URL，尚未恢复，不能用新生成代替原结果。

## 候选与发布门槛

公开更新说明已绑定候选BUILD_VERSION=1793003573并通过维护脚本校验。当前仍是发布准备：不得将合并、隔离测试、镜像构建或公开文案误称上线。旧发布CLEANUP_PENDING、Worker未知tick/活动及双槽预算必须先取得真实收敛证据；保留原UNKNOWN和运行实例，普通发布不借用此前临时直接切流授权。

验证与原始/修改/回滚证据统一在 ignored `output/admin-anomaly-repair-release47-20261026/`。代码修复、候选构建、实际切流和历史任务恢复分别验收，不把本地测试等同已上线。
