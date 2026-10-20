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
- APIB适配器已普通合负责人交接c10298ad，保持其runtime catalog/preflight；本模块补显式新preset回退的effective优先分支，旧preset保持历史优先级。
- 供应商真实生成质量未验收；本机HTTP/PG替身不构成供应商已verified证据。

## 进度

基线d54dcdc01312a47be747f83f720194db8b6147e5；独立codex/image-resolution-fallback-20261020。功能ae0ab965，普通合Seedream交接至da205fe5；原main038b840b已是祖先。集中回归/四件证据/提交推送收尾；未合main、未上线。功能迭代计数本轮1，开工已fetch并合origin/main（无新增），收尾重新fetch核对。

## 测试修正说明

旧verify-resolution-parameters的503 fixture没有not_charged证据却断言自动换供应商，baseline与modified均得到supplier-response-unconfirmed。仅给fixture明确not_charged，保留生产未知任务不重提保护。原canvas静态guard改匹配effectivePreset，480组合/90拒绝仍实际跑。异步57项首次并发时计数波动，baseline与modified原样重跑通过，不隐藏原始输出。

## 最终全链路补齐

- 画布提交原raw request而非预览resolved request，保持原档计价和原始fingerprint；将回退提示交onPlan，结果保留plan warnings。
- 新旧preset operation分辨率优先级回归保持；只有明确原选/实际档不同时采用actual。
- 实际APIB完整plan→child→adapter发现quote/operation的quality=auto是omit wire标记，不是合法semantic quality。仅认可已声明quality选项，不把auto/hd映射别名二次当选择输入；policyQuality仍负责发包映射。
- 最终独立PG：用户4K报价12，实际2K；plan/legacy/APIB三链成功结算12，2048²产物解码/保存；raw重试/异步恢复零新增POST，外部供应商0。通用策略46项、Seedream42项/210组合、异步57项、旧preset成本账务与恢复、480canvas组合/90拒绝通过。
- 初始17命令原始失败与全部修正/重跑输出留证，不删除失败日志。91页Next生产构建通过固定5041e83c；最后adapter质量合法值修正另经实际全链/模块/全量tsc验证，不把旧build hash说成最终源码镜像。
- 当前仍仅任务分支，未合main、未上线；正式发布候选需重新固定最终源SHA并构建，47三锁蓝绿及受影响功能验收保持。

异步57项机器速度波动已确定为fixture把8种独立故障连用同一schema熔断状态；前一场景冷却会阻止后一场景首次POST。仅在每个独立故障前清该fixture私有schema的channel_health，保留两次相同任务查询/不重提断言；生产熔断/未知受理策略零改动。原失败与基线/重跑结果保留审计。
