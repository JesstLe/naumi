# 对话回到底部：可见性与跟随滚动

日期：2026-11-11。分支：`codex/conversation-scroll-20261111`。

## 模块与职责

`CreationWorkbench` 负责布局；新 `useConversationScroll` 只拥有滚动容器识别、离底距离、跟随状态和返回动作，不拥有消息、任务、账号或供应商状态。依赖方向为页面 → 滚动 hook → DOM；没有另一份会话数据。

## 旧行为与调研

用户反馈按钮只在底部可见，上翻后消失。原按钮实际上一直渲染在消息尾部的普通文档流，随内容滚出视口，并没有按滚动距离控制可见性。旧 wheel handler 还会不分方向地关闭跟随。

基线 `3a3a6fb88e8de8b1c2ff649a9b12de77ffe7c696`：真实 `CreationWorkbench` / CSS + Chromium 精确复现 `buttonAtBottom=1 buttonOffscreenWhenScrolledUp=1`。消息内容、输入框内容和鉴权是 fixture 端口，滚动及页面布局是真实组件；没有访问用户线上页面。

## 实现与公开接口

- `useConversationScroll(sessionId, conversation, messages)` 返回 stream/composer refs、showReturn 和 returnToBottom。
- 按钮移入 sticky 输入区的绝对定位层，位于输入框上方，离底超过 80px 时显示，回到底部附近隐藏；短对话和首页不显示。
- 识别最近的 overflow auto/scroll 容器，普通页面使用 document.scrollingElement；桌面内层滚动时不滚动外层页面。
- 在底部时跟随新消息及延迟图片高度；用户上翻时停止跟随，历史阅读不被新消息打断；点击按钮恢复跟随。
- ResizeObserver、scroll、scrollend、窗口 resize 共同更新；requestAnimationFrame 合并测量。将内容变高触发的滚动与真正上翻区分，避免图片完成加载后错误停止跟随。
- 滚轮、触摸上翻、PageUp/Home/ArrowUp 可中断跟随；输入框内部滚动和侧栏滚动不误当对话上翻。平滑返回期间保留返回状态，尊重 prefers-reduced-motion。
- 切换会话重置状态；卸载清理 observer、listeners 和 animation frame。

## 集中验证及证据层级

证据目录：本工作树 `output/conversation-scroll/`。

| 命令 | 结果 |
| --- | --- |
| `node scripts/verify-conversation-scroll.mjs --baseline` | `BASELINE_REPRODUCED buttonAtBottom=1 buttonOffscreenWhenScrolledUp=1 checks=2` |
| `node scripts/verify-conversation-scroll.mjs` | `CONVERSATION_SCROLL_PASS checks=22 historyButtonVisible=1 bottomButtonHidden=1 readerNotInterrupted=1 supplierCalls=0` |
| `node scripts/verify-conversation-sidebar-ui.mjs` | 28 项实际 React/Chromium 侧栏/Markdown/LaTeX/输入交互回归通过 |
| `node scripts/verify-conversation-image-focus.mjs` | 20 项实际图片缓存/焦点/异常恢复回归通过 |
| `npx tsc --noEmit --incremental false` | 全项目非增量类型检查，exit 0 |
| `node scripts/verify-conversation-scroll.mjs --rollback` | `ROLLBACK_RESTORED buttonAtBottom=1 buttonOffscreenWhenScrolledUp=1 checks=2` |

修改版共 70 项浏览器检查通过；定向测试含底部隐藏、上翻可见、按钮在输入框上方、历史阅读不被新消息拉回、点击返回并继续跟随、延迟结果增高、侧栏不误关跟随、输入框变高、会话切换、短对话、390px 手机、内层滚动容器、键盘翻页/End、平滑滚动及首页退出。pageErrors=0，供应商调用0。

fixture 起步缺少 JSX 模块 resolveDir，以及输入框高度断言未按 border-box，已修测试设置。进一步加入延迟高度与会话切换场景后发现滚动/ResizeObserver 先后顺序问题，已修 hook 并集中复验，不以超时替代通过。

截图 `history-visible.png` 与 `mobile-history.png` 已打开检查；消息/输入框内容为测试端口，不是线上完整验收。

## 四产物与回滚

`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh` 位于证据目录；原始字节和逐文件 SHA256 分别在 `baseline-files.zip` / `hashes.json`。回滚仅接受另一个带 marker 的副本，先校验修改后 hash 再恢复原文件、删除新增文件。副本旧行为已复验，正式源码保留新行为。

## 主线与未完成

本轮从上一轮图片修复提交开独立内容分支，已 fetch 核对当时最新 origin/main 为 `36ee7dcc511cb22440656694ff33d5f559931931`，已在父依赖中整合。当前分支依赖上一轮富文本/图片稳定性实现，不将它们反向删除。待父线程接入 main 和线上验收；本轮不合 main、不部署、不连接 47/103，不改数据库或任务执行。
