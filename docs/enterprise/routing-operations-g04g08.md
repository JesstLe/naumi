# G04 表单归属与 G08 运营签收

## 产品路线

保留18482原UI。需求由本系统提报，钉钉/Excel仅作为历史来源。按明确表单字段匹配承接团队，不按姓名、花名或标题猜人。规则不自动创建账号、不代替设计/美工认领。

## 需求字段

新增可选routingFields={brand,shop,businessUnit,workKind}，前三项明确文本，workKind为design/artwork，空字符串表示尚未指定。普通创建/编辑仍兼容未配置规则的团队；发布路由规则后，匹配需要明确字段。原Excel来源转换不猜填字段，运营在草稿确认补充。原始来源行和姓名不改。

## 跨团队交接与权限

创建需求记录requestTeamId。匹配后只改变承接teamId，原提报账号与提报团队保留。原提报人在其原团队继续查看需求、任务与交付文件并运营签收；原团队manage/dispatch可跟踪和人工处理本队列，绝不因此获得承接团队的指派/执行/验收权限。承接团队按原角色授权受理、拆分、分配和验收。

目标团队须由其manage显式开通某来源团队的承接关系，支持关闭；来源主管不能单方面把数据投递到任意团队。双方同一企业。目标停用、关系关闭或规则目标失效都进入人工队列，不绕过准入。

## 规则与提报

来源团队manage保存最多50条规则草稿，另一名manage发布。每条规则按品牌/店铺/业务单元/工种精确匹配，空条件表示该维度不限，至少有一个条件。没有隐式优先级：0条命中为未匹配，多条命中为冲突（即使指向同队也要求处理），只有1条且目标有效才归属。已发布版本与每次路由结果保留。

普通submit-requirement在同事务中应用已发布规则；未发布规则保持原手工同队受理流程。规则开启后有疑义的需求进入本来源队列，批准/拆分被阻止。来源dispatch/manage可预览、填写原因后明确选一个已开通的目标；使用order.expectedVersion及预览hash，提交时重新核对规则和目标资格。人工可明确留在本团队。不自动认领或指派员工。

承接方退回修改将无任务的submitted需求退回原团队draft；再次提交按当前规则重新判断，不沿用过期决定。已受理/已拆分/已执行的需求不允许通过路由转移任务归属；执行中换人使用已有交接流程。

## 运营签收

所有任务设计验收通过后，需求completed但运营状态仍待签收。原提报人（当前仍有request权限）或原团队manage可签收/提出后续修改；操作者不是该需求的任何历史执行参与者。签收与设计验收分开记录，签收不新增绩效事实。

签收保存原因、操作者、时间和已验收资产版本清单。提出后续修改需明确新需求标题/说明/验收标准，原completed需求保留状态、原任务、交付版本及绩效；同一事务创建原团队的新draft并写双向链接，防止重试产生重复后续单。每单仅允许一次运营终结决定，后续单再次走完整流程。原团队manage也不能修改已确认绩效。

## 工程与集中验收

010新增规则草稿/发布历史、来源目标承接关系、命令回执和审计；不改源app_*。路由事务与普通workflow命令共用顺序：command锁→order锁→读取规则/目标FOR SHARE，规则管理只锁配置不反向锁order，避免锁环。所有跨团队执行写入口，包括文件上传，仍严格匹配承接teamId。

验收覆盖精确字段、0/1/多命中、双方授权、停用/撤销、预览hash/CAS、自动提报与人工决策、退回回源、原团队只读禁止越权、附件校验、运营独立签收、后续草稿幂等/事务回滚/溯源、绩效事实不改，以及原UI/真实数据保留/副本回滚。

## 当前状态

实现与服务端/BFF集中验收完成，原生T3浏览器23项流程通过；完整回归及副本回滚记录见本轮交付材料。公司实际规则、跨团队承接关系、真实账号映射仍待配置；隔离示例不自动写入真实库。

## 页面入口与员工实际操作

1. 原需求中心的“员工工作区”复用Naumi登录，先选择当前授权企业与团队。/admin仅提供来源，不作为新的协作首页。
2. 承接团队管理员进入“本团队承接设置”，选择允许送入需求的来源团队，填写依据并确认；关闭关系只影响后续路由，不撤回已有执行单。
3. 来源管理员进入“需求归属规则”，逐行填写规则名称、品牌/店铺/业务单元/工种和目标团队，保存草稿。另一名管理员复核发布；草稿不影响已发布规则。
4. 运营新建/编辑需求，填明确字段后可“预览归属”。预览不持久化任务，正式提交时重新计算。需求详情展示来源和承接、规则版本、自动或人工决策原因。
5. 未匹配/多命中/不可用进入“待确认归属”；主管先预览再选择当前有效目标并填原因。同单版本变化或目标承接变化要求重新预览。
6. 设计主管在承接团队受理、拆任务；执行人原样认领、执行、交付。提报侧的任务、周排期与文件保持跟踪只读，批量指派/标签、交接、上传和来源关联按钮不作为跨团队操作入口。
7. 设计全部验收后，运营可签收或填写独立后续需求。签收不是再验收，不重复产生积分或绩效；后续需求重新审批、排期与交付，原验收版本保持。
8. 后续单的requester是实际发起该后续单的签收操作者，原单保存followupId，后续单保存followsOrderId；同团队主管可查看两者。权限仍逐单判断，原单提报身份不自动授予他人新单权限。

## 接口契约与数据来源

所有正式接口从当前Naumi会话获得source identity，并用短时签名传给独立工作流服务；浏览器提交的企业/团队仅为请求范围，不作为授权声明。

|层|入口|参数/动作|授权与结果|
|---|---|---|---|
|BFF|GET /api/enterprise/workflow/routing|enterpriseId、teamId、action|源端会话/企业授权后请求工作流；未知字段400|
|读取|GET /v1/routing|rules|成员读取发布版本；manage额外读取草稿，返回当前可承接团队|
|读取|同上|connections|仅manage；同企业启用团队及当前团队已允许的来源|
|读取|同上|preview、orderId|当前团队可读需求；匹配状态、规则版本、目标列表和previewHash|
|读取|同上|queue、page|manage/dispatch；当前来源团队submitted待确认队列，每页30|
|读取|同上|audit、before|manage/dispatch；当前团队配置审计，50条游标翻页|
|写入|POST /api/enterprise/workflow/routing?action=configure|commandId、expectedVersion、reason、action|严格同源、JSON、64KiB；服务端manage和CAS|
|写入|POST /v1/routing|connection / save-rules / publish-rules|承接开关、规则草稿、独立发布；命令回执去重|
|写入|BFF action=resolve → POST /v1/routing/resolve|commandId、orderId、expectedVersion、targetTeamId、previewHash、reason|仅来源manage/dispatch；原需求正常版本+1，保留决策事件|
|需求|原workflow command|submit-requirement|在订单事务中评估发布规则；失败全部回滚|
|需求|原workflow command|operations-signoff|completed、原团队有权角色、无历史执行参与；保存签收和验收文件ID|
|需求|原workflow command|operations-followup|另需followupId/title/brief/acceptance；双订单、双事件、回执同事务|

组织、账号、承接关系来自工作流显式配置，不从Excel列名猜测。规则条件由管理员维护；未来品牌/店铺主数据适配可使用稳定业务ID，但本轮是大小写敏感的精确文本匹配。前后空格由schema去除，不做模糊纠错。

## 并发、容量与异常

- 发布规则不批量改写历史需求。多人编辑草稿通过expectedVersion拒绝覆盖，规则版本永久保留。
- 路由事务锁住有效承接关系、团队及有效调度账号/成员，撤销并发按事务先后生效；目标至少存在一个有效dispatch成员。
- 原需求与后续需求使用排序后的订单锁，防止两个相反后续ID造成锁顺序倒置；稳定commandId与followupId防重试重复创建。
- 规则最多50条；配置团队目录超过500项显式报ROUTING_DIRECTORY_TOO_LARGE，不静默截断。企业超出该规模时另做服务端搜索/分页。
- BFF每身份读写各60次/分钟；事务锁等待3秒、SQL10秒；写请求超时返回WORKFLOW_WRITE_UNCERTAIN，保留命令ID重试，不能当作确定失败再生成新ID。
- 签收时重新校验已验收文件的任务归属和实际文件；文件损坏/缺失时不写签收。Excel来源附件与正式交付文件分开。
- 日志保留操作人、原因、版本；本轮不发送钉钉通知、不触发聚水潭写操作，不创建薪酬支付。
- 4核8GiB阶段沿用单工作流进程+PostgreSQL，G04/G08为逻辑模块，不新增两个常驻微服务；实际容量阈值仍由G15负载验收确定。

## 验证、发布与回滚

原生T3先执行routing-ops-browser-check.js，随后仓库自动化回归脚本verify-routing-ops-browser.mjs在独立浏览器/18508隔离数据库运行，补充刷新恢复和390px。原任务、交付、排期、交接批量、来源关联、绩效和旧原型回归在各自新fixture运行。

集中命令：
```powershell
node design/enterprise-demo/build.mjs
node design/enterprise-demo/release-check.mjs
node node_modules/typescript/bin/tsc -p services/enterprise-workflow/tsconfig.json
node services/enterprise-workflow/build.mjs
node services/enterprise-workflow/verify.mjs
node services/enterprise-workflow/verify-import.mjs
node scripts/verify-enterprise-integration.mjs --regression
# 下列浏览器写验收必须先运行 --workspace-preview 隔离fixture，不能替换为公司库。
node scripts/verify-routing-ops-browser.mjs
```

真实数据只读复核：364行、292文件、129链接、210缩略图，原文字节和文件hash、重复导入不写、备份副本恢复一致。真实正式需求和人员映射仍为0。本轮009/010仅在隔离库应用；18482动态读取同一HTML，不重启18482/18494，不连接服务器。

根typecheck的24项既有/上游诊断（4项React ref、20项本机Studio3D缺three相关）单独记录；独立工作流类型和受影响BFF通过，不将整仓标成全绿。

回归修复记录：运营签收的需求详情扩展最初在本机来源模式也读取workspace.context，原intake回归暴露null会话异常；现明确只在scope.active员工工作区加载，保留本机来源模式原详情。浏览器刷新后另一个测试等待条件也从“抽屉ID已变化”改为“溯源控件实际出现”，避免异步扩展尚未完成就断言。两者分别留存初始失败日志，并在新隔离fixture复测。

交付包含MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt和可执行ROLLBACK.sh。先在新副本检查所有当前hash，再恢复基线文件/移除本轮新增文件，测试恢复行为。修改后副本保持新代码。该脚本只接受带标记的代码副本，不删除/回灌真实DB或已接收任务；正式应用009/010与蓝绿发布留给G15。

## 后续

G14先实现与业务事件同事务的outbox、去重/退避/死信、通知收件人映射与可追踪回执，默认无外部投递；钉钉、聚水潭及其他系统的实际接口/授权逐个确认。G15落实真实Naumi企业稳定ID、签名桥接、账号/团队/真名花名映射、公司规则和私有部署容量/蓝绿验收。总目标继续ACTIVE。
