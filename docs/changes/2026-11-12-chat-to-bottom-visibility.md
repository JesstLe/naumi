# 对话「回到底部」按钮显隐修复（2026-11-12）

## 模块与职责
- `src/components/home/creation-workbench.tsx`：首页/Agent 对话工作台布局组件（展示层）。负责对话流渲染、composer 挂载、自动跟随（follow ref）与「回到底部」按钮。
- `src/components/home/creation-workbench.module.css`：同一组件的样式，含对话区、sticky composer、按钮浮层定位。

## 公共接口、依赖方向、数据/状态/事务归属
- 公共接口不变：`CreationWorkbench({port,children})`，`port:CreationWorkbenchPort`（`./creation-contract`）未改动。
- 依赖方向不变：本组件仅向下依赖 creation-* 子组件与全局 context hook；本次新增滚动监听只作用于组件内部状态，不引入新的跨模块依赖。
- 状态归属：新增组件内 `toBottom` state（按钮是否显示）；滚动容器为 window（`.main`/`.layout` 无 overflow），测量逻辑 `awayFromBottom()`（`document.scrollingElement` 距底部距离，阈值 80px，与 `canvas-assistant-panel` 一致）。

## 本次实现与迁移状态
- 问题：按钮块原本无条件渲染且位于文档流中（stream 之后、composer 之前），滚动到长文中段时它远在视口下方，只有滚到底部才进入视野——与使用场景（长文中途回底）完全相反。
- 修复：
  - 新增 `toBottom` state；window scroll 监听（passive，仅 conversation 视图挂载，切换/卸载清理）+ `port.messages` 变化时重测（流式追加内容变长也保持显示）。
  - 距底部 >80px 显示按钮，≤80px 隐藏；短对话不可滚动（away<0）恒隐藏；切换会话重置为隐藏并由 follow 自动跳底。
  - CSS：按钮块改为 `position:sticky;bottom:176px;height:0`（移动端 172px）零占位浮层，按钮 `position:absolute;right:0;bottom:12px` 悬浮于 sticky composer 上方，`pointer-events` 仅按钮可点；原 `margin-top:-44px` 文档流占位写法移除。
  - 点击行为保持：`follow.current=true` + `scrollIntoView({behavior:"smooth",block:"end"})`，到达底部后由 scroll 事件自动隐藏。
- 纯前端展示层修改，无数据、事务、供应商、计费影响；无迁移。

## 验证命令、结果及证据层级
- `node_modules/.bin/tsc --noEmit`：78 个错误与改动前基线完全一致（stash 对比 78=78），均为 junction node_modules 类型版本差异的既有环境噪音，无一位于本次改动文件。证据层级：本地类型检查。
- `node_modules/.bin/eslint src/components/home/creation-workbench.tsx`：0 error 0 warning（新增 effect 已补 `port.conversation` 依赖）。
- `node scripts/verify-creation-to-bottom.cjs`：**16/16 PASS**。真实 `creation-workbench.tsx` 经 esbuild 转译 + 最小 React shim 挂载，stub `document.scrollingElement` 派发 scroll 事件。覆盖：初始底部隐藏 / 中段显示 / away=81 显 / away=80 隐 / 点击恢复跟随并自动回底 / 到底隐藏 / 滚轮断跟随且按钮保持 / 新消息流式追加保持显示 / 短对话恒隐 / 切换会话重置+自动跳底 / 首页无按钮且 scroll 监听已移除。证据层级：组件级行为回归（DOM 交互模拟）。
- 变异验证：守卫改 `true&&`（复现原 bug）→ t1/t3/t9b/t4b/t6/t7c 共 6 项失败；阈值 80→0 → t3/t9b 失败；逐字还原后 16/16 恢复。证明断言非恒真、能捕获本缺陷。
- 未做浏览器端人工目测：sticky 偏移（176px/172px）为按 composer 高度估算值，见未完成项。

## 未完成项与下一步
- 实机目测按钮与 sticky composer 的间距（含设置面板展开、附件行出现使 composer 变高的场景）；如遮挡，仅需调 `.toBottom` 的 `bottom` 值。
- 触屏滚动无 wheel 事件，`follow` 断开依赖 scroll 事件本身即可正常工作，但如需「手指上滑即断跟随」可在后续任务补充 touchstart 处理（当前行为：触摸滚动后新消息仍会自动回底）。
