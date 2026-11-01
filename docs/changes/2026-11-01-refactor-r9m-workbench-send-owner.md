# R9M：首页显式发送与 SSE 会话应用归属

## 模块与职责

基线为 b7d407d2，5356 个原始文件完整冻结。沿 R9J 的同一会话聚合继续推进，不引入平行任务引擎，不按行数机械拆分。

`src/lib/agent/workbench-session.ts` 的 `createWorkbenchSession` 统一拥有账号 scope/generation、历史观察、显式发送准入、原 PUT/SSE/保存流程、插话及显式流句柄。`WorkbenchClient` 只绑定当前权限/登录输入、认证 transport、会话引用、React 投影和输入草稿；不再解析 SSE、持有 stream abort ref 或决定保存身份。

## 接口与依赖方向

- `send` 通过 `WorkbenchSendContext` 读取本次草稿、图片、技能与消息历史，调用既有 transport 和投影端口；`interject` 通过更窄 context 操作原会话。
- owner 不导入 React、Next、PG、供应商或页面；视图单向依赖应用 owner。消息列表仍由 React 投影保存，不维护第二份消息缓存。
- 原 `createWorkbenchSessionRecovery` 只有一个真实调用方，已一起迁移为 `createWorkbenchSession`，没有空兼容层。原 recovery 方法和 generation 仍沿同一对象。
- `deactivateAccount` 只脱离 UI stream 句柄；已发请求沿原 reader 排空，不把账号切换/卸载变成服务器取消。只有用户停止经原 session DELETE 后使用原 stream abort。

## 保持的业务合同

原 PUT、open 返回的 sessionId、图片/技能/history、原账号授权、POST 保存和 PATCH 插话保持；每个 await 后的账号/generation 核对保持。ready 变化不重建账号；StrictMode/URL 引导、显式停止、未知观察防重放沿原合同。未增加付费重提、自动换会话号、计价确认或状态机。

## 实际基线发现与修复

既有恢复39＋变更34场景在原版全部通过；新增8个显式运行场景后，原版共81场景中80通过、1失败。失败为 plan、delta、tool_start、tool_end 在同一次流批次到达时，计划的延后 React updater 读取了随后被 tool_end 修改的 `runSteps`，使工具步骤重复。原报告保留真实超时及三条步骤快照，不改为通过。

owner 现在在 plan 事件发生时捕获不可变 `plannedSteps`，再交给 React 投影，避免读取后续事件的可变数组。未削弱两条步骤的验收预期。新增场景同时覆盖真实 HTTP 字节分片/UTF8、HTTP503、损坏 SSE、显式停止、原 session 插话、账号切换保持原连接排空及提交授权延后。

## 验证与剩余

沿用两套实际 React19/Chromium/loopback HTTP/真实定时器 verifier，不 mock 应用 owner；全部旧断言保留。新版实际恢复/发送47＋变更34场景全部通过，原版为46＋34通过及1个真实组合流失败；真实供应商0、恢复PUT/POST0。全项目非增量类型检查与两个产品文件定向lint均exit0。浏览器执行前后全部5357文件字节一致；本段在验证结束后补记实际结果，属于单一文档桥接，不冒充执行时已含本段。原版失败、独立副本回滚、最终源码SHA及具体命令/输出分别归 `output/refactor-r9m-20261101` 的最终 VERIFICATION/DELIVERY。

本轮职责迁移不等于首页全部迁完：会话列表/重命名/删除、上传与 React 草稿仍有具体编排；后续按变化传播与真实调用边界审计。完整219目录、新head CI、main普通整合与整版交付仍单列；整体ACTIVE、未部署、47HOLD。
