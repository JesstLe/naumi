# G14 业务通知、站内收件箱与钉钉工作通知适配

## 目标与使用位置

沿用18482原企业协作界面；员工工作区增加“通知”，主管可切换“投递记录/通道设置/收件人映射”。通知是业务变化的提示，不代替工作流状态、业务权限、任务认领或正式验收。/admin仍仅是Naumi来源。

本增量贯通工作流事件→同事务收件人快照/站内消息→外部outbox→独立Worker→钉钉异步回执。默认站内可用、外部关闭，不读取Excel姓名推断钉钉userid，不给整企业或群广播。聚水潭商品/订单同步、绩效周期通知、定时催办属于后续独立场景，不以通知适配冒充已接入。

## 通知规则

|业务动作|收件人|范围|
|---|---|---|
|提交需求、人工确定归属|当前承接/待归属团队manage或dispatch|只通知有权受理的成员|
|退回、批准需求|原提报人|原团队|
|发布任务、释放待开始任务|当前团队符合开放工种的execute成员|不跨团队广播|
|指派、批量指派、改期|明确执行人|当前执行团队|
|认领、阻塞、恢复|当前团队manage/dispatch|不逐百分比发送进度提醒|
|提交交付|非历史执行参与者的review成员|不让自评参与者收到验收待办|
|返工|当前执行人|当前团队|
|验收通过|执行参与者；全部验收后额外通知原提报人|独立通知，不重复产生绩效|
|发起交接|原执行人与接收人|接收人仍须自己确认|
|接收/拒绝/撤销交接|参与双方和发起主管|不因通知改变交接|
|运营签收/提出后续修改|原提报人、当前团队manage/dispatch|保留原验收；链接仍实时鉴权|
|取消需求|原提报人及历史执行参与者|不通知无关成员|

同一事件、团队、收件人只产生一条通知，排除操作人本人。配置前历史事件不自动补发。收件人资格在业务事务中显式解析；无有效接收人不伪造“已通知”。读取和外发前再次校验当前账号、团队、来源绑定以及该需求可读权限；离职/撤权后消息不成为旁路。

## 数据与事务

- 011增加notifications、notification_deliveries、notification_policies、notification_bindings、notification_commands、notification_audit。
- 站内通知只保存稳定主体、事件、需求/任务ID、固定事件标题、事件时间/版本，不复制提示词、图片、附件URL、姓名或需求正文。
- 业务订单、事件、通知、outbox在同一PostgreSQL事务提交；通知写入失败时订单不独自成功。幂等重放不再通知，预览不发消息。
- 通知已读与订单版本独立，不影响审批/执行。分页30条；普通员工只看自己，管理员投递列表仅当前团队，不能借通知读取其他团队的内容。
- 通道配置与接收人绑定使用commandId、expectedVersion、原因、审计；队列重试不是重新执行业务命令。

## 外部通道与配置

服务端按enterpriseId+connectorId配置独立钉钉内部应用，AppKey/AppSecret只从服务端受保护配置进入适配器；UI只能选择公开连接标识，看不到密钥。团队管理员显式开启通道，并逐个将工作流稳定subject映射到钉钉userid。真名/花名映射与钉钉接收人映射是两件事。

修改映射不静默重投旧消息。外部关闭时仅站内；已开通但未绑定的收件人进入待配置，管理员配置后明确重试才投递。已开始或已接受的投递保留原连接和目标，不能改绑到另一人后续投递。连接额外冻结revision，由AppKey/agentId/产品入口的SHA256计算（不包含AppSecret）；同连接ID换应用也会阻止旧任务误用新应用，原回执只能在原revision恢复后继续查询。仅AppSecret轮换不改变应用身份。

钉钉公开文档已于2026-10-17读取原文：
- https://open.dingtalk.com/document/orgapp/asynchronous-sending-of-enterprise-session-messages
- https://open.dingtalk.com/document/orgapp/gets-the-result-of-sending-messages-asynchronously-to-the-enterprise
- https://open.dingtalk.com/document/orgapp/obtain-orgapp-token

适配使用固定官方HTTPS域名；服务端缓存各应用token。发送接口asyncsend_v2，每次仅一个明确userid、to_all_user=false，消息为通用事件标题和需登录的协作入口，不含业务正文。返回task_id只表示已接受；getsendresult返回指定userid在已读/未读清单后才记为已送达。钉钉已读与站内已读分别记录，不相互伪造。

## 投递状态机与故障

pending/retry→sending→accepted→polling→delivered；blocked表示配置/映射缺失，dead表示明确失败后终止，unknown表示发送结果不确定，cancelled表示当前权限失效或通道已关闭。

Worker用FOR UPDATE SKIP LOCKED和租约领取，完成时按lease token/version比较提交。过期sending转unknown，不能自动重复发送；过期polling恢复accepted，仅查询原task_id。token获取失败可退避重试；发出发送请求后网络超时/响应异常归unknown，不将HTTP200当作已送达。明确被拒绝可退避，最多5次；回执轮询最长23小时，超过记录待核实，不重发。

人工重试仅对尚未接受的blocked/dead条目，必填依据并绑定当前配置版本；unknown只能补充从钉钉查到的task_id继续查回执，不能一键重新发送。人工补充保存receipt_source=manual并在列表标明；正常发送返回任务号为provider。钉钉回执接口只证明指定任务对指定userid的送达，人工将任务号关联到原通知仍依赖管理员核对，不冒充自动恢复的原始发送凭证。复核后已接受条目也只查原回执。请求、第三方错误原文、token、AppSecret不写入审计；只保留固定错误码和任务ID。

站内消息同步可见，不依赖Worker存活；4核8GiB阶段一个有界Worker串行投递，连接池max4，不为每类通知建立微服务。扫描仅待处理索引，不全表轮询；停止领取后等待当前投递落状态，异常退出由租约恢复。

## 验收矩阵

1. 提报/指派/交付/交接/运营闭环产生正确消息；去重、排除本人、工种与原团队范围正确。
2. 通知写入故障注入→业务回滚；回执更新故障→租约恢复；命令重放不增消息。
3. 两Worker并发领取仅一个发送；过期租约旧持有者不覆盖新状态；发送未知不重复；轮询恢复只查询。
4. 默认外部关闭、缺配置/缺映射不外发；跨企业、跨团队、普通员工配置、伪造字段和跨源写被拒绝。
5. 真实DingTalk协议用注入HTTP逐项验证URL/body、token缓存、接受/已读/未读/失败/未知，实际供应商调用0。
6. 原界面站内未读/已读/分页/业务跳转、管理员投递状态/重试/映射；刷新与390px；原员工和本机模式回归。
7. 真实Excel原文、附件、账号映射和业务库保持；基线/修改/回滚三个代码副本验证，完整命令输出留档。

## 当前状态

业务事务通知、站内收件箱、管理员投递/设置/审计、独立Worker和钉钉协议适配已实现。服务端/BFF与原生浏览器24项流程通过；完整集中回归与副本回滚结果见交付VERIFICATION.txt。真实钉钉应用、userid映射、公司通道开关未配置；不将协议模拟或隔离验收称为公司已收到钉钉消息。G15真实桥接/部署与其他外部系统继续待办。

## 接口与字段实施记录

|接口|参数/动作|角色与返回|
|---|---|---|
|GET /api/enterprise/workflow/notifications|enterpriseId、teamId、action=inbox、page、unread|本账号当前团队；只返回当前仍可读的需求通知，返回total/unread/pageSize30|
|同上|action=deliveries、state、page|当前团队manage；state/attempts/polls/receipt/providerRead/errorCode，非业务成功回执|
|同上|action=settings|manage；公开连接ID/名称、团队成员和显式userid绑定；无密钥|
|同上|action=audit、before|manage；50条游标，变更原因及Worker状态，userid不复制进审计|
|POST 同一路径?action=command|commandId、expectedVersion、reason、action|同源JSON≤64KiB；每身份读写各60次/分钟；其他参数拒绝|
|command|read + 通知id|仅本人，重复标记不改业务版本|
|command|policy + enabled/connectorId|manage；开启前验证本企业服务端连接存在|
|command|binding + subject/userid/enabled|manage；只能本团队已存在成员，独立版本CAS|
|command|retry + delivery id|manage；仅blocked/dead，已接受仅恢复查询；未知结果不可重发|
|command|receipt + delivery id/task_id|manage；unknown未记录回执时补充已核实的钉钉任务号，随后只查询|
|内部 /v1/notifications|对应GET/POST|只接受签名BFF身份，每次解析当前企业/团队成员资格|

通知表唯一键为enterprise/event/team/subject；id为UUID。站内read_at与provider_read独立。投递表冻结connector_id/connector_revision/userid/policy_version/binding_version，lease_id/lease_until用于抢占和CAS完成；失效SENDING租约转UNKNOWN，POLLING转ACCEPTED。错误使用固定码，不记录HTTP响应原文或凭证。

原UI顶栏铃铛和侧边“通知”只在员工工作区接正式接口；本机导入/本地示例仍保留原模式。每60秒仅在页面可见时刷新未读计数；进入通知/点击刷新读取当前数据，不建立额外WebSocket。切团队/企业或检测到登录账号改变时清理旧列表，已读和通知不写localStorage。旧Demo固定红点在真实员工模式关闭，避免未读为0仍显示提醒。

最终登录切换专项验收曾发现通知清理只重置团队/列表而留下旧账号目录；现通知请求与普通工作流请求一致，在401/403或ACCOUNT_CHANGED时同步清理目录、企业、团队、通知与弹窗，并要求重新选择工作区。原始失败日志保留，新隔离fixture重新验证；不是跳过该断言。

## Worker运行契约

2026-10-17 G15覆盖：正式启动统一使用runtime worker及安装/迁移/低权限/standby/activate门禁，详见runtime-g15.md。下面旧独立notification-worker仅保留显式隔离验收用途，不再作为生产启动方式。

独立编译产物为services/enterprise-workflow/dist/notification-worker.mjs。G15部署时将受保护配置文件路径放入NAUMI_NOTIFICATION_CONFIG，文件包含databaseUrl和connectors数组；每项包含enterpriseId、id、label、appKey、appSecret、agentId、productUrl。productUrl要求HTTPS且不带认证信息、query或hash。凭证文件不进入Git，不由浏览器编辑。

```powershell
node services/enterprise-workflow/build.mjs
# 生产配置准备、授权和蓝绿就绪之后才启动长期Worker：
node services/enterprise-workflow/dist/notification-worker.mjs
# 单次有界扫描；同样要求显式受保护配置：
node services/enterprise-workflow/dist/notification-worker.mjs --once
```

Web/BFF后端的NotificationStore与WorkflowStore、RoutingStore必须使用同一通知实例/连接目录，createWorkflowServer最后参数接入该实例；不能只启动Worker却不接业务事务发布。已有主程序工厂保留可选参数以兼容旧独立测试和本机来源准备，但未接实例时不宣称通知已启用。真实组装、11迁移和进程管理归G15同一版本部署。

外发前校验工作流账号、团队、需求可读及本地显式source_identity/source_enterprise绑定。Naumi登录会话/企业授权由BFF每请求校验；跨系统撤权同步与真实目录运营仍需部署配置，数据库锁不会跨网络强行串行化Naumi和钉钉。外部消息只带通用事件提示和需登录的入口，不复制需求标题、提示词或附件地址。

## 本轮证据与未完成事项

- 核验事务故障回滚、重复命令、并发领取、发送后回执写入故障、旧租约迟到完成、未知不重发、五次明确失败、应用revision变更、账号及来源绑定撤销、Worker CLI独立运行。
- 钉钉固定URL/body/token缓存/2048字节上限/接受与送达/已读未读/失败和不确定结果由注入HTTP协议验收；真实供应商调用0。公开文档原文及hash存放本轮忽略证据目录。
- 真实364行/292附件/129链接/210缩略图、0业务需求/0身份映射保持；真实库schema8，009/010/011仅隔离库；18482/18494不重启。
- 根typecheck的24项既有/上游React ref与本机缺three依赖诊断单列；独立工作流服务及受影响BFF单独验收。
- 待办：真实公司应用配置与少量员工试投、真实钉钉应用权限/限额、聚水潭商品订单同步、绩效周期通知、定时催办、监控告警和容量/蓝绿发布。不把本轮实现写成G14全系统接入完成。
