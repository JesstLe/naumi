# 工作台附件与历史编辑的异步归属（A53–A55 / D35–D37）

## 模块与职责
`WorkbenchClient` 负责当前账号/当前输入视图的附件上传结果，以及历史会话改名/删除的客户端反馈。后台任务、会话持久化、媒体权限和账务规则仍由原服务端拥有。本切片不修改后台取消、SSE、付费请求或恢复重放协议。

## 公共接口、依赖与状态归属
- 历史编辑仍使用原 PATCH `/api/agent/session` 与 DELETE `/api/agent/session?id=...`，原 id/title/body/认证头保持。改名仍返回 Promise<boolean>，删除仍返回 Promise<void>。
- `ownsAccount` 复用已有 `RecoveryScope` 的对象身份和 active 标记；不按 email 字符串相等让 A→B→A 复活。账号未变的 ready 切换不撤销操作。
- `AttachmentUploadOwner` 只归属一次客户端附件批次，包含已有账号 scope、附件视图 generation 与 AbortController。generation 在实际选择历史/新对话或卸载时失效，不复用只读恢复的取消 generation，避免同账号 ready 变化误丢上传结果。
- 上传 transport、JSON await、局部作品缓存、错误反馈与最后附件追加都检查归属；file input 和真实剪贴板入口复用同一批次函数。失效后只取消本客户端上传传输，不发后台 DELETE、不删除已可能保存的作品，也不以中断证明上传未受理。
- 同视图重叠上传由当前 owner Set 统计 busy；早结束/旧代 finally 不会把新批次 busy 清掉。Set 不持有跨账号/卸载的资源。
- WorkbenchSessions 按账号 key 隔离自身编辑/删除 UI 状态。账号切换清除旧账号的上传 URL→作品缓存及门户参考图/预览；匿名→登录的待发送草稿保持原契约。

## 实现与迁移状态
原 `uploadOne` 及其两处批量调用方无异步归属保护，迟到 URL/error 会串入后来的账号或会话；原 rename/remove 在 auth、HTTP、error JSON 和成功 UI 写入处均有相同缺口。当前改动收敛在 `workbench-client.tsx`，没有改变任何后端权限、HTTP错误码、任务身份或提示词/媒体契约。

真实 same-account PATCH/DELETE 失败现进入原中文错误反馈并回收响应；成功响应和失效响应 body 均取消释放。没有引入重试或对服务器已提交状态作推断。

## 验证命令与证据层级
新增脚本 `scripts/verify-workbench-mutation-ownership.cjs` 使用完整实际 WorkbenchClient、WorkbenchSessions、clipboard-images、React19、Chromium、真实 timer 和本地 HTTP。鉴权、非相关 UI、持久后端为 fixture；不代表生产权限或真实媒体跨账号可读。

原始源码保留于 `output/capacity-workbench-mutations-20261030/BASELINE_FILE.tsx`；所有准确命令、输入、literal stdout/stderr、exit 与阶段 JSON 写在该证据根。测试脚本允许传入原文件、修改文件和独立副本；原39及独立15的既有断言保持不变。

首次31场景运行原12过19未满足，修改29过2未满足。两例都是网络fixture只断开首请求，Chromium复用了其原生重试并得到第二次默认200，实际trace已保留；最终把故障设为持续断连后复测，不修改业务断言让它通过。这不是应用新增重试。

最终集中结果及副本回滚在下方追加；父线程统一全项目类型检查与普通整合，本切片没有单独全量构建/提交/部署。

## 未完成项与下一步
本轮只闭环附件和历史编辑的客户端归属。真实认证与媒体权限、完整 Next、生产浏览器及整站容量仍按父任务对应验收，不依据本地fixture数字划掉其他台账。原A50–52、SSE/GET恢复语义保持，其他任务文件不改。


## 最终集中结果与副本回滚
- 新增实际组件矩阵34项：BASELINE **13通过/21未满足、exit1**；MODIFIED **34/34、exit0**；修改副本 **34/34、exit0**；副本恢复 **13通过/同21未满足、exit1**，失败名称与错误文字逐项一致。21是场景断言，不是21个独立生产缺陷。
- 既有恢复套件原39项 **39/39、exit0**；父保存的独立15项旧断言 **15/15、exit0**（原未修 upload/rename/remove 三项现已通过）。没有改这两份既有脚本。
- 正常门户上传后的提示词、images数组、单次显式mock PUT及保存行为保持。恢复GET不增加PUT/POST；新增34场景中的17个POST包含测试明确触发的上传/正常保存，不是恢复重放。真实供应商/生产网络/PG调用0。
- 上传批次的正常完成、跨账号/账号ABA、同账号会话ABA、已解析JSON迟到、认证等待、响应body未完时卸载、并行粘贴以及旧finally不清新busy均通过。真实账号切换清门户File/preview，匿名登录草稿由39项原契约覆盖保持。
- 原始SHA256：`609bee3f116469a64df94ccfc3f63d8d0494852c361edefd6289809c245ddea0`；修改源码SHA256：`93276d8a40337a28218940535754ca2634b9064de2f794fecdaaa4d3da7f0a67`。
- 四产物根：`output/capacity-workbench-mutations-20261030/`，包含 MODIFIED_FILE.zip（三文件）、DIFF_FILE.patch、VERIFICATION.txt、可执行 ROLLBACK.sh。回滚仅在标记的独立副本中恢复1原文件、移除2新增文件；所有目标和原始payload先全量校验hash，后来编辑/真实源码目标均在写入前拒绝。活动源码保持修改版。
- 每轮脚本 finally 关闭自有HTTP/浏览器，保留PID/端口和请求trace。首次fixture准备偏差与原失败日志未删除。父统一执行全项目类型检查、审查和Git整合；本子任务没有提交、推送或上线。
