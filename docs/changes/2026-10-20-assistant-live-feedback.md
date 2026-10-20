# 2026-10-20 画布助手首字等待与流式反馈

## 基线与边界
- 用户截图显示长时间「等待模型响应/已等待0:45」，诉求是在首字前明确运行、有正文即显示，不再整段突然出现。
- 独立 `codex/assistant-live-feedback-20261020`，worktree `E:/Workspace/naumi-assistant-live-feedback-20261020`；父 `b0e74179` 包含本线程多参考画幅/回执修复。origin/main `3f940b86`，开工 fetch 无新增。未覆盖共享 admin/action-menu 在途改动。
- 原代码已有 safe text_delta → PublicOutputBuffer → SSE delta → React文本追加，普通正文不等换行；不是所有模型都会在生成首字前提供可公开的正文。

## 实现
- 提交即在对话中显示本轮用户消息和动态活动卡，覆盖图片/会话准备阶段。显示动画条与骨架，不伪造百分比、检查结果或已完成阶段。
- 原生模型事件只提取 processing/thinking/responding 枚举，不发送推理内容、签名、系统提示或工具参数。思考状态仅在收到真实thinking事件时显示。
- Canvas SSE打开即发送processing；无事件5秒发一次仅证明服务端流连接的heartbeat，不声称供应商健康；不进入持久历史或计费，不发额外模型请求。停止、异常、结束清理回调/计时器。
- UI区分连接/处理/真实思考/回复，真实工具及待确认状态优先；收到正文持续显示并带光标。15秒/45秒提供等待解释；没有新状态时显示等待新状态而非谎称连接正常。
- 保留原始正文流与跨块脱敏；不发送思考链原文，不改变模型、reasoning设置、付费工具、报价/授权或恢复/停止行为。旧SSE无新事件时仍有动态反馈。

## 验收
- 新增实际源码探针29项通过：执行CanvasClient真实提交函数、runtime真实subscribe与PublicOutputBuffer、canvas真实SSE handler；覆盖headers前消息/连接占位、真实thinking仅枚举、跨块脱敏、首段先于结束、5秒heartbeat、成功/错误/停止清理、旧协议、长等待与状态过期、工具/报价优先、reduced-motion。外部供应商0。
- 集中回归：stream-intent 356、harness 104、activity、review-state 26、generation-failure 24、frame-choice 13、receipt-resume 7及tsc通过。server-only测试必须使用NODE_OPTIONS=--conditions=react-server；首轮缺条件的2个命令失败已更正，保留原日志。
- 旧sidebar静态guard在父分支同样失败（仍期待历史的禁用表达式/按图片key/直接copyText）；只修正3个断言为现有停止按钮、项目会话key、copyAssistantText，展示/键盘/引用回归通过，不改业务去迎合旧测试。
- 浏览器使用esbuild实际CanvasAssistantPanel+从真实CanvasClient提取的sendAssistantMessage，接本机SSE；1280x800及390x844通过：headers延迟1秒仍立即显示用户消息/connecting，波形实际变化，真实阶段、首段与光标、完成清理、停止恢复输入、45秒慢响应解释、断线退出。BROWSER.json及三张原始截图保留。未使用完整Next页面/真实供应商时延作为验收，未执行生产build。
- 浏览器fixture初版缺process.env shim而空白，修正后最终会话pageerror为空；不将该初版错误隐藏为全程零错误。截图拼图仅裁取真实浏览器面板，非概念效果图。
- E盘余量约2.5GiB，最终采用轻量esbuild内存/小文件fixture，无Next开发/构建缓存，不清理他人工作。
- 原hash、zip、patch、独立副本回退及恢复旧行为的字面输出见output/assistant-live-feedback-20261020/VERIFICATION.txt。
- 供应商调用0、47操作0。只本地修复/任务分支push，不合main不发布。功能迭代同步计数1→2。
