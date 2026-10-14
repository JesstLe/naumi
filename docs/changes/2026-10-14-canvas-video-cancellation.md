# Agent停止、租约竞态与视频编辑范围复核

本批补齐V14、V15、V18，完整矩阵为26/34项（约76%），注册34份证据。比例表示能力条件验收，不包含完整上游实操、分支审阅、固定Linux候选/排空回滚和103正式发布等未完成交付门槛。

## 新增实际应用停止与竞态

`verify-video-fusion-cancellation.ts`使用真实Agent工具及参数校验、私有HTTP路径、实际App/PG/Go Router/视频Worker，供应商为隔离Ark模拟。按已保存节点配置生成，同一tool_call重放返回原task。五个持久任务包括四次显式生成及一个由本账号既有冻结快照准备的未提交队列任务。

- 未提交prepared任务经Agent停止后cancelled、释放预扣，不发供应商创建。
- 已提交且支持取消：停止工具返回processing与cancellationRequested=true，费用继续保留；实际Worker发送原生停止并轮询确认cancelled，之后一次退款，重复停止不再次退款。
- 原生停止返回405不支持：任务继续完成，保存真实产物并一次计费。已完成任务再请求停止不删除结果、不改变费用。
- 确定性租约竞态：供应商真实HTTP poll暂缓返回，实际SQL租约期间另一Worker扫描/Agent查询不能再发poll。仅在本任务隔离DB把已存在、归属本账号的活动poll_lock_until改为过去，模拟执行时间超过租约；实际懒轮询重新领取并先完成。放行旧poll后，它不能新增作品或第二笔结算，最后余额严格等于三个完成任务的费用、预扣归零。
- 其他账号404、当前画布项目不匹配拒绝。实际App重启恢复原task、原产物和费用，逐份下载SHA保持，跨账号媒体404。

harness仅新增可选原生poll观察钩子及严格归属的隔离租约过期辅助函数，没有修改正式取消/计费实现。未把临时网络等待、取消请求或供应商DELETE成功直接视为已取消。终态60423 exit0；证据`checkpoint-d/cancellation-df69fed2-5818-4b23-8b3e-02cba0ae141f/result.json`及`native-calls.json`。实际原生创建4次、停止3次、轮询8次；结果明确requested=processing/supported=cancelled/unsupported=recovered=late=completed。

## 既有范围复核

V14：复核当前edit_video实现和production-3710100e实际App记录。风格、局部、主体替换、剧情四方向均绑定正式源视频、身份图片、源音频和完整文字，原生Ark请求具有视频输入并完成。专用video_edit保持；只有明确视频参考能力才允许reference路径。文生/仅图片/缺source_video/明确0或未知视频能力/其他账号/未完成来源七种拒绝没有任务、供应商创建或费用。来源SHA、工作台边界和App重启重放保持。此证据证明执行契约，未证明真实LLM创作策略或视频模型效果。

V15：登记agent-tools-94820096既有真实工具证据，核对查询配置/全文剧本、set_video_prompt全量保存及revision重放、旧revision拒绝、generate_video原节点恢复/get_video_task完整产物/重启/账号隔离；新取消模块补齐此前停止缺口。AgentHarness当前明确用户停止意图允许cancel_video_task/workflow/media，私有网络白名单限定本应用取消路径。真实SSE/侧栏的人类确认与制作链证据保留，真实文字模型策略条件仍在V12/V13待办中。

## 当前CI与交付

28c646e的Image gateway38550221514和Docker38550221705均终态failure：实际verify/resolve job仅约2秒、steps为空，其他Docker步骤skipped，没有运行新代码验收。连接器不支持check-runs读取，现有CLI令牌读取检查原因403；没有取得失败原因，不推断源码错误或账户原因、不声称新报价RSC兼容已在Linux通过，也没有反复重跑。

此前355c428完整npm build、计费事务、计费浏览器、业务模型浏览器成功证据保持。新完整固定候选仍须建立并通过对应验收。当前TypeScript、diff检查与26/34矩阵检查通过。本批付费视频消费0，没有服务器连接、部署锁、103上线或维护计数增加，目标继续进行。
