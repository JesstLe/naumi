# 工作台历史恢复 / 运行中轮询生命周期

## 基线与交付状态

- 工具分配 worktree：`C:/Users/13357/.t3/worktrees/naumi/t3-82e91624`；分支 `t3/workbench-recovery-lifecycle`；父基线 `2c2d194e5284ed640ff96673d2c0f894edde7a63`。开工读取当前 AGENTS、协作规则、capacity-audit 末节和 Agent streams 文档，并执行 `git fetch origin main`，未整合额外提交。
- 独占业务文件 `src/components/home/workbench-client.tsx`，新增专属脚本和本记录；不另建 checkout、不再委派、不更新总账编号。固定 task-only commit 交父任务复核、串行整合；本任务不 push / PR / 合共享 main。
- 本地 React/Chromium/HTTP fixture 验证；没有 PG、付费供应商、SSH、生产发布/入口/Worker/DB 操作。47 本轮未接触；45 笔手术、在线索引和 UNKNOWN 保留原挂账。

## 职责、接口和状态归属

- `loadSession → recoveryJson → pollRecoveredRun → final history → refreshSessions` 只拥有**客户端只读 observer**；既有 GET URL/sessionId/since/authHeader 保持。任务、工具确认、账务及持久状态仍归原服务端，observer 清理不发 DELETE/POST/PUT。
- `RecoveryOwner` 是单个组件的 `id + generation + account scope + AbortController + phase`。`loading / observing / settled / unavailable` 区分客户端观察状态；`recoveryUnavailable=true` 明确表示后台状态未确认，不把 `busy=false / running=false` 的 UI 释放当后台完成。
- `cancelRecovery` 同步失效 owner 并仅 abort 恢复 GET / 清理 1200ms timer。`useLayoutEffect` 在卸载、账号/ready 变化及 StrictMode cleanup 时使旧 scope 永久失效；A→B→A 不复活原 owner。
- `recoveryJson` 在 authHeader、fetch、json 的 await 边界检查 owner；拒绝响应 body 取消，使用 `cache:no-store`。`recoveryDelay` 使用真实 timer，并在到期/abort 时同时清 timer 和 abort listener，不留悬挂 Promise。
- 列表刷新有独立的单请求 controller 和相同 account scope，不以开抽屉取消运行 observer，不让旧账号列表覆盖新账号。
- 恢复观察期间允许切历史/新对话，只解除观察，不停止后台。直接发起的 SSE 执行仍保持原忙态切换约束。显式停止仍沿原 DELETE + 当前 SSE abort 路径，不把 observer 卸载改成取消任务。
- `send / sendInterject / save` 只增加必要的同账号/同代围栏：提示词、商品图引用、skill/history/images、sessionId 和 PATCH/POST 语义不变。旧 SSE 在账号变化/卸载后继续读到结束但不再写当前 UI、不以新账号保存；一次性URL prompt在可清理microtask中启动，避免StrictMode探测清理耗掉首发；不增加 SSE cancel 或后台重放。
- 恢复观察失败释放 UI busy，显示明确错误，暂停该会话的新发送；用户可从历史记录 GET 重开或离开此会话，不自动延长轮询/重试、不制造完成记录。HTTP 404 也不作为已受理后台任务完成凭据。
- UI 沿用既有浅色样式及原文字动作；只调整历史/新对话的 observer 切换条件，并把已有“插话/停止”控制挂在运行中最后一条 assistant 下，避免收到 assistant 事件后停止按钮消失。没有新增面板或标语。

## 调研与实际缺口

原链路存在 `sessionLoadRef`，但只覆盖部分 load；`newConversation` 增代而 logout/unmount 没有恢复清理，`pollRecoveredRun` 没有外层账号/owner 保护。原 SSE controller 与只读 GET 无关，不能充当 GET 的取消机制。

实际 React19 组件和 Chromium 原生计时器复现（原源码，不是按字符串判断）：

1. 初始 history+live 两个 GET 后卸载，1450ms 内新增一个 GET，仍有一个 1200ms timer；8 次重挂产生 8 个残留 timer、24 请求。修改版卸载无新增 GET，8 次重挂16请求、残留 timer/listener 均0。
2. 账号 A→B→A 后旧 observer 继续 GET，保留 A 会话；修改版清理为无会话，旧代不复活。authHeader 等待期间 logout，原版仍发 GET，修改版0。
3. `live.json()` 迟到：A 已读响应头/JSON 后先切 B，原版仍给 B 添加 A 的 pending/running；修改版不应用。另一 A→B→A 用例原版能创建重复 observer，修改版始终一个 timer。
4. final history 的 JSON 已到达但 continuation 迟到，A→B→A 后原版最终消息被 `STALE-FINAL` 覆盖；修改版保留重新打开后的 `history-A`。该 seam 只延迟 JSON Promise 续体，不篡改业务判断；另有真实慢 HTTP body 检查连接在账号切换时被 abort。
5. HTTP503/断连原版静默停止观察并拉历史，JSON 解析失败原版留下 busy；修改版统一进入 unavailable、保留已有内容、无重放，并可同会话显式 GET 重开。
6. 原版重复点尚未完成的同一 history 会发两次 GET；修改版单飞。原版显式 stop 后旧 poll 仍继续，修改版仅一次用户 DELETE，observer 不再请求。
7. 原 assistant 更新替换消息时清掉 pending，停止按钮跟随消失；修改版消息正文保持显示，已有停止动作仍可点。
8. 列表 JSON、旧 SSE UI 完成/保存、插话 auth await 与账号切换之间缺少同代保护；修改版覆盖必要控制与保存边界。mock 正常发送仍恰好一次 PUT、一次原身份 POST，原提示词/引用逐字相同。

## 集中验证

专属命令：

```powershell
$env:REVIEW_DEPS='C:\Users\13357\.t3\worktrees\naumi\t3-18c8ab7e\node_modules'
node scripts/verify-workbench-recovery.cjs <SOURCE_TSX> <OUTPUT_DIRECTORY>
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

依赖只读复用匹配 `react/react-dom 19.3.0`、Playwright 1.63.0、esbuild 0.28.1、TypeScript 5.5.4；本 worktree 的 node_modules 为本任务 junction，没有安装/修改共享依赖。启动器对环境变量名做大小写无关白名单，保留 SYSTEMROOT，记录完整实际命令、stdin、stdout/stderr 和退出码。

验证装载**完整 WorkbenchClient 与实际 WorkbenchSessions JSX/事件回调**，只注入观察桥暴露真实 handler/state；不提取重写恢复算法。React/DOM、native fetch/AbortController、Chromium 和 loopback HTTP 均实际运行。auth context、authHeader、后台返回、无关组件为 fixture；没有声称真实认证、DB 或完整 Next 页面验收。

29 组覆盖成功、HTTP/JSON/network、慢 body、卸载、StrictMode、账户/会话 ABA、迟到 JSON/final history、重复初始读取、显式停止/失败/重开、原插话与保存身份、StrictMode一次性URL prompt、实际抽屉点击、8 轮重挂。基线/副本恢复为3通过、26未满足、exit1；修改版29/29、exit0。全项目 TypeScript exit0。确切最终结果及所有失败状态见四产物中的 VERIFICATION。

有界输入与资源：成功恢复路径6次 GET、3次 live、1个 timer 峰值、1个恢复 abort listener 峰值，终态二者0，JSON读取834字节；8轮重挂16次请求、1976 JSON字节、timer/listener 终态0。计数针对本 fixture 的 payload/客户端资源，不是生产网络总字节、OS句柄/RSS或10万活跃用户容量。HTTP逐请求 method/actor/id/since/字节/关闭状态均保存。

`RECOVERY_PUT_POST=0`；4次 `EXPLICIT_MOCK_PUT` 是专门验证原用户发送/保存路径的明确动作，修改版 `MOCK_SAVE_POST=2`，不是恢复重放或供应商调用；实际 `PAID_SUPPLIER_REQUESTS=0`。所有自有 browser/context/HTTP 在 finally 关闭，无常驻服务。

保留测试开发偏差：最初 browser bundle 缺 automatic JSX、toolBySlug 空对象缺 Icon，已修测试加载器并保存原失败日志；未当作业务缺陷。早期 final-history 网络 header hold 与浏览器同 URL 等待造成测试未到断言，最终改为确定 JSON continuation seam，并保留独立真实 partial-body abort 用例；不把早期超时当 final 覆盖证据。

## 四产物与复制回滚

绝对根：`C:/Users/13357/.t3/worktrees/naumi/t3-82e91624/output/workbench-recovery-20261029/`。

- `MODIFIED_FILE`：ZIP 格式，含本次源码/脚本/记录三个路径，重开逐成员核 hash。
- `DIFF_FILE`：三个明确路径的完整 Git patch，重开并对照 staged diff。
- `VERIFICATION.txt`：修改字段、四路径、原/改 hash、BASELINE/MODIFIED/COPY_MODIFIED/ROLLBACK/guard 的精确命令、输入、字面 stdout/stderr、exit 与恢复行为。
- `ROLLBACK.sh`：Git Bash executable，调用同目录 rollback.py；仅允许证据根下带固定 marker 的 rollback-copy/guard-copy。预先核对全部目标修改hash和全部原备份hash，之后才恢复1个原文件、删除2个新增文件；后来编辑拒绝 exit73/WRITES=0，不回滚工作源码。

原 `workbench-client.tsx` SHA-256：`0c5d1c53a25b4670e84d43d7d85d742b7ac7c908b48e1b05cd4c8623f0075f5e`。源码及 MODIFIED_FILE 保持修改版；副本恢复原hash和原缺口，原失败重现是回滚行为验证，不称旧行为测试通过。

## 未完成项与下一步

- 父任务独立复核、统一编号、串行整合；本提交未发布。
- 生产多实例/认证、完整页面样式与真实媒体/供应商、账号共享浏览器跨tab切换、真实运行时 history404/进程重启后的状态对齐，仍需对应集成验收。
- SSE read drain 的原服务端取消语义保持，没有把只读 observer 的有界资源结论扩大到所有流；长会话持久化/RSS、事件数组裁剪游标、画布另一套流继续另切片。
- 原模拟进度、提示词/媒体/工具确认、后台任务身份未作为缺陷修改；没有扩大到 canvas-client/db/billing/runtime/SSE route/release collector。

复核提示：

```text
从固定 task-only commit 和原父基线对照，仅复核工作台恢复生命周期。
先重跑29组实际 React19/Chromium/loopback HTTP，核对恢复PUT/POST=0；
4次明确 mock PUT 与2次正常保存要单列，切勿当付费请求或恢复重放。
检查账号scope+owner代际在auth/fetch/json/final/save边界，stop仅保留原显式协议。
重开四产物并在副本测试hashguard和原缺口恢复；不修改父树/总ledger/47。
```
