# Main 同步：Assistant 分镜请求与项目导航归位

## 固定输入、模块与职责

本片归属 `64ff0b81a90827a9ba9beb2a8874d8e482e2053f` 重构基线与 main `c4b1e2670ea2aebbd056fbf012f2c2ba0a93c513` 的整合。main 原 `CanvasClient` 中新增的准备式分镜请求、`?project=` 分享入口及已受理文本的原项目保存语义，分别接入既有 Assistant session、project navigation 与 text task owner，不恢复旧大组件中的第二份执行/文档状态。

## 公共接口、依赖与迁移

- `CanvasAssistantPrepared = {text, textNodeId}` 是可信组件入口传入的标量请求。`assistantSession.send(context, continueText, prepared?)` 对准备式请求不混入当前聊天 skill、图片引用或选中视频节点，也不覆盖用户尚未发送的聊天输入。
- 准备式请求仍使用原 session、turn、retained billing submission、SSE 解码器和错误恢复链。重复同一分镜入口沿同一 frozen body / submission 核对；普通聊天即使文字相同，也不误用分镜请求的身份。
- `context.storyboard?({projectKey,nodeIds}, current)` 仅在本轮完整成功结束后提供当前项目实际 `video_nodes` 的去重列表。晚到事件、跨项目/账号/工作空间、未完整结束的流均不打开“已完成方案”。Canvas 只负责原视频 store 刷新及面板展示。
- `CanvasTextComposer.storyboard?: {disabled,onPlan}` 仅投影已有 `StoryboardPlanButton`。可用性、正式文本身份和触发行为由组件组合入口传入，不在展示组件中复制 Agent 流程。
- `useCanvasProjectNavigation` 接收 `requestedProject` 与现有文档 `refreshProject` 读取端口，返回 `requestedProjectReady`。完成标志绑定 navigation 实例、账号/目标、工作空间 revision 和请求键，防止 A→B→A 重用旧完成标志。
- project controller 只在当前实际图谱加载完成且项目存在后消费项目键，并清除旧选中；即使 warm cache 中已有同名项目，也不会在新读取结束前消费。请求移除、旧 owner 的晚完成和不属于当前项目的节点都不成为新导航命令。
- `text-task.ts` / `text-task-controller.ts` / `document-scope.ts` 的既有实现已满足原文本答复跨项目后继续保存到发起文档、账号/工作空间 ABA 后不越权写入、显式恢复已知答案不重新生成。本片保持这些产品文件原始字节，不另加第三套 epoch。

## 集中验证及证据层级

记录目录：`output/refactor-main-owner-sync-20261103/assistant-agent/`；精确命令、stdout、stderr、退出状态以 `COMMANDS.json` 为准。

- 新正式入口 `node scripts/verify-main-sync-assistant-navigation.cjs`：**17 case / 95 check、exit 0**。执行实际 Assistant / project / text task owner 和实际 React project-navigation hook，使用独立 Chromium/Edge 及回环 HTTP 页面；认证、工作空间选择、文档刷新和 SSE 为显式测试端口，外部供应商调用 0。
- 同一新入口指向完整 `64ff` 基线：**exit 1**，实际请求保留 `textNodeId=text-selected` 而不是准备输入的 `text-script`。这证明旧重构 owner 尚未接入 main 新分镜能力，不将“旧版本没有新能力”另称为生产事故。输入由固定 main `storyboardPlanningRequest` helper 产生，基线构建没有借缺失文件/依赖失败代替业务断言。
- 既有 Assistant session：**15 case / 55 check、exit 0**，冻结正文、已知结果同步失败、工作空间/项目切换、历史恢复、停止、上传与同轮单请求合同保持。
- 既有文本任务：**19 case / 88 check、exit 0**，原价/原操作、保存失败只重存、项目导航继续原文档、三类 ABA、同节点双击、批次启动/失败/历史合同保持。
- 既有项目导航：**30 check、exit 0**，八类节点深链、工作流、浏览器返回、账号/工作空间恢复及旧 frame 退休保持；实际 React 和实际页面入口执行，供应商/任务写入 0。
- 定向 ESLint：exit 0。全仓 TypeScript、整合后当前完整 core、真实 Go/PG/完整页面验收由父整合片集中执行，不在本片冒认完成。

## 已修正的验证装配

- 原文本测试只抽取 `billing.submit` 闭包，遗漏 main 新增的实际 `readBillingSubmissionResponse` 依赖。首轮因此未取得答案，失败日志保留；脚本现装入真实 `client-response.ts` 和计时端口，原 19 case / 88 断言、原业务时序不变。
- 原导航测试抽取实际组件绑定后缺 `requestedProject` 和文档刷新端口，首轮页面异常后触发原 30 秒等待超时。失败日志保留；补齐实际绑定所需测试端口和原图谱数据，不改原导航预算，不用静态替身冒充 UI。

## 未完成与边界

本片不提交或推送独立分支，不处理 main 合并/部署，不解除 47 HOLD。父整合片负责 Canvas 组合调用、其他主线能力、正式 catalogue 注册、全局集中验证、四产物与复制回滚；本片局部通过不等于整个 PR 或整体重构完成。
