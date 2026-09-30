# 画布双端快捷键安全修复（2026-09-29）

## 问题

- Windows 端打开账户、帮助、确认框等画布上层界面后，`Delete`、`Backspace`、撤销/重做等全局画布快捷键仍会作用到底层节点。
- `Shift+T` 创建文字节点时没有排除其他修饰键，导致 Windows 浏览器的 `Ctrl+Shift+T` 也会创建节点。

## 实现

- `canvas-client.tsx` 增加统一的快捷键层级门禁：弹窗、遮罩、菜单、侧边编辑器和 portal 选择器打开时，全局画布快捷键直接退出。
- 输入框、文本域、下拉框、可编辑元素、输入法组合态以及已被上层组件处理的事件继续交还给原生交互。
- `Shift+T` 仅在没有 `Ctrl`、`Meta`、`Alt` 时触发，并使用 `KeyboardEvent.code === "KeyT"` 判断物理按键。
- 对内部自行管理打开状态的 portal 组件使用 `data-canvas-hotkeys-blocked="true"`，避免新增 portal 遗漏全局门禁。

## 验证

- `node scripts/canvas-desktop-input-smoke.mjs`
- `node scripts/canvas-keyboard-overlay-smoke.mjs`
- `npx tsc --noEmit`
- `npm run lint`
- `git diff --check`

浏览器回归使用 Windows Chrome UA 和隔离的本地 Next.js 实例，覆盖浏览器组合键、账户弹窗、portal 门禁以及弹窗关闭后快捷键恢复。
