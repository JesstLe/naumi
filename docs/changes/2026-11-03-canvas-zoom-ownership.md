# 画布与浏览器滚轮缩放归属（2026-11-03）

## 问题与固定基线

- 用户截图显示画布 3.23%，工具栏及 Agent 较大；用户不记得触发操作。截图本身不足以确认浏览器原生缩放已发生。
- 基线 main：`b8eeddfa1a042a6ad4dddbb50c491c43093b59fe`。
- 当前原生缩放拦截只绑定 `canvasAreaRef` 的冒泡阶段，而 Agent、节点属性及项目菜单是兄弟 DOM；参数等浮层 portal 到 `document.body`。这些区域的 Ctrl/Meta+wheel 未取消默认行为。
- React Flow 内的原生滚轮监听本来已使用 `passive:false` 并取消默认行为。因此不是已证实的“同一事件双重缩放”，而是指针跨区域后切换了缩放对象。
- 键盘 Ctrl/Meta +/-/0 本来会按编辑焦点让出给浏览器。本轮保留已有键盘/浏览器菜单规则，不将它与滚轮缺口混为一谈。

## 实现与归属

仅修改 CanvasClient 的原有 wheel effect：登录就绪且处于画布项目时，注册 document capture + passive:false；只对 Ctrl/Meta wheel 调用 preventDefault，不停止传播、不重复计算缩放。

- 画布缩放仍由 React Flow / D3 唯一处理；普通滚轮继续平移。
- Agent、编辑器和 Portal 的普通滚轮继续原生滚动。
- 返回全部项目、卸载或账号状态变化时清理监听；其他页面不保留拦截。
- 不修改节点尺寸、最小缩放值、视口保存、数据库、生成或账务。

## 验证与证据分层

证据根：`E:/Workspace/naumi/output/canvas-zoom-ownership-20261103/`。

`scripts/verify-canvas-zoom-ui.cjs` 使用完整真实 Next / CanvasClient / React Flow，账号、媒体与业务 HTTP 为显式本地 fixture。普通 API 不触碰生产，生成与 Agent POST 设拒绝哨兵；供应商调用 0。

- 基线真实浏览器 11 检查复现：Agent/参数 Portal 的 trusted Ctrl-wheel defaultPrevented=false；主画布正常取消且缩放。预期 exit1，不是忽略失败。
- 修改态最终 14 项通过：Ctrl/Meta 画布缩放、Agent 标题及输入区、nowheel 编辑器、真实 body Portal、属性侧栏、项目菜单、普通滚动、退出到项目列表以及同文档重新进入。`tests/modified-r3/zoom/RESULT.json` 为最终结果。
- 主线相关真实 Next 回归：后台独立生成 10 项、像素与 Dock 布局 18 项通过，见 `tests/modified-final/` 的独立命令记录；该次总 RUN 保留 FAIL，因为当时新增 zoom 测试测到了节点选中后的既有 viewport 动画。
- 新测试修正了两处脚手架问题：先等待原视口动画稳定再量 wheel 影响；属性菜单按实际文字定位（原菜单项不是 button role）。不改产品迎合测试，原失败报告保留。
- desktop / unbounded 两套源码检查、Next typegen、tsc、diff check 均 exit0；产品只修改一个 effect。
- 键盘与 synthetic wheel 的取消状态单独标记，不将合成事件当作物理鼠标/系统浏览器菜单验收。
- 浏览器输入同时记录 viewport、DPR、innerWidth/Height、visualViewport.scale、工具栏几何；截图仅作界面证据。
- macOS Safari 的原生 gesturestart/change 未在本轮 Windows 环境实测；不声明全部平台原生手势已验收。
- 原 desktop smoke 将“已验证不漏出画布”的笼统文案改为源码接线检查，运行时结论以新浏览器脚本为准。

## 交付状态

新增 zoom 已纳入 runner 的默认 all，不再由 background/pixel 的 PASS 冒充缩放回归通过。更改后的原 runner 只覆盖两个测试脚本，产品字节始终读取显式 source-root；baseline 必须同时满足 REPRODUCED 报告及预期 exit1。

四制品、完整副本回滚与最终 Git 状态登记于证据根 `proof/` 及 `FINAL.json`。无部署、SSH、配置变更或收费生成；Windows Chromium 证据不扩写为物理设备/Safari 原生手势全验收。
