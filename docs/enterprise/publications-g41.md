# G41 人工渠道发布台账、逐店回执与召回

状态：服务/BFF/原UI/运行/Next集中验证通过；固定版本与源码副本回滚结果见交付证据。对应M18第一期人工回执路径；不调用商家平台、不写聚水潭订单/库存、不宣称平台读回。原18482 UI/单主干保持，真实schema8/Excel和人员映射不动。

## 1. 场景与数据

运营从已验收任务创建某店铺、商品外部ID、展示位置、语言的发布实例。引用固定验收事件与交付文件revision/SHA256/bytes/name，明确选择目标店铺SKU（必须与源需求SKU一致且当前SKU允许该店铺）。每个店铺是独立实例，可见成功/失败/未知并存，不用一项总状态掩盖部分结果。不复制任务、不增加设计产出量、不产生源积分记录。

030新增publications/publication_commands/publication_revisions。数据包含计划创建人、独立批准人、target（catalog固定修订、externalObjectId/slot/locale）、source（原order/task/acceptanceId/acceptedAt与files固定版本、采用规范引用）、scheduleAt、状态、claim/receipt/recall/replacement链。实例ID及commandId为客户端稳定UUID。外部对象ID由运营明确填写，不能从商品名推测。

语言标签去首尾空格、下划线统一为连字符并转小写（zh-CN / ZH_cn共用同一占位），外部对象ID保留大小写。

同enterprise/shop/externalObjectId/slot/locale最多一条活跃占位实例；draft/approved/executing/unknown/manual_published/recall_requested/recall_unknown占位，failed/cancelled/manual_recalled释放。再次尝试必须新实例，不在unknown上重发。人工失败是操作员明确“未完成”的回执，不是系统根据网络错误推断。

## 2. 状态机

draft → approved（独立核准）→ executing（领取实际操作）→ manual_published / failed / unknown。
- 创建/批准均不代表已上架；approved可有scheduleAt，start前到时检查。
- executing明确记录当前操作人。receipt只有该人能填；处理离职/失联时manage+review可mark-unknown，保留原操作历史。
- unknown仅能由manage+review明确人工核查后转manual_published或failed，必须证据说明；不提供自动retry。
- draft/approved可cancel，不把已执行/未知取消成未发生。
- manual_published/unknown可request-recall（manage），只有人工核查并确认状态后记manual_recalled；召回不确定记recall_unknown，可继续核查，不自动视为下架。
- replacement由旧实例引用一个同店铺/对象/位置/语言、已人工回收旧实例后新建的实例。旧实例和原回执保留，不原地替换文件。

所有reportedAt为操作员陈述的外部时间，recordedAt为服务端入账时间，观察证据source始终manual_report；published/recalled使用manual前缀，详情明确未做平台API核验。时间不得晚于当前或早于start/申请等已知下限。evidence为文本说明/外部凭证编号，URL只保存http(s)且不含用户名密码，不自动抓取。专用截图上传/平台读回后续实现。

## 3. 权限与版本校验

创建/start/receipt需要当前团队request或manage，创建只能用当前canRead的accepted原任务及存在的正式验收事件、当前店铺teamIds授权。批准需manage+review、非创建者且非任务贡献者。每次请求重新校验源身份/成员、店铺团队授权和原单可读；普通执行员工不因看到任务而有发布操作权。

create/approve/start执行真实文件字节hash和扫描可用性检查，核对源accepted状态/事件/文件集合与目标catalog修订，并重验已采用规范有效性。preview是只读，create按previewHash二次核对当前源/目录。catalog/规范变化不能静默更新旧批准包，须取消未执行计划并重建。start后事实回执/召回仍允许记录，即使期间规范撤回/品牌停用；不可让过期规则掩盖已经发生的操作。详情读取重新检查当前目录修订、规范及文件字节/扫描可用性，以检查时间和具体阻断码展示；检查失败仍保留可读的历史回执与manual证据来源，不冒充平台事实。列表不批量读取全部大文件。

## 4. 并发、重放与数据库

锁顺序command→publication ID（关联替代ID排序）→原order→publication-target→catalog→guideline→asset scan。原工单不获取publication锁。target唯一索引兜底多实例竞争。命令回执/实例/不可变修订同事务；审计失败不留下半条记录。重放返回当前可见实例和原appliedVersion，不再次执行状态变更；撤权先拒绝。

默认publicationsEnabled=false。schema30独立表，不降低29规范门禁；真实旧29处理原任务不写发布台账，须实际固定程序兼容测试。真实库缺迁移503。计划/回执不等同外部发布操作。HTTP错误/本地请求丢响应沿原commandId重试登记，不发外部请求。

## 5. 接口与原UI

GET /v1/publications：list（页30，状态/店铺/订单筛选）、detail/history、source（已验收任务的可见选用资料）；POST preview/create，approve/start/receipt/mark-unknown/resolve/request-recall/recall-receipt/cancel/link-replacement。BFF /api/enterprise/workflow/publications使用原生登录、企业映射、同源/viewer、限流和128KiB体积上限。

原素材与交付/需求/任务入口增加“渠道发布”；任务详情提供“从此交付建发布计划”。填写目标/位置/语言/计划时间→预览固定版本→确认草稿→独立批准→领取→人工回执。列表状态明确“人工登记发布/召回”“待核查”，不显示平台已验证。详情可打开原受保护文件下载；不扩展附件权限。手机单列、未知响应冻结原命令、关闭迟到/换号清屏。首次明确4xx拒绝（除408/429）释放操作表单供纠正；已发生未知结果后始终保留原命令重试，避免修改重放内容。

## 6. 集中验收与剩余范围

真实字节交付/独立验收、非accepted拒绝、错SKU/店铺/撤权、独立核准、文件损坏/规范失效start拒绝、并发同位置占位、unknown禁止重试、离职移交核查、多店部分结果、召回未知再人工确认、替代链、时间边界、回执/审计原子、分页/历史、原任务/账本不变、schema8拒绝、浏览器/固定运行/Next/源码回滚。

剩余M18：可下载发布包manifest/ZIP、专用截图证明文件、渠道规格自动检查、真实API写入和读回授权、跨店批量预览执行、自动通知/规范到期召回提案、经营归因。保留在完整目标中，本轮不把人工报告伪装为外部平台事实。


## 7. 实施记录（2026-10-18）

- 服务：PublicationStore/contract/migration030；BFF独立路径；create/approve/start验证原验收事件、目录版本、规范和实际交付文件。独立台账不修改原工单或Naumi来源。
- 原UI：publications-ui.js通过build-publications.mjs内嵌到原preview.html，需求/任务/素材入口共用。没有第二套客户页面。
- 详情availability为当前依据检查，不是外部平台可用性；检查失败给出业务码并保留历史。读取不发平台请求，不新增扫描/验收事件。
- 修正：同一语言标签大小写/下划线归一，避免同目标重复占位；明确4xx可纠正表单，未知结果固定命令；BFF fixture复用实际扫描器并使用独立publication-worker，避免容量回归已满WIP干扰。
- 集中开发验收：服务包含固定字节、文件损坏、规范撤回、版本与权限、同目标并发、32次历史/32项分页、审计失败原子；运行44组含真实旧29在schema30上的原业务兼容；真实Next33组及完整锁定依赖类型检查通过。
- 原数据：保持schema8，364行/292附件，真实人员/真名花名映射/正式需求仍0。本模块附加迁移只在隔离库运行。
- 交付证据目录：E:/Workspace/naumi/output/enterprise-publications-g41-20261018。最终固定Git、浏览器和回滚结论以VERIFICATION.txt与DELIVERY_RECEIPT.json为准。

### 维护提示

可复用检查提示：
```text
从当前已验收任务构建发布实例；确认固定验收ID、文件revision/hash/bytes及规范快照。
用独立管理复核身份核准，然后由实际运营领取。外部操作在既有商家平台完成，系统仅登记人工证据。
响应未知时保留原commandId与输入重试登记；外部结果未知时进入人工核查，绝不自动再次发布。
检查逐店结果、当前依据提示、召回未知与替代链；保留历史，不修改原任务贡献和Naumi积分来源。
```


### 原UI验收

32项检查通过，使用独立合成企业与原生会话：原入口/验收任务快捷入口、固定文件/预览、丢失响应原命令回放只产生v1、语言归一、依据可用性、创建者无自批按钮、独立批准/领取、明确失败解锁纠正、unknown不重发、重复位置提示、受保护文件44字节/SHA256一致、人工发布与平台事实区分、召回申请/未知/确认、8次历史、390px单列、召回后新建替代/关联、规范撤回后历史可读、原单不变、关闭迟到响应与切号清屏。

浏览器执行规范撤回辅助命令首次误带其他模块的operation字段，严格合同返回INVALID_INPUT；随后使用原guideline合同重试成功。业务写入UI本身全部使用各自正确合同。此诊断保留，不把辅助命令失败记录为产品完成。
