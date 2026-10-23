# Imagegen一次报价执行

用户批准：一次服务器报价锁定plan，提交只取服务端凭据执行，不按current重新规划/比版本；过期同价自动继续、涨价确认，旧已受理任务不重POST。继续不部署。
基线f9f6ffc5，刷新origin/main1871f84d无新提交；同独立worktree/branch续作，前轮证据保留。

## 最小实现
新增app_imagegen_quotes表：owner/operation/fingerprint/creation scope key/request/plan/15分钟expires。仅预览计划持久化，不是受理、不预留积分、不供应商调用。HTTP plan返回quote.id/expiresAt；客户端只提交operationId/quoteId/confirmed。
有效凭据submit沿保存plan版本，原计费/模型冻结签名及唯一父子账本机制保持，不读取当前价格重算。仍检查登录、工作空间、功能权限、素材所有权；历史receipt快路径先于到期与新权限检查。旧客户端无quoteId保留兼容旧确认链；Agent可信server plan路径不变。
过期只返回明确409后同ID刷新一次，不传客户端金额驱动扣费，同价无额外确认、涨价重新确认、unknown不重提。

## 初轮验收记录（历史进度）
真实handler/隔离PG模型与计费publication后原quote仍执行、过期、跨账号/作用域/指纹篡改、batch、旧receipt和客户端矩阵集中回归中。真实供应商0，不自动上线，不动47/103。

## 完整账务与作用域补齐

- plan 每个付费 step 保存完整 BillingQuote；仅可信 in-process step 透传给原 generate/cutout 的 quoteForRequest，按 actor/计费操作ID/feature/quantity/model/version核对，预占和结算用原quote。充值minPaidFen、metering开关不会在执行时改变客户合同。
- HTTP响应递归剥除step.billingQuote；不允许浏览器传递plan/积分/内部规则覆盖服务端记录。旧无quote客户端路径保留。
- owner、原始request fingerprint、personal/tenant/project作用域同时约束所有旧receipt与竞争赢家；历史未存scope按personal恢复。先回查旧受理记录再检查quote过期/缺失，批次后台仍用旧scope/全部冻结child。
- receipt GET仍重新授权成员及工作空间，撤销新创作功能不抹掉旧任务。新accept单独检查当前功能授权；原输入和lineage仍在真实创建事务核验。
- Canvas helper在paid POST前保存原operation/quote/request/作用域；超时、未知、已受理、404只GET原任务。明确未受理才能同ID续期；涨价确认、同价降价无多余弹窗。sessionStorage持久化不保存认证/continuation token。
- runGen/generatePend仅在实际merge及产物存在确认后清理相应pending；轮询固定原scope。Agent预授权批次后赋最终operationId的兼容已保留，仅重绑定子ID，不重新报价/改effective参数。

## 集中验收记录

真实原HTTP handlers/原生会话/隔离PG14组通过；包括真实model+billing publication、充值事实和metering变化，旧4K12仍实际4096PNG/ledger12；两个未受理quote14/16并发同operation仅一赢家/一supplier POST/一ledger；真实物理project回执及错scope取消不变；批次旧24、过期/删除quote旧receipt、零积分本地WebP。该轮fixture80积分6本机loopback POST/预占0；封存重跑14积分报价获胜时为78积分，16获胜时为80，均严格按持久化赢家整quote结算，不是真实供应商运行或生产验收。
151项客户端、22项作用域、旧确认客户端40项、138场景Canvas实际函数/1208断言、刷新恢复入口32场景/458断言通过。完整类型检查通过；独立副本整体回滚及最终封存结果见忽略目录VERIFICATION.txt。

首次集中legacy回归暴露Agent子ID重绑定与旧claim故障HTTP预期两项：Agent已最小兼容；claim持久化后现在直接200返回原receipt（旧400 acceptedtrue不再作为必须），仍验证没有新任务及后续单次执行。原失败日志保留，修正后旧batch/receipts真PG已通过。

发布状态：LOCAL_VERIFIED_NOT_DEPLOYED；无SSH、无三锁、无程序/配置publication、无47/103候选或切流。供应商真实生成0。

## 刷新/项目导航后的原任务入口

独立review指出普通空白节点是临时UI，刷新后action按钮消失，虽然原operation仍在sessionStorage却没有可达入口。已补浅色“待恢复任务”组件：按owner/workspace/project挂载时列原unknown/accepted任务，点击只查原operation，404/运行中/失败均不发新POST，成功已有图片仅在merge+assert后清理对应pending。不同新节点不被强行合并成同一购买。局部组件不建新队列、不接管Worker。

Canvas真实AST函数首轮集中136场景/1156断言通过；项目为空时轮询删除继承的冲突project header，位置保存期间切换不写pendingNodeRef。最终增补deferred merge后为138场景/1208断言，首轮证据原样保留。

Next本机生产编译/类型/路由构建exit0；Windows standalone trace复制node_modules出现EPERM symlink告警，保留原日志，不称已打成可部署Linux镜像。未运行生产浏览器/NGINX或真实供应商验收。

完整实现后本机工作分支刷新origin/main仍1871f84d，基线f9f6ffc5已含该main；共享root仍f45dd9ea及原18个未提交变动，未触碰。功能迭代计数本模块1；未触发三次同步门槛，开工/收尾均已fetch。

## 最后提交边界审查

独立复审要求不能把computed merged snapshot或排队的setWorks当成已交付。mergeWorks/refetchWorks现可接收可选current谓词，target/fallback响应及functional updater提交前都校验；四个生成合并入口与根恢复入口传同一原作用域/挂载谓词。根恢复合并后等一帧，只在现有worksRef已观察到每个结果及image时返回完成；未观察到保留原receipt，不重POST。普通生成的四个清理点同样只对worksRef已观察产物清理。旧无可选谓词的调用保留兼容。

最终r5独立审查blocker=none。Next最终91页面构建和全量types exit0，构建记录中三个指定源码hash前后一致且匹配最终文件；Windows standalone链接告警仍明示保留，不产出生产候选。整体独立副本回滚已恢复21原文件、移除11新增文件，SHA全部恢复，原PG基线409行为重现，正式分支保持改后。

## 最终定稿与交接

最后实际AST提取root onAttach、mergeWorks/refetchWorks、recovery check集中通过20场景/242断言。真实commit经一次RAF后已由worksRef观察到结果才清receipt一次；deferred updater未flush时attached=false、清理0次；guard失效后flush保持原数组及receipt。Canvas最终源SHA256为2218afacf1c50ec07f8e572768fd9055244a717ec9d58b120c07758dcc063234，与最终Canvas测试及构建冻结记录一致。

PG_MODIFIED_FINAL.json保留子任务原14组及16文件hash（早于Agent batch兼容小修）；父任务在该修正后集中执行的14组结果为MODIFIED_TEST.json，不能将前者全部hash误称最终源码证明。旧RELOAD_GUARD材料绑定中间Canvas；最终根提交观察以MERGE_MODIFIED.json及CANVAS_MODIFIED_DEFERRED_FINAL.json为准。reload脚本封存时仅去掉EOF多余空行以通过staged diff --check，并集中复跑32/458通过，记录RELOAD_DELIVERY_FINAL.json，产品源码未变。

模块源码定稿，不再追加开发。原始失败、中间测试、最终结果均保留在output/imagegen-frozen-quote47-20261023；四件交付物为MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、ROLLBACK.sh，最终manifest、分支提交/push和副本回滚状态以该报告为准。只提交推送codex/imagegen-confirmation47-20261023，不合main、不上线；用户后续“先列现行拦截清单、等待新判断方案”的独立排查不触发删除规则或更改本定稿实现。
