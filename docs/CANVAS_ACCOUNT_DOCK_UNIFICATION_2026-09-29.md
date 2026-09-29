# 无限画布账户 Dock 统一（2026-09-29）

## 问题

站内普通页面点击右上角账户头像会打开紧凑账户 Dock；无限画布复用了账户页组件，点击同一位置却打开接近全屏的账户弹窗，交互层级、尺寸和操作路径不一致。

## 实现

- 抽出共享 `AccountDockMenu`，普通页面与无限画布使用同一份菜单结构、视觉 token 和操作入口。
- 无限画布项目列表页和项目编辑页的头像都改为在按钮下方打开紧凑 Dock，不再从账户入口调用整页账户弹窗。
- 账户 Dock 显式跟随站点主题，不再被无限画布自己的深浅背景作用域改色；默认浅色下三处均为白底、同一前景色。
- Dock 统一提供积分、主题、兑换码、账户安全、图片接口、管理员入口和退出登录。
- 点击外部、按 `Escape`、返回项目列表或导航后会关闭 Dock。
- Dock 打开时暂停画布快捷键，避免操作账户菜单时误删底层节点。
- 主题切换通过 `naumi:theme-change` 事件同步，避免从画布返回普通页面后主题图标状态滞后。

## 验证

- `node scripts/canvas-account-dock-smoke.mjs`
- `CANVAS_BASE_URL=http://127.0.0.1:3100 node scripts/canvas-account-dock-ui-smoke.mjs`
- `npm exec tsc -- --noEmit`
- `npm run lint`
- `npm run build`
- 浏览器分别检查普通页面、无限画布项目列表页和项目编辑页：三处均渲染 `data-testid="account-dock"`，宽度均为 `230px`，菜单内容、背景色和前景色一致；点击外部与 `Escape` 可关闭，画布不再出现全屏账户弹窗。
