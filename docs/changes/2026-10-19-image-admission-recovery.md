# 2026-10-19 生图集中失败：请求前置校验与通道诊断修复

## 现场与边界

16:25—16:29只读确认：GPT编辑原两通道分别HTTP403与transport故障，触发冷却；无并发占满证据。53笔失败中39笔本地繁忙拒绝、11笔无结果释放、3笔有上游调用，客户已扣与剩余预占均0。实际采样与原始证据见统一线程 `output/recent-image-failures47-20261019/REPORT.md`。

当前修复独立 `codex/image-recovery47-20261019`，基线origin/main `2b9ce5ea`。不覆盖共享checkout。收费验收/自动收费巡检继续PAUSED，不清空熔断、不重放用户任务，APIB能力由后续明确用户授权独立版本化对齐（见APIB交接文档）；verified不提升，不更换模型或覆盖管理员最新配置。

## 模块一：新请求在报价/受理前对齐实际尺寸门禁

- `request-size.ts`用明确的`ExactImageSizeError/IMAGE_SIZE_UNSUPPORTED`表示本地拒绝，保留12比例及旧任务方向尺寸协议，不静默改原图比例。
- 新`request-admission.ts`镜像handler的family wire尺寸门禁与APIMart显式ratio契约，专用于新计划，不重解释已冻结任务。
- `planImagegen`在报价和冻结前排除不可执行候选；658:877等任意原图比例若当前模型不支持，直接返回明确的比例选择提示，不再创建一个必失败的后台任务。9:21/3:1/1:3不再因粗simulate的比例盲区出现在新计划中。
- legacy generate-image的新提交在预占/创建job前执行同样的尺寸校验并返回400/accepted=false；Worker原任务恢复分支保持原样。
- 这是前置准确拒绝，不冒称已经新增任意尺寸生成能力；用户显式选择标准比例的生成路径保持。

## 模块二：区分冷却与并发，补齐脱敏故障证据

- image channel所有候选处于冷却/半开探测时返回明确503“暂时不可用”；真正容量满维持429。文字调度原行为、原通道排序/权重、失败后回退/未知付费任务恢复不改。
- safeError只保留固定的本站前置拒绝提示，不把熔断一概说成并发繁忙，不输出供应商原始报错。
- supplier-cost额外保留白名单类别（quota/credential/model-permission/content-policy/rate-limit/authorization-or-edge/upstream-unavailable/transport）和允许的网络错误码；绝不落原始消息/HTML/密钥/图片/提示词。只增加诊断观察，不改付款判定和金额。

## 上游独立核查进度

沿用实际生产transport和现有凭据，只执行GET /models：platform和Geeknow均200，不能据此声称images/edits恢复。Geeknow非收费credit_grants GET404，未取得余额证据，不凭空认定余额不足。尚未执行收费生成，也未修改上游凭据/代理。

## 模块三：蒙版规划协议门禁

- 真实公网v122普通编辑已包含APIB，但当前5d的simulateModel仍将apimart-images排除出mask请求。
- 本地补齐：仅当capabilities.edit与parameterMap.apimartImages.supportsMask都明确为true时放行；OpenAI/preset既有行为保持，不泛放未知协议。
- 隔离实测同时验证明确支持可选、关闭supportsMask即排除；实际上传/mask/原task恢复56项回归通过。

## 集中验收与发布

初轮11套集中验收通过，包含真实handler/隔离PG、176秒精确比例回归、供应通道/恢复/成本/contract/client-recovery及全量tsc。新增APIB版本化PLAN/APPLY/VERIFY/UNKNOWN同UUID恢复/重复APPLY/选择性ROLLBACK、后续weight/label/billing保留及56项异步上传/mask适配通过；外部供应商调用0。最终全量tsc exit0。

本轮程序修复仍为本地任务分支，未部署：47根磁盘可用约6.45GiB，低于10GiB蓝绿发布空间门槛；未删数据库、业务媒体或7天备份绕过。未构建生产镜像，不创建第二程序候选，不热换在线代码/环境。程序上线需另在资源满足后走正常三锁蓝绿，不能以此次v122配置热发布冒充程序发布。

17:09只读观察：对齐后1笔自然新任务job-c965b7ad…因ratio658:877仍失败，无APIB调用；不是本次收费测试，没有重放/结清。标准3:4等请求规划可选APIB不等于该任意原图比例已支持。此次不标全站生图恢复。
