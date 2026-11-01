# R10B：供应失败诊断与再次购买授权分开归属

## 实际复现

基线`474c04d952aa43b94ee987fcd3a9acdfe918bfc2`，5393原始文件完整保存。真实创建handler、PG、租约、回环供应及钱包七场景确认：无`not_charged`证明的403在execution stage是`failed-response`，但父任务仅凭paidOperations的`rejected`与客户零扣款给出`NOT_ACCEPTED`。原批次按该代码将attempts从1推到2，通道恢复后实际发送第二个供应POST。显式not_charged的403同样可重试，二者此前被混同。

这不是客户余额不足。HTTP失败、客户零扣款和供应明确未收费是三个不同事实；本轮不恢复积分确认、不增加运营审批、不延长等待，也不改变原客户未交付释放预占的政策。

## 职责与公共边界

- `model-config/execution-audit.ts`仍拥有真实供应阶段写入，沿原事务把原`currentImageOperationId`记录到已有usage元数据，不加新表、不另开事务、不改原operation_id或供应wire。
- `model-config/image-rejection-policy.ts`拥有纯证据判定：每个原paid unit必须有匹配root／unit的`rejected-not-charged`；重复证据不能补另一个缺失unit，任何unknown／failed-response／已成功阶段／外来身份均不授权新购买。
- `model-config/image-rejection-evidence.ts`是原阶段数据owner的只读公共接口。缺历史证据或读取失败返回未证实，不反向接管imagegen状态、钱包或调度。
- `imagegen/dispatch.ts`只在原子任务归属检查后询问上述接口；全部原attempt及unit已拒绝且证据完整，才投影`NOT_ACCEPTED`。普通失败仍显示原净化原因；批次复用原`NOT_ACCEPTED`规则，无新重试框架。
- 原生成任务、paid checkpoints、客户释放／结算、provider pin、租约、原请求编号均由原owner维护；没有把UNKNOWN转为未受理，也不通过换编号查询旧结果。

## 同任务集中验证

七个真实PG场景：正常6积分交付；403无证明；403明确未收费；503无证明；供应接收请求后真实socket丢失；批次403无证明；批次403明确未收费。每case沿同一original operation核对父子、实际stage、供应次数、作品、预占、账本与用户GET；没有seed done或替代handler。

基线完整七项复现，候选完整七项PASS：无证明批次2次POST／attempts2→1次POST／attempts1；明确未收费对照仍2次／2次，失败场景客户consume0／预占0；正常图仍1笔6积分和原字节hash。真实socket关闭保留started及供应unknown/pending对账，客户释放不等于供应未收费。15个纯政策正负例通过。

独立fixture案例之间只恢复其自己的provider health。批次fixture观察到原自动新attempt后显式模拟通道恢复，并驱动原队列owner；不是删除原pin／paid checkpoint／客户账本来制造重试，也不修改业务冷却或超时。

原父回执25场景、首paid checkpoint5场景、供应quota整模块及runner20场景368检查已集中通过。quota旧脚本的usage只期待upstreamFailure；真实原基线已经额外保存parameterPlan，原样复现失败留存。现完整精确断言冻结parameterPlan、原unit identity和原有净化诊断，不删上游隐私、费用未知、pin及fallback断言。父回执loader登记实际新模块，不替代业务实现。

## 固定完整应用与浏览器

扩展已有full-image provider、fixture trace与独立浏览器case，而非新增测试运行系统。三个实际Canvas操作覆盖403无证明、明确未收费和实际socket丢失，读取真实UI使用的`/api/generate-image?job=原父ID`，同case核对原父回执、可见错误、账务、供应trace，再重载确认零付费重提。browser fixture显式启用单通道priority，原普通生成／编辑断言保持；原始96项加新六项单次实际 **102 PASS／8 consume／48积分／exit0**；三个失败case各一供应POST、客户consume0，真实可见错误与原GET／账务／阶段／reload同case闭合。

基线使用原61ef完整镜像（原2149产品字节与474相同）和新增验收fixture，三个新case／六检查实际PASS，仅执行选择用例，不冒称又执行原96项。最终候选固定镜像、完整组合、类型、四产物与回滚结果以VERIFICATION／DELIVERY封版为准。

## 失败尝试与边界

原始失败日志保留：proof列为text而verifier误按对象读取；source-root与tsconfig别名混用的诊断副本；批次应使用batches/[id]而不是单任务GET；显式驱动队列和通道恢复的fixture生命周期。最后完整基线是在产品修改前当前checkout执行，并核实全部5393原始文件raw一致。

首次浏览器verifier错等imagegen GET、且fixture尚未启用通道；第二次首case通过后独立案例沿用上次403冷却。修正验收协议／隔离输入，不放宽产品断言或导航期限，失败与资源cleanup不覆盖。

M03／M04只推进本轮具体真实PG／供应socket场景和对应页面维度，远端对象PUT、其他故障及整体语义耦合审阅仍需完成；224目录登记不等于整版已执行通过。整体ACTIVE，候选未合main，本线程未部署。最终SHA／固定image source、baseline→modified→copy rollback及后续编辑零写见本轮产物。

固定完整镜像已实际构建：应用源`d579379549ed1fab5c405f0ef81544a23cf1d7e2`，5398文件，image`sha256:05fc8097b2cb9aa5700bade89ef6489c2ec2b1018c818bfb8212de70e3c29b1f`，Web/Worker/media包探测通过。原generation整组首次在scope-receipt的自定义loader漏登记新只读依赖处FAIL，12PASS/1FAIL/8NOT_RUN保留；该receipt-only夹具登记为禁止调用的sentinel，原23条业务断言不变。后续完整重验独立输出，不拼接成一轮通过。

## 最终本机收敛

- 完整generation组在`923cc385bfb1c3d022a8af310511ee8c54a2c2a4`原顺序单次21/21 PASS、0FAIL、0NOT_RUN、0reuse；顶层报告按“只选generation而非全部core”的既有合同返回PARTIAL／exit2，全部21子命令均exit0。没有修改runner的退出语义或将它写成完整224通过。
- 全项目非增量tsc／定向lint最终exit0，5108编译器输入及4配置完整hash绑定。原四个关键verifier中285个断言调用AST（仅规范CRLF）保留；一个quota usage断言按完整现有合同精确扩展，断言删除0。
- 应用固定image仍源d5793795；后续923cc385只改receipt-only夹具接线及本文，最终证据文档提交不改产品字节。浏览器fixture／provider／checker与实际执行绑定；没有把镜像源改标为后续文档源。
- 自有full-image容器／network／PG tmpfs cleanup已PASS。独立PG待副本回退验证后按CID／label／无其他连接核对清理，最终状态归VERIFICATION。
- 最终完整源码、原始字节patch、首写前完整hashguard回滚及恢复后旧七场景行为，以本轮四产物和DELIVERY为准；工作区保留新版。后续编辑不匹配零写入，禁止回滚实际工作区。

本轮具体M03/M04阶段及页面证据已推进；没有证明真实供应商额度／付费质量，也未关闭远端对象PUT与已付费同任务交付的剩余故障矩阵、全部语义耦合审阅、当前224同源CI或最终候选合main。整体ACTIVE。分支已超48小时，原因是整体退出和有效同源CI仍未闭合；本线程不执行发布。
