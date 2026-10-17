# G13 Naumi 创作与工作流任务关联

## 产品与来源约束

18482原UI是产品；/admin仅数据来源。一个代码主干，平台/私有部署由sourceInstance与企业配置约束。关联不是复制账号、复制计费库或推定历史企业所有权；原表姓名和花名继续显式映射。

## 使用流程

任务详情新增Naumi创作区：已有引用、实时来源状态、图片/提示词/生成任务/积分流水、关联与解除记录。主管或当前执行者选来源类型、日期和账号后检索，预览原始记录，填写归属原因并明确确认；服务端再次取来源后写入。员工只关联自己账号的记录；主管关联范围仍取决于Naumi源组织权限，不由工作流dispatch扩大。

## 权限双重校验

- 每个来源请求先验Naumi原生会话、有效企业成员、功能/老板授权和专属部署绑定，再通过工作流BFF验同企业团队任务可见性。
- 新增狭窄creation-read：普通成员只读本人创作与积分事件；已有经营数据权限者保留源下属范围。旧企业管理/经营分析接口权限不变，工作流员工不因此获得成员管理或整企业分析权限。
- 图片每次经过同一源权限校验、私有no-store与解码重编码；不保存可绕过权限的原URL。
- 关联写入必须有BFF签名、45秒有效、绑定具体command摘要/来源身份/团队的源验证证据。私钥和证据不进入浏览器。服务校验公钥、audience、TTL、command摘要和当前映射；无配置拒绝关联。
- 读取只持久引用，不复制提示词、花名、图片或账本内容。源记录删除、移出可见范围或来源不在线时显示待核对占位，不回显历史内容。

## 契约与生命周期

SourceRef={instanceId,enterpriseId,kind,id}，kind含artwork/image-job/canvas-task/video-task/ledger。Task.sourceLinks保存ref/linkedBy/linkedAt/reason；最大30项，任务内精确去重。同一记录可作为多任务参考，UI不把它当独占成本归属。

link-source/unlink-source沿用commandId/orderId/expectedVersion和同一order/event/commands事务，更新需求版本、追加审计；不修改源。approved/active且未验收任务由dispatch管理；当前符合工种执行者可在claimed/in_progress/blocked/rework状态关联自己的来源。待交接冻结关联修改；review/accepted及结束需求冻结，防止验收后悄悄改依据。

关联不自动生成交付文件、不改变任务状态、不替代独立验收。解除只移除当前引用，历史事件保留，不删除Naumi作品或账本。来源记录失败仍可由有权人员解除旧引用。

## 积分与贡献口径

逐条显示预估、冻结、已证实扣费、账本变动和结算状态，null不是0。任务显示“显式关联流水”的扣费、退款、净额，按完整SourceRef去重；生成任务的charged字段不再叠加，避免同一扣费被计两遍。未关联的流水不猜测归属；其它grant/purchase/adjust不计消费。来源存在不可读项时标明部分可见，绝不显示为完整财务成本。跨任务复用记录不支持相加，绩效不按积分计算。后续成本独占分摊另设审核规则。

## 验收计划

普通员工本人记录/经理下属边界/跨企业/专属企业/停用；精确ID读不依赖最近30天；错误命名空间；伪造/过期/错command证据；当前执行者与交接冻结；重复关联/幂等/CAS/事务回滚；提示词不落工作流DB；源删除与撤权占位；图片真实解码；扣6退2净4与无账本null；原UI多角色浏览器、旧模块回归、真实原表保留与副本回滚。

## 实施状态

代码与服务端/BFF/浏览器集中验收已完成，Git与副本回滚封装结果以交付VERIFICATION.txt为准。实际公司桥接配置、账号映射和生产发布尚未完成，测试使用独立合成来源和工作流库。

### 实现文件与接口

- workflow contracts/domain/store：SourceRef、sourceLinks、link-source/unlink-source；同一order版本、事务、命令幂等与事件。已关联来源的待发布任务须先解除关联才可从拆分方案移除。
- source-evidence.ts：Ed25519证据、独立audience、45秒TTL、canonical command SHA256、团队/来源实例/来源企业/来源查看者与具体命令绑定。签名不包含提示词或积分数额。
- creation-adapter.ts / enterpriseCreationRead：普通员工self-only，源主管按实时下属范围；精确ID检索不受最近30天列表限制；列表分页20。旧enterpriseRead及经营分析权限保持。
- /api/enterprise/workflow/source：GET candidates/record/links/media；POST完整link-source/unlink-source命令。每请求先验任务可见性，再读源；POST同源、16KiB正文、当前查看者校验；来源接口60次/分钟。前端不指定源URL。
- media-response.ts：原企业媒体路线与新来源路线共用受保护解码/重编码，32MiB输入、40MP像素上限，不把原私有URL放入响应。已有企业媒体权限路径不变。
- analytics.ts 的ledgerSourceCTE复用同一账本分类，repository.ts为生成记录增加精确类型+ID读取；未修改账本、结算或上游执行逻辑。
- source-links-ui.js/css：原抽屉增加来源区、来源选择/预览/确认、原因、解除审计、权限失效占位、冲突保留输入；关闭/换工作区回收图片ObjectURL，切回页面重新读取来源。

### 签名配置与部署接线

无新SQL迁移、无新常驻进程。WorkflowStore工厂的第5参数注入createSourceEvidenceVerifier，公钥与来源BFF信任配置一致；第4参数保留原本机导入管理员配置，不挪用。示例：

```ts
const sourceEvidence = createSourceEvidenceVerifier(trustedBffPublicKeys);
const store = new WorkflowStore(pool, resolveDatabaseActor, delivery.validate, localOwner, sourceEvidence);
```

BFF使用已配置NAUMI_WORKFLOW_SIGNING_KEY/KID生成服务器间证据；浏览器既收不到私钥也收不到签名证据。未注入验证器的工作流实例对link-source返回SOURCE_PROOF_NOT_CONFIGURED，其余既有流程仍独立运行。真实公司尚未完成桥接部署，不能把测试工厂注入当作线上已配置。

### 已验证证据

- 独立服务：无证据、过期、错audience/企业/团队/command摘要拒绝；员工只关联本人；幂等/去重/CAS；交接冻结；解除事件；注入写事件失败原子回滚；持久重开；待验收冻结；纯引用未复制prompt/credits。
- 真正Naumi会话+BFF+隔离PG：普通员工只见art-3，不见staff；主管源下属范围保持；精确命名空间；图片WebP解码160px且no-store；直接伪造普通command拒绝；重复关联409；扣6退2净4；生成charged不重复相加；缺账本null；不可读来源占位；删源后解除；来源业务表指纹未变。
- 原界面浏览器21项通过，包括受保护图片实际解码、提示词预览、关联确认、版本冲突输入保留、逐条账本、不同来源权限显示、解除后原作品保留、交接冻结、刷新持久化和390px。
- 旧Naumi作品/媒体/经营分析回归保留权限、分页、CSV、退款口径。合并main前全仓typecheck有4条既有React ref诊断；整合7705f114后本机共享node_modules尚缺main新增three依赖，Studio3D相关又出现20条诊断，共24条。没有修改共享依赖或将全仓检查记为通过。本模块独立typecheck、整合后的Naumi/BFF回归通过。
- 真实原表364行、292附件、129链接、210缩略图SHA/原文一致；真实工作流需求0，人员映射0；BACKUP.dump独立恢复一致，没有创建真实来源关联。

### 失败修复与未完成边界

本轮完善了普通成员只读入口而非提升其管理角色；缺失流水显示“暂无可见流水”而非把未知成本显示为0；错误日期返回400；新来源查询关闭抽屉后的迟到响应被丢弃。

关联证据是最近45秒内的来源读取确认，不是跨库分布式锁；源可能在验证后删除，后续读取即转为不可查看，工作流只保留最小引用审计。此处不声称跨库原子快照。源列表仍按当前成员关系显示历史记录，显式关联说明不等于自动确定历史企业所有权。

待深化：对多任务复用来源的独占成本分摊与人工复核；异常来源人工处理队列；多源远程HTTP传输适配；视频播放/下载；超过30条引用的大任务分页。当前支持原Naumi同部署进程内适配，不自动连接未知其他系统。G12规则/分摊复核、G14真实第三方、G15公司配置和蓝绿部署继续。

### 下一轮复用提示

```text
读取 implementation-goal.md、source-links-g13.md 和本轮 VERIFICATION.txt。
保持18482原UI、同一代码主干、真名花名人工映射；不要连接或修改真实源来造验收。
从G12贡献分摊复核与周期规则开始：交接任务needs-review，原始验收事件不可变，最终绩效需版本化规则与人工确认。
完整模块后集中验证；新增字段、权限、回滚、剩余事项写入台账。
```


### Git整合复核

功能提交c5b1b236；整合origin/main=7705f114，合并提交74d3587a。main没有改动本模块的企业/来源/BI/工作流文件；已在合并后重新执行Naumi完整BFF、媒体与经营分析回归及来源浏览器。交付包仅包含本模块27文件，不混入Studio3D、Agent或发布运维等同事变更。根类型诊断24条单独列明。
