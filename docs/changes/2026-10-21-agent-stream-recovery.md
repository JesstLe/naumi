# 画布助手流式中断恢复

## 定位
- 已有部分文字后，上游流缺少结束标记，SDK返回 stopReason=error；原canvas路径再次抛通用错误，遮掉结束原因。length此前当作成功。
- 本地字符边界为192KiB，本次截图没有命中它；历史仅能确认约120秒不完整流，未留底层关闭原因，不据此声称某个120秒定时器或token上限命中。
- 错误栏重试依赖输入框非空，已清空输入时没有可用的继续入口。

## 实现
- `stream-recovery.ts`统一识别error/length，保留正文，公开类型为STREAM_INTERRUPTED/OUTPUT_LENGTH。
- runtime持久化model_stream_end：结束枚举、有限usage、文字字符数与从调用开始算的elapsedMs。不会存入任意上游错误正文、URL或密钥；未知raw原因不透传。
- 续写必须显式传continueText和对应continueFromTurnId，服务端验证同账号/同项目、当前轮终态及实际正文。重复/并行续写返回409，不重开原付费任务。
- 续写上下文仅保留文字并正常化已保留的失败assistant正文，工具清空且beforeToolCall另行拦截。finally恢复原工具、系统提示和原轨迹；不靠模型自觉阻止重复生图。
- 续写仍经既有canvas.assistant鉴权/配置/计费入口；没有调整管理员模型、超时、maxTokens、报价或收费工具规则。
- 前端错误栏提供独立的继续输出入口；不需要重新填写原需求。历史恢复返回续写轮次；新会话/项目切换/删除清空。下一条请求历史限制到12轮/4000字符，与既有服务端输入边界一致，完整历史继续由服务器保存。
- 续写失败且没有新文字时，原部分正文及再次续写能力保留。取消不开放续写，进行中不接受并发请求。旧历史不重写、不自动重放。

## 分支与协作
- 独立worktree `E:/Workspace/naumi-agent-stream-recovery-20261021`、分支`codex/agent-stream-recovery-20261021`。
- 原基线53a32a0d；普通合入已确认6ffa8bbc回复期加图，形成7a43fd47，再叠本任务增量；不覆盖共享checkout未提交。
- 同文件timeline线程负责渲染/滚动/文字分段；本轮panel仅错误栏，canvas-client仅续写SSE/restore状态，runtime仅诊断/续写门禁。
- 开工/模块收尾刷新origin/main均53a32a0d；本模块同步计数1/3。

## 集中验收
- 真实pi-ai流+实际Agent+实际HTTP handler/隔离本机PG：缺finish、length、正常stop、空回复、冷恢复续写、失效轮次409、并行409、恶意工具调用、finally恢复、续写再失败再恢复、私密错误不持久化；外部供应商0、图片写入0、测试账户扣款0。
- 既有SSE报价/确认/幂等/画布挂载、104执行边界、356跨chunk/意图、活动反馈、19回复期加图、Agent配置计费及tsc共8模块通过。
- 实际CanvasClient/Panel桌面1440及手机390共10项：空输入继续、单次文字续写、部分正文保留、历史恢复、新对话/项目切换重置；pageerror0。
- 初次浏览器验收定位器误用及手机遮罩拦截，已修正到实际按钮；最终10项全部通过。协作预览snapshot超时两次，转仓库既有独立无头Edge流程，不接日常Chrome。
- 额外旧verify-agent-harness-runtime fixture未配置Router私有连接，在报价预检失败；该失败不算PASS。上述当前SSE/计费fixture已用独立Router完成实际门禁回归。
- Linux正式构建及独立副本真实回退见output/agent-stream-recovery-20261021/VERIFICATION.txt，最终状态按该证据更新。

## 发布边界
本轮没有SSH/生产写入/持47三锁/候选/切流/Worker动作；Git推送和本地构建不代表上线。47更新仍须刷新基线、统一协调三锁蓝绿，不重放已接受或未知的付费任务。
